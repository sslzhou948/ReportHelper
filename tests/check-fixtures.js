const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const manifestPath = path.join(__dirname, 'fixtures', 'realtestcase', 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const sourceDir = path.resolve(__dirname, 'fixtures', 'realtestcase', manifest.sourceDir);
const { realcaseOcrDrafts } = require('../miniprogram/data/ocr-fixtures');

function assertFieldEqual(actual, expected, label) {
  if (expected === undefined) return;
  assert.strictEqual(actual, expected, label);
}

function assertMetricMatches(draft, expectedMetric, caseId) {
  const metric = (draft.metrics || []).find((item) => item.metricKey === expectedMetric.metricKey);
  assert.ok(metric, `missing OCR draft metric ${expectedMetric.metricKey} for ${caseId}`);
  for (const field of ['metricName', 'valueNumeric', 'valueQualitative', 'unit', 'refRangeLow', 'refRangeHigh', 'tone']) {
    assertFieldEqual(metric[field], expectedMetric[field], `metric ${expectedMetric.metricKey}.${field} mismatch for ${caseId}`);
  }
}

assert.ok(fs.existsSync(sourceDir), `missing realtestcase dir: ${sourceDir}`);
assert.ok(Array.isArray(manifest.cases) && manifest.cases.length > 0, 'manifest must contain cases');

for (const item of manifest.cases) {
  const imagePath = path.join(sourceDir, item.file);
  const goldenPath = path.resolve(__dirname, 'fixtures', 'realtestcase', item.expectedGolden);
  assert.ok(fs.existsSync(imagePath), `missing fixture image: ${item.file}`);
  assert.ok(fs.statSync(imagePath).size > 1024, `fixture image looks too small: ${item.file}`);
  assert.ok(fs.existsSync(goldenPath), `missing golden json: ${item.expectedGolden}`);

  const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));
  assert.strictEqual(golden.caseId, item.id, `golden caseId mismatch for ${item.id}`);
  assert.strictEqual(golden.modality, item.modality, `golden modality mismatch for ${item.id}`);
  assert.strictEqual(golden.status, 'structured', `golden must contain structured OCR data for ${item.id}`);
  assert.ok(Array.isArray(golden.expectedFields) && golden.expectedFields.length >= 3, `golden fields too sparse for ${item.id}`);
  if (item.modality === 'laboratory') {
    assert.ok(Array.isArray(golden.metrics) && golden.metrics.length >= 1, `lab golden needs metrics for ${item.id}`);
  }
  if (item.modality === 'imaging') {
    assert.ok(Array.isArray(golden.findings) && golden.findings.length >= 1, `imaging golden needs findings for ${item.id}`);
  }
  const draft = realcaseOcrDrafts.find((draft) => draft.caseId === item.id);
  assert.ok(draft, `missing OCR fixture draft for ${item.id}`);
  assert.strictEqual(draft.basicInfo.modality, item.modality, `OCR draft modality mismatch for ${item.id}`);
  for (const [field, expectedValue] of Object.entries(golden.basicInfo || {})) {
    assertFieldEqual(draft.basicInfo[field], expectedValue, `OCR draft basicInfo.${field} mismatch for ${item.id}`);
  }
  for (const expectedMetric of golden.metrics || []) {
    assertMetricMatches(draft, expectedMetric, item.id);
  }
  for (const expectedFinding of golden.findings || []) {
    assert.ok((draft.findings || []).some((finding) => String(finding).includes(expectedFinding)), `missing OCR draft finding for ${item.id}: ${expectedFinding}`);
  }
}

console.log(`Fixture check passed: ${manifest.cases.length} cases under ${path.relative(root, sourceDir)}`);
