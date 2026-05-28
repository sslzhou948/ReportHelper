import { loadEnv } from './config/env.js';
import { createPrismaClient } from './plugins/prisma.js';
import { buildApp } from './app.js';

const env = loadEnv();
const prisma = createPrismaClient();
const app = buildApp({ env, prisma });

try {
  await app.listen({ port: env.PORT, host: '0.0.0.0' });
} catch (error) {
  app.log.error(error);
  await prisma.$disconnect();
  process.exit(1);
}

const shutdown = async () => {
  await app.close();
  await prisma.$disconnect();
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
