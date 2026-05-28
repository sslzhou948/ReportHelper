const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');
const automator = require('miniprogram-automator');

const root = path.resolve(__dirname, '..');
const cliPath = path.join(process.env.WECHAT_DEVTOOLS_DIR || 'D:\\WeChat-DevTools', 'cli.bat');
const devtoolsPort = Number(process.env.WECHAT_DEVTOOLS_PORT || 9420);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runDevToolsCli(args) {
  spawnSync('cmd.exe', ['/d', '/c', 'call', cliPath].concat(args), {
    cwd: root,
    stdio: 'ignore',
    windowsHide: true
  });
}

async function connectDevTools() {
  try {
    return await automator.connect({ wsEndpoint: `ws://127.0.0.1:${devtoolsPort}` });
  } catch (error) {
    runDevToolsCli(['auto', '--project', root, '--trust-project', '--auto-port', String(devtoolsPort)]);
    await sleep(1500);
    return automator.connect({ wsEndpoint: `ws://127.0.0.1:${devtoolsPort}` });
  }
}

async function waitForPath(miniProgram, expectedPath, timeout = 5000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const page = await miniProgram.currentPage();
    if (page && page.path === expectedPath) return page;
    await sleep(250);
  }
  return miniProgram.currentPage();
}

(async () => {
  let miniProgram;

  try {
    miniProgram = await connectDevTools();
    await miniProgram.evaluate(() => {
      wx.removeStorageSync('pendingOcrTasks');
      wx.removeStorageSync('uploadPhotos');
      wx.removeStorageSync('uploadDraft');
      wx.removeStorageSync('healthDefaultView');
      wx.removeStorageSync('mockReports');
      wx.removeStorageSync('lastDuplicateAlertText');
      wx.setStorageSync('lastProfileId', 'profile_mom');
      getApp().setCurrentProfileId('profile_mom');
    });

    let page = await miniProgram.reLaunch('/pages/home/index');
    await page.waitFor(1200);
    let data = await page.data();
    assert.ok(data.profile && data.profile.id, 'home should load current profile');
    assert.ok(Array.isArray(data.reports), 'home should expose reports array');
    assert.ok(Array.isArray(data.alertMetrics), 'home should expose alert metrics array');
    console.log(`home smoke: profile=${data.profile.realName || data.profile.id}, reports=${data.reports.length}`);

    await page.callMethod('goUpload');
    page = await waitForPath(miniProgram, 'pages/upload/pick', 6000);
    assert.strictEqual(page.path, 'pages/upload/pick', 'home upload action should open upload page');
    await page.waitFor(600);
    data = await page.data();
    assert.strictEqual(data.photos.length, 0, 'upload page should start empty');
    assert.strictEqual(data.reportCount, 0, 'empty upload page should have zero reports');
    console.log('upload smoke: empty state passed');

    const duplicateResult = await page.callMethod('runFixtureDuplicateSmokeForTest');
    assert.strictEqual(duplicateResult.hasDuplicates, true, 'second fixture save should detect duplicates');
    assert.ok(duplicateResult.candidateCount >= 7, 'full fixture duplicate check should include each repeated report');
    assert.strictEqual(duplicateResult.secondCount, duplicateResult.firstCount, 'skipping repeated fixture reports should not create redundant reports');
    console.log('fixture duplicate smoke passed');

    const editResult = await page.callMethod('runFixtureReportEditSmokeForTest');
    assert.strictEqual(editResult.note, 'devtools edit smoke', 'report edit should persist note');
    assert.ok(editResult.abnormalCount >= 1, 'report edit should recalculate abnormal count');
    assert.strictEqual(editResult.isManuallyEdited, true, 'edited metric should be marked manually edited');
    assert.strictEqual(editResult.historyHasEditedValue, true, 'metric history should include edited value');
    console.log('fixture report edit smoke passed');

    const openedReportDetail = await page.callMethod('openLastEditSmokeReportForTest');
    assert.strictEqual(openedReportDetail, true, 'fixture edit smoke should expose a report detail target');
    page = await waitForPath(miniProgram, 'pages/health/report-detail', 6000);
    assert.strictEqual(page.path, 'pages/health/report-detail', 'fixture edit smoke should open report detail page');
    await page.waitFor(800);
    await page.callMethod('showEdit');
    page = await waitForPath(miniProgram, 'pages/upload/edit-detail', 6000);
    assert.strictEqual(page.path, 'pages/upload/edit-detail', 'report detail edit should open edit-detail page');
    await page.waitFor(800);
    data = await page.data();
    assert.strictEqual(data.editing, true, 'report detail edit entry should open in edit mode');
    assert.strictEqual(data.basicInfo.reportDate.length, 10, 'edit page should expose report date');
    console.log('report detail edit navigation passed');

    console.log('DevTools smoke passed.');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (miniProgram) miniProgram.disconnect();
  }
})();
