import { buildApp } from '../app.js';
import type { Env } from '../config/env.js';
import { createMemoryPrisma } from './memory-prisma.js';

const port = Number(process.env.PORT || process.env.HEALTHHELPER_MEMORY_PORT || 18787);

const env: Env = {
  DATABASE_URL: 'postgresql://memory:memory@localhost:5432/memory',
  JWT_SECRET: 'memory-test-secret-1234567890',
  WECHAT_APP_ID: process.env.WECHAT_APP_ID || 'memory-app-id',
  WECHAT_APP_SECRET: process.env.WECHAT_APP_SECRET || 'memory-app-secret',
  ADMIN_CONFIG_PASSWORD: process.env.ADMIN_CONFIG_PASSWORD || '0512',
  NODE_ENV: 'test',
  PORT: port,
  BACKEND_PUBLIC_BASE_URL: process.env.BACKEND_PUBLIC_BASE_URL || `http://127.0.0.1:${port}`,
  UPLOAD_STORAGE_PROVIDER: process.env.UPLOAD_STORAGE_PROVIDER === 'object_storage' ? 'object_storage' : 'local',
  ALLOW_LOCAL_UPLOAD_STORAGE_IN_PRODUCTION: false,
  LOCAL_OBJECT_STORAGE_DIR: process.env.LOCAL_OBJECT_STORAGE_DIR || '../tmp/memory-object-storage',
  OCR_PROVIDER: process.env.OCR_PROVIDER === 'gpt_vision'
    ? process.env.OCR_PROVIDER
    : 'fixture',
  OCR_FALLBACK_PROVIDER: process.env.OCR_FALLBACK_PROVIDER === 'gpt_vision' ? 'gpt_vision' : 'none',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  OPENAI_OCR_MODEL: process.env.OPENAI_OCR_MODEL || 'gpt-4.1-mini',
  OPENAI_API_BASE_URL: process.env.OPENAI_API_BASE_URL || 'https://api.openai.com/v1',
  OCR_FALLBACK_API_KEY: process.env.OCR_FALLBACK_API_KEY || '',
  OCR_FALLBACK_OCR_MODEL: process.env.OCR_FALLBACK_OCR_MODEL || 'gpt-4.1-mini',
  OCR_FALLBACK_API_BASE_URL: process.env.OCR_FALLBACK_API_BASE_URL || 'https://api.openai.com/v1',
  OCR_MAX_RETRIES: Number(process.env.OCR_MAX_RETRIES || 1),
  OCR_RETRY_BASE_MS: Number(process.env.OCR_RETRY_BASE_MS || 250),
  OCR_GROUP_CONCURRENCY: Number(process.env.OCR_GROUP_CONCURRENCY || 2),
  OCR_REQUEST_TIMEOUT_MS: Number(process.env.OCR_REQUEST_TIMEOUT_MS || 240000),
  OCR_MAX_OUTPUT_TOKENS: Number(process.env.OCR_MAX_OUTPUT_TOKENS || 6000)
};

const prisma = createMemoryPrisma();
const app = buildApp({ env, prisma: prisma as any });

await app.listen({ port, host: '127.0.0.1' });
console.log(`HealthHelper memory backend listening on http://127.0.0.1:${port}`);

const shutdown = async () => {
  clearInterval(keepAliveTimer);
  await app.close();
};

const keepAliveTimer = setInterval(() => {
  // Keep the Windows helper alive even when no active socket is open.
}, 60_000);

if (process.env.HEALTHHELPER_DETACH !== '1') {
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
