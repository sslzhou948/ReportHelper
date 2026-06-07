import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Env } from '../config/env.js';
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

type FetchLike = (url: string) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<Record<string, unknown>>;
}>;

function wxLoginFailureMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || 'unknown error');
}

export async function resolveWxLoginSession(env: Env, code: string, fetcher: FetchLike = fetch) {
  if (env.NODE_ENV !== 'production') {
    return {
      wxOpenid: devOpenidFromCode(code),
      wxUnionid: undefined
    };
  }

  const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
  url.searchParams.set('appid', env.WECHAT_APP_ID);
  url.searchParams.set('secret', env.WECHAT_APP_SECRET);
  url.searchParams.set('js_code', code);
  url.searchParams.set('grant_type', 'authorization_code');

  const response = await fetcher(url.toString());
  const payload = await response.json();
  const errcode = payload.errcode;
  if (!response.ok || errcode) {
    const errmsg = typeof payload.errmsg === 'string' ? payload.errmsg : '';
    throw new Error(`WECHAT_CODE2SESSION_FAILED:${errcode || response.status}${errmsg ? `:${errmsg}` : ''}`);
  }
  if (!payload.openid || typeof payload.openid !== 'string') {
    throw new Error('WECHAT_CODE2SESSION_MISSING_OPENID');
  }

  return {
    wxOpenid: payload.openid,
    wxUnionid: typeof payload.unionid === 'string' ? payload.unionid : undefined
  };
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

    let wxSession: Awaited<ReturnType<typeof resolveWxLoginSession>>;
    try {
      wxSession = await resolveWxLoginSession(app.env, parsed.data.code);
    } catch (error) {
      request.log.warn({
        requestId,
        reason: wxLoginFailureMessage(error)
      }, 'WeChat login failed');
      return reply.status(401).send({
        error: {
          code: 'WX_LOGIN_FAILED',
          message: '微信登录失败，请重试'
        },
        requestId
      });
    }

    const { wxOpenid, wxUnionid } = wxSession;
    const existing = await app.prisma.user.findUnique({
      where: { wxOpenid }
    });
    const user = await app.prisma.user.upsert({
      where: { wxOpenid },
      update: { status: 'active', wxUnionid },
      create: {
        wxOpenid,
        wxUnionid,
        status: 'active'
      }
    });

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
