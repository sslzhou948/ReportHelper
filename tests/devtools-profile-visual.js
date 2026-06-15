const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const automator = require('miniprogram-automator');

const root = path.resolve(__dirname, '..');
const cliPath = path.join(process.env.WECHAT_DEVTOOLS_DIR || 'D:\\WeChat-DevTools', 'cli.bat');
const localAppData = process.env.WECHAT_DEVTOOLS_LOCALAPPDATA || path.join(root, '.wechat-localappdata');
const devtoolsPort = Number(process.env.WECHAT_DEVTOOLS_PORT || 9420);
const screenshotPath = path.join(root, 'tmp', 'ui-refresh-profile.png');

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
    await sleep(1800);
    return withTimeout(
      automator.connect({ wsEndpoint: `ws://127.0.0.1:${devtoolsPort}` }),
      10000,
      'WeChat DevTools reconnect'
    );
  }
}

function visualFixture() {
  return {
    profile: {
      id: 'profile_mom',
      relation: '妈妈',
      realName: '王芬',
      avatarText: '芬',
      summary: '乳腺癌术后 · 第 24 个月'
    },
    profiles: [
      { id: 'profile_mom', relation: '妈妈', realName: '王芬', avatarText: '芬' },
      { id: 'profile_self', relation: '我自己', realName: '李建国', avatarText: '建' },
      { id: 'profile_father', relation: '爸爸', realName: '王建华', avatarText: '建' }
    ],
    reportsCount: 12,
    metricsCount: 54,
    recheckCount: 3,
    switcherVisible: false,
    devRuntimeVisible: false,
    networkOffline: false,
    loading: false,
    loadingSlow: false,
    layout: {
      homeBannerPaddingTop: 172,
      homeBannerMinHeight: 312
    }
  };
}

function timedElement(page, selector) {
  return withTimeout(page.$(selector), 5000, `query ${selector}`);
}

(async () => {
  let miniProgram;
  try {
    miniProgram = await connectDevTools();
    console.log('connected to WeChat DevTools');
    const page = await withTimeout(miniProgram.switchTab('/pages/profile/index'), 20000, 'profile tab switch');
    await page.waitFor(1200);

    await withTimeout(page.setData(visualFixture()), 8000, 'set profile fixture');
    await page.waitFor(300);

    assert.ok(await timedElement(page, '.profile-hero'), 'profile hero should render');
    assert.ok(await timedElement(page, '.profile-card'), 'profile card should render');
    assert.ok(await timedElement(page, '.profile-menu-row'), 'profile menu rows should render');
    assert.ok(await timedElement(page, '.profile-logout-card'), 'profile logout should render');
    console.log('profile fixture nodes verified');

    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    await withTimeout(miniProgram.screenshot({ path: screenshotPath }), 45000, 'profile screenshot');
    console.log(`profile visual fixture applied, screenshot saved: ${screenshotPath}`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (miniProgram) miniProgram.disconnect();
    setTimeout(() => process.exit(process.exitCode || 0), 0);
  }
})();
