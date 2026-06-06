const assert = require('assert');
const fs = require('fs');
const { createServer } = require('http');
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const automator = require('miniprogram-automator');

const root = path.resolve(__dirname, '..');
const cliPath = path.join(process.env.WECHAT_DEVTOOLS_DIR || 'D:\\WeChat-DevTools', 'cli.bat');
const localAppData = process.env.WECHAT_DEVTOOLS_LOCALAPPDATA || path.join(root, '.wechat-localappdata');
const devtoolsPort = Number(process.env.WECHAT_DEVTOOLS_PORT || 9420);
const assumeDevToolsReady = process.env.HEALTHHELPER_ASSUME_DEVTOOLS_READY === '1';
let backendPort = Number(process.env.HEALTHHELPER_REAL_UPLOAD_PORT || 0);
let backendBaseUrl = backendPort ? `http://127.0.0.1:${backendPort}` : '';
const useRealOpenAi = process.env.HEALTHHELPER_USE_REAL_OPENAI === '1';
const imagePath = process.env.HEALTHHELPER_REAL_UPLOAD_IMAGE_PATH
  ? path.resolve(root, process.env.HEALTHHELPER_REAL_UPLOAD_IMAGE_PATH)
  : path.join(root, 'realtestcase', useRealOpenAi ? 'ACTH.jpg' : '检测样本4.jpg');
const imagePaths = (process.env.HEALTHHELPER_REAL_UPLOAD_IMAGE_PATHS || '')
  .split(/[;,]/)
  .map((item) => item.trim())
  .filter(Boolean)
  .map((item) => path.resolve(root, item));
if (!imagePaths.length) imagePaths.push(imagePath);
const backendEnvPath = path.join(root, 'backend', '.env');
const backendEnv = readDotEnv(backendEnvPath);
const openAiApiKey = process.env.OPENAI_API_KEY || backendEnv.OPENAI_API_KEY || '';
const openAiBaseUrl = process.env.OPENAI_API_BASE_URL || backendEnv.OPENAI_API_BASE_URL || 'https://api.openai.com/v1';
const openAiModel = process.env.OPENAI_OCR_MODEL || backendEnv.OPENAI_OCR_MODEL || 'gpt-4.1-mini';
const requestedOcrProvider = process.env.OCR_PROVIDER || backendEnv.OCR_PROVIDER || 'gpt_vision';
const ocrProvider = normalizeOcrProvider(requestedOcrProvider);
const expectedMinReports = Number(process.env.HEALTHHELPER_REAL_UPLOAD_EXPECT_MIN_REPORTS || 1);
const expectedMinMetrics = Number(process.env.HEALTHHELPER_REAL_UPLOAD_EXPECT_MIN_METRICS || 1);
const expectedReportType = process.env.HEALTHHELPER_REAL_UPLOAD_EXPECT_REPORT_TYPE || '';
const expectedReportTypeKey = process.env.HEALTHHELPER_REAL_UPLOAD_EXPECT_REPORT_TYPE_KEY || '';
const expectedReportModality = process.env.HEALTHHELPER_REAL_UPLOAD_EXPECT_REPORT_MODALITY || '';
const expectedReportAnalysisPolicy = process.env.HEALTHHELPER_REAL_UPLOAD_EXPECT_ANALYSIS_POLICY || '';
const expectedReportExamPart = process.env.HEALTHHELPER_REAL_UPLOAD_EXPECT_EXAM_PART || '';
const expectedReportExamMethod = process.env.HEALTHHELPER_REAL_UPLOAD_EXPECT_EXAM_METHOD || '';
const expectedReportFindingIncludes = process.env.HEALTHHELPER_REAL_UPLOAD_EXPECT_FINDING_INCLUDES || '';
const expectedMetricKey = process.env.HEALTHHELPER_REAL_UPLOAD_EXPECT_METRIC_KEY || (useRealOpenAi ? '' : 'acth');
const expectedMetricTone = process.env.HEALTHHELPER_REAL_UPLOAD_EXPECT_METRIC_TONE || (useRealOpenAi ? '' : 'high');
const expectedOcrRequests = Number(process.env.HEALTHHELPER_REAL_UPLOAD_EXPECT_OCR_REQUESTS || imagePaths.length);
const mockMixedCtFinding = '右肺下叶背段';
let currentStep = 'initializing';
const tabPagePaths = new Set([
  'pages/home/index',
  'pages/health/index',
  'pages/recheck/index',
  'pages/profile/index'
]);
const watchdog = setTimeout(() => {
  console.error(`Real upload DevTools smoke timed out after ${useRealOpenAi ? 240 : 120}s; current step=${currentStep}`);
  process.exit(1);
}, useRealOpenAi ? 240000 : 120000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readDotEnv(file) {
  if (!fs.existsSync(file)) return {};
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).reduce((acc, rawLine) => {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) return acc;
    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) return acc;
    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    acc[key] = value;
    return acc;
  }, {});
}

function normalizeOcrProvider(provider) {
  if (provider === 'gpt_vision') return provider;
  return 'gpt_vision';
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function safeCurrentPage(miniProgram, timeout = 3000) {
  try {
    return await withTimeout(miniProgram.currentPage(), timeout, 'currentPage');
  } catch {
    return null;
  }
}

async function safePageData(page, timeout = 3000) {
  if (!page) return {};
  try {
    return await withTimeout(page.data(), timeout, `page.data ${page.path || ''}`);
  } catch {
    return {};
  }
}

async function safeCallMethod(page, methodName, payload = undefined, timeout = 3000) {
  if (!page) return null;
  try {
    const call = payload === undefined
      ? page.callMethod(methodName)
      : page.callMethod(methodName, payload);
    return await withTimeout(call, timeout, `page.callMethod ${methodName}`);
  } catch {
    return null;
  }
}

async function traceStep(label, action) {
  currentStep = label;
  console.log(`[real-upload] ${label}`);
  try {
    const result = await action();
    console.log(`[real-upload] ${label}: ok`);
    return result;
  } catch (error) {
    error.message = `${label} failed: ${error.message || error}`;
    throw error;
  }
}

function runDevToolsCli(args, timeout = 30000) {
  fs.mkdirSync(localAppData, { recursive: true });
  const result = spawnSync('cmd.exe', ['/d', '/c', 'call', cliPath].concat(args), {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      LOCALAPPDATA: localAppData
    },
    windowsHide: true,
    timeout
  });
  if (result.error) throw result.error;
  if (result.status && result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`WeChat DevTools CLI exited with ${result.status}${output ? `\n${output}` : ''}`);
  }
}

function tryRunDevToolsCli(args, timeout = 30000) {
  try {
    runDevToolsCli(args, timeout);
    return true;
  } catch (error) {
    console.warn(`[real-upload] WeChat DevTools CLI ${args[0]} failed: ${error.message || error}`);
    return false;
  }
}

async function probeDevTools(miniProgram) {
  try {
    await withTimeout(miniProgram.systemInfo(), 3000, 'WeChat DevTools probe');
    await withTimeout(miniProgram.callWxMethod('reLaunch', { url: '/pages/home/index' }), 6000, 'WeChat DevTools route probe');
    const page = await waitForPath(miniProgram, 'pages/home/index', 6000);
    if (!page || page.path !== 'pages/home/index') return false;
    return true;
  } catch {
    return false;
  }
}

async function connectAutomation(timeout, label) {
  return withTimeout(
    automator.connect({ wsEndpoint: `ws://127.0.0.1:${devtoolsPort}` }),
    timeout,
    label
  );
}

async function connectDevTools() {
  fs.mkdirSync(localAppData, { recursive: true });
  process.env.LOCALAPPDATA = localAppData;
  if (assumeDevToolsReady) {
    return connectAutomation(8000, 'WeChat DevTools ready connect');
  }
  let lastError = null;
  let resetBeforeAuto = false;

  try {
    const existing = await connectAutomation(5000, 'WeChat DevTools existing connect');
    if (await probeDevTools(existing)) {
      console.log('[real-upload] reuse existing WeChat DevTools automation');
      return existing;
    }
    lastError = new Error('Existing WeChat DevTools automation was not responsive');
    console.warn('[real-upload] existing WeChat DevTools automation is not route-responsive; resetting IDE');
    resetBeforeAuto = true;
    existing.disconnect();
  } catch (error) {
    lastError = error;
    console.warn(`[real-upload] existing WeChat DevTools connect failed: ${error.message || error}`);
  }

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    if (resetBeforeAuto) {
      tryRunDevToolsCli(['quit'], 15000);
      await sleep(2500);
      resetBeforeAuto = false;
    } else if (attempt > 1) {
      tryRunDevToolsCli(['close', '--project', root], 15000);
      if (attempt === 3) {
        tryRunDevToolsCli(['quit'], 15000);
      }
      await sleep(attempt === 3 ? 2500 : 1200);
    }
    const opened = tryRunDevToolsCli(['open', '--project', root], attempt === 1 ? 30000 : 45000);
    if (!opened) {
      lastError = new Error(`WeChat DevTools open did not start on attempt ${attempt}`);
      continue;
    }
    await sleep(attempt === 1 ? 1500 : 2500);
    const autoStarted = tryRunDevToolsCli(
      ['auto', '--project', root, '--trust-project', `--auto-port=${devtoolsPort}`],
      attempt === 1 ? 30000 : 45000
    );
    if (!autoStarted) {
      lastError = new Error(`WeChat DevTools auto did not start on attempt ${attempt}`);
      continue;
    }
    await sleep(attempt === 1 ? 1500 : 3000);
    let miniProgram = null;
    try {
      miniProgram = await connectAutomation(
        attempt === 1 ? 5000 : 8000,
        attempt === 1 ? 'WeChat DevTools connect' : `WeChat DevTools reconnect ${attempt}`
      );
      if (await probeDevTools(miniProgram)) return miniProgram;
      lastError = new Error(`WeChat DevTools automation was not responsive on attempt ${attempt}`);
    } catch (error) {
      lastError = error;
    }
    if (miniProgram) {
      try {
        miniProgram.disconnect();
      } catch {
        // ignore a broken automation session while reconnecting
      }
    }
  }
  throw lastError || new Error('WeChat DevTools automation did not become responsive');
}

async function findAvailablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('failed to allocate backend port');
  const port = address.port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForPath(miniProgram, expectedPath, timeout = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const page = await safeCurrentPage(miniProgram);
    if (page && page.path === expectedPath) return page;
    await sleep(250);
  }
  return safeCurrentPage(miniProgram);
}

async function relaunchAndWait(miniProgram, url, expectedPath, timeout = 10000) {
  let launchError = null;
  if (tabPagePaths.has(expectedPath)) {
    try {
      await withTimeout(miniProgram.callWxMethod('switchTab', { url }), 6000, `wx.switchTab ${url}`);
      const page = await waitForPath(miniProgram, expectedPath, timeout);
      if (page && page.path === expectedPath) return page;
    } catch (error) {
      launchError = error;
    }

    try {
      const tabPage = await withTimeout(miniProgram.switchTab(url), 6000, `switchTab ${url}`);
      if (tabPage && tabPage.path === expectedPath) return tabPage;
      const page = await waitForPath(miniProgram, expectedPath, timeout);
      if (page && page.path === expectedPath) return page;
    } catch (error) {
      launchError = error;
    }
  }

  try {
    await withTimeout(miniProgram.callWxMethod('reLaunch', { url }), 6000, `wx.reLaunch method ${url}`);
    const page = await waitForPath(miniProgram, expectedPath, timeout);
    if (page && page.path === expectedPath) return page;
  } catch (error) {
    launchError = error;
  }

  try {
    const page = await withTimeout(miniProgram.reLaunch(url), 6000, `reLaunch ${url}`);
    if (page && page.path === expectedPath) return page;
  } catch (error) {
    launchError = error;
  }

  let page = await waitForPath(miniProgram, expectedPath, timeout);
  if (page && page.path === expectedPath) return page;

  try {
    await withTimeout(miniProgram.evaluate((targetUrl) => new Promise((resolve) => {
      wx.reLaunch({
        url: targetUrl,
        complete: () => resolve()
      });
    }), url), 6000, `wx.reLaunch ${url}`);
  } catch (error) {
    if (!launchError) launchError = error;
  }

  page = await waitForPath(miniProgram, expectedPath, timeout);
  if (page && page.path === expectedPath) return page;

  const currentData = await safePageData(page);
  throw new Error(`reLaunch did not reach expected path: ${JSON.stringify({
    url,
    expectedPath,
    currentPath: page && page.path,
    currentData,
    launchError: launchError && launchError.message
  })}`);
}

async function waitForConfirmationReports(page, timeout = 90000, miniProgram = null) {
  const startedAt = Date.now();
  let data = {};
  let lastRefreshAt = 0;
  while (Date.now() - startedAt < timeout) {
    if (miniProgram) {
      const currentPage = await safeCurrentPage(miniProgram);
      if (currentPage) page = currentPage;
    }
    data = await safePageData(page);
    if ((data.reports || []).length >= expectedMinReports) return data;
    if (data.taskStatus === 'failed') {
      throw new Error(`OCR task failed: ${data.errorMessage || 'unknown error'}`);
    }
    if (Date.now() - lastRefreshAt > 2000) {
      lastRefreshAt = Date.now();
      await safeCallMethod(page, 'loadTask');
    }
    await sleep(1000);
  }
  throw new Error(`confirmation page did not receive OCR reports: ${JSON.stringify({
    path: page && page.path,
    loading: data.loading,
    recognizing: data.recognizing,
    taskStatus: data.taskStatus,
    errorMessage: data.errorMessage,
    reportCount: (data.reports || []).length,
    expectedMinReports
  })}`);
}

async function waitForEditDetailLoaded(page, timeout = 10000) {
  const startedAt = Date.now();
  let data = {};
  while (Date.now() - startedAt < timeout) {
    data = await safePageData(page);
    if (!data.loading && data.basicInfo && (data.basicInfo.type || data.basicInfo.hospital || data.basicInfo.reportDate)) return data;
    await sleep(300);
  }
  throw new Error(`edit detail did not load OCR draft: ${JSON.stringify({
    loading: data.loading,
    basicInfo: data.basicInfo,
    groups: data.groups,
    findings: data.findings,
    warnings: data.warnings
  })}`);
}

async function tapEditDetailSave(page, index) {
  const data = await safePageData(page);
  if (!data.editing) {
    await withTimeout(page.callMethod('startEdit'), 5000, `start OCR review detail edit ${index + 1}`);
    await page.waitFor(300);
  }
  const bottomButtons = await page.$$('.bottom-grid .btn');
  const saveButton = bottomButtons[bottomButtons.length - 1] || await page.$('.nav-side.right');
  assert.ok(saveButton, `OCR review detail ${index + 1} should expose a save button`);
  await withTimeout(saveButton.trigger('tap'), 8000, `tap OCR review detail save ${index + 1}`);
}

async function reviewRequiredOcrReports(miniProgram, confirmPage, data) {
  const reports = data.reports || [];
  const reviewIndexes = reports
    .map((report, index) => ({ report, index }))
    .filter(({ report }) => report.requiresDetailReview);
  for (const { report, index } of reviewIndexes) {
    if (report.needsManualInput || report.basicInfoIncomplete || report.conflictCount) {
      throw new Error(`OCR report requires manual input before smoke can auto-review: ${JSON.stringify({
        index,
        type: report.type,
        needsManualInput: report.needsManualInput,
        basicInfoIncomplete: report.basicInfoIncomplete,
        conflictCount: report.conflictCount,
        reviewRequiredText: report.reviewRequiredText
      })}`);
    }

    await traceStep(`open OCR review detail ${index + 1}`, () => confirmPage.callMethod('goEdit', {
      currentTarget: {
        dataset: { index }
      }
    }));
    const detailPage = await traceStep(`wait for OCR review detail ${index + 1}`, () => waitForPath(miniProgram, 'pages/upload/edit-detail', 10000));
    if (!detailPage || detailPage.path !== 'pages/upload/edit-detail') {
      const currentData = await safePageData(detailPage);
      throw new Error(`OCR review detail did not open: ${JSON.stringify({
        expectedIndex: index,
        currentPath: detailPage && detailPage.path,
        currentData
      })}`);
    }
    await traceStep(`wait for OCR review detail data ${index + 1}`, () => waitForEditDetailLoaded(detailPage));
    await traceStep(`mark OCR review detail ${index + 1}`, () => tapEditDetailSave(detailPage, index));
    confirmPage = await traceStep(`return to confirmation page after review ${index + 1}`, () => waitForPath(miniProgram, 'pages/upload/confirm', 15000));
    if (!confirmPage || confirmPage.path !== 'pages/upload/confirm') {
      const currentData = await safePageData(confirmPage);
      throw new Error(`OCR review detail did not return to confirmation page: ${JSON.stringify({
        expectedIndex: index,
        currentPath: confirmPage && confirmPage.path,
        currentData
      })}`);
    }
    data = await traceStep(`refresh confirmation reports after review ${index + 1}`, () => waitForConfirmationReports(confirmPage, 30000, miniProgram));
  }
  return {
    page: confirmPage,
    data
  };
}

async function waitForHealthReadback(page, timeout = 20000) {
  const startedAt = Date.now();
  let data = {};
  while (Date.now() - startedAt < timeout) {
    data = await safePageData(page);
    if ((data.reportCount || 0) >= expectedMinReports && (data.metricCount || 0) >= expectedMinMetrics) return data;
    await sleep(500);
  }
  throw new Error(`health page did not read saved report: ${JSON.stringify({
    reportCount: data.reportCount,
    metricCount: data.metricCount,
    expectedMinReports,
    expectedMinMetrics,
    loading: data.loading,
    currentView: data.currentView,
    reportsByMonth: data.reportsByMonth,
    metrics: data.metrics
  })}`);
}

function flattenHealthReports(data) {
  return (data.reportsByMonth || []).flatMap((group) => group.items || []);
}

function expectedSavedReportPairs() {
  return [
    ['type', expectedReportType],
    ['typeKey', expectedReportTypeKey],
    ['modality', expectedReportModality],
    ['analysisPolicy', expectedReportAnalysisPolicy],
    ['examPart', expectedReportExamPart],
    ['examMethod', expectedReportExamMethod]
  ].filter(([, expected]) => expected);
}

function reportMatchesExpectedMetadata(report, expectedPairs) {
  return expectedPairs.every(([field, expected]) => String(report[field] || '').includes(expected));
}

function reportContainsMetric(report, metricKey) {
  if (!metricKey) return false;
  return (report.metrics || []).some((metric) => metric.metricKey === metricKey);
}

function reportContainsFinding(report, findingIncludes) {
  if (!findingIncludes) return false;
  return (report.findings || []).join('\n').includes(findingIncludes);
}

function reportContainsExpectedMetric(report) {
  return reportContainsMetric(report, expectedMetricKey);
}

function reportContainsExpectedFinding(report) {
  return reportContainsFinding(report, expectedReportFindingIncludes);
}

function selectExpectedSavedReport(data) {
  const expectedPairs = expectedSavedReportPairs();
  const reports = flattenHealthReports(data);
  assert.ok(reports.length >= expectedMinReports, `expected saved reports in health readback: ${JSON.stringify(data.reportsByMonth)}`);
  return reports.find((item) => (
    reportMatchesExpectedMetadata(item, expectedPairs)
    && (!expectedMetricKey || reportContainsExpectedMetric(item))
    && (!expectedReportFindingIncludes || reportContainsExpectedFinding(item))
  ))
    || (expectedMetricKey ? reports.find(reportContainsExpectedMetric) : null)
    || (expectedReportFindingIncludes ? reports.find(reportContainsExpectedFinding) : null)
    || reports.find((item) => reportMatchesExpectedMetadata(item, expectedPairs))
    || reports[0];
}

function assertExpectedSavedReport(data) {
  const expectedPairs = expectedSavedReportPairs();
  const report = selectExpectedSavedReport(data);
  for (const [field, expected] of expectedPairs) {
    assert.ok(
      String(report[field] || '').includes(expected),
      `saved report ${field} mismatch: actual=${JSON.stringify(report[field])}, expected to include=${JSON.stringify(expected)}`
    );
  }
  if (expectedReportFindingIncludes) {
    const findingsText = (report.findings || []).join('\n');
    assert.ok(
      findingsText.includes(expectedReportFindingIncludes),
      `saved report findings mismatch: expected to include=${JSON.stringify(expectedReportFindingIncludes)}, actual=${JSON.stringify(report.findings || [])}`
    );
  }
  return report;
}

function assertMockMixedCtReport(data) {
  if (useRealOpenAi || imagePaths.length < 2) return null;
  const reports = flattenHealthReports(data);
  const report = reports.find((item) => (
    item.typeKey === 'ct_plain'
    && item.modality === 'imaging'
    && item.analysisPolicy === 'view_only'
    && reportContainsFinding(item, mockMixedCtFinding)
  ));
  assert.ok(
    report,
    `mock mixed batch should save a CT imaging report with finding ${JSON.stringify(mockMixedCtFinding)}: ${JSON.stringify(reports.map((item) => ({
      id: item.id,
      type: item.type,
      typeKey: item.typeKey,
      modality: item.modality,
      analysisPolicy: item.analysisPolicy,
      findings: item.findings,
      metrics: (item.metrics || []).map((metric) => metric.metricKey)
    })))}`
  );
  assert.strictEqual((report.metrics || []).length, 0, `mock CT report should not create lab metrics: ${JSON.stringify(report.metrics || [])}`);
  return report;
}

function assertExpectedMetricSnapshot(data) {
  if (!expectedMetricKey && !expectedMetricTone) return;

  const metrics = data.metrics || [];
  assert.ok(metrics.length >= expectedMinMetrics, `expected metric snapshots in health readback: ${JSON.stringify(metrics)}`);
  const metric = expectedMetricKey
    ? metrics.find((item) => item.metricKey === expectedMetricKey)
    : metrics[0];
  assert.ok(
    metric,
    `saved metric snapshot mismatch: expected metricKey=${JSON.stringify(expectedMetricKey)}, actual=${JSON.stringify(metrics.map((item) => item.metricKey))}`
  );
  if (expectedMetricTone) {
    assert.strictEqual(
      String(metric.lastTone || metric.tone || ''),
      expectedMetricTone,
      `saved metric tone mismatch for ${metric.metricKey}: actual=${JSON.stringify(metric.lastTone || metric.tone)}, expected=${JSON.stringify(expectedMetricTone)}`
    );
  }
}

async function waitForReportDetail(page, savedReportId, timeout = 10000) {
  const startedAt = Date.now();
  let data = {};
  while (Date.now() - startedAt < timeout) {
    data = await safePageData(page);
    if (data.report && data.report.id === savedReportId) return data;
    await sleep(300);
  }
  throw new Error(`report detail did not load saved report: ${JSON.stringify({
    expectedReportId: savedReportId,
    loading: data.loading,
    report: data.report,
    groups: data.groups,
    findings: data.findings
  })}`);
}

async function openAndAssertReportDetail(miniProgram, healthPage, savedReport, expectations = {}) {
  const minMetrics = expectations.minMetrics === undefined ? expectedMinMetrics : expectations.minMetrics;
  const metricKey = expectations.metricKey === undefined ? expectedMetricKey : expectations.metricKey;
  const metricTone = expectations.metricTone === undefined ? expectedMetricTone : expectations.metricTone;
  const findingIncludes = expectations.findingIncludes === undefined ? expectedReportFindingIncludes : expectations.findingIncludes;
  assert.ok(savedReport && savedReport.id, `saved report should include id for detail navigation: ${JSON.stringify(savedReport)}`);
  const healthDataBeforeNavigation = await safePageData(healthPage);
  await healthPage.callMethod('goReport', {
    currentTarget: {
      dataset: {
        id: savedReport.id
      }
    }
  });

  const page = await waitForPath(miniProgram, 'pages/health/report-detail', 10000);
  if (!page || page.path !== 'pages/health/report-detail') {
    const currentData = await safePageData(page);
    throw new Error(`saved report did not open detail from health list: ${JSON.stringify({
      expectedReportId: savedReport.id,
      currentPath: page && page.path,
      savedReport,
      healthDataBeforeNavigation,
      currentData
    })}`);
  }

  const detail = await waitForReportDetail(page, savedReport.id);
  assert.strictEqual(detail.report.id, savedReport.id);
  assert.strictEqual(detail.report.typeKey, savedReport.typeKey);

  const detailMetrics = (detail.groups || []).flatMap((group) => group.items || []);
  if (minMetrics > 0) {
    assert.ok(detailMetrics.length >= minMetrics, `report detail should include saved metrics: ${JSON.stringify(detail.groups)}`);
  }
  if (metricKey) {
    const metric = detailMetrics.find((item) => item.metricKey === metricKey);
    assert.ok(metric, `report detail metric mismatch: expected=${metricKey}, actual=${JSON.stringify(detailMetrics.map((item) => item.metricKey))}`);
    if (metricTone) {
      assert.strictEqual(
        String(metric.tone || ''),
        metricTone,
        `report detail metric tone mismatch for ${metric.metricKey}: actual=${JSON.stringify(metric.tone)}, expected=${JSON.stringify(metricTone)}`
      );
    }
  }
  if (findingIncludes) {
    const findingsText = (detail.findings || []).join('\n');
    assert.ok(
      findingsText.includes(findingIncludes),
      `report detail findings mismatch: expected=${JSON.stringify(findingIncludes)}, actual=${JSON.stringify(detail.findings || [])}`
    );
  }
  return detail;
}

function stopProcessTree(child) {
  if (!child || !child.pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true
    });
    return;
  }
  child.kill('SIGTERM');
}

async function startMockOpenAiServer() {
  const requests = [];
  const mockCtImagePath = imagePaths.find((item) => path.basename(item).toLowerCase().includes('chest_ct'));
  const mockCtImageBase64 = mockCtImagePath && fs.existsSync(mockCtImagePath)
    ? fs.readFileSync(mockCtImagePath).toString('base64')
    : '';
  function bodyMatchesMockCtImage(bodyText) {
    return mockCtImageBase64 && bodyText.includes(mockCtImageBase64);
  }
  function mockActhRawText(reportDateSlash) {
    return [
      `天津市某医院检验报告单`,
      `报告名称：促肾上腺皮质激素检测`,
      `检验时间：${reportDateSlash} 08:00`,
      '项目\t结果\t参考范围\t单位',
      '促肾上腺皮质激素(ACTH)\t301\t7.2-63.3\tpg/mL'
    ].join('\n');
  }
  function mockCtRawText(reportDateSlash) {
    return [
      '北京协和医院',
      '胸腹盆 CT 平扫',
      '医院：北京协和医院',
      '姓名：测试三号',
      '单号：SYNCT-MOCK',
      `检查日期：${reportDateSlash}`,
      '检查所见：',
      '双肺多发微、小结节，较大者位于右肺下叶背段，大小约 6 mm×5 mm，请随诊。',
      '检查意见：',
      '双肺多发微、小结节，右肺下叶背段实性结节，建议随诊复查。',
      `报告日期：${reportDateSlash}`
    ].join('\n');
  }
  function mockActhStructuredDraft(reportDateDash) {
    return {
      sourcePhotoIds: [],
      pageCount: 1,
      basicInfo: {
        type: '血浆ACTH (8AM)',
        originalType: '血浆ACTH (8AM)',
        typeKey: 'acth',
        canonicalTypeName: '血浆ACTH (8AM)',
        modality: 'laboratory',
        analysisPolicy: 'metric_analysis',
        hospital: 'DevTools Mock Hospital',
        hospitalSource: 'ocr',
        reportDate: reportDateDash,
        reportDateSource: 'ocr',
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
        unit: 'pg/mL',
        refRangeLow: 7.2,
        refRangeHigh: 63.3,
        refQualitative: null,
        refText: null,
        tone: 'high',
        ocrConfidence: 0.8
      }],
      findings: [],
      conflicts: [],
      warnings: [],
      status: 'needs_review'
    };
  }
  function mockCtStructuredDraft(reportDateDash) {
    return {
      sourcePhotoIds: [],
      pageCount: 1,
      basicInfo: {
        type: '胸腹盆CT平扫',
        originalType: '胸腹盆 CT 平扫',
        typeKey: 'ct_plain',
        canonicalTypeName: '胸腹盆CT平扫',
        modality: 'imaging',
        analysisPolicy: 'view_only',
        hospital: 'DevTools Mock Hospital',
        hospitalSource: 'ocr',
        reportDate: reportDateDash,
        reportDateSource: 'ocr',
        examDate: reportDateDash,
        patientName: null,
        department: null,
        orderNo: 'SYNCT-MOCK',
        examPart: '胸部/腹部/盆腔',
        examMethod: 'CT平扫',
        reportLike: true,
        confidence: 0.9
      },
      metrics: [],
      findings: [
        '双肺多发微、小结节，较大者位于右肺下叶背段，大小约 6 mm×5 mm，请随诊。',
        '双肺多发微、小结节，右肺下叶背段实性结节，建议随诊复查。'
      ],
      conflicts: [],
      warnings: [],
      status: 'needs_review'
    };
  }
  const server = createServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    request.on('end', () => {
      const bodyText = Buffer.concat(chunks).toString('utf8');
      const body = bodyText ? JSON.parse(bodyText) : {};
      const requestIndex = requests.length;
      const reportDate = new Date(Date.UTC(2026, 4, 30 + requestIndex));
      const reportDateDash = reportDate.toISOString().slice(0, 10);
      const reportDateSlash = reportDateDash.replace(/-/g, '/');
      const useMockCt = bodyMatchesMockCtImage(bodyText) || (!mockCtImageBase64 && imagePaths.length > 1 && requestIndex % 2 === 1);
      requests.push({ url: request.url, method: request.method, body });
      response.writeHead(200, { 'content-type': 'application/json' });
      if ((request.url || '').includes('/chat/completions')) {
        const rawText = useMockCt ? mockCtRawText(reportDateSlash) : mockActhRawText(reportDateSlash);
        response.end(JSON.stringify({
          choices: [{
            message: {
              content: [
                { type: 'text', text: rawText.slice(0, Math.ceil(rawText.length / 2)) },
                { type: 'text', text: rawText.slice(Math.ceil(rawText.length / 2)) }
              ]
            }
          }]
        }));
        return;
      }
      response.end(JSON.stringify({
        output_text: JSON.stringify({
          drafts: [useMockCt ? mockCtStructuredDraft(reportDateDash) : mockActhStructuredDraft(reportDateDash)]
        })
      }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('mock OpenAI server did not bind a port');
  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    requests,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

function startMemoryBackend(openAiBaseUrl, apiKey, model, provider) {
  return spawn('cmd.exe', ['/d', '/c', 'npm.cmd', '--prefix', 'backend', 'run', 'dev:memory'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(backendPort),
      BACKEND_PUBLIC_BASE_URL: backendBaseUrl,
      OCR_PROVIDER: provider,
      OPENAI_API_KEY: apiKey,
      OPENAI_API_BASE_URL: openAiBaseUrl,
      OPENAI_OCR_MODEL: model,
      LOCAL_OBJECT_STORAGE_DIR: '../tmp/devtools-real-upload-object-storage'
    },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

function backendExitError(child) {
  if (!child) return null;
  if (child.exitCode === null && child.signalCode === null) return null;
  return new Error(`memory backend exited before becoming ready (code=${child.exitCode}, signal=${child.signalCode})`);
}

async function waitForBackend(child) {
  await sleep(300);
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15000) {
    const earlyExit = backendExitError(child);
    if (earlyExit) throw earlyExit;
    try {
      const response = await fetch(`${backendBaseUrl}/api/health`);
      if (response.ok) return;
    } catch (error) {
      // keep polling until the memory backend is ready
    }
    await sleep(300);
  }
  throw new Error('memory backend did not become ready');
}

async function getBackendProfileId() {
  const response = await fetch(`${backendBaseUrl}/api/profiles`);
  assert.ok(response.ok, `profile bootstrap failed: ${response.status}`);
  const payload = await response.json();
  assert.ok(payload.data && payload.data[0] && payload.data[0].id, 'memory backend should expose a default profile');
  return payload.data[0].id;
}

(async () => {
  let backend;
  let miniProgram;
  let mockOpenAi;

  try {
    currentStep = 'checking configuration';
    if (useRealOpenAi && !openAiApiKey) {
      console.log('Skipped real OCR upload DevTools smoke: OPENAI_API_KEY is not configured.');
      return;
    }

    if (!backendPort) {
      backendPort = await traceStep('allocate memory backend port', () => findAvailablePort());
      backendBaseUrl = `http://127.0.0.1:${backendPort}`;
    }

    if (useRealOpenAi) {
      await traceStep('prepare real OCR provider', () => Promise.resolve());
      backend = startMemoryBackend(openAiBaseUrl, openAiApiKey, openAiModel, ocrProvider);
    } else {
      mockOpenAi = await traceStep('start mock OpenAI server', () => startMockOpenAiServer());
      backend = startMemoryBackend(mockOpenAi.baseUrl, 'test-openai-key', openAiModel, ocrProvider);
    }
    currentStep = 'start memory backend process';
    console.log(`[real-upload] start memory backend process: pid=${backend.pid || 'unknown'}, port=${backendPort}`);
    backend.stdout.on('data', (chunk) => process.stdout.write(chunk));
    backend.stderr.on('data', (chunk) => process.stderr.write(chunk));
    await traceStep('wait for memory backend', () => waitForBackend(backend));
    const backendProfileId = await traceStep('load backend profile', () => getBackendProfileId());

    miniProgram = await traceStep('connect WeChat DevTools', () => connectDevTools());
    let page = await traceStep('open home page before storage configuration', () => relaunchAndWait(miniProgram, '/pages/home/index', 'pages/home/index', 12000));
    await page.waitFor(1000);
    await traceStep('configure Mini Program storage', () => withTimeout(miniProgram.evaluate((baseUrl, profileId) => {
      wx.removeStorageSync('pendingOcrTasks');
      wx.removeStorageSync('uploadPhotos');
      wx.removeStorageSync('uploadDraft');
      wx.removeStorageSync('healthDefaultView');
      wx.removeStorageSync('mockReports');
      wx.setStorageSync('healthhelperApiMode', 'hybrid-upload');
      wx.setStorageSync('healthhelperBackendBaseUrl', baseUrl);
      wx.setStorageSync('healthhelperBackendProfileId', profileId);
      wx.setStorageSync('lastProfileId', 'profile_mom');
      getApp().setCurrentProfileId('profile_mom');
    }, backendBaseUrl, backendProfileId), 10000, 'configure Mini Program storage'));

    page = await traceStep('open home page', () => relaunchAndWait(miniProgram, '/pages/home/index', 'pages/home/index', 12000));
    await page.waitFor(1000);
    page = await traceStep('open upload picker', () => relaunchAndWait(miniProgram, '/pages/upload/pick', 'pages/upload/pick', 12000));
    page = await traceStep('wait for upload picker', () => waitForPath(miniProgram, 'pages/upload/pick', 8000));
    assert.strictEqual(page.path, 'pages/upload/pick', 'smoke should open upload picker directly');
    await page.waitFor(800);
    const smokeFiles = imagePaths.map((item) => {
      const imageBytes = fs.readFileSync(item);
      const smokeFileName = path.basename(item);
      const smokeMimeType = smokeFileName.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
      return {
        base64: imageBytes.toString('base64'),
        fileName: smokeFileName,
        mimeType: smokeMimeType,
        size: imageBytes.length
      };
    });
    const task = await traceStep('run real upload smoke hook', () => page.callMethod('runRealUploadSmokeForTest', {
      files: smokeFiles
    }));
    assert.ok(task && task.id, 'real upload OCR should create a backend task');
    assert.ok(['processing', 'needs_confirmation'].includes(task.status), 'real OCR should create an async or confirmation-ready task');

    page = await traceStep('wait for confirmation page', () => waitForPath(miniProgram, 'pages/upload/confirm', 12000));
    assert.strictEqual(page.path, 'pages/upload/confirm', 'real upload OCR should open confirmation page');
    let data = await traceStep('wait for OCR confirmation reports', () => waitForConfirmationReports(page, useRealOpenAi ? 180000 : 90000));
    assert.ok(data.reports.length >= expectedMinReports, `confirmation page should expose expected OCR drafts: actual=${data.reports.length}, expected>=${expectedMinReports}`);
    if (useRealOpenAi) {
      assert.ok(data.reports[0].type, 'confirmation page should render the real OCR report name');
    } else {
      assert.strictEqual(data.reports[0].type, '血浆ACTH (8AM)', 'confirmation page should render the real OCR report name');
    }
    if ((data.reports || []).some((report) => report.requiresDetailReview)) {
      const reviewed = await reviewRequiredOcrReports(miniProgram, page, data);
      page = reviewed.page;
      data = reviewed.data;
    }

    const saveButton = await page.$('.bottom-action .btn');
    assert.ok(saveButton, 'confirmation page should expose a save button');
    await traceStep('tap save all reports', () => miniProgram.evaluate(() => {
      const pages = getCurrentPages();
      const current = pages[pages.length - 1];
      if (!current || typeof current.saveAll !== 'function') {
        throw new Error('confirm page saveAll method is not available');
      }
      return current.saveAll();
    }));
    page = await traceStep('wait for health page after save', () => waitForPath(miniProgram, 'pages/health/index', 30000));
    if (page.path !== 'pages/health/index') {
      const stuckData = await safePageData(page);
      throw new Error(`saving real OCR report did not open health data: page=${page.path}, data=${JSON.stringify({
        saving: stuckData.saving,
        saveDebug: stuckData.saveDebug,
        recognizing: stuckData.recognizing,
        taskStatus: stuckData.taskStatus,
        errorMessage: stuckData.errorMessage,
        unresolvedConflictCount: stuckData.unresolvedConflictCount,
        reports: (stuckData.reports || []).map((report) => ({
          type: report.type,
          needsManualInput: report.needsManualInput,
          requiresDetailReview: report.requiresDetailReview,
          basicInfoIncomplete: report.basicInfoIncomplete,
          conflictCount: report.conflictCount
        }))
      })}`);
    }
    data = await traceStep('wait for health readback', () => waitForHealthReadback(page, useRealOpenAi ? 30000 : 20000));
    const savedReport = assertExpectedSavedReport(data);
    assertExpectedMetricSnapshot(data);
    const mockMixedCtReport = assertMockMixedCtReport(data);
    if (mockMixedCtReport) {
      await traceStep('open mock mixed CT report detail', () => openAndAssertReportDetail(miniProgram, page, mockMixedCtReport, {
        minMetrics: 0,
        metricKey: '',
        metricTone: '',
        findingIncludes: mockMixedCtFinding
      }));
    } else {
      await traceStep('open expected saved report detail', () => openAndAssertReportDetail(miniProgram, page, savedReport));
    }
    if (mockOpenAi) {
      assert.strictEqual(mockOpenAi.requests.length, expectedOcrRequests, `real upload flow should call configured OCR provider ${expectedOcrRequests} time(s)`);
      assert.ok(mockOpenAi.requests.every((item) => JSON.stringify(item.body).includes('data:image/')), 'OCR provider requests should include uploaded image bytes');
    }

    console.log(`${useRealOpenAi ? 'Real OCR upload' : 'Mock real upload'} DevTools smoke passed: provider=${ocrProvider}, task=${task.id}, reports=${data.reportCount}, metrics=${data.metricCount}, expectedReports=${expectedMinReports}, expectedMetrics=${expectedMinMetrics}`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (miniProgram) {
      await withTimeout(miniProgram.evaluate(() => {
        wx.removeStorageSync('healthhelperApiMode');
        wx.removeStorageSync('healthhelperBackendBaseUrl');
        wx.removeStorageSync('healthhelperBackendProfileId');
      }), 5000, 'cleanup Mini Program storage').catch(() => null);
      miniProgram.disconnect();
    }
    if (backend) stopProcessTree(backend);
    if (mockOpenAi) await mockOpenAi.close().catch(() => null);
    clearTimeout(watchdog);
  }
})().then(() => {
  process.exit(process.exitCode || 0);
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
