import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { loadEnv, parseDotEnv, type Env } from './config/env.js';
import { resolveWxLoginSession } from './routes/auth.js';
import { createOcrProvider, toOcrProviderFailure } from './services/ocr-provider.js';
import { draftFromRawOcr } from './services/raw-ocr-parser.js';
import { MemoryPrisma } from './testing/memory-prisma.js';

type Row = Record<string, any>;

type MockOpenAiResponse = Record<string, unknown> | {
  status: number;
  body: Record<string, unknown>;
};
type MaybePromise<T> = T | Promise<T>;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const FETCH_BLOCKED_PORTS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79,
  87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137,
  139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532, 540,
  548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723, 2049,
  3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6679,
  6697, 10080
]);

async function waitForOcrTask(app: Awaited<ReturnType<typeof buildApp>>, taskId: string, expectedStatus = 'needs_confirmation') {
  let task: any = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await app.inject({
      method: 'GET',
      url: `/api/ocr/tasks/${taskId}`
    });
    assert.equal(response.statusCode, 200);
    task = response.json().data;
    if (task.status === expectedStatus) return task;
    if (task.status === 'failed') {
      assert.equal(
        task.status,
        expectedStatus,
        `OCR task ${taskId} failed with ${task.errorCode || 'unknown_error'}: ${task.errorMessage || 'no error message'}`
      );
    }
    await delay(50);
  }
  assert.equal(
    task?.status,
    expectedStatus,
    `OCR task ${taskId} did not reach ${expectedStatus}; last status=${task?.status || 'unknown'}, error=${task?.errorCode || ''} ${task?.errorMessage || ''}`.trim()
  );
  return task;
}

async function startMockOpenAiServer(responseFactory: (requestInfo: Row) => MaybePromise<MockOpenAiResponse>) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const requests: any[] = [];
    const server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      request.on('end', async () => {
        const body = Buffer.concat(chunks).toString('utf8');
        const requestInfo = {
          url: request.url,
          method: request.method,
          body: body ? JSON.parse(body) : null
        };
        requests.push(requestInfo);
        try {
          const mockResponse = await responseFactory(requestInfo);
          const status = typeof mockResponse.status === 'number' ? mockResponse.status : 200;
          const responseBody = typeof mockResponse.status === 'number' ? mockResponse.body : mockResponse;
          response.writeHead(status, { 'content-type': 'application/json' });
          response.end(JSON.stringify(responseBody));
        } catch (error) {
          response.writeHead(500, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ error: { code: 'mock_error', message: error instanceof Error ? error.message : 'mock error' } }));
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('mock OpenAI server did not bind a port');
    if (FETCH_BLOCKED_PORTS.has(address.port)) {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      continue;
    }
    return {
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
      requests,
      close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    };
  }
  throw new Error('mock OpenAI server repeatedly bound fetch-blocked ports');
}

function multipartImagePayload(fieldName: string, fileName: string, contentType: string, bytes: Buffer) {
  const boundary = `----healthhelper-${Date.now()}`;
  const head = Buffer.from([
    `--${boundary}`,
    `Content-Disposition: form-data; name="${fieldName}"; filename="${fileName}"`,
    `Content-Type: ${contentType}`,
    '',
    ''
  ].join('\r\n'));
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    boundary,
    body: Buffer.concat([head, bytes, tail])
  };
}

function minimalJpeg(width: number, height: number) {
  return Buffer.from([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x10,
    0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01,
    0x00, 0x48, 0x00, 0x48, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11,
    0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03,
    0x01, 0x11, 0x00,
    0x02, 0x11, 0x00,
    0x03, 0x11, 0x00,
    0xff, 0xd9
  ]);
}

async function uploadTestPhoto(
  app: Awaited<ReturnType<typeof buildApp>>,
  profileId: string,
  options: { clientFileId: string; fileName: string; mimeType?: string; bytes?: Buffer }
) {
  const mimeType = options.mimeType || 'image/jpeg';
  const bytes = options.bytes || minimalJpeg(1800, 1800);
  const signResponse = await app.inject({
    method: 'POST',
    url: '/api/uploads/sign',
    payload: {
      profileId,
      files: [{
        clientFileId: options.clientFileId,
        fileName: options.fileName,
        mimeType,
        size: bytes.length
      }]
    }
  });
  assert.equal(signResponse.statusCode, 200);
  const upload = signResponse.json().data.uploads[0];
  const uploadUrl = new URL(upload.uploadUrl);
  const multipart = multipartImagePayload('file', options.fileName, mimeType, bytes);
  const uploadResponse = await app.inject({
    method: 'POST',
    url: uploadUrl.pathname,
    headers: {
      ...upload.headers,
      'content-type': `multipart/form-data; boundary=${multipart.boundary}`
    },
    payload: multipart.body
  });
  assert.equal(uploadResponse.statusCode, 200);
  const completeResponse = await app.inject({
    method: 'POST',
    url: '/api/uploads/complete',
    payload: {
      profileId,
      uploads: [{ photoId: upload.photoId }]
    }
  });
  assert.equal(completeResponse.statusCode, 200);
  return upload;
}

function mockBloodRoutineDraft(sourcePhotoIds: string[], metrics: Row[], pageCount = 1) {
  return {
    sourcePhotoIds,
    pageCount,
    basicInfo: {
      type: 'Blood routine',
      originalType: 'Blood routine',
      typeKey: 'blood_routine',
      canonicalTypeName: 'Blood routine',
      modality: 'laboratory',
      analysisPolicy: 'metric_analysis',
      hospital: 'Mock Hospital',
      hospitalSource: 'ocr',
      reportDate: '2026-05-30',
      reportDateSource: 'ocr',
      examDate: null,
      patientName: 'Mock Patient',
      department: null,
      orderNo: null,
      examPart: null,
      examMethod: null,
      reportLike: true,
      confidence: 0.91
    },
    metrics,
    findings: [],
    conflicts: [],
    warnings: [],
    status: 'needs_review'
  };
}

function mockMetric(overrides: Row = {}) {
  return {
    metricKey: 'wbc',
    metricName: 'WBC',
    originalMetricName: 'WBC',
    category: 'blood_routine',
    categoryCn: 'Blood routine',
    mappingStatus: 'confirmed',
    valueType: 'quantitative',
    valueNumeric: 3.2,
    valueQualitative: null,
    valueText: null,
    unit: '10^9/L',
    refRangeLow: 3.5,
    refRangeHigh: 10,
    refQualitative: null,
    refText: null,
    tone: 'low',
    ocrConfidence: 0.9,
    ...overrides
  };
}

function offsetDateOnly(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

assert.deepEqual(parseDotEnv(`
# local backend config
DATABASE_URL="postgresql://user:pass@localhost:5432/healthhelper?schema=public"
JWT_SECRET='local-secret-1234567890'
PORT=8788
`), {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/healthhelper?schema=public',
  JWT_SECRET: 'local-secret-1234567890',
  PORT: '8788'
});

const parsedEnv = loadEnv({
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  JWT_SECRET: 'test-secret-1234567890',
  WECHAT_APP_ID: 'test-app-id',
  WECHAT_APP_SECRET: 'test-app-secret',
  NODE_ENV: 'test',
  PORT: '8789'
});
assert.equal(parsedEnv.PORT, 8789);
assert.equal(parsedEnv.NODE_ENV, 'test');
assert.throws(() => loadEnv({
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  JWT_SECRET: 'replace-with-local-dev-secret',
  WECHAT_APP_ID: 'test-app-id',
  WECHAT_APP_SECRET: 'put-secret-in-local-env-only',
  NODE_ENV: 'production',
  PORT: '8789'
}));
assert.throws(() => loadEnv({
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  JWT_SECRET: 'test-secret-1234567890',
  WECHAT_APP_ID: 'test-app-id',
  WECHAT_APP_SECRET: 'test-app-secret',
  NODE_ENV: 'production',
  PORT: '8789',
  BACKEND_PUBLIC_BASE_URL: 'https://api.example.test',
  UPLOAD_STORAGE_PROVIDER: 'object_storage',
  OCR_PROVIDER: 'commercial_ocr',
  OPENAI_API_KEY: ''
}), /OPENAI_API_KEY/);
assert.throws(() => loadEnv({
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  JWT_SECRET: 'test-secret-1234567890',
  WECHAT_APP_ID: 'test-app-id',
  WECHAT_APP_SECRET: 'test-app-secret',
  NODE_ENV: 'production',
  PORT: '8789',
  BACKEND_PUBLIC_BASE_URL: 'https://api.example.test',
  UPLOAD_STORAGE_PROVIDER: 'local',
  OCR_PROVIDER: 'gpt_vision',
  OPENAI_API_KEY: 'test-openai-key'
}), /ALLOW_LOCAL_UPLOAD_STORAGE_IN_PRODUCTION/);
assert.equal(loadEnv({
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  JWT_SECRET: 'test-secret-1234567890',
  WECHAT_APP_ID: 'test-app-id',
  WECHAT_APP_SECRET: 'test-app-secret',
  NODE_ENV: 'production',
  PORT: '8789',
  BACKEND_PUBLIC_BASE_URL: 'https://api.example.test',
  UPLOAD_STORAGE_PROVIDER: 'local',
  ALLOW_LOCAL_UPLOAD_STORAGE_IN_PRODUCTION: 'true',
  OCR_PROVIDER: 'gpt_vision',
  OPENAI_API_KEY: 'test-openai-key'
}).ALLOW_LOCAL_UPLOAD_STORAGE_IN_PRODUCTION, true);
assert.throws(() => loadEnv({
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  JWT_SECRET: 'test-secret-1234567890',
  WECHAT_APP_ID: 'test-app-id',
  WECHAT_APP_SECRET: 'test-app-secret',
  NODE_ENV: 'test',
  PORT: '8789',
  OCR_FALLBACK_PROVIDER: 'gpt_vision',
  OCR_FALLBACK_API_KEY: ''
}), /OCR_FALLBACK_API_KEY/);

const env: Env = {
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  JWT_SECRET: 'test-secret-1234567890',
  WECHAT_APP_ID: 'test-app-id',
  WECHAT_APP_SECRET: 'test-app-secret',
  NODE_ENV: 'test',
  PORT: 8787,
  BACKEND_PUBLIC_BASE_URL: 'http://127.0.0.1:8787',
  UPLOAD_STORAGE_PROVIDER: 'local',
  ALLOW_LOCAL_UPLOAD_STORAGE_IN_PRODUCTION: false,
  LOCAL_OBJECT_STORAGE_DIR: '../tmp/backend-smoke-object-storage',
  OCR_PROVIDER: 'fixture',
  OCR_FALLBACK_PROVIDER: 'none',
  OPENAI_API_KEY: '',
  OPENAI_OCR_MODEL: 'gpt-4.1-mini',
  OPENAI_API_BASE_URL: 'https://api.openai.com/v1',
  OCR_FALLBACK_API_KEY: '',
  OCR_FALLBACK_OCR_MODEL: 'gpt-4.1-mini',
  OCR_FALLBACK_API_BASE_URL: 'https://api.openai.com/v1',
  OCR_MAX_RETRIES: 1,
  OCR_RETRY_BASE_MS: 1,
  OCR_GROUP_CONCURRENCY: 2,
  OCR_REQUEST_TIMEOUT_MS: 120000,
  OCR_MAX_OUTPUT_TOKENS: 6000
};
await fs.rm(new URL('../../tmp/backend-smoke-object-storage/', import.meta.url), { recursive: true, force: true });

const prisma = new MemoryPrisma();
const app = buildApp({ env, prisma: prisma as any });

const missingKeyOcrProvider = createOcrProvider({
  ...env,
  OCR_PROVIDER: 'gpt_vision',
  OPENAI_API_KEY: ''
});
const missingKeyOcrResult = await missingKeyOcrProvider.recognizePhotos({
  profileId: 'profile_for_ocr_provider',
  groups: [],
  context: {
    profileId: 'profile_for_ocr_provider',
    language: 'zh-CN'
  },
  schemaVersion: 'ocr_draft_v1'
});
assert.equal(missingKeyOcrResult.provider, 'gpt_vision');
assert.equal(missingKeyOcrResult.warnings?.[0].code, 'OPENAI_API_KEY_MISSING');

const healthResponse = await app.inject({
  method: 'GET',
  url: '/api/health'
});
assert.equal(healthResponse.statusCode, 200);
assert.equal(healthResponse.json().data.ok, true);
assert.equal(healthResponse.json().data.database.status, 'unchecked');

const doubleSlashHealthResponse = await app.inject({
  method: 'GET',
  url: '//api/health'
});
assert.equal(doubleSlashHealthResponse.statusCode, 200);
assert.equal(doubleSlashHealthResponse.json().data.ok, true);

const unhealthyApp = buildApp({
  env,
  prisma: {
    $queryRawUnsafe: async () => {
      throw new Error('database unavailable');
    }
  } as any
});
const unhealthyResponse = await unhealthyApp.inject({
  method: 'GET',
  url: '/api/health'
});
assert.equal(unhealthyResponse.statusCode, 503);
assert.equal(unhealthyResponse.json().data.ok, false);
assert.equal(unhealthyResponse.json().data.database.status, 'error');
await unhealthyApp.close();

const productionWxSession = await resolveWxLoginSession({
  ...env,
  NODE_ENV: 'production'
}, 'wx_code_for_test', async (url) => {
  const parsedUrl = new URL(url);
  assert.equal(parsedUrl.hostname, 'api.weixin.qq.com');
  assert.equal(parsedUrl.searchParams.get('appid'), env.WECHAT_APP_ID);
  assert.equal(parsedUrl.searchParams.get('secret'), env.WECHAT_APP_SECRET);
  assert.equal(parsedUrl.searchParams.get('js_code'), 'wx_code_for_test');
  assert.equal(parsedUrl.searchParams.get('grant_type'), 'authorization_code');
  return {
    ok: true,
    status: 200,
    json: async () => ({
      openid: 'wx_openid_from_tencent',
      unionid: 'wx_unionid_from_tencent'
    })
  };
});
assert.equal(productionWxSession.wxOpenid, 'wx_openid_from_tencent');
assert.equal(productionWxSession.wxUnionid, 'wx_unionid_from_tencent');

await assert.rejects(resolveWxLoginSession({
  ...env,
  NODE_ENV: 'production'
}, 'bad_wx_code', async () => ({
  ok: true,
  status: 200,
  json: async () => ({
    errcode: 40029,
    errmsg: 'invalid code'
  })
})), /WECHAT_CODE2SESSION_FAILED:40029:invalid code/);

const invalidJsonResponse = await app.inject({
  method: 'POST',
  url: '/api/auth/wx-login',
  headers: {
    'content-type': 'application/json'
  },
  payload: '{'
});
assert.equal(invalidJsonResponse.statusCode, 400);
assert.equal(invalidJsonResponse.json().error.code, 'INVALID_JSON_BODY');

const emptyJsonDeleteResponse = await app.inject({
  method: 'DELETE',
  url: '/api/reports/nonexistent-report',
  headers: {
    'content-type': 'application/json'
  }
});
assert.equal(emptyJsonDeleteResponse.statusCode, 404);
assert.equal(emptyJsonDeleteResponse.json().error.code, 'NOT_FOUND');

const loginResponse = await app.inject({
  method: 'POST',
  url: '/api/auth/wx-login',
  payload: {
    code: 'smoke_code'
  }
});
assert.equal(loginResponse.statusCode, 200);
const loginPayload = loginResponse.json();
assert.ok(loginPayload.data.token);
assert.ok(loginPayload.data.refreshToken);
assert.ok(loginPayload.data.userId);

const prodApp = buildApp({
  env: {
    ...env,
    NODE_ENV: 'production'
  },
  prisma: prisma as any
});
const savedFetch = globalThis.fetch;
globalThis.fetch = async () => ({
  ok: true,
  status: 200,
  json: async () => ({
    errcode: 40029,
    errmsg: 'invalid code'
  })
} as Response);
const prodFailedLoginResponse = await prodApp.inject({
  method: 'POST',
  url: '/api/auth/wx-login',
  payload: {
    code: 'bad_wx_code'
  }
});
globalThis.fetch = savedFetch;
assert.equal(prodFailedLoginResponse.statusCode, 401);
assert.equal(prodFailedLoginResponse.json().error.code, 'WX_LOGIN_FAILED');

const prodNoTokenResponse = await prodApp.inject({
  method: 'GET',
  url: '/api/profiles'
});
assert.equal(prodNoTokenResponse.statusCode, 401);
const prodDoubleSlashNoTokenResponse = await prodApp.inject({
  method: 'GET',
  url: '//api/profiles'
});
assert.equal(prodDoubleSlashNoTokenResponse.statusCode, 401);
const prodAccessToken = prodApp.jwt.sign({ sub: loginPayload.data.userId, typ: 'access' }, { expiresIn: '2h' });
const prodProfilesResponse = await prodApp.inject({
  method: 'GET',
  url: '/api/profiles',
  headers: {
    Authorization: `Bearer ${prodAccessToken}`
  }
});
assert.equal(prodProfilesResponse.statusCode, 200);
assert.equal(prodProfilesResponse.json().data.length, 0);
const prodFixtureResponse = await prodApp.inject({
  method: 'POST',
  url: '/api/ocr/tasks',
  headers: {
    Authorization: `Bearer ${prodAccessToken}`
  },
  payload: {
    fixtureCaseIds: ['acth']
  }
});
assert.equal(prodFixtureResponse.statusCode, 403);
assert.equal(prodFixtureResponse.json().error.code, 'FORBIDDEN');
await prodApp.close();

const refreshResponse = await app.inject({
  method: 'POST',
  url: '/api/auth/refresh',
  payload: {
    refreshToken: loginPayload.data.refreshToken
  }
});
assert.equal(refreshResponse.statusCode, 200);
assert.ok(refreshResponse.json().data.token);

const logoutResponse = await app.inject({
  method: 'POST',
  url: '/api/auth/logout'
});
assert.equal(logoutResponse.statusCode, 200);
assert.equal(logoutResponse.json().data.ok, true);

const profilesResponse = await app.inject({
  method: 'GET',
  url: '/api/profiles'
});
assert.equal(profilesResponse.statusCode, 200);
const profilesPayload = profilesResponse.json();
assert.equal(profilesPayload.data.length, 1);
const profileId = profilesPayload.data[0].id;

const staleProcessingTask = await prisma.ocrTask.create({
  data: {
    profileId,
    userId: loginPayload.data.userId,
    status: 'processing',
    photoCount: 1,
    reportCount: 1
  }
});
const staleTaskRow = prisma.ocrTasks.find((task) => task.id === staleProcessingTask.id);
assert.ok(staleTaskRow);
staleTaskRow.updatedAt = new Date(Date.now() - (30 * 60 * 1000));
const staleTaskResponse = await app.inject({
  method: 'GET',
  url: `/api/ocr/tasks/${staleProcessingTask.id}`
});
assert.equal(staleTaskResponse.statusCode, 200);
assert.equal(staleTaskResponse.json().data.status, 'failed');
assert.equal(staleTaskResponse.json().data.errorCode, 'OCR_TIMEOUT');

const partialProcessingTask = await prisma.ocrTask.create({
  data: {
    profileId,
    userId: loginPayload.data.userId,
    status: 'processing',
    photoCount: 3,
    reportCount: 3
  }
});
partialProcessingTask.updatedAt = new Date(Date.now() - 15_000);
await prisma.recognizedReportDraft.createMany({
  data: [{
    ocrTaskId: partialProcessingTask.id,
    profileId,
    sourcePhotoIds: ['partial_photo_1'],
    pageCount: 1,
    basicInfo: { type: 'blood routine', reportLike: true },
    metrics: [mockMetric({ metricKey: 'partial_wbc' })],
    findings: [],
    conflicts: [],
    warnings: [],
    status: 'needs_review'
  }, {
    ocrTaskId: partialProcessingTask.id,
    profileId,
    sourcePhotoIds: ['old_photo_1'],
    pageCount: 1,
    basicInfo: { type: 'old draft', reportLike: true },
    metrics: [mockMetric({ metricKey: 'discarded_wbc' })],
    findings: [],
    conflicts: [],
    warnings: [],
    status: 'discarded'
  }]
});
const partialProcessingTaskResponse = await app.inject({
  method: 'GET',
  url: `/api/ocr/tasks/${partialProcessingTask.id}`
});
assert.equal(partialProcessingTaskResponse.statusCode, 200);
const partialProcessingTaskPayload = partialProcessingTaskResponse.json().data;
assert.equal(partialProcessingTaskPayload.status, 'processing');
assert.equal(partialProcessingTaskPayload.progress.processedReports, 1);
assert.equal(partialProcessingTaskPayload.progress.totalReports, 3);
assert.ok(partialProcessingTaskPayload.progress.processingElapsedMs >= 10_000);
assert.equal(partialProcessingTaskPayload.progress.isStale, false);
assert.equal(partialProcessingTaskPayload.drafts.length, 1);
assert.equal(partialProcessingTaskPayload.drafts[0].metrics[0].metricKey, 'partial_wbc');
const partialProcessingSaveResponse = await app.inject({
  method: 'POST',
  url: '/api/reports/batch-create',
  payload: {
    profileId,
    ocrTaskId: partialProcessingTask.id
  }
});
assert.equal(partialProcessingSaveResponse.statusCode, 409);
assert.equal(partialProcessingSaveResponse.json().error.code, 'UNREVIEWED_OCR_DRAFTS');
assert.equal(partialProcessingSaveResponse.json().error.details.drafts[0].reason, 'task_still_processing');

const signUploadsResponse = await app.inject({
  method: 'POST',
  url: '/api/uploads/sign',
  payload: {
    profileId,
    files: [
      {
        clientFileId: 'local_1',
        fileName: 'report1.jpg',
        mimeType: 'image/jpeg',
        size: 123456
      },
      {
        clientFileId: 'local_2',
        fileName: 'report2.png',
        mimeType: 'image/png',
        size: 456789
      }
    ]
  }
});
assert.equal(signUploadsResponse.statusCode, 200);
const signUploadsPayload = signUploadsResponse.json();
assert.equal(signUploadsPayload.data.uploads.length, 2);
assert.equal(signUploadsPayload.data.uploads[0].clientFileId, 'local_1');
assert.ok(signUploadsPayload.data.uploads[0].photoId);
assert.ok(signUploadsPayload.data.uploads[0].objectKey.includes(profileId));
assert.equal(prisma.reportPhotos.length, 2);
assert.equal(prisma.reportPhotos[0].status, 'signed');

for (const [index, upload] of signUploadsPayload.data.uploads.entries()) {
  const uploadUrl = new URL(upload.uploadUrl);
  const rawBytes = index === 0
    ? Buffer.from(`fake image ${upload.photoId}`)
    : Buffer.alloc(1024 * 1024 + 10, 1);
  const multipart = multipartImagePayload('file', `report-${index + 1}.jpg`, 'image/jpeg', rawBytes);
  const localUploadResponse = await app.inject({
    method: 'POST',
    url: uploadUrl.pathname,
    headers: {
      ...upload.headers,
      'content-type': index === 0 ? `multipart/form-data; boundary=${multipart.boundary}` : 'image/jpeg'
    },
    payload: index === 0 ? multipart.body : rawBytes
  });
  assert.equal(localUploadResponse.statusCode, 200);
  assert.equal(localUploadResponse.json().data.photoId, upload.photoId);
  assert.equal(localUploadResponse.json().data.sizeBytes, rawBytes.length);
}

const oversizedUploadResponse = await app.inject({
  method: 'POST',
  url: '/api/uploads/sign',
  payload: {
    profileId,
    files: [{
      clientFileId: 'too_large',
      fileName: 'large.jpg',
      mimeType: 'image/jpeg',
      size: 11 * 1024 * 1024
    }]
  }
});
assert.equal(oversizedUploadResponse.statusCode, 413);
assert.equal(oversizedUploadResponse.json().error.code, 'PAYLOAD_TOO_LARGE');

const unsupportedUploadResponse = await app.inject({
  method: 'POST',
  url: '/api/uploads/sign',
  payload: {
    profileId,
    files: [{
      clientFileId: 'bad_type',
      fileName: 'report.pdf',
      mimeType: 'application/pdf',
      size: 1024
    }]
  }
});
assert.equal(unsupportedUploadResponse.statusCode, 415);
assert.equal(unsupportedUploadResponse.json().error.code, 'UNSUPPORTED_MEDIA_TYPE');

const unsupportedWebpUploadResponse = await app.inject({
  method: 'POST',
  url: '/api/uploads/sign',
  payload: {
    profileId,
    files: [{
      clientFileId: 'bad_webp',
      fileName: 'report.webp',
      mimeType: 'image/webp',
      size: 1024
    }]
  }
});
assert.equal(unsupportedWebpUploadResponse.statusCode, 415);
assert.equal(unsupportedWebpUploadResponse.json().error.code, 'UNSUPPORTED_MEDIA_TYPE');

const tooManyOcrPhotosResponse = await app.inject({
  method: 'POST',
  url: '/api/ocr/tasks',
  payload: {
    profileId,
    photos: Array.from({ length: 10 }, (_, index) => ({
      photoId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      groupId: `photo_${index + 1}`,
      sortOrder: index + 1
    }))
  }
});
assert.equal(tooManyOcrPhotosResponse.statusCode, 400);
assert.equal(tooManyOcrPhotosResponse.json().error.code, 'VALIDATION_FAILED');

const incompletePhotoTaskResponse = await app.inject({
  method: 'POST',
  url: '/api/ocr/tasks',
  payload: {
    profileId,
    photos: signUploadsPayload.data.uploads.map((upload: Row, index: number) => ({
      photoId: upload.photoId,
      groupId: 'group_1',
      sortOrder: index + 1
    }))
  }
});
assert.equal(incompletePhotoTaskResponse.statusCode, 400);
assert.equal(incompletePhotoTaskResponse.json().error.code, 'VALIDATION_FAILED');

const completeUploadsResponse = await app.inject({
  method: 'POST',
  url: '/api/uploads/complete',
  payload: {
    profileId,
    uploads: signUploadsPayload.data.uploads.map((upload: Row) => ({
      photoId: upload.photoId,
      sha256: 'a'.repeat(64)
    }))
  }
});
assert.equal(completeUploadsResponse.statusCode, 200);
const completeUploadsPayload = completeUploadsResponse.json();
assert.equal(completeUploadsPayload.data.photos.length, 2);
assert.ok(completeUploadsPayload.data.photos.every((photo: Row) => photo.status === 'uploaded'));
assert.ok(prisma.reportPhotos.every((photo) => photo.status === 'uploaded'));

const signedPhotoTaskResponse = await app.inject({
  method: 'POST',
  url: '/api/ocr/tasks',
  payload: {
    profileId,
    photos: signUploadsPayload.data.uploads.map((upload: Row, index: number) => ({
      photoId: upload.photoId,
      groupId: 'group_1',
      sortOrder: index + 1
    }))
  }
});
assert.equal(signedPhotoTaskResponse.statusCode, 200);
const signedPhotoTaskPayload = signedPhotoTaskResponse.json();
assert.equal(signedPhotoTaskPayload.data.status, 'processing');
const failedSignedPhotoTask = await waitForOcrTask(app, signedPhotoTaskPayload.data.id, 'failed');
assert.equal(failedSignedPhotoTask.status, 'failed');
assert.equal(failedSignedPhotoTask.photoCount, 2);
assert.equal(failedSignedPhotoTask.reportCount, 1);
assert.equal(failedSignedPhotoTask.drafts.length, 0);
assert.equal(failedSignedPhotoTask.errorCode, 'REAL_OCR_PROVIDER_NOT_CONFIGURED');
assert.equal(prisma.ocrTaskPhotos.length, 2);
assert.ok(prisma.reportPhotos.every((photo) => photo.status === 'attached'));

await prisma.ocrTask.update({
  where: { id: signedPhotoTaskPayload.data.id },
  data: {
    status: 'failed',
    errorCode: 'OCR_TIMEOUT',
    errorMessage: 'OCR timed out'
  }
});
const failedPhotoTaskResponse = await app.inject({
  method: 'GET',
  url: `/api/ocr/tasks/${signedPhotoTaskPayload.data.id}`
});
assert.equal(failedPhotoTaskResponse.statusCode, 200);
assert.equal(failedPhotoTaskResponse.json().data.status, 'failed');
assert.equal(failedPhotoTaskResponse.json().data.errorCode, 'OCR_TIMEOUT');
const retryPhotoTaskResponse = await app.inject({
  method: 'POST',
  url: `/api/ocr/tasks/${signedPhotoTaskPayload.data.id}/retry`,
  payload: {
    photoIds: signUploadsPayload.data.uploads.map((upload: Row) => upload.photoId)
  }
});
assert.equal(retryPhotoTaskResponse.statusCode, 200);
assert.equal(retryPhotoTaskResponse.json().data.status, 'failed');
assert.equal(retryPhotoTaskResponse.json().data.errorCode, 'REAL_OCR_PROVIDER_NOT_CONFIGURED');

let gptSourcePhotoIds: string[] = [];
const mockOpenAi = await startMockOpenAiServer(() => ({
  output_text: JSON.stringify({
    drafts: [{
      sourcePhotoIds: gptSourcePhotoIds,
      pageCount: 1,
      basicInfo: {
        type: '检验报告',
        originalType: '',
        typeKey: 'unknown_laboratory',
        canonicalTypeName: '',
        modality: 'laboratory',
        analysisPolicy: 'metric_analysis',
        hospital: '',
        hospitalSource: 'unknown',
        reportDate: '',
        reportDateSource: 'unknown',
        examDate: null,
        patientName: null,
        department: null,
        orderNo: null,
        examPart: null,
        examMethod: null,
        reportLike: true,
        confidence: 0.91
      },
      metrics: [{
        metricKey: 'wbc',
        metricName: 'WBC',
        originalMetricName: 'WBC',
        reportMarkers: ['\u2605'],
        category: 'blood_routine',
        categoryCn: 'Blood Routine',
        mappingStatus: 'confirmed',
        valueType: 'quantitative',
        valueNumeric: 3.2,
        valueQualitative: null,
        valueText: null,
        unit: '10^9/L',
        refRangeLow: 3.5,
        refRangeHigh: 10,
        refQualitative: null,
        refText: null,
        tone: 'low',
        ocrConfidence: 0.9
      }, {
        metricKey: 'triglyceride',
        metricName: 'TG',
        originalMetricName: 'TG',
        category: 'lipid',
        categoryCn: 'Lipid',
        mappingStatus: 'confirmed',
        valueType: 'quantitative',
        valueNumeric: 2.11,
        valueQualitative: null,
        valueText: null,
        unit: 'mmol/L',
        refRangeLow: null,
        refRangeHigh: 2.3,
        refQualitative: null,
        refText: '<=2.30',
        tone: 'high',
        ocrConfidence: 0.9
      }, {
        metricKey: 'progesterone',
        metricName: '孕酮',
        originalMetricName: '孕酮',
        category: 'endocrine_hormone',
        categoryCn: 'Endocrine Hormone',
        mappingStatus: 'confirmed',
        valueType: 'text',
        valueNumeric: null,
        valueQualitative: null,
        valueText: '<104',
        unit: 'pg/ml',
        refRangeLow: null,
        refRangeHigh: null,
        refQualitative: null,
        refText: 'Female follicular phase <2700; luteal phase 3000-31400',
        tone: 'unknown',
        ocrConfidence: 0.9
      }, {
        metricKey: 'hdl_cholesterol',
        metricName: 'HDL-C',
        originalMetricName: 'HDL-C',
        category: 'lipid',
        categoryCn: 'Lipid',
        mappingStatus: 'confirmed',
        valueType: 'quantitative',
        valueNumeric: 2.9,
        valueQualitative: null,
        valueText: null,
        unit: 'mmol/L',
        refRangeLow: 1.15,
        refRangeHigh: null,
        refQualitative: null,
        refText: '>=1.15',
        tone: 'high',
        ocrConfidence: 0.9
      }],
      findings: [],
      conflicts: [],
      warnings: [],
      evidence: {
        rawText: '天津市东丽区新立街社区卫生服务中心血液细胞检验报告单\n检验时间：2025/08/25 08:32\n白细胞数目(WBC) 4.30 3.50-9.50 10^9/L\n'
      },
      status: 'needs_review'
    }]
  })
}));
const gptEnv: Env = {
  ...env,
  OCR_PROVIDER: 'gpt_vision',
  OPENAI_API_KEY: 'test-openai-key',
  OPENAI_API_BASE_URL: mockOpenAi.baseUrl,
  LOCAL_OBJECT_STORAGE_DIR: '../tmp/backend-smoke-gpt-object-storage'
};
await fs.rm(new URL('../../tmp/backend-smoke-gpt-object-storage/', import.meta.url), { recursive: true, force: true });
const gptPrisma = new MemoryPrisma();
const gptApp = buildApp({ env: gptEnv, prisma: gptPrisma as any });
const gptProfileResponse = await gptApp.inject({
  method: 'GET',
  url: '/api/profiles'
});
assert.equal(gptProfileResponse.statusCode, 200);
const gptProfileId = gptProfileResponse.json().data[0].id;
const gptSignResponse = await gptApp.inject({
  method: 'POST',
  url: '/api/uploads/sign',
  payload: {
    profileId: gptProfileId,
    files: [{
      clientFileId: 'gpt_local_1',
      fileName: 'gpt-report.jpg',
      mimeType: 'image/jpeg',
      size: 2048
    }]
  }
});
assert.equal(gptSignResponse.statusCode, 200);
const gptUpload = gptSignResponse.json().data.uploads[0];
gptSourcePhotoIds = [gptUpload.photoId];
const gptUploadUrl = new URL(gptUpload.uploadUrl);
const gptMultipart = multipartImagePayload('file', 'gpt-report.jpg', 'image/jpeg', minimalJpeg(1279, 1706));
const gptUploadResponse = await gptApp.inject({
  method: 'POST',
  url: gptUploadUrl.pathname,
  headers: {
    ...gptUpload.headers,
    'content-type': `multipart/form-data; boundary=${gptMultipart.boundary}`
  },
  payload: gptMultipart.body
});
assert.equal(gptUploadResponse.statusCode, 200);
const gptCompleteResponse = await gptApp.inject({
  method: 'POST',
  url: '/api/uploads/complete',
  payload: {
    profileId: gptProfileId,
    uploads: [{ photoId: gptUpload.photoId }]
  }
});
assert.equal(gptCompleteResponse.statusCode, 200);
const gptOcrTaskResponse = await gptApp.inject({
  method: 'POST',
  url: '/api/ocr/tasks',
  payload: {
    profileId: gptProfileId,
    photos: [{
      photoId: gptUpload.photoId,
      groupId: 'gpt_group_1',
      sortOrder: 1
    }]
  }
});
assert.equal(gptOcrTaskResponse.statusCode, 200);
const gptOcrTask = gptOcrTaskResponse.json().data;
assert.equal(gptOcrTask.status, 'processing');
const completedGptOcrTask = await waitForOcrTask(gptApp, gptOcrTask.id);
assert.equal(completedGptOcrTask.status, 'needs_confirmation');
assert.equal(completedGptOcrTask.reportCount, 1);
assert.equal(completedGptOcrTask.drafts.length, 1);
assert.equal(completedGptOcrTask.drafts[0].basicInfo.typeKey, 'blood_routine');
assert.equal(completedGptOcrTask.drafts[0].basicInfo.hospital, '天津市东丽区新立街社区卫生服务中心');
assert.equal(completedGptOcrTask.drafts[0].basicInfo.reportDate, '2025-08-25');
assert.equal(completedGptOcrTask.drafts[0].metrics[0].metricKey, 'wbc');
assert.equal(completedGptOcrTask.drafts[0].metrics[0].metricName, 'WBC');
assert.equal(completedGptOcrTask.drafts[0].metrics[0].originalMetricName, '\u2605 WBC');
assert.deepEqual(completedGptOcrTask.drafts[0].metrics[0].reportMarkers.map((marker: Row) => marker.raw), ['\u2605']);
const gptOcrMetricsByKey = new Map(completedGptOcrTask.drafts[0].metrics.map((metric: Row) => [metric.metricKey, metric]));
assert.equal(gptOcrMetricsByKey.get('triglyceride')?.tone, 'ok');
assert.equal(gptOcrMetricsByKey.get('progesterone')?.valueType, 'quantitative');
assert.equal(gptOcrMetricsByKey.get('progesterone')?.valueNumeric, 104);
assert.equal(gptOcrMetricsByKey.get('progesterone')?.valueText, '<104');
assert.equal(gptOcrMetricsByKey.get('hdl_cholesterol')?.tone, 'ok');
assert.equal(completedGptOcrTask.drafts[0].warnings.some((warning: Row) => warning.code === 'OCR_IMAGE_LOW_RESOLUTION'), true);
assert.equal(completedGptOcrTask.drafts[0].ocrEvidence.schemaVersion, 'ocr_evidence_v1');
assert.deepEqual(completedGptOcrTask.drafts[0].ocrEvidence.sourcePhotoIds, [gptUpload.photoId]);
assert.equal(completedGptOcrTask.drafts[0].providerMetadata.provider, 'gpt_vision');
assert.equal(mockOpenAi.requests.length, 1);
assert.equal(mockOpenAi.requests[0].url, '/v1/responses');
assert.equal(mockOpenAi.requests[0].body.model, gptEnv.OPENAI_OCR_MODEL);
const gptReviewedDraftResponse = await gptApp.inject({
  method: 'PATCH',
  url: `/api/ocr/tasks/${gptOcrTask.id}/drafts/${completedGptOcrTask.drafts[0].draftId}`,
  payload: {
    draft: {
      basicInfo: {
        ...completedGptOcrTask.drafts[0].basicInfo,
        ocrReviewedAt: '2026-06-04T00:00:00.000Z',
        ocrReviewSource: 'edit_detail'
      }
    }
  }
});
assert.equal(gptReviewedDraftResponse.statusCode, 200);
const gptSaveResponse = await gptApp.inject({
  method: 'POST',
  url: '/api/reports/batch-create',
  payload: {
    ocrTaskId: gptOcrTask.id
  }
});
assert.equal(gptSaveResponse.statusCode, 200);
assert.equal(gptSaveResponse.json().data.reports.length, 1);
const gptReportsResponse = await gptApp.inject({
  method: 'GET',
  url: `/api/profiles/${gptProfileId}/reports`
});
assert.equal(gptReportsResponse.statusCode, 200);
assert.equal(gptReportsResponse.json().data[0].typeKey, 'blood_routine');
assert.deepEqual(gptReportsResponse.json().data[0].metrics[0].reportMarkers.map((marker: Row) => marker.raw), ['\u2605']);
const gptSnapshotsResponse = await gptApp.inject({
  method: 'GET',
  url: `/api/profiles/${gptProfileId}/metrics/snapshots`
});
assert.equal(gptSnapshotsResponse.statusCode, 200);
assert.ok(gptSnapshotsResponse.json().data.some((snapshot: Row) => snapshot.metricKey === 'wbc'));
await gptApp.close();
await mockOpenAi.close();

let cancelRaceSourcePhotoIds: string[] = [];
const cancelRaceOpenAi = await startMockOpenAiServer(async () => {
  await delay(120);
  return {
    output_text: JSON.stringify({
      drafts: [mockBloodRoutineDraft(cancelRaceSourcePhotoIds, [mockMetric({ metricKey: 'cancel_race_wbc' })])]
    })
  };
});
const cancelRaceEnv: Env = {
  ...env,
  OCR_PROVIDER: 'gpt_vision',
  OPENAI_API_KEY: 'test-openai-key',
  OPENAI_API_BASE_URL: cancelRaceOpenAi.baseUrl,
  LOCAL_OBJECT_STORAGE_DIR: '../tmp/backend-smoke-cancel-race-object-storage'
};
await fs.rm(new URL('../../tmp/backend-smoke-cancel-race-object-storage/', import.meta.url), { recursive: true, force: true });
const cancelRacePrisma = new MemoryPrisma();
const cancelRaceApp = buildApp({ env: cancelRaceEnv, prisma: cancelRacePrisma as any });
const cancelRaceProfileResponse = await cancelRaceApp.inject({
  method: 'GET',
  url: '/api/profiles'
});
assert.equal(cancelRaceProfileResponse.statusCode, 200);
const cancelRaceProfileId = cancelRaceProfileResponse.json().data[0].id;
const cancelRaceUpload = await uploadTestPhoto(cancelRaceApp, cancelRaceProfileId, {
  clientFileId: 'cancel_race_local_1',
  fileName: 'cancel-race-report.jpg'
});
cancelRaceSourcePhotoIds = [cancelRaceUpload.photoId];
const cancelRaceTaskResponse = await cancelRaceApp.inject({
  method: 'POST',
  url: '/api/ocr/tasks',
  payload: {
    profileId: cancelRaceProfileId,
    photos: [{
      photoId: cancelRaceUpload.photoId,
      groupId: 'cancel_race_group_1',
      sortOrder: 1
    }]
  }
});
assert.equal(cancelRaceTaskResponse.statusCode, 200);
const cancelRaceTask = cancelRaceTaskResponse.json().data;
assert.equal(cancelRaceTask.status, 'processing');
for (let attempt = 0; attempt < 20 && cancelRaceOpenAi.requests.length === 0; attempt += 1) {
  await delay(10);
}
const cancelRaceCancelResponse = await cancelRaceApp.inject({
  method: 'POST',
  url: `/api/ocr/tasks/${cancelRaceTask.id}/cancel`
});
assert.equal(cancelRaceCancelResponse.statusCode, 200);
assert.equal(cancelRaceCancelResponse.json().data.status, 'cancelled');
await delay(180);
const cancelRaceFinalResponse = await cancelRaceApp.inject({
  method: 'GET',
  url: `/api/ocr/tasks/${cancelRaceTask.id}`
});
assert.equal(cancelRaceFinalResponse.statusCode, 200);
const cancelRaceFinalTask = cancelRaceFinalResponse.json().data;
assert.equal(cancelRaceFinalTask.status, 'cancelled');
assert.equal(cancelRaceFinalTask.reportCount, 1);
assert.equal(cancelRaceFinalTask.drafts.length, 0);
assert.equal(cancelRacePrisma.drafts.length, 0);
await cancelRaceApp.close();
await cancelRaceOpenAi.close();

let retryRaceSourcePhotoIds: string[] = [];
let retryRaceResponseIndex = 0;
const retryRaceOpenAi = await startMockOpenAiServer(async () => {
  retryRaceResponseIndex += 1;
  const isOldRun = retryRaceResponseIndex === 1;
  await delay(isOldRun ? 260 : 20);
  return {
    output_text: JSON.stringify({
      drafts: [mockBloodRoutineDraft(retryRaceSourcePhotoIds, [mockMetric({
        metricKey: isOldRun ? 'old_retry_race_wbc' : 'new_retry_race_wbc'
      })])]
    })
  };
});
const retryRaceEnv: Env = {
  ...env,
  OCR_PROVIDER: 'gpt_vision',
  OPENAI_API_KEY: 'test-openai-key',
  OPENAI_API_BASE_URL: retryRaceOpenAi.baseUrl,
  LOCAL_OBJECT_STORAGE_DIR: '../tmp/backend-smoke-retry-race-object-storage'
};
await fs.rm(new URL('../../tmp/backend-smoke-retry-race-object-storage/', import.meta.url), { recursive: true, force: true });
const retryRacePrisma = new MemoryPrisma();
const retryRaceApp = buildApp({ env: retryRaceEnv, prisma: retryRacePrisma as any });
const retryRaceProfileResponse = await retryRaceApp.inject({
  method: 'GET',
  url: '/api/profiles'
});
assert.equal(retryRaceProfileResponse.statusCode, 200);
const retryRaceProfileId = retryRaceProfileResponse.json().data[0].id;
const retryRaceUpload = await uploadTestPhoto(retryRaceApp, retryRaceProfileId, {
  clientFileId: 'retry_race_local_1',
  fileName: 'retry-race-report.jpg'
});
retryRaceSourcePhotoIds = [retryRaceUpload.photoId];
const retryRaceTaskResponse = await retryRaceApp.inject({
  method: 'POST',
  url: '/api/ocr/tasks',
  payload: {
    profileId: retryRaceProfileId,
    photos: [{
      photoId: retryRaceUpload.photoId,
      groupId: 'retry_race_group_1',
      sortOrder: 1
    }]
  }
});
assert.equal(retryRaceTaskResponse.statusCode, 200);
const retryRaceTask = retryRaceTaskResponse.json().data;
assert.equal(retryRaceTask.status, 'processing');
for (let attempt = 0; attempt < 20 && retryRaceOpenAi.requests.length === 0; attempt += 1) {
  await delay(10);
}
const retryWhileProcessingResponse = await retryRaceApp.inject({
  method: 'POST',
  url: `/api/ocr/tasks/${retryRaceTask.id}/retry`
});
assert.equal(retryWhileProcessingResponse.statusCode, 409);
assert.equal(retryWhileProcessingResponse.json().error.code, 'OCR_TASK_STILL_PROCESSING');
assert.equal(retryRaceOpenAi.requests.length, 1);
await retryRacePrisma.ocrTask.update({
  where: { id: retryRaceTask.id },
  data: {
    status: 'failed',
    errorCode: 'OCR_TIMEOUT',
    errorMessage: 'simulated stale timeout'
  }
});
const retryRaceRetryResponse = await retryRaceApp.inject({
  method: 'POST',
  url: `/api/ocr/tasks/${retryRaceTask.id}/retry`
});
assert.equal(retryRaceRetryResponse.statusCode, 200);
const retryRaceRetriedTask = retryRaceRetryResponse.json().data;
assert.equal(retryRaceRetriedTask.status, 'needs_confirmation');
assert.equal(retryRaceRetriedTask.drafts.length, 1);
assert.equal(retryRaceRetriedTask.drafts[0].metrics[0].metricKey, 'new_retry_race_wbc');
await delay(320);
const retryRaceFinalResponse = await retryRaceApp.inject({
  method: 'GET',
  url: `/api/ocr/tasks/${retryRaceTask.id}`
});
assert.equal(retryRaceFinalResponse.statusCode, 200);
const retryRaceFinalTask = retryRaceFinalResponse.json().data;
assert.equal(retryRaceFinalTask.status, 'needs_confirmation');
assert.equal(retryRaceFinalTask.drafts.length, 1);
assert.equal(retryRaceFinalTask.drafts[0].metrics[0].metricKey, 'new_retry_race_wbc');
assert.equal(retryRacePrisma.drafts.some((draft) => draft.metrics.some((metric: Row) => metric.metricKey === 'old_retry_race_wbc')), false);
await retryRaceApp.close();
await retryRaceOpenAi.close();

const commercialContentArrayOpenAi = await startMockOpenAiServer(() => ({
  choices: [{
    message: {
      content: [
        { type: 'text', text: '天津市某医院检验报告单\n报告名称：血常规\n' },
        { type: 'text', text: '检验时间：2025/08/25 08:32\n白细胞数目(WBC) 4.30 3.50-9.50 10^9/L\n' }
      ]
    }
  }]
}));
const commercialContentArrayEnv: Env = {
  ...env,
  OCR_PROVIDER: 'commercial_ocr',
  OPENAI_API_KEY: 'test-commercial-key',
  OPENAI_API_BASE_URL: commercialContentArrayOpenAi.baseUrl,
  OPENAI_OCR_MODEL: 'deepseek/deepseek-ocr-2'
};
await fs.mkdir(new URL('../../tmp/', import.meta.url), { recursive: true });
const commercialContentArrayImage = new URL('../../tmp/backend-smoke-commercial-content-array.jpg', import.meta.url);
await fs.writeFile(commercialContentArrayImage, Buffer.from('fake commercial OCR report image bytes'));
const commercialContentArrayProvider = createOcrProvider(commercialContentArrayEnv);
const commercialContentArrayResult = await commercialContentArrayProvider.recognizePhotos({
  taskId: 'commercial_content_array_task',
  profileId: '33333333-3333-4333-8333-333333333333',
  groups: [{
    groupId: 'commercial_content_array_group',
    photos: [{
      photoId: '44444444-4444-4444-8444-444444444444',
      objectKey: 'commercial/content-array.jpg',
      localPath: fileURLToPath(commercialContentArrayImage),
      mimeType: 'image/jpeg',
      sizeBytes: 2048,
      groupId: 'commercial_content_array_group',
      sortOrder: 1
    }]
  }],
  context: {
    profileId: '33333333-3333-4333-8333-333333333333',
    language: 'zh-CN'
  },
  schemaVersion: 'ocr_draft_v1'
});
assert.equal(commercialContentArrayResult.provider, 'commercial_ocr');
assert.equal(commercialContentArrayResult.drafts.length, 1);
assert.equal(commercialContentArrayResult.drafts[0].status, 'needs_review');
assert.equal(commercialContentArrayResult.drafts[0].basicInfo.typeKey, 'blood_routine');
assert.equal(commercialContentArrayResult.drafts[0].basicInfo.reportDate, '2025-08-25');
assert.equal(commercialContentArrayResult.drafts[0].metrics.length, 1);
assert.equal(commercialContentArrayResult.drafts[0].metrics[0].metricKey, 'wbc');
assert.ok(commercialContentArrayResult.drafts[0].ocrEvidence?.rawText.includes('白细胞数目'));
assert.equal(commercialContentArrayOpenAi.requests.length, 1);
assert.equal(commercialContentArrayOpenAi.requests[0].url, '/v1/chat/completions');
assert.equal(commercialContentArrayOpenAi.requests[0].body.model, 'deepseek/deepseek-ocr-2');
await commercialContentArrayOpenAi.close();

const machineActhOpenAi = await startMockOpenAiServer(() => ({
  output_text: JSON.stringify({
    drafts: [{
      sourcePhotoIds: ['99999999-9999-4999-8999-999999999999'],
      pageCount: 1,
      basicInfo: {
        type: 'acth_8am',
        originalType: 'acth_8am',
        typeKey: 'acth',
        canonicalTypeName: 'acth_8am',
        modality: 'laboratory',
        analysisPolicy: 'metric_analysis',
        hospital: '北京协和医院',
        hospitalSource: 'ocr',
        reportDate: '2025-12-22',
        reportDateSource: 'ocr',
        examDate: null,
        patientName: null,
        department: null,
        orderNo: null,
        examPart: null,
        examMethod: null,
        reportLike: true,
        confidence: 0.92
      },
      metrics: [{
        metricKey: 'acth',
        metricName: '促肾上腺皮质激素',
        originalMetricName: '促肾上腺皮质激素',
        category: 'endocrine',
        categoryCn: '内分泌',
        mappingStatus: 'confirmed',
        valueType: 'quantitative',
        valueNumeric: 301,
        valueQualitative: null,
        valueText: null,
        unit: 'pg/ml',
        refRangeLow: 7.2,
        refRangeHigh: 63.3,
        refQualitative: null,
        refText: '7.2-63.3',
        tone: 'high',
        ocrConfidence: 0.9
      }],
      findings: [],
      conflicts: [],
      warnings: [],
      status: 'needs_review'
    }]
  })
}));
const machineActhProvider = createOcrProvider({
  ...env,
  OCR_PROVIDER: 'gpt_vision',
  OPENAI_API_KEY: 'test-openai-key',
  OPENAI_API_BASE_URL: machineActhOpenAi.baseUrl
});
const machineActhResult = await machineActhProvider.recognizePhotos({
  taskId: 'machine_acth_task',
  profileId: '99999999-9999-4999-8999-999999999998',
  groups: [{
    groupId: 'machine_acth_group',
    photos: [{
      photoId: '99999999-9999-4999-8999-999999999999',
      objectKey: 'gpt/machine-acth.jpg',
      localPath: fileURLToPath(commercialContentArrayImage),
      mimeType: 'image/jpeg',
      sizeBytes: 2048,
      groupId: 'machine_acth_group',
      sortOrder: 1
    }]
  }],
  context: {
    profileId: '99999999-9999-4999-8999-999999999998',
    language: 'zh-CN'
  },
  schemaVersion: 'ocr_draft_v1'
});
assert.equal(machineActhResult.provider, 'gpt_vision');
assert.equal(machineActhResult.drafts.length, 1);
assert.equal(machineActhResult.drafts[0].basicInfo.type, '血浆ACTH (8AM)');
assert.equal(machineActhResult.drafts[0].basicInfo.originalType, '血浆ACTH (8AM)');
assert.equal(machineActhResult.drafts[0].basicInfo.typeKey, 'acth');
assert.equal(machineActhResult.drafts[0].basicInfo.canonicalTypeName, '血浆ACTH');
assert.equal(machineActhResult.drafts[0].metrics[0].metricKey, 'acth');
assert.equal(machineActhOpenAi.requests.length, 1);
assert.equal(machineActhOpenAi.requests[0].url, '/v1/responses');
await machineActhOpenAi.close();

let machineBloodRoutineAttempts = 0;
const machineBloodRoutineOpenAi = await startMockOpenAiServer(() => {
  machineBloodRoutineAttempts += 1;
  if (machineBloodRoutineAttempts === 1) {
    return {
      output_text: '{"drafts":[{"sourcePhotoIds":["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]}'
    };
  }
  return {
    output_text: `${JSON.stringify({
    drafts: [{
      sourcePhotoIds: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
      pageCount: 1,
      basicInfo: {
        type: '血常规',
        originalType: 'blood_cell_test_report',
        typeKey: 'blood_cell_test_report',
        canonicalTypeName: 'blood_cell_test_report',
        modality: 'laboratory',
        analysisPolicy: 'metric_analysis',
        hospital: '天津市东丽区新立街社区卫生服务中心',
        hospitalSource: 'ocr',
        reportDate: '2025-08-25',
        reportDateSource: 'ocr',
        examDate: null,
        patientName: null,
        department: null,
        orderNo: null,
        examPart: null,
        examMethod: null,
        reportLike: true,
        confidence: 0.93
      },
      metrics: [{
        metricKey: 'neu_pct',
        metricName: '中性粒细胞百分比(Neu%)',
        originalMetricName: '中性粒细胞百分比(Neu%)',
        category: 'blood_cell_test_report',
        categoryCn: '血液细胞',
        mappingStatus: 'confirmed',
        valueType: 'quantitative',
        valueNumeric: 80.4,
        valueQualitative: null,
        valueText: null,
        unit: '%',
        refRangeLow: 40,
        refRangeHigh: 75,
        refQualitative: null,
        refText: '40.0-75.0',
        tone: 'high',
        ocrConfidence: 0.9
      }, {
        metricKey: 'lym_count',
        metricName: '淋巴细胞数目(Lym#)',
        originalMetricName: '淋巴细胞数目(Lym#)',
        category: 'blood_cell_test_report',
        categoryCn: '血液细胞',
        mappingStatus: 'confirmed',
        valueType: 'quantitative',
        valueNumeric: 0.56,
        valueQualitative: null,
        valueText: null,
        unit: '10^9/L',
        refRangeLow: 1.1,
        refRangeHigh: 3.2,
        refQualitative: null,
        refText: '1.10-3.20',
        tone: 'low',
        ocrConfidence: 0.9
      }, {
        metricKey: 'rdw',
        metricName: '红细胞分布宽度变异系数(RDW)',
        originalMetricName: '红细胞分布宽度变异系数(RDW)',
        category: 'blood_cell_test_report',
        categoryCn: '血液细胞',
        mappingStatus: 'confirmed',
        valueType: 'quantitative',
        valueNumeric: 13.2,
        valueQualitative: null,
        valueText: null,
        unit: '%',
        refRangeLow: 11,
        refRangeHigh: 16,
        refQualitative: null,
        refText: '11.0-16.0',
        tone: 'ok',
        ocrConfidence: 0.9
      }, {
        metricKey: 'bas_count',
        metricName: '嗜碱性粒细胞数目(Bas#)',
        originalMetricName: '嗜碱性粒细胞数目(Bas#)',
        category: 'blood_cell_test_report',
        categoryCn: '血液细胞',
        mappingStatus: 'confirmed',
        valueType: 'quantitative',
        valueNumeric: 0,
        valueQualitative: null,
        valueText: null,
        unit: '10^9/L',
        refRangeLow: 0,
        refRangeHigh: 0.6,
        refQualitative: null,
        refText: '0.00-0.60',
        tone: 'ok',
        ocrConfidence: 0.9
      }, {
        metricKey: 'plcr',
        metricName: '大血小板比率(P-LCR)',
        originalMetricName: '大血小板比率(P-LCR)',
        category: 'blood_cell_test_report',
        categoryCn: '血液细胞',
        mappingStatus: 'confirmed',
        valueType: 'quantitative',
        valueNumeric: 21.3,
        valueQualitative: null,
        valueText: null,
        unit: '%',
        refRangeLow: 11,
        refRangeHigh: 45,
        refQualitative: null,
        refText: '11.0-45.0',
        tone: 'ok',
        ocrConfidence: 0.9
      }, {
        metricKey: 'plcc',
        metricName: '大血小板数目(P-LCC)',
        originalMetricName: '大血小板数目(P-LCC)',
        category: 'blood_cell_test_report',
        categoryCn: '血液细胞',
        mappingStatus: 'confirmed',
        valueType: 'quantitative',
        valueNumeric: 26,
        valueQualitative: null,
        valueText: null,
        unit: '10^9/L',
        refRangeLow: 30,
        refRangeHigh: 90,
        refQualitative: null,
        refText: '30-90',
        tone: 'low',
        ocrConfidence: 0.9
      }, {
        metricKey: 'lic_count',
        metricName: 'LIC#',
        originalMetricName: 'LIC#',
        category: 'blood_cell_test_report',
        categoryCn: '血液细胞',
        mappingStatus: 'confirmed',
        valueType: 'quantitative',
        valueNumeric: 0,
        valueQualitative: null,
        valueText: null,
        unit: '10^9/L',
        refRangeLow: 0,
        refRangeHigh: 0.2,
        refQualitative: null,
        refText: '0.00-0.20',
        tone: 'ok',
        ocrConfidence: 0.9
      }, {
        metricKey: 'large_immature_lymphocyte_count',
        metricName: 'large immature lymphocyte count',
        originalMetricName: 'large immature lymphocyte count',
        category: 'blood_cell_test_report',
        categoryCn: '血液细胞',
        mappingStatus: 'confirmed',
        valueType: 'quantitative',
        valueNumeric: 0,
        valueQualitative: null,
        valueText: null,
        unit: '10^9/L',
        refRangeLow: 0,
        refRangeHigh: 0.2,
        refQualitative: null,
        refText: '0.00-0.20',
        tone: 'ok',
        ocrConfidence: 0.91
      }, {
        metricKey: 'lic_pct',
        metricName: 'LIC%',
        originalMetricName: 'LIC%',
        category: 'blood_cell_test_report',
        categoryCn: '血液细胞',
        mappingStatus: 'confirmed',
        valueType: 'quantitative',
        valueNumeric: 0,
        valueQualitative: null,
        valueText: null,
        unit: '%',
        refRangeLow: 0,
        refRangeHigh: 2.5,
        refQualitative: null,
        refText: '0.0-2.5',
        tone: 'ok',
        ocrConfidence: 0.9
      }, {
        metricKey: 'large_immature_lymphocyte_percent',
        metricName: 'large immature lymphocyte percent',
        originalMetricName: 'large immature lymphocyte percent',
        category: 'blood_cell_test_report',
        categoryCn: '血液细胞',
        mappingStatus: 'confirmed',
        valueType: 'quantitative',
        valueNumeric: 0,
        valueQualitative: null,
        valueText: null,
        unit: '%',
        refRangeLow: 0,
        refRangeHigh: 2.5,
        refQualitative: null,
        refText: '0.0-2.5',
        tone: 'ok',
        ocrConfidence: 0.91
      }, {
        metricKey: 'nrbc_count',
        metricName: 'NRBC#',
        originalMetricName: 'NRBC#',
        category: 'blood_cell_test_report',
        categoryCn: '血液细胞',
        mappingStatus: 'confirmed',
        valueType: 'quantitative',
        valueNumeric: 0,
        valueQualitative: null,
        valueText: null,
        unit: '10^9/L',
        refRangeLow: 0,
        refRangeHigh: 9999.999,
        refQualitative: null,
        refText: '0.000-9999.999',
        tone: 'ok',
        ocrConfidence: 0.9
      }, {
        metricKey: 'nucleated_red_blood_cell_count',
        metricName: 'nucleated red blood cell count',
        originalMetricName: 'nucleated red blood cell count',
        category: 'blood_cell_test_report',
        categoryCn: '血液细胞',
        mappingStatus: 'confirmed',
        valueType: 'quantitative',
        valueNumeric: 0,
        valueQualitative: null,
        valueText: null,
        unit: '10^9/L',
        refRangeLow: 0,
        refRangeHigh: 9999.999,
        refQualitative: null,
        refText: '0.000-9999.999',
        tone: 'ok',
        ocrConfidence: 0.91
      }, {
        metricKey: 'nrbc_pct',
        metricName: 'NRBC%',
        originalMetricName: 'NRBC%',
        category: 'blood_cell_test_report',
        categoryCn: '血液细胞',
        mappingStatus: 'confirmed',
        valueType: 'quantitative',
        valueNumeric: 0,
        valueQualitative: null,
        valueText: null,
        unit: '%',
        refRangeLow: 0,
        refRangeHigh: 9999.99,
        refQualitative: null,
        refText: '0.00-9999.99',
        tone: 'ok',
        ocrConfidence: 0.9
      }, {
        metricKey: 'nucleated_red_blood_cell_percent',
        metricName: 'nucleated red blood cell percent',
        originalMetricName: 'nucleated red blood cell percent',
        category: 'blood_cell_test_report',
        categoryCn: '血液细胞',
        mappingStatus: 'confirmed',
        valueType: 'quantitative',
        valueNumeric: 0,
        valueQualitative: null,
        valueText: null,
        unit: '%',
        refRangeLow: 0,
        refRangeHigh: 9999.99,
        refQualitative: null,
        refText: '0.00-9999.99',
        tone: 'ok',
        ocrConfidence: 0.91
      }],
      findings: [],
      conflicts: [],
      warnings: [],
      evidence: {
        rawText: [
          '天津市东丽区新立街社区卫生服务中心血液细胞检验报告单',
          '1 中性粒细胞百分比(Neu%) 80.4 40.0-75.0 %',
          '2 淋巴细胞数目(Lym#) 0.56 1.10-3.20 10^9/L',
          '3 红细胞分布宽度变异系数(RDW) 13.2 11.0-16.0 %',
          '4 大血小板比率(P-LCR) 21.3 11.0-45.0 %',
          '5 大血小板数目(P-LCC) 26 30-90 10^9/L',
          '6 大血小板数目(P-LCC) 26 30-90 10^9/L footnote text',
          '7 嗜碱性粒细胞数目(Bas#) 0.00 0.00-0.06 10^9/L'
        ].join('\n')
      },
      status: 'needs_review'
    }]
  })}\n识别完成`
  };
});
const machineBloodRoutineProvider = createOcrProvider({
  ...env,
  OCR_PROVIDER: 'gpt_vision',
  OPENAI_API_KEY: 'test-openai-key',
  OPENAI_API_BASE_URL: machineBloodRoutineOpenAi.baseUrl
});
const machineBloodRoutineResult = await machineBloodRoutineProvider.recognizePhotos({
  taskId: 'machine_blood_routine_task',
  profileId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab',
  groups: [{
    groupId: 'machine_blood_routine_group',
    photos: [{
      photoId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      objectKey: 'gpt/machine-blood-routine.jpg',
      localPath: fileURLToPath(commercialContentArrayImage),
      mimeType: 'image/jpeg',
      sizeBytes: 2048,
      groupId: 'machine_blood_routine_group',
      sortOrder: 1
    }]
  }],
  context: {
    profileId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab',
    language: 'zh-CN'
  },
  schemaVersion: 'ocr_draft_v1'
});
assert.equal(machineBloodRoutineResult.drafts[0].basicInfo.type, '血液细胞检验报告单');
assert.equal(machineBloodRoutineResult.drafts[0].basicInfo.typeKey, 'blood_routine');
assert.equal(machineBloodRoutineResult.drafts[0].basicInfo.canonicalTypeName, '血常规');
const machineBloodRoutineMetricKeys = machineBloodRoutineResult.drafts[0].metrics.map((metric: Row) => metric.metricKey);
assert.deepEqual([...new Set(machineBloodRoutineMetricKeys)].sort(), [
  'bas_abs',
  'lic_abs',
  'lic_percent',
  'lym_abs',
  'neu_percent',
  'nrbc_abs',
  'nrbc_percent',
  'p_lcc',
  'p_lcr',
  'rdw_cv'
].sort());
assert.equal(machineBloodRoutineMetricKeys.length, 10, machineBloodRoutineMetricKeys.join(', '));
for (const aliasKey of [
  'large_immature_lymphocyte_count',
  'large_immature_lymphocyte_percent',
  'nucleated_red_blood_cell_count',
  'nucleated_red_blood_cell_percent'
]) {
  assert.equal(machineBloodRoutineMetricKeys.includes(aliasKey), false, `${aliasKey} should normalize to a canonical blood routine key`);
}
const machineBloodRoutinePLcc = machineBloodRoutineResult.drafts[0].metrics.filter((metric: Row) => metric.metricKey === 'p_lcc');
assert.equal(machineBloodRoutinePLcc.length, 1);
assert.equal(machineBloodRoutinePLcc[0].unit, '10^9/L');
const machineBloodRoutineBas = machineBloodRoutineResult.drafts[0].metrics.filter((metric: Row) => metric.metricKey === 'bas_abs');
assert.equal(machineBloodRoutineBas.length, 1);
assert.equal(machineBloodRoutineBas[0].refRangeHigh, 0.06);
assert.equal(machineBloodRoutineResult.drafts[0].metrics.every((metric: Row) => metric.category === 'blood_routine'), true);
assert.equal(machineBloodRoutineResult.drafts[0].warnings.some((warning: Row) => warning.code === 'OCR_RAW_TEXT_METRIC_SUPPLEMENT_USED'), true);
assert.equal(machineBloodRoutineOpenAi.requests.length, 2);
assert.equal(machineBloodRoutineOpenAi.requests[0].url, '/v1/responses');
assert.equal(machineBloodRoutineResult.providerMetadata?.attempts, 2);
await machineBloodRoutineOpenAi.close();

let commercialRetryAttempts = 0;
const commercialRetryOpenAi = await startMockOpenAiServer(() => {
  commercialRetryAttempts += 1;
  if (commercialRetryAttempts === 1) {
    return {
      status: 500,
      body: {
        error: {
          code: 'server_error',
          message: 'temporary commercial OCR failure'
        }
      }
    };
  }
  return {
    choices: [{
      message: {
        content: '天津市某医院检验报告单\n报告名称：血常规\n检验时间：2025/08/25 08:32\n白细胞数目(WBC) 4.30 3.50-9.50 10^9/L\n'
      }
    }]
  };
});
const commercialRetryProvider = createOcrProvider({
  ...env,
  OCR_PROVIDER: 'commercial_ocr',
  OPENAI_API_KEY: 'test-commercial-key',
  OPENAI_API_BASE_URL: commercialRetryOpenAi.baseUrl,
  OPENAI_OCR_MODEL: 'deepseek/deepseek-ocr-2',
  OCR_MAX_RETRIES: 1,
  OCR_RETRY_BASE_MS: 1
});
const commercialRetryResult = await commercialRetryProvider.recognizePhotos({
  taskId: 'commercial_retry_task',
  profileId: '55555555-5555-4555-8555-555555555555',
  groups: [{
    groupId: 'commercial_retry_group',
    photos: [{
      photoId: '66666666-6666-4666-8666-666666666666',
      objectKey: 'commercial/retry.jpg',
      localPath: fileURLToPath(commercialContentArrayImage),
      mimeType: 'image/jpeg',
      sizeBytes: 2048,
      groupId: 'commercial_retry_group',
      sortOrder: 1
    }]
  }],
  context: {
    profileId: '55555555-5555-4555-8555-555555555555',
    language: 'zh-CN'
  },
  schemaVersion: 'ocr_draft_v1'
});
assert.equal(commercialRetryResult.drafts[0].metrics[0].metricKey, 'wbc');
assert.equal(commercialRetryOpenAi.requests.length, 2);
assert.equal(commercialRetryResult.providerMetadata?.attempts, 2);
assert.equal(commercialRetryResult.providerMetadata?.endpoint, 'chat.completions');
assert.equal(commercialRetryResult.drafts[0].providerMetadata?.attempts, 2);
await commercialRetryOpenAi.close();

let commercialEmptyRetryAttempts = 0;
const commercialEmptyRetryOpenAi = await startMockOpenAiServer(() => {
  commercialEmptyRetryAttempts += 1;
  if (commercialEmptyRetryAttempts === 1) {
    return {
      choices: [{
        message: {
          content: ''
        }
      }]
    };
  }
  return {
    choices: [{
      message: {
        content: '北京协和医院检验报告单\n检验项目： 血浆ACTH (8AM)\n审核日期： 2025-12-22\n项目\n结果\n参考范围\n单位\n*促肾上腺皮质激素\n301.0\n7.2-63.3\npg/ml\n'
      }
    }]
  };
});
const commercialEmptyRetryProvider = createOcrProvider({
  ...env,
  OCR_PROVIDER: 'commercial_ocr',
  OPENAI_API_KEY: 'test-commercial-key',
  OPENAI_API_BASE_URL: commercialEmptyRetryOpenAi.baseUrl,
  OPENAI_OCR_MODEL: 'deepseek/deepseek-ocr-2',
  OCR_MAX_RETRIES: 1,
  OCR_RETRY_BASE_MS: 1
});
const commercialEmptyRetryResult = await commercialEmptyRetryProvider.recognizePhotos({
  taskId: 'commercial_empty_retry_task',
  profileId: '77777777-7777-4777-8777-777777777777',
  groups: [{
    groupId: 'commercial_empty_retry_group',
    photos: [{
      photoId: '88888888-8888-4888-8888-888888888888',
      objectKey: 'commercial/empty-retry.jpg',
      localPath: fileURLToPath(commercialContentArrayImage),
      mimeType: 'image/jpeg',
      sizeBytes: 2048,
      groupId: 'commercial_empty_retry_group',
      sortOrder: 1
    }]
  }],
  context: {
    profileId: '77777777-7777-4777-8777-777777777777',
    language: 'zh-CN'
  },
  schemaVersion: 'ocr_draft_v1'
});
assert.equal(commercialEmptyRetryResult.drafts[0].basicInfo.typeKey, 'acth');
assert.equal(commercialEmptyRetryResult.drafts[0].metrics[0].metricKey, 'acth');
assert.equal(commercialEmptyRetryOpenAi.requests.length, 2);
assert.equal(commercialEmptyRetryResult.providerMetadata?.attempts, 2);
assert.equal(commercialEmptyRetryResult.drafts[0].providerMetadata?.attempts, 2);
await commercialEmptyRetryOpenAi.close();

let commercialLengthRetryAttempts = 0;
const commercialLengthRetryOpenAi = await startMockOpenAiServer(() => {
  commercialLengthRetryAttempts += 1;
  if (commercialLengthRetryAttempts === 1) {
    return {
      choices: [{
        message: {
          content: '<table>北京协和医院检验报告单项目结果参考范围单位'
        },
        finish_reason: 'length'
      }]
    };
  }
  return {
    choices: [{
      message: {
        content: '北京协和医院检验报告单\n报告名称：血常规\n检验时间：2025/08/25 08:32\n白细胞数目(WBC) 4.30 3.50-9.50 10^9/L\n'
      },
      finish_reason: 'stop'
    }]
  };
});
const commercialLengthRetryProvider = createOcrProvider({
  ...env,
  OCR_PROVIDER: 'commercial_ocr',
  OPENAI_API_KEY: 'test-commercial-key',
  OPENAI_API_BASE_URL: commercialLengthRetryOpenAi.baseUrl,
  OPENAI_OCR_MODEL: 'deepseek/deepseek-ocr-2',
  OCR_MAX_RETRIES: 1,
  OCR_RETRY_BASE_MS: 1
});
const commercialLengthRetryResult = await commercialLengthRetryProvider.recognizePhotos({
  taskId: 'commercial_length_retry_task',
  profileId: '99999999-9999-4999-8999-999999999999',
  groups: [{
    groupId: 'commercial_length_retry_group',
    photos: [{
      photoId: '99999999-9999-4999-8999-999999999998',
      objectKey: 'commercial/length-retry.jpg',
      localPath: fileURLToPath(commercialContentArrayImage),
      mimeType: 'image/jpeg',
      sizeBytes: 2048,
      groupId: 'commercial_length_retry_group',
      sortOrder: 1
    }]
  }],
  context: {
    profileId: '99999999-9999-4999-8999-999999999999',
    language: 'zh-CN'
  },
  schemaVersion: 'ocr_draft_v1'
});
assert.equal(commercialLengthRetryResult.drafts[0].metrics[0].metricKey, 'wbc');
assert.equal(commercialLengthRetryOpenAi.requests.length, 2);
assert.equal(commercialLengthRetryResult.providerMetadata?.attempts, 2);
assert.equal(commercialLengthRetryResult.drafts[0].providerMetadata?.attempts, 2);
await commercialLengthRetryOpenAi.close();

let commercialPartialLengthAttempts = 0;
const commercialPartialLengthOpenAi = await startMockOpenAiServer(() => {
  commercialPartialLengthAttempts += 1;
  return {
    choices: [{
      message: {
        content: '北京协和医院检验报告单\n报告名称：血常规\n检验时间：2025/08/25 08:32\n白细胞数目(WBC) 4.30 3.50-9.50 10^9/L\n'
      },
      finish_reason: 'length'
    }]
  };
});
const commercialPartialLengthProvider = createOcrProvider({
  ...env,
  OCR_PROVIDER: 'commercial_ocr',
  OPENAI_API_KEY: 'test-commercial-key',
  OPENAI_API_BASE_URL: commercialPartialLengthOpenAi.baseUrl,
  OPENAI_OCR_MODEL: 'deepseek/deepseek-ocr-2',
  OCR_MAX_RETRIES: 1,
  OCR_RETRY_BASE_MS: 1
});
const commercialPartialLengthResult = await commercialPartialLengthProvider.recognizePhotos({
  taskId: 'commercial_partial_length_task',
  profileId: '99999999-9999-4999-8999-999999999997',
  groups: [{
    groupId: 'commercial_partial_length_group',
    photos: [{
      photoId: '99999999-9999-4999-8999-999999999996',
      objectKey: 'commercial/partial-length.jpg',
      localPath: fileURLToPath(commercialContentArrayImage),
      mimeType: 'image/jpeg',
      sizeBytes: 2048,
      groupId: 'commercial_partial_length_group',
      sortOrder: 1
    }]
  }],
  context: {
    profileId: '99999999-9999-4999-8999-999999999997',
    language: 'zh-CN'
  },
  schemaVersion: 'ocr_draft_v1'
});
assert.equal(commercialPartialLengthOpenAi.requests.length, 2);
assert.equal(commercialPartialLengthResult.drafts.length, 1);
assert.equal(commercialPartialLengthResult.drafts[0].metrics[0].metricKey, 'wbc');
assert.equal(commercialPartialLengthResult.drafts[0].warnings.some((warning: Row) => warning.code === 'OCR_OUTPUT_TRUNCATED'), true);
assert.equal(commercialPartialLengthResult.warnings?.some((warning: Row) => warning.code === 'OCR_OUTPUT_TRUNCATED'), true);
assert.ok(commercialPartialLengthResult.drafts[0].ocrEvidence?.rawText.includes('白细胞数目'));
await commercialPartialLengthOpenAi.close();

let batchInferCallIndex = 0;
const batchInferOpenAi = await startMockOpenAiServer(() => {
  const callIndex = batchInferCallIndex;
  batchInferCallIndex += 1;
  const draft = mockBloodRoutineDraft([], [
    mockMetric({ metricKey: `batch_infer_wbc_${callIndex + 1}` })
  ]);
  if (callIndex === 0) {
    draft.basicInfo.hospital = 'Batch Inference Hospital';
    draft.basicInfo.hospitalSource = 'ocr';
    draft.basicInfo.reportDate = '2025-08-25';
    draft.basicInfo.reportDateSource = 'ocr';
  } else {
    draft.basicInfo.hospital = '';
    draft.basicInfo.hospitalSource = 'unknown';
    draft.basicInfo.reportDate = '';
    draft.basicInfo.reportDateSource = 'unknown';
  }
  return {
    output_text: JSON.stringify({
      drafts: [draft]
    })
  };
});
const batchInferEnv: Env = {
  ...env,
  OCR_PROVIDER: 'gpt_vision',
  OPENAI_API_KEY: 'test-openai-key',
  OPENAI_API_BASE_URL: batchInferOpenAi.baseUrl,
  OCR_GROUP_CONCURRENCY: 1,
  LOCAL_OBJECT_STORAGE_DIR: '../tmp/backend-smoke-batch-infer-object-storage'
};
await fs.rm(new URL('../../tmp/backend-smoke-batch-infer-object-storage/', import.meta.url), { recursive: true, force: true });
const batchInferPrisma = new MemoryPrisma();
const batchInferApp = buildApp({ env: batchInferEnv, prisma: batchInferPrisma as any });
const batchInferProfileResponse = await batchInferApp.inject({
  method: 'GET',
  url: '/api/profiles'
});
assert.equal(batchInferProfileResponse.statusCode, 200);
const batchInferProfileId = batchInferProfileResponse.json().data[0].id;
const batchInferSignResponse = await batchInferApp.inject({
  method: 'POST',
  url: '/api/uploads/sign',
  payload: {
    profileId: batchInferProfileId,
    files: [
      {
        clientFileId: 'batch_infer_local_1',
        fileName: 'batch-infer-1.jpg',
        mimeType: 'image/jpeg',
        size: 2048
      },
      {
        clientFileId: 'batch_infer_local_2',
        fileName: 'batch-infer-2.jpg',
        mimeType: 'image/jpeg',
        size: 2048
      }
    ]
  }
});
assert.equal(batchInferSignResponse.statusCode, 200);
const batchInferUploads = batchInferSignResponse.json().data.uploads;
for (const [index, upload] of batchInferUploads.entries()) {
  const uploadUrl = new URL(upload.uploadUrl);
  const multipart = multipartImagePayload('file', `batch-infer-${index + 1}.jpg`, 'image/jpeg', Buffer.from(`fake batch infer image ${index + 1}`));
  const uploadResponse = await batchInferApp.inject({
    method: 'POST',
    url: uploadUrl.pathname,
    headers: {
      ...upload.headers,
      'content-type': `multipart/form-data; boundary=${multipart.boundary}`
    },
    payload: multipart.body
  });
  assert.equal(uploadResponse.statusCode, 200);
}
const batchInferCompleteResponse = await batchInferApp.inject({
  method: 'POST',
  url: '/api/uploads/complete',
  payload: {
    profileId: batchInferProfileId,
    uploads: batchInferUploads.map((upload: Row) => ({ photoId: upload.photoId }))
  }
});
assert.equal(batchInferCompleteResponse.statusCode, 200);
const batchInferTaskResponse = await batchInferApp.inject({
  method: 'POST',
  url: '/api/ocr/tasks',
  payload: {
    profileId: batchInferProfileId,
    photos: batchInferUploads.map((upload: Row, index: number) => ({
      photoId: upload.photoId,
      groupId: `batch_infer_group_${index + 1}`,
      sortOrder: 1
    }))
  }
});
assert.equal(batchInferTaskResponse.statusCode, 200);
const batchInferTask = await waitForOcrTask(batchInferApp, batchInferTaskResponse.json().data.id);
assert.equal(batchInferTask.status, 'needs_confirmation');
assert.equal(batchInferTask.drafts.length, 2);
assert.equal(batchInferTask.drafts[0].basicInfo.hospital, 'Batch Inference Hospital');
assert.equal(batchInferTask.drafts[0].basicInfo.hospitalSource, 'ocr');
assert.equal(batchInferTask.drafts[1].basicInfo.hospital, 'Batch Inference Hospital');
assert.equal(batchInferTask.drafts[1].basicInfo.hospitalSource, 'inferred_from_batch');
assert.equal(batchInferTask.drafts[1].basicInfo.reportDate, '2025-08-25');
assert.equal(batchInferTask.drafts[1].basicInfo.reportDateSource, 'inferred_from_batch');
assert.ok(batchInferTask.drafts[1].warnings.some((item: Row) => item.code === 'BASIC_INFO_INFERRED_FROM_BATCH'));
await batchInferApp.close();
await batchInferOpenAi.close();

const commercialRawText = [
  '\u533b\u9662: Commercial Hospital',
  '\u62a5\u544a\u540d\u79f0: \u8840\u8102\u56db\u9879',
  '\u68c0\u9a8c\u65f6\u95f4: 2025/08/25 08:32',
  '|\u68c0\u9a8c\u9879\u76ee|\u7ed3\u679c|\u53c2\u8003\u8303\u56f4|\u5355\u4f4d|',
  '|---|---|---|---|',
  '|TC|4.49|\u22645.60|mmol/L|',
  '|TG|2.11|\u22642.30|mmol/L|',
  '|HDL-C|2.90|\u22651.15|mmol/L|',
  '|LDL-C|5.55|0.00-4.11|mmol/L|'
].join('\n');
const commercialOpenAi = await startMockOpenAiServer(() => ({
  choices: [{
    message: {
      content: commercialRawText
    }
  }]
}));
const commercialEnv: Env = {
  ...env,
  OCR_PROVIDER: 'commercial_ocr',
  OPENAI_API_KEY: 'test-commercial-key',
  OPENAI_API_BASE_URL: commercialOpenAi.baseUrl,
  OPENAI_OCR_MODEL: 'deepseek/deepseek-ocr-2',
  LOCAL_OBJECT_STORAGE_DIR: '../tmp/backend-smoke-commercial-object-storage'
};
await fs.rm(new URL('../../tmp/backend-smoke-commercial-object-storage/', import.meta.url), { recursive: true, force: true });
const commercialPrisma = new MemoryPrisma();
const commercialApp = buildApp({ env: commercialEnv, prisma: commercialPrisma as any });
const commercialProfileResponse = await commercialApp.inject({
  method: 'GET',
  url: '/api/profiles'
});
assert.equal(commercialProfileResponse.statusCode, 200);
const commercialProfileId = commercialProfileResponse.json().data[0].id;
const commercialSignResponse = await commercialApp.inject({
  method: 'POST',
  url: '/api/uploads/sign',
  payload: {
    profileId: commercialProfileId,
    files: [{
      clientFileId: 'commercial_local_1',
      fileName: 'commercial-report.jpg',
      mimeType: 'image/jpeg',
      size: 2048
    }]
  }
});
assert.equal(commercialSignResponse.statusCode, 200);
const commercialUpload = commercialSignResponse.json().data.uploads[0];
const commercialUploadUrl = new URL(commercialUpload.uploadUrl);
const commercialMultipart = multipartImagePayload('file', 'commercial-report.jpg', 'image/jpeg', Buffer.from('fake commercial report image bytes'));
const commercialUploadResponse = await commercialApp.inject({
  method: 'POST',
  url: commercialUploadUrl.pathname,
  headers: {
    ...commercialUpload.headers,
    'content-type': `multipart/form-data; boundary=${commercialMultipart.boundary}`
  },
  payload: commercialMultipart.body
});
assert.equal(commercialUploadResponse.statusCode, 200);
const commercialCompleteResponse = await commercialApp.inject({
  method: 'POST',
  url: '/api/uploads/complete',
  payload: {
    profileId: commercialProfileId,
    uploads: [{ photoId: commercialUpload.photoId }]
  }
});
assert.equal(commercialCompleteResponse.statusCode, 200);
const commercialOcrTaskResponse = await commercialApp.inject({
  method: 'POST',
  url: '/api/ocr/tasks',
  payload: {
    profileId: commercialProfileId,
    photos: [{
      photoId: commercialUpload.photoId,
      groupId: 'commercial_group_1',
      sortOrder: 1
    }]
  }
});
assert.equal(commercialOcrTaskResponse.statusCode, 200);
const commercialOcrTask = commercialOcrTaskResponse.json().data;
assert.equal(commercialOcrTask.status, 'processing');
const completedCommercialOcrTask = await waitForOcrTask(commercialApp, commercialOcrTask.id);
assert.equal(completedCommercialOcrTask.status, 'needs_confirmation');
assert.equal(completedCommercialOcrTask.reportCount, 1);
assert.equal(completedCommercialOcrTask.drafts.length, 1);
assert.equal(completedCommercialOcrTask.drafts[0].basicInfo.hospital, 'Commercial Hospital');
assert.equal(completedCommercialOcrTask.drafts[0].basicInfo.typeKey, 'blood_lipid');
assert.equal(completedCommercialOcrTask.drafts[0].metrics.length, 4);
const commercialDraftMetricsByKey = new Map(completedCommercialOcrTask.drafts[0].metrics.map((metric: Row) => [metric.metricKey, metric]));
assert.equal(commercialDraftMetricsByKey.get('total_cholesterol')?.tone, 'ok');
assert.equal(commercialDraftMetricsByKey.get('triglyceride')?.tone, 'ok');
assert.equal(commercialDraftMetricsByKey.get('hdl_cholesterol')?.tone, 'ok');
assert.equal(commercialDraftMetricsByKey.get('ldl_cholesterol')?.tone, 'high');
assert.equal(completedCommercialOcrTask.drafts[0].providerMetadata.provider, 'commercial_ocr');
assert.equal(commercialOpenAi.requests.length, 1);
assert.equal(commercialOpenAi.requests[0].url, '/v1/chat/completions');
const commercialPromptText = commercialOpenAi.requests[0].body.messages[0].content[0].text;
assert.ok(commercialPromptText.includes('只做 OCR'));
assert.ok(commercialPromptText.includes('逐字抄录'));
assert.ok(commercialPromptText.includes('不要改写'));
assert.ok(commercialPromptText.includes('微/小/大'));
assert.ok(commercialPromptText.includes('↑/↓/H/L/高/低'));
assert.ok(commercialPromptText.includes('参考范围'));
assert.ok(commercialPromptText.includes('每个项目单独一行'));
const commercialReviewedDraftResponse = await commercialApp.inject({
  method: 'PATCH',
  url: `/api/ocr/tasks/${commercialOcrTask.id}/drafts/${completedCommercialOcrTask.drafts[0].draftId}`,
  payload: {
    draft: {
      basicInfo: {
        ...completedCommercialOcrTask.drafts[0].basicInfo,
        ocrReviewedAt: '2026-06-04T00:00:00.000Z',
        ocrReviewSource: 'edit_detail'
      }
    }
  }
});
assert.equal(commercialReviewedDraftResponse.statusCode, 200);
const commercialSaveResponse = await commercialApp.inject({
  method: 'POST',
  url: '/api/reports/batch-create',
  payload: {
    ocrTaskId: commercialOcrTask.id
  }
});
assert.equal(commercialSaveResponse.statusCode, 200);
assert.equal(commercialSaveResponse.json().data.reports.length, 1);
const commercialReportsResponse = await commercialApp.inject({
  method: 'GET',
  url: `/api/profiles/${commercialProfileId}/reports`
});
assert.equal(commercialReportsResponse.statusCode, 200);
const commercialSavedReport = commercialReportsResponse.json().data[0];
assert.equal(commercialSavedReport.typeKey, 'blood_lipid');
assert.equal(commercialSavedReport.abnormalCount, 1);
const commercialSavedMetricsByKey = new Map(commercialSavedReport.metrics.map((metric: Row) => [metric.metricKey, metric]));
assert.equal(commercialSavedMetricsByKey.get('total_cholesterol')?.tone, 'ok');
assert.equal(commercialSavedMetricsByKey.get('triglyceride')?.tone, 'ok');
assert.equal(commercialSavedMetricsByKey.get('hdl_cholesterol')?.tone, 'ok');
assert.equal(commercialSavedMetricsByKey.get('ldl_cholesterol')?.tone, 'high');
const commercialSnapshotsResponse = await commercialApp.inject({
  method: 'GET',
  url: `/api/profiles/${commercialProfileId}/metrics/snapshots`
});
assert.equal(commercialSnapshotsResponse.statusCode, 200);
const commercialSnapshotsByKey = new Map(commercialSnapshotsResponse.json().data.map((snapshot: Row) => [snapshot.metricKey, snapshot]));
assert.equal(commercialSnapshotsByKey.get('total_cholesterol')?.lastTone, 'ok');
assert.equal(commercialSnapshotsByKey.get('triglyceride')?.lastTone, 'ok');
assert.equal(commercialSnapshotsByKey.get('hdl_cholesterol')?.lastTone, 'ok');
assert.equal(commercialSnapshotsByKey.get('ldl_cholesterol')?.lastTone, 'high');
await commercialApp.close();
await commercialOpenAi.close();

const commercialUnstructuredRawText = [
  '\u68c0\u9a8c\u62a5\u544a',
  '\u89e3\u91ca\u4e0e\u5efa\u8bae',
  'TSH\u662f\u7532\u72b6\u817a\u529f\u80fd\u68c0\u6d4b\u6700\u654f\u611f\u7684\u6307\u6807',
  '\u7ed3\u679c\u4ec5\u4f9b\u4e34\u5e8a\u53c2\u8003'
].join('\n');
const commercialUnstructuredOpenAi = await startMockOpenAiServer(() => ({
  choices: [{
    message: {
      content: commercialUnstructuredRawText
    }
  }]
}));
const commercialUnstructuredEnv: Env = {
  ...env,
  OCR_PROVIDER: 'commercial_ocr',
  OPENAI_API_KEY: 'test-commercial-key',
  OPENAI_API_BASE_URL: commercialUnstructuredOpenAi.baseUrl,
  OPENAI_OCR_MODEL: 'deepseek/deepseek-ocr-2',
  LOCAL_OBJECT_STORAGE_DIR: '../tmp/backend-smoke-commercial-unstructured-object-storage'
};
await fs.rm(new URL('../../tmp/backend-smoke-commercial-unstructured-object-storage/', import.meta.url), { recursive: true, force: true });
const commercialUnstructuredPrisma = new MemoryPrisma();
const commercialUnstructuredApp = buildApp({ env: commercialUnstructuredEnv, prisma: commercialUnstructuredPrisma as any });
const commercialUnstructuredProfileResponse = await commercialUnstructuredApp.inject({
  method: 'GET',
  url: '/api/profiles'
});
assert.equal(commercialUnstructuredProfileResponse.statusCode, 200);
const commercialUnstructuredProfileId = commercialUnstructuredProfileResponse.json().data[0].id;
const commercialUnstructuredUpload = await uploadTestPhoto(commercialUnstructuredApp, commercialUnstructuredProfileId, {
  clientFileId: 'commercial_unstructured_local_1',
  fileName: 'commercial-unstructured-report.jpg',
  bytes: minimalJpeg(1800, 1800)
});
const commercialUnstructuredTaskResponse = await commercialUnstructuredApp.inject({
  method: 'POST',
  url: '/api/ocr/tasks',
  payload: {
    profileId: commercialUnstructuredProfileId,
    photos: [{
      photoId: commercialUnstructuredUpload.photoId,
      groupId: 'commercial_unstructured_group_1',
      sortOrder: 1
    }]
  }
});
assert.equal(commercialUnstructuredTaskResponse.statusCode, 200);
const commercialUnstructuredTask = await waitForOcrTask(commercialUnstructuredApp, commercialUnstructuredTaskResponse.json().data.id);
assert.equal(commercialUnstructuredTask.status, 'needs_confirmation');
assert.equal(commercialUnstructuredTask.drafts.length, 1);
assert.equal(commercialUnstructuredTask.drafts[0].status, 'needs_manual_input');
assert.equal(commercialUnstructuredTask.drafts[0].metrics.length, 0);
assert.equal(commercialUnstructuredTask.drafts[0].warnings.some((warning: Row) => warning.code === 'OCR_RAW_TEXT_UNSTRUCTURED'), true);
const commercialUnstructuredSaveResponse = await commercialUnstructuredApp.inject({
  method: 'POST',
  url: '/api/reports/batch-create',
  payload: {
    profileId: commercialUnstructuredProfileId,
    ocrTaskId: commercialUnstructuredTask.id
  }
});
assert.equal(commercialUnstructuredSaveResponse.statusCode, 409);
assert.equal(commercialUnstructuredSaveResponse.json().error.code, 'UNREVIEWED_OCR_DRAFTS');
assert.equal(commercialUnstructuredSaveResponse.json().error.details.drafts[0].reason, 'status_not_reviewed');
const commercialUnstructuredDraft = commercialUnstructuredTask.drafts[0];
const commercialManualPatchResponse = await commercialUnstructuredApp.inject({
  method: 'PATCH',
  url: `/api/ocr/tasks/${commercialUnstructuredTask.id}/drafts/${commercialUnstructuredDraft.draftId}`,
  payload: {
    draft: {
      ...commercialUnstructuredDraft,
      status: 'needs_review',
      basicInfo: {
        ...(commercialUnstructuredDraft.basicInfo as Row),
        type: 'Manual blood routine',
        originalType: 'Manual blood routine',
        typeKey: 'blood_routine',
        canonicalTypeName: 'Blood routine',
        hospital: 'Manual Reviewed Hospital',
        hospitalSource: 'user_edited',
        reportDate: '2025-08-25',
        reportDateSource: 'user_edited',
        reportLike: true,
        modality: 'laboratory',
        ocrReviewedAt: '2026-06-04T00:00:00.000Z',
        ocrReviewSource: 'edit_detail'
      },
      metrics: [{
        metricKey: 'manual_wbc',
        metricName: 'Manual WBC',
        valueType: 'quantitative',
        valueNumeric: 4.3,
        unit: '10^9/L',
        refRangeLow: 3.5,
        refRangeHigh: 9.5,
        tone: 'ok',
        mappingStatus: 'pending',
        isManuallyEdited: true
      }],
      findings: [],
      conflicts: []
    }
  }
});
assert.equal(commercialManualPatchResponse.statusCode, 200);
assert.equal(commercialManualPatchResponse.json().data.status, 'needs_review');
const commercialManualSaveResponse = await commercialUnstructuredApp.inject({
  method: 'POST',
  url: '/api/reports/batch-create',
  payload: {
    profileId: commercialUnstructuredProfileId,
    ocrTaskId: commercialUnstructuredTask.id
  }
});
assert.equal(commercialManualSaveResponse.statusCode, 200);
assert.equal(commercialManualSaveResponse.json().data.reports.length, 1);
const commercialManualReportsResponse = await commercialUnstructuredApp.inject({
  method: 'GET',
  url: `/api/profiles/${commercialUnstructuredProfileId}/reports`
});
assert.equal(commercialManualReportsResponse.statusCode, 200);
assert.equal(commercialManualReportsResponse.json().data.length, 1);
const commercialManualReportId = commercialManualReportsResponse.json().data[0].id;
assert.equal(commercialManualReportsResponse.json().data[0].hospital, 'Manual Reviewed Hospital');
const commercialManualReportDetailResponse = await commercialUnstructuredApp.inject({
  method: 'GET',
  url: `/api/reports/${commercialManualReportId}`
});
assert.equal(commercialManualReportDetailResponse.statusCode, 200);
assert.equal(commercialManualReportDetailResponse.json().data.report.metrics[0].metricKey, 'manual_wbc');
assert.equal(commercialUnstructuredOpenAi.requests.length, 1);
await commercialUnstructuredApp.close();
await commercialUnstructuredOpenAi.close();

const commercialFallbackOffOpenAi = await startMockOpenAiServer(() => ({
  choices: [{
    message: {
      content: commercialUnstructuredRawText
    }
  }]
}));
const commercialFallbackOffProvider = createOcrProvider({
  ...env,
  OCR_PROVIDER: 'commercial_ocr',
  OPENAI_API_KEY: 'test-commercial-key',
  OPENAI_API_BASE_URL: commercialFallbackOffOpenAi.baseUrl,
  OPENAI_OCR_MODEL: 'deepseek/deepseek-ocr-2',
  OCR_FALLBACK_PROVIDER: 'none'
});
const commercialFallbackOffResult = await commercialFallbackOffProvider.recognizePhotos({
  taskId: 'commercial_fallback_off_task',
  profileId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  groups: [{
    groupId: 'commercial_fallback_off_group',
    photos: [{
      photoId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      objectKey: 'commercial/fallback-off.jpg',
      localPath: fileURLToPath(commercialContentArrayImage),
      mimeType: 'image/jpeg',
      sizeBytes: 2048,
      groupId: 'commercial_fallback_off_group',
      sortOrder: 1
    }]
  }],
  context: {
    profileId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    language: 'zh-CN'
  },
  schemaVersion: 'ocr_draft_v1'
});
assert.equal(commercialFallbackOffResult.provider, 'commercial_ocr');
assert.equal(commercialFallbackOffResult.drafts[0].status, 'needs_manual_input');
assert.equal(commercialFallbackOffResult.drafts[0].providerMetadata?.provider, 'commercial_ocr');
assert.equal(commercialFallbackOffResult.drafts[0].warnings.some((warning: Row) => warning.code === 'OCR_PROVIDER_FALLBACK_USED'), false);
assert.equal(commercialFallbackOffOpenAi.requests.length, 1);
await commercialFallbackOffOpenAi.close();

const commercialFallbackPrimaryOpenAi = await startMockOpenAiServer(() => ({
  choices: [{
    message: {
      content: commercialUnstructuredRawText
    }
  }]
}));
const commercialFallbackVisionOpenAi = await startMockOpenAiServer(() => ({
  output_text: JSON.stringify({
    drafts: [{
      sourcePhotoIds: ['dddddddd-dddd-4ddd-8ddd-dddddddddddd'],
      pageCount: 1,
      basicInfo: {
        type: 'Fallback blood routine',
        originalType: 'Fallback blood routine',
        typeKey: 'blood_routine',
        canonicalTypeName: 'Blood routine',
        modality: 'laboratory',
        analysisPolicy: 'metric_analysis',
        hospital: 'Fallback Hospital',
        hospitalSource: 'ocr',
        reportDate: '2025-08-25',
        reportDateSource: 'ocr',
        examDate: null,
        patientName: '',
        department: '',
        orderNo: '',
        examPart: '',
        examMethod: '',
        reportLike: true,
        confidence: 0.92
      },
      metrics: [{
        metricKey: 'wbc',
        metricName: 'White blood cell count',
        originalMetricName: 'WBC',
        category: 'blood_routine',
        categoryCn: 'Blood Routine',
        mappingStatus: 'confirmed',
        valueType: 'quantitative',
        valueNumeric: 4.3,
        valueQualitative: null,
        valueText: null,
        unit: '10^9/L',
        refRangeLow: 3.5,
        refRangeHigh: 9.5,
        refQualitative: null,
        refText: null,
        tone: 'ok',
        ocrConfidence: 0.94
      }],
      findings: [],
      conflicts: [],
      warnings: [],
      evidence: {
        rawText: '天津市东丽区新立街社区卫生服务中心血液细胞检验报告单\n检验时间：2025/08/25 08:32\n白细胞数目(WBC) 4.30 3.50-9.50 10^9/L\n'
      },
      status: 'needs_review'
    }]
  })
}));
const commercialFallbackProvider = createOcrProvider({
  ...env,
  OCR_PROVIDER: 'commercial_ocr',
  OPENAI_API_KEY: 'test-commercial-key',
  OPENAI_API_BASE_URL: commercialFallbackPrimaryOpenAi.baseUrl,
  OPENAI_OCR_MODEL: 'deepseek/deepseek-ocr-2',
  OCR_FALLBACK_PROVIDER: 'gpt_vision',
  OCR_FALLBACK_API_KEY: 'test-fallback-key',
  OCR_FALLBACK_API_BASE_URL: commercialFallbackVisionOpenAi.baseUrl,
  OCR_FALLBACK_OCR_MODEL: 'gpt-4.1-mini'
});
const commercialFallbackResult = await commercialFallbackProvider.recognizePhotos({
  taskId: 'commercial_fallback_task',
  profileId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  groups: [{
    groupId: 'commercial_fallback_group',
    photos: [{
      photoId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      objectKey: 'commercial/fallback.jpg',
      localPath: fileURLToPath(commercialContentArrayImage),
      mimeType: 'image/jpeg',
      sizeBytes: 2048,
      groupId: 'commercial_fallback_group',
      sortOrder: 1
    }]
  }],
  context: {
    profileId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    language: 'zh-CN'
  },
  schemaVersion: 'ocr_draft_v1'
});
assert.equal(commercialFallbackResult.provider, 'commercial_ocr');
assert.equal(commercialFallbackResult.drafts[0].status, 'needs_review');
assert.equal(commercialFallbackResult.drafts[0].providerMetadata?.provider, 'gpt_vision');
assert.equal(commercialFallbackResult.drafts[0].basicInfo.hospital, 'Fallback Hospital');
assert.equal(commercialFallbackResult.drafts[0].metrics[0].metricKey, 'wbc');
assert.equal(commercialFallbackResult.drafts[0].warnings.some((warning: Row) => warning.code === 'OCR_PROVIDER_FALLBACK_USED'), true);
assert.equal(commercialFallbackResult.warnings?.some((warning: Row) => warning.code === 'OCR_PROVIDER_FALLBACK_USED'), true);
assert.equal(commercialFallbackPrimaryOpenAi.requests.length, 1);
assert.equal(commercialFallbackVisionOpenAi.requests.length, 1);
assert.equal(commercialFallbackVisionOpenAi.requests[0].url, '/v1/responses');
await commercialFallbackPrimaryOpenAi.close();
await commercialFallbackVisionOpenAi.close();

const commercialMetadataGapRawText = [
  '项目 结果 参考范围 单位',
  '1 白细胞数目(WBC) 4.30 3.50-9.50 10^9/L',
  '2 红细胞总数(RBC) 3.75 3.80-5.10 10^12/L'
].join('\n');
const commercialMetadataGapPrimaryOpenAi = await startMockOpenAiServer(() => ({
  choices: [{
    message: {
      content: commercialMetadataGapRawText
    }
  }]
}));
const commercialMetadataGapFallbackOpenAi = await startMockOpenAiServer(() => ({
  output_text: JSON.stringify({
    drafts: [{
      sourcePhotoIds: ['ffffffff-ffff-4fff-8fff-ffffffffffff'],
      pageCount: 1,
      basicInfo: {
        type: '血液细胞检验报告单',
        originalType: '血液细胞检验报告单',
        typeKey: 'blood_routine',
        canonicalTypeName: '血常规',
        modality: 'laboratory',
        analysisPolicy: 'metric_analysis',
        hospital: 'Metadata Fallback Hospital',
        hospitalSource: 'ocr',
        reportDate: '2025-08-25',
        reportDateSource: 'ocr',
        examDate: null,
        patientName: '',
        department: '',
        orderNo: '',
        examPart: '',
        examMethod: '',
        reportLike: true,
        confidence: 0.9
      },
      metrics: [{
        metricKey: 'wbc',
        metricName: '白细胞数目',
        originalMetricName: 'WBC',
        category: 'blood_routine',
        categoryCn: '血常规',
        mappingStatus: 'confirmed',
        valueType: 'quantitative',
        valueNumeric: 4.3,
        valueQualitative: null,
        valueText: null,
        unit: '10^9/L',
        refRangeLow: 3.5,
        refRangeHigh: 9.5,
        refQualitative: null,
        refText: null,
        tone: 'ok',
        ocrConfidence: 0.94
      }],
      findings: [],
      conflicts: [],
      warnings: [],
      status: 'needs_review'
    }]
  })
}));
const commercialMetadataGapProvider = createOcrProvider({
  ...env,
  OCR_PROVIDER: 'commercial_ocr',
  OPENAI_API_KEY: 'test-commercial-key',
  OPENAI_API_BASE_URL: commercialMetadataGapPrimaryOpenAi.baseUrl,
  OPENAI_OCR_MODEL: 'deepseek/deepseek-ocr-2',
  OCR_FALLBACK_PROVIDER: 'gpt_vision',
  OCR_FALLBACK_API_KEY: 'test-fallback-key',
  OCR_FALLBACK_API_BASE_URL: commercialMetadataGapFallbackOpenAi.baseUrl,
  OCR_FALLBACK_OCR_MODEL: 'gpt-4.1-mini'
});
const commercialMetadataGapResult = await commercialMetadataGapProvider.recognizePhotos({
  taskId: 'commercial_metadata_gap_task',
  profileId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  groups: [{
    groupId: 'commercial_metadata_gap_group',
    photos: [{
      photoId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      objectKey: 'commercial/metadata-gap.jpg',
      localPath: fileURLToPath(commercialContentArrayImage),
      mimeType: 'image/jpeg',
      sizeBytes: 2048,
      groupId: 'commercial_metadata_gap_group',
      sortOrder: 1
    }]
  }],
  context: {
    profileId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    language: 'zh-CN'
  },
  schemaVersion: 'ocr_draft_v1'
});
assert.equal(commercialMetadataGapResult.provider, 'commercial_ocr');
assert.equal(commercialMetadataGapResult.drafts[0].providerMetadata?.provider, 'commercial_ocr');
assert.equal(commercialMetadataGapResult.drafts[0].basicInfo.hospital, 'Metadata Fallback Hospital');
assert.equal(commercialMetadataGapResult.drafts[0].basicInfo.reportDate, '2025-08-25');
assert.equal(commercialMetadataGapResult.drafts[0].metrics.length, 2);
assert.equal(commercialMetadataGapResult.drafts[0].warnings.some((warning: Row) => warning.code === 'OCR_PROVIDER_FALLBACK_USED'), true);
assert.equal(commercialMetadataGapResult.warnings?.some((warning: Row) => warning.code === 'OCR_PROVIDER_FALLBACK_USED'), true);
assert.equal(commercialMetadataGapPrimaryOpenAi.requests.length, 1);
assert.equal(commercialMetadataGapFallbackOpenAi.requests.length, 1);
await commercialMetadataGapPrimaryOpenAi.close();
await commercialMetadataGapFallbackOpenAi.close();

const commercialMetadataGapFallbackOffOpenAi = await startMockOpenAiServer(() => ({
  choices: [{
    message: {
      content: commercialMetadataGapRawText
    }
  }]
}));
const commercialMetadataGapFallbackOffProvider = createOcrProvider({
  ...env,
  OCR_PROVIDER: 'commercial_ocr',
  OPENAI_API_KEY: 'test-commercial-key',
  OPENAI_API_BASE_URL: commercialMetadataGapFallbackOffOpenAi.baseUrl,
  OPENAI_OCR_MODEL: 'deepseek/deepseek-ocr-2',
  OCR_FALLBACK_PROVIDER: 'none'
});
const commercialMetadataGapFallbackOffResult = await commercialMetadataGapFallbackOffProvider.recognizePhotos({
  taskId: 'commercial_metadata_gap_fallback_off_task',
  profileId: '12121212-1212-4212-8212-121212121212',
  groups: [{
    groupId: 'commercial_metadata_gap_fallback_off_group',
    photos: [{
      photoId: '34343434-3434-4434-8434-343434343434',
      objectKey: 'commercial/metadata-gap-fallback-off.jpg',
      localPath: fileURLToPath(commercialContentArrayImage),
      mimeType: 'image/jpeg',
      sizeBytes: 2048,
      groupId: 'commercial_metadata_gap_fallback_off_group',
      sortOrder: 1
    }]
  }],
  context: {
    profileId: '12121212-1212-4212-8212-121212121212',
    language: 'zh-CN'
  },
  schemaVersion: 'ocr_draft_v1'
});
assert.equal(commercialMetadataGapFallbackOffResult.provider, 'commercial_ocr');
assert.equal(commercialMetadataGapFallbackOffResult.drafts[0].providerMetadata?.provider, 'commercial_ocr');
assert.equal(commercialMetadataGapFallbackOffResult.drafts[0].metrics.length, 2);
assert.equal(commercialMetadataGapFallbackOffResult.drafts[0].basicInfo.hospital, '');
assert.equal(commercialMetadataGapFallbackOffResult.drafts[0].warnings.some((warning: Row) => warning.code === 'OCR_PROVIDER_FALLBACK_UNAVAILABLE'), true);
assert.equal(commercialMetadataGapFallbackOffOpenAi.requests.length, 1);
await commercialMetadataGapFallbackOffOpenAi.close();

const fallbackImagePath = new URL('../../tmp/backend-smoke-chat-fallback.jpg', import.meta.url);
await fs.writeFile(fallbackImagePath, Buffer.from('fake fallback image bytes'));
const fallbackOpenAi = await startMockOpenAiServer((requestInfo) => {
  if (requestInfo.url === '/v1/responses') {
    return {
      status: 400,
      body: {
        error: {
          code: 'convert_request_failed',
          message: 'responses payload is not supported by this OpenAI-compatible endpoint'
        }
      }
    };
  }
  return {
    choices: [{
      message: {
        content: JSON.stringify({
          drafts: [{
            sourcePhotoIds: ['fallback_photo_1'],
            pageCount: 1,
            basicInfo: {
              type: 'Fallback blood routine',
              originalType: 'Fallback blood routine',
              typeKey: 'blood_routine',
              canonicalTypeName: 'Blood routine',
              modality: 'laboratory',
              analysisPolicy: 'metric_analysis',
              hospital: 'Fallback Hospital',
              hospitalSource: 'ocr',
              reportDate: '2026-05-30',
              reportDateSource: 'ocr',
              examDate: null,
              patientName: null,
              department: null,
              orderNo: null,
              examPart: null,
              examMethod: null,
              reportLike: true,
              confidence: 0.9
            },
            metrics: [{
              metricKey: 'fallback_wbc',
              metricName: 'Fallback WBC',
              originalMetricName: 'Fallback WBC',
              category: 'blood_routine',
              categoryCn: 'Blood routine',
              mappingStatus: 'suggested',
              valueType: 'quantitative',
              valueNumeric: 4.2,
              valueQualitative: null,
              valueText: null,
              unit: '10^9/L',
              refRangeLow: 3.5,
              refRangeHigh: 10,
              refQualitative: null,
              refText: null,
              tone: 'ok',
              ocrConfidence: 0.88
            }],
            findings: [],
            conflicts: [],
            warnings: [],
            status: 'needs_review'
          }]
        })
      }
    }]
  };
});
const fallbackOcrProvider = createOcrProvider({
  ...env,
  OCR_PROVIDER: 'gpt_vision',
  OPENAI_API_KEY: 'test-openai-key',
  OPENAI_API_BASE_URL: fallbackOpenAi.baseUrl
});
const fallbackOcrResult = await fallbackOcrProvider.recognizePhotos({
  profileId: 'profile_for_chat_fallback',
  groups: [{
    groupId: 'fallback_group_1',
    photos: [{
      photoId: 'fallback_photo_1',
      objectKey: 'fallback/report.jpg',
      localPath: fileURLToPath(fallbackImagePath),
      mimeType: 'image/jpeg',
      sizeBytes: 25,
      groupId: 'fallback_group_1',
      sortOrder: 1
    }]
  }],
  context: {
    profileId: 'profile_for_chat_fallback',
    language: 'zh-CN'
  },
  schemaVersion: 'ocr_draft_v1'
});
assert.equal(fallbackOcrResult.drafts[0].metrics[0].metricKey, 'fallback_wbc');
assert.equal(fallbackOpenAi.requests.length, 2);
assert.equal(fallbackOpenAi.requests[0].url, '/v1/responses');
assert.equal(fallbackOpenAi.requests[1].url, '/v1/chat/completions');
assert.ok(fallbackOpenAi.requests[1].body.messages[0].content.some((item: Row) => item.type === 'image_url'));
await fallbackOpenAi.close();

let retryAttempts = 0;
const retryOpenAi = await startMockOpenAiServer(() => {
  retryAttempts += 1;
  if (retryAttempts === 1) {
    return {
      status: 500,
      body: {
        error: {
          code: 'server_error',
          message: 'temporary provider failure'
        }
      }
    };
  }
  return {
    output_text: JSON.stringify({
      drafts: [mockBloodRoutineDraft(['retry_photo_1'], [mockMetric({ metricKey: 'retry_wbc' })])]
    })
  };
});
const retryProvider = createOcrProvider({
  ...env,
  OCR_PROVIDER: 'gpt_vision',
  OPENAI_API_KEY: 'test-openai-key',
  OPENAI_API_BASE_URL: retryOpenAi.baseUrl,
  OCR_MAX_RETRIES: 1,
  OCR_RETRY_BASE_MS: 1
});
const retryResult = await retryProvider.recognizePhotos({
  profileId: 'profile_for_retry',
  groups: [{
    groupId: 'retry_group_1',
    photos: [{
      photoId: 'retry_photo_1',
      objectKey: 'retry/report.jpg',
      localPath: fileURLToPath(fallbackImagePath),
      mimeType: 'image/jpeg',
      sizeBytes: 25,
      groupId: 'retry_group_1',
      sortOrder: 1
    }]
  }],
  context: {
    profileId: 'profile_for_retry',
    language: 'zh-CN'
  },
  schemaVersion: 'ocr_draft_v1'
});
assert.equal(retryResult.drafts[0].metrics[0].metricKey, 'retry_wbc');
assert.equal(retryOpenAi.requests.length, 2);
assert.equal(retryResult.providerMetadata?.attempts, 2);
await retryOpenAi.close();

const rateLimitOpenAi = await startMockOpenAiServer(() => ({
  status: 429,
  body: {
    error: {
      code: 'rate_limit_exceeded',
      message: 'quota exhausted'
    }
  }
}));
const rateLimitProvider = createOcrProvider({
  ...env,
  OCR_PROVIDER: 'gpt_vision',
  OPENAI_API_KEY: 'test-openai-key',
  OPENAI_API_BASE_URL: rateLimitOpenAi.baseUrl,
  OCR_MAX_RETRIES: 0
});
await assert.rejects(
  () => rateLimitProvider.recognizePhotos({
    profileId: 'profile_for_rate_limit',
    groups: [{
      groupId: 'rate_limit_group_1',
      photos: [{
        photoId: 'rate_limit_photo_1',
        objectKey: 'rate-limit/report.jpg',
        localPath: fileURLToPath(fallbackImagePath),
        mimeType: 'image/jpeg',
        sizeBytes: 25,
        groupId: 'rate_limit_group_1',
        sortOrder: 1
      }]
    }],
    context: {
      profileId: 'profile_for_rate_limit',
      language: 'zh-CN'
    },
    schemaVersion: 'ocr_draft_v1'
  }),
  (error) => {
    const failure = toOcrProviderFailure(error);
    assert.equal(failure.code, 'OCR_RATE_LIMITED');
    assert.equal(failure.retryable, true);
    return true;
  }
);
assert.equal(rateLimitOpenAi.requests.length, 1);
await rateLimitOpenAi.close();

const timeoutOpenAi = await startMockOpenAiServer(async () => {
  await delay(50);
  return {
    output_text: JSON.stringify({
      drafts: [mockBloodRoutineDraft(['timeout_photo_1'], [mockMetric({ metricKey: 'timeout_wbc' })])]
    })
  };
});
const timeoutProvider = createOcrProvider({
  ...env,
  OCR_PROVIDER: 'gpt_vision',
  OPENAI_API_KEY: 'test-openai-key',
  OPENAI_API_BASE_URL: timeoutOpenAi.baseUrl,
  OCR_MAX_RETRIES: 1,
  OCR_REQUEST_TIMEOUT_MS: 10
});
await assert.rejects(
  () => timeoutProvider.recognizePhotos({
    profileId: 'profile_for_timeout',
    groups: [{
      groupId: 'timeout_group_1',
      photos: [{
        photoId: 'timeout_photo_1',
        objectKey: 'timeout/report.jpg',
        localPath: fileURLToPath(fallbackImagePath),
        mimeType: 'image/jpeg',
        sizeBytes: 25,
        groupId: 'timeout_group_1',
        sortOrder: 1
      }]
    }],
    context: {
      profileId: 'profile_for_timeout',
      language: 'zh-CN'
    },
    schemaVersion: 'ocr_draft_v1'
  }),
  (error) => {
    const failure = toOcrProviderFailure(error);
    assert.equal(failure.code, 'OCR_TIMEOUT');
    assert.equal(failure.retryable, true);
    return true;
  }
);
assert.equal(timeoutOpenAi.requests.length, 1);
await timeoutOpenAi.close();

const multiPageImagePath1 = new URL('../../tmp/backend-smoke-multipage-1.jpg', import.meta.url);
const multiPageImagePath2 = new URL('../../tmp/backend-smoke-multipage-2.jpg', import.meta.url);
await fs.writeFile(multiPageImagePath1, Buffer.from('fake multipage report page 1'));
await fs.writeFile(multiPageImagePath2, Buffer.from('fake multipage report page 2'));
const multiPageOpenAi = await startMockOpenAiServer(() => ({
  output_text: JSON.stringify({
    drafts: [mockBloodRoutineDraft(['multi_photo_1'], [
      mockMetric({ ocrConfidence: 0.72 }),
      mockMetric({ unit: '10^9/L \u7ea2\u7ec6\u80de\u6570\u76ee(RBC)', ocrConfidence: 0.94 })
    ])]
  })
}));
const multiPageProvider = createOcrProvider({
  ...env,
  OCR_PROVIDER: 'gpt_vision',
  OPENAI_API_KEY: 'test-openai-key',
  OPENAI_API_BASE_URL: multiPageOpenAi.baseUrl
});
const multiPageResult = await multiPageProvider.recognizePhotos({
  profileId: 'profile_for_multipage',
  groups: [{
    groupId: 'multi_group_1',
    photos: [
      {
        photoId: 'multi_photo_1',
        objectKey: 'multi/page-1.jpg',
        localPath: fileURLToPath(multiPageImagePath1),
        mimeType: 'image/jpeg',
        sizeBytes: 28,
        groupId: 'multi_group_1',
        sortOrder: 1
      },
      {
        photoId: 'multi_photo_2',
        objectKey: 'multi/page-2.jpg',
        localPath: fileURLToPath(multiPageImagePath2),
        mimeType: 'image/jpeg',
        sizeBytes: 28,
        groupId: 'multi_group_1',
        sortOrder: 2
      }
    ]
  }],
  context: {
    profileId: 'profile_for_multipage',
    language: 'zh-CN'
  },
  schemaVersion: 'ocr_draft_v1'
});
assert.equal(multiPageResult.drafts.length, 1);
assert.deepEqual(multiPageResult.drafts[0].sourcePhotoIds, ['multi_photo_1', 'multi_photo_2']);
assert.equal(multiPageResult.drafts[0].pageCount, 2);
assert.equal(multiPageResult.drafts[0].metrics.length, 1);
assert.equal(multiPageResult.drafts[0].metrics[0].ocrConfidence, 0.94);
assert.equal(multiPageResult.drafts[0].metrics[0].unit, '10^9/L');
assert.equal(multiPageResult.drafts[0].conflicts.length, 0);
assert.ok(multiPageResult.drafts[0].warnings.some((item: Row) => item.code === 'MULTIPAGE_SOURCE_PHOTOS_INCOMPLETE'));
await multiPageOpenAi.close();

const conflictPageOpenAi = await startMockOpenAiServer(() => ({
  output_text: JSON.stringify({
    drafts: [mockBloodRoutineDraft(['conflict_photo_1', 'conflict_photo_2'], [
      mockMetric({ valueNumeric: 3.2, tone: 'low' }),
      mockMetric({ valueNumeric: 4.1, tone: 'ok', ocrConfidence: 0.91 })
    ], 2)]
  })
}));
const conflictPageProvider = createOcrProvider({
  ...env,
  OCR_PROVIDER: 'gpt_vision',
  OPENAI_API_KEY: 'test-openai-key',
  OPENAI_API_BASE_URL: conflictPageOpenAi.baseUrl
});
const conflictPageResult = await conflictPageProvider.recognizePhotos({
  profileId: 'profile_for_conflict_page',
  groups: [{
    groupId: 'conflict_group_1',
    photos: [
      {
        photoId: 'conflict_photo_1',
        objectKey: 'conflict/page-1.jpg',
        localPath: fileURLToPath(multiPageImagePath1),
        mimeType: 'image/jpeg',
        sizeBytes: 28,
        groupId: 'conflict_group_1',
        sortOrder: 1
      },
      {
        photoId: 'conflict_photo_2',
        objectKey: 'conflict/page-2.jpg',
        localPath: fileURLToPath(multiPageImagePath2),
        mimeType: 'image/jpeg',
        sizeBytes: 28,
        groupId: 'conflict_group_1',
        sortOrder: 2
      }
    ]
  }],
  context: {
    profileId: 'profile_for_conflict_page',
    language: 'zh-CN'
  },
  schemaVersion: 'ocr_draft_v1'
});
assert.equal(conflictPageResult.drafts.length, 1);
assert.equal(conflictPageResult.drafts[0].metrics.length, 1);
assert.equal(conflictPageResult.drafts[0].conflicts.length, 1);
assert.equal((conflictPageResult.drafts[0].conflicts[0] as Row).code, 'DUPLICATE_METRIC_VALUE_CONFLICT');
assert.equal((conflictPageResult.drafts[0].conflicts[0] as Row).metricName, 'WBC');
await conflictPageOpenAi.close();

const suspectMetricOpenAi = await startMockOpenAiServer(() => ({
  output_text: JSON.stringify({
    drafts: [{
      ...mockBloodRoutineDraft(['suspect_metric_photo_1'], [
        mockMetric({ metricKey: 'wbc', metricName: 'WBC', valueNumeric: 4.3, tone: 'ok' }),
        mockMetric({ metricKey: 'rbc', metricName: 'RBC', valueNumeric: 3.75, unit: '10^12/L', tone: 'low' }),
        mockMetric({ metricKey: 'hgb', metricName: 'HGB', valueNumeric: 121, unit: 'g/L', tone: 'ok' }),
        mockMetric({
          metricKey: 'urine_volume_24h',
          metricName: '24小时尿量',
          originalMetricName: '24小时尿量',
          category: 'other',
          categoryCn: '其他',
          mappingStatus: 'pending',
          valueNumeric: '<300',
          unit: 'ml',
          refRangeLow: null,
          refRangeHigh: 300,
          tone: 'unknown'
        }),
        mockMetric({
          metricKey: 'urine_volume_24h',
          metricName: '24小时尿量',
          originalMetricName: '24小时尿量',
          category: 'other',
          categoryCn: '其他',
          mappingStatus: 'pending',
          valueNumeric: 2300,
          unit: 'ml',
          refRangeLow: null,
          refRangeHigh: 300,
          tone: 'high'
        })
      ], 1),
      conflicts: [{
        code: 'DUPLICATE_METRIC_VALUE_CONFLICT',
        field: 'metrics',
        candidates: []
      }]
    }]
  })
}));
const suspectMetricProvider = createOcrProvider({
  ...env,
  OCR_PROVIDER: 'gpt_vision',
  OPENAI_API_KEY: 'test-openai-key',
  OPENAI_API_BASE_URL: suspectMetricOpenAi.baseUrl
});
const suspectMetricResult = await suspectMetricProvider.recognizePhotos({
  profileId: 'profile_for_suspect_metric',
  groups: [{
    groupId: 'suspect_metric_group_1',
    photos: [{
      photoId: 'suspect_metric_photo_1',
      objectKey: 'suspect/page-1.jpg',
      localPath: fileURLToPath(multiPageImagePath1),
      mimeType: 'image/jpeg',
      sizeBytes: 28,
      groupId: 'suspect_metric_group_1',
      sortOrder: 1
    }]
  }],
  context: {
    profileId: 'profile_for_suspect_metric',
    language: 'zh-CN'
  },
  schemaVersion: 'ocr_draft_v1'
});
assert.equal(suspectMetricResult.drafts.length, 1);
assert.equal(suspectMetricResult.drafts[0].metrics.some((metric: Row) => metric.metricKey === 'urine_volume_24h'), false);
assert.equal(suspectMetricResult.drafts[0].conflicts.length, 0);
assert.equal(suspectMetricResult.drafts[0].warnings.some((warning: Row) => warning.code === 'OCR_SUSPECT_METRICS_SUPPRESSED'), true);
await suspectMetricOpenAi.close();

const wrongBindingOpenAi = await startMockOpenAiServer(() => ({
  output_text: JSON.stringify({
    drafts: [{
      ...mockBloodRoutineDraft(['wrong_photo_1', 'wrong_photo_2'], [mockMetric()], 2),
      conflicts: [{
        code: 'MULTIPAGE_INCONSISTENT',
        field: 'basicInfo.type',
        message: 'The linked photos appear to contain different report types.',
        candidates: [
          { label: 'page 1', value: 'blood_routine', confidence: 0.95 },
          { label: 'page 2', value: 'chest_ct', confidence: 0.93 }
        ]
      }]
    }]
  })
}));
const wrongBindingProvider = createOcrProvider({
  ...env,
  OCR_PROVIDER: 'gpt_vision',
  OPENAI_API_KEY: 'test-openai-key',
  OPENAI_API_BASE_URL: wrongBindingOpenAi.baseUrl
});
const wrongBindingResult = await wrongBindingProvider.recognizePhotos({
  profileId: 'profile_for_wrong_binding',
  groups: [{
    groupId: 'wrong_group_1',
    photos: [
      {
        photoId: 'wrong_photo_1',
        objectKey: 'wrong/page-1.jpg',
        localPath: fileURLToPath(multiPageImagePath1),
        mimeType: 'image/jpeg',
        sizeBytes: 28,
        groupId: 'wrong_group_1',
        sortOrder: 1
      },
      {
        photoId: 'wrong_photo_2',
        objectKey: 'wrong/page-2.jpg',
        localPath: fileURLToPath(multiPageImagePath2),
        mimeType: 'image/jpeg',
        sizeBytes: 28,
        groupId: 'wrong_group_1',
        sortOrder: 2
      }
    ]
  }],
  context: {
    profileId: 'profile_for_wrong_binding',
    language: 'zh-CN'
  },
  schemaVersion: 'ocr_draft_v1'
});
assert.ok(wrongBindingResult.drafts[0].warnings.some((item: Row) => item.code === 'MULTIPAGE_INCONSISTENT'));
assert.equal(wrongBindingResult.drafts[0].conflicts.some((item: Row) => item.code === 'MULTIPAGE_INCONSISTENT'), false);
await wrongBindingOpenAi.close();

const createProfileResponse = await app.inject({
  method: 'POST',
  url: '/api/profiles',
  payload: {
    relation: 'father',
    realName: 'Profile A',
    gender: 'M',
    birthDate: '1970-01-02',
    diseaseType: 'hypertension',
    primaryHospital: 'Community Hospital'
  }
});
assert.equal(createProfileResponse.statusCode, 200);
const createdProfile = createProfileResponse.json().data;
assert.equal(createdProfile.realName, 'Profile A');
assert.equal(createdProfile.birthDate, '1970-01-02');
assert.equal(createdProfile.avatarText, 'A');

const updateProfileResponse = await app.inject({
  method: 'PATCH',
  url: `/api/profiles/${createdProfile.id}`,
  payload: {
    primaryHospital: 'Union Hospital',
    stage: 'follow-up'
  }
});
assert.equal(updateProfileResponse.statusCode, 200);
assert.equal(updateProfileResponse.json().data.summary, ['hypertension', 'follow-up', 'Union Hospital'].join(' \u00b7 '));

const deleteProfileResponse = await app.inject({
  method: 'DELETE',
  url: `/api/profiles/${createdProfile.id}`
});
assert.equal(deleteProfileResponse.statusCode, 200);
const afterDeleteProfilesResponse = await app.inject({
  method: 'GET',
  url: '/api/profiles'
});
assert.equal(afterDeleteProfilesResponse.statusCode, 200);
assert.ok(!afterDeleteProfilesResponse.json().data.some((profile: Row) => profile.id === createdProfile.id));

const pastRecheckResponse = await app.inject({
  method: 'POST',
  url: `/api/profiles/${profileId}/recheck-plans`,
  payload: {
    type: 'Past check',
    date: offsetDateOnly(-1),
    hospital: 'Past Hospital'
  }
});
assert.equal(pastRecheckResponse.statusCode, 400);
assert.equal(pastRecheckResponse.json().error.code, 'VALIDATION_FAILED');

const nextRecheckDate = offsetDateOnly(4);
const createRecheckResponse = await app.inject({
  method: 'POST',
  url: `/api/profiles/${profileId}/recheck-plans`,
  payload: {
    type: 'Routine followup',
    date: nextRecheckDate,
    hospital: 'Union Hospital',
    department: 'oncology',
    todos: [
      { text: 'Book appointment', sortOrder: 1, isDone: false, isTemplate: true },
      { text: 'Bring record book', sortOrder: 2, isDone: true, isTemplate: true }
    ],
    reminderConfig: {
      advanceDays: [3, 1, 0],
      subscribeAccepted: false
    }
  }
});
assert.equal(createRecheckResponse.statusCode, 200);
const recheckPlan = createRecheckResponse.json().data;
assert.equal(recheckPlan.date, nextRecheckDate);
assert.equal(recheckPlan.todos.length, 2);

const updateRecheckPlanResponse = await app.inject({
  method: 'PATCH',
  url: `/api/recheck-plans/${recheckPlan.id}`,
  payload: {
    hospital: 'Union East Hospital',
    department: 'imaging'
  }
});
assert.equal(updateRecheckPlanResponse.statusCode, 200);
assert.equal(updateRecheckPlanResponse.json().data.hospital, 'Union East Hospital');
assert.equal(updateRecheckPlanResponse.json().data.department, 'imaging');

const updateReminderResponse = await app.inject({
  method: 'PATCH',
  url: `/api/recheck-plans/${recheckPlan.id}`,
  payload: {
    timeOfDay: '08:30',
    reminderConfig: {
      advanceDays: [7, 1],
      timeOfDay: '08:30',
      subscribeAccepted: false
    }
  }
});
assert.equal(updateReminderResponse.statusCode, 200);
assert.equal(updateReminderResponse.json().data.timeOfDay, '08:30');
assert.deepEqual(updateReminderResponse.json().data.reminderConfig.advanceDays, [7, 1]);
assert.equal(updateReminderResponse.json().data.reminderConfig.timeOfDay, '08:30');

const invalidUpdateRecheckPlanResponse = await app.inject({
  method: 'PATCH',
  url: `/api/recheck-plans/${recheckPlan.id}`,
  payload: {
    date: offsetDateOnly(-2)
  }
});
assert.equal(invalidUpdateRecheckPlanResponse.statusCode, 400);
assert.equal(invalidUpdateRecheckPlanResponse.json().error.code, 'VALIDATION_FAILED');

const listRecheckResponse = await app.inject({
  method: 'GET',
  url: `/api/profiles/${profileId}/recheck-plans`
});
assert.equal(listRecheckResponse.statusCode, 200);
assert.equal(listRecheckResponse.json().data.nextPlan.id, recheckPlan.id);

const addTodoResponse = await app.inject({
  method: 'POST',
  url: `/api/recheck-plans/${recheckPlan.id}/todos`,
  payload: {
    text: 'Prepare imaging files'
  }
});
assert.equal(addTodoResponse.statusCode, 200);
assert.equal(addTodoResponse.json().data.todos.length, 3);
const customTodo = addTodoResponse.json().data.todos.find((todo: Row) => todo.text === 'Prepare imaging files');
assert.ok(customTodo);
assert.equal(customTodo.isDone, false);

const addDisposableTodoResponse = await app.inject({
  method: 'POST',
  url: `/api/recheck-plans/${recheckPlan.id}/todos`,
  payload: {
    text: 'Disposable todo'
  }
});
assert.equal(addDisposableTodoResponse.statusCode, 200);
const disposableTodo = addDisposableTodoResponse.json().data.todos.find((todo: Row) => todo.text === 'Disposable todo');
assert.ok(disposableTodo);
const deleteTodoResponse = await app.inject({
  method: 'DELETE',
  url: `/api/recheck-plans/${recheckPlan.id}/todos/${disposableTodo.id}`
});
assert.equal(deleteTodoResponse.statusCode, 200);
assert.ok(!deleteTodoResponse.json().data.todos.some((todo: Row) => todo.id === disposableTodo.id));

const templateTodo = recheckPlan.todos.find((todo: Row) => todo.isTemplate && todo.isDone);
assert.ok(templateTodo);
const deleteTemplateTodoResponse = await app.inject({
  method: 'DELETE',
  url: `/api/recheck-plans/${recheckPlan.id}/todos/${templateTodo.id}`
});
assert.equal(deleteTemplateTodoResponse.statusCode, 200);
assert.ok(!deleteTemplateTodoResponse.json().data.todos.some((todo: Row) => todo.id === templateTodo.id));

const incompleteRecheckResponse = await app.inject({
  method: 'POST',
  url: `/api/recheck-plans/${recheckPlan.id}/complete`
});
assert.equal(incompleteRecheckResponse.statusCode, 409);
assert.equal(incompleteRecheckResponse.json().error.code, 'RECHECK_TODOS_NOT_READY');

const updateTodoResponse = await app.inject({
  method: 'PATCH',
  url: `/api/recheck-plans/${recheckPlan.id}/todos/${recheckPlan.todos[0].id}`,
  payload: { isDone: true }
});
assert.equal(updateTodoResponse.statusCode, 200);
assert.equal(updateTodoResponse.json().data.todos[0].isDone, true);

const updateCustomTodoResponse = await app.inject({
  method: 'PATCH',
  url: `/api/recheck-plans/${recheckPlan.id}/todos/${customTodo.id}`,
  payload: { isDone: true }
});
assert.equal(updateCustomTodoResponse.statusCode, 200);

const completeRecheckResponse = await app.inject({
  method: 'POST',
  url: `/api/recheck-plans/${recheckPlan.id}/complete`
});
assert.equal(completeRecheckResponse.statusCode, 200);
assert.equal(completeRecheckResponse.json().data.status, 'done');
const doneRecheckResponse = await app.inject({
  method: 'GET',
  url: `/api/profiles/${profileId}/recheck-plans`
});
assert.equal(doneRecheckResponse.statusCode, 200);
assert.equal(doneRecheckResponse.json().data.doneCount, 1);

const cancelSeedResponse = await app.inject({
  method: 'POST',
  url: `/api/profiles/${profileId}/recheck-plans`,
  payload: {
    type: 'CT check',
    date: offsetDateOnly(25),
    hospital: 'Tumor Hospital',
    todos: [{ text: 'Take number', sortOrder: 1 }]
  }
});
assert.equal(cancelSeedResponse.statusCode, 200);
const cancelRecheckResponse = await app.inject({
  method: 'POST',
  url: `/api/recheck-plans/${cancelSeedResponse.json().data.id}/cancel`
});
assert.equal(cancelRecheckResponse.statusCode, 200);
assert.equal(cancelRecheckResponse.json().data.status, 'cancelled');

const deleteSeedResponse = await app.inject({
  method: 'POST',
  url: `/api/profiles/${profileId}/recheck-plans`,
  payload: {
    type: 'CT followup',
    date: offsetDateOnly(26),
    hospital: 'Union Hospital',
    todos: [{ text: 'Prepare documents', sortOrder: 1 }]
  }
});
assert.equal(deleteSeedResponse.statusCode, 200);
const deleteRecheckResponse = await app.inject({
  method: 'DELETE',
  url: `/api/recheck-plans/${deleteSeedResponse.json().data.id}`
});
assert.equal(deleteRecheckResponse.statusCode, 200);
const afterDeleteRecheckResponse = await app.inject({
  method: 'GET',
  url: `/api/profiles/${profileId}/recheck-plans`
});
assert.equal(afterDeleteRecheckResponse.statusCode, 200);
assert.ok(![afterDeleteRecheckResponse.json().data.nextPlan]
  .concat(afterDeleteRecheckResponse.json().data.otherPlans || [])
  .filter(Boolean)
  .some((plan: Row) => plan.id === deleteSeedResponse.json().data.id));

const createTaskResponse = await app.inject({
  method: 'POST',
  url: '/api/ocr/tasks',
  headers: {
    'Idempotency-Key': 'ocr_fixture_smoke'
  },
  payload: {
    profileId,
    fixtureCaseIds: ['acth', 'thyroid', 'cortisol', 'liver_function', 'uric_electrolyte_lipid', 'chest_ct_plain', 'abdomen_pelvis_ct_plain']
  }
});
assert.equal(createTaskResponse.statusCode, 200);
const createTaskPayload = createTaskResponse.json();
assert.equal(createTaskPayload.data.reportCount, 7);
assert.equal(createTaskPayload.data.drafts.length, 7);
assert.equal(createTaskPayload.data.drafts[0].basicInfo.typeKey, 'endocrine_acth');

const repeatTaskResponse = await app.inject({
  method: 'POST',
  url: '/api/ocr/tasks',
  headers: {
    'Idempotency-Key': 'ocr_fixture_smoke'
  },
  payload: {
    profileId,
    fixtureCaseIds: ['acth']
  }
});
assert.equal(repeatTaskResponse.statusCode, 200);
assert.equal(repeatTaskResponse.json().data.id, createTaskPayload.data.id);
assert.equal(prisma.ocrTasks.filter((task) => task.idempotencyKey === 'ocr_fixture_smoke').length, 1);

const getTaskResponse = await app.inject({
  method: 'GET',
  url: `/api/ocr/tasks/${createTaskPayload.data.id}`
});
assert.equal(getTaskResponse.statusCode, 200);
const getTaskPayload = getTaskResponse.json();
assert.equal(getTaskPayload.data.id, createTaskPayload.data.id);
assert.equal(getTaskPayload.data.drafts.length, 7);

const listTasksResponse = await app.inject({
  method: 'GET',
  url: `/api/ocr/tasks?profileId=${profileId}&status=needs_confirmation,ready_to_save`
});
assert.equal(listTasksResponse.statusCode, 200);
assert.ok(listTasksResponse.json().data.some((task: Row) => task.id === createTaskPayload.data.id));

const cancelTaskSeedResponse = await app.inject({
  method: 'POST',
  url: '/api/ocr/tasks',
  payload: {
    profileId,
    fixtureCaseIds: ['acth']
  }
});
assert.equal(cancelTaskSeedResponse.statusCode, 200);
const cancelTaskResponse = await app.inject({
  method: 'POST',
  url: `/api/ocr/tasks/${cancelTaskSeedResponse.json().data.id}/cancel`
});
assert.equal(cancelTaskResponse.statusCode, 200);
assert.equal(cancelTaskResponse.json().data.status, 'cancelled');
assert.ok(cancelTaskResponse.json().data.drafts.every((draft: Row) => draft.status === 'cancelled'));

const deleteDraftSeedResponse = await app.inject({
  method: 'POST',
  url: '/api/ocr/tasks',
  payload: {
    profileId,
    fixtureCaseIds: ['acth']
  }
});
assert.equal(deleteDraftSeedResponse.statusCode, 200);
const deleteDraftSeedPayload = deleteDraftSeedResponse.json();
const postDeleteDraftResponse = await app.inject({
  method: 'POST',
  url: `/api/ocr/tasks/${deleteDraftSeedPayload.data.id}/drafts/${deleteDraftSeedPayload.data.drafts[0].draftId}/delete`
});
assert.equal(postDeleteDraftResponse.statusCode, 200);
assert.equal(postDeleteDraftResponse.json().data.status, 'cancelled');
assert.equal(postDeleteDraftResponse.json().data.reportCount, 0);
assert.equal(postDeleteDraftResponse.json().data.drafts.length, 0);

const splitTask = await prisma.ocrTask.create({
  data: {
    profileId,
    userId: loginPayload.data.userId,
    status: 'ready_to_save',
    photoCount: 2,
    reportCount: 1
  }
});
await prisma.recognizedReportDraft.createMany({
  data: [{
    ocrTaskId: splitTask.id,
    profileId,
    sourcePhotoIds: ['split_photo_a', 'split_photo_b'],
    pageCount: 2,
    basicInfo: {
      type: 'blood routine',
      hospital: 'Split Test Hospital',
      reportDate: '2025-08-25',
      reportLike: true,
      modality: 'laboratory'
    },
    metrics: [{
      metricKey: 'wbc',
      metricName: 'White blood cell count (WBC)',
      valueNumeric: 4.3,
      valueType: 'quantitative',
      tone: 'ok',
      mappingStatus: 'suggested'
    }],
    findings: [],
    conflicts: [],
    warnings: [],
    status: 'needs_review'
  }]
});
const splitDraftId = prisma.drafts.find((draft) => draft.ocrTaskId === splitTask.id)?.id;
assert.ok(splitDraftId);
const splitDraftResponse = await app.inject({
  method: 'POST',
  url: `/api/ocr/tasks/${splitTask.id}/drafts/${splitDraftId}/split`
});
assert.equal(splitDraftResponse.statusCode, 200);
const splitDraftPayload = splitDraftResponse.json().data;
assert.equal(splitDraftPayload.status, 'ready_to_save');
assert.equal(splitDraftPayload.reportCount, 2);
assert.equal(splitDraftPayload.drafts.length, 2);
assert.deepEqual(splitDraftPayload.drafts.map((draft: Row) => draft.sourcePhotoIds), [['split_photo_a'], ['split_photo_b']]);
assert.deepEqual(splitDraftPayload.drafts.map((draft: Row) => draft.pageCount), [1, 1]);
assert.equal(splitDraftPayload.drafts[0].metrics.length, 1);
assert.equal(splitDraftPayload.drafts[1].metrics.length, 0);
assert.equal(splitDraftPayload.drafts[1].status, 'needs_manual_input');
assert.equal(splitDraftPayload.drafts.every((draft: Row) => draft.draftId !== splitDraftId), true);
const splitUnreviewedSaveResponse = await app.inject({
  method: 'POST',
  url: '/api/reports/batch-create',
  payload: {
    profileId,
    ocrTaskId: splitTask.id
  }
});
assert.equal(splitUnreviewedSaveResponse.statusCode, 409);
assert.equal(splitUnreviewedSaveResponse.json().error.code, 'UNREVIEWED_OCR_DRAFTS');
const splitUnreviewedReasons = splitUnreviewedSaveResponse.json().error.details.drafts.map((draft: Row) => draft.reason);
assert.ok(splitUnreviewedReasons.includes('status_not_reviewed'));
const splitSingleDraftResponse = await app.inject({
  method: 'POST',
  url: `/api/ocr/tasks/${splitTask.id}/drafts/${splitDraftPayload.drafts[0].draftId}/split`
});
assert.equal(splitSingleDraftResponse.statusCode, 409);
assert.equal(splitSingleDraftResponse.json().error.code, 'OCR_DRAFT_NOT_SPLITTABLE');

const missingBasicInfoTask = await prisma.ocrTask.create({
  data: {
    profileId,
    userId: loginPayload.data.userId,
    status: 'ready_to_save',
    photoCount: 1,
    reportCount: 1
  }
});
await prisma.recognizedReportDraft.createMany({
  data: [{
    ocrTaskId: missingBasicInfoTask.id,
    profileId,
    sourcePhotoIds: ['missing_basic_info_photo'],
    pageCount: 1,
    basicInfo: {
      type: 'blood routine',
      hospital: '',
      hospitalSource: 'unknown',
      reportDate: '',
      reportDateSource: 'unknown',
      reportLike: true,
      modality: 'laboratory'
    },
    metrics: [{
      metricKey: 'wbc',
      metricName: 'White blood cell count (WBC)',
      valueNumeric: 4.3,
      valueType: 'quantitative',
      tone: 'ok',
      mappingStatus: 'suggested'
    }],
    findings: [],
    conflicts: [],
    warnings: [],
    status: 'needs_review'
  }]
});
const missingBasicInfoSaveResponse = await app.inject({
  method: 'POST',
  url: '/api/reports/batch-create',
  payload: {
    profileId,
    ocrTaskId: missingBasicInfoTask.id
  }
});
assert.equal(missingBasicInfoSaveResponse.statusCode, 409);
assert.equal(missingBasicInfoSaveResponse.json().error.code, 'UNREVIEWED_OCR_DRAFTS');
assert.equal(missingBasicInfoSaveResponse.json().error.details.drafts[0].reason, 'missing_basic_info');

const riskReviewTask = await prisma.ocrTask.create({
  data: {
    profileId,
    userId: loginPayload.data.userId,
    status: 'ready_to_save',
    photoCount: 1,
    reportCount: 1
  }
});
await prisma.recognizedReportDraft.createMany({
  data: [{
    ocrTaskId: riskReviewTask.id,
    profileId,
    sourcePhotoIds: ['risk_review_photo'],
    pageCount: 1,
    basicInfo: {
      type: 'risk review blood routine',
      hospital: 'risk review test hospital',
      reportDate: '2025-10-02',
      reportLike: true,
      modality: 'laboratory'
    },
    metrics: [{
      metricKey: 'risk_review_wbc',
      metricName: 'Risk review WBC',
      valueNumeric: 4.3,
      valueType: 'quantitative',
      tone: 'ok',
      mappingStatus: 'suggested',
      ocrConfidence: 0.72
    }],
    findings: [],
    conflicts: [],
    warnings: [{
      code: 'OCR_IMAGE_LOW_RESOLUTION',
      message: 'Photo quality may make OCR unreliable'
    }],
    status: 'needs_review'
  }]
});
const riskReviewSavedResponse = await app.inject({
  method: 'POST',
  url: '/api/reports/batch-create',
  payload: {
    profileId,
    ocrTaskId: riskReviewTask.id
  }
});
assert.equal(riskReviewSavedResponse.statusCode, 200);
assert.equal(riskReviewSavedResponse.json().data.reports.length, 1);

const editStatusTask = await prisma.ocrTask.create({
  data: {
    profileId,
    userId: loginPayload.data.userId,
    status: 'needs_confirmation',
    photoCount: 1,
    reportCount: 1
  }
});
await prisma.recognizedReportDraft.createMany({
  data: [{
    ocrTaskId: editStatusTask.id,
    profileId,
    sourcePhotoIds: ['edit_status_photo'],
    pageCount: 1,
    basicInfo: {
      type: 'blood routine',
      hospital: 'status update test hospital',
      reportDate: '2025-08-25',
      reportLike: true,
      modality: 'laboratory'
    },
    metrics: [{
      metricKey: 'wbc',
      metricName: 'White blood cell count (WBC)',
      valueNumeric: 4.3,
      valueType: 'quantitative',
      tone: 'ok',
      mappingStatus: 'suggested'
    }],
    findings: [],
    conflicts: [{
      metricKey: 'wbc',
      metricName: 'White blood cell count (WBC)',
      candidates: []
    }],
    warnings: [],
    status: 'needs_confirmation'
  }]
});
const editStatusDraft = prisma.drafts.find((draft) => draft.ocrTaskId === editStatusTask.id);
assert.ok(editStatusDraft);
const editStatusDraftResponse = await app.inject({
  method: 'PATCH',
  url: `/api/ocr/tasks/${editStatusTask.id}/drafts/${editStatusDraft.id}`,
  payload: {
    draft: {
      status: 'needs_review',
      conflicts: [],
      metrics: [{
        metricKey: 'wbc',
        metricName: 'White blood cell count (WBC)',
        valueNumeric: 4.3,
        valueType: 'quantitative',
        tone: 'ok',
        mappingStatus: 'suggested'
      }]
    }
  }
});
assert.equal(editStatusDraftResponse.statusCode, 200);
assert.equal(editStatusDraftResponse.json().data.status, 'needs_review');
const editStatusTaskAfterPatch = await app.inject({
  method: 'GET',
  url: `/api/ocr/tasks/${editStatusTask.id}`
});
assert.equal(editStatusTaskAfterPatch.statusCode, 200);
assert.equal(editStatusTaskAfterPatch.json().data.status, 'ready_to_save');

const editableDraft = getTaskPayload.data.drafts[0];
const updatedDraftResponse = await app.inject({
  method: 'PATCH',
  url: `/api/ocr/tasks/${createTaskPayload.data.id}/drafts/${editableDraft.draftId}`,
  payload: {
    draft: {
      ...editableDraft,
      basicInfo: {
        ...editableDraft.basicInfo,
        hospital: 'User Reviewed Hospital',
        hospitalSource: 'user_edited',
        ocrReviewedAt: '2026-06-04T00:00:00.000Z',
        ocrReviewSource: 'edit_detail'
      },
      metrics: [
        ...(editableDraft.metrics || []),
        {
          ...(editableDraft.metrics || [])[0],
          metricName: 'ACTH low confidence duplicate',
          ocrConfidence: 0.1
        },
        {
          ...(editableDraft.metrics || [])[0],
          metricKey: 'metric_to_delete',
          metricName: 'OCR duplicate to delete',
          valueNumeric: 999,
          ocrConfidence: 0.1
        }
      ],
      conflicts: [{
        metricKey: 'acth',
        metricName: 'ACTH',
        candidates: []
      }, {
        candidates: [{
          metricKey: 'metric_to_delete',
          metricName: 'OCR duplicate to delete',
          valueNumeric: 999,
          unit: 'pg/mL'
        }]
      }]
    }
  }
});
assert.equal(updatedDraftResponse.statusCode, 200);
assert.equal(updatedDraftResponse.json().data.basicInfo.hospital, 'User Reviewed Hospital');

const unresolvedSaveResponse = await app.inject({
  method: 'POST',
  url: '/api/reports/batch-create',
  payload: {
    profileId,
    ocrTaskId: createTaskPayload.data.id
  }
});
assert.equal(unresolvedSaveResponse.statusCode, 409);
assert.equal(unresolvedSaveResponse.json().error.code, 'UNRESOLVED_REPORT_CONFLICTS');
assert.equal(unresolvedSaveResponse.json().error.details.conflicts[0].draftId, editableDraft.draftId);

const deleteConflictResponse = await app.inject({
  method: 'PATCH',
  url: `/api/ocr/tasks/${createTaskPayload.data.id}/drafts/${editableDraft.draftId}/conflicts/metric_to_delete`,
  payload: {
    selectedCandidateIndex: -1,
    resolution: 'delete'
  }
});
assert.equal(deleteConflictResponse.statusCode, 200);
assert.equal(deleteConflictResponse.json().data.resolution, 'delete');
const afterDeleteConflictTaskResponse = await app.inject({
  method: 'GET',
  url: `/api/ocr/tasks/${createTaskPayload.data.id}`
});
assert.equal(afterDeleteConflictTaskResponse.statusCode, 200);
assert.equal(afterDeleteConflictTaskResponse.json().data.drafts[0].conflicts.length, 1);
assert.equal(afterDeleteConflictTaskResponse.json().data.drafts[0].metrics.some((metric: Row) => metric.metricKey === 'metric_to_delete'), false);

const resolveConflictResponse = await app.inject({
  method: 'PATCH',
  url: `/api/ocr/tasks/${createTaskPayload.data.id}/drafts/${editableDraft.draftId}/conflicts/acth`,
  payload: {
    selectedCandidateIndex: 0
  }
});
assert.equal(resolveConflictResponse.statusCode, 200);
assert.equal(resolveConflictResponse.json().data.status, 'resolved');

const afterResolveTaskResponse = await app.inject({
  method: 'GET',
  url: `/api/ocr/tasks/${createTaskPayload.data.id}`
});
assert.equal(afterResolveTaskResponse.statusCode, 200);
assert.equal(afterResolveTaskResponse.json().data.drafts[0].conflicts.length, 0);
await Promise.all(afterResolveTaskResponse.json().data.drafts.map((draft: Row) => app.inject({
  method: 'PATCH',
  url: `/api/ocr/tasks/${createTaskPayload.data.id}/drafts/${draft.draftId}`,
  payload: {
    draft: {
      basicInfo: {
        ...draft.basicInfo,
        ocrReviewedAt: '2026-06-04T00:00:00.000Z',
        ocrReviewSource: 'edit_detail'
      }
    }
  }
})));

const saveResponse = await app.inject({
  method: 'POST',
  url: '/api/reports/batch-create',
  payload: {
    profileId,
    ocrTaskId: createTaskPayload.data.id
  }
});
assert.equal(saveResponse.statusCode, 200);
const savePayload = saveResponse.json();
assert.equal(savePayload.data.reports.length, 7);
assert.equal(prisma.reports.filter((report) => !report.deletedAt).length, 8);
const editableReport = prisma.reports.find((report) => report.draftId === editableDraft.draftId);
assert.ok(editableReport);
assert.equal(prisma.reportMetricValues.filter((metric) => metric.reportId === editableReport.id && metric.metricKey === 'acth').length, 1);

const deleteProfileWithReportsResponse = await app.inject({
  method: 'DELETE',
  url: `/api/profiles/${profileId}`
});
assert.equal(deleteProfileWithReportsResponse.statusCode, 409);
assert.equal(deleteProfileWithReportsResponse.json().error.code, 'CONFLICT');

const repeatSaveResponse = await app.inject({
  method: 'POST',
  url: '/api/reports/batch-create',
  payload: {
    profileId,
    ocrTaskId: createTaskPayload.data.id
  }
});
assert.equal(repeatSaveResponse.statusCode, 200);
assert.equal(repeatSaveResponse.json().data.reports.length, 7);
assert.equal(prisma.reports.filter((report) => !report.deletedAt).length, 8);

const listReportsResponse = await app.inject({
  method: 'GET',
  url: `/api/profiles/${profileId}/reports`
});
assert.equal(listReportsResponse.statusCode, 200);
const reportsPayload = listReportsResponse.json();
assert.equal(reportsPayload.data.length, 8);
const imagingReportFromList = reportsPayload.data.find((report: Row) => report.modality === 'imaging' && report.analysisPolicy === 'view_only');
assert.ok(imagingReportFromList);
assert.equal(imagingReportFromList.metrics.length, 0);
assert.ok(imagingReportFromList.findings.length > 0);

const imagingReportDetailResponse = await app.inject({
  method: 'GET',
  url: `/api/reports/${imagingReportFromList.id}`
});
assert.equal(imagingReportDetailResponse.statusCode, 200);
const imagingReportDetail = imagingReportDetailResponse.json().data;
assert.equal(imagingReportDetail.report.id, imagingReportFromList.id);
assert.equal(imagingReportDetail.report.modality, 'imaging');
assert.equal(imagingReportDetail.report.analysisPolicy, 'view_only');
assert.equal(imagingReportDetail.report.metrics.length, 0);
assert.equal(imagingReportDetail.groups.length, 0);
assert.ok(imagingReportDetail.report.findings.length > 0);

const firstReportId = reportsPayload.data[0].id;
const reportDetailResponse = await app.inject({
  method: 'GET',
  url: `/api/reports/${firstReportId}`
});
assert.equal(reportDetailResponse.statusCode, 200);
const reportDetailPayload = reportDetailResponse.json();
assert.equal(reportDetailPayload.data.report.id, firstReportId);
assert.ok(Array.isArray(reportDetailPayload.data.groups));

const editableMetric = reportDetailPayload.data.report.metrics.find((metric: Row) => metric.valueType === 'quantitative');
let pendingManualMetricKey = '';
let pendingManualTextMetricKey = '';
if (editableMetric) {
  pendingManualMetricKey = `manual_backend_${Date.now()}`;
  pendingManualTextMetricKey = `manual_text_${Date.now()}`;
  const editedMetrics = reportDetailPayload.data.report.metrics.map((metric: Row) => (
    metric.id === editableMetric.id
      ? {
        ...metric,
        valueNumeric: Number(metric.refRangeHigh || 1) + 10,
        unit: 'edited-unit',
        isManuallyEdited: true
      }
      : metric
  )).concat([{
    metricKey: pendingManualMetricKey,
    metricName: 'Manual smoke metric',
    originalMetricName: 'Manual smoke metric',
    category: 'other',
    categoryCn: 'Other',
    mappingStatus: 'pending',
    valueType: 'quantitative',
    valueNumeric: 12,
    unit: 'ng/mL',
    refRangeLow: null,
    refRangeHigh: null,
    tone: 'unknown',
    isManuallyEdited: true
  }, {
    metricKey: pendingManualTextMetricKey,
    metricName: 'Manual text finding',
    originalMetricName: 'Manual text finding',
    category: 'other',
    categoryCn: 'Other',
    mappingStatus: 'pending',
    valueType: 'text',
    valueNumeric: null,
    valueQualitative: 'Manual text description',
    unit: '',
    refText: 'Text description',
    tone: 'unknown',
    isManuallyEdited: true
  }]);
  const editReportResponse = await app.inject({
    method: 'PATCH',
    url: `/api/reports/${firstReportId}`,
    payload: {
      basicInfo: {
        hospital: 'User Reviewed Hospital',
        reportDate: reportDetailPayload.data.report.reportDate,
        note: 'user checked'
      },
      metrics: editedMetrics,
      findings: reportDetailPayload.data.report.findings,
      warnings: reportDetailPayload.data.report.warnings
    }
  });
  assert.equal(editReportResponse.statusCode, 200);
  const editReportPayload = editReportResponse.json();
  assert.equal(editReportPayload.data.report.hospital, 'User Reviewed Hospital');
  assert.equal(editReportPayload.data.report.note, 'user checked');
  assert.ok(editReportPayload.data.report.abnormalCount >= 1);
  assert.ok(editReportPayload.data.report.metrics.some((metric: Row) => metric.id === editableMetric.id && metric.isManuallyEdited));
  assert.ok(editReportPayload.data.report.metrics.some((metric: Row) => metric.id === editableMetric.id && metric.unit === 'edited-unit'));
  assert.ok(editReportPayload.data.report.metrics.some((metric: Row) => metric.metricKey === pendingManualMetricKey && metric.unit === 'ng/mL'));
  assert.ok(editReportPayload.data.report.metrics.some((metric: Row) => metric.metricKey === pendingManualTextMetricKey && metric.valueType === 'text' && metric.valueQualitative === 'Manual text description'));
  const deleteManualMetricResponse = await app.inject({
    method: 'PATCH',
    url: `/api/reports/${firstReportId}`,
    payload: {
      basicInfo: {
        hospital: editReportPayload.data.report.hospital,
        reportDate: editReportPayload.data.report.reportDate,
        note: editReportPayload.data.report.note
      },
      metrics: editReportPayload.data.report.metrics.filter((metric: Row) => metric.metricKey !== pendingManualMetricKey),
      findings: editReportPayload.data.report.findings,
      warnings: editReportPayload.data.report.warnings
    }
  });
  assert.equal(deleteManualMetricResponse.statusCode, 200);
  const deleteManualMetricPayload = deleteManualMetricResponse.json();
  assert.ok(!deleteManualMetricPayload.data.report.metrics.some((metric: Row) => metric.metricKey === pendingManualMetricKey));
  assert.ok(deleteManualMetricPayload.data.report.metrics.some((metric: Row) => metric.metricKey === pendingManualTextMetricKey && metric.mappingStatus === 'pending'));
  if (reportDetailPayload.data.report.metrics.length > 1) {
    assert.ok(editReportPayload.data.report.metrics.some((metric: Row) => metric.id !== editableMetric.id && !metric.isManuallyEdited));
  }
}

const snapshotsResponse = await app.inject({
  method: 'GET',
  url: `/api/profiles/${profileId}/metrics/snapshots`
});
assert.equal(snapshotsResponse.statusCode, 200);
const snapshotsPayload = snapshotsResponse.json();
assert.ok(snapshotsPayload.data.some((snapshot: Row) => snapshot.metricKey === 'acth'));
assert.ok(!snapshotsPayload.data.some((snapshot: Row) => snapshot.lastReportId === imagingReportFromList.id));
if (pendingManualTextMetricKey) {
  assert.ok(!snapshotsPayload.data.some((snapshot: Row) => snapshot.metricKey === pendingManualTextMetricKey));
}

const historyResponse = await app.inject({
  method: 'GET',
  url: `/api/profiles/${profileId}/metrics/acth/history`
});
assert.equal(historyResponse.statusCode, 200);
const historyPayload = historyResponse.json();
assert.equal(historyPayload.data.metricKey, 'acth');
assert.ok(historyPayload.data.history.length >= 1);

const unknownPinResponse = await app.inject({
  method: 'PATCH',
  url: `/api/profiles/${profileId}/metrics/unknown_metric/pin`,
  payload: {
    isPinned: true
  }
});
assert.equal(unknownPinResponse.statusCode, 404);
assert.equal(unknownPinResponse.json().error.code, 'NOT_FOUND');

const pinResponse = await app.inject({
  method: 'PATCH',
  url: `/api/profiles/${profileId}/metrics/acth/pin`,
  payload: {
    isPinned: true
  }
});
assert.equal(pinResponse.statusCode, 200);
assert.equal(pinResponse.json().data.isPinned, true);
const pinnedSnapshotRow = prisma.userMetricSnapshots.find((snapshot) => snapshot.profileId === profileId && snapshot.metricKey === 'acth');
assert.ok(pinnedSnapshotRow);
assert.ok(pinnedSnapshotRow.lastDate instanceof Date, 'pinned metric snapshots should persist dates as Date values');

const secondTaskResponse = await app.inject({
  method: 'POST',
  url: '/api/ocr/tasks',
  payload: {
    profileId,
    fixtureCaseIds: ['acth', 'thyroid', 'cortisol', 'liver_function', 'uric_electrolyte_lipid', 'chest_ct_plain', 'abdomen_pelvis_ct_plain']
  }
});
assert.equal(secondTaskResponse.statusCode, 200);
const secondTaskPayload = secondTaskResponse.json();

const duplicateResponse = await app.inject({
  method: 'POST',
  url: '/api/reports/duplicate-check',
  payload: {
    profileId,
    ocrTaskId: secondTaskPayload.data.id
  }
});
assert.equal(duplicateResponse.statusCode, 200);
const duplicatePayload = duplicateResponse.json();
assert.equal(duplicatePayload.data.hasDuplicates, true);
assert.equal(duplicatePayload.data.candidates.length, 7);
await Promise.all(secondTaskPayload.data.drafts.map((draft: Row) => app.inject({
  method: 'PATCH',
  url: `/api/ocr/tasks/${secondTaskPayload.data.id}/drafts/${draft.draftId}`,
  payload: {
    draft: {
      basicInfo: {
        ...draft.basicInfo,
        ocrReviewedAt: '2026-06-04T00:00:00.000Z',
        ocrReviewSource: 'edit_detail'
      }
    }
  }
})));

const blockedSaveResponse = await app.inject({
  method: 'POST',
  url: '/api/reports/batch-create',
  payload: {
    profileId,
    ocrTaskId: secondTaskPayload.data.id
  }
});
assert.equal(blockedSaveResponse.statusCode, 409);
assert.equal(blockedSaveResponse.json().error.code, 'DUPLICATE_REPORT_REQUIRES_DECISION');

const invalidDuplicateDecisionResponse = await app.inject({
  method: 'POST',
  url: '/api/reports/batch-create',
  payload: {
    profileId,
    ocrTaskId: secondTaskPayload.data.id,
    duplicateDecisions: duplicatePayload.data.candidates.map((candidate: Row, index: number) => ({
      draftId: candidate.draftId,
      decision: index === 0 ? 'replace' : 'skip',
      existingReportId: index === 0 ? '00000000-0000-4000-8000-000000000000' : candidate.existingReportId
    }))
  }
});
assert.equal(invalidDuplicateDecisionResponse.statusCode, 400);
assert.equal(invalidDuplicateDecisionResponse.json().error.code, 'INVALID_DUPLICATE_DECISION');

const skipSaveResponse = await app.inject({
  method: 'POST',
  url: '/api/reports/batch-create',
  payload: {
    profileId,
    ocrTaskId: secondTaskPayload.data.id,
    duplicateDecisions: duplicatePayload.data.candidates.map((candidate: Row) => ({
      draftId: candidate.draftId,
      decision: 'skip',
      existingReportId: candidate.existingReportId
    }))
  }
});
assert.equal(skipSaveResponse.statusCode, 200);
assert.equal(skipSaveResponse.json().data.reports.length, 0);
assert.equal(prisma.reports.filter((report) => !report.deletedAt).length, 8);

const replaceTaskResponse = await app.inject({
  method: 'POST',
  url: '/api/ocr/tasks',
  payload: {
    profileId,
    fixtureCaseIds: ['acth']
  }
});
assert.equal(replaceTaskResponse.statusCode, 200);
const replaceDuplicateResponse = await app.inject({
  method: 'POST',
  url: '/api/reports/duplicate-check',
  payload: {
    profileId,
    ocrTaskId: replaceTaskResponse.json().data.id
  }
});
assert.equal(replaceDuplicateResponse.statusCode, 200);
const replaceCandidate = replaceDuplicateResponse.json().data.candidates[0];
const replaceSaveResponse = await app.inject({
  method: 'POST',
  url: '/api/reports/batch-create',
  payload: {
    profileId,
    ocrTaskId: replaceTaskResponse.json().data.id,
    duplicateDecisions: [{
      draftId: replaceCandidate.draftId,
      decision: 'replace',
      existingReportId: replaceCandidate.existingReportId
    }]
  }
});
assert.equal(replaceSaveResponse.statusCode, 200);
assert.equal(replaceSaveResponse.json().data.reports[0].action, 'replaced');
assert.equal(prisma.reports.filter((report) => !report.deletedAt).length, 8);

const scopedProfileResponse = await app.inject({
  method: 'POST',
  url: '/api/profiles',
  payload: {
    relation: 'scope',
    realName: 'Scoped Save',
    gender: '',
    diseaseType: '',
    primaryHospital: 'Union Hospital'
  }
});
assert.equal(scopedProfileResponse.statusCode, 200);
const scopedProfileId = scopedProfileResponse.json().data.id;
const scopedTaskResponse = await app.inject({
  method: 'POST',
  url: '/api/ocr/tasks',
  payload: {
    profileId: scopedProfileId,
    fixtureCaseIds: ['acth']
  }
});
assert.equal(scopedTaskResponse.statusCode, 200);
const scopedSaveResponse = await app.inject({
  method: 'POST',
  url: '/api/reports/batch-create',
  payload: {
    ocrTaskId: scopedTaskResponse.json().data.id
  }
});
assert.equal(scopedSaveResponse.statusCode, 200);
assert.equal(scopedSaveResponse.json().data.reports.length, 1);
assert.equal(prisma.reports.filter((report) => report.profileId === scopedProfileId && !report.deletedAt).length, 1);
assert.equal(prisma.reports.filter((report) => report.profileId === profileId && !report.deletedAt).length, 8);

const bloodRoutineProfileResponse = await app.inject({
  method: 'POST',
  url: '/api/profiles',
  payload: {
    relation: 'ocr-save',
    realName: 'Deidentified Blood Routine',
    gender: '',
    diseaseType: '',
    primaryHospital: 'Synthetic Hospital'
  }
});
assert.equal(bloodRoutineProfileResponse.statusCode, 200);
const bloodRoutineProfileId = bloodRoutineProfileResponse.json().data.id;
const bloodRoutineRawDraft = draftFromRawOcr([
  '去标识化社区医院血常规报告单',
  '姓名：测试者 科室：内科 样本编号：2 检验时间：2025/08/25 08:32',
  '报告名称：血常规',
  '1 WBC 4.30 3.50-9.50 10^9/L 18 RBC 3.75 ↓ 3.80-5.10 10^12/L',
  '2 Neu% 80.4 ↑ 40.0-75.0 % 19 HGB 121 115-150 g/L',
  '3 Lym% 12.9 ↓ 20.0-50.0 % 20 HCT 37.5 35.0-45.0 %',
  '4 Mon% 4.5 3.0-10.0 % 21 MCV 99.8 82.0-100.0 fL',
  '5 Eos% 2.1 0.4-8.0 % 22 MCH 32.1 27.0-34.0 pg',
  '6 Bas% 0.1 0.0-1.0 % 23 MCHC 322 316-354 g/L',
  '7 Neu# 3.46 1.80-6.30 10^9/L 24 RDW 13.2 11.0-16.0 %',
  '8 Lym# 0.56 ↓ 1.10-3.20 10^9/L 25 RDW-SD 48.2 35.0-56.0 fL',
  '9 Mon# 0.19 0.10-0.60 10^9/L 26 PLT 123 ↓ 125-350 10^9/L',
  '10 Eos# 0.09 0.02-0.52 10^9/L 27 MPV 9.2 6.5-12.0 fL',
  '11 Bas# 0.00 0.00-0.06 10^9/L 28 PDW 10.7 9.0-17.0 fL',
  '12 ALY# 0.00 0.00-0.20 10^9/L 29 PCT 0.113 0.108-0.282 %',
  '13 ALY% 0.0 0.0-2.0 % 30 P-LCR 21.3 11.0-45.0 %',
  '14 LIC# 0.00 0.00-0.20 10^9/L',
  '15 LIC% 0.0 0.0-2.5 %',
  '16 NRBC# 0.000 0.000-9999.999 10^9/L',
  '17 NRBC% 0.00 0.00-9999.99 %',
  '31 P-LCC 26 ↓ 30-90 10^9/L'
].join('\n'), {
  groupId: 'deidentified_blood_routine_group',
  photos: [{ photoId: 'deidentified_blood_routine_photo' }]
});
assert.equal(bloodRoutineRawDraft.status, 'needs_review');
assert.equal(bloodRoutineRawDraft.metrics.length, 31);
const expectedBloodRoutineMetricKeys = [
  'wbc',
  'rbc',
  'neu_percent',
  'hgb',
  'lym_percent',
  'hct',
  'mon_percent',
  'mcv',
  'eos_percent',
  'mch',
  'bas_percent',
  'mchc',
  'neu_abs',
  'rdw_cv',
  'lym_abs',
  'rdw_sd',
  'mon_abs',
  'plt',
  'eos_abs',
  'mpv',
  'bas_abs',
  'pdw',
  'aly_abs',
  'pct',
  'aly_percent',
  'p_lcr',
  'lic_abs',
  'lic_percent',
  'nrbc_abs',
  'nrbc_percent',
  'p_lcc'
];
assert.deepEqual(bloodRoutineRawDraft.metrics.map((metric) => metric.metricKey), expectedBloodRoutineMetricKeys);
const bloodRoutineTask = await prisma.ocrTask.create({
  data: {
    profileId: bloodRoutineProfileId,
    userId: loginPayload.data.userId,
    status: 'ready_to_save',
    photoCount: 1,
    reportCount: 1
  }
});
await prisma.recognizedReportDraft.createMany({
  data: [{
    ocrTaskId: bloodRoutineTask.id,
    profileId: bloodRoutineProfileId,
    sourcePhotoIds: ['deidentified_blood_routine_photo'],
    pageCount: 1,
    basicInfo: {
      ...(bloodRoutineRawDraft.basicInfo as Row),
      ocrReviewedAt: '2026-06-04T00:00:00.000Z',
      ocrReviewSource: 'edit_detail'
    },
    metrics: bloodRoutineRawDraft.metrics,
    findings: bloodRoutineRawDraft.findings,
    conflicts: bloodRoutineRawDraft.conflicts,
    warnings: bloodRoutineRawDraft.warnings,
    status: bloodRoutineRawDraft.status
  }]
});
const bloodRoutineSaveResponse = await app.inject({
  method: 'POST',
  url: '/api/reports/batch-create',
  payload: {
    profileId: bloodRoutineProfileId,
    ocrTaskId: bloodRoutineTask.id
  }
});
assert.equal(bloodRoutineSaveResponse.statusCode, 200);
assert.equal(bloodRoutineSaveResponse.json().data.reports.length, 1);
const bloodRoutineReportsResponse = await app.inject({
  method: 'GET',
  url: `/api/profiles/${bloodRoutineProfileId}/reports`
});
assert.equal(bloodRoutineReportsResponse.statusCode, 200);
const bloodRoutineSavedReport = bloodRoutineReportsResponse.json().data[0];
assert.equal(bloodRoutineSavedReport.typeKey, 'blood_routine');
assert.equal(bloodRoutineSavedReport.metrics.length, 31);
assert.equal(bloodRoutineSavedReport.abnormalCount, 6);
const bloodRoutineSavedMetricsByKey = new Map(bloodRoutineSavedReport.metrics.map((metric: Row) => [metric.metricKey, metric]));
assert.deepEqual(
  [...bloodRoutineSavedReport.metrics.map((metric: Row) => metric.metricKey)].sort(),
  [...expectedBloodRoutineMetricKeys].sort()
);
assert.equal(bloodRoutineSavedMetricsByKey.get('wbc')?.tone, 'ok');
assert.equal(bloodRoutineSavedMetricsByKey.get('rbc')?.tone, 'low');
assert.equal(bloodRoutineSavedMetricsByKey.get('neu_percent')?.tone, 'high');
assert.equal(bloodRoutineSavedMetricsByKey.get('rdw_cv')?.tone, 'ok');
assert.equal(bloodRoutineSavedMetricsByKey.get('rdw_sd')?.tone, 'ok');
assert.equal(bloodRoutineSavedMetricsByKey.get('p_lcr')?.tone, 'ok');
assert.equal(bloodRoutineSavedMetricsByKey.get('p_lcc')?.tone, 'low');
assert.equal(bloodRoutineSavedMetricsByKey.has('p-lcc'), false);
assert.equal(bloodRoutineSavedMetricsByKey.has('rd'), false);
assert.equal(bloodRoutineSavedMetricsByKey.has('rdw'), false);
const bloodRoutineSnapshotsResponse = await app.inject({
  method: 'GET',
  url: `/api/profiles/${bloodRoutineProfileId}/metrics/snapshots`
});
assert.equal(bloodRoutineSnapshotsResponse.statusCode, 200);
const bloodRoutineSnapshots = bloodRoutineSnapshotsResponse.json().data;
assert.equal(bloodRoutineSnapshots.length, 31);
const bloodRoutineSnapshotsByKey = new Map(bloodRoutineSnapshots.map((snapshot: Row) => [snapshot.metricKey, snapshot]));
assert.deepEqual(
  [...bloodRoutineSnapshots.map((snapshot: Row) => snapshot.metricKey)].sort(),
  [...expectedBloodRoutineMetricKeys].sort()
);
assert.equal(bloodRoutineSnapshotsByKey.get('rbc')?.lastTone, 'low');
assert.equal(bloodRoutineSnapshotsByKey.get('rdw_cv')?.lastTone, 'ok');
assert.equal(bloodRoutineSnapshotsByKey.get('rdw_sd')?.lastTone, 'ok');
assert.equal(bloodRoutineSnapshotsByKey.get('p_lcr')?.lastTone, 'ok');
assert.equal(bloodRoutineSnapshotsByKey.get('p_lcc')?.lastTone, 'low');
assert.equal(bloodRoutineSnapshotsByKey.has('p-lcc'), false);
assert.equal(bloodRoutineSnapshotsByKey.has('rd'), false);
assert.equal(bloodRoutineSnapshotsByKey.has('rdw'), false);

const createManualTemplateResponse = await app.inject({
  method: 'POST',
  url: `/api/profiles/${profileId}/manual-templates`,
  payload: {
    metricKey: 'manual_drug_level',
    metricName: 'Manual drug level',
    category: 'lab',
    categoryCn: 'Lab',
    valueType: 'quantitative',
    unit: 'ng/mL',
    refRangeLow: 5,
    refRangeHigh: 20
  }
});
assert.equal(createManualTemplateResponse.statusCode, 200);
assert.equal(createManualTemplateResponse.json().data.metricKey, 'manual_drug_level');
assert.equal(prisma.manualEntryTemplates.length, 1);

const updateManualTemplateResponse = await app.inject({
  method: 'POST',
  url: `/api/profiles/${profileId}/manual-templates`,
  payload: {
    metricKey: 'manual_drug_level',
    metricName: 'Manual drug level',
    category: 'lab',
    categoryCn: 'Lab',
    valueType: 'quantitative',
    unit: 'ng/mL',
    refRangeLow: 6,
    refRangeHigh: 18
  }
});
assert.equal(updateManualTemplateResponse.statusCode, 200);
assert.equal(updateManualTemplateResponse.json().data.refRangeLow, 6);
assert.equal(prisma.manualEntryTemplates.length, 1);

const listManualTemplatesResponse = await app.inject({
  method: 'GET',
  url: `/api/profiles/${profileId}/manual-templates`
});
assert.equal(listManualTemplatesResponse.statusCode, 200);
assert.equal(listManualTemplatesResponse.json().data.length, 1);

const archiveManualTemplateResponse = await app.inject({
  method: 'DELETE',
  url: `/api/profiles/${profileId}/manual-templates/manual_drug_level`
});
assert.equal(archiveManualTemplateResponse.statusCode, 200);
const listAfterArchiveManualTemplatesResponse = await app.inject({
  method: 'GET',
  url: `/api/profiles/${profileId}/manual-templates`
});
assert.equal(listAfterArchiveManualTemplatesResponse.statusCode, 200);
assert.equal(listAfterArchiveManualTemplatesResponse.json().data.length, 0);

const complexReferenceText = 'Female 0-1y <=1300; 2-4y <=350; luteal <2700';
const createComplexManualTemplateResponse = await app.inject({
  method: 'POST',
  url: `/api/profiles/${profileId}/manual-templates`,
  payload: {
    metricKey: 'manual_complex_progesterone',
    metricName: 'Manual progesterone',
    category: 'lab',
    categoryCn: 'Lab',
    valueType: 'quantitative',
    unit: 'pg/mL',
    refText: complexReferenceText
  }
});
assert.equal(createComplexManualTemplateResponse.statusCode, 200);
assert.equal(createComplexManualTemplateResponse.json().data.refRangeLow, null);
assert.equal(createComplexManualTemplateResponse.json().data.refRangeHigh, null);
assert.equal(createComplexManualTemplateResponse.json().data.refText, complexReferenceText);

const manualReportResponse = await app.inject({
  method: 'POST',
  url: `/api/profiles/${profileId}/manual-reports`,
  payload: {
    reportDate: '2026-05-20',
    hospital: 'Manual Hospital',
    note: 'manual smoke',
    metric: {
      metricKey: 'manual_drug_level',
      metricName: 'Manual drug level',
      originalMetricName: 'Manual drug level',
      category: 'custom',
      categoryCn: 'Custom',
      valueType: 'quantitative',
      valueNumeric: 12.5,
      unit: 'ng/mL',
      refRangeLow: 5,
      refRangeHigh: 20,
      mappingStatus: 'confirmed',
      isManuallyEdited: true
    }
  }
});
assert.equal(manualReportResponse.statusCode, 200);
const manualReportPayload = manualReportResponse.json();
assert.equal(manualReportPayload.data.report.type, 'Custom');
assert.ok(manualReportPayload.data.report.metrics.some((metric: Row) => metric.metricKey === 'manual_drug_level' && metric.unit === 'ng/mL'));

const complexManualReportResponse = await app.inject({
  method: 'POST',
  url: `/api/profiles/${profileId}/manual-reports`,
  payload: {
    reportDate: '2026-05-21',
    hospital: 'Manual Hospital',
    note: 'manual complex reference smoke',
    metric: {
      metricKey: 'manual_complex_progesterone',
      metricName: 'Manual progesterone',
      originalMetricName: 'Manual progesterone',
      category: 'custom',
      categoryCn: 'Custom',
      valueType: 'quantitative',
      valueNumeric: 104,
      unit: 'pg/mL',
      refText: complexReferenceText,
      tone: 'high',
      mappingStatus: 'confirmed',
      isManuallyEdited: true
    }
  }
});
assert.equal(complexManualReportResponse.statusCode, 200);
const complexManualReportPayload = complexManualReportResponse.json();
const complexManualMetric = complexManualReportPayload.data.report.metrics.find((metric: Row) => metric.metricKey === 'manual_complex_progesterone');
assert.equal(complexManualMetric?.refRangeLow, null);
assert.equal(complexManualMetric?.refRangeHigh, null);
assert.equal(complexManualMetric?.refText, complexReferenceText);
assert.equal(complexManualMetric?.tone, 'high');
assert.equal(complexManualReportPayload.data.report.abnormalCount, 1);

const pendingCatalogMetricKey = `pending_catalog_${Date.now()}`;
const pendingCatalogReportResponse = await app.inject({
  method: 'POST',
  url: `/api/profiles/${profileId}/manual-reports`,
  payload: {
    reportDate: '2026-05-22',
    hospital: 'Pending Catalog Hospital',
    note: 'pending catalog smoke',
    metric: {
      metricKey: pendingCatalogMetricKey,
      metricName: 'Pending catalog metric',
      originalMetricName: 'Pending catalog metric',
      category: 'lab',
      categoryCn: 'Lab',
      valueType: 'quantitative',
      valueNumeric: 22.54,
      unit: 'mmol/24h',
      refText: '<30',
      tone: 'low',
      mappingStatus: 'pending',
      isManuallyEdited: true
    }
  }
});
assert.equal(pendingCatalogReportResponse.statusCode, 200);
assert.equal(pendingCatalogReportResponse.json().data.report.metrics[0].mappingStatus, 'pending');

const pendingCatalogSnapshotsResponse = await app.inject({
  method: 'GET',
  url: `/api/profiles/${profileId}/metrics/snapshots?filter=abnormal`
});
assert.equal(pendingCatalogSnapshotsResponse.statusCode, 200);
assert.ok(pendingCatalogSnapshotsResponse.json().data.some((metric: Row) => metric.metricKey === pendingCatalogMetricKey && metric.lastTone === 'low'));

const pendingMetricCandidatesResponse = await app.inject({
  method: 'GET',
  url: `/api/profiles/${profileId}/metrics/pending-candidates`
});
assert.equal(pendingMetricCandidatesResponse.statusCode, 200);
const pendingMetricCandidate = pendingMetricCandidatesResponse.json().data.find((candidate: Row) => candidate.metricKeys.includes(pendingCatalogMetricKey));
assert.ok(pendingMetricCandidate);
assert.equal(pendingMetricCandidate.occurrenceCount, 1);
assert.equal(pendingMetricCandidate.abnormalCount, 1);
assert.equal(pendingMetricCandidate.examples[0].metricKey, pendingCatalogMetricKey);

const futureManualReportResponse = await app.inject({
  method: 'POST',
  url: `/api/profiles/${profileId}/manual-reports`,
  payload: {
    reportDate: '2028-11-25',
    hospital: 'Future Hospital',
    metric: {
      metricKey: 'manual_future_metric',
      metricName: 'Manual future metric',
      category: 'custom',
      categoryCn: 'Custom',
      valueType: 'quantitative',
      valueNumeric: 30,
      unit: 'ng/mL',
      refRangeLow: 5,
      refRangeHigh: 20,
      mappingStatus: 'confirmed'
    }
  }
});
assert.equal(futureManualReportResponse.statusCode, 200);
const rangedReportsResponse = await app.inject({
  method: 'GET',
  url: `/api/profiles/${profileId}/reports?since=2026-05-01&until=2026-06-01`
});
assert.equal(rangedReportsResponse.statusCode, 200);
const rangedReportsPayload = rangedReportsResponse.json();
assert.ok(rangedReportsPayload.data.some((report: Row) => report.id === manualReportPayload.data.report.id));
assert.ok(!rangedReportsPayload.data.some((report: Row) => report.id === futureManualReportResponse.json().data.report.id));
const rangedMetricResponse = await app.inject({
  method: 'GET',
  url: `/api/profiles/${profileId}/metrics/snapshots?since=2026-05-01&until=2026-06-01`
});
assert.equal(rangedMetricResponse.statusCode, 200);
const rangedMetricPayload = rangedMetricResponse.json();
assert.ok(rangedMetricPayload.data.some((metric: Row) => metric.metricKey === 'manual_drug_level'));
assert.ok(!rangedMetricPayload.data.some((metric: Row) => metric.metricKey === 'manual_future_metric'));
const manualPinResponse = await app.inject({
  method: 'PATCH',
  url: `/api/profiles/${profileId}/metrics/manual_drug_level/pin`,
  payload: {
    isPinned: true
  }
});
assert.equal(manualPinResponse.statusCode, 200);
assert.equal(manualPinResponse.json().data.isPinned, true);

const deleteReportResponse = await app.inject({
  method: 'DELETE',
  url: `/api/reports/${firstReportId}`
});
assert.equal(deleteReportResponse.statusCode, 200);
const afterDeleteListResponse = await app.inject({
  method: 'GET',
  url: `/api/profiles/${profileId}/reports`
});
assert.equal(afterDeleteListResponse.statusCode, 200);
assert.ok(!afterDeleteListResponse.json().data.some((report: Row) => report.id === firstReportId));

const createExportResponse = await app.inject({
  method: 'POST',
  url: `/api/profiles/${profileId}/exports`,
  payload: {
    includeReports: true,
    includeMetrics: true,
    includeRecheckPlans: true,
    format: 'json'
  }
});
assert.equal(createExportResponse.statusCode, 200);
const exportPayload = createExportResponse.json().data;
assert.equal(exportPayload.status, 'ready');
assert.ok(exportPayload.downloadUrl.includes(`/api/exports/${exportPayload.exportId}/download`));
const getExportResponse = await app.inject({
  method: 'GET',
  url: `/api/exports/${exportPayload.exportId}`
});
assert.equal(getExportResponse.statusCode, 200);
assert.equal(getExportResponse.json().data.fileName, exportPayload.fileName);
const downloadExportResponse = await app.inject({
  method: 'GET',
  url: exportPayload.downloadUrl
});
assert.equal(downloadExportResponse.statusCode, 200);
const downloadedExport = JSON.parse(downloadExportResponse.body);
assert.equal(downloadedExport.profile.id, profileId);
assert.ok(Array.isArray(downloadedExport.reports));
assert.ok(Array.isArray(downloadedExport.recheckPlans));

await app.close();

console.log('Backend smoke passed: auth, profile CRUD, upload sign/complete, recheck plans, OCR task list/cancel, fixture OCR draft edit, report save/read/edit/delete, duplicate check, and export routes');
