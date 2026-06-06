function getReferenceSpan(values) {
  const refs = values
    .map((item) => {
      if (typeof item.refRangeLow === 'number' && typeof item.refRangeHigh === 'number') {
        return Math.abs(item.refRangeHigh - item.refRangeLow);
      }
      return null;
    })
    .filter((value) => value && value > 0);
  return refs[0] || 1;
}

const { validTone } = require('./reference-range');

function isNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function calculateTone(value, refLow, refHigh, valueType, fallbackTone = '') {
  if (valueType === 'qualitative') {
    return value === '阳性' || value === '+' || value === '++' || value === '+++' ? 'positive' : 'ok';
  }
  if (!isNumber(value)) return 'unknown';
  const hasLow = isNumber(refLow);
  const hasHigh = isNumber(refHigh);
  if (hasLow && value < refLow) return 'low';
  if (hasHigh && value > refHigh) return 'high';
  if (hasLow || hasHigh) return 'ok';
  return validTone(fallbackTone);
}

function calculateTrend(values) {
  const numeric = values
    .filter((item) => item.valueType !== 'qualitative' && typeof item.valueNumeric === 'number')
    .sort((a, b) => new Date(a.reportDate) - new Date(b.reportDate));

  if (numeric.length === 0) {
    return { direction: 'none', label: '无趋势' };
  }
  if (numeric.length === 1) {
    return { direction: 'new', label: '首次记录' };
  }

  const recent = numeric.slice(-3);
  const first = recent[0].valueNumeric;
  const last = recent[recent.length - 1].valueNumeric;
  const span = getReferenceSpan(recent);
  const delta = ((last - first) / span) * 100;
  const abs = Math.abs(delta);

  if (abs <= 5) return { direction: 'flat', label: '平稳' };
  if (delta > 15) return { direction: 'up', label: '持续上升' };
  if (delta > 5) return { direction: 'up', label: '略上升' };
  if (delta < -15) return { direction: 'down', label: '持续下降' };
  return { direction: 'down', label: '略下降' };
}

module.exports = {
  calculateTone,
  calculateTrend
};
