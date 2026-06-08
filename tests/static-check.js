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
const projectConfig = readJson(path.join(root, 'project.config.json'));
assert.strictEqual(projectConfig.appid, 'wx382d538fd178a873', 'project AppID must match the active WeChat mini program account');
const ocrProviderContractMd = fs.readFileSync(path.join(root, 'docs', 'ocr-provider-contract.md'), 'utf8');
assert.ok(ocrProviderContractMd.includes('ocr_draft_v1') && ocrProviderContractMd.includes('OcrProviderInput'), 'OCR provider contract must define the stable provider input/output schema');
const realcaseOcrEvalManifest = readJson(path.join(root, 'tests', 'fixtures', 'realtestcase', 'ocr-eval-manifest.json'));
const realcaseImageInventory = readJson(path.join(root, 'tests', 'fixtures', 'realtestcase', 'image-inventory.json'));
const doubleColumnBloodRoutineGolden = readJson(path.join(root, 'tests', 'golden', 'blood_routine_double_column_photo.json'));
const communityLipidGolden = readJson(path.join(root, 'tests', 'golden', 'community_lipid_photo.json'));
const serumThyroidGolden = readJson(path.join(root, 'tests', 'golden', 'serum_thyroid_photo.json'));
const requiredOcrEvalCases = new Map([
  ['headless_blood_routine_screenshot', 'headless_blood_routine_screenshot.json'],
  ['blood_routine_double_column_photo', 'blood_routine_double_column_photo.json'],
  ['sample_4_lab_photo', 'sample_4_lab_photo.json'],
  ['community_blood_routine_photo', 'community_blood_routine_photo.json'],
  ['community_lipid_photo', 'community_lipid_photo.json'],
  ['serum_thyroid_photo', 'serum_thyroid_photo.json'],
  ['recognition_sample_3_wide', 'recognition_sample_3_wide.json']
]);
assert.strictEqual(realcaseImageInventory.cases.filter((item) => item.coverage === 'pending_golden').length, 0, 'realcase OCR inventory must not leave pending golden samples');
for (const [caseId, goldenFile] of requiredOcrEvalCases.entries()) {
  assert.ok(realcaseOcrEvalManifest.cases.some((item) => item.id === caseId && item.expectedGolden.includes(goldenFile)), `OCR eval manifest must cover ${caseId}`);
}
assert.ok(realcaseOcrEvalManifest.cases.length >= requiredOcrEvalCases.size, 'OCR eval manifest must cover every real deidentified OCR golden sample');
assert.ok(doubleColumnBloodRoutineGolden.metrics.length >= 31 && doubleColumnBloodRoutineGolden.basicInfo.typeKey === 'blood_routine', 'double-column blood routine golden must preserve all expected blood routine metrics');
assert.ok(communityLipidGolden.metrics.length === 4 && communityLipidGolden.basicInfo.typeKey === 'blood_lipid', 'community lipid golden must preserve all four lipid metrics');
assert.ok(serumThyroidGolden.metrics.length === 3 && serumThyroidGolden.basicInfo.typeKey === 'thyroid_function', 'serum thyroid golden must preserve T3/T4/TSH metrics');
const backendPackage = readJson(path.join(root, 'backend', 'package.json'));
const rootPackage = readJson(path.join(root, 'package.json'));
const gptOcrSmokeTs = fs.readFileSync(path.join(root, 'backend', 'src', 'gpt-ocr-realcase-smoke.ts'), 'utf8');
const gptRunbookMd = fs.readFileSync(path.join(root, 'docs', 'gpt-ocr-real-upload-runbook.md'), 'utf8');
const ocrCropExperimentJs = fs.readFileSync(path.join(root, 'scripts', 'create-ocr-table-crop-experiment.js'), 'utf8');
assert.strictEqual(backendPackage.scripts['smoke:gpt-ocr'], 'tsx src/gpt-ocr-realcase-smoke.ts', 'backend must expose a repeatable real GPT OCR smoke command');
assert.strictEqual(backendPackage.scripts['compare:ocr'], undefined, 'backend must not expose the retired DeepSeek provider comparison command');
assert.strictEqual(backendPackage.scripts['replay:ocr-acceptance'], undefined, 'backend must not expose the retired DeepSeek replay acceptance command');
assert.strictEqual(rootPackage.scripts['ocr:crop-experiment'], 'node scripts/create-ocr-table-crop-experiment.js', 'repository must expose an explicit OCR crop experiment helper');
assert.ok(gptOcrSmokeTs.includes('OPENAI_API_KEY') && gptOcrSmokeTs.includes('realtestcase') && gptOcrSmokeTs.includes('/api/uploads/sign') && gptOcrSmokeTs.includes('/api/reports/batch-create'), 'GPT OCR smoke must cover realcase upload, OCR, save, and readback routes');
assert.ok(!fs.existsSync(path.join(root, 'backend', 'src', 'ocr-provider-compare.ts')), 'retired DeepSeek provider comparison source must stay removed');
assert.ok(!fs.existsSync(path.join(root, 'backend', 'src', 'ocr-replay-acceptance.ts')), 'retired DeepSeek replay acceptance source must stay removed');
assert.ok(ocrCropExperimentJs.includes('evaluation helper only') && ocrCropExperimentJs.includes('tmp') && ocrCropExperimentJs.includes('heightRatio'), 'OCR crop helper must stay an explicit temporary evaluation tool');
assert.strictEqual(rootPackage.scripts['devtools:real-upload-flow'], 'node tests/devtools-real-upload-flow.js', 'DevTools must expose a real upload flow smoke');
assert.strictEqual(rootPackage.scripts['devtools:gpt-real-upload-flow'], 'node tests/devtools-gpt-real-upload-flow.js', 'DevTools must expose an opt-in real GPT upload flow smoke');
assert.ok(rootPackage.scripts.test.includes('node tests/check-fixtures.js'), 'default test script must validate realcase fixtures and OCR eval manifests');
assert.strictEqual(rootPackage.scripts['backend:env:init'], 'node scripts/init-backend-env.js', 'repository must expose a safe backend env initialization helper');
assert.strictEqual(rootPackage.scripts['gpt-ocr:readiness'], 'node scripts/check-gpt-ocr-readiness.js', 'repository must expose a GPT OCR readiness check');
const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
const initBackendEnvJs = fs.readFileSync(path.join(root, 'scripts', 'init-backend-env.js'), 'utf8');
const gptReadinessJs = fs.readFileSync(path.join(root, 'scripts', 'check-gpt-ocr-readiness.js'), 'utf8');
const devtoolsRealUploadFlowJs = fs.readFileSync(path.join(root, 'tests', 'devtools-real-upload-flow.js'), 'utf8');
const devtoolsGptRealUploadFlowJs = fs.readFileSync(path.join(root, 'tests', 'devtools-gpt-real-upload-flow.js'), 'utf8');
assert.ok(devtoolsRealUploadFlowJs.includes('runRealUploadSmokeForTest') && devtoolsRealUploadFlowJs.includes('OCR_PROVIDER') && devtoolsRealUploadFlowJs.includes('gpt_vision'), 'DevTools real upload smoke must exercise wx.uploadFile against the configured OCR provider path');
assert.ok(
  devtoolsRealUploadFlowJs.includes('HEALTHHELPER_REAL_UPLOAD_EXPECT_REPORT_TYPE_KEY')
  && devtoolsRealUploadFlowJs.includes('HEALTHHELPER_REAL_UPLOAD_EXPECT_ANALYSIS_POLICY')
  && devtoolsRealUploadFlowJs.includes('HEALTHHELPER_REAL_UPLOAD_EXPECT_FINDING_INCLUDES')
  && devtoolsRealUploadFlowJs.includes('HEALTHHELPER_REAL_UPLOAD_EXPECT_METRIC_KEY')
  && devtoolsRealUploadFlowJs.includes('HEALTHHELPER_REAL_UPLOAD_EXPECT_METRIC_TONE')
  && devtoolsRealUploadFlowJs.includes('flattenHealthReports(data)')
  && devtoolsRealUploadFlowJs.includes('reportContainsExpectedMetric')
  && devtoolsRealUploadFlowJs.includes('reportContainsExpectedFinding')
  && devtoolsRealUploadFlowJs.includes('mockCtRawText')
  && devtoolsRealUploadFlowJs.includes('mockCtStructuredDraft')
  && devtoolsRealUploadFlowJs.includes('bodyMatchesMockCtImage')
  && devtoolsRealUploadFlowJs.includes('assertMockMixedCtReport(data)')
  && devtoolsRealUploadFlowJs.includes('relaunchAndWait(miniProgram')
  && devtoolsRealUploadFlowJs.includes('tabPagePaths')
  && devtoolsRealUploadFlowJs.includes('miniProgram.switchTab')
  && devtoolsRealUploadFlowJs.includes('wx.reLaunch')
  && devtoolsRealUploadFlowJs.includes('findingIncludes: mockMixedCtFinding')
  && devtoolsRealUploadFlowJs.includes('open mock mixed CT report detail')
  && devtoolsRealUploadFlowJs.includes('assertExpectedSavedReport(data)')
  && devtoolsRealUploadFlowJs.includes('assertExpectedMetricSnapshot(data)')
  && devtoolsRealUploadFlowJs.includes('openAndAssertReportDetail(miniProgram, page, savedReport)')
  && devtoolsRealUploadFlowJs.includes("pages/health/report-detail")
  && devtoolsRealUploadFlowJs.includes('examPart')
  && devtoolsRealUploadFlowJs.includes('examMethod'),
  'DevTools real upload smoke must assert saved report metadata, findings, metric snapshots, and report detail after health readback'
);
assert.ok(
  devtoolsRealUploadFlowJs.includes("callMethod('goReport'")
  && devtoolsRealUploadFlowJs.includes('saved report did not open detail from health list')
  && !devtoolsRealUploadFlowJs.includes('reLaunch(`/pages/health/report-detail'),
  'DevTools real upload smoke must open saved report detail from the health list instead of directly relaunching the detail page'
);
assert.ok(devtoolsRealUploadFlowJs.includes('HEALTHHELPER_USE_REAL_OPENAI') && devtoolsRealUploadFlowJs.includes('OPENAI_API_KEY') && devtoolsGptRealUploadFlowJs.includes("HEALTHHELPER_USE_REAL_OPENAI = '1'"), 'DevTools GPT upload smoke must opt into the real OpenAI provider only when explicitly requested');
assert.ok(devtoolsRealUploadFlowJs.includes("path.join(root, 'backend', '.env')") && devtoolsRealUploadFlowJs.includes('readDotEnv'), 'DevTools GPT upload smoke must read backend/.env so secrets stay in the backend configuration path');
assert.ok(gitignore.includes('!.env.example'), 'gitignore must allow committed env templates while ignoring real env files');
assert.ok(initBackendEnvJs.includes('copyFileSync') && initBackendEnvJs.includes('already exists; leaving it unchanged'), 'backend env init helper must create backend/.env without overwriting secrets');
assert.ok(gptReadinessJs.includes('OPENAI_API_KEY') && gptReadinessJs.includes('OCR_PROVIDER') && gptReadinessJs.includes('devtools:gpt-real-upload-flow'), 'readiness check must cover GPT key, OCR provider, and the final smoke command');
assert.ok(!gptReadinessJs.includes('commercial_ocr') && !gptReadinessJs.includes('compare:ocr'), 'readiness check must not advertise retired DeepSeek/commercial OCR routes');
assert.ok(gptReadinessJs.includes('Integration readiness') && gptReadinessJs.includes('Real-photo product readiness') && gptReadinessJs.includes('productVisionReady') && gptReadinessJs.includes('directVisionReady'), 'readiness check must distinguish API integration from GPT vision-model product readiness');
assert.ok(gptReadinessJs.includes('WECHAT_DEVTOOLS_LOCALAPPDATA') && gptReadinessJs.includes('LOCALAPPDATA'), 'readiness check must use isolated DevTools LOCALAPPDATA on Windows');
assert.ok(gptRunbookMd.includes('devtools:gpt-real-upload-flow') && gptRunbookMd.includes('Completion Criteria') && !gptRunbookMd.includes('DeepSeek') && !gptRunbookMd.includes('OCR_FALLBACK_PROVIDER'), 'GPT OCR real upload runbook must document the final command and omit retired DeepSeek/fallback routes');
assert.ok(gptOcrSmokeTs.includes('saveTaskAfterRequiredFixes') && gptOcrSmokeTs.includes('blockedBeforeSave') && !gptOcrSmokeTs.includes('risk_not_reviewed'), 'realcase OCR smoke must save risky OCR drafts without an explicit review gate while still patching required missing fields');
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

const jsFiles = walkFiles(miniprogramRoot, (file) => file.endsWith('.js'));
for (const file of jsFiles) {
  const source = fs.readFileSync(file, 'utf8');
  assert.ok(!source.includes('editable: true'), `avoid modal field editing: ${path.relative(root, file)}`);
}

const homeWxml = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'home', 'index.wxml'), 'utf8');
const homeIndexJs = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'home', 'index.js'), 'utf8');
const homeWxss = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'home', 'index.wxss'), 'utf8');
const homeJson = readJson(path.join(miniprogramRoot, 'pages', 'home', 'index.json'));
const onboardJson = readJson(path.join(miniprogramRoot, 'pages', 'profile', 'onboard.json'));
const healthWxml = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'health', 'index.wxml'), 'utf8');
const healthWxss = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'health', 'index.wxss'), 'utf8');
const recordNewJs = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'record', 'new.js'), 'utf8');
const recordNewWxml = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'record', 'new.wxml'), 'utf8');
const manualEntryJs = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'record', 'manual-entry.js'), 'utf8');
const healthIndexJs = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'health', 'index.js'), 'utf8');
const healthSearchJs = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'health', 'search.js'), 'utf8');
const uploadPickJs = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'upload', 'pick.js'), 'utf8');
const uploadPickWxml = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'upload', 'pick.wxml'), 'utf8');
const uploadPickWxss = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'upload', 'pick.wxss'), 'utf8');
const uploadConfirmJs = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'upload', 'confirm.js'), 'utf8');
const uploadConfirmWxml = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'upload', 'confirm.wxml'), 'utf8');
const uploadEditDetailJs = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'upload', 'edit-detail.js'), 'utf8');
const uploadEditDetailWxml = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'upload', 'edit-detail.wxml'), 'utf8');
const uploadEditDetailWxss = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'upload', 'edit-detail.wxss'), 'utf8');
const uploadConflictJs = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'upload', 'conflict.js'), 'utf8');
const uploadConflictWxml = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'upload', 'conflict.wxml'), 'utf8');
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
const apiConfigJs = fs.readFileSync(path.join(miniprogramRoot, 'utils', 'api-config.js'), 'utf8');
const apiMockJs = fs.readFileSync(path.join(miniprogramRoot, 'utils', 'api-mock.js'), 'utf8');
const errorJs = fs.readFileSync(path.join(miniprogramRoot, 'utils', 'error.js'), 'utf8');
const backendOcrRouteTs = fs.readFileSync(path.join(root, 'backend', 'src', 'routes', 'ocr.ts'), 'utf8');
const backendOcrProviderTs = fs.readFileSync(path.join(root, 'backend', 'src', 'services', 'ocr-provider.ts'), 'utf8');
const backendRawOcrParserTs = fs.readFileSync(path.join(root, 'backend', 'src', 'services', 'raw-ocr-parser.ts'), 'utf8');
const backendReportServiceTs = fs.readFileSync(path.join(root, 'backend', 'src', 'services', 'report-service.ts'), 'utf8');
const backendUploadRouteTs = fs.readFileSync(path.join(root, 'backend', 'src', 'routes', 'uploads.ts'), 'utf8');
const backendUploadStorageTs = fs.readFileSync(path.join(root, 'backend', 'src', 'services', 'upload-storage.ts'), 'utf8');
assert.ok(backendOcrProviderTs.includes('OcrProviderInput') && backendOcrProviderTs.includes('OcrProviderResult') && backendOcrProviderTs.includes('recognizePhotos'), 'backend OCR provider boundary must expose stable real-photo input and output types');
assert.ok(backendOcrProviderTs.includes('partialText') && backendOcrProviderTs.includes('OCR_OUTPUT_TRUNCATED') && backendOcrProviderTs.includes('仅保留部分识别文本'), 'commercial OCR must preserve partial truncated output as a review-gated draft');
assert.ok(backendOcrProviderTs.includes('禁止输出医学解释') && backendOcrProviderTs.includes('不要合并相邻项目') && backendOcrProviderTs.includes('项目简称/代码'), 'commercial OCR prompt must favor raw-text recall over generated medical explanations');
const productionOcrCoreSources = [
  ['backend/src/services/raw-ocr-parser.ts', backendRawOcrParserTs],
  ['backend/src/services/ocr-provider.ts', backendOcrProviderTs],
  ['backend/src/routes/ocr.ts', backendOcrRouteTs]
];
const sampleSpecificOcrNeedles = [
  'blood_routine_double_column_photo',
  '\u68c0\u67e5\u62a5\u544a\u5355\u6837\u54c1',
  '\u5929\u6d25\u5e02\u4e1c\u4e3d\u533a\u65b0\u7acb\u8857\u793e\u533a\u536b\u751f\u670d\u52a1\u4e2d\u5fc3',
  '\u5929\u6d25\u8fea\u5b89',
  '\u5929\u6d25\u5e02\u533b\u7597\u5668\u68b0\u68c0\u9a8c\u68c0\u6d4b\u5b9e\u9a8c\u5ba4',
  '\u5f20\u8273\u534e',
  '2025/08/25',
  '2025-08-25'
];
for (const [fileName, source] of productionOcrCoreSources) {
  for (const needle of sampleSpecificOcrNeedles) {
    assert.ok(!source.includes(needle), `production OCR core must not hardcode sample-specific value "${needle}" in ${fileName}`);
  }
}
assert.ok(uploadPickJs.includes("UPLOAD_DRAFT_KEY = 'uploadDraft'"), 'upload pick must persist unfinished upload drafts');
assert.ok(uploadPickJs.includes('wx.chooseMedia') || uploadPickJs.includes('wx.chooseImage'), 'upload pick must use native image selection APIs');
assert.ok(uploadPickJs.includes('persistUploadDraft(photos)'), 'upload pick must keep selected photos recoverable after task creation failures');
assert.ok(uploadPickJs.includes('width: photoDimension') && uploadPickJs.includes('height: photoDimension'), 'upload pick draft must preserve local image dimensions for OCR quality warnings');
assert.ok(uploadPickJs.includes('buildPhotoQualityWarning') && uploadPickJs.includes('qualityWarningCount'), 'upload pick must flag low-quality photos before OCR starts');
assert.ok(uploadPickJs.includes('MIN_OCR_PHOTO_SHORT_EDGE') && uploadPickJs.includes('shortEdge'), 'upload pick OCR quality warning must flag dense-table photos with a small short edge');
assert.ok(uploadPickJs.includes('wx.getImageInfo') && uploadPickJs.includes('enrichFilesWithImageInfo'), 'upload pick must fill missing local image dimensions before OCR quality checks');
assert.ok(uploadPickJs.includes('confirmQualityWarnings(photos)') && uploadPickJs.includes('confirmText:') && uploadPickJs.includes('继续识别'), 'upload pick must confirm before spending OCR on low-quality photos');
assert.ok(uploadPickJs.includes('OCR_RESULT_TABLE_GUIDANCE') && uploadPickJs.includes('结果表格居中') && uploadPickJs.includes('解释/建议区'), 'upload pick quality guidance must warn about table framing and explanatory-section interference');
assert.ok(uploadPickWxml.includes('结果表格居中') && uploadPickWxml.includes('裁到结果表'), 'upload pick visible guidance must recommend table-centered photos for paper reports');
assert.ok(uploadPickWxml.includes('/assets/upload/group-link.png') && uploadPickWxml.includes('clip-icon'), 'upload pick multi-page grouping must use a visible image icon instead of an ambiguous character');
assert.ok(uploadPickWxml.includes('同一份报告跨页拍摄') && uploadPickWxml.includes('合并为 1 份报告识别') && !uploadPickWxml.includes('曲别针') && !uploadPickWxml.includes('⌘'), 'upload pick grouping copy must clearly explain multi-page report grouping');
assert.ok(!uploadPickWxml.includes('默认每张图识别为一份报告') && !uploadPickWxml.includes('把多张图分到同一组'), 'upload pick grouping guidance must not duplicate the lower photo-grid hint');
assert.ok(uploadPickJs.includes('wx.showModal'), 'upload pick must confirm leaving with an unfinished draft');
assert.ok(uploadPickJs.includes('splitGroup(event)'), 'upload pick must allow cancelling an existing photo merge');
assert.ok(uploadPickJs.includes('removePhoto(event)') && uploadPickWxml.includes('catchtap="removePhoto"'), 'upload pick must allow removing a mistakenly selected photo');
assert.ok(!homeWxml.includes('\u6b63\u5728\u8bc6\u522b 3 \u5f20\u62a5\u544a'), 'home OCR notice must not hardcode report counts');
assert.ok(homeIndexJs.includes('api.listOcrTasks'), 'home must refresh pending OCR state from API');
assert.ok(homeIndexJs.includes('formatPendingOcrSummary'), 'home must summarize multiple pending OCR tasks');
assert.ok(homeIndexJs.includes('taskPriority'), 'home must prioritize ready or failed OCR tasks when several are pending');
assert.ok(homeIndexJs.includes('taskCount: activeTasks.length'), 'home pending OCR summary must keep the task count');
assert.ok(homeIndexJs.includes('statusLabel'), 'home OCR task summary must provide a concise status label');
assert.ok(!homeIndexJs.includes('|| sortPendingOcrTasks(pending)[0]'), 'home must not open OCR tasks from another or stale profile');
assert.ok(!homeWxml.includes('ocr-status-entry'), 'home OCR state must not use a cramped banner chip');
assert.ok(homeWxml.includes('wx:if="{{pendingOcrTask}}"') && homeWxml.includes('{{pendingOcrTask.title}}'), 'home OCR card must only render when there is an active OCR task');
assert.ok(!homeWxml.includes('暂无识别中的报告') && !homeWxml.includes("pendingOcrTask ?"), 'home OCR card must auto-hide instead of rendering an empty fallback state');
assert.ok(!homeWxml.includes('···') && !homeWxss.includes('.bell'), 'home OCR status entry must not ship as an ambiguous dot or bell affordance');
assert.ok(app.pages.includes('pages/record/new') && app.pages.includes('pages/record/manual-entry'), 'unified record entry and manual entry pages must be registered');
assert.ok(app.pages.includes('pages/profile/custom-metrics'), 'custom metric library page must be registered');
assert.ok(homeWxml.includes('拍照识别 / 手动录入') && homeIndexJs.includes('/pages/record/new'), 'home primary CTA must open unified record entry');
assert.ok(!homeWxml.includes('新增{{profile.relation}}') && !homeWxml.includes('{{profile.relation}}距下次复查'), 'home primary cards must not repeat the archive relation in action copy');
assert.ok(homeWxml.includes('{{greetingText}}') && homeIndexJs.includes('getGreetingText') && homeIndexJs.includes('\\u613f\\u60a8\\u65e9\\u65e5\\u5eb7\\u590d'), 'home greeting must be time-aware and use the recovery wish copy');
assert.ok(homeIndexJs.includes('reportDisplayType(report)') && homeWxml.includes('{{item.fullType}}') && homeWxml.includes('{{item.displayHospital}}'), 'home recent reports must show the report name as the main title and hospital as the short label');
assert.ok(homeIndexJs.includes('label.length > 4') && homeIndexJs.includes('label.slice(0, 3)'), 'home recent report labels must be capped at four visible characters including ellipsis');
assert.ok(homeIndexJs.includes('HOME_RECENT_REPORT_LIMIT = 6') && homeIndexJs.includes('HOME_ALERT_METRIC_LIMIT = 5'), 'home must cap recent reports at six and health reminders at five');
assert.ok(homeWxml.includes('{{alertSummaryText}}') && homeIndexJs.includes('formatAlertSummary(alertMetrics)'), 'home alert summary must be generated from the capped alert list');
assert.ok(apiConfigJs.includes("envVersion === 'release'") && apiConfigJs.includes("PRODUCTION_API_MODE = 'backend'"), 'production miniprogram builds must force backend API mode');
assert.ok(homeWxml.includes('scroll-x class="metric-scroll"') && homeWxss.includes('overflow-x: hidden'), 'home pinned metrics must stay as a single-row carousel without widening the page');
assert.ok(app.window.backgroundColorTop === '#EDEAE4' && app.window.backgroundColorBottom === '#EDEAE4', 'global window overscroll background must match the app surface instead of the default white');
assert.ok(homeJson.backgroundColorTop === '#5A7A5A' && onboardJson.backgroundColorTop === '#5A7A5A', 'green hero pages must use page window background colors for iOS overscroll');
assert.ok(!homeWxml.includes('home-top-fill') && !homeWxss.includes('home-top-fill'), 'home must not fake the iOS overscroll background with a fixed DOM layer');
assert.ok(healthWxml.includes('scroll-x class="chips"') && healthWxss.includes('overflow-x: hidden'), 'health filter chips must stay as a single-row carousel without widening the page');
assert.ok(recordNewJs.includes('/pages/upload/pick') && recordNewJs.includes('/pages/profile/custom-metrics?mode=select'), 'record entry must split only into photo recognition and manual entry');
assert.ok(!recordNewWxml.includes('为{{profile.relation') && recordNewWxml.includes('新增健康记录'), 'record entry title must not repeat the archive relation');
assert.ok(profileIndexJs.includes('/pages/profile/custom-metrics?mode=manage') && profileIndexWxml.includes('维护手动录入模板') && !profileIndexWxml.includes('我的检查项目'), 'profile page must name the custom metric area by its manual-entry function');
assert.ok(profileIndexJs.includes("devRuntimeVisible: envVersion === 'develop'"), 'profile dev runtime tools must only be visible in the develop environment');
assert.ok(profileCustomMetricsJs.includes("const mode = query.mode === 'select' ? 'select' : 'manage'") && profileCustomMetricsJs.includes('isSelectMode'), 'custom metric page must be reusable for select and manage modes');
assert.ok(profileCustomMetricsJs.includes("'text'") && profileCustomMetricsJs.includes('CATEGORY_OPTIONS') && profileCustomMetricsWxml.includes('检查类型') && profileCustomMetricsWxml.includes('参考范围'), 'manual template management must capture exam type, result type, and reference values');
assert.ok(profileCustomMetricsJs.includes("{ key: 'lab', label: '检验（血液、尿液等）' }") && profileCustomMetricsJs.includes("{ key: 'exam', label: '检查（CT、核磁、B超等）' }") && profileCustomMetricsJs.includes("{ key: 'electrophysiology', label: '电生理（心电图等）' }"), 'manual template exam types must use the agreed top-level medical categories with explanations');
assert.ok(profileCustomMetricsJs.includes('DEFAULT_CATEGORY_INDEX = 0') && profileCustomMetricsJs.includes('DEFAULT_CATEGORY.label'), 'new manual templates must default the exam type picker to lab test');
assert.ok(profileCustomMetricsJs.includes('LAB_VALUE_TYPE_LABELS') && profileCustomMetricsWxml.includes("form.category === 'lab'") && profileCustomMetricsWxml.includes("form.category !== 'lab'"), 'manual template fields must switch between lab metric fields and text-only exam fields');
assert.ok(profileCustomMetricsJs.includes("'exam', 'electrophysiology', 'pathology', 'other'") && profileCustomMetricsJs.includes('sanitizeFormByCategory'), 'non-lab manual templates must be normalized to text-only records before saving');
assert.ok(profileCustomMetricsJs.includes('api.listManualTemplates') && profileCustomMetricsJs.includes('api.saveManualTemplate') && profileCustomMetricsJs.includes('api.archiveManualTemplate'), 'manual template management must sync through the backend API layer');
assert.ok(apiJs.includes('/manual-templates') && apiMockJs.includes('listManualTemplates'), 'manual template APIs must exist for backend and local mock clients');
assert.ok(manualEntryJs.includes('api.createManualReport'), 'manual entry must persist through the manual report API');
assert.ok(manualEntryJs.includes("form.hospital") && manualEntryWxml.includes('请填写医院'), 'manual entry must require hospital before saving reports');
assert.ok(manualEntryJs.includes("mappingStatus: 'confirmed'"), 'manual custom metrics must be followable in the user profile without waiting for public mapping review');
assert.ok(manualEntryWxml.includes('自定义模板') && manualEntryWxml.includes('textarea') && manualEntryJs.includes("template.valueType === 'text'"), 'manual entry must label custom templates and support text-only exam results');
assert.ok(manualEntryWxml.includes('<picker class="field-control" mode="date"') && manualEntryWxml.includes('<picker class="field-control" range="{{qualitativeOptions}}"'), 'manual entry pickers must occupy the right-side form control area');
assert.ok(!manualEntryWxml.includes('auto-height'), 'manual entry text result input must keep a stable form height');
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
assert.ok(uploadPickJs.includes('runRealUploadSmokeForTest') && uploadPickJs.includes('wx.getFileSystemManager().writeFileSync') && uploadPickJs.includes('return this.startOcr()'), 'upload pick must expose a DevTools-only smoke path that still uses the real upload/OCR flow');
assert.ok(uploadPickJs.includes('Array.isArray(options.files)') && uploadPickJs.includes('files.slice(0, MAX_UPLOAD_PHOTOS)') && uploadPickJs.includes('this.updatePhotos(photos, [])'), 'upload pick DevTools smoke path must support multi-image upload batches');
assert.ok(uploadPickWxml.includes('qualityWarningCount') && uploadPickWxml.includes('quality-badge') && uploadPickWxss.includes('.photo-quality-warning'), 'upload pick must show local OCR quality warnings on selected photos');
assert.ok(uploadPickWxss.includes('.quality-badge') && uploadPickWxss.includes('bottom: 10rpx'), 'upload pick quality badge must not overlap grouped photo labels');
assert.ok(uploadConfirmJs.includes("itemList: ['覆盖旧报告', '跳过重复报告']"), 'duplicate prompt should only expose replace or skip');
assert.ok(!uploadConfirmJs.includes('仍保存为新报告'), 'duplicate prompt must not expose keep-both to normal users');
assert.ok(uploadConfirmJs.includes('cancelTaskAndLeave()'), 'upload confirm cancel must explicitly discard the OCR task');
assert.ok(uploadConfirmJs.includes('api.cancelOcrTask(this.taskId)'), 'upload confirm cancel must call the cancel OCR API');
assert.ok(uploadConfirmJs.includes('retryTask()'), 'upload confirm must expose OCR retry handling');
assert.ok(uploadConfirmJs.includes('api.retryOcrTask(this.taskId'), 'upload confirm retry must call the retry OCR API');
assert.ok(errorJs.includes('OCR_DRAFT_NOT_SPLITTABLE') && errorJs.includes('这份报告不能继续拆分'), 'upload confirm split failures must show a user-facing Chinese message');
assert.ok(uploadConfirmJs.includes('isNotFoundError(error)'), 'upload confirm must treat missing OCR tasks as stale local state');
assert.ok(uploadConfirmJs.includes('handleStaleTask()'), 'upload confirm must clear stale OCR task cache');
assert.ok((uploadConfirmJs.match(/isNotFoundError\(error\)/g) || []).length >= 3, 'upload confirm remove/split/retry paths must all treat missing OCR tasks as stale local state');
assert.ok(uploadConfirmJs.includes('profileId: this.data.profileId'), 'upload confirm save must keep reports scoped to the OCR task profile');
assert.ok(uploadConfirmJs.includes('profileNoticeText'), 'upload confirm must explain when the OCR task belongs to another profile');
assert.ok(uploadConfirmJs.includes('goManualFill'), 'upload confirm must offer manual fill for empty or non-report OCR drafts');
assert.ok(uploadConfirmJs.includes('needsManualInput'), 'upload confirm must block unresolved empty OCR drafts before saving');
assert.ok(uploadConfirmJs.includes('warningMessage') && uploadConfirmJs.includes('warningMoreText') && uploadConfirmWxml.includes('item.warningText') && uploadConfirmWxml.includes('item.warningMoreText'), 'upload confirm must surface concrete OCR warning reasons before users open detail edit');
assert.ok(uploadConfirmJs.includes('isRecognizingTaskStatus(task.status)'), 'upload confirm must keep polling while OCR tasks are queued or processing');
assert.ok(uploadConfirmJs.includes('scheduleRecognitionPoll()'), 'upload confirm must schedule OCR status polling');
assert.ok(uploadConfirmJs.includes('clearRecognitionTimer()'), 'upload confirm must clear OCR polling timers on exit');
assert.ok(uploadConfirmJs.includes('shouldShowRecognitionSlow'), 'upload confirm must show a slow-recognition state before the user can save');
assert.ok(uploadConfirmJs.includes('formatRecognitionElapsed') && uploadConfirmJs.includes('recognitionElapsedMs') && uploadConfirmJs.includes('processingElapsedMs'), 'upload confirm must show elapsed OCR wait time while recognition is still running');
assert.ok(uploadConfirmJs.includes('activeRecognitionProgressPercent') && uploadConfirmJs.includes('recognitionProgressPercent'), 'upload confirm progress bar must move even before the first OCR report is completed');
assert.ok(uploadConfirmJs.includes('if (this.data.recognizing)'), 'upload confirm must block saving while OCR is still running');
assert.ok(uploadConfirmJs.includes('showApiErrorToast(error'), 'upload confirm must surface normalized API errors');
assert.ok(uploadConfirmJs.includes('buildSourcePreviewUrls') && uploadConfirmJs.includes('previewSourcePhoto(event)') && uploadConfirmWxml.includes('page-thumb-image') && uploadConfirmWxml.includes('catchtap="previewSourcePhoto"'), 'upload confirm must let users preview source photos for OCR review');
assert.ok(uploadConfirmJs.includes('requiresDetailReview') && uploadConfirmWxml.includes('item.reviewRequiredText') && !uploadConfirmJs.includes('blocked:REQUIRES_DETAIL_REVIEW'), 'upload confirm must surface risky OCR drafts without blocking save');
assert.ok(uploadEditDetailJs.includes('api.getOcrTask(this.taskId)'), 'upload edit detail must load the selected OCR draft');
assert.ok(uploadEditDetailJs.includes("showApiErrorToast(error, '加载报告详情失败')"), 'upload edit detail must surface API errors when detail loading fails');
assert.ok(uploadEditDetailJs.includes('addManualMetric()'), 'upload edit detail must allow manual metric entry');
assert.ok(uploadEditDetailJs.includes('wx.showActionSheet') && uploadEditDetailJs.includes("this.createManualMetric('text')") && uploadEditDetailWxml.includes('text-metric-input'), 'upload edit detail manual metric entry must choose between quantitative, qualitative, and text results');
assert.ok(uploadEditDetailWxml.includes('metric-name-input') && uploadEditDetailJs.includes("field === 'metricName'"), 'upload edit detail must allow renaming manually added metrics');
assert.ok(uploadEditDetailWxml.includes('wx:key="index" class="metric-edit"') && !uploadEditDetailWxml.includes('wx:key="name" class="metric-edit"'), 'upload edit detail metric rows must use stable keys while metric names are edited');
assert.ok(uploadEditDetailJs.includes('\\u8bf7\\u586b\\u5199\\u6307\\u6807\\u540d\\u79f0'), 'upload edit detail must allow clearing a manual metric name while editing but validate it before saving');
assert.ok(uploadEditDetailJs.includes('addFinding()'), 'upload edit detail must allow manual imaging finding entry');
assert.ok(uploadEditDetailJs.includes('isImagingInfo(info)') && uploadEditDetailJs.includes('isImagingReport'), 'upload edit detail must gate imaging findings by normalized report modality');
assert.ok(uploadEditDetailJs.includes('deleteMetric(event)') && uploadEditDetailJs.includes('deleteFinding(event)'), 'upload edit detail must allow removing individual metrics and findings before saving');
assert.ok(uploadEditDetailWxml.includes('wx:if="{{isImagingReport}}" class="btn secondary" bindtap="addFinding"'), 'upload edit detail must only expose add finding for imaging reports');
assert.ok(uploadEditDetailWxml.includes('catchtap="deleteMetric"') && uploadEditDetailWxml.includes('catchtap="deleteFinding"'), 'upload edit detail delete controls must not trigger parent field editing');
assert.ok(uploadEditDetailWxss.includes('.delete-x'), 'upload edit detail must style row-level delete controls');
assert.ok(uploadEditDetailWxml.includes('data-field="unit"') && uploadEditDetailWxml.includes('class="mini-input unit-input"'), 'upload edit detail must allow unit editing for OCR and manual metrics');
assert.ok(!uploadEditDetailJs.includes("value: '32'"), 'upload edit detail must not ship hardcoded metric fixtures');
assert.ok(uploadEditDetailJs.includes('sourcePreviewUrls') && uploadEditDetailJs.includes('wx.previewImage') && uploadEditDetailWxml.includes('source-preview-strip'), 'upload edit detail must keep source-photo review available while editing OCR drafts');
assert.ok(uploadEditDetailJs.includes('ocrReviewedAt') && uploadEditDetailJs.includes('ocrReviewSource'), 'upload edit detail must mark reviewed OCR drafts before returning to confirm');
assert.ok(uploadConflictJs.includes('showApiErrorToast(error'), 'upload conflict page must surface normalized API errors');
assert.ok(uploadConflictJs.includes('displayableConflicts.map') && uploadConflictJs.includes('cleanInvalidConflicts()') && uploadConflictJs.includes('conflicts.reduce') && uploadConflictWxml.includes('wx:for="{{conflicts}}"'), 'upload conflict page must display and resolve all valid conflicts while cleaning unresolvable OCR conflicts');
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
assert.ok(backendOcrRouteTs.includes('createOcrProvider(app.env)'), 'backend OCR route must use the OCR provider boundary');
assert.ok(!backendOcrRouteTs.includes('getRealcaseOcrDrafts'), 'backend OCR route must not depend directly on fixture OCR data');
assert.ok(backendOcrProviderTs.includes('recognizeFixture'), 'backend OCR provider must expose fixture recognition for downstream smoke tests');
assert.ok(!apiMockJs.includes('risk_not_reviewed') && !backendReportServiceTs.includes('risk_not_reviewed'), 'mock and backend report save paths must not hard-block low-confidence OCR warnings');
assert.ok(!backendReportServiceTs.includes('draftRequiresUserReview') && !backendReportServiceTs.includes('ocrReviewedAt'), 'backend report save must not require explicit review markers for low-confidence or warning OCR drafts');
assert.ok(backendUploadRouteTs.includes('createUploadStorageProvider(app.env)'), 'backend upload route must use the storage provider boundary');
assert.ok(!backendUploadRouteTs.includes('local-upload://'), 'backend upload route must not hardcode local storage URLs');
assert.ok(backendUploadStorageTs.includes('signUpload'), 'backend upload storage provider must expose upload signing');

assert.ok(profileOnboardJs.includes('requestWxLoginCode()'), 'onboard login must use the native wx.login result');
assert.ok(!profileOnboardJs.includes('mock_code'), 'onboard login must not continue with a mock code after wx.login failure');
assert.ok(app.pages.includes('pages/profile/agreement'), 'onboard agreement page must be registered');
assert.ok(app.pages.includes('pages/profile/privacy'), 'onboard privacy page must be registered');
assert.ok(profileOnboardJs.includes('openAgreement()') && profileOnboardJs.includes('/pages/profile/agreement'), 'onboard must expose a user agreement entry');
assert.ok(profileOnboardJs.includes('openPrivacy()') && profileOnboardJs.includes('/pages/profile/privacy'), 'onboard must expose a privacy policy entry');
assert.ok(profileOnboardJs.includes("state: 'guest'") && profileOnboardJs.includes("state: 'noProfile'"), 'onboard must separate guest login and no-profile states');
assert.ok(profileOnboardJs.includes('createSelfProfile()') && profileOnboardJs.includes('createFamilyProfile()'), 'onboard must provide first-profile creation choices after login');
assert.ok(profileOnboardJs.includes('api.getProfiles()'), 'onboard login must check existing profiles before forcing first-profile creation');
assert.ok(profileOnboardJs.includes("wx.switchTab({ url: '/pages/home/index' })"), 'onboard must let returning users log in without choosing a new archive type');
assert.ok(profileOnboardWxml.includes('微信登录并继续'), 'onboard must show an explicit WeChat login continuation CTA');
assert.ok(profileOnboardWxml.includes('创建第一份病例夹') && profileOnboardWxml.includes('为我自己') && profileOnboardWxml.includes('为我的亲属'), 'onboard must clearly frame first archive creation and relation choice');
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
const recheckNewWxml = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'recheck', 'new.wxml'), 'utf8');
const recheckDetailJs = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'recheck', 'detail.js'), 'utf8');
const recheckDetailWxml = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'recheck', 'detail.wxml'), 'utf8');
assert.ok(!recheckWxml.includes('<button wx:for="{{nextPlan.todos}}"'), 'recheck todo rows must not use native button layout');
assert.ok(!recheckWxml.includes('<button wx:for="{{otherPlans}}"'), 'recheck plan rows must not use native button layout');
assert.ok(!recheckWxml.includes('<button class="row add-row"'), 'recheck add row must not use native button layout');
assert.ok(recheckWxml.includes('bindtap="goNextDetail"') && recheckJs.includes('goNextDetail()'), 'next recheck plan must expose detail/cancel entry');
assert.ok(recheckWxml.includes('todo-draft-input') && recheckJs.includes('saveTodoDraft()'), 'recheck index must add custom todos inline instead of through editable modals');
assert.ok(recheckWxml.includes('class="swipe-delete" data-id="{{item.id}}" catchtap="deleteTodo"') && recheckJs.includes('onTodoTouchStart') && recheckJs.includes('api.deleteRecheckTodo'), 'recheck index must expose todo deletion through left-swipe actions');
assert.ok(recheckNewJs.includes('wx.requestSubscribeMessage'), 'new recheck plan should request subscription messages when a template id is configured');
assert.ok(recheckNewJs.includes('subscribeAccepted: subscribe.subscribeAccepted'), 'new recheck plan must persist subscription rejection without blocking save');
assert.ok(recheckNewJs.includes('defaultRecheckDate()'), 'new recheck plan default date must stay valid over time');
assert.ok(!recheckNewJs.includes("date: '2026-06-01'"), 'new recheck plan must not ship a stale fixed default date');
assert.ok(recheckNewWxml.includes('mode="date"') && recheckNewWxml.includes('bindinput="onInput"') && !recheckNewJs.includes('pick(event)'), 'new recheck plan fields must use inline inputs and a date picker');
assert.ok(recheckNewWxml.includes('todo-draft-input') && recheckNewJs.includes('saveTodoDraft()'), 'new recheck plan must add custom todos inline');
assert.ok(recheckNewWxml.includes('class="swipe-delete" data-index="{{index}}" catchtap="deleteTodo"') && recheckNewJs.includes('onTodoTouchStart') && recheckNewJs.includes('deleteTodo(event)'), 'new recheck plan must expose default todo deletion through left-swipe actions');
assert.ok(recheckDetailWxml.includes('mode="date"') && recheckDetailWxml.includes('bindblur="onFieldBlur"') && !recheckDetailJs.includes('editField(event)'), 'recheck detail fields must use inline editing and a date picker instead of editable modals');
assert.ok(recheckDetailWxml.includes('todo-draft-input') && recheckDetailJs.includes('saveTodoDraft()'), 'recheck detail must add custom todos inline');
assert.ok(recheckDetailWxml.includes('mode="time"') && recheckDetailWxml.includes('deleteReminderDay') && recheckDetailJs.includes('updateReminderDays'), 'recheck detail reminder settings must support custom days and time');
assert.ok(recheckDetailWxml.includes('class="swipe-delete" data-id="{{item.id}}" catchtap="deleteTodo"') && recheckDetailJs.includes('onTodoTouchStart') && recheckDetailJs.includes('api.deleteRecheckTodo'), 'recheck detail must expose todo deletion through left-swipe actions');
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
assert.ok(profileAddJs.includes('pickStage(event)') && profileAddWxml.includes('range="{{stageOptions}}"'), 'profile add staging must use a picker instead of free text');
assert.ok(profileArchiveJs.includes('showApiErrorFeedback'), 'profile archive must show backend validation field errors');
assert.ok(!profileArchiveJs.includes('wx.showModal') && !profileArchiveJs.includes('editField(event)'), 'profile archive fields must use inline editing instead of modal prompts');
assert.ok(profileArchiveWxml.includes('bindinput="inputField"') && profileArchiveWxml.includes('mode="date"'), 'profile archive text and date fields must be editable in place');
assert.ok(profileArchiveJs.includes('pickStage(event)') && profileArchiveWxml.includes('range="{{stageOptions}}"'), 'profile archive staging must use a picker');

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
