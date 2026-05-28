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
const reportDetailJs = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'health', 'report-detail.js'), 'utf8');
const apiMockJs = fs.readFileSync(path.join(miniprogramRoot, 'utils', 'api-mock.js'), 'utf8');
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
assert.ok(uploadEditDetailJs.includes('api.getOcrTask(this.taskId)'), 'upload edit detail must load the selected OCR draft');
assert.ok(!uploadEditDetailJs.includes("value: '32'"), 'upload edit detail must not ship hardcoded metric fixtures');
assert.ok(!reportDetailJs.includes('api.updateReport(this.reportId'), 'report detail edit entry must not auto-save report data');
assert.ok(!reportDetailJs.includes('已保存编辑'), 'report detail edit entry must not show a saved toast before real edits');
assert.ok(!apiMockJs.includes('photoCount: 4'), 'OCR mock fallback must not fabricate four photos');
assert.ok(!apiMockJs.includes('reportCount: 3'), 'OCR mock fallback must not fabricate three reports');

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
assert.ok(!recheckWxml.includes('<button wx:for="{{nextPlan.todos}}"'), 'recheck todo rows must not use native button layout');
assert.ok(!recheckWxml.includes('<button wx:for="{{otherPlans}}"'), 'recheck plan rows must not use native button layout');
assert.ok(!recheckWxml.includes('<button class="row add-row"'), 'recheck add row must not use native button layout');

const profileWxml = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'profile', 'index.wxml'), 'utf8');
assert.ok(!profileWxml.includes('<button class="row"'), 'profile menu rows must not use native button layout');
assert.ok(!profileWxml.includes('<button class="row danger"'), 'profile danger rows must not use native button layout');
assert.ok(!profileWxml.includes('<button class="btn secondary logout"'), 'profile logout control must not use native button layout');

console.log(`Static checks passed: ${app.pages.length} pages, ${wxmlFiles.length} WXML files`);
