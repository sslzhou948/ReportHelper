import { buildApp } from '../app.js';
import type { Env } from '../config/env.js';
import { createMemoryPrisma } from './memory-prisma.js';

const port = Number(process.env.PORT || process.env.HEALTHHELPER_MEMORY_PORT || 18787);

const env: Env = {
  DATABASE_URL: 'postgresql://memory:memory@localhost:5432/memory',
  JWT_SECRET: 'memory-test-secret-1234567890',
  WECHAT_APP_ID: 'memory-app-id',
  WECHAT_APP_SECRET: 'memory-app-secret',
  NODE_ENV: 'test',
  PORT: port
};

const prisma = createMemoryPrisma();
const app = buildApp({ env, prisma: prisma as any });

await app.listen({ port, host: '127.0.0.1' });
console.log(`HealthHelper memory backend listening on http://127.0.0.1:${port}`);

const shutdown = async () => {
  await app.close();
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
