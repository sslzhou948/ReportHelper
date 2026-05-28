import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getRequestId } from '../utils/request-id.js';

const wxLoginSchema = z.object({
  code: z.string().trim().min(1)
});

const refreshSchema = z.object({
  refreshToken: z.string().trim().min(1)
});

function devOpenidFromCode(code: string) {
  return `dev_wx_${code.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'anonymous'}`;
}

function defaultProfileData(userId: string) {
  return {
    userId,
    relation: '自己',
    realName: '新档案',
    gender: '',
    diseaseType: '',
    treatmentPhase: '',
    primaryHospital: ''
  };
}

async function ensureDefaultProfile(app: FastifyInstance, userId: string) {
  const existing = await app.prisma.profile.findFirst({
    where: {
      userId,
      deletedAt: null
    },
    orderBy: { createdAt: 'asc' }
  });
  if (existing) return existing;
  return app.prisma.profile.create({
    data: defaultProfileData(userId)
  });
}

function buildSession(app: FastifyInstance, userId: string, isNewUser: boolean) {
  const token = app.jwt.sign({ sub: userId, typ: 'access' }, { expiresIn: '2h' });
  const refreshToken = app.jwt.sign({ sub: userId, typ: 'refresh' }, { expiresIn: '30d' });
  return {
    token,
    refreshToken,
    userId,
    isNewUser
  };
}

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post('/api/auth/wx-login', async (request, reply) => {
    const requestId = getRequestId(request);
    const parsed = wxLoginSchema.safeParse(request.body || {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: '登录参数无效',
          details: parsed.error.flatten()
        },
        requestId
      });
    }

    const wxOpenid = devOpenidFromCode(parsed.data.code);
    const existing = await app.prisma.user.findUnique({
      where: { wxOpenid }
    });
    const user = await app.prisma.user.upsert({
      where: { wxOpenid },
      update: { status: 'active' },
      create: {
        wxOpenid,
        status: 'active'
      }
    });
    await ensureDefaultProfile(app, user.id);

    return {
      data: buildSession(app, user.id, !existing),
      requestId
    };
  });

  app.post('/api/auth/refresh', async (request, reply) => {
    const requestId = getRequestId(request);
    const parsed = refreshSchema.safeParse(request.body || {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: '刷新登录参数无效',
          details: parsed.error.flatten()
        },
        requestId
      });
    }

    try {
      const payload = app.jwt.verify<{ sub: string; typ?: string }>(parsed.data.refreshToken);
      if (payload.typ !== 'refresh') throw new Error('invalid token type');
      const user = await app.prisma.user.findUnique({
        where: { id: payload.sub }
      });
      if (!user || user.status !== 'active') throw new Error('user unavailable');
      await ensureDefaultProfile(app, user.id);
      return {
        data: buildSession(app, user.id, false),
        requestId
      };
    } catch (error) {
      return reply.status(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: '登录已过期，请重新登录'
        },
        requestId
      });
    }
  });

  app.post('/api/auth/logout', async (request) => ({
    data: { ok: true },
    requestId: getRequestId(request)
  }));
}
