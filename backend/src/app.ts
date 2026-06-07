import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import Fastify from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { Env } from './config/env.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerExportRoutes } from './routes/exports.js';
import { registerOcrRoutes } from './routes/ocr.js';
import { registerProfileRoutes } from './routes/profiles.js';
import { registerRecheckRoutes } from './routes/recheck.js';
import { registerReportRoutes } from './routes/reports.js';
import { registerUploadRoutes } from './routes/uploads.js';
import { getRequestId } from './utils/request-id.js';

type BuildAppOptions = {
  env: Env;
  prisma: PrismaClient;
};

const REQUEST_BODY_LIMIT_BYTES = 11 * 1024 * 1024;

function normalizeIncomingUrl(url?: string) {
  if (!url) return url || '/';
  return url.replace(/^\/{2,}(api(?:\/|$))/, '/$1');
}

async function getDatabaseHealth(prisma: PrismaClient) {
  const rawPrisma = prisma as unknown as {
    $queryRawUnsafe?: (query: string) => Promise<unknown>;
  };

  if (typeof rawPrisma.$queryRawUnsafe !== 'function') {
    return {
      status: 'unchecked',
      checked: false
    };
  }

  try {
    await rawPrisma.$queryRawUnsafe('SELECT 1');
    return {
      status: 'ok',
      checked: true
    };
  } catch {
    return {
      status: 'error',
      checked: true
    };
  }
}

export function buildApp({ env, prisma }: BuildAppOptions) {
  const app = Fastify({
    logger: env.NODE_ENV !== 'test',
    bodyLimit: REQUEST_BODY_LIMIT_BYTES,
    rewriteUrl: (request) => normalizeIncomingUrl(request.url)
  });

  app.decorate('prisma', prisma);
  app.decorate('env', env);

  app.register(cors, {
    origin: env.NODE_ENV === 'production' ? false : true
  });

  app.register(jwt, {
    secret: env.JWT_SECRET
  });

  app.setErrorHandler((error, request, reply) => {
    const requestId = getRequestId(request);
    const fastifyError = error as {
      code?: string;
      statusCode?: number;
    };
    const statusCode = (
      typeof fastifyError.statusCode === 'number' &&
      fastifyError.statusCode >= 400 &&
      fastifyError.statusCode < 600
    ) ? fastifyError.statusCode : 500;
    const clientError = statusCode < 500;
    const errorCode = clientError
      ? (fastifyError.code === 'FST_ERR_CTP_INVALID_JSON_BODY' ? 'INVALID_JSON_BODY' : 'BAD_REQUEST')
      : 'INTERNAL_ERROR';
    const message = clientError ? '请求参数无效' : '服务暂时不可用';
    const logPayload = { error, requestId };
    if (clientError) request.log.warn(logPayload, 'request rejected');
    else request.log.error(logPayload, 'request failed');
    reply.status(statusCode).send({
      error: {
        code: errorCode,
        message
      },
      requestId
    });
  });

  app.get('/api/health', async (request, reply) => {
    const database = await getDatabaseHealth(prisma);
    const ok = database.status !== 'error';
    if (!ok) reply.status(503);
    return {
      data: {
        ok,
        service: 'healthhelper-backend',
        database
      },
      requestId: getRequestId(request)
    };
  });

  app.register(registerAuthRoutes);
  app.register(registerProfileRoutes);
  app.register(registerUploadRoutes);
  app.register(registerOcrRoutes);
  app.register(registerReportRoutes);
  app.register(registerRecheckRoutes);
  app.register(registerExportRoutes);

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    env: Env;
  }
}
