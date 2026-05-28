import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getRequestId } from '../utils/request-id.js';
import { requireSession } from '../services/dev-user.js';

type ProfileShape = {
  id: string;
  relation: string;
  realName: string;
  gender: string | null;
  birthDate: Date | null;
  diseaseType: string | null;
  diagnosedAt: Date | null;
  stage: string | null;
  treatmentPhase: string | null;
  primaryHospital: string | null;
  primaryDoctor: string | null;
  primaryDepartment: string | null;
};

const profilePayloadSchema = z.object({
  relation: z.string().trim().min(1).max(32),
  realName: z.string().trim().min(1).max(64),
  gender: z.string().trim().max(16).optional().nullable(),
  birthDate: z.string().trim().optional().nullable(),
  diseaseType: z.string().trim().max(128).optional().nullable(),
  diagnosedAt: z.string().trim().optional().nullable(),
  stage: z.string().trim().max(64).optional().nullable(),
  treatmentPhase: z.string().trim().max(64).optional().nullable(),
  primaryHospital: z.string().trim().max(128).optional().nullable(),
  primaryDoctor: z.string().trim().max(64).optional().nullable(),
  primaryDepartment: z.string().trim().max(64).optional().nullable()
});

const profilePatchSchema = profilePayloadSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: '至少提供一个需要更新的字段'
});

function avatarText(realName: string, relation: string): string {
  return realName ? realName.slice(-1) : relation.slice(0, 1);
}

function profileSummary(profile: { diseaseType: string | null; stage: string | null; primaryHospital: string | null }) {
  return [profile.diseaseType, profile.stage, profile.primaryHospital].filter(Boolean).join(' · ');
}

function toDateOnly(value: Date | string | null) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function parseOptionalDate(value: string | null | undefined) {
  if (!value) return null;
  return new Date(value);
}

function profileData(payload: z.infer<typeof profilePayloadSchema> | z.infer<typeof profilePatchSchema>) {
  const data: Record<string, unknown> = {};
  for (const key of ['relation', 'realName', 'gender', 'diseaseType', 'stage', 'treatmentPhase', 'primaryHospital', 'primaryDoctor', 'primaryDepartment'] as const) {
    if (payload[key] !== undefined) data[key] = payload[key] || null;
  }
  if (payload.birthDate !== undefined) data.birthDate = parseOptionalDate(payload.birthDate);
  if (payload.diagnosedAt !== undefined) data.diagnosedAt = parseOptionalDate(payload.diagnosedAt);
  return data;
}

function serializeProfile(profile: ProfileShape) {
  return {
    ...profile,
    birthDate: toDateOnly(profile.birthDate),
    diagnosedAt: toDateOnly(profile.diagnosedAt),
    summary: profileSummary(profile),
    avatarText: avatarText(profile.realName, profile.relation)
  };
}

function serializeProfileListItem(profile: ProfileShape) {
  return {
    id: profile.id,
    relation: profile.relation,
    realName: profile.realName,
    summary: profileSummary(profile),
    avatarText: avatarText(profile.realName, profile.relation)
  };
}

export async function registerProfileRoutes(app: FastifyInstance) {
  app.get('/api/profiles', async (request, reply) => {
    const session = await requireSession(app, request, reply);
    if (!session) return;
    const { user } = session;
    const profiles = await app.prisma.profile.findMany({
      where: {
        userId: user.id,
        deletedAt: null
      },
      orderBy: { createdAt: 'asc' }
    });

    return {
      data: profiles.map((profile) => serializeProfileListItem(profile)),
      requestId: getRequestId(request)
    };
  });

  app.post('/api/profiles', async (request, reply) => {
    const requestId = getRequestId(request);
    const parsed = profilePayloadSchema.safeParse(request.body || {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: '档案参数无效',
          details: parsed.error.flatten()
        },
        requestId
      });
    }

    const session = await requireSession(app, request, reply);
    if (!session) return;
    const { user } = session;
    const profile = await app.prisma.profile.create({
      data: {
        ...profileData(parsed.data),
        userId: user.id
      } as any
    });

    return {
      data: serializeProfile(profile),
      requestId
    };
  });

  app.get<{ Params: { profileId: string } }>('/api/profiles/:profileId', async (request, reply) => {
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
        error: {
          code: 'NOT_FOUND',
          message: '档案不存在'
        },
        requestId: getRequestId(request)
      });
    }

    return {
      data: serializeProfile(profile),
      requestId: getRequestId(request)
    };
  });

  app.patch<{ Params: { profileId: string } }>('/api/profiles/:profileId', async (request, reply) => {
    const requestId = getRequestId(request);
    const parsed = profilePatchSchema.safeParse(request.body || {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: '档案参数无效',
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
        error: {
          code: 'NOT_FOUND',
          message: '档案不存在'
        },
        requestId
      });
    }

    const updated = await app.prisma.profile.update({
      where: { id: profile.id },
      data: profileData(parsed.data) as any
    });

    return {
      data: serializeProfile(updated),
      requestId
    };
  });

  app.delete<{ Params: { profileId: string } }>('/api/profiles/:profileId', async (request, reply) => {
    const requestId = getRequestId(request);
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
        error: {
          code: 'NOT_FOUND',
          message: '档案不存在'
        },
        requestId
      });
    }

    await app.prisma.profile.update({
      where: { id: profile.id },
      data: { deletedAt: new Date() }
    });

    return {
      data: { ok: true },
      requestId
    };
  });
}
