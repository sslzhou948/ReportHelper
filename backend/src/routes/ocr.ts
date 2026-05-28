import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { getRealcaseOcrDrafts, type RealcaseDraft } from '../fixtures/realcase.js';
import { requireSession } from '../services/dev-user.js';
import { getRequestId } from '../utils/request-id.js';

const createOcrTaskSchema = z.object({
  profileId: z.string().uuid().optional(),
  fixtureCaseIds: z.array(z.string()).optional(),
  photos: z.array(z.object({
    photoId: z.string().uuid(),
    groupId: z.string().trim().min(1).max(128),
    sortOrder: z.number().int().positive()
  })).optional()
});

const listOcrTasksSchema = z.object({
  profileId: z.string().uuid().optional(),
  status: z.string().optional()
});

const updateDraftSchema = z.object({
  draft: z.object({
    basicInfo: z.unknown().optional(),
    metrics: z.unknown().optional(),
    findings: z.unknown().optional(),
    warnings: z.unknown().optional(),
    conflicts: z.unknown().optional(),
    status: z.string().optional()
  }).passthrough()
});

const resolveConflictSchema = z.object({
  selectedCandidateIndex: z.number().int().nonnegative().optional()
});

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function serializeDraft(draft: {
  id: string;
  sourcePhotoIds: Prisma.JsonValue;
  pageCount: number;
  basicInfo: Prisma.JsonValue;
  metrics: Prisma.JsonValue;
  findings: Prisma.JsonValue;
  conflicts: Prisma.JsonValue;
  warnings: Prisma.JsonValue;
  status: string;
  version: number;
}) {
  return {
    draftId: draft.id,
    sourcePhotoIds: draft.sourcePhotoIds,
    pageCount: draft.pageCount,
    basicInfo: draft.basicInfo,
    metrics: draft.metrics,
    findings: draft.findings,
    conflicts: draft.conflicts,
    warnings: draft.warnings,
    status: draft.status,
    version: draft.version
  };
}

function serializeTask(task: {
  id: string;
  profileId: string;
  status: string;
  photoCount: number;
  reportCount: number;
  drafts: ReturnType<typeof serializeDraft>[];
}) {
  return {
    id: task.id,
    profileId: task.profileId,
    status: task.status,
    photoCount: task.photoCount,
    reportCount: task.reportCount,
    progress: {
      processedReports: task.reportCount,
      totalReports: task.reportCount
    },
    drafts: task.drafts
  };
}

function draftCreateData(taskId: string, profileId: string, draft: RealcaseDraft) {
  return {
    ocrTaskId: taskId,
    profileId,
    sourcePhotoIds: toJson(draft.sourcePhotoIds || []),
    pageCount: draft.pageCount || 1,
    basicInfo: toJson(draft.basicInfo || {}),
    metrics: toJson(draft.metrics || []),
    findings: toJson(draft.findings || []),
    conflicts: toJson(draft.conflicts || []),
    warnings: toJson(draft.warnings || []),
    status: draft.status || 'needs_review'
  };
}

function countReportGroups(photos: { photoId: string; groupId: string }[]) {
  return new Set(photos.map((photo) => photo.groupId || photo.photoId)).size;
}

async function findTaskForUser(app: FastifyInstance, taskId: string, userId: string) {
  return app.prisma.ocrTask.findFirst({
    where: {
      id: taskId,
      profile: {
        userId,
        deletedAt: null
      }
    },
    include: {
      drafts: {
        orderBy: { createdAt: 'asc' }
      }
    }
  });
}

function toArray(value: Prisma.JsonValue): any[] {
  return Array.isArray(value) ? value : [];
}

function draftUpdateData(draft: z.infer<typeof updateDraftSchema>['draft']) {
  const data: Record<string, unknown> = {
    version: { increment: 1 }
  };
  if (draft.basicInfo !== undefined) data.basicInfo = toJson(draft.basicInfo);
  if (draft.metrics !== undefined) data.metrics = toJson(draft.metrics);
  if (draft.findings !== undefined) data.findings = toJson(draft.findings);
  if (draft.warnings !== undefined) data.warnings = toJson(draft.warnings);
  if (draft.conflicts !== undefined) data.conflicts = toJson(draft.conflicts);
  if (draft.status !== undefined) data.status = draft.status;
  return data;
}

export async function registerOcrRoutes(app: FastifyInstance) {
  app.post('/api/ocr/tasks', async (request, reply) => {
    const requestId = getRequestId(request);
    const parsed = createOcrTaskSchema.safeParse(request.body || {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'OCR 任务参数无效',
          details: parsed.error.flatten()
        },
        requestId
      });
    }

    const session = await requireSession(app, request, reply);
    if (!session) return;
    const { user, profile: defaultProfile } = session;
    const profileId = parsed.data.profileId || defaultProfile.id;
    const profile = await app.prisma.profile.findFirst({
      where: {
        id: profileId,
        userId: user.id,
        deletedAt: null
      }
    });

    if (!profile) {
      return reply.status(404).send({
        error: {
          code: 'NOT_FOUND',
          message: '档案不存在'
        },
        requestId
      });
    }

    const isFixtureTask = !!(parsed.data.fixtureCaseIds && parsed.data.fixtureCaseIds.length);
    if (isFixtureTask && app.env.NODE_ENV === 'production') {
      return reply.status(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'Fixture OCR is disabled in production'
        },
        requestId
      });
    }

    const photos = parsed.data.photos || [];
    if (!isFixtureTask && photos.length === 0) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'OCR task requires photos or fixtureCaseIds'
        },
        requestId
      });
    }

    if (!isFixtureTask) {
      const uniquePhotoIds = Array.from(new Set(photos.map((photo) => photo.photoId)));
      const signedPhotos = await app.prisma.reportPhoto.findMany({
        where: {
          id: { in: uniquePhotoIds },
          profileId: profile.id,
          userId: user.id,
          status: { in: ['uploaded'] }
        }
      });
      if (signedPhotos.length !== uniquePhotoIds.length) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Some photos are unavailable for OCR task creation'
          },
          requestId
        });
      }
    }

    const drafts = isFixtureTask ? getRealcaseOcrDrafts(parsed.data.fixtureCaseIds) : [];
    if (isFixtureTask && !drafts.length) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: '未找到可用的 fixture 报告'
        },
        requestId
      });
    }

    const task = await app.prisma.$transaction(async (tx) => {
      const createdTask = await tx.ocrTask.create({
        data: {
          profileId: profile.id,
          userId: user.id,
          status: isFixtureTask ? 'needs_confirmation' : 'queued',
          photoCount: isFixtureTask ? drafts.reduce((sum, draft) => sum + (draft.sourcePhotoIds || []).length, 0) : photos.length,
          reportCount: isFixtureTask ? drafts.length : countReportGroups(photos)
        }
      });

      if (isFixtureTask) {
        await tx.recognizedReportDraft.createMany({
          data: drafts.map((draft) => draftCreateData(createdTask.id, profile.id, draft))
        });
      } else {
        await tx.ocrTaskPhoto.createMany({
          data: photos.map((photo) => ({
            ocrTaskId: createdTask.id,
            photoId: photo.photoId,
            groupId: photo.groupId || photo.photoId,
            sortOrder: photo.sortOrder
          }))
        });
        await tx.reportPhoto.updateMany({
          where: { id: { in: photos.map((photo) => photo.photoId) } },
          data: { status: 'attached' }
        });
      }

      return tx.ocrTask.findUniqueOrThrow({
        where: { id: createdTask.id },
        include: {
          drafts: {
            orderBy: { createdAt: 'asc' }
          }
        }
      });
    });

    return {
      data: serializeTask({
        ...task,
        drafts: task.drafts.map(serializeDraft)
      }),
      requestId
    };
  });

  app.get<{ Querystring: { profileId?: string; status?: string } }>('/api/ocr/tasks', async (request, reply) => {
    const requestId = getRequestId(request);
    const parsed = listOcrTasksSchema.safeParse(request.query || {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'OCR task query is invalid',
          details: parsed.error.flatten()
        },
        requestId
      });
    }

    const session = await requireSession(app, request, reply);
    if (!session) return;
    const { user } = session;
    const statuses = (parsed.data.status || '')
      .split(',')
      .map((status) => status.trim())
      .filter(Boolean);
    const tasks = await app.prisma.ocrTask.findMany({
      where: {
        ...(parsed.data.profileId ? { profileId: parsed.data.profileId } : {}),
        ...(statuses.length ? { status: { in: statuses } } : {}),
        profile: {
          userId: user.id,
          deletedAt: null
        }
      },
      orderBy: { createdAt: 'desc' },
      include: {
        drafts: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    return {
      data: tasks.map((task) => serializeTask({
        ...task,
        drafts: task.drafts.map(serializeDraft)
      })),
      requestId
    };
  });

  app.get<{ Params: { taskId: string } }>('/api/ocr/tasks/:taskId', async (request, reply) => {
    const requestId = getRequestId(request);
    const session = await requireSession(app, request, reply);
    if (!session) return;
    const { user } = session;
    const task = await findTaskForUser(app, request.params.taskId, user.id);

    if (!task) {
      return reply.status(404).send({
        error: {
          code: 'NOT_FOUND',
          message: 'OCR 任务不存在'
        },
        requestId
      });
    }

    return {
      data: serializeTask({
        ...task,
        drafts: task.drafts.map(serializeDraft)
      }),
      requestId
    };
  });

  app.post<{ Params: { taskId: string } }>('/api/ocr/tasks/:taskId/cancel', async (request, reply) => {
    const requestId = getRequestId(request);
    const session = await requireSession(app, request, reply);
    if (!session) return;
    const { user } = session;
    const task = await findTaskForUser(app, request.params.taskId, user.id);

    if (!task) {
      return reply.status(404).send({
        error: {
          code: 'NOT_FOUND',
          message: 'OCR task not found'
        },
        requestId
      });
    }

    if (task.status === 'confirmed') {
      return reply.status(409).send({
        error: {
          code: 'CONFLICT',
          message: 'Confirmed OCR task cannot be cancelled'
        },
        requestId
      });
    }

    const updatedTask = await app.prisma.$transaction(async (tx) => {
      await tx.recognizedReportDraft.updateMany({
        where: { ocrTaskId: task.id },
        data: { status: 'cancelled' }
      });
      return tx.ocrTask.update({
        where: { id: task.id },
        data: { status: 'cancelled' },
        include: {
          drafts: {
            orderBy: { createdAt: 'asc' }
          }
        }
      });
    });

    return {
      data: serializeTask({
        ...updatedTask,
        drafts: updatedTask.drafts.map(serializeDraft)
      }),
      requestId
    };
  });

  app.patch<{ Params: { taskId: string; draftId: string } }>('/api/ocr/tasks/:taskId/drafts/:draftId', async (request, reply) => {
    const requestId = getRequestId(request);
    const parsed = updateDraftSchema.safeParse(request.body || {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'OCR 草稿参数无效',
          details: parsed.error.flatten()
        },
        requestId
      });
    }

    const session = await requireSession(app, request, reply);
    if (!session) return;
    const { user } = session;
    const task = await findTaskForUser(app, request.params.taskId, user.id);
    const existingDraft = task?.drafts.find((draft) => draft.id === request.params.draftId);
    if (!task || !existingDraft) {
      return reply.status(404).send({
        error: {
          code: 'NOT_FOUND',
          message: 'OCR 草稿不存在'
        },
        requestId
      });
    }

    const updated = await app.prisma.recognizedReportDraft.update({
      where: { id: existingDraft.id },
      data: draftUpdateData(parsed.data.draft) as any
    });

    return {
      data: serializeDraft(updated),
      requestId
    };
  });

  app.patch<{ Params: { taskId: string; draftId: string; metricKey: string } }>('/api/ocr/tasks/:taskId/drafts/:draftId/conflicts/:metricKey', async (request, reply) => {
    const requestId = getRequestId(request);
    const parsed = resolveConflictSchema.safeParse(request.body || {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'OCR 冲突参数无效',
          details: parsed.error.flatten()
        },
        requestId
      });
    }

    const session = await requireSession(app, request, reply);
    if (!session) return;
    const { user } = session;
    const task = await findTaskForUser(app, request.params.taskId, user.id);
    const existingDraft = task?.drafts.find((draft) => draft.id === request.params.draftId);
    if (!task || !existingDraft) {
      return reply.status(404).send({
        error: {
          code: 'NOT_FOUND',
          message: 'OCR 草稿不存在'
        },
        requestId
      });
    }

    const nextConflicts = toArray(existingDraft.conflicts).filter((conflict) => conflict.metricKey !== request.params.metricKey);
    const updatedDraft = await app.prisma.recognizedReportDraft.update({
      where: { id: existingDraft.id },
      data: {
        conflicts: toJson(nextConflicts),
        status: nextConflicts.length ? existingDraft.status : 'needs_review',
        version: { increment: 1 }
      } as any
    });

    const hasRemainingConflicts = task.drafts.some((draft) => {
      if (draft.id === existingDraft.id) return nextConflicts.length > 0;
      return toArray(draft.conflicts).length > 0;
    });
    await app.prisma.ocrTask.update({
      where: { id: task.id },
      data: { status: hasRemainingConflicts ? 'needs_confirmation' : 'ready_to_save' }
    });

    return {
      data: {
        taskId: task.id,
        draftId: updatedDraft.id,
        metricKey: request.params.metricKey,
        selectedCandidateIndex: parsed.data.selectedCandidateIndex || 0,
        status: 'resolved'
      },
      requestId
    };
  });
}
