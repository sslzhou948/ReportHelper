import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { batchCreateReports, checkDuplicateReports, DuplicateReportRequiresDecisionError, getDraftsForTask } from '../services/report-service.js';
import { ensureDevSession } from '../services/dev-user.js';
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

export async function registerReportRoutes(app: FastifyInstance) {
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

    const { user } = await ensureDevSession(app.prisma);
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
      throw error;
    }
  });
}
