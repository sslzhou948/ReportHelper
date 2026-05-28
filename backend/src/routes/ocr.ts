import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { getRealcaseOcrDrafts, type RealcaseDraft } from '../fixtures/realcase.js';
import { ensureDevSession } from '../services/dev-user.js';
import { getRequestId } from '../utils/request-id.js';

const createOcrTaskSchema = z.object({
  profileId: z.string().uuid().optional(),
  fixtureCaseIds: z.array(z.string()).optional()
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

    const { user, profile: defaultProfile } = await ensureDevSession(app.prisma);
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

    const drafts = getRealcaseOcrDrafts(parsed.data.fixtureCaseIds);
    if (!drafts.length) {
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
          status: 'needs_confirmation',
          photoCount: drafts.reduce((sum, draft) => sum + (draft.sourcePhotoIds || []).length, 0),
          reportCount: drafts.length
        }
      });

      await tx.recognizedReportDraft.createMany({
        data: drafts.map((draft) => draftCreateData(createdTask.id, profile.id, draft))
      });

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

  app.get<{ Params: { taskId: string } }>('/api/ocr/tasks/:taskId', async (request, reply) => {
    const requestId = getRequestId(request);
    const { user } = await ensureDevSession(app.prisma);
    const task = await app.prisma.ocrTask.findFirst({
      where: {
        id: request.params.taskId,
        profile: {
          userId: user.id,
          deletedAt: null
        }
      },
      include: {
        drafts: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });

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
}
