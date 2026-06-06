import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  WECHAT_APP_ID: z.string().min(1),
  WECHAT_APP_SECRET: z.string().min(1),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8787),
  BACKEND_PUBLIC_BASE_URL: z.string().url().default('http://127.0.0.1:8787'),
  UPLOAD_STORAGE_PROVIDER: z.enum(['local', 'object_storage']).default('local'),
  ALLOW_LOCAL_UPLOAD_STORAGE_IN_PRODUCTION: z.string().optional().default('').transform((value) => (
    ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
  )),
  LOCAL_OBJECT_STORAGE_DIR: z.string().min(1).default('../local-object-storage'),
  OCR_PROVIDER: z.enum(['fixture', 'gpt_vision', 'commercial_ocr']).default('fixture'),
  OCR_FALLBACK_PROVIDER: z.enum(['none', 'gpt_vision']).default('none'),
  OPENAI_API_KEY: z.string().optional().default(''),
  OPENAI_OCR_MODEL: z.string().min(1).default('gpt-4.1-mini'),
  OPENAI_API_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  OCR_FALLBACK_API_KEY: z.string().optional().default(''),
  OCR_FALLBACK_OCR_MODEL: z.string().min(1).default('gpt-4.1-mini'),
  OCR_FALLBACK_API_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  OCR_MAX_RETRIES: z.coerce.number().int().min(0).max(3).default(1),
  OCR_RETRY_BASE_MS: z.coerce.number().int().min(0).max(5000).default(250),
  OCR_GROUP_CONCURRENCY: z.coerce.number().int().min(1).max(4).default(2),
  OCR_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300000).default(240000),
  OCR_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(256).max(16000).default(6000)
}).superRefine((env, ctx) => {
  if (env.OCR_FALLBACK_PROVIDER !== 'none' && !env.OCR_FALLBACK_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['OCR_FALLBACK_API_KEY'],
      message: `OCR_FALLBACK_API_KEY is required when OCR_FALLBACK_PROVIDER is ${env.OCR_FALLBACK_PROVIDER}`
    });
  }

  if (env.NODE_ENV !== 'production') return;

  const placeholders = [
    ['JWT_SECRET', env.JWT_SECRET, 'replace-with-local-dev-secret'],
    ['WECHAT_APP_SECRET', env.WECHAT_APP_SECRET, 'put-secret-in-local-env-only']
  ] as const;

  for (const [field, value, placeholder] of placeholders) {
    if (value === placeholder) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message: `${field} must not use the local placeholder in production`
      });
    }
  }

  if (env.UPLOAD_STORAGE_PROVIDER === 'local' && !env.ALLOW_LOCAL_UPLOAD_STORAGE_IN_PRODUCTION) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['UPLOAD_STORAGE_PROVIDER'],
      message: 'UPLOAD_STORAGE_PROVIDER must not be local in production unless ALLOW_LOCAL_UPLOAD_STORAGE_IN_PRODUCTION=true'
    });
  }

  if (env.OCR_PROVIDER === 'fixture') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['OCR_PROVIDER'],
      message: 'OCR_PROVIDER must not be fixture in production'
    });
  }

  if (['gpt_vision', 'commercial_ocr'].includes(env.OCR_PROVIDER) && !env.OPENAI_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['OPENAI_API_KEY'],
      message: `OPENAI_API_KEY is required when OCR_PROVIDER is ${env.OCR_PROVIDER}`
    });
  }
});

export type Env = z.infer<typeof envSchema>;

export function parseDotEnv(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) continue;

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    const quoted = (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    );
    if (quoted) value = value.slice(1, -1);
    result[key] = value;
  }
  return result;
}

function readEnvFile(cwd: string): Record<string, string> {
  const file = path.join(cwd, '.env');
  if (!fs.existsSync(file)) return {};
  return parseDotEnv(fs.readFileSync(file, 'utf8'));
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const fileEnv = source === process.env ? readEnvFile(process.cwd()) : {};
  return envSchema.parse({
    ...fileEnv,
    ...source
  });
}
