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

function calculateTone(value, refLow, refHigh, valueType) {
  if (valueType === 'qualitative') {
    return value === '阳性' || value === '+' || value === '++' || value === '+++' ? 'positive' : 'ok';
  }
  if (typeof value !== 'number') return 'ok';
  if (typeof refLow === 'number' && value < refLow) return 'low';
  if (typeof refHigh === 'number' && value > refHigh) return 'high';
  return 'ok';
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
