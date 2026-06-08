const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { formatDate, formatCnDate, formatMonthDay, daysBetween, relativeFromToday } = require('../miniprogram/utils/date');
const { calculateTone, calculateTrend } = require('../miniprogram/utils/trend');
const { normalizeReportMetrics, groupMetricsByCategory, buildMetricSnapshots } = require('../miniprogram/utils/report');
const { formatReference, inferRefMode, normalizeReferenceByMode } = require('../miniprogram/utils/reference-range');
const { markerText, metricReportMarkers } = require('../miniprogram/utils/report-markers');
const { canonicalMetricKey, sameCanonicalMetricKey } = require('../miniprogram/utils/metric-key');
const {
  MAX_UPLOAD_BYTES,
  buildPhotoBatches,
  buildRecognitionReports,
  getReportCount,
  inferMimeType,
  validateUploadFiles
} = require('../miniprogram/utils/upload');
const { isProfileRequiredError, validateProfile } = require('../miniprogram/utils/profile');
const { buildDefaultTodos, defaultRecheckDate, validateRecheckPlan } = require('../miniprogram/utils/recheck');
const { isRecognizingTaskStatus, shouldShowRecognitionSlow } = require('../miniprogram/utils/ocr-task');
const { isOfflineNetworkType } = require('../miniprogram/utils/network');
const { beginSlowLoading, cancelSlowLoading, finishSlowLoading } = require('../miniprogram/utils/loading');
const { requestWxLoginCode } = require('../miniprogram/utils/auth');
const { buildSourcePreviewUrls, getStoredUploadPhotos } = require('../miniprogram/utils/source-preview');
const { ApiError, DEFAULT_REQUEST_TIMEOUT_MS, createApiClient, createMemoryStorage, isTimeoutError } = require('../miniprogram/utils/api-client');
const { getApiErrorMessage, getApiErrorToastTitle, getValidationErrorLines, isNotFoundError } = require('../miniprogram/utils/error');
const { createApi, createBackendApi } = require('../miniprogram/utils/api');
const { clearAuthSession, hasAuthSession, shouldRequireLogin } = require('../miniprogram/utils/session');
const { realcaseOcrDrafts } = require('../miniprogram/data/ocr-fixtures');
const mock = require('../miniprogram/data/mock');

function walkFiles(dir, predicate, output = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(fullPath, predicate, output);
    else if (predicate(fullPath)) output.push(fullPath);
  }
  return output;
}

const asyncChecks = [];
const sequentialChecks = [];
const realUploadDevtoolsScript = fs.readFileSync(path.resolve(__dirname, 'devtools-real-upload-flow.js'), 'utf8');

assert.ok(realUploadDevtoolsScript.includes('function normalizeOcrProvider'), 'real-upload DevTools smoke should normalize configured OCR provider');
assert.ok(realUploadDevtoolsScript.includes("OCR_PROVIDER: provider"), 'real-upload DevTools smoke should pass the configured OCR provider into the memory backend');
assert.ok(realUploadDevtoolsScript.includes('/chat/completions'), 'real-upload DevTools mock should cover commercial OCR chat completions');
assert.ok(!realUploadDevtoolsScript.includes("OCR_PROVIDER: 'gpt_vision'"), 'real-upload DevTools smoke must not force the GPT provider');
assert.ok(realUploadDevtoolsScript.includes('HEALTHHELPER_REAL_UPLOAD_IMAGE_PATHS'), 'real-upload DevTools smoke should support multi-image upload paths');
assert.ok(realUploadDevtoolsScript.includes('expectedOcrRequests'), 'real-upload DevTools smoke should assert provider request count for batch uploads');
assert.ok(realUploadDevtoolsScript.includes('files: smokeFiles'), 'real-upload DevTools smoke should pass multiple files into the upload-page smoke hook');
assert.ok(realUploadDevtoolsScript.includes('mockOpenAi.requests.length, expectedOcrRequests'), 'real-upload DevTools smoke should verify batch OCR request count');

assert.strictEqual(formatDate('2026-05-07'), '2026-05-07');
assert.strictEqual(formatCnDate('2026-05-07'), '2026 年 5 月 7 日');
assert.strictEqual(formatMonthDay('2026-05-07'), '5月7日');
assert.strictEqual(daysBetween('2026-05-01', '2026-05-03'), 2);
assert.strictEqual(relativeFromToday('2026-05-26', '2026-05-27'), '1 天前');
assert.strictEqual(relativeFromToday('2026-05-29', '2026-05-27'), '2 天后');

assert.strictEqual(isRecognizingTaskStatus('queued'), true);
assert.strictEqual(isRecognizingTaskStatus('processing'), true);
assert.strictEqual(isRecognizingTaskStatus('needs_confirmation'), false);
assert.strictEqual(shouldShowRecognitionSlow(1000, 10999, 10000), false);
assert.strictEqual(shouldShowRecognitionSlow(1000, 11000, 10000), true);
assert.strictEqual(isTimeoutError({ errMsg: 'request:fail timeout' }), true);
assert.strictEqual(isTimeoutError({ errMsg: 'request:fail' }), false);
assert.strictEqual(isOfflineNetworkType('none'), true);
assert.strictEqual(isOfflineNetworkType('unknown'), true);
assert.strictEqual(isOfflineNetworkType('wifi'), false);

asyncChecks.push(new Promise((resolve) => {
  const page = {
    data: {},
    setData(update) {
      this.data = { ...this.data, ...update };
    }
  };
  const seq = beginSlowLoading(page, { delay: 1 });
  assert.strictEqual(page.data.loading, true);
  assert.strictEqual(page.data.loadingSlow, false);
  setTimeout(() => {
    assert.strictEqual(page.data.loadingSlow, true, 'slow loading should become visible after delay');
    assert.strictEqual(finishSlowLoading(page, seq), true);
    assert.strictEqual(page.data.loading, false);
    assert.strictEqual(page.data.loadingSlow, false);
    resolve();
  }, 5);
}));

{
  const page = {
    data: {},
    setData(update) {
      this.data = { ...this.data, ...update };
    }
  };
  const staleSeq = beginSlowLoading(page, { delay: 100 });
  cancelSlowLoading(page);
  assert.strictEqual(finishSlowLoading(page, staleSeq), false, 'cancelled loading should ignore stale responses');
  assert.strictEqual(page.data.loading, false);
}

assert.strictEqual(getApiErrorMessage({ code: 'NETWORK_ERROR' }, '保存失败'), '网络连接失败，请重试');
assert.strictEqual(getApiErrorMessage({ statusCode: 500, message: 'raw' }, '保存失败'), '服务暂时不可用，请稍后重试');
assert.strictEqual(getApiErrorToastTitle({ code: 'REQUEST_TIMEOUT', requestId: 'req_1234567890' }, '保存失败'), '请求超时，请稍后重试 34567890');
assert.strictEqual(getApiErrorMessage({ code: 'OCR_DRAFT_NOT_SPLITTABLE', message: 'Only multi-page OCR drafts can be split' }, '拆分失败'), '这份报告不能继续拆分');
assert.strictEqual(getApiErrorMessage({ code: 'WX_LOGIN_FAILED' }, '登录失败'), '微信登录失败，请重试');
assert.strictEqual(isNotFoundError({ code: 'NOT_FOUND' }), true);
assert.strictEqual(isNotFoundError({ code: 'NETWORK_ERROR' }), false);
assert.deepStrictEqual(getValidationErrorLines({
  code: 'VALIDATION_FAILED',
  details: {
    fieldErrors: {
      type: ['请填写检查类型'],
      date: '复查日期不能早于今天'
    }
  }
}), ['请填写检查类型', '复查日期不能早于今天']);

asyncChecks.push(requestWxLoginCode({
  login({ success }) {
    success({ code: 'wx_code_ok' });
  }
}).then((code) => {
  assert.strictEqual(code, 'wx_code_ok');
}));

asyncChecks.push(requestWxLoginCode({
  login({ fail }) {
    fail({ errMsg: 'login:fail' });
  }
}).then(
  () => assert.fail('wx.login failure should reject'),
  (error) => {
    assert.strictEqual(error.code, 'WX_LOGIN_FAILED');
  }
));

asyncChecks.push(requestWxLoginCode({
  login({ success }) {
    success({});
  }
}).then(
  () => assert.fail('wx.login success without code should reject'),
  (error) => {
    assert.strictEqual(error.code, 'WX_LOGIN_NO_CODE');
  }
));

assert.strictEqual(calculateTone(2.9, 3.5, 9.5, 'quantitative'), 'low');
assert.strictEqual(calculateTone(10.2, 3.5, 9.5, 'quantitative'), 'high');
assert.strictEqual(calculateTone(5.6, 3.5, 9.5, 'quantitative'), 'ok');
assert.strictEqual(calculateTone(104, null, null, 'quantitative'), 'unknown');
assert.strictEqual(calculateTone(104, null, null, 'quantitative', 'high'), 'high');
assert.strictEqual(calculateTone('阳性', null, null, 'qualitative'), 'positive');
assert.strictEqual(canonicalMetricKey({ metricKey: 'white_blood_cell_count' }), 'wbc');
assert.strictEqual(canonicalMetricKey({ metricKey: 'HDL-C' }), 'hdl_cholesterol');
assert.strictEqual(canonicalMetricKey({ metricKey: 'manual_wbc', category: 'custom', categoryCn: '自定义' }), 'manual_wbc');
assert.strictEqual(sameCanonicalMetricKey('white_blood_cell_count', 'wbc'), true);
assert.strictEqual(sameCanonicalMetricKey('manual_wbc', 'wbc'), false);
assert.strictEqual(inferRefMode({ refText: '女：0-1周岁≤1300；2-4周岁≤350' }), 'complex_text');
assert.strictEqual(formatReference({ valueType: 'quantitative', refRangeHigh: 5.6 }), '≤5.6');
assert.deepStrictEqual(
  normalizeReferenceByMode({ refRangeLow: 1, refRangeHigh: 9, refText: '' }, 'complex_text'),
  { refRangeLow: null, refRangeHigh: null, refText: '1-9', refMode: 'complex_text' }
);
assert.deepStrictEqual(
  normalizeReferenceByMode({ refRangeLow: null, refRangeHigh: null, refText: 'Female 0-1y <=1300' }, 'simple_range'),
  { refRangeLow: null, refRangeHigh: null, refText: '', refMode: 'simple_range' }
);
assert.deepStrictEqual(
  calculateTrend([
    { reportDate: '2026-01-01', valueNumeric: 10, valueType: 'quantitative', refRangeLow: 0, refRangeHigh: 20 },
    { reportDate: '2026-02-01', valueNumeric: 14, valueType: 'quantitative', refRangeLow: 0, refRangeHigh: 20 }
  ]),
  { direction: 'up', label: '持续上升' }
);

const rows = normalizeReportMetrics(mock.reports[0], mock.metricDefinitions);
assert.strictEqual(rows[0].metricName, mock.metricDefinitions[rows[0].metricKey].nameCn);
assert.ok(rows.every((row) => row.profileId === undefined), 'normalized rows should not invent profile ownership');
assert.ok(Object.keys(groupMetricsByCategory(rows)).length >= 1);
const markerRows = normalizeReportMetrics({
  id: 'report_marker',
  reportDate: '2026-06-04',
  hospital: 'Mock Hospital',
  metrics: [{
    metricKey: 'wbc',
    metricName: 'WBC',
    originalMetricName: '\u2605 WBC',
    reportMarkers: [{ raw: '\u2605', type: 'star', position: 'prefix', meaning: 'report_marker', source: 'ocr' }],
    valueType: 'quantitative',
    valueNumeric: 4.3,
    refRangeLow: 3.5,
    refRangeHigh: 9.5,
    tone: 'ok'
  }]
}, {
  wbc: { key: 'wbc', nameCn: 'WBC', category: 'blood_routine', categoryCn: 'Blood Routine', valueType: 'quantitative' }
});
assert.strictEqual(markerRows[0].metricName, 'WBC');
assert.strictEqual(markerText(metricReportMarkers(markerRows[0])), '\u25b2');
const mixedCategoryRows = normalizeReportMetrics({
  id: 'report_mixed_category',
  reportDate: '2026-06-04',
  hospital: 'Mock Hospital',
  metrics: [{
    metricKey: 'wbc',
    metricName: 'WBC',
    category: 'hematology',
    categoryCn: '\u8840\u6db2\u7ec6\u80de',
    valueType: 'quantitative',
    valueNumeric: 4.3
  }, {
    metricKey: 'rbc',
    metricName: '\u7ea2\u7ec6\u80de',
    category: 'blood_cell_test_report',
    categoryCn: '\u5168\u8840\u68c0\u67e5',
    valueType: 'quantitative',
    valueNumeric: 3.75
  }, {
    metricKey: 'plt',
    metricName: 'PLT',
    category: 'blood_routine',
    categoryCn: '\u8840\u5e38\u89c4',
    valueType: 'quantitative',
    valueNumeric: 123
  }]
}, {});
const mixedCategoryGroups = groupMetricsByCategory(mixedCategoryRows);
assert.deepStrictEqual(Object.keys(mixedCategoryGroups), ['blood_routine'], 'blood routine category aliases should merge into one display group');
assert.strictEqual(mixedCategoryGroups.blood_routine.categoryCn, '\u8840\u5e38\u89c4');
const correctedToneRows = normalizeReportMetrics({
  id: 'report_tone_correction',
  reportDate: '2026-06-04',
  hospital: 'Mock Hospital',
  metrics: [{
    metricKey: 'tg',
    metricName: 'TG',
    valueType: 'quantitative',
    valueNumeric: 2.11,
    refRangeLow: null,
    refRangeHigh: 2.3,
    tone: 'high'
  }, {
    metricKey: 'hdl',
    metricName: 'HDL-C',
    valueType: 'quantitative',
    valueNumeric: 2.9,
    refRangeLow: 1.15,
    refRangeHigh: null,
    tone: 'high'
  }]
}, {
  tg: { key: 'tg', nameCn: 'TG', category: 'lipid', categoryCn: 'Lipid', valueType: 'quantitative' },
  hdl: { key: 'hdl', nameCn: 'HDL-C', category: 'lipid', categoryCn: 'Lipid', valueType: 'quantitative' }
});
assert.deepStrictEqual(correctedToneRows.map((row) => row.tone), ['ok', 'ok'], 'numeric ranges should override stale OCR abnormal tones');
const complexReferenceToneRows = normalizeReportMetrics({
  id: 'report_complex_reference_tone',
  reportDate: '2026-06-04',
  hospital: 'Mock Hospital',
  metrics: [{
    metricKey: 'progesterone',
    metricName: '孕酮',
    valueType: 'quantitative',
    valueNumeric: 104,
    refRangeLow: null,
    refRangeHigh: null,
    refText: '女：0-1周岁≤1300；2-4周岁≤350',
    tone: 'high'
  }]
}, {
  progesterone: { key: 'progesterone', nameCn: '孕酮', category: 'hormone', categoryCn: '激素', valueType: 'quantitative' }
});
assert.strictEqual(complexReferenceToneRows[0].tone, 'high', 'complex text references should preserve explicit result tone');

const snapshots = buildMetricSnapshots(mock.reports.filter((report) => report.profileId === 'profile_mom'), mock.metricDefinitions);
const pinned = snapshots.filter((item) => item.isPinned);
assert.ok(snapshots.length >= 6, 'expected metric snapshots from mock reports');
assert.ok(pinned.length >= 1, 'expected at least one pinned metric');
assert.ok(snapshots.every((item) => item.metricName && item.lastDate), 'snapshots must have display fields');
const pendingSnapshotRows = buildMetricSnapshots([
  { id: 'report_view_only', profileId: 'profile_x', reportDate: '2026-01-01', hospital: 'A', analysisPolicy: 'view_only', metrics: [{ metricKey: 'acth', metricName: 'ACTH', valueNumeric: 100, valueType: 'quantitative' }] },
  { id: 'report_pending', profileId: 'profile_x', reportDate: '2026-01-02', hospital: 'A', metrics: [{ metricKey: 'unknown_metric', metricName: '未知指标', valueNumeric: 1, valueType: 'quantitative', mappingStatus: 'pending' }] },
  { id: 'report_pending_text', profileId: 'profile_x', reportDate: '2026-01-03', hospital: 'A', metrics: [{ metricKey: 'unknown_text', metricName: '未知文本', valueQualitative: 'text', valueType: 'text', mappingStatus: 'pending' }] },
  { id: 'report_conflicted', profileId: 'profile_x', reportDate: '2026-01-04', hospital: 'A', metrics: [{ metricKey: 'conflicted_metric', metricName: 'conflicted', valueNumeric: 2, valueType: 'quantitative', mappingStatus: 'conflicted' }] }
], mock.metricDefinitions);
assert.deepStrictEqual(pendingSnapshotRows.map((row) => row.metricKey), ['unknown_metric'], 'view-only, conflicted and pending text metrics must not feed snapshots, but pending numeric metrics should remain followable');
const aliasSnapshotRows = buildMetricSnapshots([
  {
    id: 'report_alias_wbc_old',
    profileId: 'profile_alias',
    reportDate: '2025-01-21',
    hospital: 'A',
    metrics: [{
      metricKey: 'white_blood_cell_count',
      metricName: 'White blood cell count',
      valueType: 'quantitative',
      valueNumeric: 6.15,
      unit: '10^9/L'
    }]
  },
  {
    id: 'report_alias_wbc_new',
    profileId: 'profile_alias',
    reportDate: '2026-05-21',
    hospital: 'A',
    metrics: [{
      metricKey: 'wbc',
      metricName: 'WBC',
      valueType: 'quantitative',
      valueNumeric: 3.54,
      unit: '10^9/L'
    }]
  },
  {
    id: 'report_manual_wbc',
    profileId: 'profile_alias',
    reportDate: '2026-05-22',
    hospital: 'A',
    metrics: [{
      metricKey: 'manual_wbc',
      metricName: 'Manual WBC-like custom metric',
      category: 'custom',
      categoryCn: '自定义',
      valueType: 'quantitative',
      valueNumeric: 9,
      unit: 'score'
    }]
  }
], mock.metricDefinitions);
const aliasWbcSnapshot = aliasSnapshotRows.find((row) => row.metricKey === 'wbc');
assert.ok(aliasWbcSnapshot, 'known metric key aliases should merge into the canonical snapshot');
assert.strictEqual(aliasWbcSnapshot.measureCount, 2);
assert.ok(aliasSnapshotRows.some((row) => row.metricKey === 'manual_wbc'), 'custom metric keys should not be merged into known metrics');

sequentialChecks.push(async () => {
  const pagePath = path.resolve(__dirname, '..', 'miniprogram', 'pages', 'health', 'index.js');
  const pageModulePath = require.resolve(pagePath);
  const savedWx = global.wx;
  const savedPage = global.Page;
  let pageConfig = null;
  let navigatedUrl = '';
  try {
    global.wx = {
      navigateTo({ url }) {
        navigatedUrl = url;
      }
    };
    global.Page = (config) => { pageConfig = config; };
    delete require.cache[pageModulePath];
    require(pagePath);
    const page = {
      ...pageConfig,
      data: { ...JSON.parse(JSON.stringify(pageConfig.data)), range: 'all' },
      setData(update) {
        this.data = { ...this.data, ...update };
      }
    };
    page.goMetric({
      detail: { metricKey: 'wbc' },
      currentTarget: { dataset: { key: 'fallback' } }
    });
    assert.strictEqual(
      navigatedUrl,
      '/pages/health/metric-detail?metricKey=wbc&range=all',
      'health metric navigation should preserve the current time range'
    );
  } finally {
    delete require.cache[pageModulePath];
    global.wx = savedWx;
    global.Page = savedPage;
  }
});

sequentialChecks.push(async () => {
  const pagePath = path.resolve(__dirname, '..', 'miniprogram', 'pages', 'health', 'metric-detail.js');
  const pageModulePath = require.resolve(pagePath);
  const apiPath = path.resolve(__dirname, '..', 'miniprogram', 'utils', 'api.js');
  const apiModulePath = require.resolve(apiPath);
  const savedApiModule = require.cache[apiModulePath];
  const savedWx = global.wx;
  const savedPage = global.Page;
  const savedGetApp = global.getApp;
  const storageState = { healthDataRange: 'all' };
  const historyRows = [
    {
      reportId: 'report_wbc_20260521',
      metricKey: 'wbc',
      metricName: '白细胞',
      reportDate: '2026-05-21',
      hospital: 'A',
      valueType: 'quantitative',
      valueNumeric: '3.54',
      unit: '10^9/L',
      refRangeLow: 3.5,
      refRangeHigh: 9.5,
      tone: 'ok'
    },
    {
      reportId: 'report_wbc_20250121',
      metricKey: 'wbc',
      metricName: '白细胞',
      reportDate: '2025-01-21',
      hospital: 'A',
      valueType: 'quantitative',
      valueNumeric: '6.15',
      unit: '10^9/L',
      refRangeLow: 3.5,
      refRangeHigh: 9.5,
      tone: 'ok'
    }
  ];
  const requests = [];
  const apiStub = {
    getMetricHistory(profileId, metricKey, params = {}) {
      requests.push({ profileId, metricKey, params });
      return Promise.resolve({
        history: params.since ? historyRows.slice(0, 1) : historyRows
      });
    },
    setMetricPinned() {
      return Promise.resolve({});
    }
  };
  let pageConfig = null;
  try {
    require.cache[apiModulePath] = {
      id: apiModulePath,
      filename: apiModulePath,
      loaded: true,
      exports: { api: apiStub }
    };
    global.wx = {
      getStorageSync(key) {
        return storageState[key];
      },
      setStorageSync(key, value) {
        storageState[key] = value;
      },
      showToast() {}
    };
    global.getApp = () => ({
      getCurrentProfileId() {
        return 'profile_mom';
      }
    });
    global.Page = (config) => { pageConfig = config; };
    delete require.cache[pageModulePath];
    require(pagePath);
    const page = {
      ...pageConfig,
      data: JSON.parse(JSON.stringify(pageConfig.data)),
      setData(update) {
        this.data = { ...this.data, ...update };
      }
    };

    await page.onLoad({ metricKey: 'wbc' });
    assert.strictEqual(page.data.range, 'all', 'metric detail should inherit saved health range when URL range is absent');
    assert.deepStrictEqual(requests[0].params, {}, 'all range should not add date filters');
    assert.strictEqual(page.data.hasTrendChart, true, 'numeric string histories should still enable trend chart rendering');
    assert.strictEqual(page.data.history.length, 2);

    await page.switchRange({ currentTarget: { dataset: { range: '1y' } } });
    assert.strictEqual(storageState.healthDataRange, '1y', 'metric detail range changes should stay in sync with health data range');
    assert.ok(requests[1].params.since && requests[1].params.until, 'bounded range should request date filters');
    assert.strictEqual(page.data.history.length, 1);
    assert.strictEqual(page.data.hasTrendChart, false);
    assert.ok(page.data.trendNotice.includes('当前时间范围内少于 2 次数值记录'), 'range-limited histories should explain the active filter');
    assert.ok(!page.data.trendNotice.includes('首次'), 'range-limited histories should not claim this is the first record');
  } finally {
    delete require.cache[pageModulePath];
    if (savedApiModule) require.cache[apiModulePath] = savedApiModule;
    else delete require.cache[apiModulePath];
    global.wx = savedWx;
    global.Page = savedPage;
    global.getApp = savedGetApp;
  }
});

const uploadPhotos = [
  { id: 1, group: 1 },
  { id: 2, group: 1 },
  { id: 3, group: 0 },
  { id: 4, group: 0 }
];
const uploadBatches = buildPhotoBatches(uploadPhotos);
assert.strictEqual(getReportCount(uploadPhotos), 3, 'one two-page group plus two standalone photos should produce three reports');
assert.deepStrictEqual(uploadBatches.map((batch) => batch.photoIds), [[1, 2], [3], [4]]);
const uploadReports = buildRecognitionReports(uploadPhotos);
assert.strictEqual(uploadReports.length, 3);
assert.deepStrictEqual(uploadReports.map((report) => report.pageCount), [2, 1, 1]);
assert.strictEqual(uploadReports.filter((report) => report.isMerged).length, 1, 'only the grouped photos should produce a merged report');
const previewPhotos = [
  { id: 1, uploadedPhotoId: 'photo_backend_a', tempFilePath: 'wxfile://a.jpg' },
  { id: 2, uploadedPhotoId: 'photo_backend_b', tempFilePath: 'wxfile://b.jpg' },
  { id: 3, tempFilePath: 'wxfile://fallback.jpg' },
  { id: 4, photoId: 'photo_cache', tempFilePath: 'wxfile://cache.jpg' },
  { id: 5, uploadedPhotoId: 'photo_without_path' }
];
assert.deepStrictEqual(
  buildSourcePreviewUrls(['photo_backend_b', 'photo_3', 'photo_cache', 'photo_backend_b', 'missing'], previewPhotos),
  ['wxfile://b.jpg', 'wxfile://fallback.jpg', 'wxfile://cache.jpg'],
  'source photo previews should follow OCR draft source IDs without leaking unrelated upload photos'
);
assert.deepStrictEqual(getStoredUploadPhotos(), [], 'source preview storage helper should be inert outside a Mini Program runtime');
assert.deepStrictEqual(
  buildPhotoBatches([{ id: 1, group: 1 }, { id: 1, group: 1 }, { id: 2, group: 1 }]).map((batch) => batch.photoIds),
  [[1, 2]],
  'duplicate photo ids should only be counted once in a report group'
);
assert.strictEqual(inferMimeType('scan.JPG'), 'image/jpeg');
assert.strictEqual(inferMimeType('scan.png'), 'image/png');
assert.strictEqual(inferMimeType('scan.heic'), 'image/heic');
assert.strictEqual(inferMimeType('scan.tmp', 'image/jpg'), 'image/jpeg');
const uploadValidation = validateUploadFiles([
  { tempFilePath: 'ok.jpg', size: 1024 },
  { tempFilePath: 'bad.webp', size: 1024 },
  { tempFilePath: 'wxfile://tmp_without_extension', name: 'also_bad.webp', size: 1024 },
  { tempFilePath: 'large.png', size: MAX_UPLOAD_BYTES + 1 }
]);
assert.strictEqual(uploadValidation.accepted.length, 1);
assert.strictEqual(uploadValidation.rejectedCount, 3);
assert.strictEqual(uploadValidation.unsupportedCount, 2);
assert.strictEqual(uploadValidation.tooLargeCount, 1);
assert.ok(uploadValidation.message.includes('JPG/PNG/HEIC'));

sequentialChecks.push(async () => {
  const pagePath = path.resolve(__dirname, '..', 'miniprogram', 'pages', 'upload', 'pick.js');
  const pageModulePath = require.resolve(pagePath);
  const savedWx = global.wx;
  const savedPage = global.Page;
  let pageConfig = null;
  const toasts = [];
  const storageState = {};
  const imageInfoRequests = [];
  try {
    global.wx = {
      getStorageSync: (key) => storageState[key],
      setStorageSync: (key, value) => { storageState[key] = value; },
      removeStorageSync: (key) => { delete storageState[key]; },
      chooseMedia: ({ success }) => success({
        tempFiles: [
          { tempFilePath: 'bad.webp', size: 1024 },
          { tempFilePath: 'ok.jpg', size: 1024 }
        ]
      }),
      getImageInfo: ({ src, success }) => {
        imageInfoRequests.push(src);
        success({ width: 1279, height: 1706 });
      },
      showToast: ({ title }) => { toasts.push(title); }
    };
    global.Page = (config) => { pageConfig = config; };
    delete require.cache[pageModulePath];
    require(pagePath);
    const page = {
      ...pageConfig,
      data: JSON.parse(JSON.stringify(pageConfig.data)),
      setData(update) {
        this.data = {
          ...this.data,
          ...update
        };
      }
    };
    page.chooseAlbum();
    await Promise.resolve();
    await Promise.resolve();
    assert.strictEqual(page.data.photos.length, 1, 'upload page should filter unsupported selected files');
    assert.strictEqual(page.data.photos[0].mimeType, 'image/jpeg');
    assert.strictEqual(page.data.photos[0].width, 1279);
    assert.deepStrictEqual(imageInfoRequests, ['bad.webp', 'ok.jpg'], 'upload page should fill missing local image dimensions before OCR warning');
    assert.strictEqual(page.data.qualityWarningCount, 1, 'low-resolution report photos should be flagged before OCR');
    assert.ok(page.data.photos[0].qualityWarning, 'selected low-resolution photo should carry an OCR quality warning');
    assert.ok(page.data.photos[0].qualityWarning.includes('结果表格'), 'quality warning should guide users to center the result table');
    assert.ok(page.data.photos[0].qualityWarning.includes('解释/建议区'), 'quality warning should mention explanatory-section interference');
    assert.strictEqual(storageState.uploadDraft.photos[0].width, 1279, 'upload draft should preserve image width for quality warning recovery');
    assert.ok(toasts.some((title) => title.includes('JPG/PNG/HEIC')), 'upload page should explain rejected file types');

    page.updatePhotos([{
      id: 2,
      group: 0,
      tempFilePath: 'short-edge.jpg',
      fileName: 'short-edge.jpg',
      mimeType: 'image/jpeg',
      size: 4096,
      width: 1500,
      height: 2400
    }], []);
    assert.strictEqual(page.data.qualityWarningCount, 1, 'dense-table photos with a short edge below threshold should be flagged even when total pixels exceed 3MP');
    assert.ok(page.data.photos[0].qualityWarning.includes('1500'), 'short-edge warning should show the actual dimensions');
    assert.ok(page.data.photos[0].qualityWarning.includes('结果表格'), 'short-edge warning should also carry table-framing guidance');
  } finally {
    global.wx = savedWx;
    global.Page = savedPage;
    delete require.cache[pageModulePath];
  }
});

sequentialChecks.push(async () => {
  const pagePath = path.resolve(__dirname, '..', 'miniprogram', 'pages', 'upload', 'pick.js');
  const apiPath = path.resolve(__dirname, '..', 'miniprogram', 'utils', 'api.js');
  const pageModulePath = require.resolve(pagePath);
  const apiModulePath = require.resolve(apiPath);
  const savedWx = global.wx;
  const savedPage = global.Page;
  const savedGetApp = global.getApp;
  const savedSetTimeout = global.setTimeout;
  const savedApiCache = require.cache[apiModulePath];
  const storageState = {};
  const calls = [];
  let pageConfig = null;
  try {
    require.cache[apiModulePath] = {
      id: apiModulePath,
      filename: apiModulePath,
      loaded: true,
      exports: {
        api: {
          signUploads(payload) {
            calls.push({ type: 'sign', payload });
            return Promise.resolve({ uploads: [] });
          }
        }
      }
    };
    global.wx = {
      getStorageSync: (key) => storageState[key],
      setStorageSync: (key, value) => { storageState[key] = value; },
      removeStorageSync: (key) => { delete storageState[key]; },
      showModal: ({ success }) => success({ confirm: false }),
      showToast: () => {}
    };
    global.getApp = () => {
      throw new Error('profile should not be read when low-quality OCR is cancelled');
    };
    global.Page = (config) => { pageConfig = config; };
    delete require.cache[pageModulePath];
    require(pagePath);
    const page = {
      ...pageConfig,
      data: {
        ...JSON.parse(JSON.stringify(pageConfig.data)),
        photos: [{
          id: 1,
          group: 0,
          tempFilePath: 'low-res.jpg',
          fileName: 'low-res.jpg',
          mimeType: 'image/jpeg',
          size: 1024,
          width: 1279,
          height: 1706,
          qualityWarning: 'low resolution'
        }]
      },
      setData(update) {
        this.data = {
          ...this.data,
          ...update
        };
      }
    };
    const result = await page.startOcr();
    assert.strictEqual(result, null);
    assert.deepStrictEqual(calls, [], 'cancelled low-quality confirmation should not sign uploads or create OCR tasks');
    assert.strictEqual(storageState.uploadPhotos, undefined, 'cancelled low-quality confirmation should not mark upload photos as an active OCR attempt');
    assert.strictEqual(page.data.loading, false);
  } finally {
    if (savedApiCache) require.cache[apiModulePath] = savedApiCache;
    else delete require.cache[apiModulePath];
    global.wx = savedWx;
    global.Page = savedPage;
    global.getApp = savedGetApp;
    delete require.cache[pageModulePath];
  }
});

(() => {
  const pagePath = path.resolve(__dirname, '..', 'miniprogram', 'pages', 'upload', 'pick.js');
  const pageModulePath = require.resolve(pagePath);
  const savedWx = global.wx;
  const savedPage = global.Page;
  const storageState = {};
  const toasts = [];
  let pageConfig = null;
  try {
    global.wx = {
      getStorageSync: (key) => storageState[key],
      setStorageSync: (key, value) => { storageState[key] = value; },
      removeStorageSync: (key) => { delete storageState[key]; },
      showToast: ({ title }) => { toasts.push(title); }
    };
    global.Page = (config) => { pageConfig = config; };
    delete require.cache[pageModulePath];
    require(pagePath);
    const page = {
      ...pageConfig,
      data: {
        ...JSON.parse(JSON.stringify(pageConfig.data)),
        photos: [
          { id: 1, group: 0 },
          { id: 2, group: 0 },
          { id: 3, group: 0 }
        ],
        selected: []
      },
      setData(update) {
        this.data = {
          ...this.data,
          ...update
        };
      }
    };
    page.startGrouping({ currentTarget: { dataset: { id: 2 } } });
    assert.deepStrictEqual(page.data.selected, [2], 'grouping should start from the tapped photo');
    page.finishGrouping();
    assert.ok(toasts.some((title) => title.includes('2')), 'single-photo grouping should be rejected');
    page.setSelected([1, 2]);
    page.finishGrouping();
    assert.strictEqual(page.data.grouping, false);
    assert.strictEqual(page.data.reportCount, 2, 'two linked photos plus one standalone should produce two reports');
    const groupId = page.data.photos.find((photo) => photo.id === 1).group;
    assert.ok(groupId > 0);
    assert.strictEqual(page.data.photos.find((photo) => photo.id === 2).group, groupId);
    page.splitGroup({ currentTarget: { dataset: { group: groupId } } });
    assert.deepStrictEqual(page.data.photos.map((photo) => photo.group), [0, 0, 0]);
    assert.strictEqual(page.data.reportCount, 3, 'splitting a group should restore independent report count');
    assert.deepStrictEqual(storageState.uploadDraft.photos.map((photo) => photo.group), [0, 0, 0]);
  } finally {
    global.wx = savedWx;
    global.Page = savedPage;
    delete require.cache[pageModulePath];
  }
})();

sequentialChecks.push(async () => {
  const pagePath = path.resolve(__dirname, '..', 'miniprogram', 'pages', 'upload', 'pick.js');
  const apiPath = path.resolve(__dirname, '..', 'miniprogram', 'utils', 'api.js');
  const pageModulePath = require.resolve(pagePath);
  const apiModulePath = require.resolve(apiPath);
  const savedWx = global.wx;
  const savedPage = global.Page;
  const savedGetApp = global.getApp;
  const savedApiCache = require.cache[apiModulePath];
  const calls = [];
  let navigatedTo = '';
  let relaunchedTo = '';
  let pageConfig = null;
  const stubApi = {
    signUploads(payload) {
      calls.push({ type: 'sign', payload });
      return Promise.resolve({
        uploads: payload.files.map((file, index) => ({
          clientFileId: file.clientFileId,
          photoId: `signed_photo_${index + 1}`,
          uploadUrl: `local-upload://${file.clientFileId}`,
          headers: {}
        }))
      });
    },
    completeUploads(payload) {
      calls.push({ type: 'complete', payload });
      return Promise.resolve({
        photos: payload.uploads.map((upload) => ({
          ...upload,
          status: 'uploaded'
        }))
      });
    },
    createOcrTask(payload) {
      calls.push({ type: 'ocr', payload });
      return Promise.resolve({
        id: 'task_uploaded',
        status: 'queued',
        photoCount: payload.photos.length,
        reportCount: 1
      });
    }
  };
  try {
    require.cache[apiModulePath] = {
      id: apiModulePath,
      filename: apiModulePath,
      loaded: true,
      exports: { api: stubApi }
    };
    global.wx = {
      getStorageSync: (key) => (key === 'pendingOcrTasks' ? [] : undefined),
      setStorageSync: () => {},
      removeStorageSync: () => {},
      navigateTo: ({ url }) => { navigatedTo = url; },
      redirectTo: ({ url }) => { navigatedTo = url; },
      showToast: () => {}
    };
    global.getApp = () => ({ getCurrentProfileId: () => 'profile_upload' });
    global.Page = (config) => { pageConfig = config; };
    delete require.cache[pageModulePath];
    require(pagePath);
    const page = {
      ...pageConfig,
      data: JSON.parse(JSON.stringify(pageConfig.data)),
      setData(update) {
        this.data = {
          ...this.data,
          ...update
        };
      }
    };
    page.data.photos = [{
      id: 1,
      group: 1,
      tempFilePath: 'first.jpg',
      fileName: 'first.jpg',
      mimeType: 'image/jpeg',
      size: 1024
    }, {
      id: 2,
      group: 1,
      tempFilePath: 'second.jpg',
      fileName: 'second.jpg',
      mimeType: 'image/jpeg',
      size: 2048
    }];
    await page.startOcr();
    assert.deepStrictEqual(calls.map((call) => call.type), ['sign', 'complete', 'ocr']);
    assert.deepStrictEqual(calls[0].payload.files.map((file) => file.clientFileId), ['local_1', 'local_2']);
    assert.deepStrictEqual(calls[1].payload.uploads.map((upload) => upload.photoId), ['signed_photo_1', 'signed_photo_2']);
    assert.deepStrictEqual(calls[2].payload.photos.map((photo) => photo.photoId), ['signed_photo_1', 'signed_photo_2']);
    assert.deepStrictEqual(calls[2].payload.photos.map((photo) => photo.groupId), ['group_1', 'group_1']);
    assert.ok(navigatedTo.includes('/pages/upload/confirm?taskId=task_uploaded'));
    assert.ok(navigatedTo.includes('recognizing=1'), 'real upload should open confirm page in active recognition mode so progress starts moving immediately');
  } finally {
    if (savedApiCache) require.cache[apiModulePath] = savedApiCache;
    else delete require.cache[apiModulePath];
    global.wx = savedWx;
    global.Page = savedPage;
    global.getApp = savedGetApp;
    delete require.cache[pageModulePath];
  }
});

asyncChecks.push((async () => {
  const pagePath = path.resolve(__dirname, '..', 'miniprogram', 'pages', 'upload', 'edit-detail.js');
  const apiPath = path.resolve(__dirname, '..', 'miniprogram', 'utils', 'api.js');
  const pageModulePath = require.resolve(pagePath);
  const apiModulePath = require.resolve(apiPath);
  const savedWx = global.wx;
  const savedPage = global.Page;
  const savedApiCache = require.cache[apiModulePath];
  let pageConfig = null;
  try {
    require.cache[apiModulePath] = {
      id: apiModulePath,
      filename: apiModulePath,
      loaded: true,
      exports: { api: {} }
    };
    global.wx = {
      showToast: () => {},
      navigateBack: () => {}
    };
    global.Page = (config) => { pageConfig = config; };
    delete require.cache[pageModulePath];
    require(pagePath);
    const page = {
      ...pageConfig,
      data: JSON.parse(JSON.stringify(pageConfig.data)),
      setData(update) {
        this.data = {
          ...this.data,
          ...update
        };
      }
    };
    page.setData({ editing: true });
    page.draft = {
      status: 'needs_review',
      basicInfo: {
        type: 'Blood lipid',
        originalType: 'Blood lipid',
        typeKey: 'blood_lipid',
        canonicalTypeName: 'Blood lipid',
        hospital: 'Existing Hospital',
        hospitalSource: 'ocr',
        reportDate: '2025-08-25',
        reportDateSource: 'ocr',
        modality: 'laboratory'
      },
      metrics: []
    };
    page.refreshData();
    assert.strictEqual(page.data.basicInfo.type, 'Blood lipid');
    assert.strictEqual(page.data.basicInfo.hospital, 'Existing Hospital');
    assert.strictEqual(page.data.basicInfo.reportDate, '2025-08-25');

    page.onBasicInput({
      currentTarget: { dataset: { field: 'type' } },
      detail: { value: '' }
    });
    assert.strictEqual(page.draft.basicInfo.type, '', 'clearing report type should stay empty while editing');
    assert.strictEqual(page.draft.basicInfo.originalType, '');
    assert.strictEqual(page.draft.basicInfo.typeKey, 'unknown_laboratory');
    assert.strictEqual(page.data.basicInfo.type, '');
    assert.strictEqual(page.data.basicInfo.canonicalTypeName, '');
    assert.strictEqual(page.data.basicInfo.hospital, 'Existing Hospital', 'editing type must not rewrite hospital');
    assert.strictEqual(page.data.basicInfo.reportDate, '2025-08-25', 'editing type must not rewrite date');

    page.onBasicInput({
      currentTarget: { dataset: { field: 'hospital' } },
      detail: { value: '' }
    });
    assert.strictEqual(page.draft.basicInfo.hospital, '', 'clearing hospital should stay empty while editing');
    assert.strictEqual(page.draft.basicInfo.hospitalSource, 'user_edited');
    assert.strictEqual(page.data.basicInfo.hospital, '');
    assert.strictEqual(page.data.basicInfo.type, '', 'editing hospital must not restore cleared type');
    assert.strictEqual(page.data.basicInfo.reportDate, '2025-08-25', 'editing hospital must not rewrite date');

    const detailWxml = fs.readFileSync(path.resolve(__dirname, '..', 'miniprogram', 'pages', 'upload', 'edit-detail.wxml'), 'utf8');
    assert.ok(detailWxml.includes('placeholder="请输入医院"'), 'hospital editor should show an explicit placeholder');
    assert.ok(detailWxml.includes("basicInfo.reportDate || '请选择日期'"), 'empty date editor should render a selectable placeholder');

    page.draft.metrics = [{
      metricKey: 'wbc',
      metricName: '白细胞数目(WBC)',
      originalMetricName: '白细胞数目(WBC)',
      valueType: 'quantitative',
      valueNumeric: 4.3,
      unit: '10^9/L',
      refRangeLow: 3.5,
      refRangeHigh: 9.5,
      tone: 'ok',
      mappingStatus: 'suggested'
    }, {
      metricKey: 'rbc',
      metricName: '红细胞数目(RBC)',
      originalMetricName: '红细胞数目(RBC)',
      valueType: 'quantitative',
      valueNumeric: 3.75,
      unit: '10^12/L',
      refRangeLow: 3.8,
      refRangeHigh: 5.1,
      tone: 'low',
      mappingStatus: 'suggested'
    }];
    page.refreshData();
    page.onMetricInput({
      currentTarget: { dataset: { index: 0, field: 'valueNumeric' } },
      detail: { value: '' }
    });

    assert.strictEqual(page.draft.metrics[0].valueNumeric, null, 'clearing a metric result should stay empty while editing');
    assert.strictEqual(page.draft.metrics[0].metricName, '白细胞数目(WBC)');
    assert.strictEqual(page.draft.metrics[0].originalMetricName, '白细胞数目(WBC)');
    assert.strictEqual(page.draft.metrics[0].unit, '10^9/L');
    assert.strictEqual(page.draft.metrics[0].refRangeLow, 3.5);
    assert.strictEqual(page.draft.metrics[0].refRangeHigh, 9.5);
    assert.strictEqual(page.draft.metrics[0].isManuallyEdited, true);
    assert.strictEqual(page.draft.metrics[1].valueNumeric, 3.75, 'editing one metric result must not rewrite another metric row');
    assert.strictEqual(page.data.groups[0].items[0].value, '');
    assert.strictEqual(page.data.groups[0].items[0].unit, '10^9/L');
    assert.strictEqual(page.data.groups[0].items[0].refLow, '3.5');
    assert.strictEqual(page.data.groups[0].items[0].refHigh, '9.5');
  } finally {
    if (savedApiCache) require.cache[apiModulePath] = savedApiCache;
    else delete require.cache[apiModulePath];
    global.wx = savedWx;
    global.Page = savedPage;
    delete require.cache[pageModulePath];
  }
})());

sequentialChecks.push(async () => {
  const pagePath = path.resolve(__dirname, '..', 'miniprogram', 'pages', 'upload', 'edit-detail.js');
  const apiPath = path.resolve(__dirname, '..', 'miniprogram', 'utils', 'api.js');
  const pageModulePath = require.resolve(pagePath);
  const apiModulePath = require.resolve(apiPath);
  const savedWx = global.wx;
  const savedPage = global.Page;
  const savedSetTimeout = global.setTimeout;
  const savedApiCache = require.cache[apiModulePath];
  const calls = [];
  const toasts = [];
  const redirects = [];
  const relaunches = [];
  const navigateBacks = [];
  let pageConfig = null;
  const stubApi = {
    updateOcrDraft(payload, config) {
      calls.push({ payload, config });
      return Promise.resolve({ draftId: payload.draftId });
    }
  };
  try {
    require.cache[apiModulePath] = {
      id: apiModulePath,
      filename: apiModulePath,
      loaded: true,
      exports: { api: stubApi }
    };
    global.setTimeout = (handler) => {
      if (typeof handler === 'function') handler();
      return 0;
    };
    global.wx = {
      showToast: ({ title, icon }) => { toasts.push({ title, icon }); },
      navigateBack: ({ delta } = {}) => { navigateBacks.push(delta || 1); },
      redirectTo: ({ url }) => { redirects.push(url); },
      reLaunch: ({ url }) => { relaunches.push(url); }
    };
    global.Page = (config) => { pageConfig = config; };
    delete require.cache[pageModulePath];
    require(pagePath);
    const page = {
      ...pageConfig,
      data: {
        ...JSON.parse(JSON.stringify(pageConfig.data)),
        editing: true,
        saving: false,
        isImagingReport: false
      },
      setData(update) {
        this.data = {
          ...this.data,
          ...update
        };
      }
    };
    page.taskId = 'task_clear_type_save';
    page.draftId = 'draft_clear_type_save';
    page.source = 'ocr';
    page.draft = {
      draftId: 'draft_clear_type_save',
      status: 'needs_review',
      basicInfo: {
        type: '结果',
        originalType: '结果',
        typeKey: 'unknown_laboratory',
        canonicalTypeName: '结果',
        hospital: '天津市某医院',
        hospitalSource: 'ocr',
        reportDate: '2025-08-25',
        reportDateSource: 'ocr',
        reportLike: true,
        modality: 'laboratory'
      },
      metrics: [{
        metricKey: 'wbc',
        metricName: '白细胞数目(WBC)',
        valueType: 'quantitative',
        valueNumeric: 4.3,
        unit: '10^9/L',
        refRangeLow: 3.5,
        refRangeHigh: 9.5,
        tone: 'ok',
        mappingStatus: 'suggested'
      }],
      findings: [],
      warnings: []
    };
    page.refreshData();
    assert.strictEqual(page.data.basicInfo.type, '结果');
    assert.strictEqual(page.data.basicInfo.canonicalTypeName, '结果');

    page.onBasicInput({
      currentTarget: { dataset: { field: 'type' } },
      detail: { value: '' }
    });
    assert.strictEqual(page.data.basicInfo.type, '');
    assert.strictEqual(page.data.basicInfo.canonicalTypeName, '');
    assert.strictEqual(page.data.basicInfo.hospital, '天津市某医院');
    assert.strictEqual(page.data.basicInfo.reportDate, '2025-08-25');

    await page.saveAndBack();

    assert.strictEqual(calls.length, 1);
    const savedInfo = calls[0].payload.draft.basicInfo;
    assert.strictEqual(savedInfo.type, '', 'cleared report type should stay empty in saved OCR draft');
    assert.strictEqual(savedInfo.originalType, '', 'cleared report type should not restore originalType');
    assert.strictEqual(savedInfo.canonicalTypeName, '', 'cleared report type should hide the stale canonical classification');
    assert.strictEqual(savedInfo.typeKey, 'unknown_laboratory');
    assert.strictEqual(savedInfo.hospital, '天津市某医院', 'clearing type must not rewrite hospital in saved draft');
    assert.strictEqual(savedInfo.reportDate, '2025-08-25', 'clearing type must not rewrite report date in saved draft');
    assert.ok(savedInfo.ocrReviewedAt, 'saving the corrected OCR draft should mark review time');
    assert.deepStrictEqual(navigateBacks, [1], 'normal OCR draft save should return to the existing confirmation page');
    assert.deepStrictEqual(redirects, [], 'normal OCR draft save should not create a duplicate confirmation page');
    navigateBacks.length = 0;
    global.wx.redirectTo = ({ fail } = {}) => { if (fail) fail(); };
    global.wx.navigateBack = ({ fail } = {}) => { if (fail) fail(); };
    page.returnToOcrConfirmation();
    assert.deepStrictEqual(relaunches, [
      `/pages/upload/confirm?taskId=${page.taskId}`
    ], 'OCR draft save should reLaunch back to confirmation when back and redirect both fail');
    assert.strictEqual(calls[0].payload.draft.metrics[0].metricName, '白细胞数目(WBC)');
    assert.deepStrictEqual(toasts, [{ title: '已保存修改', icon: 'success' }]);
  } finally {
    if (savedApiCache) require.cache[apiModulePath] = savedApiCache;
    else delete require.cache[apiModulePath];
    global.wx = savedWx;
    global.Page = savedPage;
    global.setTimeout = savedSetTimeout;
    delete require.cache[pageModulePath];
  }
});

sequentialChecks.push(async () => {
  const pagePath = path.resolve(__dirname, '..', 'miniprogram', 'pages', 'upload', 'edit-detail.js');
  const apiPath = path.resolve(__dirname, '..', 'miniprogram', 'utils', 'api.js');
  const pageModulePath = require.resolve(pagePath);
  const apiModulePath = require.resolve(apiPath);
  const savedWx = global.wx;
  const savedPage = global.Page;
  const savedSetTimeout = global.setTimeout;
  const savedApiCache = require.cache[apiModulePath];
  const calls = [];
  const toasts = [];
  let pageConfig = null;
  const stubApi = {
    updateOcrDraft(payload, config) {
      calls.push({ payload, config });
      return Promise.resolve({ draftId: payload.draftId });
    }
  };
  try {
    require.cache[apiModulePath] = {
      id: apiModulePath,
      filename: apiModulePath,
      loaded: true,
      exports: { api: stubApi }
    };
    global.setTimeout = (handler) => {
      if (typeof handler === 'function') handler();
      return 0;
    };
    global.wx = {
      showToast: ({ title, icon }) => { toasts.push({ title, icon }); },
      navigateBack: () => {}
    };
    global.Page = (config) => { pageConfig = config; };
    delete require.cache[pageModulePath];
    require(pagePath);
    const page = {
      ...pageConfig,
      data: {
        ...JSON.parse(JSON.stringify(pageConfig.data)),
        editing: true,
        saving: false,
        isImagingReport: false
      },
      setData(update) {
        this.data = {
          ...this.data,
          ...update
        };
      }
    };
    page.taskId = 'task_clear_metric_value';
    page.draftId = 'draft_clear_metric_value';
    page.source = 'ocr';
    page.draft = {
      draftId: 'draft_clear_metric_value',
      status: 'needs_review',
      basicInfo: {
        type: '\u8840\u8102',
        hospital: '\u5929\u6d25\u5e02\u67d0\u533b\u9662',
        hospitalSource: 'ocr',
        reportDate: '2025-08-25',
        reportDateSource: 'ocr',
        reportLike: true,
        modality: 'laboratory'
      },
      metrics: [{
        metricKey: 'triglyceride',
        metricName: '\u7518\u6cb9\u4e09\u916f',
        originalMetricName: 'TG',
        category: 'blood_lipid',
        categoryCn: '\u8840\u8102',
        valueType: 'quantitative',
        valueNumeric: 2.11,
        unit: 'mmol/L',
        refRangeLow: null,
        refRangeHigh: 2.3,
        refText: '<=2.30',
        tone: 'ok',
        mappingStatus: 'confirmed',
        ocrConfidence: 0.91
      }, {
        metricKey: 'progesterone',
        metricName: '\u5b55\u916e',
        originalMetricName: 'PROG',
        category: 'hormone',
        categoryCn: '\u6fc0\u7d20',
        valueType: 'quantitative',
        valueNumeric: 104,
        unit: 'pg/ml',
        refRangeLow: null,
        refRangeHigh: null,
        refText: '\u5973\uff1a0-1\u5468\u5c81\u22641300\uff1b2-4\u5468\u5c81\u2264350',
        tone: 'unknown',
        mappingStatus: 'confirmed',
        ocrConfidence: 0.91
      }],
      findings: [],
      warnings: []
    };
    page.refreshData();
    assert.strictEqual(page.data.groups[0].items[0].value, '2.11');
    const complexRefItem = page.data.groups.flatMap((group) => group.items).find((item) => item.name === '\u5b55\u916e');
    assert.strictEqual(complexRefItem.refMode, 'complex_text');
    assert.strictEqual(complexRefItem.showTonePicker, true);
    assert.strictEqual(complexRefItem.ref, '\u5973\uff1a0-1\u5468\u5c81\u22641300\uff1b2-4\u5468\u5c81\u2264350');

    page.onMetricToneChange({
      currentTarget: { dataset: { index: 1 } },
      detail: { value: 2 }
    });
    assert.strictEqual(page.draft.metrics[1].tone, 'high', 'complex reference metrics should allow manual tone selection');

    page.onMetricInput({
      currentTarget: { dataset: { index: 0, field: 'valueNumeric' } },
      detail: { value: '' }
    });

    assert.strictEqual(page.draft.metrics[0].valueNumeric, null, 'cleared metric result should be saved as null');
    assert.strictEqual(page.draft.metrics[0].metricName, '\u7518\u6cb9\u4e09\u916f');
    assert.strictEqual(page.draft.metrics[0].unit, 'mmol/L');
    assert.strictEqual(page.draft.metrics[0].refRangeHigh, 2.3);
    assert.strictEqual(page.draft.metrics[0].refText, '<=2.30');
    assert.strictEqual(page.draft.metrics[0].mappingStatus, 'confirmed');
    assert.strictEqual(page.draft.metrics[0].isManuallyEdited, true);
    assert.strictEqual(page.data.groups[0].items[0].value, '');
    assert.strictEqual(page.data.groups[0].items[0].unit, 'mmol/L');
    assert.strictEqual(page.data.groups[0].items[0].refHigh, '2.3');

    await page.saveAndBack();

    assert.strictEqual(calls.length, 1);
    const savedMetric = calls[0].payload.draft.metrics[0];
    assert.strictEqual(savedMetric.valueNumeric, null);
    assert.strictEqual(savedMetric.metricName, '\u7518\u6cb9\u4e09\u916f');
    assert.strictEqual(savedMetric.originalMetricName, 'TG');
    assert.strictEqual(savedMetric.unit, 'mmol/L');
    assert.strictEqual(savedMetric.refRangeLow, null);
    assert.strictEqual(savedMetric.refRangeHigh, 2.3);
    assert.strictEqual(savedMetric.refText, '<=2.30');
    assert.strictEqual(calls[0].payload.draft.metrics[1].refText, '\u5973\uff1a0-1\u5468\u5c81\u22641300\uff1b2-4\u5468\u5c81\u2264350');
    assert.strictEqual(calls[0].payload.draft.metrics[1].tone, 'high');
    assert.strictEqual(calls[0].payload.draft.basicInfo.hospital, '\u5929\u6d25\u5e02\u67d0\u533b\u9662');
    assert.strictEqual(calls[0].payload.draft.basicInfo.reportDate, '2025-08-25');
    assert.strictEqual(toasts.length, 1);
    assert.strictEqual(toasts[0].icon, 'success');
  } finally {
    if (savedApiCache) require.cache[apiModulePath] = savedApiCache;
    else delete require.cache[apiModulePath];
    global.wx = savedWx;
    global.Page = savedPage;
    global.setTimeout = savedSetTimeout;
    delete require.cache[pageModulePath];
  }
});

sequentialChecks.push(async () => {
  const pagePath = path.resolve(__dirname, '..', 'miniprogram', 'pages', 'upload', 'edit-detail.js');
  const apiPath = path.resolve(__dirname, '..', 'miniprogram', 'utils', 'api.js');
  const pageModulePath = require.resolve(pagePath);
  const apiModulePath = require.resolve(apiPath);
  const savedWx = global.wx;
  const savedPage = global.Page;
  const savedSetTimeout = global.setTimeout;
  const savedApiCache = require.cache[apiModulePath];
  const calls = [];
  const toasts = [];
  let navigatedBack = false;
  let pageConfig = null;
  const stubApi = {
    updateOcrDraft(payload, config) {
      calls.push({ payload, config });
      return Promise.resolve({ draftId: payload.draftId });
    }
  };
  try {
    require.cache[apiModulePath] = {
      id: apiModulePath,
      filename: apiModulePath,
      loaded: true,
      exports: { api: stubApi }
    };
    global.setTimeout = (handler) => {
      if (typeof handler === 'function') handler();
      return 0;
    };
    global.wx = {
      showToast: ({ title, icon }) => { toasts.push({ title, icon }); },
      navigateBack: () => { navigatedBack = true; }
    };
    global.Page = (config) => { pageConfig = config; };
    delete require.cache[pageModulePath];
    require(pagePath);
    const page = {
      ...pageConfig,
      data: {
        ...JSON.parse(JSON.stringify(pageConfig.data)),
        editing: true,
        saving: false,
        isImagingReport: false
      },
      setData(update) {
        this.data = {
          ...this.data,
          ...update
        };
      }
    };
    page.taskId = 'task_missing_info_edit';
    page.draftId = 'draft_missing_info_edit';
    page.source = 'ocr';
    page.draft = {
      draftId: 'draft_missing_info_edit',
      status: 'needs_review',
      basicInfo: {
        type: '\u8840\u5e38\u89c4',
        hospital: '',
        hospitalSource: 'unknown',
        reportDate: '',
        reportDateSource: 'unknown',
        reportLike: true,
        modality: 'laboratory'
      },
      metrics: [{
        metricKey: 'wbc',
        metricName: '\u767d\u7ec6\u80de\u6570\u76ee(WBC)',
        valueType: 'quantitative',
        valueNumeric: 4.3,
        refRangeLow: 3.5,
        refRangeHigh: 9.5,
        tone: 'ok',
        mappingStatus: 'suggested'
      }],
      findings: [],
      warnings: []
    };
    page.refreshData();
    assert.strictEqual(page.data.basicInfo.hospital, '');
    assert.strictEqual(page.data.basicInfo.reportDate, '');

    const blocked = await page.saveAndBack();
    assert.strictEqual(blocked, false);
    assert.strictEqual(calls.length, 0);
    assert.deepStrictEqual(toasts, [{ title: '\u8bf7\u586b\u5199\u533b\u9662\u548c\u68c0\u67e5\u65e5\u671f', icon: 'none' }]);
    assert.strictEqual(page.data.saving, false);

    page.onBasicInput({
      currentTarget: { dataset: { field: 'hospital' } },
      detail: { value: '\u5929\u6d25\u5e02\u67d0\u533b\u9662' }
    });
    page.onDateChange({ detail: { value: '2025-08-25' } });

    await page.saveAndBack();

    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].payload.taskId, 'task_missing_info_edit');
    assert.strictEqual(calls[0].payload.draftId, 'draft_missing_info_edit');
    assert.strictEqual(calls[0].payload.draft.basicInfo.hospital, '\u5929\u6d25\u5e02\u67d0\u533b\u9662');
    assert.strictEqual(calls[0].payload.draft.basicInfo.hospitalSource, 'user_edited');
    assert.strictEqual(calls[0].payload.draft.basicInfo.reportDate, '2025-08-25');
    assert.strictEqual(calls[0].payload.draft.basicInfo.reportDateSource, 'user_edited');
    assert.ok(calls[0].payload.draft.basicInfo.ocrReviewedAt, 'OCR detail save should mark the draft as reviewed');
    assert.strictEqual(calls[0].payload.draft.basicInfo.ocrReviewSource, 'edit_detail');
    assert.strictEqual(calls[0].config.idempotencyKey, 'edit_draft_task_missing_info_edit_draft_missing_info_edit');
    assert.strictEqual(page.data.editing, false);
    assert.strictEqual(navigatedBack, true, 'fixed OCR draft should return to confirm page');
  } finally {
    if (savedApiCache) require.cache[apiModulePath] = savedApiCache;
    else delete require.cache[apiModulePath];
    global.wx = savedWx;
    global.Page = savedPage;
    global.setTimeout = savedSetTimeout;
    delete require.cache[pageModulePath];
  }
});

sequentialChecks.push(async () => {
  const pagePath = path.resolve(__dirname, '..', 'miniprogram', 'pages', 'upload', 'edit-detail.js');
  const apiPath = path.resolve(__dirname, '..', 'miniprogram', 'utils', 'api.js');
  const pageModulePath = require.resolve(pagePath);
  const apiModulePath = require.resolve(apiPath);
  const savedWx = global.wx;
  const savedPage = global.Page;
  const savedSetTimeout = global.setTimeout;
  const savedApiCache = require.cache[apiModulePath];
  const calls = [];
  const toasts = [];
  let navigatedBack = false;
  let pageConfig = null;
  const stubApi = {
    updateOcrDraft(payload, config) {
      calls.push({ payload, config });
      return Promise.resolve({ draftId: payload.draftId });
    }
  };
  try {
    require.cache[apiModulePath] = {
      id: apiModulePath,
      filename: apiModulePath,
      loaded: true,
      exports: { api: stubApi }
    };
    global.setTimeout = (handler) => {
      if (typeof handler === 'function') handler();
      return 0;
    };
    global.wx = {
      showToast: ({ title, icon }) => { toasts.push({ title, icon }); },
      navigateBack: () => { navigatedBack = true; }
    };
    global.Page = (config) => { pageConfig = config; };
    delete require.cache[pageModulePath];
    require(pagePath);
    const page = {
      ...pageConfig,
      data: {
        ...JSON.parse(JSON.stringify(pageConfig.data)),
        editing: true,
        saving: false,
        isImagingReport: false
      },
      setData(update) {
        this.data = {
          ...this.data,
          ...update
        };
      }
    };
    page.taskId = 'task_manual';
    page.draftId = 'draft_manual';
    page.manualMode = true;
    page.source = 'ocr';
    page.draft = {
      draftId: 'draft_manual',
      status: 'needs_manual_input',
      basicInfo: {
        type: '血常规',
        hospital: '手动补录医院',
        reportDate: '2025-08-25',
        reportLike: false,
        modality: 'laboratory'
      },
      metrics: [{
        metricKey: 'manual_metric_1',
        metricName: '白细胞',
        valueType: 'quantitative',
        valueNumeric: 4.3,
        refRangeLow: 3.5,
        refRangeHigh: 9.5,
        tone: 'ok',
        isManuallyEdited: true
      }],
      findings: [],
      warnings: []
    };

    await page.saveAndBack();

    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].payload.taskId, 'task_manual');
    assert.strictEqual(calls[0].payload.draftId, 'draft_manual');
    assert.strictEqual(calls[0].payload.draft.status, 'needs_review');
    assert.strictEqual(calls[0].payload.draft.basicInfo.reportLike, true);
    assert.ok(calls[0].payload.draft.basicInfo.ocrReviewedAt, 'manual OCR save should mark the draft as reviewed');
    assert.strictEqual(calls[0].payload.draft.basicInfo.ocrReviewSource, 'edit_detail');
    assert.deepStrictEqual(calls[0].payload.draft.findings, []);
    assert.strictEqual(calls[0].config.idempotencyKey, 'edit_draft_task_manual_draft_manual');
    assert.deepStrictEqual(toasts, [{ title: '已保存修改', icon: 'success' }]);
    assert.strictEqual(page.data.saving, false);
    assert.strictEqual(page.data.editing, false);
    assert.strictEqual(navigatedBack, true, 'manual OCR draft save should return to confirm page');
  } finally {
    if (savedApiCache) require.cache[apiModulePath] = savedApiCache;
    else delete require.cache[apiModulePath];
    global.wx = savedWx;
    global.Page = savedPage;
    global.setTimeout = savedSetTimeout;
    delete require.cache[pageModulePath];
  }
});

sequentialChecks.push(async () => {
  const pagePath = path.resolve(__dirname, '..', 'miniprogram', 'pages', 'upload', 'conflict.js');
  const apiPath = path.resolve(__dirname, '..', 'miniprogram', 'utils', 'api.js');
  const pageModulePath = require.resolve(pagePath);
  const apiModulePath = require.resolve(apiPath);
  const savedWx = global.wx;
  const savedPage = global.Page;
  const savedGetCurrentPages = global.getCurrentPages;
  const savedSetTimeout = global.setTimeout;
  const savedApiCache = require.cache[apiModulePath];
  const calls = [];
  const toasts = [];
  let navigatedBack = false;
  let previousReloaded = false;
  let pageConfig = null;
  const stubApi = {
    getOcrTask(taskId) {
      calls.push({ type: 'get', taskId });
      return Promise.resolve({
        id: 'task_conflicts',
        drafts: [{
          draftId: 'draft_conflicts',
          basicInfo: { type: '血常规' },
          metrics: [{
            metricKey: 'wbc',
            metricName: '白细胞',
            valueNumeric: 4.3,
            valueType: 'quantitative',
            unit: '10^9/L',
            refRangeLow: 3.5,
            refRangeHigh: 9.5,
            tone: 'ok'
          }, {
            metricKey: 'rbc',
            metricName: '红细胞',
            valueNumeric: 3.75,
            valueType: 'quantitative',
            unit: '10^12/L',
            refRangeLow: 3.8,
            refRangeHigh: 5.1,
            tone: 'low'
          }, {
            metricKey: 'hgb',
            metricName: '血红蛋白',
            valueNumeric: 121,
            valueType: 'quantitative',
            unit: 'g/L',
            refRangeLow: 115,
            refRangeHigh: 150,
            tone: 'ok'
          }, {
            metricKey: 'urine_volume_24h',
            metricName: '24小时尿量',
            valueNumeric: 2300,
            valueType: 'quantitative',
            unit: 'ml',
            refRangeHigh: 300,
            tone: 'high'
          }],
          conflicts: [{
            code: 'DUPLICATE_METRIC_VALUE_CONFLICT',
            field: 'metrics',
            candidates: []
          }, {
            metricKey: 'wbc',
            metricName: '白细胞',
            candidates: []
          }, {
            metricKey: 'rbc',
            metricName: '红细胞',
            candidates: [{
              valueNumeric: 3.75,
              unit: '10^12/L',
              tone: 'low',
              sourcePhotoId: 'photo_1'
            }, {
              valueNumeric: 4.05,
              unit: '10^12/L',
              tone: 'ok',
              sourcePhotoId: 'photo_2'
            }]
          }, {
            metricKey: 'hgb',
            metricName: '血红蛋白',
            candidates: []
          }, {
            metricKey: 'urine_volume_24h',
            metricName: '24小时尿量',
            candidates: [{
              metricKey: 'urine_volume_24h',
              metricName: '24小时尿量',
              valueDisplay: '<300',
              unit: 'ml',
              sourceLabel: '识别候选'
            }, {
              metricKey: 'urine_volume_24h',
              metricName: '24小时尿量',
              valueNumeric: 2300,
              unit: 'ml',
              sourceLabel: '识别候选'
            }]
          }]
        }]
      });
    },
    updateOcrDraft(payload) {
      calls.push({ type: 'update', payload });
      return Promise.resolve({ status: 'updated' });
    },
    resolveOcrConflict(payload) {
      calls.push({ type: 'resolve', payload });
      return Promise.resolve({ status: 'resolved' });
    }
  };
  try {
    require.cache[apiModulePath] = {
      id: apiModulePath,
      filename: apiModulePath,
      loaded: true,
      exports: { api: stubApi }
    };
    global.setTimeout = (handler) => {
      if (typeof handler === 'function') handler();
      return 0;
    };
    global.wx = {
      showToast: ({ title, icon }) => { toasts.push({ title, icon }); },
      navigateBack: () => { navigatedBack = true; }
    };
    global.getCurrentPages = () => [{}, { loadTask: () => { previousReloaded = true; } }];
    global.Page = (config) => { pageConfig = config; };
    delete require.cache[pageModulePath];
    require(pagePath);
    const page = {
      ...pageConfig,
      data: JSON.parse(JSON.stringify(pageConfig.data)),
      setData(update) {
        this.data = {
          ...this.data,
          ...update
        };
      }
    };

    page.onLoad({ taskId: 'task_conflicts', reportIdx: '0' });
    await Promise.resolve();
    await Promise.resolve();

    assert.strictEqual(page.data.conflictCount, 4);
    assert.strictEqual(page.data.autoIgnoredCount, 1);
    assert.strictEqual(page.data.conflicts.length, 4);
    assert.strictEqual(page.data.conflicts[0].candidates.length, 1, 'empty conflict candidates should fall back to the current OCR metric');
    assert.strictEqual(page.data.conflicts[0].candidates[0].sourceLabel, '当前识别结果');
    assert.strictEqual(page.data.conflicts[1].candidates.length, 2);
    assert.strictEqual(page.data.conflicts[3].selectedIndex, -1, 'suspect non-report metrics should default to delete');

    page.choose({
      currentTarget: {
        dataset: {
          conflictIndex: 1,
          index: 1
        }
      }
    });
    page.choose({
      currentTarget: {
        dataset: {
          conflictIndex: 2,
          index: -1
        }
      }
    });

    await page.apply();

    const updateCall = calls.find((call) => call.type === 'update');
    assert.ok(updateCall, 'invalid conflicts should be cleaned from the OCR draft before resolving visible conflicts');
    assert.strictEqual(updateCall.payload.draft.conflicts.length, 4);
    assert.strictEqual(updateCall.payload.draft.conflicts.some((conflict) => !conflict.metricKey && !conflict.metricName), false);
    assert.deepStrictEqual(calls.filter((call) => call.type === 'resolve').map((call) => call.payload), [{
      taskId: 'task_conflicts',
      draftId: 'draft_conflicts',
      metricKey: 'wbc',
      selectedCandidateIndex: 0,
      resolution: 'keep'
    }, {
      taskId: 'task_conflicts',
      draftId: 'draft_conflicts',
      metricKey: 'rbc',
      selectedCandidateIndex: 1,
      resolution: 'keep'
    }, {
      taskId: 'task_conflicts',
      draftId: 'draft_conflicts',
      metricKey: 'hgb',
      selectedCandidateIndex: 0,
      resolution: 'delete'
    }, {
      taskId: 'task_conflicts',
      draftId: 'draft_conflicts',
      metricKey: 'urine_volume_24h',
      selectedCandidateIndex: 0,
      resolution: 'delete'
    }]);
    assert.strictEqual(previousReloaded, true);
    assert.strictEqual(navigatedBack, true);
    assert.deepStrictEqual(toasts, [{ title: '已处理 5 项冲突', icon: 'success' }]);
  } finally {
    if (savedApiCache) require.cache[apiModulePath] = savedApiCache;
    else delete require.cache[apiModulePath];
    global.wx = savedWx;
    global.Page = savedPage;
    global.getCurrentPages = savedGetCurrentPages;
    global.setTimeout = savedSetTimeout;
    delete require.cache[pageModulePath];
  }
});

sequentialChecks.push(async () => {
  const pagePath = path.resolve(__dirname, '..', 'miniprogram', 'pages', 'upload', 'confirm.js');
  const apiPath = path.resolve(__dirname, '..', 'miniprogram', 'utils', 'api.js');
  const pageModulePath = require.resolve(pagePath);
  const apiModulePath = require.resolve(apiPath);
  const savedWx = global.wx;
  const savedPage = global.Page;
  const savedGetApp = global.getApp;
  const savedApiCache = require.cache[apiModulePath];
  const storageState = {
    pendingOcrTasks: [{
      taskId: 'task_confirm',
      status: 'ready_to_save',
      photoCount: 1,
      reportCount: 1
    }]
  };
  const calls = [];
  let pageConfig = null;
  const stubApi = {
    deleteOcrDraft(taskId, draftId) {
      calls.push({ taskId, draftId });
      const task = {
        id: 'task_confirm',
        status: 'cancelled',
        profileId: 'profile_confirm',
        photoCount: 1,
        reportCount: 0,
        drafts: []
      };
      return {
        then(onFulfilled) {
          onFulfilled(task);
          return {
            catch() {}
          };
        }
      };
    }
  };
  try {
    require.cache[apiModulePath] = {
      id: apiModulePath,
      filename: apiModulePath,
      loaded: true,
      exports: { api: stubApi }
    };
    global.setTimeout = (handler) => {
      if (typeof handler === 'function') handler();
      return 0;
    };
    global.wx = {
      getStorageSync: (key) => storageState[key],
      setStorageSync: (key, value) => { storageState[key] = value; },
      showModal: ({ success }) => success({ confirm: true }),
      showToast: () => {}
    };
    global.getApp = () => ({ getCurrentProfileId: () => 'profile_confirm' });
    global.Page = (config) => { pageConfig = config; };
    delete require.cache[pageModulePath];
    require(pagePath);
    const page = {
      ...pageConfig,
      data: {
        ...JSON.parse(JSON.stringify(pageConfig.data)),
        removingDraftIndex: -1,
        reports: [{ draftId: 'draft_1' }],
        reportCount: 1,
        unresolvedConflictCount: 0,
        taskStatus: 'ready_to_save'
      },
      setData(update) {
        this.data = {
          ...this.data,
          ...update
        };
      }
    };
    page.taskId = 'task_confirm';
    page.drafts = [{
      draftId: 'draft_1',
      basicInfo: {
        type: 'Blood lipid',
        hospital: 'Hospital A',
        reportDate: '2025-08-25',
        reportLike: true,
        modality: 'laboratory'
      },
      metrics: [{
        metricKey: 'ldl_cholesterol',
        metricName: 'LDL',
        valueNumeric: 5.55,
        valueType: 'quantitative',
        tone: 'high',
        mappingStatus: 'suggested'
      }],
      conflicts: []
    }];

    page.removeDraft({ currentTarget: { dataset: { index: 0 } } });

    assert.deepStrictEqual(calls, [{ taskId: 'task_confirm', draftId: 'draft_1' }]);
    assert.deepStrictEqual(page.drafts, [], 'removed draft should be dropped from confirm page state');
    assert.deepStrictEqual(page.data.reports, [], 'confirm page should show an empty report list after removing the last draft');
    assert.strictEqual(page.data.reportCount, 0);
    assert.strictEqual(page.data.taskStatus, 'cancelled');
    assert.strictEqual(page.data.removingDraftIndex, -1);
    assert.strictEqual(storageState.pendingOcrTasks[0].status, 'cancelled');
    assert.strictEqual(storageState.pendingOcrTasks[0].reportCount, 0);
  } finally {
    if (savedApiCache) require.cache[apiModulePath] = savedApiCache;
    else delete require.cache[apiModulePath];
    global.wx = savedWx;
    global.Page = savedPage;
    global.getApp = savedGetApp;
    delete require.cache[pageModulePath];
  }
});

sequentialChecks.push(async () => {
  const pagePath = path.resolve(__dirname, '..', 'miniprogram', 'pages', 'upload', 'confirm.js');
  const apiPath = path.resolve(__dirname, '..', 'miniprogram', 'utils', 'api.js');
  const pageModulePath = require.resolve(pagePath);
  const apiModulePath = require.resolve(apiPath);
  const savedWx = global.wx;
  const savedPage = global.Page;
  const savedGetApp = global.getApp;
  const savedSetTimeout = global.setTimeout;
  const savedApiCache = require.cache[apiModulePath];
  const storageState = {
    pendingOcrTasks: [{ taskId: 'task_refresh_conflict', status: 'needs_confirmation', reportCount: 1 }]
  };
  const calls = [];
  const toasts = [];
  let pageConfig = null;
  const cleanDraft = {
    draftId: 'draft_refresh_conflict',
    status: 'needs_review',
    basicInfo: {
      type: 'Blood routine',
      hospital: 'Hospital A',
      reportDate: '2025-08-25',
      reportLike: true,
      modality: 'laboratory',
      ocrReviewedAt: '2026-06-04T00:00:00.000Z'
    },
    metrics: [{
      metricKey: 'wbc',
      metricName: 'WBC',
      valueNumeric: 4.3,
      valueType: 'quantitative',
      mappingStatus: 'suggested',
      ocrConfidence: 0.99
    }],
    findings: [],
    warnings: [],
    conflicts: []
  };
  const stubApi = {
    getOcrTask(taskId) {
      calls.push({ type: 'getOcrTask', taskId });
      return Promise.resolve({
        id: taskId,
        status: 'ready_to_save',
        profileId: 'profile_confirm',
        reportCount: 1,
        photoCount: 1,
        drafts: [cleanDraft]
      });
    },
    getProfiles() {
      calls.push({ type: 'getProfiles' });
      return Promise.resolve([{ id: 'profile_confirm', relation: '', realName: 'A' }]);
    },
    checkDuplicateReports(payload) {
      calls.push({ type: 'checkDuplicateReports', payload });
      return Promise.resolve({ hasDuplicates: false, candidates: [] });
    },
    batchCreateReports(payload) {
      calls.push({ type: 'batchCreateReports', payload });
      return Promise.resolve({ reports: [{ id: 'saved_report_1' }] });
    }
  };
  try {
    require.cache[apiModulePath] = {
      id: apiModulePath,
      filename: apiModulePath,
      loaded: true,
      exports: { api: stubApi }
    };
    global.setTimeout = (handler) => {
      if (typeof handler === 'function') handler();
      return 0;
    };
    global.wx = {
      getStorageSync: (key) => storageState[key],
      setStorageSync: (key, value) => { storageState[key] = value; },
      removeStorageSync: (key) => { delete storageState[key]; },
      showToast: ({ title, icon }) => { toasts.push({ title, icon }); },
      switchTab: ({ success }) => { if (success) success(); }
    };
    global.getApp = () => ({ getCurrentProfileId: () => 'profile_confirm' });
    global.Page = (config) => { pageConfig = config; };
    delete require.cache[pageModulePath];
    require(pagePath);
    const page = {
      ...pageConfig,
      data: {
        ...JSON.parse(JSON.stringify(pageConfig.data)),
        profileId: 'profile_confirm',
        reports: [{
          draftId: 'draft_refresh_conflict',
          conflict: true,
          conflictCount: 1,
          basicInfoIncomplete: false,
          needsManualInput: false
        }],
        reportCount: 1,
        unresolvedConflictCount: 1,
        taskStatus: 'needs_confirmation'
      },
      setData(update) {
        this.data = {
          ...this.data,
          ...update
        };
      }
    };
    page.taskId = 'task_refresh_conflict';
    page.drafts = [{
      ...cleanDraft,
      conflicts: [{ metricKey: 'wbc', candidates: [] }]
    }];

    await page.saveAll();
    await Promise.resolve();
    await Promise.resolve();

    assert.ok(calls.some((call) => call.type === 'getOcrTask'), 'save should refresh stale conflict state before blocking');
    assert.ok(calls.some((call) => call.type === 'checkDuplicateReports'), 'save should continue after refreshed conflict count reaches zero');
    assert.ok(calls.some((call) => call.type === 'batchCreateReports'), 'save should create reports after stale conflicts are cleared by refresh');
    assert.strictEqual(page.data.unresolvedConflictCount, 0);
    assert.strictEqual(page.data.saveDebug, 'navigated_health');
    assert.deepStrictEqual(toasts, []);
  } finally {
    if (savedApiCache) require.cache[apiModulePath] = savedApiCache;
    else delete require.cache[apiModulePath];
    global.wx = savedWx;
    global.Page = savedPage;
    global.getApp = savedGetApp;
    global.setTimeout = savedSetTimeout;
    delete require.cache[pageModulePath];
  }
});

asyncChecks.push((async () => {
  const pagePath = path.resolve(__dirname, '..', 'miniprogram', 'pages', 'upload', 'confirm.js');
  const apiPath = path.resolve(__dirname, '..', 'miniprogram', 'utils', 'api.js');
  const pageModulePath = require.resolve(pagePath);
  const apiModulePath = require.resolve(apiPath);
  const savedWx = global.wx;
  const savedPage = global.Page;
  const savedGetApp = global.getApp;
  const savedSetTimeout = global.setTimeout;
  const savedApiCache = require.cache[apiModulePath];
  const storageState = {
    pendingOcrTasks: [{
      taskId: 'task_remove_stale',
      status: 'ready_to_save',
      photoCount: 1,
      reportCount: 1
    }]
  };
  const switchTabs = [];
  let pageConfig = null;
  const stubApi = {
    deleteOcrDraft() {
      return {
        then() {
          return {
            catch(onRejected) {
              onRejected({ code: 'NOT_FOUND', statusCode: 404, message: 'missing OCR task' });
            }
          };
        }
      };
    }
  };
  try {
    require.cache[apiModulePath] = {
      id: apiModulePath,
      filename: apiModulePath,
      loaded: true,
      exports: { api: stubApi }
    };
    global.wx = {
      getStorageSync: (key) => storageState[key],
      setStorageSync: (key, value) => { storageState[key] = value; },
      showModal: ({ success }) => success({ confirm: true }),
      showToast: () => {},
      switchTab: ({ url }) => { switchTabs.push(url); }
    };
    global.setTimeout = (fn) => {
      fn();
      return 0;
    };
    global.getApp = () => ({ getCurrentProfileId: () => 'profile_confirm' });
    global.Page = (config) => { pageConfig = config; };
    delete require.cache[pageModulePath];
    require(pagePath);
    const page = {
      ...pageConfig,
      data: {
        ...JSON.parse(JSON.stringify(pageConfig.data)),
        removingDraftIndex: -1,
        reports: [{ draftId: 'draft_stale' }],
        reportCount: 1,
        unresolvedConflictCount: 0,
        taskStatus: 'ready_to_save'
      },
      setData(update) {
        this.data = {
          ...this.data,
          ...update
        };
      }
    };
    page.taskId = 'task_remove_stale';
    page.drafts = [{ draftId: 'draft_stale', basicInfo: {}, metrics: [], conflicts: [] }];

    page.removeDraft({ currentTarget: { dataset: { index: 0 } } });

    assert.strictEqual(page.data.removingDraftIndex, -1, 'stale remove should restore the remove button state');
    assert.deepStrictEqual(storageState.pendingOcrTasks, [], 'stale remove should clear the pending OCR task cache');
    assert.deepStrictEqual(switchTabs, ['/pages/home/index'], 'stale remove should leave the stale confirm page');
  } finally {
    if (savedApiCache) require.cache[apiModulePath] = savedApiCache;
    else delete require.cache[apiModulePath];
    global.wx = savedWx;
    global.Page = savedPage;
    global.getApp = savedGetApp;
    global.setTimeout = savedSetTimeout;
    delete require.cache[pageModulePath];
  }
})());

asyncChecks.push((async () => {
  const pagePath = path.resolve(__dirname, '..', 'miniprogram', 'pages', 'upload', 'confirm.js');
  const apiPath = path.resolve(__dirname, '..', 'miniprogram', 'utils', 'api.js');
  const pageModulePath = require.resolve(pagePath);
  const apiModulePath = require.resolve(apiPath);
  const savedWx = global.wx;
  const savedPage = global.Page;
  const savedGetApp = global.getApp;
  const savedApiCache = require.cache[apiModulePath];
  const storageState = {
    pendingOcrTasks: [{
      taskId: 'task_split',
      status: 'ready_to_save',
      photoCount: 2,
      reportCount: 1
    }]
  };
  const calls = [];
  let pageConfig = null;
  const splitTask = {
    id: 'task_split',
    status: 'ready_to_save',
    profileId: 'profile_confirm',
    photoCount: 2,
    reportCount: 2,
    drafts: [{
      draftId: 'draft_split_1',
      sourcePhotoIds: ['photo_a'],
      pageCount: 1,
      basicInfo: {
        type: '血常规',
        hospital: 'Hospital A',
        reportDate: '2025-08-25',
        reportLike: true,
        modality: 'laboratory'
      },
      metrics: [{
        metricKey: 'wbc',
        metricName: '白细胞数目(WBC)',
        valueNumeric: 4.3,
        valueType: 'quantitative',
        tone: 'ok',
        mappingStatus: 'suggested'
      }],
      conflicts: []
    }, {
      draftId: 'draft_split_2',
      sourcePhotoIds: ['photo_b'],
      pageCount: 1,
      status: 'needs_manual_input',
      basicInfo: {
        type: '血常规',
        hospital: 'Hospital A',
        reportDate: '2025-08-25',
        reportLike: true,
        modality: 'laboratory'
      },
      metrics: [],
      conflicts: []
    }]
  };
  const stubApi = {
    splitOcrDraft(taskId, draftId) {
      calls.push({ taskId, draftId });
      return {
        then(onFulfilled) {
          onFulfilled(splitTask);
          return {
            catch() {}
          };
        }
      };
    }
  };
  try {
    require.cache[apiModulePath] = {
      id: apiModulePath,
      filename: apiModulePath,
      loaded: true,
      exports: { api: stubApi }
    };
    global.wx = {
      getStorageSync: (key) => storageState[key],
      setStorageSync: (key, value) => { storageState[key] = value; },
      showModal: ({ success }) => success({ confirm: true }),
      showToast: () => {}
    };
    global.getApp = () => ({ getCurrentProfileId: () => 'profile_confirm' });
    global.Page = (config) => { pageConfig = config; };
    delete require.cache[pageModulePath];
    require(pagePath);
    const page = {
      ...pageConfig,
      data: {
        ...JSON.parse(JSON.stringify(pageConfig.data)),
        splittingDraftIndex: -1,
        reports: [{
          draftId: 'draft_multi',
          canSplit: true,
          conflictCount: 0,
          needsManualInput: false
        }],
        reportCount: 1,
        unresolvedConflictCount: 0,
        taskStatus: 'ready_to_save'
      },
      setData(update) {
        this.data = {
          ...this.data,
          ...update
        };
      }
    };
    page.taskId = 'task_split';
    page.drafts = [{
      draftId: 'draft_multi',
      sourcePhotoIds: ['photo_a', 'photo_b'],
      pageCount: 2,
      basicInfo: {
        type: '血常规',
        hospital: 'Hospital A',
        reportDate: '2025-08-25',
        reportLike: true,
        modality: 'laboratory'
      },
      metrics: [{
        metricKey: 'wbc',
        metricName: '白细胞数目(WBC)',
        valueNumeric: 4.3,
        valueType: 'quantitative',
        tone: 'ok',
        mappingStatus: 'suggested'
      }],
      conflicts: []
    }];

    page.splitDraft({ currentTarget: { dataset: { index: 0 } } });

    assert.deepStrictEqual(calls, [{ taskId: 'task_split', draftId: 'draft_multi' }]);
    assert.strictEqual(page.drafts.length, 2, 'split draft should become two confirm-page drafts');
    assert.strictEqual(page.data.reports.length, 2);
    assert.strictEqual(page.data.reports[0].canSplit, false);
    assert.strictEqual(page.data.reports[1].needsManualInput, true, 'newly split unrecognized page should require manual review');
    assert.strictEqual(page.data.reportCount, 2);
    assert.strictEqual(page.data.splittingDraftIndex, -1);
    assert.strictEqual(storageState.pendingOcrTasks[0].status, 'ready_to_save');
    assert.strictEqual(storageState.pendingOcrTasks[0].reportCount, 2);
    assert.strictEqual(storageState.pendingOcrTasks[0].photoCount, 2);
  } finally {
    if (savedApiCache) require.cache[apiModulePath] = savedApiCache;
    else delete require.cache[apiModulePath];
    global.wx = savedWx;
    global.Page = savedPage;
    global.getApp = savedGetApp;
    delete require.cache[pageModulePath];
  }
})());

asyncChecks.push((async () => {
  const pagePath = path.resolve(__dirname, '..', 'miniprogram', 'pages', 'upload', 'confirm.js');
  const apiPath = path.resolve(__dirname, '..', 'miniprogram', 'utils', 'api.js');
  const pageModulePath = require.resolve(pagePath);
  const apiModulePath = require.resolve(apiPath);
  const savedWx = global.wx;
  const savedPage = global.Page;
  const savedGetApp = global.getApp;
  const savedApiCache = require.cache[apiModulePath];
  const toasts = [];
  const calls = [];
  let pageConfig = null;
  const splitError = {
    code: 'OCR_DRAFT_NOT_SPLITTABLE',
    message: 'Only multi-page OCR drafts can be split',
    statusCode: 409
  };
  const stubApi = {
    splitOcrDraft(taskId, draftId) {
      calls.push({ taskId, draftId });
      return {
        then() {
          return {
            catch(onRejected) {
              onRejected(splitError);
            }
          };
        }
      };
    }
  };
  try {
    require.cache[apiModulePath] = {
      id: apiModulePath,
      filename: apiModulePath,
      loaded: true,
      exports: { api: stubApi }
    };
    global.wx = {
      getStorageSync: () => [],
      setStorageSync: () => {},
      showModal: ({ success }) => success({ confirm: true }),
      showToast: ({ title, icon }) => { toasts.push({ title, icon }); }
    };
    global.getApp = () => ({ getCurrentProfileId: () => 'profile_confirm' });
    global.Page = (config) => { pageConfig = config; };
    delete require.cache[pageModulePath];
    require(pagePath);
    const page = {
      ...pageConfig,
      data: {
        ...JSON.parse(JSON.stringify(pageConfig.data)),
        splittingDraftIndex: -1,
        reports: [{
          draftId: 'draft_single',
          canSplit: true,
          conflictCount: 0,
          needsManualInput: false
        }],
        reportCount: 1,
        unresolvedConflictCount: 0,
        taskStatus: 'ready_to_save'
      },
      setData(update) {
        this.data = {
          ...this.data,
          ...update
        };
      }
    };
    page.taskId = 'task_split_fail';
    page.drafts = [{
      draftId: 'draft_single',
      sourcePhotoIds: ['photo_single', 'photo_missing_backend_rejects'],
      pageCount: 2,
      basicInfo: {
        type: '血常规',
        hospital: 'Hospital A',
        reportDate: '2025-08-25',
        reportLike: true,
        modality: 'laboratory'
      },
      metrics: [],
      conflicts: []
    }];

    page.splitDraft({ currentTarget: { dataset: { index: 0 } } });

    assert.deepStrictEqual(calls, [{ taskId: 'task_split_fail', draftId: 'draft_single' }]);
    assert.strictEqual(page.data.splittingDraftIndex, -1, 'failed split should restore the split button state');
    assert.deepStrictEqual(toasts, [{ title: '这份报告不能继续拆分', icon: 'none' }]);
    assert.strictEqual(page.drafts.length, 1, 'failed split should not mutate confirm-page drafts');
  } finally {
    if (savedApiCache) require.cache[apiModulePath] = savedApiCache;
    else delete require.cache[apiModulePath];
    global.wx = savedWx;
    global.Page = savedPage;
    global.getApp = savedGetApp;
    delete require.cache[pageModulePath];
  }
})());

asyncChecks.push((async () => {
  const pagePath = path.resolve(__dirname, '..', 'miniprogram', 'pages', 'upload', 'confirm.js');
  const apiPath = path.resolve(__dirname, '..', 'miniprogram', 'utils', 'api.js');
  const pageModulePath = require.resolve(pagePath);
  const apiModulePath = require.resolve(apiPath);
  const savedWx = global.wx;
  const savedPage = global.Page;
  const savedGetApp = global.getApp;
  const savedSetTimeout = global.setTimeout;
  const savedApiCache = require.cache[apiModulePath];
  const storageState = {
    pendingOcrTasks: [{
      taskId: 'task_split_stale',
      status: 'ready_to_save',
      photoCount: 2,
      reportCount: 1
    }]
  };
  const switchTabs = [];
  let pageConfig = null;
  const stubApi = {
    splitOcrDraft() {
      return {
        then() {
          return {
            catch(onRejected) {
              onRejected({ code: 'NOT_FOUND', statusCode: 404, message: 'missing OCR task' });
            }
          };
        }
      };
    }
  };
  try {
    require.cache[apiModulePath] = {
      id: apiModulePath,
      filename: apiModulePath,
      loaded: true,
      exports: { api: stubApi }
    };
    global.wx = {
      getStorageSync: (key) => storageState[key],
      setStorageSync: (key, value) => { storageState[key] = value; },
      showModal: ({ success }) => success({ confirm: true }),
      showToast: () => {},
      switchTab: ({ url }) => { switchTabs.push(url); }
    };
    global.setTimeout = (fn) => {
      fn();
      return 0;
    };
    global.getApp = () => ({ getCurrentProfileId: () => 'profile_confirm' });
    global.Page = (config) => { pageConfig = config; };
    delete require.cache[pageModulePath];
    require(pagePath);
    const page = {
      ...pageConfig,
      data: {
        ...JSON.parse(JSON.stringify(pageConfig.data)),
        splittingDraftIndex: -1,
        reports: [{
          draftId: 'draft_stale_multi',
          canSplit: true,
          conflictCount: 0,
          needsManualInput: false
        }],
        reportCount: 1,
        unresolvedConflictCount: 0,
        taskStatus: 'ready_to_save'
      },
      setData(update) {
        this.data = {
          ...this.data,
          ...update
        };
      }
    };
    page.taskId = 'task_split_stale';
    page.drafts = [{
      draftId: 'draft_stale_multi',
      sourcePhotoIds: ['photo_a', 'photo_b'],
      pageCount: 2,
      basicInfo: {},
      metrics: [],
      conflicts: []
    }];

    page.splitDraft({ currentTarget: { dataset: { index: 0 } } });

    assert.strictEqual(page.data.splittingDraftIndex, -1, 'stale split should restore the split button state');
    assert.deepStrictEqual(storageState.pendingOcrTasks, [], 'stale split should clear the pending OCR task cache');
    assert.deepStrictEqual(switchTabs, ['/pages/home/index'], 'stale split should leave the stale confirm page');
  } finally {
    if (savedApiCache) require.cache[apiModulePath] = savedApiCache;
    else delete require.cache[apiModulePath];
    global.wx = savedWx;
    global.Page = savedPage;
    global.getApp = savedGetApp;
    global.setTimeout = savedSetTimeout;
    delete require.cache[pageModulePath];
  }
})());

sequentialChecks.push(async () => {
  const pagePath = path.resolve(__dirname, '..', 'miniprogram', 'pages', 'upload', 'confirm.js');
  const apiPath = path.resolve(__dirname, '..', 'miniprogram', 'utils', 'api.js');
  const pageModulePath = require.resolve(pagePath);
  const apiModulePath = require.resolve(apiPath);
  const savedWx = global.wx;
  const savedPage = global.Page;
  const savedGetApp = global.getApp;
  const savedSetTimeout = global.setTimeout;
  const savedClearTimeout = global.clearTimeout;
  const savedDateNow = Date.now;
  const savedApiCache = require.cache[apiModulePath];
  const storageState = {
    pendingOcrTasks: [{
      taskId: 'task_progress',
      status: 'processing',
      photoCount: 3,
      reportCount: 3
    }]
  };
  const timers = [];
  const clearedTimers = [];
  let pageConfig = null;
  let nowMs = 5000;
  try {
    require.cache[apiModulePath] = {
      id: apiModulePath,
      filename: apiModulePath,
      loaded: true,
      exports: { api: {} }
    };
    global.wx = {
      getStorageSync: (key) => storageState[key],
      setStorageSync: (key, value) => { storageState[key] = value; },
      showToast: () => {}
    };
    global.setTimeout = (handler, delayMs) => {
      timers.push({ handler, delayMs });
      return `timer_${timers.length}`;
    };
    global.clearTimeout = (timerId) => { clearedTimers.push(timerId); };
    Date.now = () => nowMs;
    global.getApp = () => ({ getCurrentProfileId: () => 'profile_confirm' });
    global.Page = (config) => { pageConfig = config; };
    delete require.cache[pageModulePath];
    require(pagePath);
    const page = {
      ...pageConfig,
      data: JSON.parse(JSON.stringify(pageConfig.data)),
      setData(update) {
        this.data = {
          ...this.data,
          ...update
        };
      }
    };
    page.recognitionStartedAt = 1000;

    page.showRecognizingTask({
      id: 'task_progress',
      profileId: 'profile_confirm',
      status: 'processing',
      photoCount: 3,
      reportCount: 3,
      progress: {
        processedReports: 1,
        totalReports: 3,
        processingElapsedMs: 6200,
        isStale: false
      }
    });

    assert.strictEqual(page.data.recognizing, true);
    assert.strictEqual(page.data.slowRecognition, false);
    assert.strictEqual(page.data.recognitionTitle, '正在识别报告');
    assert.ok(page.data.recognitionProgressText.includes('已处理 1 / 3 份'));
    assert.ok(page.data.recognitionProgressText.includes('已等待 6 秒'));
    assert.strictEqual(page.data.recognitionProgressPercent, 33);
    assert.strictEqual(page.data.taskStatus, 'processing');
    assert.strictEqual(page.data.reportCount, 3);
    assert.deepStrictEqual(page.drafts, []);
    assert.strictEqual(storageState.pendingOcrTasks[0].status, 'processing');
    assert.strictEqual(storageState.pendingOcrTasks[0].reportCount, 3);
    assert.strictEqual(storageState.pendingOcrTasks[0].photoCount, 3);
    assert.strictEqual(timers.length, 1);
    assert.strictEqual(timers[0].delayMs, 1500);

    nowMs = 20000;
    page.showRecognizingTask({
      id: 'task_progress',
      profileId: 'profile_confirm',
      status: 'processing',
      photoCount: 3,
      reportCount: 3,
      progress: {
        processedReports: 2,
        totalReports: 3,
        processingElapsedMs: 123000,
        isStale: true
      }
    });

    assert.deepStrictEqual(clearedTimers, ['timer_1']);
    assert.strictEqual(timers.length, 2);
    assert.strictEqual(page.data.slowRecognition, true);
    assert.strictEqual(page.data.recognitionTitle, '识别耗时较久');
    assert.ok(page.data.recognitionStatusText.includes('超过预期'));
    assert.ok(page.data.recognitionProgressText.includes('已处理 2 / 3 份'));
    assert.ok(page.data.recognitionProgressText.includes('已等待 2 分 3 秒'));
    assert.strictEqual(page.data.recognitionProgressPercent, 67);

    nowMs = 26200;
    page.recognitionStartedAt = 20000;
    page.showRecognizingTask({
      id: 'task_single_progress',
      profileId: 'profile_confirm',
      status: 'processing',
      photoCount: 1,
      reportCount: 1,
      progress: {
        processedReports: 0,
        totalReports: 1,
        processingElapsedMs: 6200,
        isStale: false
      }
    });

    assert.deepStrictEqual(clearedTimers, ['timer_1', 'timer_2']);
    assert.strictEqual(timers.length, 3);
    assert.ok(page.data.recognitionProgressText.includes('已处理 0 / 1 份'));
    assert.ok(page.data.recognitionProgressText.includes('已等待 6 秒'));
    assert.ok(page.data.recognitionProgressPercent >= 8);
    assert.ok(page.data.recognitionProgressPercent < 100);
  } finally {
    if (savedApiCache) require.cache[apiModulePath] = savedApiCache;
    else delete require.cache[apiModulePath];
    global.wx = savedWx;
    global.Page = savedPage;
    global.getApp = savedGetApp;
    global.setTimeout = savedSetTimeout;
    global.clearTimeout = savedClearTimeout;
    Date.now = savedDateNow;
    delete require.cache[pageModulePath];
  }
});

sequentialChecks.push(async () => {
  const pagePath = path.resolve(__dirname, '..', 'miniprogram', 'pages', 'upload', 'confirm.js');
  const apiPath = path.resolve(__dirname, '..', 'miniprogram', 'utils', 'api.js');
  const pageModulePath = require.resolve(pagePath);
  const apiModulePath = require.resolve(apiPath);
  const savedWx = global.wx;
  const savedPage = global.Page;
  const savedGetApp = global.getApp;
  const savedApiCache = require.cache[apiModulePath];
  const toasts = [];
  let pageConfig = null;
  try {
    require.cache[apiModulePath] = {
      id: apiModulePath,
      filename: apiModulePath,
      loaded: true,
      exports: { api: {} }
    };
    global.wx = {
      getStorageSync: () => undefined,
      setStorageSync: () => {},
      showToast: ({ title, icon }) => { toasts.push({ title, icon }); }
    };
    global.getApp = () => ({ getCurrentProfileId: () => 'profile_confirm' });
    global.Page = (config) => { pageConfig = config; };
    delete require.cache[pageModulePath];
    require(pagePath);
    const page = {
      ...pageConfig,
      data: {
        ...JSON.parse(JSON.stringify(pageConfig.data)),
        saving: true,
        reports: [{
          draftId: 'draft_still_processing',
          needsManualInput: false,
          basicInfoIncomplete: false,
          manualText: ''
        }]
      },
      setData(update) {
        this.data = {
          ...this.data,
          ...update
        };
      }
    };

    const result = page.handleUnreviewedDraftsError({
      code: 'UNREVIEWED_OCR_DRAFTS',
      details: {
        drafts: [{
          draftId: '',
          status: 'processing',
          reason: 'task_still_processing'
        }]
      }
    });

    assert.strictEqual(result, false);
    assert.strictEqual(page.data.saving, false);
    assert.strictEqual(page.data.saveDebug, 'failed:OCR_TASK_STILL_PROCESSING');
    assert.strictEqual(page.data.reports[0].needsManualInput, false);
    assert.strictEqual(page.data.reports[0].basicInfoIncomplete, false);
    assert.deepStrictEqual(toasts, [{ title: '\u8bc6\u522b\u5b8c\u6210\u540e\u518d\u4fdd\u5b58', icon: 'none' }]);
  } finally {
    if (savedApiCache) require.cache[apiModulePath] = savedApiCache;
    else delete require.cache[apiModulePath];
    global.wx = savedWx;
    global.Page = savedPage;
    global.getApp = savedGetApp;
    global.setTimeout = savedSetTimeout;
    delete require.cache[pageModulePath];
  }
});

sequentialChecks.push(async () => {
  const pagePath = path.resolve(__dirname, '..', 'miniprogram', 'pages', 'upload', 'confirm.js');
  const apiPath = path.resolve(__dirname, '..', 'miniprogram', 'utils', 'api.js');
  const pageModulePath = require.resolve(pagePath);
  const apiModulePath = require.resolve(apiPath);
  const savedWx = global.wx;
  const savedPage = global.Page;
  const savedGetApp = global.getApp;
  const savedApiCache = require.cache[apiModulePath];
  const storageState = {
    pendingOcrTasks: [{
      taskId: 'task_backend_missing_basic_info',
      status: 'ready_to_save',
      photoCount: 1,
      reportCount: 1
    }]
  };
  const calls = [];
  const toasts = [];
  let pageConfig = null;
  const draft = {
    draftId: 'draft_backend_missing_basic_info',
    status: 'needs_review',
    basicInfo: {
      type: '\u8840\u5e38\u89c4',
      hospital: '\u5f85\u786e\u8ba4\u533b\u9662',
      reportDate: '2025-08-25',
      reportLike: true,
      modality: 'laboratory'
    },
    metrics: [{
      metricKey: 'wbc',
      metricName: '\u767d\u7ec6\u80de\u6570\u76ee(WBC)',
      valueNumeric: 4.3,
      valueType: 'quantitative',
      refRangeLow: 3.5,
      refRangeHigh: 9.5,
      tone: 'ok',
      mappingStatus: 'confirmed'
    }],
    findings: [],
    conflicts: []
  };
  const stubApi = {
    checkDuplicateReports(payload) {
      calls.push({ type: 'duplicate', payload });
      return Promise.resolve({ hasDuplicates: false, candidates: [] });
    },
    batchCreateReports(payload) {
      calls.push({ type: 'save', payload });
      return Promise.reject({
        code: 'UNREVIEWED_OCR_DRAFTS',
        message: 'OCR reports still need review or manual completion before saving',
        details: {
          drafts: [{
            draftId: 'draft_backend_missing_basic_info',
            status: 'needs_review',
            reason: 'missing_basic_info'
          }]
        }
      });
    }
  };
  try {
    require.cache[apiModulePath] = {
      id: apiModulePath,
      filename: apiModulePath,
      loaded: true,
      exports: { api: stubApi }
    };
    global.wx = {
      getStorageSync: (key) => storageState[key],
      setStorageSync: (key, value) => { storageState[key] = value; },
      showToast: ({ title, icon }) => { toasts.push({ title, icon }); }
    };
    global.getApp = () => ({ getCurrentProfileId: () => 'profile_confirm' });
    global.Page = (config) => { pageConfig = config; };
    delete require.cache[pageModulePath];
    require(pagePath);
    const page = {
      ...pageConfig,
      data: {
        ...JSON.parse(JSON.stringify(pageConfig.data)),
        saving: false,
        profileId: 'profile_confirm',
        reports: [{
          draftId: 'draft_backend_missing_basic_info',
          needsManualInput: false,
          basicInfoIncomplete: false,
          manualText: ''
        }],
        reportCount: 1,
        unresolvedConflictCount: 0,
        taskStatus: 'ready_to_save'
      },
      setData(update) {
        this.data = {
          ...this.data,
          ...update
        };
      }
    };
    page.taskId = 'task_backend_missing_basic_info';
    page.drafts = [draft];

    const result = await page.saveAll();

    assert.strictEqual(result, false);
    assert.deepStrictEqual(calls.map((call) => call.type), ['duplicate', 'save']);
    assert.strictEqual(page.data.saving, false);
    assert.strictEqual(page.data.saveDebug, 'failed:UNREVIEWED_OCR_DRAFTS');
    assert.strictEqual(page.data.reports[0].basicInfoIncomplete, true);
    assert.strictEqual(page.data.reports[0].needsManualInput, true);
    assert.ok(page.data.reports[0].manualText.includes('\u533b\u9662'));
    assert.deepStrictEqual(toasts, [{ title: '\u8bf7\u5148\u8865\u9f50 1 \u4efd\u62a5\u544a\u57fa\u7840\u4fe1\u606f', icon: 'none' }]);
  } finally {
    if (savedApiCache) require.cache[apiModulePath] = savedApiCache;
    else delete require.cache[apiModulePath];
    global.wx = savedWx;
    global.Page = savedPage;
    global.getApp = savedGetApp;
    delete require.cache[pageModulePath];
  }
});

sequentialChecks.push(async () => {
  const pagePath = path.resolve(__dirname, '..', 'miniprogram', 'pages', 'upload', 'confirm.js');
  const apiPath = path.resolve(__dirname, '..', 'miniprogram', 'utils', 'api.js');
  const pageModulePath = require.resolve(pagePath);
  const apiModulePath = require.resolve(apiPath);
  const savedWx = global.wx;
  const savedPage = global.Page;
  const savedGetApp = global.getApp;
  const savedSetTimeout = global.setTimeout;
  const savedApiCache = require.cache[apiModulePath];
  const storageState = {
    pendingOcrTasks: [{
      taskId: 'task_risk_review',
      status: 'ready_to_save',
      photoCount: 1,
      reportCount: 1
    }]
  };
  const calls = [];
  const toasts = [];
  let switchedTo = '';
  let pageConfig = null;
  const riskDraft = {
    draftId: 'draft_risk_review',
    status: 'needs_review',
    basicInfo: {
      type: '\u8840\u5e38\u89c4',
      hospital: '\u5929\u6d25\u5e02\u67d0\u533b\u9662',
      reportDate: '2025-08-25',
      reportLike: true,
      modality: 'laboratory'
    },
    metrics: [{
      metricKey: 'wbc',
      metricName: '\u767d\u7ec6\u80de\u6570\u76ee(WBC)',
      valueNumeric: 4.3,
      valueType: 'quantitative',
      refRangeLow: 3.5,
      refRangeHigh: 9.5,
      tone: 'ok',
      mappingStatus: 'suggested',
      ocrConfidence: 0.72
    }],
    findings: [],
    conflicts: [],
    warnings: [{
      code: 'OCR_IMAGE_LOW_RESOLUTION',
      message: '\u56fe\u7247\u5206\u8fa8\u7387\u504f\u4f4e\uff0c\u5c0f\u5b57\u8868\u683c\u53ef\u80fd\u8bc6\u522b\u4e0d\u51c6'
    }]
  };
  const stubApi = {
    getOcrTask(taskId) {
      calls.push({ type: 'get', taskId });
      return Promise.resolve({
        id: 'task_risk_review',
        profileId: 'profile_confirm',
        status: 'ready_to_save',
        reportCount: 1,
        photoCount: 1,
        drafts: [riskDraft]
      });
    },
    checkDuplicateReports() {
      calls.push({ type: 'duplicate' });
      return Promise.resolve({ hasDuplicates: false, candidates: [] });
    },
    batchCreateReports() {
      calls.push({ type: 'save' });
      return Promise.resolve({ reports: [{ id: 'report_risk_review' }] });
    }
  };
  try {
    require.cache[apiModulePath] = {
      id: apiModulePath,
      filename: apiModulePath,
      loaded: true,
      exports: { api: stubApi }
    };
    global.setTimeout = (handler) => {
      if (typeof handler === 'function') handler();
      return 0;
    };
    global.wx = {
      getStorageSync: (key) => storageState[key],
      setStorageSync: (key, value) => { storageState[key] = value; },
      removeStorageSync: (key) => { delete storageState[key]; },
      switchTab: ({ url, success }) => {
        switchedTo = url;
        if (success) success();
      },
      showToast: ({ title, icon }) => { toasts.push({ title, icon }); }
    };
    global.getApp = () => ({ getCurrentProfileId: () => 'profile_confirm' });
    global.Page = (config) => { pageConfig = config; };
    delete require.cache[pageModulePath];
    require(pagePath);
    const page = {
      ...pageConfig,
      data: JSON.parse(JSON.stringify(pageConfig.data)),
      setData(update) {
        this.data = {
          ...this.data,
          ...update
        };
      }
    };
    page.taskId = 'task_risk_review';

    page.loadTask();
    await Promise.resolve();
    await Promise.resolve();

    assert.strictEqual(page.data.reports[0].basicInfoIncomplete, false);
    assert.strictEqual(page.data.reports[0].needsManualInput, false);
    assert.strictEqual(page.data.reports[0].requiresDetailReview, true);
    assert.ok(page.data.reports[0].reviewRequiredText.includes('OCR'));

    const result = await page.saveAll();
    assert.strictEqual(result, undefined);
    assert.deepStrictEqual(calls.map((call) => call.type), ['get', 'duplicate', 'save']);
    assert.deepStrictEqual(toasts, []);
    assert.strictEqual(switchedTo, '/pages/health/index');
    assert.strictEqual(storageState.lastSavedReportToast, '已保存 1 份报告');
  } finally {
    if (savedApiCache) require.cache[apiModulePath] = savedApiCache;
    else delete require.cache[apiModulePath];
    global.wx = savedWx;
    global.Page = savedPage;
    global.getApp = savedGetApp;
    global.setTimeout = savedSetTimeout;
    delete require.cache[pageModulePath];
  }
});

sequentialChecks.push(async () => {
  const pagePath = path.resolve(__dirname, '..', 'miniprogram', 'pages', 'upload', 'confirm.js');
  const apiPath = path.resolve(__dirname, '..', 'miniprogram', 'utils', 'api.js');
  const pageModulePath = require.resolve(pagePath);
  const apiModulePath = require.resolve(apiPath);
  const savedWx = global.wx;
  const savedPage = global.Page;
  const savedGetApp = global.getApp;
  const savedSetTimeout = global.setTimeout;
  const savedApiCache = require.cache[apiModulePath];
  const storageState = {
    pendingOcrTasks: [{
      taskId: 'task_basic_info_refresh',
      status: 'ready_to_save',
      photoCount: 1,
      reportCount: 1
    }]
  };
  const calls = [];
  const toasts = [];
  let pageConfig = null;
  let switchedTo = '';
  let getCount = 0;
  const missingDraft = {
    draftId: 'draft_basic_info_refresh',
    status: 'needs_review',
    basicInfo: {
      type: '\u8840\u5e38\u89c4',
      hospital: '',
      hospitalSource: 'unknown',
      reportDate: '',
      reportDateSource: 'unknown',
      reportLike: true,
      modality: 'laboratory'
    },
    metrics: [{
      metricKey: 'wbc',
      metricName: '\u767d\u7ec6\u80de\u6570\u76ee(WBC)',
      valueNumeric: 4.3,
      valueType: 'quantitative',
      refRangeLow: 3.5,
      refRangeHigh: 9.5,
      tone: 'ok',
      mappingStatus: 'suggested'
    }],
    findings: [],
    conflicts: [],
    warnings: [{
      code: 'OCR_IMAGE_LOW_RESOLUTION',
      message: '\u56fe\u7247\u5206\u8fa8\u7387\u504f\u4f4e\uff0c\u5c0f\u5b57\u8868\u683c\u53ef\u80fd\u8bc6\u522b\u4e0d\u51c6'
    }, {
      code: 'BASIC_INFO_INFERRED_FROM_BATCH',
      message: '\u90e8\u5206\u57fa\u672c\u4fe1\u606f\u6765\u81ea\u540c\u6279\u63a8\u6d4b'
    }]
  };
  const fixedDraft = {
    ...missingDraft,
    basicInfo: {
      ...missingDraft.basicInfo,
      hospital: '\u5929\u6d25\u5e02\u67d0\u533b\u9662',
      hospitalSource: 'user_edited',
      reportDate: '2025-08-25',
      reportDateSource: 'user_edited',
      ocrReviewedAt: '2026-06-04T00:00:00.000Z',
      ocrReviewSource: 'edit_detail'
    }
  };
  const stubApi = {
    getOcrTask(taskId) {
      calls.push({ type: 'get', taskId });
      getCount += 1;
      return Promise.resolve({
        id: 'task_basic_info_refresh',
        profileId: 'profile_confirm',
        status: 'ready_to_save',
        reportCount: 1,
        photoCount: 1,
        drafts: [getCount === 1 ? missingDraft : fixedDraft]
      });
    },
    checkDuplicateReports(payload) {
      calls.push({ type: 'duplicate', payload });
      return Promise.resolve({ hasDuplicates: false, candidates: [] });
    },
    batchCreateReports(payload, config) {
      calls.push({ type: 'save', payload, config });
      return Promise.resolve({
        reports: [{
          id: 'report_basic_info_refresh',
          type: '\u8840\u5e38\u89c4',
          reportDate: '2025-08-25'
        }]
      });
    }
  };
  try {
    require.cache[apiModulePath] = {
      id: apiModulePath,
      filename: apiModulePath,
      loaded: true,
      exports: { api: stubApi }
    };
    global.setTimeout = (handler) => {
      if (typeof handler === 'function') handler();
      return 0;
    };
    global.wx = {
      getStorageSync: (key) => storageState[key],
      setStorageSync: (key, value) => { storageState[key] = value; },
      removeStorageSync: (key) => { delete storageState[key]; },
      showToast: ({ title, icon }) => { toasts.push({ title, icon }); },
      switchTab: ({ url, success }) => {
        switchedTo = url;
        if (success) success();
      }
    };
    global.getApp = () => ({ getCurrentProfileId: () => 'profile_confirm' });
    global.Page = (config) => { pageConfig = config; };
    delete require.cache[pageModulePath];
    require(pagePath);
    const page = {
      ...pageConfig,
      data: JSON.parse(JSON.stringify(pageConfig.data)),
      setData(update) {
        this.data = {
          ...this.data,
          ...update
        };
      }
    };
    page.taskId = 'task_basic_info_refresh';

    page.onShow();
    await Promise.resolve();
    await Promise.resolve();

    assert.strictEqual(page.data.reports[0].basicInfoIncomplete, true);
    assert.strictEqual(page.data.reports[0].needsManualInput, true);

    page.onShow();
    await Promise.resolve();
    await Promise.resolve();

    assert.strictEqual(page.data.reports[0].basicInfoIncomplete, false);
    assert.strictEqual(page.data.reports[0].needsManualInput, false);
    assert.strictEqual(page.drafts[0].basicInfo.hospital, '\u5929\u6d25\u5e02\u67d0\u533b\u9662');
    assert.strictEqual(page.drafts[0].basicInfo.reportDate, '2025-08-25');

    await page.saveAll();

    assert.deepStrictEqual(calls.map((call) => call.type), ['get', 'get', 'duplicate', 'save']);
    assert.strictEqual(calls[2].payload.reports[0].basicInfo.hospital, '\u5929\u6d25\u5e02\u67d0\u533b\u9662');
    assert.strictEqual(calls[3].payload.reports[0].basicInfo.reportDate, '2025-08-25');
    assert.strictEqual(calls[3].config.idempotencyKey, 'save_task_basic_info_refresh_new');
    assert.strictEqual(switchedTo, '/pages/health/index');
    assert.deepStrictEqual(storageState.pendingOcrTasks, []);
    assert.strictEqual(storageState.lastSavedReportToast, '\u5df2\u4fdd\u5b58 1 \u4efd\u62a5\u544a');
    assert.strictEqual(storageState.healthDefaultView, 'time');
    assert.deepStrictEqual(toasts, []);
  } finally {
    if (savedApiCache) require.cache[apiModulePath] = savedApiCache;
    else delete require.cache[apiModulePath];
    global.wx = savedWx;
    global.Page = savedPage;
    global.getApp = savedGetApp;
    global.setTimeout = savedSetTimeout;
    delete require.cache[pageModulePath];
  }
});

sequentialChecks.push(async () => {
  const pagePath = path.resolve(__dirname, '..', 'miniprogram', 'pages', 'upload', 'confirm.js');
  const apiPath = path.resolve(__dirname, '..', 'miniprogram', 'utils', 'api.js');
  const pageModulePath = require.resolve(pagePath);
  const apiModulePath = require.resolve(apiPath);
  const savedWx = global.wx;
  const savedPage = global.Page;
  const savedGetApp = global.getApp;
  const savedApiCache = require.cache[apiModulePath];
  const storageState = {
    pendingOcrTasks: [{
      taskId: 'task_missing_basic_info',
      status: 'ready_to_save',
      photoCount: 1,
      reportCount: 1
    }]
  };
  const calls = [];
  const toasts = [];
  let pageConfig = null;
  const missingBasicInfoDraft = {
    draftId: 'draft_missing_basic_info',
    status: 'needs_review',
    basicInfo: {
      type: '\u8840\u5e38\u89c4',
      hospital: '',
      hospitalSource: 'unknown',
      reportDate: '',
      reportDateSource: 'unknown',
      reportLike: true,
      modality: 'laboratory'
    },
    metrics: [{
      metricKey: 'wbc',
      metricName: '\u767d\u7ec6\u80de\u6570\u76ee(WBC)',
      valueNumeric: 4.3,
      valueType: 'quantitative',
      refRangeLow: 3.5,
      refRangeHigh: 9.5,
      tone: 'ok',
      mappingStatus: 'suggested'
    }],
    findings: [],
    conflicts: []
  };
  const stubApi = {
    getOcrTask(taskId) {
      calls.push({ type: 'get', taskId });
      return Promise.resolve({
        id: 'task_missing_basic_info',
        profileId: 'profile_confirm',
        status: 'ready_to_save',
        reportCount: 1,
        photoCount: 1,
        drafts: [missingBasicInfoDraft]
      });
    },
    checkDuplicateReports() {
      calls.push({ type: 'duplicate' });
      return Promise.resolve({ hasDuplicates: false, candidates: [] });
    },
    batchCreateReports() {
      calls.push({ type: 'save' });
      return Promise.resolve({ reports: [] });
    }
  };
  try {
    require.cache[apiModulePath] = {
      id: apiModulePath,
      filename: apiModulePath,
      loaded: true,
      exports: { api: stubApi }
    };
    global.wx = {
      getStorageSync: (key) => storageState[key],
      setStorageSync: (key, value) => { storageState[key] = value; },
      showToast: ({ title, icon }) => { toasts.push({ title, icon }); }
    };
    global.getApp = () => ({ getCurrentProfileId: () => 'profile_confirm' });
    global.Page = (config) => { pageConfig = config; };
    delete require.cache[pageModulePath];
    require(pagePath);
    const page = {
      ...pageConfig,
      data: JSON.parse(JSON.stringify(pageConfig.data)),
      setData(update) {
        this.data = {
          ...this.data,
          ...update
        };
      }
    };
    page.taskId = 'task_missing_basic_info';

    page.loadTask();
    await Promise.resolve();
    await Promise.resolve();

    assert.strictEqual(page.data.reports.length, 1);
    assert.strictEqual(page.data.reports[0].basicInfoIncomplete, true);
    assert.strictEqual(page.data.reports[0].needsManualInput, true);
    assert.strictEqual(page.data.reports[0].warningText, '\u56fe\u7247\u5206\u8fa8\u7387\u504f\u4f4e\uff0c\u5c0f\u5b57\u8868\u683c\u53ef\u80fd\u8bc6\u522b\u4e0d\u51c6');
    assert.ok(page.data.reports[0].warningMoreText.includes('1'), 'confirm page should summarize additional OCR warnings');
    assert.ok(page.data.reports[0].manualText.includes('\u57fa\u672c\u4fe1\u606f') || page.data.reports[0].manualText.includes('\u533b\u9662'));
    assert.strictEqual(page.data.errorMessage, '', 'successful OCR confirmation state should not retain a failure message');

    const result = await page.saveAll();
    assert.strictEqual(result, false);
    assert.deepStrictEqual(calls.map((call) => call.type), ['get']);
    assert.deepStrictEqual(toasts, [{ title: '\u8bf7\u5148\u8865\u9f50 1 \u4efd\u62a5\u544a\u57fa\u7840\u4fe1\u606f', icon: 'none' }]);
  } finally {
    if (savedApiCache) require.cache[apiModulePath] = savedApiCache;
    else delete require.cache[apiModulePath];
    global.wx = savedWx;
    global.Page = savedPage;
    global.getApp = savedGetApp;
    delete require.cache[pageModulePath];
  }
});

sequentialChecks.push(async () => {
  const pagePath = path.resolve(__dirname, '..', 'miniprogram', 'pages', 'upload', 'confirm.js');
  const apiPath = path.resolve(__dirname, '..', 'miniprogram', 'utils', 'api.js');
  const pageModulePath = require.resolve(pagePath);
  const apiModulePath = require.resolve(apiPath);
  const savedWx = global.wx;
  const savedPage = global.Page;
  const savedGetApp = global.getApp;
  const savedApiCache = require.cache[apiModulePath];
  const storageState = {
    pendingOcrTasks: [{
      taskId: 'task_unreviewed_backend',
      status: 'ready_to_save',
      photoCount: 1,
      reportCount: 1
    }]
  };
  const calls = [];
  const toasts = [];
  let pageConfig = null;
  const draft = {
    draftId: 'draft_unreviewed_backend',
    status: 'needs_review',
    basicInfo: {
      type: '血常规',
      hospital: '天津市某医院',
      reportDate: '2025-08-25',
      reportLike: true,
      modality: 'laboratory'
    },
    metrics: [{
      metricKey: 'wbc',
      metricName: '白细胞数目(WBC)',
      valueNumeric: 4.3,
      valueType: 'quantitative',
      refRangeLow: 3.5,
      refRangeHigh: 9.5,
      tone: 'ok',
      mappingStatus: 'suggested'
    }],
    findings: [],
    conflicts: []
  };
  const stubApi = {
    checkDuplicateReports(payload) {
      calls.push({ type: 'duplicate', payload });
      return Promise.resolve({ hasDuplicates: false, candidates: [] });
    },
    batchCreateReports(payload) {
      calls.push({ type: 'save', payload });
      return Promise.reject({
        code: 'UNREVIEWED_OCR_DRAFTS',
        message: 'OCR reports still need review or manual completion before saving',
        details: {
          drafts: [{
            draftId: 'draft_unreviewed_backend',
            status: 'needs_manual_input',
            reason: 'status_not_reviewed'
          }]
        }
      });
    }
  };
  try {
    require.cache[apiModulePath] = {
      id: apiModulePath,
      filename: apiModulePath,
      loaded: true,
      exports: { api: stubApi }
    };
    global.wx = {
      getStorageSync: (key) => storageState[key],
      setStorageSync: (key, value) => { storageState[key] = value; },
      showToast: ({ title, icon }) => { toasts.push({ title, icon }); }
    };
    global.getApp = () => ({ getCurrentProfileId: () => 'profile_confirm' });
    global.Page = (config) => { pageConfig = config; };
    delete require.cache[pageModulePath];
    require(pagePath);
    const page = {
      ...pageConfig,
      data: {
        ...JSON.parse(JSON.stringify(pageConfig.data)),
        saving: false,
        profileId: 'profile_confirm',
        reports: [{
          draftId: 'draft_unreviewed_backend',
          needsManualInput: false,
          manualText: ''
        }],
        reportCount: 1,
        unresolvedConflictCount: 0,
        taskStatus: 'ready_to_save'
      },
      setData(update) {
        this.data = {
          ...this.data,
          ...update
        };
      }
    };
    page.taskId = 'task_unreviewed_backend';
    page.drafts = [draft];

    const result = await page.saveAll();

    assert.strictEqual(result, false);
    assert.deepStrictEqual(calls.map((call) => call.type), ['duplicate', 'save']);
    assert.strictEqual(page.data.saving, false);
    assert.strictEqual(page.data.saveDebug, 'failed:UNREVIEWED_OCR_DRAFTS');
    assert.strictEqual(page.data.reports[0].needsManualInput, true);
    assert.ok(page.data.reports[0].manualText.includes('手动补录'));
    assert.deepStrictEqual(toasts, [{ title: '请先处理 1 份未识别报告', icon: 'none' }]);
  } finally {
    if (savedApiCache) require.cache[apiModulePath] = savedApiCache;
    else delete require.cache[apiModulePath];
    global.wx = savedWx;
    global.Page = savedPage;
    global.getApp = savedGetApp;
    delete require.cache[pageModulePath];
  }
});

sequentialChecks.push(async () => {
  const pagePath = path.resolve(__dirname, '..', 'miniprogram', 'pages', 'upload', 'confirm.js');
  const apiPath = path.resolve(__dirname, '..', 'miniprogram', 'utils', 'api.js');
  const pageModulePath = require.resolve(pagePath);
  const apiModulePath = require.resolve(apiPath);
  const savedWx = global.wx;
  const savedPage = global.Page;
  const savedGetApp = global.getApp;
  const savedApiCache = require.cache[apiModulePath];
  const storageState = {
    pendingOcrTasks: [{
      taskId: 'task_empty_review',
      status: 'ready_to_save',
      photoCount: 1,
      reportCount: 1
    }]
  };
  const calls = [];
  const toasts = [];
  let pageConfig = null;
  const emptyDraft = {
    draftId: 'draft_empty_review',
    status: 'needs_review',
    basicInfo: {
      type: '血常规',
      hospital: '天津市某医院',
      reportDate: '2025-08-25',
      reportLike: true,
      modality: 'laboratory'
    },
    metrics: [],
    findings: [],
    conflicts: []
  };
  const stubApi = {
    getOcrTask(taskId) {
      calls.push({ type: 'get', taskId });
      return Promise.resolve({
        id: 'task_empty_review',
        profileId: 'profile_confirm',
        status: 'ready_to_save',
        reportCount: 1,
        photoCount: 1,
        drafts: [emptyDraft]
      });
    },
    checkDuplicateReports() {
      calls.push({ type: 'duplicate' });
      return Promise.resolve({ hasDuplicates: false, candidates: [] });
    },
    batchCreateReports() {
      calls.push({ type: 'save' });
      return Promise.resolve({ reports: [] });
    }
  };
  try {
    require.cache[apiModulePath] = {
      id: apiModulePath,
      filename: apiModulePath,
      loaded: true,
      exports: { api: stubApi }
    };
    global.wx = {
      getStorageSync: (key) => storageState[key],
      setStorageSync: (key, value) => { storageState[key] = value; },
      showToast: ({ title, icon }) => { toasts.push({ title, icon }); }
    };
    global.getApp = () => ({ getCurrentProfileId: () => 'profile_confirm' });
    global.Page = (config) => { pageConfig = config; };
    delete require.cache[pageModulePath];
    require(pagePath);
    const page = {
      ...pageConfig,
      data: JSON.parse(JSON.stringify(pageConfig.data)),
      setData(update) {
        this.data = {
          ...this.data,
          ...update
        };
      }
    };
    page.taskId = 'task_empty_review';

    page.loadTask();
    await Promise.resolve();
    await Promise.resolve();

    assert.strictEqual(page.data.reports.length, 1);
    assert.strictEqual(page.data.reports[0].needsManualInput, true);
    assert.strictEqual(page.data.reports[0].count, '未识别到内容');
    assert.ok(page.data.reports[0].manualText.includes('手动补录'));

    const result = await page.saveAll();
    assert.strictEqual(result, false);
    assert.deepStrictEqual(calls.map((call) => call.type), ['get']);
    assert.deepStrictEqual(toasts, [{ title: '请先处理 1 份未识别报告', icon: 'none' }]);
  } finally {
    if (savedApiCache) require.cache[apiModulePath] = savedApiCache;
    else delete require.cache[apiModulePath];
    global.wx = savedWx;
    global.Page = savedPage;
    global.getApp = savedGetApp;
    delete require.cache[pageModulePath];
  }
});

sequentialChecks.push(async () => {
  const pagePath = path.resolve(__dirname, '..', 'miniprogram', 'pages', 'upload', 'confirm.js');
  const apiPath = path.resolve(__dirname, '..', 'miniprogram', 'utils', 'api.js');
  const pageModulePath = require.resolve(pagePath);
  const apiModulePath = require.resolve(apiPath);
  const savedWx = global.wx;
  const savedPage = global.Page;
  const savedGetApp = global.getApp;
  const savedSetTimeout = global.setTimeout;
  const savedApiCache = require.cache[apiModulePath];
  const storageState = {
    pendingOcrTasks: [{
      taskId: 'task_save',
      status: 'ready_to_save',
      photoCount: 1,
      reportCount: 1
    }],
    uploadPhotos: [{ id: 'local_photo' }]
  };
  const calls = [];
  let pageConfig = null;
  let switchedTo = '';
  const draft = {
    draftId: 'draft_save',
    basicInfo: {
      type: '血常规',
      hospital: '天津市东丽区新立街社区卫生服务中心',
      reportDate: '2025-08-25',
      reportLike: true,
      modality: 'laboratory'
    },
    metrics: [{
      metricKey: 'wbc',
      metricName: '白细胞数目(WBC)',
      valueNumeric: 4.3,
      valueType: 'quantitative',
      refRangeLow: 3.5,
      refRangeHigh: 9.5,
      tone: 'ok',
      mappingStatus: 'suggested'
    }],
    conflicts: []
  };
  const stubApi = {
    checkDuplicateReports(payload) {
      calls.push({ type: 'duplicate', payload });
      return Promise.resolve({ hasDuplicates: false, candidates: [] });
    },
    batchCreateReports(payload, config) {
      calls.push({ type: 'save', payload, config });
      return Promise.resolve({
        reports: [{
          id: 'report_saved',
          type: '血常规',
          reportDate: '2025-08-25'
        }]
      });
    }
  };
  try {
    require.cache[apiModulePath] = {
      id: apiModulePath,
      filename: apiModulePath,
      loaded: true,
      exports: { api: stubApi }
    };
    global.wx = {
      getStorageSync: (key) => storageState[key],
      setStorageSync: (key, value) => { storageState[key] = value; },
      removeStorageSync: (key) => { delete storageState[key]; },
      showToast: () => {},
      switchTab: ({ url, success }) => {
        switchedTo = url;
        if (success) success();
      }
    };
    global.setTimeout = (handler) => {
      if (typeof handler === 'function') handler();
      return 0;
    };
    global.getApp = () => ({ getCurrentProfileId: () => 'profile_confirm' });
    global.Page = (config) => { pageConfig = config; };
    delete require.cache[pageModulePath];
    require(pagePath);
    const page = {
      ...pageConfig,
      data: {
        ...JSON.parse(JSON.stringify(pageConfig.data)),
        saving: false,
        profileId: 'profile_confirm',
        reports: [{ draftId: 'draft_save', needsManualInput: false }],
        reportCount: 1,
        unresolvedConflictCount: 0,
        taskStatus: 'ready_to_save'
      },
      setData(update) {
        this.data = {
          ...this.data,
          ...update
        };
      }
    };
    page.taskId = 'task_save';
    page.drafts = [draft];

    await page.saveAll();

    assert.deepStrictEqual(calls.map((call) => call.type), ['duplicate', 'save']);
    assert.strictEqual(calls[0].payload.profileId, 'profile_confirm');
    assert.strictEqual(calls[0].payload.ocrTaskId, 'task_save');
    assert.deepStrictEqual(calls[0].payload.reports, [draft]);
    assert.deepStrictEqual(calls[1].payload.duplicateDecisions, []);
    assert.strictEqual(calls[1].config.idempotencyKey, 'save_task_save_new');
    assert.strictEqual(page.data.saving, false);
    assert.strictEqual(page.data.saveDebug, 'navigated_health');
    assert.strictEqual(switchedTo, '/pages/health/index');
    assert.strictEqual(storageState.lastSavedReportToast, '已保存 1 份报告');
    assert.strictEqual(storageState.healthDefaultView, 'time');
    assert.strictEqual(storageState.healthDataRange, 'all');
    assert.deepStrictEqual(storageState.pendingOcrTasks, []);
    assert.strictEqual(storageState.uploadPhotos, undefined);
  } finally {
    if (savedApiCache) require.cache[apiModulePath] = savedApiCache;
    else delete require.cache[apiModulePath];
    global.wx = savedWx;
    global.Page = savedPage;
    global.getApp = savedGetApp;
    global.setTimeout = savedSetTimeout;
    delete require.cache[pageModulePath];
  }
});

sequentialChecks.push(async () => {
  const pagePath = path.resolve(__dirname, '..', 'miniprogram', 'pages', 'upload', 'confirm.js');
  const apiPath = path.resolve(__dirname, '..', 'miniprogram', 'utils', 'api.js');
  const pageModulePath = require.resolve(pagePath);
  const apiModulePath = require.resolve(apiPath);
  const savedWx = global.wx;
  const savedPage = global.Page;
  const savedGetApp = global.getApp;
  const savedSetTimeout = global.setTimeout;
  const savedApiCache = require.cache[apiModulePath];
  const storageState = {
    pendingOcrTasks: [{
      taskId: 'task_duplicate',
      status: 'ready_to_save',
      photoCount: 1,
      reportCount: 1
    }]
  };
  const calls = [];
  const actionSheets = [];
  let pageConfig = null;
  let switchedTo = '';
  const draft = {
    draftId: 'draft_duplicate',
    basicInfo: {
      type: '血常规',
      hospital: '天津市东丽区新立街社区卫生服务中心',
      reportDate: '2025-08-25',
      reportLike: true,
      modality: 'laboratory'
    },
    metrics: [{
      metricKey: 'wbc',
      metricName: '白细胞数目(WBC)',
      valueNumeric: 4.3,
      valueType: 'quantitative',
      refRangeLow: 3.5,
      refRangeHigh: 9.5,
      tone: 'ok',
      mappingStatus: 'suggested'
    }],
    conflicts: []
  };
  const duplicateCandidate = {
    draftId: 'draft_duplicate',
    existingReportId: 'report_existing',
    existingReportType: '血常规',
    existingReportDate: '2025-08-25'
  };
  const stubApi = {
    checkDuplicateReports(payload) {
      calls.push({ type: 'duplicate', payload });
      return Promise.resolve({
        hasDuplicates: true,
        candidates: [duplicateCandidate]
      });
    },
    batchCreateReports(payload, config) {
      calls.push({ type: 'save', payload, config });
      return Promise.resolve({
        reports: [{
          id: 'report_replaced',
          type: '血常规',
          reportDate: '2025-08-25',
          action: 'replaced'
        }]
      });
    }
  };
  try {
    require.cache[apiModulePath] = {
      id: apiModulePath,
      filename: apiModulePath,
      loaded: true,
      exports: { api: stubApi }
    };
    global.wx = {
      getStorageSync: (key) => storageState[key],
      setStorageSync: (key, value) => { storageState[key] = value; },
      removeStorageSync: (key) => { delete storageState[key]; },
      showActionSheet: (options) => {
        actionSheets.push(options);
        options.success({ tapIndex: 0 });
      },
      showToast: () => {},
      switchTab: ({ url, success }) => {
        switchedTo = url;
        if (success) success();
      }
    };
    global.setTimeout = (handler) => {
      if (typeof handler === 'function') handler();
      return 0;
    };
    global.getApp = () => ({ getCurrentProfileId: () => 'profile_confirm' });
    global.Page = (config) => { pageConfig = config; };
    delete require.cache[pageModulePath];
    require(pagePath);
    const page = {
      ...pageConfig,
      data: {
        ...JSON.parse(JSON.stringify(pageConfig.data)),
        saving: false,
        profileId: 'profile_confirm',
        reports: [{ draftId: 'draft_duplicate', needsManualInput: false }],
        reportCount: 1,
        unresolvedConflictCount: 0,
        taskStatus: 'ready_to_save'
      },
      setData(update) {
        this.data = {
          ...this.data,
          ...update
        };
      }
    };
    page.taskId = 'task_duplicate';
    page.drafts = [draft];

    await page.saveAll();

    assert.deepStrictEqual(calls.map((call) => call.type), ['duplicate', 'save']);
    assert.strictEqual(actionSheets.length, 1);
    assert.deepStrictEqual(actionSheets[0].itemList, ['覆盖旧报告', '跳过重复报告']);
    assert.ok(actionSheets[0].alertText.includes('2025-08-25 血常规'));
    assert.deepStrictEqual(calls[1].payload.duplicateDecisions, [{
      draftId: 'draft_duplicate',
      decision: 'replace',
      existingReportId: 'report_existing'
    }]);
    assert.strictEqual(calls[1].config.idempotencyKey, 'save_task_duplicate_replace');
    assert.strictEqual(page.data.saving, false);
    assert.strictEqual(page.data.saveDebug, 'navigated_health');
    assert.strictEqual(switchedTo, '/pages/health/index');
    assert.deepStrictEqual(storageState.pendingOcrTasks, []);
    assert.strictEqual(storageState.lastSavedReportToast, '已保存 1 份报告');
    assert.strictEqual(storageState.healthDataRange, 'all');
  } finally {
    if (savedApiCache) require.cache[apiModulePath] = savedApiCache;
    else delete require.cache[apiModulePath];
    global.wx = savedWx;
    global.Page = savedPage;
    global.getApp = savedGetApp;
    global.setTimeout = savedSetTimeout;
    delete require.cache[pageModulePath];
  }
});

sequentialChecks.push(async () => {
  const pagePath = path.resolve(__dirname, '..', 'miniprogram', 'pages', 'health', 'index.js');
  const apiPath = path.resolve(__dirname, '..', 'miniprogram', 'utils', 'api.js');
  const pageModulePath = require.resolve(pagePath);
  const apiModulePath = require.resolve(apiPath);
  const savedWx = global.wx;
  const savedPage = global.Page;
  const savedGetApp = global.getApp;
  const savedSetTimeout = global.setTimeout;
  const savedApiCache = require.cache[apiModulePath];
  const storageState = {
    healthDefaultView: 'time',
    lastSavedReportToast: '已保存 1 份报告',
    healthDataRange: 'all'
  };
  const removedKeys = [];
  const toasts = [];
  const navigations = [];
  const calls = [];
  let pageConfig = null;
  const savedReport = {
    id: 'report_saved_from_ocr',
    type: '血常规',
    hospital: '天津市东丽区新立街社区卫生服务中心',
    reportDate: '2025-08-25',
    abnormalCount: 2,
    modality: 'laboratory',
    analysisPolicy: 'metric_analysis'
  };
  const stubApi = {
    listMetricSnapshots(profileId, query) {
      calls.push({ type: 'metrics', profileId, query });
      return Promise.resolve([{
        metricKey: 'wbc',
        category: 'blood_routine',
        categoryCn: '血常规',
        metricName: '白细胞数目(WBC)',
        lastDate: '2025-08-25',
        lastTone: 'ok'
      }]);
    },
    listReports(profileId, query) {
      calls.push({ type: 'reports', profileId, query });
      return Promise.resolve([savedReport]);
    }
  };
  try {
    require.cache[apiModulePath] = {
      id: apiModulePath,
      filename: apiModulePath,
      loaded: true,
      exports: { api: stubApi }
    };
    global.wx = {
      getStorageSync: (key) => storageState[key],
      setStorageSync: (key, value) => { storageState[key] = value; },
      removeStorageSync: (key) => {
        removedKeys.push(key);
        delete storageState[key];
      },
      showToast: ({ title, icon }) => { toasts.push({ title, icon }); },
      getNetworkType: ({ success }) => success({ networkType: 'wifi' }),
      onNetworkStatusChange: () => {},
      navigateTo: ({ url }) => { navigations.push(url); }
    };
    global.setTimeout = (handler) => {
      if (typeof handler === 'function') handler();
      return 0;
    };
    global.getApp = () => ({
      ensureCurrentProfileId: () => Promise.resolve('profile_confirm')
    });
    global.Page = (config) => { pageConfig = config; };
    delete require.cache[pageModulePath];
    require(pagePath);
    const page = {
      ...pageConfig,
      data: JSON.parse(JSON.stringify(pageConfig.data)),
      setData(update) {
        this.data = {
          ...this.data,
          ...update
        };
      }
    };

    page.onLoad();
    page.onShow();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    assert.deepStrictEqual(calls.map((call) => call.type), ['metrics', 'reports']);
    assert.strictEqual(calls[0].profileId, 'profile_confirm');
    assert.deepStrictEqual(calls[0].query, {});
    assert.deepStrictEqual(calls[1].query, {});
    assert.strictEqual(page.data.view, 'time', 'health page should open the report timeline after OCR save');
    assert.strictEqual(page.data.range, 'all');
    assert.strictEqual(page.data.reportCount, 1);
    assert.strictEqual(page.data.reportAbnormalTotal, 2);
    assert.strictEqual(page.data.reportsByMonth.length, 1);
    assert.strictEqual(page.data.reportsByMonth[0].month, '2025-08');
    assert.strictEqual(page.data.reportsByMonth[0].title, '2025年8月');
    assert.strictEqual(page.data.reportsByMonth[0].items[0].id, 'report_saved_from_ocr');
    assert.strictEqual(page.data.reportsByMonth[0].items[0].displayDate, '8月25日');
    assert.deepStrictEqual(removedKeys.sort(), ['healthDefaultView', 'lastSavedReportToast'].sort());
    assert.deepStrictEqual(toasts, [{ title: '已保存 1 份报告', icon: 'success' }]);

    page.goReport({ currentTarget: { dataset: { id: 'report_saved_from_ocr' } } });
    assert.strictEqual(navigations[0], '/pages/health/report-detail?id=report_saved_from_ocr');
  } finally {
    if (savedApiCache) require.cache[apiModulePath] = savedApiCache;
    else delete require.cache[apiModulePath];
    global.wx = savedWx;
    global.Page = savedPage;
    global.getApp = savedGetApp;
    global.setTimeout = savedSetTimeout;
    delete require.cache[pageModulePath];
  }
});

sequentialChecks.push(async () => {
  const pagePath = path.resolve(__dirname, '..', 'miniprogram', 'pages', 'upload', 'confirm.js');
  const apiPath = path.resolve(__dirname, '..', 'miniprogram', 'utils', 'api.js');
  const pageModulePath = require.resolve(pagePath);
  const apiModulePath = require.resolve(apiPath);
  const savedWx = global.wx;
  const savedPage = global.Page;
  const savedGetApp = global.getApp;
  const savedSetTimeout = global.setTimeout;
  const savedDateNow = Date.now;
  const savedApiCache = require.cache[apiModulePath];
  const storageState = {
    pendingOcrTasks: [{
      taskId: 'task_retry',
      status: 'failed',
      photoCount: 2,
      reportCount: 1
    }, {
      taskId: 'task_other',
      status: 'processing',
      photoCount: 1,
      reportCount: 1
    }]
  };
  const calls = [];
  const toasts = [];
  let switchedTo = '';
  let pageConfig = null;
  const stubApi = {
    retryOcrTask(taskId, payload, config) {
      calls.push({ taskId, payload, config });
      return Promise.resolve({
        id: 'task_retry',
        profileId: 'profile_confirm',
        status: 'processing',
        photoCount: 2,
        reportCount: 1,
        drafts: []
      });
    }
  };
  try {
    require.cache[apiModulePath] = {
      id: apiModulePath,
      filename: apiModulePath,
      loaded: true,
      exports: { api: stubApi }
    };
    Date.now = () => 1780493000000;
    global.setTimeout = (handler) => {
      if (typeof handler === 'function') handler();
      return 0;
    };
    global.wx = {
      getStorageSync: (key) => storageState[key],
      setStorageSync: (key, value) => { storageState[key] = value; },
      showToast: ({ title, icon }) => { toasts.push({ title, icon }); },
      switchTab: ({ url }) => { switchedTo = url; }
    };
    global.getApp = () => ({ getCurrentProfileId: () => 'profile_confirm' });
    global.Page = (config) => { pageConfig = config; };
    delete require.cache[pageModulePath];
    require(pagePath);
    const page = {
      ...pageConfig,
      data: {
        ...JSON.parse(JSON.stringify(pageConfig.data)),
        retrying: false,
        taskStatus: 'failed',
        errorMessage: 'OCR timed out'
      },
      setData(update) {
        this.data = {
          ...this.data,
          ...update
        };
      }
    };
    page.taskId = 'task_retry';
    page.recognitionTimer = 123;
    page.clearRecognitionTimer = function clearRecognitionTimerForTest() {
      this.recognitionTimer = null;
    };

    const result = await page.retryTask();

    assert.strictEqual(result.id, 'task_retry');
    assert.deepStrictEqual(calls, [{
      taskId: 'task_retry',
      payload: {},
      config: { idempotencyKey: 'retry_task_retry_1780493000000' }
    }]);
    assert.strictEqual(page.data.retrying, false);
    assert.strictEqual(page.recognitionTimer, null);
    assert.deepStrictEqual(toasts, [{ title: '已重新发起识别', icon: 'success' }]);
    assert.strictEqual(switchedTo, '/pages/home/index');
    assert.deepStrictEqual(storageState.pendingOcrTasks.map((item) => item.taskId), ['task_retry', 'task_other']);
    assert.deepStrictEqual(storageState.pendingOcrTasks[0], {
      taskId: 'task_retry',
      profileId: 'profile_confirm',
      status: 'processing',
      photoCount: 2,
      reportCount: 1,
      createdAt: 1780493000000
    });
  } finally {
    if (savedApiCache) require.cache[apiModulePath] = savedApiCache;
    else delete require.cache[apiModulePath];
    global.wx = savedWx;
    global.Page = savedPage;
    global.getApp = savedGetApp;
    global.setTimeout = savedSetTimeout;
    Date.now = savedDateNow;
    delete require.cache[pageModulePath];
  }
});

sequentialChecks.push(async () => {
  const pagePath = path.resolve(__dirname, '..', 'miniprogram', 'pages', 'upload', 'pick.js');
  const apiPath = path.resolve(__dirname, '..', 'miniprogram', 'utils', 'api.js');
  const pageModulePath = require.resolve(pagePath);
  const apiModulePath = require.resolve(apiPath);
  const savedWx = global.wx;
  const savedPage = global.Page;
  const savedGetApp = global.getApp;
  const savedApiCache = require.cache[apiModulePath];
  const storageState = {};
  const calls = [];
  let pageConfig = null;
  const stubApi = {
    signUploads(payload) {
      calls.push({ type: 'sign', payload });
      return Promise.resolve({
        uploads: payload.files.map((file, index) => ({
          clientFileId: file.clientFileId,
          photoId: `signed_photo_${index + 1}`,
          uploadUrl: `https://upload.example.test/${file.clientFileId}`,
          headers: {}
        }))
      });
    },
    completeUploads() {
      calls.push({ type: 'complete' });
      return Promise.resolve({ photos: [] });
    },
    createOcrTask() {
      calls.push({ type: 'ocr' });
      return Promise.reject(new Error('OCR task should not be created after upload failure'));
    }
  };
  try {
    require.cache[apiModulePath] = {
      id: apiModulePath,
      filename: apiModulePath,
      loaded: true,
      exports: { api: stubApi }
    };
    global.wx = {
      getStorageSync: (key) => storageState[key],
      setStorageSync: (key, value) => { storageState[key] = value; },
      removeStorageSync: (key) => { delete storageState[key]; },
      uploadFile: ({ fail }) => fail({ errMsg: 'uploadFile:fail timeout' }),
      showToast: () => {}
    };
    global.getApp = () => ({ getCurrentProfileId: () => 'profile_upload' });
    global.Page = (config) => { pageConfig = config; };
    delete require.cache[pageModulePath];
    require(pagePath);
    const page = {
      ...pageConfig,
      data: JSON.parse(JSON.stringify(pageConfig.data)),
      setData(update) {
        this.data = {
          ...this.data,
          ...update
        };
      }
    };
    page.data.photos = [{
      id: 1,
      group: 0,
      tempFilePath: 'first.jpg',
      fileName: 'first.jpg',
      mimeType: 'image/jpeg',
      size: 1024
    }];
    await page.startOcr();
    assert.deepStrictEqual(calls.map((call) => call.type), ['sign']);
    assert.strictEqual(page.data.loading, false);
    assert.strictEqual(page.data.hasDraft, true);
    assert.ok(page.data.uploadError.includes('已保留草稿'));
    assert.strictEqual(storageState.uploadDraft.photos.length, 1, 'upload failure should keep selected photos as a draft');
  } finally {
    if (savedApiCache) require.cache[apiModulePath] = savedApiCache;
    else delete require.cache[apiModulePath];
    global.wx = savedWx;
    global.Page = savedPage;
    global.getApp = savedGetApp;
    delete require.cache[pageModulePath];
  }
});

assert.strictEqual(realcaseOcrDrafts.length, 7, 'realcase OCR baseline should cover all provided images');
assert.ok(realcaseOcrDrafts.some((draft) => (draft.metrics || []).some((metric) => metric.tone === 'high')), 'realcase baseline should include abnormal metrics');
assert.ok(realcaseOcrDrafts.some((draft) => (draft.findings || []).length > 0), 'realcase baseline should include imaging findings');
assert.ok(realcaseOcrDrafts.every((draft) => draft.basicInfo.originalType && draft.basicInfo.typeKey && draft.basicInfo.canonicalTypeName), 'realcase drafts need normalized report type fields');
assert.ok(realcaseOcrDrafts.filter((draft) => draft.basicInfo.modality === 'imaging').every((draft) => draft.analysisPolicy === 'view_only' && draft.basicInfo.examPart), 'imaging drafts need view-only exam part fields');
assert.ok(realcaseOcrDrafts.flatMap((draft) => draft.metrics || []).every((metric) => metric.originalMetricName && metric.mappingStatus), 'fixture metrics need mapping provenance');
assert.ok(realcaseOcrDrafts.flatMap((draft) => draft.metrics || []).some((metric) => metric.metricKey === 'tc' && metric.refText), 'complex lipid references should keep display refText');

assert.strictEqual(buildDefaultTodos().length, 5);
assert.strictEqual(defaultRecheckDate(new Date('2026-05-27T00:00:00'), 30), '2026-06-26');
assert.strictEqual(validateRecheckPlan({
  type: '常规复查',
  date: '2026-06-01',
  hospital: '协和医院'
}, new Date('2026-05-27T00:00:00')).ok, true);
assert.strictEqual(validateRecheckPlan({
  type: '',
  date: '2026-05-01',
  hospital: ''
}, new Date('2026-05-27T00:00:00')).ok, false);
assert.strictEqual(validateProfile({ relation: '妈妈', realName: '王芬' }).ok, true);
assert.strictEqual(validateProfile({ relation: '', realName: '' }).ok, false);
assert.strictEqual(isProfileRequiredError({ code: 'PROFILE_REQUIRED' }), true);
assert.strictEqual(isProfileRequiredError({ code: 'AUTH_REQUIRED' }), true);
assert.strictEqual(isProfileRequiredError({ code: 'UNAUTHORIZED' }), true);
assert.strictEqual(isProfileRequiredError({ code: 'NETWORK_ERROR' }), false);

const sessionStorage = createMemoryStorage({
  token: 'access_token',
  refreshToken: 'refresh_token',
  userId: 'user_1',
  lastProfileId: 'mock_profile',
  healthhelperBackendProfileId: 'backend_profile'
});
assert.strictEqual(hasAuthSession(sessionStorage), true);
assert.strictEqual(shouldRequireLogin({ mode: 'backend' }, sessionStorage), false);
clearAuthSession(sessionStorage);
assert.strictEqual(hasAuthSession(sessionStorage), false);
assert.strictEqual(shouldRequireLogin({ mode: 'backend' }, sessionStorage), true);
assert.strictEqual(shouldRequireLogin({ mode: 'mock' }, sessionStorage), false);
assert.strictEqual(sessionStorage.get('lastProfileId'), undefined);
assert.strictEqual(sessionStorage.get('healthhelperBackendProfileId'), undefined);

const storage = createMemoryStorage({ token: 'token_1' });
let capturedRequest = null;
const client = createApiClient({
  baseUrl: 'https://api.example.test',
  storage,
  createRequestId: () => 'req_test',
  request(config) {
    capturedRequest = config;
    return Promise.resolve({
      statusCode: 200,
      data: {
        data: { ok: true },
        requestId: 'req_test'
      }
    });
  }
});

asyncChecks.push(client.get('/api/profiles').then((data) => {
  assert.deepStrictEqual(data, { ok: true });
  assert.strictEqual(capturedRequest.url, 'https://api.example.test/api/profiles');
  assert.strictEqual(capturedRequest.header.Authorization, 'Bearer token_1');
  assert.strictEqual(capturedRequest.header['X-Request-Id'], 'req_test');
  assert.strictEqual(capturedRequest.timeout, DEFAULT_REQUEST_TIMEOUT_MS);
}));

let capturedSlashRequest = null;
const slashClient = createApiClient({
  baseUrl: 'https://api.example.test/',
  storage: createMemoryStorage(),
  request(config) {
    capturedSlashRequest = config;
    return Promise.resolve({
      statusCode: 200,
      data: { data: { ok: true } }
    });
  }
});

asyncChecks.push(slashClient.get('/api/health').then(() => {
  assert.strictEqual(capturedSlashRequest.url, 'https://api.example.test/api/health');
}));

const loginClientCalls = [];
const backendApiForLogin = createBackendApi({
  post(pathname, payload, config) {
    loginClientCalls.push({ pathname, payload, config });
    return Promise.resolve({ ok: true });
  }
});
asyncChecks.push(backendApiForLogin.authWxLogin({ code: 'wx_code' }, { requestId: 'req_login' }).then(() => {
  assert.deepStrictEqual(loginClientCalls, [{
    pathname: '/api/auth/wx-login',
    payload: { code: 'wx_code' },
    config: {
      requestId: 'req_login',
      skipUnauthorizedRedirect: true
    }
  }]);
}));

const metricPathCalls = [];
const backendApiForMetricPath = createBackendApi({
  get(pathname) {
    metricPathCalls.push({ method: 'GET', pathname });
    return Promise.resolve({});
  },
  patch(pathname, payload) {
    metricPathCalls.push({ method: 'PATCH', pathname, payload });
    return Promise.resolve({});
  }
});
asyncChecks.push(Promise.all([
  backendApiForMetricPath.getMetricHistory('profile_1', 'manual drug/level', {}),
  backendApiForMetricPath.setMetricPinned('profile_1', 'manual drug/level', true)
]).then(() => {
  assert.deepStrictEqual(metricPathCalls, [{
    method: 'GET',
    pathname: '/api/profiles/profile_1/metrics/manual%20drug%2Flevel/history'
  }, {
    method: 'PATCH',
    pathname: '/api/profiles/profile_1/metrics/manual%20drug%2Flevel/pin',
    payload: { isPinned: true }
  }]);
}));

const refreshStorage = createMemoryStorage({
  token: 'expired_token',
  refreshToken: 'refresh_token_1',
  userId: 'user_old'
});
const refreshRequests = [];
const refreshClient = createApiClient({
  baseUrl: 'https://api.example.test',
  storage: refreshStorage,
  createRequestId: () => `req_refresh_${refreshRequests.length + 1}`,
  request(config) {
    refreshRequests.push(config);
    if (refreshRequests.length === 1) {
      return Promise.resolve({
        statusCode: 401,
        data: {
          error: { code: 'UNAUTHORIZED', message: 'expired' },
          requestId: config.header['X-Request-Id']
        }
      });
    }
    if (config.url.endsWith('/api/auth/refresh')) {
      return Promise.resolve({
        statusCode: 200,
        data: {
          data: {
            token: 'fresh_token',
            refreshToken: 'refresh_token_2',
            userId: 'user_new'
          },
          requestId: config.header['X-Request-Id']
        }
      });
    }
    return Promise.resolve({
      statusCode: 200,
      data: {
        data: { ok: true },
        requestId: config.header['X-Request-Id']
      }
    });
  }
});

asyncChecks.push(refreshClient.get('/api/profiles').then((data) => {
  assert.deepStrictEqual(data, { ok: true });
  assert.strictEqual(refreshRequests.length, 3, '401 should refresh and retry once');
  assert.strictEqual(refreshRequests[1].url, 'https://api.example.test/api/auth/refresh');
  assert.deepStrictEqual(refreshRequests[1].data, { refreshToken: 'refresh_token_1' });
  assert.strictEqual(refreshRequests[2].header.Authorization, 'Bearer fresh_token');
  assert.strictEqual(refreshStorage.get('token'), 'fresh_token');
  assert.strictEqual(refreshStorage.get('refreshToken'), 'refresh_token_2');
  assert.strictEqual(refreshStorage.get('userId'), 'user_new');
}));

const expiredStorage = createMemoryStorage({
  token: 'expired_token',
  refreshToken: 'bad_refresh',
  userId: 'user_old'
});
const expiredClient = createApiClient({
  baseUrl: 'https://api.example.test',
  storage: expiredStorage,
  createRequestId: () => 'req_expired',
  request(config) {
    return Promise.resolve({
      statusCode: 401,
      data: {
        error: { code: 'UNAUTHORIZED', message: config.url.endsWith('/api/auth/refresh') ? 'refresh expired' : 'expired' },
        requestId: config.header['X-Request-Id']
      }
    });
  }
});
asyncChecks.push(expiredClient.get('/api/profiles', { skipUnauthorizedRedirect: true }).then(
  () => assert.fail('expired refresh token should reject'),
  (error) => {
    assert.strictEqual(error.code, 'UNAUTHORIZED');
    assert.strictEqual(expiredStorage.get('token'), undefined);
    assert.strictEqual(expiredStorage.get('refreshToken'), undefined);
    assert.strictEqual(expiredStorage.get('userId'), undefined);
  }
));

const timeoutClient = createApiClient({
  baseUrl: 'https://api.example.test',
  request() {
    return Promise.reject({ errMsg: 'request:fail timeout' });
  }
});
asyncChecks.push(timeoutClient.get('/api/profiles').then(
  () => assert.fail('request timeout should reject as ApiError'),
  (error) => {
    assert.strictEqual(error.code, 'REQUEST_TIMEOUT');
    assert.strictEqual(error.message, '请求超时，请稍后重试');
    assert.strictEqual(error.requestId.startsWith('req_'), true);
  }
));

const networkClient = createApiClient({
  baseUrl: 'https://api.example.test',
  timeout: 8000,
  request(config) {
    assert.strictEqual(config.timeout, 8000);
    return Promise.reject({ errMsg: 'request:fail' });
  }
});
asyncChecks.push(networkClient.get('/api/profiles').then(
  () => assert.fail('network failure should reject as ApiError'),
  (error) => {
    assert.strictEqual(error.code, 'NETWORK_ERROR');
    assert.strictEqual(error.requestId.startsWith('req_'), true);
  }
));

const hybridRequests = [];
const hybridStorage = createMemoryStorage();
const hybridApi = createApi({
  mode: 'hybrid-upload',
  baseUrl: 'http://127.0.0.1:8787',
  storage: hybridStorage,
  createRequestId: () => `req_hybrid_${hybridRequests.length + 1}`,
  request(config) {
    hybridRequests.push(config);
    return Promise.resolve({
      statusCode: 200,
      data: {
        data: config.url.includes('/duplicate-check')
          ? { hasDuplicates: false, candidates: [] }
          : config.url.includes('/exports')
            ? { exportId: 'export_1', status: 'ready', downloadUrl: '/api/exports/export_1/download?token=t', expiresAt: '2026-06-01T00:00:00.000Z' }
            : { id: 'task_1', profileId: '33333333-3333-4333-8333-333333333333', reports: [] },
        requestId: config.header['X-Request-Id']
      }
    });
  }
});

asyncChecks.push(hybridApi.createOcrTask({
  profileId: 'profile_mock',
  photos: [{ photoId: 'photo_1' }],
  fixtureCaseIds: ['acth']
}).then(() => hybridApi.signUploads({
  profileId: 'profile_mock',
  files: [{
    clientFileId: 'local_1',
    fileName: 'report.jpg',
    mimeType: 'image/jpeg',
    size: 1024
  }]
})).then(() => hybridApi.completeUploads({
  profileId: 'profile_mock',
  uploads: [{
    photoId: '44444444-4444-4444-8444-444444444444',
    sha256: 'b'.repeat(64)
  }]
})).then(() => hybridApi.createOcrTask({
  profileId: 'profile_mock',
  photos: [{
    photoId: '44444444-4444-4444-8444-444444444444',
    groupId: 'group_1',
    sortOrder: 1
  }]
})).then(() => hybridApi.listOcrTasks({
  profileId: 'profile_mock',
  status: 'needs_confirmation'
})).then(() => hybridApi.retryOcrTask('task_1', {
  photoIds: ['44444444-4444-4444-8444-444444444444']
})).then(() => hybridApi.cancelOcrTask('task_1')).then(() => hybridApi.deleteOcrDraft('task_1', 'draft/remove 1')).then(() => hybridApi.splitOcrDraft('task_1', 'draft_1')).then(() => hybridApi.checkDuplicateReports({
  profileId: '11111111-1111-4111-8111-111111111111',
  ocrTaskId: '22222222-2222-4222-8222-222222222222',
  reports: [{ draftId: 'draft_mock' }]
})).then(() => hybridApi.batchCreateReports({
  profileId: 'profile_mock',
  ocrTaskId: '22222222-2222-4222-8222-222222222222',
  reports: [{ draftId: 'draft_mock' }],
  duplicateDecisions: [{ draftId: 'draft_mock', decision: 'skip' }]
})).then(() => hybridApi.listReports('profile_mock')).then(() => hybridApi.listMetricSnapshots('profile_mock')).then(() => hybridApi.createRecheckPlan('profile_mock', {
  type: '常规复查',
  date: '2026-06-01',
  hospital: '协和医院',
  todos: [{ text: '预约挂号', sortOrder: 1 }]
})).then(() => hybridApi.listRecheckPlans('profile_mock')).then(() => hybridApi.updateRecheckTodo('plan_1', 'todo_1', { isDone: true })).then(() => hybridApi.deleteRecheckPlan('plan_1')).then(() => hybridApi.createExport('profile_mock', {
  includeReports: true,
  includeMetrics: true,
  includeRecheckPlans: true,
  format: 'json'
})).then((exportResult) => hybridApi.getExport(exportResult.exportId)).then(() => {
  assert.strictEqual(hybridRequests[0].url, 'http://127.0.0.1:8787/api/ocr/tasks');
  assert.deepStrictEqual(hybridRequests[0].data, { fixtureCaseIds: ['acth'] });
  assert.strictEqual(hybridRequests[1].url, 'http://127.0.0.1:8787/api/uploads/sign');
  assert.strictEqual(hybridRequests[1].data.profileId, '33333333-3333-4333-8333-333333333333');
  assert.strictEqual(hybridRequests[1].data.files[0].clientFileId, 'local_1');
  assert.strictEqual(hybridRequests[2].url, 'http://127.0.0.1:8787/api/uploads/complete');
  assert.deepStrictEqual(hybridRequests[2].data, {
    profileId: '33333333-3333-4333-8333-333333333333',
    uploads: [{
      photoId: '44444444-4444-4444-8444-444444444444',
      sha256: 'b'.repeat(64)
    }]
  });
  assert.strictEqual(hybridRequests[3].url, 'http://127.0.0.1:8787/api/ocr/tasks');
  assert.deepStrictEqual(hybridRequests[3].data, {
    profileId: '33333333-3333-4333-8333-333333333333',
    photos: [{
      photoId: '44444444-4444-4444-8444-444444444444',
      groupId: 'group_1',
      sortOrder: 1
    }]
  });
  assert.strictEqual(hybridRequests[4].url, 'http://127.0.0.1:8787/api/ocr/tasks?profileId=33333333-3333-4333-8333-333333333333&status=needs_confirmation');
  assert.strictEqual(hybridRequests[5].url, 'http://127.0.0.1:8787/api/ocr/tasks/task_1/retry');
  assert.deepStrictEqual(hybridRequests[5].data, {
    photoIds: ['44444444-4444-4444-8444-444444444444']
  });
  assert.strictEqual(hybridRequests[6].url, 'http://127.0.0.1:8787/api/ocr/tasks/task_1/cancel');
  assert.strictEqual(hybridRequests[7].url, 'http://127.0.0.1:8787/api/ocr/tasks/task_1/drafts/draft%2Fremove%201/delete');
  assert.deepStrictEqual(hybridRequests[7].data, {});
  assert.strictEqual(hybridRequests[8].url, 'http://127.0.0.1:8787/api/ocr/tasks/task_1/drafts/draft_1/split');
  assert.deepStrictEqual(hybridRequests[8].data, {});
  assert.strictEqual(hybridRequests[9].url, 'http://127.0.0.1:8787/api/reports/duplicate-check');
  assert.deepStrictEqual(hybridRequests[9].data, {
    profileId: '33333333-3333-4333-8333-333333333333',
    ocrTaskId: '22222222-2222-4222-8222-222222222222'
  });
  assert.strictEqual(hybridRequests[10].url, 'http://127.0.0.1:8787/api/reports/batch-create');
  assert.deepStrictEqual(hybridRequests[10].data, {
    profileId: '33333333-3333-4333-8333-333333333333',
    ocrTaskId: '22222222-2222-4222-8222-222222222222',
    duplicateDecisions: [{ draftId: 'draft_mock', decision: 'skip' }]
  });
  assert.strictEqual(hybridStorage.get('healthhelperBackendProfileId'), '33333333-3333-4333-8333-333333333333');
  assert.strictEqual(hybridRequests[11].url, 'http://127.0.0.1:8787/api/profiles/33333333-3333-4333-8333-333333333333/reports');
  assert.strictEqual(hybridRequests[12].url, 'http://127.0.0.1:8787/api/profiles/33333333-3333-4333-8333-333333333333/metrics/snapshots');
  assert.strictEqual(hybridRequests[13].url, 'http://127.0.0.1:8787/api/profiles/33333333-3333-4333-8333-333333333333/recheck-plans');
  assert.strictEqual(hybridRequests[14].url, 'http://127.0.0.1:8787/api/profiles/33333333-3333-4333-8333-333333333333/recheck-plans');
  assert.strictEqual(hybridRequests[15].url, 'http://127.0.0.1:8787/api/recheck-plans/plan_1/todos/todo_1');
  assert.strictEqual(hybridRequests[16].url, 'http://127.0.0.1:8787/api/recheck-plans/plan_1');
  assert.strictEqual(hybridRequests[17].url, 'http://127.0.0.1:8787/api/profiles/33333333-3333-4333-8333-333333333333/exports');
  assert.deepStrictEqual(hybridRequests[17].data, {
    includeReports: true,
    includeMetrics: true,
    includeRecheckPlans: true,
    format: 'json'
  });
  assert.strictEqual(hybridRequests[18].url, 'http://127.0.0.1:8787/api/exports/export_1');
}));

{
  const staleRequests = [];
  const staleStorage = createMemoryStorage({
    healthhelperBackendProfileId: 'stale_backend_profile'
  });
  const staleHybridApi = createApi({
    mode: 'hybrid-upload',
    baseUrl: 'http://127.0.0.1:8788',
    storage: staleStorage,
    createRequestId: () => `req_stale_${staleRequests.length + 1}`,
    request(config) {
      staleRequests.push(config);
      if (config.url === 'http://127.0.0.1:8788/api/uploads/sign'
        && config.data.profileId === 'stale_backend_profile') {
        return Promise.resolve({
          statusCode: 404,
          data: {
            error: { code: 'NOT_FOUND', message: 'profile missing' },
            requestId: config.header['X-Request-Id']
          }
        });
      }
      if (config.url === 'http://127.0.0.1:8788/api/profiles') {
        return Promise.resolve({
          statusCode: 200,
          data: {
            data: [{ id: 'fresh_backend_profile' }],
            requestId: config.header['X-Request-Id']
          }
        });
      }
      return Promise.resolve({
        statusCode: 200,
        data: {
          data: { uploads: [] },
          requestId: config.header['X-Request-Id']
        }
      });
    }
  });

  asyncChecks.push(staleHybridApi.signUploads({
    profileId: 'profile_mock',
    files: []
  }).then(() => {
    assert.strictEqual(staleRequests.length, 3, 'hybrid stale profile should refresh and retry once');
    assert.strictEqual(staleRequests[0].data.profileId, 'stale_backend_profile');
    assert.strictEqual(staleRequests[1].url, 'http://127.0.0.1:8788/api/profiles');
    assert.strictEqual(staleRequests[2].data.profileId, 'fresh_backend_profile');
    assert.strictEqual(staleStorage.get('healthhelperBackendProfileId'), 'fresh_backend_profile');
  }));
}

const errorClient = createApiClient({
  storage: createMemoryStorage(),
  createRequestId: () => 'req_error',
  request() {
    return Promise.resolve({
      statusCode: 400,
      data: {
        error: {
          code: 'VALIDATION_FAILED',
          message: 'bad input',
          details: { fieldErrors: { hospital: 'required' } }
        },
        requestId: 'req_error'
      }
    });
  }
});

asyncChecks.push(errorClient.post('/api/recheck-plans', {}).then(
  () => assert.fail('expected ApiError'),
  (error) => {
    assert.ok(error instanceof ApiError);
    assert.strictEqual(error.code, 'VALIDATION_FAILED');
    assert.strictEqual(error.statusCode, 400);
    assert.strictEqual(error.details.fieldErrors.hospital, 'required');
  }
));

const mockApi = createApi();
let savedFixtureCtReportId = '';
asyncChecks.push(mockApi.getProfiles().then((profiles) => {
  assert.ok(profiles.length >= 1, 'mock api should return profiles');
  assert.ok(profiles[0].id && profiles[0].realName, 'profile list items should match API contract');
}));

sequentialChecks.push(async () => {
  const appPath = path.resolve(__dirname, '..', 'miniprogram', 'app.js');
  const appModulePath = require.resolve(appPath);
  const savedWx = global.wx;
  const savedApp = global.App;
  const storageState = {
    lastProfileId: 'missing_profile',
    healthhelperBackendProfileId: 'stale_backend_profile',
    healthhelperApiMode: 'mock'
  };
  let navigatedTo = '';
  let relaunchedTo = '';
  let appConfig = null;
  try {
    global.wx = {
      getStorageSync: (key) => storageState[key],
      setStorageSync: (key, value) => { storageState[key] = value; },
      removeStorageSync: (key) => { delete storageState[key]; },
      getSystemInfoSync: () => ({ windowWidth: 375, statusBarHeight: 44 }),
      getMenuButtonBoundingClientRect: () => ({ bottom: 88 }),
      showToast: () => {},
      navigateTo: ({ url }) => { navigatedTo = url; },
      reLaunch: ({ url }) => { relaunchedTo = url; }
    };
    global.App = (config) => { appConfig = config; };
    delete require.cache[appModulePath];
    require(appPath);
    appConfig.onLaunch();
    const resolved = await appConfig.ensureCurrentProfileId({
      getProfiles: () => Promise.resolve([{ id: 'profile_a' }, { id: 'profile_b' }])
    });
    assert.strictEqual(resolved, 'profile_a', 'missing current profile should fall back to first profile');
    assert.strictEqual(storageState.lastProfileId, 'profile_a');
    assert.strictEqual(storageState.healthhelperBackendProfileId, undefined, 'mock mode should clear stale backend profile id');

    storageState.healthhelperApiMode = 'hybrid-upload';
    storageState.lastProfileId = 'missing_hybrid_profile';
    storageState.healthhelperBackendProfileId = 'backend_profile_existing';
    appConfig.globalData.currentProfileId = 'missing_hybrid_profile';
    const hybridResolved = await appConfig.ensureCurrentProfileId({
      getProfiles: () => Promise.resolve([{ id: 'profile_a' }, { id: 'profile_b' }])
    });
    assert.strictEqual(hybridResolved, 'profile_a', 'hybrid mode should still fall back to a valid local profile');
    assert.strictEqual(storageState.lastProfileId, 'profile_a');
    assert.strictEqual(
      storageState.healthhelperBackendProfileId,
      'backend_profile_existing',
      'hybrid mode should not overwrite backend profile mapping with a local profile id'
    );

    let profileRequired = false;
    try {
      await appConfig.ensureCurrentProfileId({ getProfiles: () => Promise.resolve([]) });
    } catch (error) {
      profileRequired = error.code === 'PROFILE_REQUIRED';
    }
    assert.strictEqual(profileRequired, true, 'empty profile list should require profile creation');
    assert.strictEqual(navigatedTo, '');
    assert.strictEqual(relaunchedTo, '/pages/profile/onboard?state=noProfile');

    storageState.healthhelperApiMode = 'backend';
    storageState.token = 'expired_token';
    storageState.refreshToken = 'expired_refresh';
    storageState.userId = 'user_stale';
    storageState.lastProfileId = 'stale_profile';
    storageState.healthhelperBackendProfileId = 'stale_profile';
    appConfig.globalData.currentProfileId = 'stale_profile';
    relaunchedTo = '';
    let unauthorized = false;
    try {
      await appConfig.ensureCurrentProfileId({
        getProfiles: () => Promise.reject({ code: 'UNAUTHORIZED' })
      });
    } catch (error) {
      unauthorized = error.code === 'UNAUTHORIZED';
    }
    assert.strictEqual(unauthorized, true, 'expired backend session should bubble the unauthorized error');
    assert.strictEqual(relaunchedTo, '/pages/profile/onboard');
    assert.strictEqual(storageState.token, undefined);
    assert.strictEqual(storageState.refreshToken, undefined);
    assert.strictEqual(storageState.lastProfileId, undefined);
    assert.strictEqual(storageState.healthhelperBackendProfileId, undefined);
  } finally {
    global.wx = savedWx;
    global.App = savedApp;
    delete require.cache[appModulePath];
  }
});
asyncChecks.push(mockApi.authWxLogin({ code: 'code_1' }).then((session) => {
  assert.ok(session.token);
  assert.ok(session.refreshToken);
  return mockApi.createProfile({
    relation: '爸爸',
    realName: '测试档案',
    gender: 'M',
    diseaseType: '高血压'
  });
}).then((profile) => {
  assert.ok(profile.id);
  assert.strictEqual(profile.realName, '测试档案');
  return mockApi.getProfiles().then((profiles) => ({ profile, profiles }));
}).then(({ profile, profiles }) => {
  assert.ok(profiles.some((item) => item.id === profile.id), 'created profile should be listed');
  return mockApi.updateProfile(profile.id, { primaryHospital: '社区医院' }).then(() => mockApi.getProfile(profile.id));
}).then((profile) => {
  assert.strictEqual(profile.primaryHospital, '社区医院');
  return mockApi.deleteProfile(profile.id).then(() => mockApi.getProfiles());
}).then((profiles) => {
  assert.ok(!profiles.some((item) => item.realName === '测试档案'), 'deleted profile should be hidden');
  return mockApi.logout();
}).then((result) => {
  assert.strictEqual(result.ok, true);
}));
asyncChecks.push(mockApi.signUploads({
  profileId: 'profile_mom',
  files: [{
    clientFileId: 'local_mock_1',
    fileName: 'report.jpg',
    mimeType: 'image/jpeg',
    size: 1024
  }]
}).then((result) => {
  assert.strictEqual(result.uploads.length, 1);
  assert.strictEqual(result.uploads[0].clientFileId, 'local_mock_1');
  assert.ok(result.uploads[0].photoId);
  return mockApi.completeUploads({
    profileId: 'profile_mom',
    uploads: [{
      photoId: result.uploads[0].photoId,
      sha256: 'c'.repeat(64)
    }]
  });
}).then((result) => {
  assert.strictEqual(result.photos.length, 1);
  assert.strictEqual(result.photos[0].status, 'uploaded');
}));
asyncChecks.push(mockApi.createExport('profile_mom', {
  includeReports: true,
  includeMetrics: true,
  includeRecheckPlans: true,
  format: 'json'
}).then((result) => {
  assert.strictEqual(result.status, 'ready');
  assert.ok(result.downloadUrl.startsWith('mock-download://'));
  return mockApi.getExport(result.exportId);
}).then((result) => {
  assert.strictEqual(result.status, 'ready');
  assert.ok(result.fileName.endsWith('.json'));
}));
asyncChecks.push(mockApi.createOcrTask({
  profileId: 'profile_mom',
  photos: [
    { photoId: 'photo_1', groupId: 'group_1', sortOrder: 1 },
    { photoId: 'photo_2', groupId: 'group_1', sortOrder: 2 },
    { photoId: 'photo_3', groupId: 'photo_3', sortOrder: 1 },
    { photoId: 'photo_4', groupId: 'photo_4', sortOrder: 1 }
  ]
}).then((task) => {
  assert.strictEqual(task.status, 'needs_confirmation');
  assert.strictEqual(task.photoCount, 4);
  assert.strictEqual(task.reportCount, 3);
  assert.deepStrictEqual(task.drafts.map((draft) => draft.pageCount), [2, 1, 1]);
  assert.strictEqual(task.drafts.filter((draft) => draft.pageCount > 1).length, 1, 'only one report should be merged');
  return mockApi.listOcrTasks({
    profileId: 'profile_mom',
    status: 'needs_confirmation'
  }).then((tasks) => {
    assert.ok(tasks.some((item) => item.id === task.id), 'mock OCR task list should include active task');
    return mockApi.getOcrTask(task.id);
  });
}).then((task) => {
  assert.strictEqual(task.drafts.length, 3);
  const conflictedDraft = task.drafts.find((draft) => draft.conflicts.length > 0);
  assert.ok(conflictedDraft, 'mock OCR task should include one conflict for confirmation flow');
  return mockApi.batchCreateReports({ ocrTaskId: task.id, reports: task.drafts }).then(
    () => assert.fail('unresolved OCR conflicts should block mock report save'),
    (error) => {
      assert.strictEqual(error.code, 'UNRESOLVED_REPORT_CONFLICTS');
      return task;
    }
  );
}).then((task) => {
  const conflictedDraft = task.drafts.find((draft) => draft.conflicts.length > 0);
  return mockApi.resolveOcrConflict({
    taskId: task.id,
    draftId: conflictedDraft.draftId,
    metricKey: conflictedDraft.conflicts[0].metricKey,
    selectedCandidateIndex: 0
  }).then(() => mockApi.getOcrTask(task.id));
}).then((task) => {
  assert.strictEqual(task.drafts.reduce((sum, draft) => sum + draft.conflicts.length, 0), 0);
  return Promise.all(task.drafts.map((draft) => mockApi.updateOcrDraft({
    taskId: task.id,
    draftId: draft.draftId,
    draft: {
      ...draft,
      basicInfo: {
        ...(draft.basicInfo || {}),
        ocrReviewedAt: '2026-06-04T00:00:00.000Z',
        ocrReviewSource: 'edit_detail'
      }
    }
  }))).then(() => mockApi.getOcrTask(task.id));
}).then((task) => {
  return mockApi.batchCreateReports({ ocrTaskId: task.id, reports: task.drafts });
}).then((result) => {
  assert.strictEqual(result.reports.length, 3);
}));
asyncChecks.push(mockApi.createOcrTask({
  profileId: 'profile_mom',
  fixtureCaseIds: ['acth']
}).then((task) => {
  const draft = task.drafts[0];
  const metric = draft.metrics[0];
  return mockApi.updateOcrDraft({
    taskId: task.id,
    draftId: draft.draftId,
    draft: {
      ...draft,
      status: 'needs_confirmation',
      conflicts: [{
        metricKey: metric.metricKey,
        metricName: metric.metricName,
        candidates: []
      }]
    }
  }).then(() => mockApi.resolveOcrConflict({
    taskId: task.id,
    draftId: draft.draftId,
    metricKey: metric.metricKey,
    selectedCandidateIndex: 0,
    resolution: 'delete'
  })).then(() => mockApi.getOcrTask(task.id)).then((updatedTask) => {
    assert.strictEqual(updatedTask.drafts[0].conflicts.length, 0);
    assert.strictEqual(updatedTask.drafts[0].metrics.some((item) => item.metricKey === metric.metricKey), false);
  });
}));
asyncChecks.push(mockApi.createOcrTask({
  profileId: 'profile_mom',
  photos: [{ photoId: 'photo_9', groupId: 'photo_9', sortOrder: 1 }]
}).then((task) => mockApi.retryOcrTask(task.id).then((retried) => {
  assert.strictEqual(retried.status, 'queued');
  assert.strictEqual(retried.errorCode, '');
})));
asyncChecks.push(mockApi.createOcrTask({
  profileId: 'profile_mom',
  fixtureCaseIds: ['acth']
}).then((task) => mockApi.cancelOcrTask(task.id).then((cancelled) => {
  assert.strictEqual(cancelled.status, 'cancelled');
  assert.ok(cancelled.drafts.every((draft) => draft.status === 'cancelled'));
  return mockApi.listOcrTasks({ profileId: 'profile_mom', status: 'cancelled' });
})).then((tasks) => {
  assert.ok(tasks.length >= 1, 'cancelled OCR task should be listable by status');
}));
asyncChecks.push(mockApi.createOcrTask({
  profileId: 'profile_mom',
  fixtureCaseIds: ['empty_result', 'non_report_image']
}).then((task) => {
  assert.strictEqual(task.reportCount, 2);
  assert.ok(task.drafts.some((draft) => draft.status === 'needs_manual_input' && draft.warnings.length > 0), 'empty OCR result should require manual input');
  assert.ok(task.drafts.some((draft) => draft.status === 'not_report' && draft.basicInfo.reportLike === false), 'non-report image should be marked as not report-like');
  return mockApi.batchCreateReports({ ocrTaskId: task.id, reports: task.drafts }).then(
    () => assert.fail('unreviewed OCR drafts should not be saved into mock reports'),
    (error) => {
      assert.strictEqual(error.code, 'UNREVIEWED_OCR_DRAFTS');
      assert.ok(error.details.drafts.some((draft) => draft.reason === 'status_not_reviewed'));
    }
  );
}));
asyncChecks.push(mockApi.createOcrTask({
  profileId: 'profile_self',
  fixtureCaseIds: ['acth', 'thyroid', 'chest_ct_plain']
}).then((task) => {
  assert.strictEqual(task.reportCount, 3);
  assert.strictEqual(task.photoCount, 3);
  assert.strictEqual(task.drafts[0].metrics[0].metricKey, 'acth');
  assert.strictEqual(task.drafts[1].basicInfo.canonicalTypeName, '甲状腺功能');
  assert.strictEqual(task.drafts[2].basicInfo.modality, 'imaging');
  assert.strictEqual(task.drafts[2].basicInfo.examPart, '胸部');
  assert.strictEqual(task.drafts[2].findings.length > 0, true);
  const editedDraft = {
    ...task.drafts[0],
    basicInfo: {
      ...task.drafts[0].basicInfo,
      hospital: '用户校准医院',
      hospitalSource: 'user_edited',
      ocrReviewedAt: '2026-06-04T00:00:00.000Z',
      ocrReviewSource: 'edit_detail'
    },
    metrics: task.drafts[0].metrics.map((metric, index) => (
      index === 0 ? { ...metric, valueNumeric: 80, isManuallyEdited: true } : metric
    ))
  };
  return mockApi.updateOcrDraft({
    taskId: task.id,
    draftId: editedDraft.draftId,
    draft: editedDraft
  }).then((updated) => {
    assert.strictEqual(updated.basicInfo.hospital, '用户校准医院');
    assert.strictEqual(updated.metrics[0].valueNumeric, 80);
    return mockApi.getOcrTask(task.id);
  });
}).then((task) => {
  assert.strictEqual(task.drafts[0].basicInfo.hospitalSource, 'user_edited');
  assert.strictEqual(task.drafts[0].metrics[0].isManuallyEdited, true);
  return mockApi.batchCreateReports({ ocrTaskId: task.id, reports: task.drafts });
}).then((result) => {
  assert.strictEqual(result.reports.length, 3);
  return mockApi.listReports('profile_self');
}).then((reports) => {
  assert.ok(reports.some((report) => report.ocrTaskId && report.type === '血浆ACTH (8AM)' && report.hospital === '用户校准医院'), 'saved fixture report should use edited draft fields');
  const ct = reports.find((report) => report.type === '胸腹盆CT平扫');
  assert.ok(ct && ct.modality === 'imaging' && ct.examPart === '胸部' && ct.analysisPolicy === 'view_only', 'saved imaging report should keep view-only CT metadata');
  savedFixtureCtReportId = ct.id;
  return mockApi.listMetricSnapshots('profile_self');
}).then((snapshots) => {
  assert.ok(snapshots.some((snapshot) => snapshot.metricKey === 'acth' && snapshot.lastTone === 'high'), 'fixture metrics should feed snapshots');
  assert.ok(!snapshots.some((snapshot) => snapshot.lastReportId === savedFixtureCtReportId), 'imaging reports should not feed metric snapshots');
  return mockApi.createOcrTask({
    profileId: 'profile_self',
    fixtureCaseIds: ['acth']
  });
}).then((task) => mockApi.batchCreateReports({ ocrTaskId: task.id, reports: task.drafts }).then(
  () => assert.fail('duplicate reports should require a user decision'),
  (error) => {
    assert.ok(error instanceof ApiError);
    assert.strictEqual(error.code, 'DUPLICATE_REPORT_REQUIRES_DECISION');
    assert.ok(error.details.candidates.length >= 1, 'duplicate error should include candidates');
    return { task, candidates: error.details.candidates };
  }
)).then(({ task, candidates }) => mockApi.checkDuplicateReports({
  profileId: 'profile_self',
  ocrTaskId: task.id,
  reports: task.drafts
}).then((result) => {
  assert.strictEqual(result.hasDuplicates, true);
  assert.ok(result.candidates.some((candidate) => candidate.existingReportId && ['strong', 'possible'].includes(candidate.matchLevel)));
  return mockApi.batchCreateReports({
    ocrTaskId: task.id,
    reports: task.drafts,
    duplicateDecisions: candidates.map((candidate) => ({
      draftId: candidate.draftId,
      decision: 'replace',
      existingReportId: candidate.existingReportId
    }))
  });
})).then((result) => {
  assert.strictEqual(result.reports.length, 1);
  assert.strictEqual(result.reports[0].action, 'replaced');
  assert.ok(result.reports[0].replacedReportId);
  return mockApi.createOcrTask({
    profileId: 'profile_self',
    fixtureCaseIds: ['acth']
  });
}).then((task) => {
  const aliasDrafts = task.drafts.map((draft) => ({
    ...draft,
    basicInfo: {
      ...draft.basicInfo,
      hospital: '协和'
    }
  }));
  return mockApi.checkDuplicateReports({
    profileId: 'profile_self',
    ocrTaskId: task.id,
    reports: aliasDrafts
  });
}).then((result) => {
  assert.strictEqual(result.hasDuplicates, true, 'hospital aliases should not prevent duplicate detection');
  assert.ok(result.candidates.some((candidate) => candidate.matchLevel === 'strong'), 'same results and hospital alias should be a strong duplicate');
  return mockApi.createOcrTask({
    profileId: 'profile_self',
    fixtureCaseIds: ['abdomen_pelvis_ct_plain']
  });
}).then((task) => mockApi.checkDuplicateReports({
  profileId: 'profile_self',
  ocrTaskId: task.id,
  reports: task.drafts
})).then((result) => {
  assert.strictEqual(result.hasDuplicates, false, 'same CT type with different exam part should not be treated as duplicate');
}));
const fixtureRepeatApi = createApi();
const markDraftsReviewedForTest = (drafts) => (drafts || []).map((draft) => ({
  ...draft,
  basicInfo: {
    ...(draft.basicInfo || {}),
    ocrReviewedAt: '2026-06-04T00:00:00.000Z',
    ocrReviewSource: 'edit_detail'
  }
}));
asyncChecks.push(fixtureRepeatApi.createOcrTask({
  profileId: 'profile_mom',
  fixtureCaseIds: ['acth', 'thyroid', 'cortisol', 'liver_function', 'uric_electrolyte_lipid', 'chest_ct_plain', 'abdomen_pelvis_ct_plain']
}).then((task) => fixtureRepeatApi.batchCreateReports({
  ocrTaskId: task.id,
  reports: markDraftsReviewedForTest(task.drafts)
}).then(() => fixtureRepeatApi.createOcrTask({
  profileId: 'profile_mom',
  fixtureCaseIds: ['acth', 'thyroid', 'cortisol', 'liver_function', 'uric_electrolyte_lipid', 'chest_ct_plain', 'abdomen_pelvis_ct_plain']
}))).then((task) => fixtureRepeatApi.checkDuplicateReports({
  profileId: 'profile_mom',
  ocrTaskId: task.id,
  reports: task.drafts
}).then((result) => {
  assert.strictEqual(result.hasDuplicates, true, 'saving the full realcase fixture twice should trigger duplicates');
  assert.ok(result.candidates.length >= 7, 'full fixture duplicate check should include each repeated report');
  return fixtureRepeatApi.batchCreateReports({
    ocrTaskId: task.id,
    reports: markDraftsReviewedForTest(task.drafts)
  }).then(
    () => assert.fail('full fixture duplicate save should require a decision'),
    (error) => {
      assert.strictEqual(error.code, 'DUPLICATE_REPORT_REQUIRES_DECISION');
      return fixtureRepeatApi.batchCreateReports({
        ocrTaskId: task.id,
        reports: markDraftsReviewedForTest(task.drafts),
        duplicateDecisions: result.candidates.map((candidate, index) => ({
          draftId: candidate.draftId,
          decision: index === 0 ? 'replace' : 'skip',
          existingReportId: index === 0 ? 'report_not_a_candidate' : candidate.existingReportId
        }))
      }).then(
        () => assert.fail('invalid duplicate replace target should be rejected'),
        (invalidError) => {
          assert.strictEqual(invalidError.code, 'INVALID_DUPLICATE_DECISION');
        }
      );
    }
  );
})));
asyncChecks.push(mockApi.listRecheckPlans('profile_mom').then((recheck) => {
  assert.ok(recheck.nextPlan, 'mock api should expose next recheck plan');
  assert.ok(Array.isArray(recheck.otherPlans), 'mock api should expose other recheck plans');
  assert.strictEqual(typeof recheck.doneCount, 'number');
}));
let customTodoId = '';
asyncChecks.push(mockApi.createRecheckPlan('profile_mom', {
  type: '常规复查',
  date: '2026-06-20',
  hospital: '协和医院',
  department: '肿瘤科',
  todos: buildDefaultTodos()
}).then((plan) => {
  assert.strictEqual(plan.status, 'pending');
  assert.strictEqual(plan.todos.length, 5);
  return mockApi.updateRecheckPlan(plan.id, {
    hospital: '协和东院',
    department: '影像科'
  });
}).then((plan) => {
  assert.strictEqual(plan.hospital, '协和东院');
  assert.strictEqual(plan.department, '影像科');
  return mockApi.updateRecheckPlan(plan.id, {
    reminderConfig: { advanceDays: [1], subscribeAccepted: false }
  });
}).then((plan) => {
  assert.deepStrictEqual(plan.reminderConfig.advanceDays, [1]);
  return mockApi.addRecheckTodo(plan.id, { text: '自定义待办' });
}).then((plan) => {
  assert.strictEqual(plan.todos.length, 6);
  const customTodo = plan.todos.find((todo) => todo.text === '自定义待办');
  assert.ok(customTodo);
  customTodoId = customTodo.id;
  return mockApi.updateRecheckTodo(plan.id, plan.todos[0].id, { isDone: false }).then(() => mockApi.listRecheckPlans('profile_mom'));
}).then((recheck) => {
  const created = [recheck.nextPlan].concat(recheck.otherPlans).filter(Boolean).find((plan) => plan.date === '2026-06-20');
  assert.ok(created, 'created recheck plan should be listed');
  assert.strictEqual(created.todos[0].isDone, false);
  return mockApi.completeRecheckPlan(created.id).then(
    () => assert.fail('incomplete recheck todos should block completion'),
    (error) => {
      assert.strictEqual(error.code, 'RECHECK_TODOS_NOT_READY');
      return mockApi.updateRecheckTodo(created.id, created.todos[0].id, { isDone: true })
        .then(() => mockApi.updateRecheckTodo(created.id, customTodoId, { isDone: true }));
    }
  ).then(() => mockApi.completeRecheckPlan(created.id)).then(() => mockApi.listRecheckPlans('profile_mom'));
}).then((recheck) => {
  assert.ok(recheck.doneCount >= 1, 'completed plan should increase done count');
  return mockApi.createRecheckPlan('profile_mom', {
    type: 'CT 检查',
    date: '2026-06-22',
    hospital: '肿瘤医院',
    todos: buildDefaultTodos().slice(0, 2)
  });
}).then((plan) => mockApi.cancelRecheckPlan(plan.id).then(() => mockApi.listRecheckPlans('profile_mom'))).then((recheck) => {
  const visible = [recheck.nextPlan].concat(recheck.otherPlans).filter(Boolean);
  assert.ok(!visible.some((plan) => plan.date === '2026-06-22'), 'cancelled plan should be hidden from pending list');
  return mockApi.createRecheckPlan('profile_mom', {
    type: 'CT followup',
    date: '2026-06-23',
    hospital: 'Union Hospital',
    todos: buildDefaultTodos().slice(0, 1)
  });
}).then((plan) => mockApi.deleteRecheckPlan(plan.id).then(() => mockApi.listRecheckPlans('profile_mom'))).then((recheck) => {
  const visible = [recheck.nextPlan].concat(recheck.otherPlans).filter(Boolean);
  assert.ok(!visible.some((plan) => plan.date === '2026-06-23'), 'deleted plan should be hidden from recheck list');
}));
asyncChecks.push(mockApi.setMetricPinned('profile_mom', 'unknown_metric', true).then(
  () => assert.fail('unknown metric should not be pinned'),
  (error) => {
    assert.strictEqual(error.code, 'NOT_FOUND');
  }
));
asyncChecks.push(mockApi.setMetricPinned('profile_mom', 'wbc', false).then((snapshot) => {
  assert.strictEqual(snapshot.metricKey, 'wbc');
  assert.strictEqual(snapshot.isPinned, false);
  return mockApi.listMetricSnapshots('profile_mom', { filter: 'pinned' });
}).then((snapshots) => {
  assert.ok(!snapshots.some((item) => item.metricKey === 'wbc'), 'unpinned metric should be absent from pinned filter');
}));
asyncChecks.push(mockApi.getReportDetail('report_blood_20260428').then(({ report }) => {
  const editedMetrics = report.metrics.map((metric, index) => (
    index === 0
      ? { ...metric, valueNumeric: 5.6, refRangeLow: 3.5, refRangeHigh: 9.5, tone: 'high', isManuallyEdited: true }
      : metric
  ));
  return mockApi.updateReport(report.id, {
    basicInfo: { note: 'manual check' },
    metrics: editedMetrics
  });
}).then(({ report }) => {
  assert.strictEqual(report.note, 'manual check');
  assert.strictEqual(report.metrics[0].tone, 'ok', 'mock report update should correct stale abnormal tone from numeric range');
  return mockApi.deleteReport(report.id).then(() => mockApi.listReports('profile_mom'));
}).then((reports) => {
  assert.ok(!reports.some((report) => report.id === 'report_blood_20260428'), 'deleted report should be hidden from report list');
  return mockApi.listMetricSnapshots('profile_mom');
}).then((snapshots) => {
  assert.ok(!snapshots.some((item) => item.lastReportId === 'report_blood_20260428'), 'snapshots should be recalculated after report deletion');
}));
asyncChecks.push(mockApi.createManualReport('profile_mom', {
  reportDate: '2026-06-03',
  hospital: 'Manual Hospital',
  metric: {
    metricKey: 'manual_complex_ref_unknown',
    metricName: 'Manual complex reference unknown',
    category: 'custom',
    categoryCn: 'Custom',
    valueType: 'quantitative',
    valueNumeric: 104,
    unit: 'pg/mL',
    refText: 'Female 0-1y <=1300; 2-4y <=350',
    mappingStatus: 'confirmed'
  }
}).then(({ report }) => {
  assert.strictEqual(report.metrics[0].tone, 'unknown');
  assert.strictEqual(report.abnormalCount, 0, 'mock manual report must not count unknown complex reference tones as abnormal');
  return mockApi.createManualReport('profile_mom', {
    reportDate: '2026-06-04',
    hospital: 'Manual Hospital',
    metric: {
      metricKey: 'manual_complex_ref_high',
      metricName: 'Manual complex reference high',
      category: 'custom',
      categoryCn: 'Custom',
      valueType: 'quantitative',
      valueNumeric: 104,
      unit: 'pg/mL',
      refText: 'Female 0-1y <=1300; 2-4y <=350',
      tone: 'high',
      mappingStatus: 'confirmed'
    }
  });
}).then(({ report }) => {
  assert.strictEqual(report.metrics[0].tone, 'high');
  assert.strictEqual(report.abnormalCount, 1, 'mock manual report must count explicit abnormal complex reference tones');
}));

const jsFiles = walkFiles(path.join(__dirname, '..', 'miniprogram'), (file) => file.endsWith('.js'));
for (const file of jsFiles) {
  require('child_process').execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
}

const jsonFiles = walkFiles(path.join(__dirname, '..'), (file) => file.endsWith('.json') && !file.includes(`${path.sep}node_modules${path.sep}`));
for (const file of jsonFiles) {
  JSON.parse(fs.readFileSync(file, 'utf8'));
}

Promise.all(asyncChecks).then(async () => {
  for (const check of sequentialChecks) {
    await check();
  }
  console.log(`Unit checks passed: ${jsFiles.length} JS files, ${jsonFiles.length} JSON files`);
}).catch((error) => {
  if (error && typeof error === 'object') console.error(JSON.stringify(error, null, 2));
  else console.error(error);
  process.exitCode = 1;
});
