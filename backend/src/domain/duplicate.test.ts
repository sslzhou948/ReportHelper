import assert from 'node:assert/strict';
import { compareMetricResults } from './duplicate.js';

const confirmedExisting = [
  {
    metricKey: 'wbc',
    valueType: 'quantitative',
    valueNumeric: 4.3,
    unit: '10^9/L',
    mappingStatus: 'confirmed'
  },
  {
    metricKey: 'manual_pending',
    valueType: 'quantitative',
    valueNumeric: 1,
    unit: 'ng/mL',
    mappingStatus: 'pending'
  }
];

assert.deepEqual(compareMetricResults([
  {
    metricKey: 'wbc',
    valueType: 'quantitative',
    valueNumeric: 4.3,
    unit: '10^9/L',
    mappingStatus: 'pending'
  }
], confirmedExisting), {
  metricOverlapRatio: 0,
  sameResultRatio: 0
});

assert.deepEqual(compareMetricResults([
  {
    metricKey: 'wbc',
    valueType: 'quantitative',
    valueNumeric: 4.3,
    unit: '10^9/L',
    mappingStatus: 'suggested'
  },
  {
    metricKey: 'manual_pending',
    valueType: 'quantitative',
    valueNumeric: 1,
    unit: 'ng/mL',
    mappingStatus: 'pending'
  }
], confirmedExisting), {
  metricOverlapRatio: 1,
  sameResultRatio: 1
});

assert.deepEqual(compareMetricResults([
  {
    metricKey: 'manual_pending',
    valueType: 'quantitative',
    valueNumeric: 1,
    unit: 'ng/mL',
    mappingStatus: 'confirmed'
  }
], confirmedExisting), {
  metricOverlapRatio: 0,
  sameResultRatio: 0
});

console.log('Duplicate detection tests passed');
