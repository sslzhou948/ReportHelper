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
const recheckWxss = read('miniprogram/pages/recheck/index.wxss');
const recheckWxml = read('miniprogram/pages/recheck/index.wxml');
const profileWxss = read('miniprogram/pages/profile/index.wxss');
const profileWxml = read('miniprogram/pages/profile/index.wxml');
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

function assertPageBottomPadding(source, name, minRpx = 192) {
  const match = source.match(/padding-bottom:\s*calc\((\d+)rpx \+ env\(safe-area-inset-bottom\)\)/);
  assert.ok(match && Number(match[1]) >= minRpx, `${name} page must reserve more than the fixed bottom action height`);
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
assert.ok(homeWxss.includes('min-height: 128rpx'), 'home action cards must keep the approved compact refreshed height');
assert.ok(homeWxss.includes('.metric-sparkline'), 'home metric cards must include dynamic compact trend visuals');
assert.ok(!homeWxml.includes('<button class="upload-cta"'), 'home upload CTA must avoid native button layout');
assert.ok(!homeWxml.includes('<button class="card card-pad recheck-card"'), 'home recheck card must avoid native button layout');

for (const file of wxmlFiles) {
  assert.ok(!read(file).includes('<button'), `visual baseline must not use native button layout: ${file}`);
}

const homeUpload = getRule(homeWxss, '.upload-cta');
assertDecl(homeUpload, 'width: 100%', 'home upload card must fill content width');
assertDecl(homeUpload, 'min-height: 128rpx', 'home upload card must stay at the approved compact action height');
assertDecl(homeUpload, 'text-align: left', 'home upload content must be left aligned');

const homeRecheck = getRule(homeWxss, '.recheck-card');
assertDecl(homeRecheck, 'width: 100%', 'home recheck card must fill content width');
assertDecl(homeRecheck, 'min-height: 128rpx', 'home recheck card must match the upload action height');

const metricCard = getRule(homeWxss, '.metric-card');
assertDecl(metricCard, 'width: 227rpx', 'home metric card width must match refreshed reference');
assertDecl(metricCard, 'white-space: normal', 'home metric card text must wrap inside the fixed card');

const metricSparkline = getRule(homeWxss, '.metric-sparkline');
assertDecl(metricSparkline, 'width: 186rpx', 'home sparkline must keep a fixed drawing slot');
assertDecl(metricSparkline, 'height: 44rpx', 'home sparkline must keep a fixed drawing slot height');
assertDecl(metricSparkline, 'overflow: hidden', 'home sparkline must not escape the metric card');

const reportRow = getRule(homeWxss, '.report-row');
assertDecl(reportRow, 'display: flex', 'home report row must keep icon, text, status, and arrow aligned');
assertDecl(reportRow, 'align-items: center', 'home report row content must stay vertically centered');

const reportMain = getRule(homeWxss, '.report-main');
assertDecl(reportMain, 'flex: 1', 'home report main text must take remaining row width');
assertDecl(reportMain, 'min-width: 0', 'home report main text must be allowed to shrink horizontally');

assert.ok(!homeWxss.includes('.ocr-status-entry'), 'home OCR status must not use a cramped banner chip');
const ocrCard = getRule(homeWxss, '.ocr-card');
assertDecl(ocrCard, 'width: 100%', 'home OCR status card must use the available content width');
assertDecl(ocrCard, 'display: flex', 'home OCR status card must keep icon, text, and action aligned');

assert.ok(recheckWxml.includes('/assets/ui-refresh/recheck-calendar-large.png'), 'recheck next plan must use the refreshed calendar asset');
assert.ok(recheckWxml.includes('/assets/ui-refresh/recheck-add-circle.png'), 'recheck add-todo row must use the refreshed add asset');
assert.ok(recheckWxml.includes('class="plan-actions"'), 'recheck next plan must expose the two-action footer');
assert.ok(!recheckWxml.includes('recheck-new-action'), 'recheck top bar must not place actions near the WeChat capsule');
assert.ok(recheckWxml.includes('class="btn secondary" bindtap="goNew"'), 'recheck next card must keep add-plan as the secondary action');
assert.ok(!recheckWxml.includes('add-plan-link'), 'recheck future-plan header must not carry an extra add-plan chip');

const recheckHero = getRule(recheckWxss, '.recheck-hero');
assertDecl(recheckHero, 'padding: calc(var(--safe-top) - 98rpx) 36rpx 0', 'recheck hero must respect capsule-safe top spacing');

const nextCard = getRule(recheckWxss, '.next-card');
assertDecl(nextCard, 'padding: 28rpx 28rpx 20rpx', 'recheck next card must keep compact reference inner spacing');

const todoRow = getRule(recheckWxss, '.todo-row');
assertDecl(todoRow, 'min-height: 106rpx', 'recheck todo rows must keep a stable visual rhythm');
assertDecl(todoRow, 'align-items: center', 'recheck todo rows must vertically center checkbox, label, and status');

const todoSwipe = getRule(recheckWxss, '.todo-swipe');
assert.ok(!todoSwipe.includes('border-bottom'), 'recheck todo dividers must not be duplicated on the swipe wrapper');

const todoSwipeContent = getRule(recheckWxss, '.todo-swipe-content');
assertDecl(todoSwipeContent, 'border-bottom: 1rpx solid #EEE8E0', 'recheck todo rows must keep one visible soft divider');
assert.ok(!recheckWxss.includes('.todo-row::after'), 'recheck todo dividers must not use pseudo-lines that can visually double');

const futureRow = getRule(recheckWxss, '.future-row');
assertDecl(futureRow, 'min-height: 120rpx', 'recheck future plan rows must align with refreshed list row height');

const dateBlock = getRule(recheckWxss, '.date-block');
assertDecl(dateBlock, 'background: #F0EEEB', 'recheck future date block must match health time-view gray date style');
assertDecl(dateBlock, 'color: #2D2925', 'recheck future date text must use the health time-view date color');

const recheckPlanActions = getRule(recheckWxss, '.plan-actions');
assertDecl(recheckPlanActions, 'grid-template-columns: 1fr 1fr', 'recheck next card must keep two equal action buttons');

const sectionAction = getRule(homeWxss, '.section-action');
assertDecl(sectionAction, 'margin-left: auto', 'home section actions must be right aligned');
assertDecl(sectionAction, 'text-align: right', 'home section actions must align text to the right');

assert.ok(profileWxml.includes('class="page page-tab profile-ref-page"'), 'profile page must use the refreshed page shell');
assert.ok(profileWxml.includes('class="profile-hero"'), 'profile page must use the green refreshed hero');
assert.ok(profileWxml.includes('/assets/ui-refresh/profile-avatar-line.png'), 'profile card must use the refreshed profile avatar asset');
assert.ok(profileWxml.includes('/assets/ui-refresh/profile-folder.png'), 'profile menu must use refreshed line icons');
assert.ok(profileWxml.includes('/assets/ui-refresh/profile-logout.png'), 'profile logout must use the refreshed logout asset');
assert.ok(!profileWxml.includes('<view class="nav">'), 'profile page must not use the legacy white sticky nav');

const profileHero = getRule(profileWxss, '.profile-hero');
assertDecl(profileHero, 'height: 250rpx', 'profile hero must match the refreshed compact green header height');
assertDecl(profileHero, 'padding: calc(var(--safe-top) - 98rpx) 36rpx 0', 'profile hero must respect capsule-safe top spacing');

const profileShell = getRule(profileWxss, '.profile-shell');
assertDecl(profileShell, 'margin-top: -56rpx', 'profile warm content shell must overlap the green header');
assertDecl(profileShell, 'border-top-left-radius: 58rpx', 'profile content shell must keep the large rounded top edge');

const profileHead = getRule(profileWxss, '.profile-card-head');
assertDecl(profileHead, 'align-items: flex-start', 'profile card controls must align to the card top edge');
assertDecl(profileHead, 'gap: 30rpx', 'profile card must keep the reference avatar/text spacing');

const profileEdit = getRule(profileWxss, '.profile-edit');
assertDecl(profileEdit, 'align-self: flex-start', 'profile edit action must sit at the top-right of the profile card');
assertDecl(profileEdit, 'height: 60rpx', 'profile edit action must stay compact');
assertDecl(profileEdit, 'display: flex', 'profile edit action text must be vertically centered');

const profileMenuRow = getRule(profileWxss, '.profile-menu-row');
assertDecl(profileMenuRow, 'min-height: 88rpx', 'profile menu rows must keep a compact stable settings rhythm');
assertDecl(profileMenuRow, 'display: flex', 'profile menu rows must align icon, label, value, and chevron');

const profileSectionTitle = getRule(profileWxss, '.profile-section-title');
assertDecl(profileSectionTitle, 'font-weight: 800', 'profile section titles must align with refreshed page title hierarchy');

const profileMenuLabel = getRule(profileWxss, '.profile-menu-label');
assertDecl(profileMenuLabel, 'font-weight: 400', 'profile menu labels must use normal body weight');

const profileMenuValue = getRule(profileWxss, '.profile-menu-value');
assertDecl(profileMenuValue, 'font-weight: 400', 'profile menu secondary values must use normal body weight');
assertDecl(profileMenuValue, 'text-align: right', 'profile menu secondary values must align to the right');
assertDecl(profileMenuValue, 'text-overflow: ellipsis', 'profile menu secondary values must not break the card');

const profileLogout = getRule(profileWxss, '.profile-logout-card');
assertDecl(profileLogout, 'height: 96rpx', 'profile logout action must align with the refreshed button rhythm');

assert.ok(metricDetailWxml.includes('class="pin-action'), 'metric detail follow control must be a readable text action');
assert.ok(metricDetailWxml.includes('已关注'), 'metric detail follow control must expose current state as text');
assert.ok(!metricDetailWxml.includes('★'), 'metric detail follow control must not rely on a tiny star icon');

const pinAction = getRule(metricDetailWxss, '.pin-action');
assertDecl(pinAction, 'min-width: 128rpx', 'metric detail follow action must be easy to tap and read');
assertDecl(pinAction, 'height: 56rpx', 'metric detail follow action must stay compact but legible');

assert.ok(trendChartWxml.includes('wx:for="{{yTicks}}"'), 'trend chart must render y-axis ticks');
assert.ok(trendChartWxml.includes('wx:for="{{refLines}}"'), 'trend chart must render latest reference limit lines');
assert.ok(trendChartWxml.includes('wx:if="{{refBand}}"'), 'trend chart must render a range band when both reference limits are available');
assert.ok(trendChartJs.includes('latestRefLow') && trendChartJs.includes('latestRefHigh'), 'trend chart reference lines must use the latest numeric limits');
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
  assertPageBottomPadding(source, name);
  assert.ok(source.includes('env(safe-area-inset-bottom)'), `${name} bottom action must respect safe area`);
}

for (const device of contract.devices) {
  assert.ok(device.cssWidth >= 360 && device.cssWidth <= 430, `unsupported device width: ${device.name}`);
  assert.ok(device.cssHeight >= 760, `device height too small for baseline: ${device.name}`);
}

console.log(`Visual contract passed: ${contract.devices.length} device baselines, ${contract.rules.length} layout rules`);
