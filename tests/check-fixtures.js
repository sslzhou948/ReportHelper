const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const realcaseFixtureDir = path.join(__dirname, 'fixtures', 'realtestcase');
const manifestPath = path.join(realcaseFixtureDir, 'manifest.json');
const ocrEvalManifestPath = path.join(realcaseFixtureDir, 'ocr-eval-manifest.json');
const imageInventoryPath = path.join(realcaseFixtureDir, 'image-inventory.json');
const { realcaseOcrDrafts } = require('../miniprogram/data/ocr-fixtures');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

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

function assertGoldenShape(item, golden) {
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
}

function assertFixtureDraftMatches(item, golden) {
  const draft = realcaseOcrDrafts.find((candidate) => candidate.caseId === item.id);
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

function validateImageInventory(file) {
  const inventory = readJson(file);
  const sourceDir = path.resolve(path.dirname(file), inventory.sourceDir);
  assert.ok(fs.existsSync(sourceDir), `missing inventory source dir: ${sourceDir}`);
  assert.ok(Array.isArray(inventory.cases) && inventory.cases.length > 0, 'image inventory must contain cases');
  const allowedCoverage = new Set(['fixture_golden', 'ocr_eval_golden', 'pending_golden']);
  const imageFiles = fs.readdirSync(sourceDir).filter((entry) => fs.statSync(path.join(sourceDir, entry)).isFile()).sort();
  const inventoryFiles = [];
  const availableInventoryFiles = [];
  const unavailableOcrEvalFiles = [];
  const seenIds = new Set();
  const byId = new Map();
  for (const item of inventory.cases) {
    assert.ok(item.id, 'inventory case must have an id');
    assert.ok(item.file, `inventory case must have a file: ${item.id}`);
    assert.ok(!seenIds.has(item.id), `duplicate inventory case id: ${item.id}`);
    seenIds.add(item.id);
    assert.ok(allowedCoverage.has(item.coverage), `invalid inventory coverage for ${item.id}: ${item.coverage}`);
    assert.ok(['laboratory', 'imaging'].includes(item.modality), `invalid inventory modality for ${item.id}: ${item.modality}`);
    assert.ok(item.layout && typeof item.layout === 'string', `inventory case needs a layout label: ${item.id}`);
    const imagePath = path.join(sourceDir, item.file);
    if (fs.existsSync(imagePath)) {
      assert.ok(fs.statSync(imagePath).size > 1024, `inventory image looks too small: ${item.file}`);
      availableInventoryFiles.push(item.file);
    } else {
      assert.strictEqual(item.coverage, 'ocr_eval_golden', `missing checked-in image is only allowed for optional OCR eval cases: ${item.file}`);
      unavailableOcrEvalFiles.push(item.file);
    }
    inventoryFiles.push(item.file);
    byId.set(item.id, item);
  }
  assert.deepStrictEqual([...new Set(availableInventoryFiles)].sort(), imageFiles, 'image inventory must track every checked-in realtestcase image exactly once');
  return {
    byId,
    sourceDir,
    count: inventory.cases.length,
    availableCount: availableInventoryFiles.length,
    unavailableOcrEvalCount: unavailableOcrEvalFiles.length,
    pendingCount: inventory.cases.filter((item) => item.coverage === 'pending_golden').length
  };
}

function validateManifest(file, options = {}) {
  const manifest = readJson(file);
  const sourceDir = path.resolve(path.dirname(file), manifest.sourceDir);
  assert.ok(fs.existsSync(sourceDir), `missing realtestcase dir: ${sourceDir}`);
  assert.ok(Array.isArray(manifest.cases) && manifest.cases.length > 0, `manifest must contain cases: ${path.relative(root, file)}`);
  const seenIds = new Set();
  for (const item of manifest.cases) {
    assert.ok(!seenIds.has(item.id), `duplicate OCR case id: ${item.id}`);
    seenIds.add(item.id);
    const imagePath = path.join(sourceDir, item.file);
    const goldenPath = path.resolve(path.dirname(file), item.expectedGolden);
    if (options.requireImages !== false) {
      assert.ok(fs.existsSync(imagePath), `missing fixture image: ${item.file}`);
      assert.ok(fs.statSync(imagePath).size > 1024, `fixture image looks too small: ${item.file}`);
    } else if (fs.existsSync(imagePath)) {
      assert.ok(fs.statSync(imagePath).size > 1024, `fixture image looks too small: ${item.file}`);
    }
    assert.ok(fs.existsSync(goldenPath), `missing golden json: ${item.expectedGolden}`);
    const golden = readJson(goldenPath);
    assertGoldenShape(item, golden);
    if (options.requireFixtureDraft) {
      assertFixtureDraftMatches(item, golden);
    }
  }
  return {
    count: manifest.cases.length,
    sourceDir
  };
}

const inventory = validateImageInventory(imageInventoryPath);
const primary = validateManifest(manifestPath, { requireFixtureDraft: true });
const ocrEval = validateManifest(ocrEvalManifestPath, { requireImages: false });

for (const item of readJson(manifestPath).cases) {
  const inventoryItem = inventory.byId.get(item.id);
  assert.ok(inventoryItem, `manifest case missing from image inventory: ${item.id}`);
  assert.strictEqual(inventoryItem.file, item.file, `manifest file mismatch in image inventory: ${item.id}`);
  assert.strictEqual(inventoryItem.coverage, 'fixture_golden', `manifest case must be fixture_golden in image inventory: ${item.id}`);
}

for (const item of readJson(ocrEvalManifestPath).cases) {
  const inventoryItem = inventory.byId.get(item.id);
  assert.ok(inventoryItem, `OCR eval case missing from image inventory: ${item.id}`);
  assert.strictEqual(inventoryItem.file, item.file, `OCR eval file mismatch in image inventory: ${item.id}`);
  assert.strictEqual(inventoryItem.coverage, 'ocr_eval_golden', `OCR eval case must be ocr_eval_golden in image inventory: ${item.id}`);
}

console.log(`Fixture check passed: ${primary.count} fixture cases, ${ocrEval.count} OCR eval golden cases, ${inventory.availableCount} checked-in images, ${inventory.unavailableOcrEvalCount} OCR eval images unavailable, ${inventory.pendingCount} pending golden cases under ${path.relative(root, primary.sourceDir)}`);
