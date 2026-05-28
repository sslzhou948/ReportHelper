const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const contract = JSON.parse(fs.readFileSync(path.join(__dirname, 'visual', 'layout-contract.json'), 'utf8'));

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

const appWxss = read('miniprogram/app.wxss');
const homeWxss = read('miniprogram/pages/home/index.wxss');
const homeWxml = read('miniprogram/pages/home/index.wxml');
const profileWxss = read('miniprogram/pages/profile/index.wxss');
const metricDetailWxml = read('miniprogram/pages/health/metric-detail.wxml');
const metricDetailWxss = read('miniprogram/pages/health/metric-detail.wxss');
const trendChartWxml = read('miniprogram/components/trend-chart/trend-chart.wxml');
const trendChartWxss = read('miniprogram/components/trend-chart/trend-chart.wxss');
const trendChartJs = read('miniprogram/components/trend-chart/trend-chart.js');
const reportDetailWxss = read('miniprogram/pages/health/report-detail.wxss');
const uploadPickWxss = read('miniprogram/pages/upload/pick.wxss');
const uploadConfirmWxss = read('miniprogram/pages/upload/confirm.wxss');
const uploadEditWxss = read('miniprogram/pages/upload/edit-detail.wxss');
const uploadConflictWxss = read('miniprogram/pages/upload/conflict.wxss');
const appJs = read('miniprogram/app.js');
const wxmlFiles = [];

function walk(dir) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const relativePath = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(relativePath);
    else if (entry.name.endsWith('.wxml')) wxmlFiles.push(relativePath);
  }
}

walk('miniprogram');

function getRule(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`));
  assert.ok(match, `missing css rule: ${selector}`);
  return match[1];
}

function assertDecl(rule, declaration, message) {
  assert.ok(rule.includes(declaration), message || `missing declaration: ${declaration}`);
}

assert.ok(appWxss.includes('--bg: #EDEAE4'), 'page background token must match wireframe');
assert.ok(appWxss.includes('--primary: #5A7A5A'), 'primary color token must match wireframe');
assert.ok(appWxss.includes('padding: 0 32rpx'), 'page horizontal padding must be 16px / 32rpx');
assert.ok(appWxss.includes('border-radius: 44rpx'), 'card radius must be 22px / 44rpx');
assert.ok(appWxss.includes('height: 96rpx'), 'primary button height must be 48px / 96rpx');
assert.ok(appWxss.includes('calc(156rpx + env(safe-area-inset-bottom))'), 'tab pages must reserve tab bar height and safe area');

assert.ok(appJs.includes('wx.getMenuButtonBoundingClientRect'), 'custom top layout must read WeChat capsule geometry');
assert.ok(appJs.includes('capsuleBottom + 10'), 'home banner must use normal capsule-safe spacing');
assert.ok(appJs.includes('homeBannerPaddingTop + 124'), 'home banner height must stay near normal wireframe scale');
assert.ok(homeWxml.includes('layout.homeBannerPaddingTop'), 'home banner must use dynamic capsule-safe padding');
assert.ok(homeWxml.includes('layout.homeBannerMinHeight'), 'home banner must use dynamic min-height');
assert.ok(homeWxss.includes('padding-right: 188rpx'), 'home head must reserve right-side capsule area');
assert.ok(homeWxss.includes('width: 100%'), 'home cards must define full-width layout');
assert.ok(homeWxss.includes('min-height: 128rpx'), 'upload CTA must keep stable normal-mode height');
assert.ok(homeWxss.includes('.mini-spark'), 'home metric cards must include compact trend visuals');
assert.ok(!homeWxml.includes('<button class="upload-cta"'), 'home upload CTA must avoid native button layout');
assert.ok(!homeWxml.includes('<button class="card card-pad recheck-card"'), 'home recheck card must avoid native button layout');

for (const file of wxmlFiles) {
  assert.ok(!read(file).includes('<button'), `visual baseline must not use native button layout: ${file}`);
}

const homeUpload = getRule(homeWxss, '.upload-cta');
assertDecl(homeUpload, 'width: 100%', 'home upload card must fill content width');
assertDecl(homeUpload, 'min-height: 128rpx', 'home upload card must stay normal sized');
assertDecl(homeUpload, 'text-align: left', 'home upload content must be left aligned');

const homeRecheck = getRule(homeWxss, '.recheck-card');
assertDecl(homeRecheck, 'width: 100%', 'home recheck card must fill content width');
assertDecl(homeRecheck, 'min-height: 128rpx', 'home recheck card must stay normal sized');

const metricCard = getRule(homeWxss, '.metric-card');
assertDecl(metricCard, 'width: 296rpx', 'home metric card width must match 148px baseline');
assertDecl(metricCard, 'white-space: normal', 'home metric card text must wrap inside the fixed card');

const reportType = getRule(homeWxss, '.report-type');
assertDecl(reportType, 'max-width: 150rpx', 'home report type pill must not squeeze the row');
assertDecl(reportType, 'text-overflow: ellipsis', 'home report type must truncate instead of wrapping vertically');

const reportMain = getRule(homeWxss, '.report-main');
assertDecl(reportMain, 'flex: 1', 'home report main text must take remaining row width');
assertDecl(reportMain, 'min-width: 0', 'home report main text must be allowed to shrink horizontally');

const ocrStatusEntry = getRule(homeWxss, '.ocr-status-entry');
assertDecl(ocrStatusEntry, 'margin-left: auto', 'home OCR status entry must align to the safe right side of the header');
assertDecl(ocrStatusEntry, 'max-width: 220rpx', 'home OCR status entry must stay compact beside the profile chip');
assertDecl(ocrStatusEntry, 'white-space: nowrap', 'home OCR status entry text must not wrap into the banner');

const sectionAction = getRule(homeWxss, '.section-action');
assertDecl(sectionAction, 'margin-left: auto', 'home section actions must be right aligned');
assertDecl(sectionAction, 'text-align: right', 'home section actions must align text to the right');

const profileHead = getRule(profileWxss, '.profile-card-head');
assertDecl(profileHead, 'align-items: flex-start', 'profile card controls must align to the card top edge');

const profileMiniButton = getRule(profileWxss, '.mini-btn');
assertDecl(profileMiniButton, 'align-self: flex-start', 'profile edit button must sit at the top-right of the profile card');
assertDecl(profileMiniButton, 'height: 56rpx', 'profile edit button must stay compact');
assertDecl(profileMiniButton, 'display: flex', 'profile edit button text must be vertically centered');

assert.ok(metricDetailWxml.includes('class="pin-action'), 'metric detail follow control must be a readable text action');
assert.ok(metricDetailWxml.includes('已关注'), 'metric detail follow control must expose current state as text');
assert.ok(!metricDetailWxml.includes('★'), 'metric detail follow control must not rely on a tiny star icon');

const pinAction = getRule(metricDetailWxss, '.pin-action');
assertDecl(pinAction, 'min-width: 128rpx', 'metric detail follow action must be easy to tap and read');
assertDecl(pinAction, 'height: 56rpx', 'metric detail follow action must stay compact but legible');

assert.ok(trendChartWxml.includes('wx:for="{{yTicks}}"'), 'trend chart must render y-axis ticks');
assert.ok(trendChartWxml.includes('wx:if="{{refLine}}"'), 'trend chart must render latest reference line');
assert.ok(trendChartJs.includes('最新参考下限'), 'trend chart reference line must explain what it marks');
assert.ok(trendChartJs.includes('formatDateLabel'), 'trend chart x-axis labels must show real report dates');
assert.ok(trendChartJs.includes('pointGap'), 'trend chart points must be evenly spaced rather than true-date mapped');

const axisY = getRule(trendChartWxss, '.axis-y');
assertDecl(axisY, 'left: 72rpx', 'trend chart y-axis must reserve label space');

const refLine = getRule(trendChartWxss, '.ref-line');
assertDecl(refLine, 'border-top: 2rpx dashed var(--primary)', 'trend chart reference line must be visibly distinct');

assert.ok(reportDetailWxss.includes('padding-bottom: calc(168rpx + env(safe-area-inset-bottom))'), 'report detail must reserve space for fixed bottom actions');
for (const [name, source] of [
  ['upload pick', uploadPickWxss],
  ['upload confirm', uploadConfirmWxss],
  ['upload edit', uploadEditWxss],
  ['upload conflict', uploadConflictWxss]
]) {
  assert.ok(source.includes('padding-bottom: 136rpx'), `${name} page must reserve space for fixed bottom action`);
  assert.ok(source.includes('env(safe-area-inset-bottom)'), `${name} bottom action must respect safe area`);
}

for (const device of contract.devices) {
  assert.ok(device.cssWidth >= 360 && device.cssWidth <= 430, `unsupported device width: ${device.name}`);
  assert.ok(device.cssHeight >= 760, `device height too small for baseline: ${device.name}`);
}

console.log(`Visual contract passed: ${contract.devices.length} device baselines, ${contract.rules.length} layout rules`);
