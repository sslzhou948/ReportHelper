const assert = require('assert');
const fs = require('fs');
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const automator = require('miniprogram-automator');

const root = path.resolve(__dirname, '..');
const cliPath = path.join(process.env.WECHAT_DEVTOOLS_DIR || 'D:\\WeChat-DevTools', 'cli.bat');
const localAppData = process.env.WECHAT_DEVTOOLS_LOCALAPPDATA || path.join(root, '.wechat-localappdata');
const devtoolsPort = Number(process.env.WECHAT_DEVTOOLS_PORT || 9420);
const backendPort = Number(process.env.HEALTHHELPER_MEMORY_PORT || 18787);
const backendBaseUrl = `http://127.0.0.1:${backendPort}`;
const watchdog = setTimeout(() => {
  console.error('Hybrid DevTools smoke timed out after 90s');
  process.exit(1);
}, 90000);

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
    await sleep(1500);
    return withTimeout(
      automator.connect({ wsEndpoint: `ws://127.0.0.1:${devtoolsPort}` }),
      8000,
      'WeChat DevTools reconnect'
    );
  }
}

async function waitForPath(miniProgram, expectedPath, timeout = 8000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const page = await miniProgram.currentPage();
    if (page && page.path === expectedPath) return page;
    await sleep(250);
  }
  return miniProgram.currentPage();
}

async function waitForBackend() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15000) {
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

function startMemoryBackend() {
  return spawn('cmd.exe', ['/d', '/c', 'npm.cmd', '--prefix', 'backend', 'run', 'dev:memory'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(backendPort)
    },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
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

(async () => {
  let backend;
  let miniProgram;

  try {
    backend = startMemoryBackend();
    backend.stdout.on('data', (chunk) => process.stdout.write(chunk));
    backend.stderr.on('data', (chunk) => process.stderr.write(chunk));
    await waitForBackend();

    miniProgram = await connectDevTools();
    await miniProgram.evaluate((baseUrl) => {
      wx.removeStorageSync('pendingOcrTasks');
      wx.removeStorageSync('uploadPhotos');
      wx.removeStorageSync('uploadDraft');
      wx.removeStorageSync('healthDefaultView');
      wx.removeStorageSync('mockReports');
      wx.removeStorageSync('lastDuplicateAlertText');
      wx.removeStorageSync('healthhelperBackendProfileId');
      wx.setStorageSync('healthhelperApiMode', 'hybrid-upload');
      wx.setStorageSync('healthhelperBackendBaseUrl', baseUrl);
      wx.setStorageSync('lastProfileId', 'profile_mom');
      getApp().setCurrentProfileId('profile_mom');
    }, backendBaseUrl);

    let page = await miniProgram.reLaunch('/pages/home/index');
    await page.waitFor(1000);
    await page.callMethod('goRecord');
    page = await waitForPath(miniProgram, 'pages/record/new', 8000);
    assert.strictEqual(page.path, 'pages/record/new', 'home record action should open unified record entry');
    await page.waitFor(1000);
    const uploadEntry = await page.$('.entry-card');
    assert.ok(uploadEntry, 'record entry should render the photo recognition card');
    await uploadEntry.trigger('tap');
    page = await waitForPath(miniProgram, 'pages/upload/pick', 8000);
    if (page.path !== 'pages/upload/pick') {
      const routeError = await miniProgram.evaluate(() => wx.getStorageSync('lastUploadRouteError') || '');
      assert.strictEqual(page.path, 'pages/upload/pick', `record entry should open fixture upload picker: ${routeError}`);
    }
    await page.waitFor(800);
    let data = await page.data();
    assert.strictEqual(data.showFixtureEntry, false, 'fixture entry should stay hidden on the normal user upload path');

    const task = await page.callMethod('startFixtureOcr');
    assert.ok(task && task.id, 'fixture OCR should create a backend task');
    console.log(`hybrid fixture task: ${task.id}`);

    page = await waitForPath(miniProgram, 'pages/upload/confirm', 8000);
    assert.strictEqual(page.path, 'pages/upload/confirm', 'fixture OCR should open confirmation page');
    await page.waitFor(1200);
    data = await page.data();
    assert.strictEqual(data.reports.length, 7, 'backend fixture OCR should expose seven reports');
    assert.strictEqual(data.reportCount, 7, 'backend fixture OCR should report seven drafts');
    assert.ok(data.profileId, 'confirmation page should be bound to backend profile');

    await page.callMethod('saveAll');
    page = await waitForPath(miniProgram, 'pages/health/index', 10000);
    assert.strictEqual(page.path, 'pages/health/index', 'saving backend reports should open health data');
    await page.waitFor(1600);
    data = await page.data();
    assert.ok(data.reportCount >= 7, 'health page should read saved backend reports');
    assert.ok(data.metricCount > 0, 'health page should read backend metric snapshots');
    console.log(`hybrid backend smoke: reports=${data.reportCount}, metrics=${data.metricCount}`);

    console.log('Hybrid DevTools smoke passed.');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (miniProgram) {
      await miniProgram.evaluate(() => {
        wx.removeStorageSync('healthhelperApiMode');
        wx.removeStorageSync('healthhelperBackendBaseUrl');
        wx.removeStorageSync('healthhelperBackendProfileId');
      }).catch(() => null);
      miniProgram.disconnect();
    }
    if (backend) stopProcessTree(backend);
    clearTimeout(watchdog);
  }
})();
