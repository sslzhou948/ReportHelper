const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const miniprogramRoot = path.join(root, 'miniprogram');

function walkFiles(dir, predicate, output = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(fullPath, predicate, output);
    else if (predicate(fullPath)) output.push(fullPath);
  }
  return output;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const app = readJson(path.join(miniprogramRoot, 'app.json'));
for (const page of app.pages) {
  for (const ext of ['.js', '.json', '.wxml', '.wxss']) {
    const file = path.join(miniprogramRoot, `${page}${ext}`);
    assert.ok(fs.existsSync(file), `missing page file: ${path.relative(root, file)}`);
  }
}

const jsonFiles = walkFiles(miniprogramRoot, (file) => file.endsWith('.json'));
for (const file of jsonFiles) {
  const json = readJson(file);
  const components = json.usingComponents || {};
  for (const [name, componentPath] of Object.entries(components)) {
    const normalized = componentPath.startsWith('/') ? componentPath.slice(1) : componentPath;
    const componentRoot = path.join(miniprogramRoot, normalized);
    assert.ok(fs.existsSync(`${componentRoot}.json`), `component ${name} missing json at ${componentPath}`);
    assert.ok(fs.existsSync(`${componentRoot}.wxml`), `component ${name} missing wxml at ${componentPath}`);
  }
}

const wxmlFiles = walkFiles(miniprogramRoot, (file) => file.endsWith('.wxml'));
for (const file of wxmlFiles) {
  const source = fs.readFileSync(file, 'utf8');
  assert.ok(!source.includes('.indexOf('), `avoid method calls in WXML: ${path.relative(root, file)}`);
  const bindings = [...source.matchAll(/{{([^}]*)}}/g)].map((match) => match[1]);
  assert.ok(!bindings.some((binding) => /\s\/\s/.test(binding)), `avoid arithmetic in WXML: ${path.relative(root, file)}`);

  const tokens = [...source.matchAll(/<\/?button\b[^>]*>/g)];
  assert.strictEqual(tokens.length, 0, `native button tags are not allowed in visual baseline: ${path.relative(root, file)}`);
  let depth = 0;
  for (const token of tokens) {
    const text = token[0];
    if (text.startsWith('</')) depth -= 1;
    else {
      assert.strictEqual(depth, 0, `nested button found in ${path.relative(root, file)}`);
      depth += 1;
    }
  }
}

const homeWxml = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'home', 'index.wxml'), 'utf8');
const uploadPickJs = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'upload', 'pick.js'), 'utf8');
const uploadConfirmJs = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'upload', 'confirm.js'), 'utf8');
const uploadEditDetailJs = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'upload', 'edit-detail.js'), 'utf8');
const profileOnboardJs = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'profile', 'onboard.js'), 'utf8');
const profileIndexJs = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'profile', 'index.js'), 'utf8');
const profileExportJs = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'profile', 'export.js'), 'utf8');
const profileExportWxml = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'profile', 'export.wxml'), 'utf8');
const profileAddJs = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'profile', 'add.js'), 'utf8');
const profileArchiveJs = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'profile', 'archive.js'), 'utf8');
const reportDetailJs = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'health', 'report-detail.js'), 'utf8');
const metricDetailJs = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'health', 'metric-detail.js'), 'utf8');
const metricDetailWxml = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'health', 'metric-detail.wxml'), 'utf8');
const pinnedManageJs = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'health', 'pinned-manage.js'), 'utf8');
const apiMockJs = fs.readFileSync(path.join(miniprogramRoot, 'utils', 'api-mock.js'), 'utf8');
assert.ok(uploadPickJs.includes("UPLOAD_DRAFT_KEY = 'uploadDraft'"), 'upload pick must persist unfinished upload drafts');
assert.ok(uploadPickJs.includes('wx.chooseMedia') || uploadPickJs.includes('wx.chooseImage'), 'upload pick must use native image selection APIs');
assert.ok(uploadPickJs.includes('persistUploadDraft(photos)'), 'upload pick must keep selected photos recoverable after task creation failures');
assert.ok(uploadPickJs.includes('wx.showModal'), 'upload pick must confirm leaving with an unfinished draft');
assert.ok(uploadPickJs.includes('splitGroup(event)'), 'upload pick must allow cancelling an existing photo merge');
assert.ok(!homeWxml.includes('\u6b63\u5728\u8bc6\u522b 3 \u5f20\u62a5\u544a'), 'home OCR notice must not hardcode report counts');
assert.ok(fs.readFileSync(path.join(miniprogramRoot, 'pages', 'home', 'index.js'), 'utf8').includes('api.listOcrTasks'), 'home must refresh pending OCR state from API');
const nativeHomeLayoutClasses = [
  'ocr-card',
  'upload-cta',
  'recheck-card',
  'metric-card',
  'alert-card'
];
for (const className of nativeHomeLayoutClasses) {
  assert.ok(!new RegExp(`<button[^>]*class="[^"]*${className}`).test(homeWxml), `home ${className} must not use native button layout`);
}
assert.ok(!homeWxml.includes('\u6700\u8fd1 3 \u9879\u6307\u6807\u504f\u79bb\u6b63\u5e38'), 'home alert must not ship hardcoded abnormal metric copy');
assert.ok(!homeWxml.includes('\u767d\u7ec6\u80de\u3001CEA'), 'home alert metrics must come from data, not hardcoded text');
assert.ok(uploadPickJs.includes('const initialPhotos = [];'), 'upload pick must start empty; keep upload fixtures in tests only');
assert.ok(!uploadPickJs.includes('{ id: 1, group: 1 }'), 'upload pick must not ship test photo fixtures');
assert.ok(uploadConfirmJs.includes("itemList: ['覆盖旧报告', '跳过重复报告']"), 'duplicate prompt should only expose replace or skip');
assert.ok(!uploadConfirmJs.includes('仍保存为新报告'), 'duplicate prompt must not expose keep-both to normal users');
assert.ok(uploadConfirmJs.includes('cancelTaskAndLeave()'), 'upload confirm cancel must explicitly discard the OCR task');
assert.ok(uploadConfirmJs.includes('api.cancelOcrTask(this.taskId)'), 'upload confirm cancel must call the cancel OCR API');
assert.ok(uploadConfirmJs.includes('retryTask()'), 'upload confirm must expose OCR retry handling');
assert.ok(uploadConfirmJs.includes('api.retryOcrTask(this.taskId'), 'upload confirm retry must call the retry OCR API');
assert.ok(uploadConfirmJs.includes('profileId: this.data.profileId'), 'upload confirm save must keep reports scoped to the OCR task profile');
assert.ok(uploadConfirmJs.includes('profileNoticeText'), 'upload confirm must explain when the OCR task belongs to another profile');
assert.ok(uploadConfirmJs.includes('goManualFill'), 'upload confirm must offer manual fill for empty or non-report OCR drafts');
assert.ok(uploadConfirmJs.includes('needsManualInput'), 'upload confirm must block unresolved empty OCR drafts before saving');
assert.ok(uploadConfirmJs.includes('isRecognizingTaskStatus(task.status)'), 'upload confirm must keep polling while OCR tasks are queued or processing');
assert.ok(uploadConfirmJs.includes('scheduleRecognitionPoll()'), 'upload confirm must schedule OCR status polling');
assert.ok(uploadConfirmJs.includes('clearRecognitionTimer()'), 'upload confirm must clear OCR polling timers on exit');
assert.ok(uploadConfirmJs.includes('shouldShowRecognitionSlow'), 'upload confirm must show a slow-recognition state before the user can save');
assert.ok(uploadConfirmJs.includes('if (this.data.recognizing)'), 'upload confirm must block saving while OCR is still running');
assert.ok(uploadEditDetailJs.includes('api.getOcrTask(this.taskId)'), 'upload edit detail must load the selected OCR draft');
assert.ok(uploadEditDetailJs.includes('addManualMetric()'), 'upload edit detail must allow manual metric entry');
assert.ok(uploadEditDetailJs.includes('addFinding()'), 'upload edit detail must allow manual imaging finding entry');
assert.ok(!uploadEditDetailJs.includes("value: '32'"), 'upload edit detail must not ship hardcoded metric fixtures');
assert.ok(!reportDetailJs.includes('api.updateReport(this.reportId'), 'report detail edit entry must not auto-save report data');
assert.ok(!reportDetailJs.includes('已保存编辑'), 'report detail edit entry must not show a saved toast before real edits');
assert.ok(!apiMockJs.includes('photoCount: 4'), 'OCR mock fallback must not fabricate four photos');
assert.ok(metricDetailJs.includes('hasTrendChart') && metricDetailWxml.includes('!hasTrendChart'), 'metric detail must not draw trend charts for qualitative or single-record metrics');
assert.ok(metricDetailJs.includes("return '\\u53c2\\u8003 --'") || metricDetailJs.includes("return '参考 --'"), 'metric detail must show missing reference ranges as --');
assert.ok(metricDetailJs.includes('pinSaving'), 'metric detail must debounce follow/unfollow saves');
assert.ok(pinnedManageJs.includes('savingKeys'), 'pinned manage must debounce per-metric follow saves');
assert.ok(metricDetailJs.includes('showApiErrorToast') && pinnedManageJs.includes('showApiErrorToast'), 'pinned metric pages must surface API errors consistently');
assert.ok(!apiMockJs.includes('reportCount: 3'), 'OCR mock fallback must not fabricate three reports');
assert.ok(profileExportJs.includes('api.createExport'), 'profile export page must create a real export task');
assert.ok(!profileExportWxml.includes('暂不创建导出任务'), 'profile export page must not present export as disabled');

assert.ok(profileOnboardJs.includes('requestWxLoginCode()'), 'onboard login must use the native wx.login result');
assert.ok(!profileOnboardJs.includes('mock_code'), 'onboard login must not continue with a mock code after wx.login failure');
assert.ok(fs.readFileSync(path.join(miniprogramRoot, 'pages', 'home', 'index.js'), 'utf8').includes('isProfileRequiredError(error)'), 'home must treat empty profile as a create-profile transition');
assert.ok(fs.readFileSync(path.join(miniprogramRoot, 'pages', 'health', 'index.js'), 'utf8').includes('isProfileRequiredError(error)'), 'health must treat empty profile as a create-profile transition');
assert.ok(fs.readFileSync(path.join(miniprogramRoot, 'pages', 'recheck', 'index.js'), 'utf8').includes('isProfileRequiredError(error)'), 'recheck must treat empty profile as a create-profile transition');
assert.ok(profileIndexJs.includes('isProfileRequiredError(error)'), 'profile must treat empty profile as a create-profile transition');

const healthWxml = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'health', 'index.wxml'), 'utf8');
const metricRowWxml = fs.readFileSync(path.join(miniprogramRoot, 'components', 'metric-row', 'metric-row.wxml'), 'utf8');
const nativeHealthLayoutClasses = [
  'search',
  'chip'
];
for (const className of nativeHealthLayoutClasses) {
  assert.ok(!new RegExp(`<button[^>]*class="[^"]*${className}`).test(healthWxml), `health ${className} must not use native button layout`);
}
assert.ok(!healthWxml.includes('<button wx:for="{{item.items}}"'), 'health report rows must not use native button layout');
assert.ok(!metricRowWxml.includes('<button class="metric-row"'), 'metric row component must not use native button layout');

const recheckWxml = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'recheck', 'index.wxml'), 'utf8');
const recheckJs = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'recheck', 'index.js'), 'utf8');
const recheckNewJs = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'recheck', 'new.js'), 'utf8');
const recheckDetailJs = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'recheck', 'detail.js'), 'utf8');
assert.ok(!recheckWxml.includes('<button wx:for="{{nextPlan.todos}}"'), 'recheck todo rows must not use native button layout');
assert.ok(!recheckWxml.includes('<button wx:for="{{otherPlans}}"'), 'recheck plan rows must not use native button layout');
assert.ok(!recheckWxml.includes('<button class="row add-row"'), 'recheck add row must not use native button layout');
assert.ok(recheckWxml.includes('bindtap="goNextDetail"') && recheckJs.includes('goNextDetail()'), 'next recheck plan must expose detail/cancel entry');
assert.ok(recheckNewJs.includes('wx.requestSubscribeMessage'), 'new recheck plan should request subscription messages when a template id is configured');
assert.ok(recheckNewJs.includes('subscribeAccepted: subscribe.subscribeAccepted'), 'new recheck plan must persist subscription rejection without blocking save');
assert.ok(recheckNewJs.includes('defaultRecheckDate()'), 'new recheck plan default date must stay valid over time');
assert.ok(!recheckNewJs.includes("date: '2026-06-01'"), 'new recheck plan must not ship a stale fixed default date');
assert.ok(recheckDetailJs.includes("value < todayString()"), 'recheck detail must block editing the plan date into the past');
assert.ok(recheckNewJs.includes('showApiErrorFeedback'), 'new recheck plan must show backend validation field errors');
assert.ok(recheckDetailJs.includes('showApiErrorFeedback'), 'recheck detail must show backend validation field errors');

const profileWxml = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'profile', 'index.wxml'), 'utf8');
const profileArchiveWxml = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'profile', 'archive.wxml'), 'utf8');
assert.ok(!profileWxml.includes('<button class="row"'), 'profile menu rows must not use native button layout');
assert.ok(!profileWxml.includes('<button class="row danger"'), 'profile danger rows must not use native button layout');
assert.ok(!profileWxml.includes('<button class="btn secondary logout"'), 'profile logout control must not use native button layout');
assert.ok(!profileArchiveWxml.includes('他莫昔芬'), 'profile archive must not show hardcoded medication records');
assert.ok(profileAddJs.includes('showApiErrorFeedback'), 'profile add must show backend validation field errors');
assert.ok(profileArchiveJs.includes('showApiErrorFeedback'), 'profile archive must show backend validation field errors');

const mainTabPages = [
  ['home', 'pages/home/index'],
  ['health', 'pages/health/index'],
  ['recheck', 'pages/recheck/index'],
  ['profile', 'pages/profile/index']
];
for (const [name, pagePath] of mainTabPages) {
  const js = fs.readFileSync(path.join(miniprogramRoot, `${pagePath}.js`), 'utf8');
  const wxml = fs.readFileSync(path.join(miniprogramRoot, `${pagePath}.wxml`), 'utf8');
  const json = fs.readFileSync(path.join(miniprogramRoot, `${pagePath}.json`), 'utf8');
  assert.ok(js.includes('bindNetworkStatus(this)'), `${name} tab must subscribe to network status`);
  assert.ok(js.includes('retryAfterNetwork()'), `${name} tab must expose network retry`);
  assert.ok(wxml.includes('<network-banner'), `${name} tab must show the offline network banner`);
  assert.ok(json.includes('/components/network-banner/network-banner'), `${name} tab must register the network banner component`);
}

console.log(`Static checks passed: ${app.pages.length} pages, ${wxmlFiles.length} WXML files`);
