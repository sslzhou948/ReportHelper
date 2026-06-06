import assert from 'node:assert/strict';
import { normalizeMetricCategory } from './metric-category.js';

assert.deepEqual(
  normalizeMetricCategory({
    metricKey: 'wbc',
    metricName: 'WBC',
    category: 'hematology',
    categoryCn: '\u8840\u6db2\u7ec6\u80de'
  }),
  { category: 'blood_routine', categoryCn: '\u8840\u5e38\u89c4' }
);

assert.deepEqual(
  normalizeMetricCategory({
    metricKey: 'rbc',
    metricName: '\u7ea2\u7ec6\u80de',
    category: 'blood_cell_test_report',
    categoryCn: '\u5168\u8840\u68c0\u67e5'
  }),
  { category: 'blood_routine', categoryCn: '\u8840\u5e38\u89c4' }
);

assert.deepEqual(
  normalizeMetricCategory({
    metricKey: 'triglyceride',
    metricName: 'TG',
    category: 'biochemistry',
    categoryCn: '\u751f\u5316'
  }),
  { category: 'blood_lipid', categoryCn: '\u8840\u8102' }
);

assert.deepEqual(
  normalizeMetricCategory({
    metricKey: 'manual_custom',
    metricName: '\u624b\u52a8\u6307\u6807',
    category: 'custom',
    categoryCn: '\u81ea\u5b9a\u4e49'
  }),
  { category: 'custom', categoryCn: '\u81ea\u5b9a\u4e49' }
);

console.log('Metric category normalization checks passed');
