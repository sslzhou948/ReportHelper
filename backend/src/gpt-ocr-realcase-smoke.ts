import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { parseDotEnv, type Env } from './config/env.js';
import { MemoryPrisma } from './testing/memory-prisma.js';

type ManifestCase = {
  id: string;
  file: string;
  modality: 'laboratory' | 'imaging' | 'electrophysiology' | 'pathology' | 'other';
  expectedGolden?: string;
};

type Manifest = {
  sourceDir: string;
  cases: ManifestCase[];
};

type Row = Record<string, any>;
type GoldenCase = {
  caseId: string;
  status: string;
  modality: string;
  basicInfo?: Record<string, unknown>;
  metrics?: Row[];
  findings?: string[];
};

type BasicInfoDiff = {
  field: string;
  expected: unknown;
  actual: unknown;
};

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(scriptDir, '..');
const workspaceRoot = path.resolve(backendRoot, '..');
const defaultStorageDir = path.join(workspaceRoot, 'tmp', 'gpt-ocr-realcase-object-storage');

function readLocalEnv() {
  const envPath = path.join(backendRoot, '.env');
  if (!fs.existsSync(envPath)) return {};
  return parseDotEnv(fs.readFileSync(envPath, 'utf8'));
}

function getEnvValue(key: string, fallback = '') {
  const fileEnv = readLocalEnv();
  return process.env[key] || fileEnv[key] || fallback;
}

const manifestPath = path.resolve(
  workspaceRoot,
  getEnvValue('REALCASE_MANIFEST', path.join('tests', 'fixtures', 'realtestcase', 'manifest.json'))
);

function buildSmokeEnv(): Env {
  return {
    DATABASE_URL: getEnvValue('DATABASE_URL', 'postgresql://gpt-smoke:gpt-smoke@localhost:5432/gpt-smoke'),
    JWT_SECRET: getEnvValue('JWT_SECRET', 'gpt-smoke-secret-1234567890'),
    WECHAT_APP_ID: getEnvValue('WECHAT_APP_ID', 'gpt-smoke-app-id'),
    WECHAT_APP_SECRET: getEnvValue('WECHAT_APP_SECRET', 'gpt-smoke-secret'),
    NODE_ENV: 'test',
    PORT: Number(getEnvValue('PORT', '8787')),
    BACKEND_PUBLIC_BASE_URL: getEnvValue('BACKEND_PUBLIC_BASE_URL', 'http://127.0.0.1:8787'),
    UPLOAD_STORAGE_PROVIDER: 'local',
    ALLOW_LOCAL_UPLOAD_STORAGE_IN_PRODUCTION: false,
    LOCAL_OBJECT_STORAGE_DIR: getEnvValue('LOCAL_OBJECT_STORAGE_DIR', defaultStorageDir),
    OCR_PROVIDER: getEnvValue('OCR_PROVIDER', 'gpt_vision') as Env['OCR_PROVIDER'],
    OCR_FALLBACK_PROVIDER: getEnvValue('OCR_FALLBACK_PROVIDER', 'none') as Env['OCR_FALLBACK_PROVIDER'],
    OPENAI_API_KEY: getEnvValue('OPENAI_API_KEY'),
    OPENAI_OCR_MODEL: getEnvValue('OPENAI_OCR_MODEL', 'gpt-4.1-mini'),
    OPENAI_API_BASE_URL: getEnvValue('OPENAI_API_BASE_URL', 'https://api.openai.com/v1'),
    OCR_FALLBACK_API_KEY: getEnvValue('OCR_FALLBACK_API_KEY'),
    OCR_FALLBACK_OCR_MODEL: getEnvValue('OCR_FALLBACK_OCR_MODEL', 'gpt-4.1-mini'),
    OCR_FALLBACK_API_BASE_URL: getEnvValue('OCR_FALLBACK_API_BASE_URL', 'https://api.openai.com/v1'),
    OCR_MAX_RETRIES: Number(getEnvValue('OCR_MAX_RETRIES', '1')),
    OCR_RETRY_BASE_MS: Number(getEnvValue('OCR_RETRY_BASE_MS', '250')),
    OCR_GROUP_CONCURRENCY: Number(getEnvValue('OCR_GROUP_CONCURRENCY', '2')),
    OCR_REQUEST_TIMEOUT_MS: Number(getEnvValue('OCR_REQUEST_TIMEOUT_MS', '240000')),
    OCR_MAX_OUTPUT_TOKENS: Number(getEnvValue('OCR_MAX_OUTPUT_TOKENS', '6000'))
  };
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  const text = await fsp.readFile(filePath, 'utf8');
  return JSON.parse(text.replace(/^\uFEFF/, '')) as T;
}

function multipartImagePayload(fieldName: string, fileName: string, contentType: string, bytes: Buffer) {
  const boundary = `----healthhelper-realcase-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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

function mimeTypeFor(fileName: string) {
  const extension = path.extname(fileName).toLowerCase();
  if (extension === '.png') return 'image/png';
  if (extension === '.webp') return 'image/webp';
  return 'image/jpeg';
}

function selectCases(manifest: Manifest) {
  const requested = process.env.REALCASE_IDS || process.env.REALCASE_ID || 'acth';
  if (requested === 'all') return manifest.cases;

  const ids = requested.split(',').map((item) => item.trim()).filter(Boolean);
  const selected = ids.map((id) => {
    const item = manifest.cases.find((candidate) => candidate.id === id);
    if (!item) throw new Error(`Unknown REALCASE id: ${id}`);
    return item;
  });
  return selected.length ? selected : manifest.cases.slice(0, 1);
}

function summarizeDraft(task: Row) {
  return task.drafts.map((draft: Row) => ({
    type: draft.basicInfo?.type,
    typeKey: draft.basicInfo?.typeKey,
    hospital: draft.basicInfo?.hospital,
    reportDate: draft.basicInfo?.reportDate,
    metrics: (draft.metrics || []).length,
    findings: (draft.findings || []).length,
    warnings: (draft.warnings || []).length
  }));
}

function normalizeText(value: unknown) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[()（）\[\]【】]/g, '')
    .replace(/μ/g, 'u')
    .replace(/µ/g, 'u')
    .replace(/协和医院/g, '北京协和医院')
    .trim();
}

function assertLooseText(actual: unknown, expected: unknown, label: string) {
  if (expected === undefined || expected === null || expected === '') return;
  const normalizedActual = normalizeText(actual);
  const normalizedExpected = normalizeText(expected);
  assert.ok(
    normalizedActual.includes(normalizedExpected) || normalizedExpected.includes(normalizedActual),
    `${label} mismatch: actual=${JSON.stringify(actual)}, expected=${JSON.stringify(expected)}`
  );
}

function looseTextMatches(actual: unknown, expected: unknown) {
  if (expected === undefined || expected === null || expected === '') return true;
  const normalizedActual = normalizeText(actual);
  const normalizedExpected = normalizeText(expected);
  return normalizedActual.includes(normalizedExpected) || normalizedExpected.includes(normalizedActual);
}

function collectBasicInfoDiffs(info: Row, expectedBasicInfo: Record<string, unknown> = {}) {
  const diffs: BasicInfoDiff[] = [];
  for (const [field, expectedValue] of Object.entries(expectedBasicInfo)) {
    if (expectedValue === undefined || expectedValue === null || expectedValue === '') continue;
    const actualValue = info[field];
    if (field === 'type') {
      if (!looseTextMatches(actualValue, expectedValue)) {
        diffs.push({ field, expected: expectedValue, actual: actualValue });
      }
      continue;
    }
    if (actualValue !== expectedValue) {
      diffs.push({ field, expected: expectedValue, actual: actualValue });
    }
  }
  return diffs;
}

function assertNumberClose(actual: unknown, expected: unknown, label: string) {
  if (expected === undefined || expected === null || expected === '') return;
  const actualNumber = Number(actual);
  const expectedNumber = Number(expected);
  assert.ok(Number.isFinite(actualNumber), `${label} should be numeric: ${JSON.stringify(actual)}`);
  assert.ok(Math.abs(actualNumber - expectedNumber) < 0.0001, `${label} mismatch: actual=${actualNumber}, expected=${expectedNumber}`);
}

function findMetric(metrics: Row[], expectedMetric: Row) {
  const expectedKey = normalizeText(expectedMetric.metricKey);
  const expectedName = normalizeText(expectedMetric.metricName);
  return metrics.find((metric) => normalizeText(metric.metricKey) === expectedKey)
    || metrics.find((metric) => expectedName && normalizeText(metric.metricName).includes(expectedName))
    || metrics.find((metric) => expectedName && expectedName.includes(normalizeText(metric.metricName)));
}

function assertGoldenMatches(item: ManifestCase, task: Row, golden: GoldenCase) {
  assert.equal(golden.caseId, item.id, `golden caseId mismatch for ${item.id}`);
  assert.equal(golden.modality, item.modality, `golden modality mismatch for ${item.id}`);
  assert.ok(task.drafts.length > 0, `Expected OCR drafts for ${item.id}`);
  const draft = task.drafts[0];
  const info = draft.basicInfo || {};
  assert.equal(info.modality, item.modality, `${item.id} modality mismatch`);
  const diffs = collectBasicInfoDiffs(info, golden.basicInfo);

  if (item.modality === 'laboratory') {
    const metrics = Array.isArray(draft.metrics) ? draft.metrics : [];
    assert.ok(metrics.length >= (golden.metrics || []).length, `${item.id} metric count too small: actual=${metrics.length}, expected>=${(golden.metrics || []).length}`);
    for (const expectedMetric of golden.metrics || []) {
      const metric = findMetric(metrics, expectedMetric);
      assert.ok(metric, `${item.id} missing metric ${expectedMetric.metricKey || expectedMetric.metricName}`);
      assertNumberClose(metric.valueNumeric, expectedMetric.valueNumeric, `${item.id} ${expectedMetric.metricKey}.valueNumeric`);
      assertLooseText(metric.unit, expectedMetric.unit, `${item.id} ${expectedMetric.metricKey}.unit`);
      assertNumberClose(metric.refRangeLow, expectedMetric.refRangeLow, `${item.id} ${expectedMetric.metricKey}.refRangeLow`);
      assertNumberClose(metric.refRangeHigh, expectedMetric.refRangeHigh, `${item.id} ${expectedMetric.metricKey}.refRangeHigh`);
      assert.equal(metric.tone, expectedMetric.tone, `${item.id} ${expectedMetric.metricKey}.tone mismatch`);
    }
  }

  if (item.modality === 'imaging') {
    const findings = Array.isArray(draft.findings) ? draft.findings.join('\n') : '';
    for (const expectedFinding of golden.findings || []) {
      assert.ok(
        normalizeText(findings).includes(normalizeText(expectedFinding)),
        `${item.id} missing finding: ${expectedFinding}`
      );
    }
  }

  return diffs;
}

function savePayload(profileId: string, taskId: string) {
  return {
    profileId,
    ocrTaskId: taskId
  };
}

function unreviewedDraftBlocks(response: Row) {
  const payload = response.json();
  if (payload?.error?.code !== 'UNREVIEWED_OCR_DRAFTS') return null;
  return Array.isArray(payload.error.details?.drafts) ? payload.error.details.drafts : [];
}

async function fetchOcrTask(app: ReturnType<typeof buildApp>, taskId: string) {
  const response = await app.inject({
    method: 'GET',
    url: `/api/ocr/tasks/${taskId}`
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.json().data as Row;
}

function needsBasicInfoPatch(value: unknown) {
  const text = String(value || '').trim();
  return !text || text === '待确认医院' || text === '待确认日期';
}

async function patchMissingBasicInfo(
  app: ReturnType<typeof buildApp>,
  task: Row,
  blockedDrafts: Row[],
  caseId: string,
  golden: GoldenCase | null
) {
  const draftById = new Map<string, Row>((task.drafts || []).map((draft: Row) => [String(draft.draftId || ''), draft]));
  for (const blocked of blockedDrafts) {
    assert.equal(blocked.reason, 'missing_basic_info', `${caseId} expected missing_basic_info but got ${blocked.reason}`);
    const draft = draftById.get(blocked.draftId);
    assert.ok(draft, `${caseId} blocked draft not found in OCR task: ${blocked.draftId}`);
    const basicInfo = { ...(draft.basicInfo || {}) };
    if (needsBasicInfoPatch(basicInfo.hospital)) {
      basicInfo.hospital = golden?.basicInfo?.hospital || '核查补充医院';
      basicInfo.hospitalSource = 'user_edited';
    }
    if (needsBasicInfoPatch(basicInfo.reportDate)) {
      basicInfo.reportDate = golden?.basicInfo?.reportDate || process.env.REALCASE_MANUAL_REPORT_DATE || '2025-08-25';
      basicInfo.reportDateSource = 'user_edited';
    }
    const patchResponse = await app.inject({
      method: 'PATCH',
      url: `/api/ocr/tasks/${task.id}/drafts/${blocked.draftId}`,
      payload: {
        draft: {
          basicInfo
        }
      }
    });
    assert.equal(patchResponse.statusCode, 200, patchResponse.body);
  }
}

async function patchGoldenBasicInfo(
  app: ReturnType<typeof buildApp>,
  task: Row,
  diffs: BasicInfoDiff[],
  caseId: string
) {
  if (!diffs.length) return task;
  const draft = (task.drafts || [])[0];
  assert.ok(draft?.draftId, `${caseId} cannot patch basicInfo without a draftId`);
  const basicInfo = { ...(draft.basicInfo || {}) };
  for (const diff of diffs) {
    basicInfo[diff.field] = diff.expected;
    if (diff.field === 'hospital') basicInfo.hospitalSource = 'user_edited';
    if (diff.field === 'reportDate') basicInfo.reportDateSource = 'user_edited';
  }
  const patchResponse = await app.inject({
    method: 'PATCH',
    url: `/api/ocr/tasks/${task.id}/drafts/${draft.draftId}`,
    payload: {
      draft: {
        basicInfo
      }
    }
  });
  assert.equal(patchResponse.statusCode, 200, patchResponse.body);
  return fetchOcrTask(app, task.id);
}

async function saveTaskAfterRequiredFixes(app: ReturnType<typeof buildApp>, profileId: string, task: Row, caseId: string, golden: GoldenCase | null) {
  let currentTask = task;
  const blockedReasonSet = new Set<string>();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const saveResponse = await app.inject({
      method: 'POST',
      url: '/api/reports/batch-create',
      payload: savePayload(profileId, currentTask.id)
    });
    if (saveResponse.statusCode === 200) {
      return {
        reports: saveResponse.json().data.reports as Row[],
        blockedBeforeSave: blockedReasonSet.size > 0,
        blockedReasons: Array.from(blockedReasonSet)
      };
    }

    assert.equal(saveResponse.statusCode, 409, saveResponse.body);
    const blockedDrafts = unreviewedDraftBlocks(saveResponse);
    assert.ok(blockedDrafts && blockedDrafts.length, `${caseId} save failed with an unexpected error: ${saveResponse.body}`);
    const blockedReasons: string[] = Array.from(new Set<string>(blockedDrafts.map((draft: Row) => String(draft.reason || 'unknown'))));
    blockedReasons.forEach((reason) => blockedReasonSet.add(reason));

    if (blockedReasons.length === 1 && blockedReasons[0] === 'missing_basic_info') {
      await patchMissingBasicInfo(app, currentTask, blockedDrafts, caseId, golden);
      currentTask = await fetchOcrTask(app, currentTask.id);
      continue;
    }
    assert.fail(`${caseId} was blocked by unexpected OCR issues: ${blockedReasons.join(', ')}`);
  }
  assert.fail(`${caseId} could not be saved after required patches`);
}

async function uploadCase(app: ReturnType<typeof buildApp>, profileId: string, item: ManifestCase, imagePath: string) {
  const bytes = await fsp.readFile(imagePath);
  const mimeType = mimeTypeFor(item.file);
  const signResponse = await app.inject({
    method: 'POST',
    url: '/api/uploads/sign',
    payload: {
      profileId,
      files: [{
        clientFileId: item.id,
        fileName: path.basename(item.file),
        mimeType,
        size: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex')
      }]
    }
  });
  assert.equal(signResponse.statusCode, 200, signResponse.body);
  const upload = signResponse.json().data.uploads[0];
  const uploadUrl = new URL(upload.uploadUrl);
  const multipart = multipartImagePayload('file', item.file, mimeType, bytes);
  const uploadResponse = await app.inject({
    method: 'POST',
    url: uploadUrl.pathname,
    headers: {
      ...upload.headers,
      'content-type': `multipart/form-data; boundary=${multipart.boundary}`
    },
    payload: multipart.body
  });
  assert.equal(uploadResponse.statusCode, 200, uploadResponse.body);

  const completeResponse = await app.inject({
    method: 'POST',
    url: '/api/uploads/complete',
    payload: {
      profileId,
      uploads: [{ photoId: upload.photoId }]
    }
  });
  assert.equal(completeResponse.statusCode, 200, completeResponse.body);
  return upload.photoId as string;
}

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForOcrTask(app: ReturnType<typeof buildApp>, taskId: string) {
  let task: Row | null = null;
  const timeoutMs = Number(process.env.REALCASE_OCR_WAIT_TIMEOUT_MS || 360000);
  const intervalMs = Number(process.env.REALCASE_OCR_WAIT_INTERVAL_MS || 1000);
  const maxAttempts = Math.max(1, Math.ceil(timeoutMs / intervalMs));
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await app.inject({
      method: 'GET',
      url: `/api/ocr/tasks/${taskId}`
    });
    assert.equal(response.statusCode, 200, response.body);
    task = response.json().data;
    if (task && ['needs_confirmation', 'ready_to_save', 'failed'].includes(task.status)) return task;
    await delay(intervalMs);
  }
  return task;
}

async function main() {
  const env = buildSmokeEnv();
  if (!env.OPENAI_API_KEY) {
    console.log('Skipped GPT OCR realcase smoke: OPENAI_API_KEY is not configured.');
    return;
  }

  const manifest = await readJsonFile<Manifest>(manifestPath);
  const sourceDir = path.resolve(path.dirname(manifestPath), manifest.sourceDir);
  const selectedCases = selectCases(manifest);
  await fsp.rm(env.LOCAL_OBJECT_STORAGE_DIR, { recursive: true, force: true });

  const prisma = new MemoryPrisma();
  const app = buildApp({ env, prisma: prisma as any });
  try {
    const profilesResponse = await app.inject({ method: 'GET', url: '/api/profiles' });
    assert.equal(profilesResponse.statusCode, 200, profilesResponse.body);
    const profileId = profilesResponse.json().data[0].id as string;

    const savedReports: Row[] = [];
    let blockedBeforeSaveCount = 0;
    for (const item of selectedCases) {
      const imagePath = path.join(sourceDir, item.file);
      assert.ok(fs.existsSync(imagePath), `Missing realcase image: ${imagePath}`);
      const photoId = await uploadCase(app, profileId, item, imagePath);
      const taskResponse = await app.inject({
        method: 'POST',
        url: '/api/ocr/tasks',
        payload: {
          profileId,
          photos: [{
            photoId,
            groupId: `realcase_${item.id}`,
            sortOrder: 1
          }]
        }
      });
      assert.equal(taskResponse.statusCode, 200, taskResponse.body);
      const createdTask = taskResponse.json().data;
      let task = await waitForOcrTask(app, createdTask.id);
      if (!task) throw new Error(`Expected OCR task for ${item.id}`);
      assert.equal(task.status, 'needs_confirmation', JSON.stringify(task));
      assert.ok(task.drafts.length > 0, `Expected OCR drafts for ${item.id}`);
      let golden: GoldenCase | null = null;
      let basicInfoDiffs: BasicInfoDiff[] = [];
      if (item.expectedGolden) {
        const goldenPath = path.resolve(path.dirname(manifestPath), item.expectedGolden);
        golden = await readJsonFile<GoldenCase>(goldenPath);
        try {
          basicInfoDiffs = assertGoldenMatches(item, task, golden);
        } catch (error) {
          console.error(JSON.stringify({
            caseId: item.id,
            failure: error instanceof Error ? error.message : String(error),
            drafts: summarizeDraft(task),
            firstDraftWarnings: task.drafts[0]?.warnings || [],
            firstDraftConflicts: task.drafts[0]?.conflicts || [],
            firstDraftMetricNames: (task.drafts[0]?.metrics || []).map((metric: Row) => ({
              metricKey: metric.metricKey,
              metricName: metric.metricName,
              valueType: metric.valueType,
              tone: metric.tone
            }))
          }, null, 2));
          throw error;
        }
      }
      task = await patchGoldenBasicInfo(app, task, basicInfoDiffs, item.id);

      const saveOutcome = await saveTaskAfterRequiredFixes(app, profileId, task, item.id, golden);
      if (saveOutcome.blockedBeforeSave) blockedBeforeSaveCount += 1;
      savedReports.push(...saveOutcome.reports);
      console.log(JSON.stringify({
        caseId: item.id,
        taskId: task.id,
        drafts: summarizeDraft(task),
        blockedBeforeSave: saveOutcome.blockedBeforeSave,
        blockedReasons: saveOutcome.blockedReasons,
        savedReports: saveOutcome.reports.length
      }, null, 2));
    }

    const reportsResponse = await app.inject({
      method: 'GET',
      url: `/api/profiles/${profileId}/reports?limit=20`
    });
    assert.equal(reportsResponse.statusCode, 200, reportsResponse.body);
    assert.ok(reportsResponse.json().data.length >= savedReports.length);

    const snapshotsResponse = await app.inject({
      method: 'GET',
      url: `/api/profiles/${profileId}/metrics/snapshots`
    });
    assert.equal(snapshotsResponse.statusCode, 200, snapshotsResponse.body);
    const hasLaboratoryCase = selectedCases.some((item) => item.modality === 'laboratory');
    if (hasLaboratoryCase) {
      assert.ok(snapshotsResponse.json().data.length > 0, 'Expected metric snapshots for laboratory OCR cases');
    }

    console.log(JSON.stringify({
      ok: true,
      selectedCaseIds: selectedCases.map((item) => item.id),
      savedReportCount: savedReports.length,
      blockedBeforeSaveCount,
      reportCount: reportsResponse.json().data.length,
      metricSnapshotCount: snapshotsResponse.json().data.length
    }, null, 2));
  } finally {
    await app.close();
  }
}

await main();
