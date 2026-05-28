import type { FastifyInstance } from 'fastify';
import { getRequestId } from '../utils/request-id.js';
import { ensureDevSession } from '../services/dev-user.js';

function avatarText(realName: string, relation: string): string {
  return realName ? realName.slice(-1) : relation.slice(0, 1);
}

function profileSummary(profile: { diseaseType: string | null; stage: string | null; primaryHospital: string | null }) {
  return [profile.diseaseType, profile.stage, profile.primaryHospital].filter(Boolean).join(' · ');
}

export async function registerProfileRoutes(app: FastifyInstance) {
  app.get('/api/profiles', async (request) => {
    const { user } = await ensureDevSession(app.prisma);
    const profiles = await app.prisma.profile.findMany({
      where: {
        userId: user.id,
        deletedAt: null
      },
      orderBy: { createdAt: 'asc' }
    });

    return {
      data: profiles.map((profile) => ({
        id: profile.id,
        relation: profile.relation,
        realName: profile.realName,
        summary: profileSummary(profile),
        avatarText: avatarText(profile.realName, profile.relation)
      })),
      requestId: getRequestId(request)
    };
  });

  app.get<{ Params: { profileId: string } }>('/api/profiles/:profileId', async (request, reply) => {
    const { user } = await ensureDevSession(app.prisma);
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
      data: {
        ...profile,
        summary: profileSummary(profile),
        avatarText: avatarText(profile.realName, profile.relation)
      },
      requestId: getRequestId(request)
    };
  });
}
