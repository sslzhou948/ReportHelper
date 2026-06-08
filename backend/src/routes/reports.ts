import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  batchCreateReports,
  checkDuplicateReports,
  DuplicateReportRequiresDecisionError,
  getDraftsForTask,
  InvalidDuplicateDecisionError,
  UnresolvedDraftConflictsError,
  UnreviewedOcrDraftsError
} from '../services/report-service.js';
import {
  archiveManualEntryTemplate,
  deleteReportForUser,
  createManualReport,
  getMetricHistory,
  getReportDetail,
  listManualEntryTemplates,
  listMetricSnapshots,
  listPendingMetricCandidates,
  listReportsForProfile,
  saveManualEntryTemplate,
  setMetricPinned,
  updateReportDetail
} from '../services/report-query-service.js';
import { requireSession } from '../services/dev-user.js';
import { getRequestId } from '../utils/request-id.js';

const duplicateCheckSchema = z.object({
  profileId: z.string().uuid(),
  ocrTaskId: z.string().uuid()
});

const batchCreateSchema = z.object({
  profileId: z.string().uuid().optional(),
  ocrTaskId: z.string().uuid(),
  duplicateDecisions: z.array(z.object({
    draftId: z.string().uuid(),
    decision: z.enum(['replace', 'keep_both', 'skip']),
    existingReportId: z.string().uuid().optional()
  })).optional()
});

const listReportsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().optional(),
  since: z.string().optional(),
  until: z.string().optional()
});

const metricSnapshotQuerySchema = z.object({
  filter: z.enum(['all', 'abnormal', 'pinned']).optional(),
  category: z.string().optional(),
  since: z.string().optional(),
  until: z.string().optional()
});

const metricHistoryQuerySchema = z.object({
  since: z.string().optional(),
  until: z.string().optional()
});

const pendingMetricCandidateQuerySchema = z.object({
  since: z.string().optional(),
  until: z.string().optional()
});

function mergeDateRangeFromUrl<T extends { since?: string; until?: string }>(url: string, params: T): T {
  const queryIndex = url.indexOf('?');
  if (queryIndex < 0) return params;
  const searchParams = new URLSearchParams(url.slice(queryIndex + 1));
  return {
    ...params,
    since: params.since || searchParams.get('since') || undefined,
    until: params.until || searchParams.get('until') || undefined
  };
}

const pinMetricSchema = z.object({
  isPinned: z.boolean()
});

const updateReportSchema = z.object({
  basicInfo: z.record(z.string(), z.unknown()).optional(),
  metrics: z.array(z.record(z.string(), z.unknown())).optional(),
  findings: z.array(z.unknown()).optional(),
  warnings: z.array(z.unknown()).optional()
});

const manualReportSchema = z.object({
  reportDate: z.string().min(4).optional(),
  hospital: z.string().trim().min(1),
  note: z.string().optional(),
  metric: z.record(z.string(), z.unknown())
});

const manualTemplateSchema = z.object({
  metricKey: z.string().max(128).optional(),
  metricName: z.string().min(1).max(128),
  category: z.string().max(128).optional(),
  categoryCn: z.string().max(128).optional(),
  valueType: z.enum(['quantitative', 'qualitative', 'text']).optional(),
  unit: z.string().max(64).optional(),
  refRangeLow: z.union([z.string(), z.number(), z.null()]).optional(),
  refRangeHigh: z.union([z.string(), z.number(), z.null()]).optional(),
  refQualitative: z.string().max(64).optional(),
  refText: z.string().optional()
});

export async function registerReportRoutes(app: FastifyInstance) {
  app.get<{ Params: { profileId: string }; Querystring: { limit?: string } }>('/api/profiles/:profileId/reports', async (request, reply) => {
    const requestId = getRequestId(request);
    const parsed = listReportsQuerySchema.safeParse(request.query || {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: '报告列表参数无效',
          details: parsed.error.flatten()
        },
        requestId
      });
    }

    const session = await requireSession(app, request, reply);
    if (!session) return;
    const { user } = session;
    const reports = await listReportsForProfile(app.prisma, request.params.profileId, user.id, mergeDateRangeFromUrl(request.url, parsed.data));
    if (!reports) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: '档案不存在' },
        requestId
      });
    }

    return { data: reports, requestId };
  });

  app.get<{ Params: { reportId: string } }>('/api/reports/:reportId', async (request, reply) => {
    const requestId = getRequestId(request);
    const session = await requireSession(app, request, reply);
    if (!session) return;
    const { user } = session;
    const detail = await getReportDetail(app.prisma, request.params.reportId, user.id);
    if (!detail) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: '报告不存在' },
        requestId
      });
    }

    return { data: detail, requestId };
  });

  app.patch<{ Params: { reportId: string } }>('/api/reports/:reportId', async (request, reply) => {
    const requestId = getRequestId(request);
    const parsed = updateReportSchema.safeParse(request.body || {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: '报告编辑参数无效',
          details: parsed.error.flatten()
        },
        requestId
      });
    }

    const session = await requireSession(app, request, reply);
    if (!session) return;
    const { user } = session;
    const detail = await updateReportDetail(app.prisma, request.params.reportId, user.id, parsed.data);
    if (!detail) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: '报告不存在' },
        requestId
      });
    }

    return { data: detail, requestId };
  });

  app.delete<{ Params: { reportId: string } }>('/api/reports/:reportId', async (request, reply) => {
    const requestId = getRequestId(request);
    const session = await requireSession(app, request, reply);
    if (!session) return;
    const { user } = session;
    const result = await deleteReportForUser(app.prisma, request.params.reportId, user.id);
    if (!result) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: '报告不存在' },
        requestId
      });
    }

    return { data: result, requestId };
  });

  app.post<{ Params: { profileId: string } }>('/api/profiles/:profileId/manual-reports', async (request, reply) => {
    const requestId = getRequestId(request);
    const parsed = manualReportSchema.safeParse(request.body || {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: '手动记录参数无效',
          details: parsed.error.flatten()
        },
        requestId
      });
    }

    const session = await requireSession(app, request, reply);
    if (!session) return;
    const { user } = session;
    const detail = await createManualReport(app.prisma, request.params.profileId, user.id, parsed.data);
    if (!detail) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: '档案不存在' },
        requestId
      });
    }

    return { data: detail, requestId };
  });

  app.get<{ Params: { profileId: string } }>('/api/profiles/:profileId/manual-templates', async (request, reply) => {
    const requestId = getRequestId(request);
    const session = await requireSession(app, request, reply);
    if (!session) return;
    const { user } = session;
    const templates = await listManualEntryTemplates(app.prisma, request.params.profileId, user.id);
    if (!templates) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Profile not found' },
        requestId
      });
    }

    return { data: templates, requestId };
  });

  app.post<{ Params: { profileId: string } }>('/api/profiles/:profileId/manual-templates', async (request, reply) => {
    const requestId = getRequestId(request);
    const parsed = manualTemplateSchema.safeParse(request.body || {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Manual template payload is invalid',
          details: parsed.error.flatten()
        },
        requestId
      });
    }

    const session = await requireSession(app, request, reply);
    if (!session) return;
    const { user } = session;
    const template = await saveManualEntryTemplate(app.prisma, request.params.profileId, user.id, parsed.data);
    if (!template) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Profile not found' },
        requestId
      });
    }

    return { data: template, requestId };
  });

  app.delete<{ Params: { profileId: string; metricKey: string } }>('/api/profiles/:profileId/manual-templates/:metricKey', async (request, reply) => {
    const requestId = getRequestId(request);
    const session = await requireSession(app, request, reply);
    if (!session) return;
    const { user } = session;
    const result = await archiveManualEntryTemplate(app.prisma, request.params.profileId, user.id, decodeURIComponent(request.params.metricKey));
    if (!result) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Manual template not found' },
        requestId
      });
    }

    return { data: result, requestId };
  });

  app.get<{ Params: { profileId: string }; Querystring: { filter?: string; category?: string } }>('/api/profiles/:profileId/metrics/snapshots', async (request, reply) => {
    const requestId = getRequestId(request);
    const parsed = metricSnapshotQuerySchema.safeParse(request.query || {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: '指标快照参数无效',
          details: parsed.error.flatten()
        },
        requestId
      });
    }

    const session = await requireSession(app, request, reply);
    if (!session) return;
    const { user } = session;
    const snapshots = await listMetricSnapshots(app.prisma, request.params.profileId, user.id, mergeDateRangeFromUrl(request.url, parsed.data));
    if (!snapshots) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: '档案不存在' },
        requestId
      });
    }

    return { data: snapshots, requestId };
  });

  app.get<{ Params: { profileId: string }; Querystring: { since?: string; until?: string } }>('/api/profiles/:profileId/metrics/pending-candidates', async (request, reply) => {
    const requestId = getRequestId(request);
    const parsed = pendingMetricCandidateQuerySchema.safeParse(request.query || {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Pending metric candidate query is invalid',
          details: parsed.error.flatten()
        },
        requestId
      });
    }

    const session = await requireSession(app, request, reply);
    if (!session) return;
    const { user } = session;
    const candidates = await listPendingMetricCandidates(app.prisma, request.params.profileId, user.id, mergeDateRangeFromUrl(request.url, parsed.data));
    if (!candidates) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Profile not found' },
        requestId
      });
    }

    return { data: candidates, requestId };
  });

  app.get<{ Params: { profileId: string; metricKey: string }; Querystring: { since?: string; until?: string } }>('/api/profiles/:profileId/metrics/:metricKey/history', async (request, reply) => {
    const requestId = getRequestId(request);
    const parsed = metricHistoryQuerySchema.safeParse(request.query || {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: '指标历史参数无效',
          details: parsed.error.flatten()
        },
        requestId
      });
    }
    const session = await requireSession(app, request, reply);
    if (!session) return;
    const { user } = session;
    const history = await getMetricHistory(app.prisma, request.params.profileId, user.id, request.params.metricKey, mergeDateRangeFromUrl(request.url, parsed.data));
    if (!history) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: '档案不存在' },
        requestId
      });
    }

    return { data: history, requestId };
  });

  app.patch<{ Params: { profileId: string; metricKey: string } }>('/api/profiles/:profileId/metrics/:metricKey/pin', async (request, reply) => {
    const requestId = getRequestId(request);
    const parsed = pinMetricSchema.safeParse(request.body || {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: '关注参数无效',
          details: parsed.error.flatten()
        },
        requestId
      });
    }

    const session = await requireSession(app, request, reply);
    if (!session) return;
    const { user } = session;
    const snapshot = await setMetricPinned(app.prisma, request.params.profileId, user.id, request.params.metricKey, parsed.data.isPinned);
    if (!snapshot) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: '档案不存在' },
        requestId
      });
    }

    return { data: snapshot, requestId };
  });

  app.post('/api/reports/duplicate-check', async (request, reply) => {
    const requestId = getRequestId(request);
    const parsed = duplicateCheckSchema.safeParse(request.body || {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: '查重参数无效',
          details: parsed.error.flatten()
        },
        requestId
      });
    }

    const session = await requireSession(app, request, reply);
    if (!session) return;
    const { user } = session;
    const profile = await app.prisma.profile.findFirst({
      where: {
        id: parsed.data.profileId,
        userId: user.id,
        deletedAt: null
      }
    });

    if (!profile) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: '档案不存在' },
        requestId
      });
    }

    const drafts = await getDraftsForTask(app.prisma, profile.id, parsed.data.ocrTaskId);
    const candidates = await checkDuplicateReports(app.prisma, profile.id, drafts);

    return {
      data: {
        hasDuplicates: candidates.length > 0,
        candidates
      },
      requestId
    };
  });

  app.post('/api/reports/batch-create', async (request, reply) => {
    const requestId = getRequestId(request);
    const parsed = batchCreateSchema.safeParse(request.body || {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: '保存报告参数无效',
          details: parsed.error.flatten()
        },
        requestId
      });
    }

    const session = await requireSession(app, request, reply);
    if (!session) return;
    const { user, profile: defaultProfile } = session;
    let profileId = parsed.data.profileId || '';
    if (!profileId) {
      const task = await app.prisma.ocrTask.findFirst({
        where: {
          id: parsed.data.ocrTaskId,
          userId: user.id
        }
      });
      if (!task) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'AI识别任务不存在' },
          requestId
        });
      }
      profileId = task.profileId || defaultProfile?.id || '';
      if (!profileId) {
        return reply.status(400).send({
          error: { code: 'PROFILE_REQUIRED', message: 'Please create a profile before saving reports' },
          requestId
        });
      }
    }
    const profile = await app.prisma.profile.findFirst({
      where: {
        id: profileId,
        userId: user.id,
        deletedAt: null
      }
    });

    if (!profile) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: '档案不存在' },
        requestId
      });
    }

    try {
      const reports = await batchCreateReports(app.prisma, {
        profileId: profile.id,
        userId: user.id,
        ocrTaskId: parsed.data.ocrTaskId,
        duplicateDecisions: parsed.data.duplicateDecisions || []
      });

      return {
        data: { reports },
        requestId
      };
    } catch (error) {
      if (error instanceof DuplicateReportRequiresDecisionError) {
        return reply.status(error.statusCode).send({
          error: {
            code: error.code,
            message: error.message,
            details: {
              candidates: error.candidates
            }
          },
          requestId
        });
      }
      if (error instanceof UnresolvedDraftConflictsError) {
        return reply.status(error.statusCode).send({
          error: {
            code: error.code,
            message: error.message,
            details: {
              conflicts: error.conflicts
            }
          },
          requestId
        });
      }
      if (error instanceof UnreviewedOcrDraftsError) {
        return reply.status(error.statusCode).send({
          error: {
            code: error.code,
            message: error.message,
            details: {
              drafts: error.drafts
            }
          },
          requestId
        });
      }
      if (error instanceof InvalidDuplicateDecisionError) {
        return reply.status(error.statusCode).send({
          error: {
            code: error.code,
            message: error.message
          },
          requestId
        });
      }
      if (error instanceof Error && error.message === 'OCR_TASK_NOT_FOUND') {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'AI识别任务不存在' },
          requestId
        });
      }
      throw error;
    }
  });
}
