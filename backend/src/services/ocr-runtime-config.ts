import crypto from 'node:crypto';
import type { Env } from '../config/env.js';

type Row = Record<string, any>;

export type OcrRuntimeConfigSource = 'database' | 'env';

export type OcrRuntimeConfigResult = {
  env: Env;
  source: OcrRuntimeConfigSource;
  activeConfig?: Row | null;
};

export type OcrEndpointTestResult = {
  ok: boolean;
  message: string;
  checkedAt: Date;
  latencyMs: number;
};

const OCR_RUNTIME_CACHE_MS = 30_000;
const SECRET_PREFIX = 'enc:v1:';
const SECRET_SALT = 'healthhelper-ocr-config-v1';

const runtimeCache = new WeakMap<object, {
  expiresAt: number;
  value: OcrRuntimeConfigResult;
}>();

function nowMs() {
  return Date.now();
}

function configDelegate(prisma: unknown) {
  const delegate = (prisma as any)?.ocrProviderConfig;
  if (!delegate || typeof delegate.findFirst !== 'function') return null;
  return delegate;
}

export function normalizeOcrBaseUrl(value: string) {
  let next = String(value || '').trim();
  if (!next) return '';
  if (!/^https?:\/\//i.test(next)) next = `https://${next}`;
  next = next.replace(/\/+$/, '');
  const parsed = new URL(next);
  if (!/^https?:$/i.test(parsed.protocol)) throw new Error('unsupported protocol');
  if (!/\/v\d+$/i.test(parsed.pathname.replace(/\/+$/, ''))) next = `${next}/v1`;
  return next;
}

export function isSupportedOcrBaseUrl(value: string) {
  try {
    const normalized = normalizeOcrBaseUrl(value);
    const parsed = new URL(normalized);
    return !!parsed.hostname && ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

export function secretLast4(value: string) {
  const secret = String(value || '').trim();
  return secret ? secret.slice(-4) : '';
}

function encryptionKey(env: Env) {
  return crypto.scryptSync(env.JWT_SECRET, SECRET_SALT, 32);
}

export function encryptOcrSecret(value: string, env: Env) {
  const secret = String(value || '').trim();
  if (!secret) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(env), iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${SECRET_PREFIX}${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
}

export function decryptOcrSecret(value: string | null | undefined, env: Env) {
  const stored = String(value || '').trim();
  if (!stored) return '';
  if (!stored.startsWith(SECRET_PREFIX)) return stored;
  const parts = stored.slice(SECRET_PREFIX.length).split(':');
  if (parts.length !== 3) throw new Error('invalid encrypted OCR secret');
  const [ivText, tagText, encryptedText] = parts;
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(env), Buffer.from(ivText, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, 'base64url')),
    decipher.final()
  ]).toString('utf8');
}

export function clearOcrRuntimeConfigCache(prisma: unknown) {
  if (prisma && typeof prisma === 'object') runtimeCache.delete(prisma);
}

async function findActiveOcrConfig(prisma: unknown) {
  const delegate = configDelegate(prisma);
  if (!delegate) return null;
  return delegate.findFirst({
    where: {
      isActive: true,
      status: 'active'
    },
    orderBy: { updatedAt: 'desc' }
  });
}

function envFromDatabaseConfig(env: Env, config: Row) {
  const provider: Env['OCR_PROVIDER'] = config.provider === 'commercial_ocr' ? 'commercial_ocr' : 'gpt_vision';
  const baseUrl = normalizeOcrBaseUrl(config.baseUrl);
  const model = String(config.model || '').trim();
  if (!baseUrl || !model) return null;
  const apiKey = config.apiKeyEncrypted
    ? decryptOcrSecret(config.apiKeyEncrypted, env)
    : env.OPENAI_API_KEY;
  return {
    ...env,
    OCR_PROVIDER: provider,
    OPENAI_API_BASE_URL: baseUrl,
    OPENAI_OCR_MODEL: model,
    OPENAI_API_KEY: apiKey || env.OPENAI_API_KEY || ''
  };
}

export async function resolveOcrRuntimeConfig(
  prisma: unknown,
  env: Env,
  options: { useCache?: boolean } = {}
): Promise<OcrRuntimeConfigResult> {
  const useCache = options.useCache !== false;
  const cacheKey = prisma && typeof prisma === 'object' ? prisma : null;
  if (useCache && cacheKey) {
    const cached = runtimeCache.get(cacheKey);
    if (cached && cached.expiresAt > nowMs()) return cached.value;
  }

  let value: OcrRuntimeConfigResult = {
    env,
    source: 'env',
    activeConfig: null
  };

  try {
    const activeConfig = await findActiveOcrConfig(prisma);
    if (activeConfig) {
      const runtimeEnv = envFromDatabaseConfig(env, activeConfig);
      if (runtimeEnv) {
        value = {
          env: runtimeEnv,
          source: 'database',
          activeConfig
        };
      }
    }
  } catch {
    value = {
      env,
      source: 'env',
      activeConfig: null
    };
  }

  if (useCache && cacheKey) {
    runtimeCache.set(cacheKey, {
      expiresAt: nowMs() + OCR_RUNTIME_CACHE_MS,
      value
    });
  }
  return value;
}

function extractResponseText(payload: any) {
  if (!payload || typeof payload !== 'object') return '';
  if (typeof payload.output_text === 'string') return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const contentItem of content) {
      if (typeof contentItem?.text === 'string') return contentItem.text;
    }
  }
  const choice = Array.isArray(payload.choices) ? payload.choices[0] : null;
  if (typeof choice?.message?.content === 'string') return choice.message.content;
  return typeof payload.id === 'string' ? payload.id : '';
}

export async function testOpenAiCompatibleEndpoint(input: {
  baseUrl: string;
  model: string;
  apiKey: string;
  timeoutMs?: number;
}): Promise<OcrEndpointTestResult> {
  const checkedAt = new Date();
  const startedAt = nowMs();
  const baseUrl = normalizeOcrBaseUrl(input.baseUrl);
  const model = String(input.model || '').trim();
  const apiKey = String(input.apiKey || '').trim();
  if (!model) {
    return { ok: false, message: '请填写模型名称', checkedAt, latencyMs: 0 };
  }
  if (!apiKey) {
    return { ok: false, message: 'API Key 未配置，无法测试连接', checkedAt, latencyMs: 0 };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs || 15_000);
  try {
    const response = await fetch(`${baseUrl}/responses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        input: 'Return the word ok.',
        max_output_tokens: 16
      }),
      signal: controller.signal
    });
    const text = await response.text();
    let payload: any = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }
    if (!response.ok) {
      const message = payload?.error?.message || text.slice(0, 160) || response.statusText;
      return {
        ok: false,
        message: `连接失败：HTTP ${response.status} ${message}`.trim(),
        checkedAt,
        latencyMs: nowMs() - startedAt
      };
    }
    if (!extractResponseText(payload)) {
      return {
        ok: false,
        message: '连接成功，但响应格式无法识别',
        checkedAt,
        latencyMs: nowMs() - startedAt
      };
    }
    return {
      ok: true,
      message: '测试通过，端点响应格式可用于 AI 识别',
      checkedAt,
      latencyMs: nowMs() - startedAt
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error && error.name === 'AbortError'
        ? '连接超时，请检查端点地址或网络'
        : `连接失败：${error instanceof Error ? error.message : '未知错误'}`,
      checkedAt,
      latencyMs: nowMs() - startedAt
    };
  } finally {
    clearTimeout(timer);
  }
}
