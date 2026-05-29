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
const homeIndexJs = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'home', 'index.js'), 'utf8');
const homeWxss = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'home', 'index.wxss'), 'utf8');
const recordNewJs = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'record', 'new.js'), 'utf8');
const manualEntryJs = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'record', 'manual-entry.js'), 'utf8');
const healthIndexJs = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'health', 'index.js'), 'utf8');
const healthSearchJs = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'health', 'search.js'), 'utf8');
const uploadPickJs = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'upload', 'pick.js'), 'utf8');
const uploadConfirmJs = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'upload', 'confirm.js'), 'utf8');
const uploadEditDetailJs = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'upload', 'edit-detail.js'), 'utf8');
const uploadEditDetailWxml = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'upload', 'edit-detail.wxml'), 'utf8');
const uploadEditDetailWxss = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'upload', 'edit-detail.wxss'), 'utf8');
const uploadConflictJs = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'upload', 'conflict.js'), 'utf8');
const profileOnboardJs = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'profile', 'onboard.js'), 'utf8');
const profileOnboardWxml = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'profile', 'onboard.wxml'), 'utf8');
const profileOnboardWxss = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'profile', 'onboard.wxss'), 'utf8');
const profileAgreementWxml = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'profile', 'agreement.wxml'), 'utf8');
const profilePrivacyWxml = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'profile', 'privacy.wxml'), 'utf8');
const profileIndexWxml = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'profile', 'index.wxml'), 'utf8');
const profileIndexJs = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'profile', 'index.js'), 'utf8');
const profileCustomMetricsJs = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'profile', 'custom-metrics.js'), 'utf8');
const profileCustomMetricsWxml = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'profile', 'custom-metrics.wxml'), 'utf8');
const profileExportJs = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'profile', 'export.js'), 'utf8');
const profileExportWxml = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'profile', 'export.wxml'), 'utf8');
const profileReportsArchiveJs = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'profile', 'reports-archive.js'), 'utf8');
const profileAddJs = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'profile', 'add.js'), 'utf8');
const profileArchiveJs = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'profile', 'archive.js'), 'utf8');
const reportDetailJs = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'health', 'report-detail.js'), 'utf8');
const reportDetailWxml = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'health', 'report-detail.wxml'), 'utf8');
const manualEntryWxml = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'record', 'manual-entry.wxml'), 'utf8');
const metricDetailJs = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'health', 'metric-detail.js'), 'utf8');
const metricDetailWxml = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'health', 'metric-detail.wxml'), 'utf8');
const pinnedManageJs = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'health', 'pinned-manage.js'), 'utf8');
const apiJs = fs.readFileSync(path.join(miniprogramRoot, 'utils', 'api.js'), 'utf8');
const apiMockJs = fs.readFileSync(path.join(miniprogramRoot, 'utils', 'api-mock.js'), 'utf8');
const backendOcrRouteTs = fs.readFileSync(path.join(root, 'backend', 'src', 'routes', 'ocr.ts'), 'utf8');
const backendOcrProviderTs = fs.readFileSync(path.join(root, 'backend', 'src', 'services', 'ocr-provider.ts'), 'utf8');
const backendUploadRouteTs = fs.readFileSync(path.join(root, 'backend', 'src', 'routes', 'uploads.ts'), 'utf8');
const backendUploadStorageTs = fs.readFileSync(path.join(root, 'backend', 'src', 'services', 'upload-storage.ts'), 'utf8');
assert.ok(uploadPickJs.includes("UPLOAD_DRAFT_KEY = 'uploadDraft'"), 'upload pick must persist unfinished upload drafts');
assert.ok(uploadPickJs.includes('wx.chooseMedia') || uploadPickJs.includes('wx.chooseImage'), 'upload pick must use native image selection APIs');
assert.ok(uploadPickJs.includes('persistUploadDraft(photos)'), 'upload pick must keep selected photos recoverable after task creation failures');
assert.ok(uploadPickJs.includes('wx.showModal'), 'upload pick must confirm leaving with an unfinished draft');
assert.ok(uploadPickJs.includes('splitGroup(event)'), 'upload pick must allow cancelling an existing photo merge');
assert.ok(!homeWxml.includes('\u6b63\u5728\u8bc6\u522b 3 \u5f20\u62a5\u544a'), 'home OCR notice must not hardcode report counts');
assert.ok(homeIndexJs.includes('api.listOcrTasks'), 'home must refresh pending OCR state from API');
assert.ok(homeIndexJs.includes('formatPendingOcrSummary'), 'home must summarize multiple pending OCR tasks');
assert.ok(homeIndexJs.includes('taskPriority'), 'home must prioritize ready or failed OCR tasks when several are pending');
assert.ok(homeIndexJs.includes('taskCount: activeTasks.length'), 'home pending OCR summary must keep the task count');
assert.ok(homeIndexJs.includes('statusLabel'), 'home OCR task summary must provide a concise status label');
assert.ok(homeWxml.includes('wx:if="{{pendingOcrTask}}" class="ocr-status-entry'), 'home OCR status entry should only appear when there is an active OCR task');
assert.ok(homeWxml.includes('{{pendingOcrTask.statusLabel}}'), 'home OCR status entry must show the task count or state');
assert.ok(!homeWxml.includes('···') && !homeWxss.includes('.bell'), 'home OCR status entry must not ship as an ambiguous dot or bell affordance');
assert.ok(app.pages.includes('pages/record/new') && app.pages.includes('pages/record/manual-entry'), 'unified record entry and manual entry pages must be registered');
assert.ok(app.pages.includes('pages/profile/custom-metrics'), 'custom metric library page must be registered');
assert.ok(homeWxml.includes('拍照识别 / 手动录入') && homeIndexJs.includes('/pages/record/new'), 'home primary CTA must open unified record entry');
assert.ok(!homeWxml.includes('新增{{profile.relation}}') && !homeWxml.includes('{{profile.relation}}距下次复查'), 'home primary cards must not repeat the archive relation in action copy');
assert.ok(homeIndexJs.includes('reportDisplayType(report)') && homeWxml.includes('{{item.displayType}}'), 'home recent reports must display manual metric names instead of only custom categories');
assert.ok(homeIndexJs.includes('label.length > 4') && homeIndexJs.includes('label.slice(0, 3)'), 'home recent report labels must be capped at four visible characters including ellipsis');
assert.ok(recordNewJs.includes('/pages/upload/pick') && recordNewJs.includes('/pages/profile/custom-metrics?mode=select'), 'record entry must split only into photo recognition and manual entry');
assert.ok(profileIndexJs.includes('/pages/profile/custom-metrics?mode=manage') && profileIndexWxml.includes('维护手动录入模板') && !profileIndexWxml.includes('我的检查项目'), 'profile page must name the custom metric area by its manual-entry function');
assert.ok(profileCustomMetricsJs.includes("const mode = query.mode === 'select' ? 'select' : 'manage'") && profileCustomMetricsJs.includes('isSelectMode'), 'custom metric page must be reusable for select and manage modes');
assert.ok(profileCustomMetricsJs.includes("'text'") && profileCustomMetricsJs.includes('CATEGORY_OPTIONS') && profileCustomMetricsWxml.includes('检查类型') && profileCustomMetricsWxml.includes('参考范围'), 'manual template management must capture exam type, result type, and reference values');
assert.ok(profileCustomMetricsJs.includes("{ key: 'lab', label: '检验（血液、尿液等）' }") && profileCustomMetricsJs.includes("{ key: 'exam', label: '检查（CT、核磁、B超等）' }") && profileCustomMetricsJs.includes("{ key: 'electrophysiology', label: '电生理（心电图等）' }"), 'manual template exam types must use the agreed top-level medical categories with explanations');
assert.ok(profileCustomMetricsJs.includes('DEFAULT_CATEGORY_INDEX = 0') && profileCustomMetricsJs.includes('DEFAULT_CATEGORY.label'), 'new manual templates must default the exam type picker to lab test');
assert.ok(profileCustomMetricsJs.includes('LAB_VALUE_TYPE_LABELS') && profileCustomMetricsWxml.includes("form.category === 'lab'") && profileCustomMetricsWxml.includes("form.category !== 'lab'"), 'manual template fields must switch between lab metric fields and text-only exam fields');
assert.ok(profileCustomMetricsJs.includes("'exam', 'electrophysiology', 'pathology', 'other'") && profileCustomMetricsJs.includes('sanitizeFormByCategory'), 'non-lab manual templates must be normalized to text-only records before saving');
assert.ok(manualEntryJs.includes('api.createManualReport'), 'manual entry must persist through the manual report API');
assert.ok(manualEntryJs.includes("mappingStatus: 'confirmed'"), 'manual custom metrics must be followable in the user profile without waiting for public mapping review');
assert.ok(manualEntryWxml.includes('自定义模板') && manualEntryWxml.includes('textarea') && manualEntryJs.includes("template.valueType === 'text'"), 'manual entry must label custom templates and support text-only exam results');
assert.ok(reportDetailJs.includes("dataset.valueType === 'text'") && reportDetailWxml.includes("item.valueType !== 'text'"), 'text-only manual reports must not route users into metric trend analysis');
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
assert.ok(uploadPickJs.includes('showApiErrorToast(error'), 'upload pick must surface normalized API errors for upload and fixture failures');
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
assert.ok(uploadConfirmJs.includes('showApiErrorToast(error'), 'upload confirm must surface normalized API errors');
assert.ok(uploadEditDetailJs.includes('api.getOcrTask(this.taskId)'), 'upload edit detail must load the selected OCR draft');
assert.ok(uploadEditDetailJs.includes("showApiErrorToast(error, '加载报告详情失败')"), 'upload edit detail must surface API errors when detail loading fails');
assert.ok(uploadEditDetailJs.includes('addManualMetric()'), 'upload edit detail must allow manual metric entry');
assert.ok(uploadEditDetailJs.includes('addFinding()'), 'upload edit detail must allow manual imaging finding entry');
assert.ok(uploadEditDetailJs.includes('isImagingInfo(info)') && uploadEditDetailJs.includes('isImagingReport'), 'upload edit detail must gate imaging findings by normalized report modality');
assert.ok(uploadEditDetailJs.includes('deleteMetric(event)') && uploadEditDetailJs.includes('deleteFinding(event)'), 'upload edit detail must allow removing individual metrics and findings before saving');
assert.ok(uploadEditDetailWxml.includes('wx:if="{{isImagingReport}}" class="btn secondary" bindtap="addFinding"'), 'upload edit detail must only expose add finding for imaging reports');
assert.ok(uploadEditDetailWxml.includes('catchtap="deleteMetric"') && uploadEditDetailWxml.includes('catchtap="deleteFinding"'), 'upload edit detail delete controls must not trigger parent field editing');
assert.ok(uploadEditDetailWxss.includes('.delete-x'), 'upload edit detail must style row-level delete controls');
assert.ok(uploadEditDetailWxml.includes('data-field="unit"') && uploadEditDetailWxml.includes('class="mini-input unit-input"'), 'upload edit detail must allow unit editing for OCR and manual metrics');
assert.ok(!uploadEditDetailJs.includes("value: '32'"), 'upload edit detail must not ship hardcoded metric fixtures');
assert.ok(uploadConflictJs.includes('showApiErrorToast(error'), 'upload conflict page must surface normalized API errors');
assert.ok(!reportDetailJs.includes('api.updateReport(this.reportId'), 'report detail edit entry must not auto-save report data');
assert.ok(!reportDetailJs.includes('已保存编辑'), 'report detail edit entry must not show a saved toast before real edits');
assert.ok(reportDetailJs.includes('showReportGone'), 'report detail must handle deleted or missing reports');
assert.ok(reportDetailJs.includes('isNotFoundError(error)'), 'report detail must treat NOT_FOUND as a stale page');
assert.ok(!apiMockJs.includes('photoCount: 4'), 'OCR mock fallback must not fabricate four photos');
assert.ok(metricDetailJs.includes('hasTrendChart') && metricDetailWxml.includes('!hasTrendChart'), 'metric detail must not draw trend charts for qualitative or single-record metrics');
assert.ok(metricDetailJs.includes("return '\\u53c2\\u8003 --'") || metricDetailJs.includes("return '参考 --'"), 'metric detail must show missing reference ranges as --');
assert.ok(metricDetailJs.includes('pinSaving'), 'metric detail must debounce follow/unfollow saves');
assert.ok(pinnedManageJs.includes('savingKeys'), 'pinned manage must debounce per-metric follow saves');
assert.ok(metricDetailJs.includes('showApiErrorToast') && pinnedManageJs.includes('showApiErrorToast'), 'pinned metric pages must surface API errors consistently');
assert.ok(!apiMockJs.includes('reportCount: 3'), 'OCR mock fallback must not fabricate three reports');
assert.ok(profileExportJs.includes('api.createExport'), 'profile export page must create a real export task');
assert.ok(!profileExportWxml.includes('暂不创建导出任务'), 'profile export page must not present export as disabled');
assert.ok(apiJs.includes('new Proxy') && apiJs.includes('getRuntimeApi()'), 'runtime API facade must allow DevTools mode switching');
assert.ok(backendOcrRouteTs.includes('createOcrProvider()'), 'backend OCR route must use the OCR provider boundary');
assert.ok(!backendOcrRouteTs.includes('getRealcaseOcrDrafts'), 'backend OCR route must not depend directly on fixture OCR data');
assert.ok(backendOcrProviderTs.includes('recognizeFixture'), 'backend OCR provider must expose fixture recognition for downstream smoke tests');
assert.ok(backendUploadRouteTs.includes('createUploadStorageProvider()'), 'backend upload route must use the storage provider boundary');
assert.ok(!backendUploadRouteTs.includes('local-upload://'), 'backend upload route must not hardcode local storage URLs');
assert.ok(backendUploadStorageTs.includes('signUpload'), 'backend upload storage provider must expose upload signing');

assert.ok(profileOnboardJs.includes('requestWxLoginCode()'), 'onboard login must use the native wx.login result');
assert.ok(!profileOnboardJs.includes('mock_code'), 'onboard login must not continue with a mock code after wx.login failure');
assert.ok(app.pages.includes('pages/profile/agreement'), 'onboard agreement page must be registered');
assert.ok(app.pages.includes('pages/profile/privacy'), 'onboard privacy page must be registered');
assert.ok(profileOnboardJs.includes('openAgreement()') && profileOnboardJs.includes('/pages/profile/agreement'), 'onboard must expose a user agreement entry');
assert.ok(profileOnboardJs.includes('openPrivacy()') && profileOnboardJs.includes('/pages/profile/privacy'), 'onboard must expose a privacy policy entry');
assert.ok(profileOnboardJs.includes('selectRelation(event)') && profileOnboardJs.includes('continueCreate()'), 'onboard must separate relation selection from login continuation');
assert.ok(profileOnboardJs.includes('selectionState(relation, agreed)'), 'onboard selected and disabled states must be precomputed in page JS');
assert.ok(profileOnboardJs.includes('api.getProfiles()'), 'onboard login must check existing profiles before forcing first-profile creation');
assert.ok(profileOnboardJs.includes("wx.switchTab({ url: '/pages/home/index' })"), 'onboard must let returning users log in without choosing a new archive type');
assert.ok(profileOnboardWxml.includes('微信登录并继续'), 'onboard must show an explicit WeChat login continuation CTA');
assert.ok(profileOnboardWxml.includes('创建第一份档案') && profileOnboardWxml.includes('为我自己') && profileOnboardWxml.includes('为我的亲属'), 'onboard must clearly frame first archive creation and relation choice');
assert.ok(profileOnboardWxml.includes('catchtap="openAgreement"') && profileOnboardWxml.includes('catchtap="openPrivacy"'), 'onboard agreement and privacy text must be tappable without toggling the checkbox');
assert.ok(profileOnboardWxml.includes('agreement-row') && profileOnboardWxml.includes('checkbox'), 'onboard agreement must use a compact checkbox row');
assert.ok(!profileOnboardWxml.includes('bindtap="toggleAgree">\n      <view class="choice-icon'), 'onboard agreement must not be presented as a large choice card');
assert.ok(profileOnboardWxss.includes('.checkbox') && !profileOnboardWxss.includes('.choice-icon.muted'), 'onboard agreement checkbox must use compact checkbox styling');
assert.ok(profileAgreementWxml.includes('\u4e0d\u63d0\u4f9b\u8bca\u65ad'), 'agreement must state the product is not a diagnosis service');
assert.ok(profilePrivacyWxml.includes('OCR') && profilePrivacyWxml.includes('\u7b2c\u4e09\u65b9\u670d\u52a1'), 'privacy policy must disclose OCR and third-party service handling');
assert.ok(homeIndexJs.includes('isProfileRequiredError(error)'), 'home must treat empty profile as a create-profile transition');
assert.ok(healthIndexJs.includes('isProfileRequiredError(error)'), 'health must treat empty profile as a create-profile transition');
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
assert.ok(recheckDetailJs.includes('showPlanGone'), 'recheck detail must handle deleted or missing plans');
assert.ok(recheckDetailJs.includes('isNotFoundError(error)'), 'recheck detail must treat NOT_FOUND as a stale page');

const profileWxml = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'profile', 'index.wxml'), 'utf8');
const profileArchiveWxml = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'profile', 'archive.wxml'), 'utf8');
const profileAddWxml = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'profile', 'add.wxml'), 'utf8');
assert.ok(!profileWxml.includes('<button class="row"'), 'profile menu rows must not use native button layout');
assert.ok(!profileWxml.includes('<button class="row danger"'), 'profile danger rows must not use native button layout');
assert.ok(!profileWxml.includes('<button class="btn secondary logout"'), 'profile logout control must not use native button layout');
assert.ok(!profileArchiveWxml.includes('他莫昔芬'), 'profile archive must not show hardcoded medication records');
assert.ok(profileAddJs.includes('showApiErrorFeedback'), 'profile add must show backend validation field errors');
assert.ok(profileAddJs.includes('pickDate(event)') && profileAddJs.includes('pickRelation(event)') && profileAddJs.includes('inputField(event)'), 'profile add must use direct form editing and picker handlers');
assert.ok(!profileAddJs.includes('wx.showModal'), 'profile add must not edit every field through modal prompts');
assert.ok(profileAddWxml.includes('mode="date"'), 'profile add birth and diagnosis dates must use date pickers');
assert.ok(profileAddWxml.includes('bindinput="inputField"'), 'profile add text fields must be editable in place');
assert.ok(profileArchiveJs.includes('showApiErrorFeedback'), 'profile archive must show backend validation field errors');

const apiErrorPages = [
  ['home', homeIndexJs],
  ['health', healthIndexJs],
  ['health search', healthSearchJs],
  ['metric detail', metricDetailJs],
  ['recheck', recheckJs],
  ['profile', profileIndexJs],
  ['profile export', profileExportJs],
  ['profile reports archive', profileReportsArchiveJs]
];
for (const [name, source] of apiErrorPages) {
  assert.ok(source.includes('showApiErrorToast'), `${name} page must surface normalized API errors`);
}

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
  assert.ok(js.includes('beginSlowLoading(this)'), `${name} tab must start slow-loading tracking`);
  assert.ok(js.includes('finishSlowLoading(this, loadingToken)'), `${name} tab must finish slow-loading tracking with a token`);
  assert.ok(js.includes('cancelPageLoading(this)'), `${name} tab must let users cancel a slow load`);
  assert.ok(wxml.includes('<loading-slow-banner'), `${name} tab must show the slow-loading banner`);
  assert.ok(json.includes('/components/loading-slow-banner/loading-slow-banner'), `${name} tab must register the slow-loading banner component`);
}

console.log(`Static checks passed: ${app.pages.length} pages, ${wxmlFiles.length} WXML files`);
