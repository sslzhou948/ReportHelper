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

    console.log('fixture smoke: reuse upload page');
    await page.setData({ showFixtureEntry: true });
    data = await page.data();
    assert.strictEqual(data.showFixtureEntry, true, 'fixture route should expose realcase entry');
    console.log('fixture smoke: route ready');
    const firstTask = await page.callMethod('startFixtureOcr');
    console.log(`fixture smoke: first OCR task created ${firstTask && firstTask.id}`);
    await miniProgram.evaluate((taskId) => {
      wx.navigateTo({ url: `/pages/upload/confirm?taskId=${taskId}&fixture=realcase` });
    }, firstTask.id);
    page = await waitForPath(miniProgram, 'pages/upload/confirm', 6000);
    assert.strictEqual(page.path, 'pages/upload/confirm', 'fixture OCR should open confirmation page');
    await page.waitFor(1000);
    data = await page.data();
    assert.strictEqual(data.reportCount, 7, 'fixture confirmation should show seven reports');
    console.log('fixture smoke: first confirmation ready');
    await page.callMethod('saveAll');
    console.log('fixture smoke: first save requested');
    page = await waitForPath(miniProgram, 'pages/health/index', 6000);
    assert.strictEqual(page.path, 'pages/health/index', 'first fixture save should enter health page');
    await page.waitFor(1000);
    const firstSaveCount = await miniProgram.evaluate(() => {
      const reports = wx.getStorageSync('mockReports') || [];
      return reports.filter((report) => report.profileId === 'profile_mom' && !report.deletedAt).length;
    });
    assert.ok(firstSaveCount >= 11, 'first fixture save should persist reports in mock storage');

    await miniProgram.evaluate(() => {
      wx.showActionSheet = (options) => {
        wx.setStorageSync('lastDuplicateAlertText', options.alertText || '');
        options.success({ tapIndex: 2 });
      };
    });
    await miniProgram.evaluate(() => {
      wx.navigateTo({ url: '/pages/upload/pick' });
    });
    page = await waitForPath(miniProgram, 'pages/upload/pick', 6000);
    assert.strictEqual(page.path, 'pages/upload/pick', 'second fixture flow should open upload page');
    await page.waitFor(600);
    await page.setData({ showFixtureEntry: true });
    console.log('fixture smoke: second route ready');
    const secondTask = await page.callMethod('startFixtureOcr');
    console.log(`fixture smoke: second OCR task created ${secondTask && secondTask.id}`);
    await miniProgram.evaluate((taskId) => {
      wx.navigateTo({ url: `/pages/upload/confirm?taskId=${taskId}&fixture=realcase` });
    }, secondTask.id);
    page = await waitForPath(miniProgram, 'pages/upload/confirm', 6000);
    await page.waitFor(1000);
    console.log('fixture smoke: second confirmation ready');
    await page.callMethod('saveAll');
    console.log('fixture smoke: second save requested');
    page = await waitForPath(miniProgram, 'pages/health/index', 6000);
    await page.waitFor(1000);
    const duplicateResult = await miniProgram.evaluate(() => {
      const reports = wx.getStorageSync('mockReports') || [];
      return {
        alertText: wx.getStorageSync('lastDuplicateAlertText'),
        count: reports.filter((report) => report.profileId === 'profile_mom' && !report.deletedAt).length
      };
    });
    assert.ok(duplicateResult.alertText.includes('已存在'), 'second fixture save should show duplicate decision prompt');
    assert.strictEqual(duplicateResult.count, firstSaveCount, 'skipping repeated fixture reports should not create redundant reports');
    console.log('fixture duplicate smoke passed');

    console.log('DevTools smoke passed.');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (miniProgram) miniProgram.disconnect();
  }
})();
