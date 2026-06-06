import assert from 'node:assert/strict';
import { canonicalMetricKey, normalizeMetricKeyToken, sameCanonicalMetricKey } from './metric-key.js';

assert.equal(canonicalMetricKey({ metricKey: 'WBC' }), 'wbc');
assert.equal(canonicalMetricKey({ metricKey: 'white_blood_cell_count' }), 'wbc');
assert.equal(canonicalMetricKey({ metricKey: 'HDL-C' }), 'hdl_cholesterol');
assert.equal(canonicalMetricKey({ metricKey: 'TG' }), 'triglyceride');
assert.equal(canonicalMetricKey({ metricKey: 'Neu%' }), 'neu_percent');
assert.equal(canonicalMetricKey({ metricKey: 'LYM#' }), 'lym_abs');

assert.equal(
  canonicalMetricKey({ metricKey: 'manual_wbc', category: 'custom', categoryCn: '\u81ea\u5b9a\u4e49' }),
  'manual_wbc'
);
assert.equal(canonicalMetricKey({ metricKey: 'custom_white_blood_cell_count' }), 'custom_white_blood_cell_count');
assert.equal(canonicalMetricKey({ metricKey: '\u767d\u7ec6\u80de', metricName: '\u767d\u7ec6\u80de' }), '\u767d\u7ec6\u80de');
assert.equal(canonicalMetricKey({ metricKey: '' }, { fallback: 'unknown_metric' }), 'unknown_metric');

assert.equal(normalizeMetricKeyToken('P-LCR'), 'p_lcr');
assert.equal(sameCanonicalMetricKey('white_blood_cell_count', 'wbc'), true);
assert.equal(sameCanonicalMetricKey('manual_wbc', 'wbc'), false);

console.log('Metric key normalization checks passed');
