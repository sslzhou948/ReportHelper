const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const automator = require('miniprogram-automator');

const root = path.resolve(__dirname, '..');
const cliPath = path.join(process.env.WECHAT_DEVTOOLS_DIR || 'D:\\WeChat-DevTools', 'cli.bat');
const localAppData = process.env.WECHAT_DEVTOOLS_LOCALAPPDATA || path.join(root, '.wechat-localappdata');
const devtoolsPort = Number(process.env.WECHAT_DEVTOOLS_PORT || 9420);
const pickScreenshotPath = path.join(root, 'tmp', 'ui-refresh-upload-pick.png');
const confirmScreenshotPath = path.join(root, 'tmp', 'ui-refresh-upload-confirm.png');
const visualTarget = process.env.HEALTHHELPER_UPLOAD_VISUAL_TARGET || 'both';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function runDevToolsCli(args) {
  fs.mkdirSync(localAppData, { recursive: true });
  const result = spawnSync('cmd.exe', ['/d', '/c', 'call', cliPath].concat(args), {
    cwd: root,
    stdio: 'ignore',
    env: {
      ...process.env,
      LOCALAPPDATA: localAppData
    },
    windowsHide: true,
    timeout: 15000
  });
  if (result.error) throw result.error;
  if (result.status && result.status !== 0) {
    throw new Error(`WeChat DevTools CLI exited with ${result.status}`);
  }
}

async function safeCurrentPage(miniProgram, timeout = 3000) {
  try {
    return await withTimeout(miniProgram.currentPage(), timeout, 'currentPage');
  } catch {
    return null;
  }
}

async function waitForPath(miniProgram, expectedPath, timeout = 12000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const page = await safeCurrentPage(miniProgram);
    if (page && page.path === expectedPath) return page;
    await sleep(250);
  }
  return safeCurrentPage(miniProgram);
}

async function relaunchAndWait(miniProgram, url, expectedPath, timeout = 12000) {
  let launchError = null;
  try {
    await withTimeout(miniProgram.callWxMethod('reLaunch', { url }), 6000, `wx.reLaunch method ${url}`);
  } catch (error) {
    launchError = error;
  }

  let page = await waitForPath(miniProgram, expectedPath, timeout);
  if (page && page.path === expectedPath) return page;

  try {
    page = await withTimeout(miniProgram.reLaunch(url), 6000, `reLaunch ${url}`);
    if (page && page.path === expectedPath) return page;
  } catch (error) {
    launchError = error;
  }

  page = await waitForPath(miniProgram, expectedPath, timeout);
  if (page && page.path === expectedPath) return page;
  throw new Error(`reLaunch did not reach ${expectedPath}: current=${page && page.path}, error=${launchError && launchError.message}`);
}

async function openSecondaryPage(miniProgram, url, expectedPath) {
  try {
    await withTimeout(miniProgram.switchTab('/pages/home/index'), 12000, 'switch home before secondary page');
  } catch {
    await withTimeout(miniProgram.callWxMethod('switchTab', { url: '/pages/home/index' }), 6000, 'wx.switchTab home before secondary page').catch(() => null);
  }
  await waitForPath(miniProgram, 'pages/home/index', 12000).catch(() => null);
  await withTimeout(miniProgram.callWxMethod('navigateTo', { url }), 6000, `wx.navigateTo ${url}`).catch(() => null);
  const page = await waitForPath(miniProgram, expectedPath, 12000);
  if (page && page.path === expectedPath) return page;
  throw new Error(`navigateTo did not reach ${expectedPath}: current=${page && page.path}`);
}

async function connectDevTools() {
  fs.mkdirSync(localAppData, { recursive: true });
  process.env.LOCALAPPDATA = localAppData;
  try {
    return await withTimeout(
      automator.connect({ wsEndpoint: `ws://127.0.0.1:${devtoolsPort}` }),
      5000,
      'WeChat DevTools connect'
    );
  } catch (error) {
    runDevToolsCli(['auto', '--project', root, '--trust-project', `--auto-port=${devtoolsPort}`]);
    await sleep(1800);
    return withTimeout(
      automator.connect({ wsEndpoint: `ws://127.0.0.1:${devtoolsPort}` }),
      10000,
      'WeChat DevTools reconnect'
    );
  }
}

function samplePhoto(id) {
  return {
    id,
    group: 1,
    tempFilePath: '/assets/ui-refresh/upload-report-sample.png',
    fileName: `visual-report-${id}.png`,
    mimeType: 'image/png',
    size: 32000,
    width: 1600,
    height: 2200,
    qualityWarning: '',
    groupReportNo: 1,
    groupPageIndex: id,
    groupPageCount: 2,
    groupToneClass: 'group-tone-1',
    groupPositionClass: id === 1 ? 'group-start' : 'group-end',
    isSelected: false,
    selectedOrder: 0
  };
}

function pickFixture() {
  if (process.env.HEALTHHELPER_UPLOAD_EMPTY === '1') {
    return {
      photos: [],
      reportCount: 0,
      grouping: false,
      selected: [],
      loading: false,
      showFixtureEntry: false,
      uploadError: '',
      hasDraft: false,
      qualityWarningCount: 0
    };
  }
  return {
    photos: [samplePhoto(1), samplePhoto(2)],
    reportCount: 1,
    grouping: false,
    selected: [],
    loading: false,
    showFixtureEntry: false,
    uploadError: '',
    hasDraft: false,
    qualityWarningCount: 0
  };
}

function reportFixture(overrides) {
  return {
    draftId: overrides.draftId,
    title: overrides.title || '报告 1',
    type: overrides.type,
    canonicalTypeName: overrides.canonicalTypeName || '',
    modality: overrides.modality || 'laboratory',
    examPart: overrides.examPart || '',
    analysisPolicy: overrides.analysisPolicy || 'metric_analysis',
    meta: overrides.meta,
    count: overrides.count,
    abnormal: overrides.abnormal || '',
    pendingText: overrides.pendingText || '',
    warningText: overrides.warningText || '',
    warningMoreText: '',
    inferredText: '',
    reviewRequiredText: overrides.reviewRequiredText || '',
    manualText: '',
    conflict: !!overrides.conflict,
    conflictCount: overrides.conflictCount || 0,
    sourcePhotoIds: [],
    sourcePreviewUrls: ['/assets/ui-refresh/upload-report-sample.png'],
    sourcePreviewCount: 1,
    pageCount: overrides.pageCount || 1,
    canSplit: !!overrides.canSplit,
    status: '',
    reportLike: true,
    basicInfoIncomplete: false,
    requiresDetailReview: !!overrides.requiresDetailReview,
    needsManualInput: false
  };
}

function confirmFixture() {
  return {
    loading: false,
    saving: false,
    recognizing: false,
    slowRecognition: false,
    profileId: 'profile_mom',
    reports: [
      reportFixture({
        draftId: 'visual_report_blood',
        type: '全血细胞分析',
        canonicalTypeName: '血常规',
        meta: '天津市东丽区新立街社区卫生服务中心 · 2026-06-06',
        count: '31 项指标',
        abnormal: '5 项异常',
        pendingText: '2 项待确认归类',
        canSplit: true,
        pageCount: 2
      }),
      reportFixture({
        draftId: 'visual_report_urine',
        type: '尿常规',
        meta: '2026-06-02',
        count: '12 项指标',
        abnormal: '1 项异常',
        conflict: true,
        conflictCount: 1,
        warningText: '1 项重复识别，值不一致',
        canSplit: false
      })
    ],
    reportCount: 2,
    unresolvedConflictCount: 1,
    taskStatus: 'needs_confirmation',
    errorMessage: '',
    retrying: false,
    removingDraftIndex: -1,
    splittingDraftIndex: -1,
    openingDetailIndex: -1,
    openingManualIndex: -1,
    profileNoticeText: '',
    saveDebug: ''
  };
}

function timedElement(page, selector) {
  return withTimeout(page.$(selector), 5000, `query ${selector}`);
}

async function maybeAutomatorScreenshot(miniProgram, screenshotPath, label) {
  if (process.env.HEALTHHELPER_UPLOAD_SKIP_AUTOMATOR_SCREENSHOT === '1') {
    console.log(`${label} screenshot skipped by environment`);
    return;
  }
  try {
    await withTimeout(miniProgram.screenshot({ path: screenshotPath }), 45000, `${label} screenshot`);
    console.log(`${label} screenshot saved: ${screenshotPath}`);
  } catch (error) {
    console.warn(`${label} screenshot blocked: ${error.message}`);
  }
}

(async () => {
  let miniProgram;
  try {
    miniProgram = await connectDevTools();
    console.log('connected to WeChat DevTools');

    if (visualTarget !== 'confirm') {
      const page = await openSecondaryPage(miniProgram, '/pages/upload/pick', 'pages/upload/pick');
      await page.waitFor(1000);
      await withTimeout(page.setData(pickFixture()), 8000, 'set upload pick fixture');
      await page.waitFor(300);
      assert.ok(await timedElement(page, '.ocr-quality-tip'), 'upload picker quality tip should render');
      assert.ok(await timedElement(page, '.upload-action'), 'upload picker action cards should render');
      assert.ok(await timedElement(page, '.photo-grid'), 'upload picker photo grid should render');
      fs.mkdirSync(path.dirname(pickScreenshotPath), { recursive: true });
      await maybeAutomatorScreenshot(miniProgram, pickScreenshotPath, 'upload pick');
    }

    if (visualTarget !== 'pick') {
      const page = await openSecondaryPage(miniProgram, '/pages/upload/confirm?taskId=visual', 'pages/upload/confirm');
      await page.waitFor(1200);
      await withTimeout(page.setData(confirmFixture()), 8000, 'set upload confirm fixture');
      await page.waitFor(300);
      assert.ok(await timedElement(page, '.confirm-notice'), 'upload confirm notices should render');
      assert.ok(await timedElement(page, '.confirm-report-card'), 'upload confirm report cards should render');
      assert.ok(await timedElement(page, '.report-action-footer'), 'upload confirm report action footer should render');
      fs.mkdirSync(path.dirname(confirmScreenshotPath), { recursive: true });
      await maybeAutomatorScreenshot(miniProgram, confirmScreenshotPath, 'upload confirm');
    }
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (miniProgram) miniProgram.disconnect();
    setTimeout(() => process.exit(process.exitCode || 0), 0);
  }
})();
