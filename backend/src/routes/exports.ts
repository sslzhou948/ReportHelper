import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireSession } from '../services/dev-user.js';
import { getRequestId } from '../utils/request-id.js';

const createExportSchema = z.object({
  includeReports: z.boolean().optional().default(true),
  includeMetrics: z.boolean().optional().default(true),
  includeRecheckPlans: z.boolean().optional().default(true),
  format: z.enum(['json', 'zip']).optional().default('json')
});

type ExportRecord = {
  id: string;
  profileId: string;
  userId: string;
  token: string;
  status: 'ready';
  format: 'json';
  fileName: string;
  createdAt: string;
  expiresAt: string;
  payload: unknown;
};

function toDateOnly(value: Date | string | null | undefined) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function toPlain(value: unknown) {
  return JSON.parse(JSON.stringify(value, (_key, innerValue) => {
    if (typeof innerValue === 'bigint') return innerValue.toString();
    return innerValue;
  }));
}

function downloadUrl(record: ExportRecord) {
  return `/api/exports/${record.id}/download?token=${record.token}`;
}

function serializeExport(record: ExportRecord) {
  return {
    exportId: record.id,
    status: record.status,
    format: record.format,
    fileName: record.fileName,
    downloadUrl: downloadUrl(record),
    expiresAt: record.expiresAt
  };
}

export async function registerExportRoutes(app: FastifyInstance) {
  const exports = new Map<string, ExportRecord>();

  app.post<{ Params: { profileId: string } }>('/api/profiles/:profileId/exports', async (request, reply) => {
    const requestId = getRequestId(request);
    const parsed = createExportSchema.safeParse(request.body || {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Export payload is invalid',
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
        id: request.params.profileId,
        userId: user.id,
        deletedAt: null
      }
    });

    if (!profile) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Profile not found' },
        requestId
      });
    }

    const reports = parsed.data.includeReports ? await app.prisma.report.findMany({
      where: {
        profileId: profile.id,
        deletedAt: null
      },
      include: parsed.data.includeMetrics ? {
        metrics: {
          orderBy: { createdAt: 'asc' }
        }
      } : undefined,
      orderBy: [
        { reportDate: 'desc' },
        { createdAt: 'desc' }
      ]
    }) : [];

    const recheckPlans = parsed.data.includeRecheckPlans ? await app.prisma.recheckPlan.findMany({
      where: {
        profileId: profile.id,
        deletedAt: null
      },
      include: {
        todos: {
          orderBy: { sortOrder: 'asc' }
        }
      },
      orderBy: { date: 'asc' }
    }) : [];

    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);
    const id = randomUUID();
    const record: ExportRecord = {
      id,
      profileId: profile.id,
      userId: user.id,
      token: randomUUID(),
      status: 'ready',
      format: 'json',
      fileName: `healthhelper-${profile.id}-${createdAt.toISOString().slice(0, 10)}.json`,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      payload: toPlain({
        exportedAt: createdAt.toISOString(),
        formatRequested: parsed.data.format,
        profile: {
          ...profile,
          birthDate: toDateOnly(profile.birthDate),
          diagnosedAt: toDateOnly(profile.diagnosedAt)
        },
        reports,
        recheckPlans
      })
    };
    exports.set(id, record);

    return {
      data: serializeExport(record),
      requestId
    };
  });

  app.get<{ Params: { exportId: string } }>('/api/exports/:exportId', async (request, reply) => {
    const requestId = getRequestId(request);
    const session = await requireSession(app, request, reply);
    if (!session) return;
    const record = exports.get(request.params.exportId);
    if (!record || record.userId !== session.user.id) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Export not found' },
        requestId
      });
    }

    return {
      data: serializeExport(record),
      requestId
    };
  });

  app.get<{ Params: { exportId: string }; Querystring: { token?: string } }>('/api/exports/:exportId/download', async (request, reply) => {
    const record = exports.get(request.params.exportId);
    if (!record || record.token !== request.query.token || new Date(record.expiresAt).getTime() < Date.now()) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Export not found' },
        requestId: getRequestId(request)
      });
    }

    return reply
      .header('Content-Type', 'application/json; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${record.fileName}"`)
      .send(JSON.stringify(record.payload, null, 2));
  });
}
