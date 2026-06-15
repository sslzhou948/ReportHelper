const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const automator = require('miniprogram-automator');

const root = path.resolve(__dirname, '..');
const cliPath = path.join(process.env.WECHAT_DEVTOOLS_DIR || 'D:\\WeChat-DevTools', 'cli.bat');
const localAppData = process.env.WECHAT_DEVTOOLS_LOCALAPPDATA || path.join(root, '.wechat-localappdata');
const devtoolsPort = Number(process.env.WECHAT_DEVTOOLS_PORT || 9420);
const screenshotPath = path.join(root, 'tmp', 'ui-refresh-recheck-plan.png');

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
    nextPlan: {
      id: 'visual_recheck_next',
      date: '2026-06-14',
      displayDate: '6月14日',
      weekday: '周日',
      icon: '/assets/ui-refresh/recheck-plan-stethoscope.png',
      monthNumber: '6',
      dayText: '14',
      monthText: '6月',
      hospital: '协和医院',
      type: '常规复查',
      todos: [
        { id: 'todo_1', text: '预约挂号', isDone: true, swipeOpen: false },
        { id: 'todo_2', text: '准备身份证和病历本', isDone: true, swipeOpen: false },
        { id: 'todo_3', text: '复查前一日清淡饮食', isDone: true, swipeOpen: false },
        { id: 'todo_4', text: '复查当天空腹', isDone: false, swipeOpen: false },
        { id: 'todo_5', text: '提前 2 小时出发', isDone: false, swipeOpen: false }
      ]
    },
    otherPlans: [
      {
        id: 'visual_recheck_blood',
        date: '2026-07-28',
        weekday: '周二',
        icon: '/assets/ui-refresh/recheck-plan-lab.png',
        dayText: '28',
        monthText: '7月',
        hospital: '协和医院',
        type: '血检'
      },
      {
        id: 'visual_recheck_follow',
        date: '2026-08-10',
        weekday: '周一',
        icon: '/assets/ui-refresh/recheck-plan-stethoscope.png',
        dayText: '10',
        monthText: '8月',
        hospital: '协和医院',
        type: '门诊随访'
      }
    ],
    doneCount: 12,
    readyCount: 3,
    progressPercent: 60,
    allReady: false,
    daysToNext: 5,
    layout: {
      homeBannerPaddingTop: 172,
      homeBannerMinHeight: 312
    },
    networkOffline: false,
    addingTodo: false,
    todoDraft: '',
    loading: false,
    loadingSlow: false
  };
}

async function maybeScreenshot(miniProgram) {
  if (process.env.WECHAT_RECHECK_SCREENSHOT !== '1') {
    console.log('recheck visual fixture applied, screenshot skipped by default');
    return;
  }
  fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
  await withTimeout(miniProgram.screenshot({ path: screenshotPath }), 18000, 'recheck screenshot');
  console.log(`recheck visual fixture applied, screenshot saved: ${screenshotPath}`);
}

function timedElement(page, selector) {
  return withTimeout(page.$(selector), 5000, `query ${selector}`);
}

(async () => {
  let miniProgram;
  try {
    miniProgram = await connectDevTools();
    console.log('connected to WeChat DevTools');
    const page = await withTimeout(miniProgram.switchTab('/pages/recheck/index'), 20000, 'recheck tab switch');
    await page.waitFor(1200);

    await withTimeout(page.setData(visualFixture()), 8000, 'set recheck fixture');
    await page.waitFor(300);
    assert.ok(await timedElement(page, '.recheck-hero'), 'recheck hero should render');
    assert.ok(await timedElement(page, '.next-card'), 'recheck next card should render');
    assert.ok(await timedElement(page, '.todo-row'), 'recheck todo rows should render');
    assert.ok(await timedElement(page, '.future-row'), 'recheck future rows should render');
    assert.ok(await timedElement(page, '.plan-actions'), 'recheck action footer should render');
    assert.ok(await timedElement(page, '.done-link'), 'recheck completed link should render');
    console.log('recheck fixture nodes verified');
    await maybeScreenshot(miniProgram);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (miniProgram) miniProgram.disconnect();
    setTimeout(() => process.exit(process.exitCode || 0), 0);
  }
})();
