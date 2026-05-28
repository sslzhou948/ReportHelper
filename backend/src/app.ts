import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import Fastify from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { Env } from './config/env.js';
import { registerAuthRoutes } from './routes/auth.js';
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

export function buildApp({ env, prisma }: BuildAppOptions) {
  const app = Fastify({
    logger: env.NODE_ENV !== 'test'
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
    request.log.error({ error, requestId }, 'request failed');
    reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: '服务暂时不可用'
      },
      requestId
    });
  });

  app.get('/api/health', async (request) => ({
    data: {
      ok: true,
      service: 'healthhelper-backend'
    },
    requestId: getRequestId(request)
  }));

  app.register(registerAuthRoutes);
  app.register(registerProfileRoutes);
  app.register(registerUploadRoutes);
  app.register(registerOcrRoutes);
  app.register(registerReportRoutes);
  app.register(registerRecheckRoutes);

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    env: Env;
  }
}
