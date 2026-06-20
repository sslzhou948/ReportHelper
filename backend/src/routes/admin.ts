import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Env } from '../config/env.js';
import { requireSession } from '../services/dev-user.js';
import {
  clearOcrRuntimeConfigCache,
  decryptOcrSecret,
  encryptOcrSecret,
  normalizeOcrBaseUrl,
  resolveOcrRuntimeConfig,
  secretLast4,
  testOpenAiCompatibleEndpoint
} from '../services/ocr-runtime-config.js';
import { getRequestId } from '../utils/request-id.js';

type Row = Record<string, any>;

const baseUrlSchema = z.string().trim().min(1).max(512).superRefine((value, ctx) => {
  try {
    normalizeOcrBaseUrl(value);
  } catch {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: '端点地址格式无效'
    });
  }
}).transform((value) => normalizeOcrBaseUrl(value));

const ocrConfigPayloadSchema = z.object({
  provider: z.literal('gpt_vision').default('gpt_vision'),
  protocol: z.literal('openai_compatible').default('openai_compatible'),
  baseUrl: baseUrlSchema,
  model: z.string().trim().min(1).max(128),
  apiKey: z.string().trim().max(4096).optional().default('')
});

function configDelegate(prisma: unknown) {
  const delegate = (prisma as any)?.ocrProviderConfig;
  if (!delegate || typeof delegate.findFirst !== 'function') {
    throw new Error('OCR provider config storage is unavailable');
  }
  return delegate;
}

function auditDelegate(prisma: unknown) {
  const delegate = (prisma as any)?.ocrProviderConfigAudit;
  return delegate && typeof delegate.create === 'function' ? delegate : null;
}

function requestAdminPassword(request: FastifyRequest) {
  const header = request.headers['x-admin-password'];
  if (Array.isArray(header)) return String(header[0] || '');
  if (typeof header === 'string') return header;
  const bodyPassword = (request.body as Row | null | undefined)?.adminPassword;
  return typeof bodyPassword === 'string' ? bodyPassword : '';
}

function timingSafeTextEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

async function requireAdminConfigSession(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  requestId: string
) {
  const session = await requireSession(app, request, reply);
  if (!session) return null;

  const expected = String(app.env.ADMIN_CONFIG_PASSWORD || '');
  const actual = requestAdminPassword(request);
  if (!expected || !actual || !timingSafeTextEqual(actual, expected)) {
    reply.status(403).send({
      error: {
        code: 'ADMIN_PASSWORD_REQUIRED',
        message: '管理员密码无效'
      },
      requestId
    });
    return null;
  }

  return session;
}

function toIso(value: Date | string | null | undefined) {
  if (!value) return '';
  return value instanceof Date ? value.toISOString() : String(value);
}

function configSummary(config: Row | null | undefined) {
  if (!config) return null;
  return {
    id: config.id,
    provider: config.provider,
    protocol: config.protocol || 'openai_compatible',
    baseUrl: config.baseUrl,
    model: config.model,
    status: config.status,
    isActive: !!config.isActive,
    keyLast4: config.apiKeyLast4 || '',
    updatedAt: toIso(config.updatedAt),
    lastTestStatus: config.lastTestStatus || ''
  };
}

function serializeConfig(config: Row | null | undefined, env: Env, source: 'database' | 'env') {
  const envKeyLast4 = secretLast4(env.OPENAI_API_KEY);
  if (!config) {
    return {
      source,
      active: source === 'env',
      provider: env.OCR_PROVIDER === 'commercial_ocr' ? 'commercial_ocr' : 'gpt_vision',
      protocol: 'openai_compatible',
      baseUrl: env.OPENAI_API_BASE_URL,
      model: env.OPENAI_OCR_MODEL,
      keyStatus: envKeyLast4 ? `环境变量已配置，尾号 ${envKeyLast4}` : 'API Key 未配置',
      keyLast4: envKeyLast4,
      lastTestStatus: 'not_tested',
      lastTestMessage: '当前使用环境变量配置',
      lastTestAt: '',
      updatedAt: ''
    };
  }
  const keyLast4 = config.apiKeyLast4 || envKeyLast4;
  return {
    source,
    active: !!config.isActive,
    id: config.id,
    provider: config.provider,
    protocol: config.protocol || 'openai_compatible',
    baseUrl: config.baseUrl,
    model: config.model,
    keyStatus: keyLast4 ? `已配置，尾号 ${keyLast4}` : 'API Key 未配置',
    keyLast4,
    lastTestStatus: config.lastTestStatus || 'not_tested',
    lastTestMessage: config.lastTestMessage || '',
    lastTestAt: toIso(config.lastTestAt),
    updatedAt: toIso(config.updatedAt)
  };
}

async function listConfigHistory(prisma: unknown, env: Env) {
  const delegate = configDelegate(prisma);
  const rows = await delegate.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 6
  });
  return rows.map((row: Row) => serializeConfig(row, env, 'database'));
}

async function getExistingApiKey(prisma: unknown, env: Env) {
  const runtime = await resolveOcrRuntimeConfig(prisma, env, { useCache: false });
  const active = runtime.activeConfig;
  if (active?.apiKeyEncrypted) return decryptOcrSecret(active.apiKeyEncrypted, env);
  return env.OPENAI_API_KEY || '';
}

async function audit(tx: unknown, input: {
  configId?: string | null;
  actorUserId: string;
  action: string;
  beforeSummary?: Row | null;
  afterSummary?: Row | null;
}) {
  const delegate = auditDelegate(tx);
  if (!delegate) return;
  await delegate.create({
    data: {
      configId: input.configId || null,
      actorUserId: input.actorUserId,
      action: input.action,
      beforeSummary: input.beforeSummary || null,
      afterSummary: input.afterSummary || null
    }
  });
}

export async function registerAdminRoutes(app: FastifyInstance) {
  app.get('/api/admin/ocr-config', async (request, reply) => {
    const requestId = getRequestId(request);
    const session = await requireAdminConfigSession(app, request, reply, requestId);
    if (!session) return;

    const runtime = await resolveOcrRuntimeConfig(app.prisma, app.env, { useCache: false });
    return {
      data: {
        hiddenConfig: true,
        config: serializeConfig(runtime.activeConfig, app.env, runtime.source),
        history: await listConfigHistory(app.prisma, app.env)
      },
      requestId
    };
  });

  app.post('/api/admin/ocr-config/test', async (request, reply) => {
    const requestId = getRequestId(request);
    const session = await requireAdminConfigSession(app, request, reply, requestId);
    if (!session) return;

    const parsed = ocrConfigPayloadSchema.safeParse(request.body || {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'AI 识别配置参数无效',
          details: parsed.error.flatten()
        },
        requestId
      });
    }

    const apiKey = parsed.data.apiKey || await getExistingApiKey(app.prisma, app.env);
    const result = await testOpenAiCompatibleEndpoint({
      baseUrl: parsed.data.baseUrl,
      model: parsed.data.model,
      apiKey,
      timeoutMs: Math.min(app.env.OCR_REQUEST_TIMEOUT_MS, 15_000)
    });

    await audit(app.prisma, {
      actorUserId: session.user.id,
      action: result.ok ? 'test_ok' : 'test_failed',
      beforeSummary: null,
      afterSummary: {
        provider: parsed.data.provider,
        protocol: parsed.data.protocol,
        baseUrl: parsed.data.baseUrl,
        model: parsed.data.model,
        ok: result.ok,
        message: result.message
      }
    });

    return {
      data: {
        ...result,
        checkedAt: result.checkedAt.toISOString()
      },
      requestId
    };
  });

  app.post('/api/admin/ocr-config', async (request, reply) => {
    const requestId = getRequestId(request);
    const session = await requireAdminConfigSession(app, request, reply, requestId);
    if (!session) return;

    const parsed = ocrConfigPayloadSchema.safeParse(request.body || {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'AI 识别配置参数无效',
          details: parsed.error.flatten()
        },
        requestId
      });
    }

    const existingKey = await getExistingApiKey(app.prisma, app.env);
    const apiKey = parsed.data.apiKey || existingKey;
    const testResult = await testOpenAiCompatibleEndpoint({
      baseUrl: parsed.data.baseUrl,
      model: parsed.data.model,
      apiKey,
      timeoutMs: Math.min(app.env.OCR_REQUEST_TIMEOUT_MS, 15_000)
    });
    if (!testResult.ok) {
      return reply.status(400).send({
        error: {
          code: 'OCR_CONFIG_TEST_FAILED',
          message: testResult.message
        },
        requestId
      });
    }

    const created = await app.prisma.$transaction(async (tx) => {
      const txDelegate = configDelegate(tx);
      const active = await txDelegate.findFirst({
        where: {
          isActive: true,
          status: 'active'
        },
        orderBy: { updatedAt: 'desc' }
      });
      await txDelegate.updateMany({
        where: { isActive: true },
        data: {
          isActive: false,
          status: 'archived',
          archivedAt: new Date(),
          updatedBy: session.user.id
        }
      });
      const next = await txDelegate.create({
        data: {
          provider: parsed.data.provider,
          protocol: parsed.data.protocol,
          baseUrl: parsed.data.baseUrl,
          model: parsed.data.model,
          apiKeyEncrypted: parsed.data.apiKey
            ? encryptOcrSecret(parsed.data.apiKey, app.env)
            : (active?.apiKeyEncrypted || null),
          apiKeyLast4: parsed.data.apiKey
            ? secretLast4(parsed.data.apiKey)
            : (active?.apiKeyLast4 || secretLast4(apiKey)),
          status: 'active',
          isActive: true,
          lastTestAt: testResult.checkedAt,
          lastTestStatus: 'ok',
          lastTestMessage: testResult.message,
          createdBy: session.user.id,
          updatedBy: session.user.id
        }
      });
      await audit(tx, {
        configId: next.id,
        actorUserId: session.user.id,
        action: 'save',
        beforeSummary: configSummary(active),
        afterSummary: configSummary(next)
      });
      return next;
    });

    clearOcrRuntimeConfigCache(app.prisma);
    return {
      data: {
        config: serializeConfig(created, app.env, 'database'),
        history: await listConfigHistory(app.prisma, app.env)
      },
      requestId
    };
  });

  app.post('/api/admin/ocr-config/rollback', async (request, reply) => {
    const requestId = getRequestId(request);
    const session = await requireAdminConfigSession(app, request, reply, requestId);
    if (!session) return;

    const result = await app.prisma.$transaction(async (tx) => {
      const txDelegate = configDelegate(tx);
      const active = await txDelegate.findFirst({
        where: {
          isActive: true,
          status: 'active'
        },
        orderBy: { updatedAt: 'desc' }
      });
      const previousRows = await txDelegate.findMany({
        where: {
          isActive: false,
          status: 'archived'
        },
        orderBy: { updatedAt: 'desc' },
        take: 1
      });
      const previous = previousRows[0] || null;
      if (active) {
        await txDelegate.update({
          where: { id: active.id },
          data: {
            isActive: false,
            status: 'archived',
            archivedAt: new Date(),
            updatedBy: session.user.id
          }
        });
      }
      if (!previous) {
        await audit(tx, {
          configId: active?.id || null,
          actorUserId: session.user.id,
          action: 'rollback_to_env',
          beforeSummary: configSummary(active),
          afterSummary: null
        });
        return {
          restored: null,
          source: 'env' as const
        };
      }
      const restored = await txDelegate.update({
        where: { id: previous.id },
        data: {
          isActive: true,
          status: 'active',
          archivedAt: null,
          updatedBy: session.user.id
        }
      });
      await audit(tx, {
        configId: restored.id,
        actorUserId: session.user.id,
        action: 'rollback',
        beforeSummary: configSummary(active),
        afterSummary: configSummary(restored)
      });
      return {
        restored,
        source: 'database' as const
      };
    });

    clearOcrRuntimeConfigCache(app.prisma);
    return {
      data: {
        config: serializeConfig(result.restored, app.env, result.source),
        history: await listConfigHistory(app.prisma, app.env)
      },
      requestId
    };
  });
}
