const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const automator = require('miniprogram-automator');

const root = path.resolve(__dirname, '..');
const cliPath = path.join(process.env.WECHAT_DEVTOOLS_DIR || 'D:\\WeChat-DevTools', 'cli.bat');
const localAppData = process.env.WECHAT_DEVTOOLS_LOCALAPPDATA || path.join(root, '.wechat-localappdata');
const devtoolsPort = Number(process.env.WECHAT_DEVTOOLS_PORT || 9420);
const screenshotPath = path.join(root, 'tmp', 'ui-refresh-home-visual.png');

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

function fixtureSparkline(tone = 'ok') {
  return {
    tone,
    segments: [
      { id: '1', left: 12, top: 26, width: 44.8, angle: -7.7, tone },
      { id: '2', left: 56.4, top: 20, width: 44.9, angle: -7.6, tone },
      { id: '3', left: 100.8, top: 14.1, width: 37.4, angle: 19.7, tone },
      { id: '4', left: 136.2, top: 26.7, width: 38.6, angle: -4.0, tone }
    ],
    points: [
      { id: 'latest', left: 174, top: 24, tone }
    ]
  };
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
      avatarText: '芬'
    },
    reports: [
      {
        id: 'visual_report_blood',
        fullType: '全血细胞分析',
        fullHospital: '协和医院',
        displayHospital: '协和医院',
        displayDate: '6月6日',
        abnormalCount: 5
      },
      {
        id: 'visual_report_liver',
        fullType: '肝功能',
        fullHospital: '协和医院',
        displayHospital: '协和医院',
        displayDate: '5月21日',
        abnormalCount: 1
      },
      {
        id: 'visual_report_urine',
        fullType: '尿常规',
        fullHospital: '协和医院',
        displayHospital: '协和医院',
        displayDate: '5月10日',
        abnormalCount: 0
      }
    ],
    pinnedMetrics: [
      {
        metricKey: 'wbc',
        metricName: '白细胞',
        valueType: 'quantitative',
        lastValueNumeric: '3.97',
        unit: '10^9/L',
        lastTone: 'low',
        sparkline: fixtureSparkline('low')
      },
      {
        metricKey: 'hgb',
        metricName: '血红蛋白',
        valueType: 'quantitative',
        lastValueNumeric: '132',
        unit: 'g/L',
        lastTone: 'ok',
        sparkline: fixtureSparkline('ok')
      },
      {
        metricKey: 'hct',
        metricName: '红细胞压积',
        valueType: 'quantitative',
        lastValueNumeric: '40.5',
        unit: '%',
        lastTone: 'high',
        sparkline: fixtureSparkline('high')
      }
    ],
    alertMetrics: [
      { metricKey: 'm1', metricName: '白细胞', lastTone: 'high' },
      { metricKey: 'm2', metricName: '中性粒细胞', lastTone: 'high' },
      { metricKey: 'm3', metricName: '红细胞', lastTone: 'low' },
      { metricKey: 'm4', metricName: '平均红细胞体积', lastTone: 'high' },
      { metricKey: 'm5', metricName: '尿蛋白', lastTone: 'positive' },
      { metricKey: 'm6', metricName: '胆红素', lastTone: 'high' }
    ],
    alertSummaryText: '白细胞、中性粒细胞、红细胞等6项',
    nextPlan: {
      id: 'visual_recheck_next',
      date: '6月14日',
      hospital: '协和医院',
      type: '常规复查'
    },
    daysToNext: 5,
    greetingText: '晚上好，愿您早日康复',
    pendingOcrTask: null,
    networkOffline: false,
    loadingSlow: false
  };
}

(async () => {
  let miniProgram;
  try {
    miniProgram = await connectDevTools();
    const page = await miniProgram.reLaunch('/pages/home/index');
    await page.waitFor(1200);
    await page.setData(visualFixture());
    await page.waitFor(300);

    assert.ok(await page.$('.upload-cta'), 'home upload CTA should render');
    assert.ok(await page.$('.metric-card'), 'home metric cards should render');
    assert.ok(await page.$('.metric-sparkline'), 'home metric sparklines should render');
    assert.ok(await page.$('.report-row'), 'home report rows should render');

    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    try {
      await withTimeout(miniProgram.screenshot({ path: screenshotPath }), 45000, 'home screenshot');
      console.log(`home visual fixture applied, screenshot saved: ${screenshotPath}`);
    } catch (error) {
      console.warn(`home visual fixture applied, screenshot blocked: ${error.message}`);
      console.warn(`Leave WeChat DevTools on pages/home/index and capture manually if needed.`);
    }
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (miniProgram) miniProgram.disconnect();
  }
})();
