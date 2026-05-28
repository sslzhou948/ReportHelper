import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  WECHAT_APP_ID: z.string().min(1),
  WECHAT_APP_SECRET: z.string().min(1),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8787)
}).superRefine((env, ctx) => {
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
