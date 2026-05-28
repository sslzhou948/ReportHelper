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

    const duplicateResult = await page.callMethod('runFixtureDuplicateSmokeForTest');
    assert.strictEqual(duplicateResult.hasDuplicates, true, 'second fixture save should detect duplicates');
    assert.ok(duplicateResult.candidateCount >= 7, 'full fixture duplicate check should include each repeated report');
    assert.strictEqual(duplicateResult.secondCount, duplicateResult.firstCount, 'skipping repeated fixture reports should not create redundant reports');
    console.log('fixture duplicate smoke passed');

    console.log('DevTools smoke passed.');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (miniProgram) miniProgram.disconnect();
  }
})();
