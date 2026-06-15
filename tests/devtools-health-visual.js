const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const automator = require('miniprogram-automator');

const root = path.resolve(__dirname, '..');
const cliPath = path.join(process.env.WECHAT_DEVTOOLS_DIR || 'D:\\WeChat-DevTools', 'cli.bat');
const localAppData = process.env.WECHAT_DEVTOOLS_LOCALAPPDATA || path.join(root, '.wechat-localappdata');
const devtoolsPort = Number(process.env.WECHAT_DEVTOOLS_PORT || 9420);
const metricScreenshotPath = path.join(root, 'tmp', 'ui-refresh-health-metric.png');
const timeScreenshotPath = path.join(root, 'tmp', 'ui-refresh-health-time.png');

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

function metricItem(overrides) {
  return {
    metricKey: overrides.metricKey,
    metricName: overrides.metricName,
    valueType: 'quantitative',
    displayValue: overrides.displayValue,
    lastValueNumeric: overrides.displayValue,
    unit: overrides.unit,
    lastTone: overrides.lastTone || 'ok',
    isAbnormal: ['high', 'low', 'abnormal', 'positive'].includes(overrides.lastTone || ''),
    lastDate: overrides.lastDate || '2026-06-06',
    trendLabel: overrides.trendLabel || '持平'
  };
}

function visualFixture(view) {
  const groupedMetrics = [
    {
      category: 'blood_routine',
      categoryCn: '血常规',
      abnormalCount: 5,
      latestDate: '2026-06-06',
      displayLatestDate: '6月6日',
      icon: '/assets/ui-refresh/health-icon-blood.png',
      items: [
        metricItem({ metricKey: 'wbc', metricName: '白细胞', displayValue: '3.97', unit: '10^9/L' }),
        metricItem({ metricKey: 'hgb', metricName: '血红蛋白', displayValue: '132', unit: 'g/L' }),
        metricItem({ metricKey: 'hct', metricName: '红细胞压积', displayValue: '40.5', unit: '%' }),
        metricItem({ metricKey: 'mcv', metricName: '平均红细胞体积', displayValue: '101.9', unit: 'fL', lastTone: 'high' })
      ]
    },
    {
      category: 'liver_function',
      categoryCn: '肝功能',
      abnormalCount: 1,
      latestDate: '2026-05-21',
      displayLatestDate: '5月21日',
      icon: '/assets/ui-refresh/health-icon-liver.png',
      items: [
        metricItem({ metricKey: 'alt', metricName: '谷丙转氨酶', displayValue: '32', unit: 'U/L' }),
        metricItem({ metricKey: 'tbil', metricName: '总胆红素', displayValue: '24', unit: 'μmol/L', lastTone: 'high' })
      ]
    }
  ];

  return {
    view,
    range: 'all',
    rangeLabel: '全部',
    rangeOptions: [
      { key: 'all', label: '全部' },
      { key: '30d', label: '近30天', days: 30 },
      { key: '90d', label: '近90天', days: 90 },
      { key: '1y', label: '近1年', days: 365 }
    ],
    filter: '全部',
    metricCount: 54,
    reportCount: 3,
    abnormalCount: 5,
    reportAbnormalTotal: 6,
    metrics: [],
    groupedMetrics,
    reportsByMonth: [
      {
        month: '2026-06',
        title: '2026年6月',
        items: [
          {
            id: 'visual_report_blood',
            type: '全血细胞分析',
            hospital: '天津市东丽区新立街社区卫生服务中心',
            reportDate: '2026-06-06',
            dayText: '06',
            monthText: '6月',
            abnormalCount: 5,
            statusText: '5 项异常',
            statusTone: 'high'
          },
          {
            id: 'visual_report_urine',
            type: '尿常规',
            hospital: '天津市东丽区新立街社区卫生服务中心',
            reportDate: '2026-06-02',
            dayText: '02',
            monthText: '6月',
            abnormalCount: 1,
            statusText: '1 项异常',
            statusTone: 'high'
          }
        ]
      },
      {
        month: '2026-05',
        title: '2026年5月',
        items: [
          {
            id: 'visual_report_liver',
            type: '肝功能',
            hospital: '天津市东丽区新立街社区卫生服务中心',
            reportDate: '2026-05-21',
            dayText: '21',
            monthText: '5月',
            abnormalCount: 0,
            statusText: '全部正常',
            statusTone: 'primary'
          }
        ]
      }
    ],
    chips: ['全部', '异常指标', '血常规', '肝功能', '肾功能', '肿瘤标志物'],
    layout: {
      homeBannerPaddingTop: 172,
      homeBannerMinHeight: 312,
      navPaddingTop: 144,
      navMinHeight: 200
    },
    networkOffline: false,
    loadingSlow: false
  };
}

async function maybeScreenshot(miniProgram, screenshotPath, label) {
  if (process.env.WECHAT_HEALTH_SCREENSHOT !== '1') {
    console.log(`${label} visual fixture applied, screenshot skipped by default`);
    return;
  }
  fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
  try {
    await withTimeout(miniProgram.screenshot({ path: screenshotPath }), 18000, `${label} screenshot`);
    console.log(`${label} visual fixture applied, screenshot saved: ${screenshotPath}`);
  } catch (error) {
    console.warn(`${label} visual fixture applied, screenshot blocked: ${error.message}`);
    console.warn(`Leave WeChat DevTools on pages/health/index and capture manually if needed.`);
  }
}

function timedElement(page, selector) {
  return withTimeout(page.$(selector), 5000, `query ${selector}`);
}

(async () => {
  let miniProgram;
  try {
    miniProgram = await connectDevTools();
    console.log('connected to WeChat DevTools');
    const page = await withTimeout(miniProgram.reLaunch('/pages/health/index'), 12000, 'health page relaunch');
    await page.waitFor(1200);
    console.log('health page launched');

    await withTimeout(page.setData(visualFixture('metric')), 8000, 'set metric fixture');
    await page.waitFor(300);
    assert.ok(await timedElement(page, '.health-hero'), 'health hero should render');
    assert.ok(await timedElement(page, '.health-segmented'), 'health segmented control should render');
    assert.ok(await timedElement(page, '.health-chip'), 'health filter chips should render');
    assert.ok(await timedElement(page, '.metric-group-card'), 'health metric group card should render');
    assert.ok(await timedElement(page, '.metric-data-row'), 'health metric rows should render');
    console.log('health metric fixture nodes verified');
    await maybeScreenshot(miniProgram, metricScreenshotPath, 'health metric');

    await withTimeout(page.setData(visualFixture('time')), 8000, 'set time fixture');
    await page.waitFor(300);
    assert.ok(await timedElement(page, '.report-month-card'), 'health monthly report card should render');
    assert.ok(await timedElement(page, '.report-data-row'), 'health report rows should render');
    console.log('health time fixture nodes verified');
    await maybeScreenshot(miniProgram, timeScreenshotPath, 'health time');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (miniProgram) miniProgram.disconnect();
    setTimeout(() => process.exit(process.exitCode || 0), 0);
  }
})();
