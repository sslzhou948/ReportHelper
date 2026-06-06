const REF_RANGE_MODES = [
  { key: 'simple_range', label: '区间' },
  { key: 'upper_bound', label: '上限' },
  { key: 'lower_bound', label: '下限' },
  { key: 'complex_text', label: '复杂文本' },
  { key: 'none', label: '无参考' }
];

const TONE_OPTIONS = [
  { key: 'unknown', label: '待确认' },
  { key: 'ok', label: '正常' },
  { key: 'high', label: '偏高' },
  { key: 'low', label: '偏低' }
];

function toNumberOrNull(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function validMode(mode) {
  return REF_RANGE_MODES.some((item) => item.key === mode) ? mode : '';
}

function validTone(tone) {
  if (['positive', 'abnormal'].includes(tone)) return tone;
  return TONE_OPTIONS.some((item) => item.key === tone) ? tone : 'unknown';
}

function inferRefMode(metric = {}) {
  const explicitMode = validMode(metric.refMode);
  if (explicitMode) return explicitMode;
  const low = toNumberOrNull(metric.refRangeLow);
  const high = toNumberOrNull(metric.refRangeHigh);
  if (low !== null && high !== null) return 'simple_range';
  if (high !== null) return 'upper_bound';
  if (low !== null) return 'lower_bound';
  if (String(metric.refText || '').trim()) return 'complex_text';
  return 'none';
}

function modeState(mode) {
  const key = validMode(mode) || 'simple_range';
  const index = Math.max(0, REF_RANGE_MODES.findIndex((item) => item.key === key));
  return {
    refMode: key,
    refModeIndex: index,
    refModeLabel: REF_RANGE_MODES[index].label
  };
}

function toneState(tone) {
  const key = validTone(tone);
  const index = Math.max(0, TONE_OPTIONS.findIndex((item) => item.key === key));
  return {
    tone: key,
    toneIndex: index,
    toneLabel: TONE_OPTIONS[index].label
  };
}

function hasNumericReference(metric = {}) {
  return toNumberOrNull(metric.refRangeLow) !== null || toNumberOrNull(metric.refRangeHigh) !== null;
}

function formatReference(metric = {}) {
  if (metric.valueType === 'qualitative') return metric.refQualitative || '阴性';
  const mode = inferRefMode(metric);
  const low = toNumberOrNull(metric.refRangeLow);
  const high = toNumberOrNull(metric.refRangeHigh);
  if (mode === 'simple_range' && low !== null && high !== null) return `${low}-${high}`;
  if (mode === 'upper_bound' && high !== null) return `≤${high}`;
  if (mode === 'lower_bound' && low !== null) return `≥${low}`;
  if (String(metric.refText || '').trim()) return String(metric.refText).trim();
  return '--';
}

function normalizeReferenceByMode(metric = {}, mode = inferRefMode(metric)) {
  const nextMode = validMode(mode) || 'none';
  const low = toNumberOrNull(metric.refRangeLow);
  const high = toNumberOrNull(metric.refRangeHigh);
  const refText = String(metric.refText || '').trim();
  if (nextMode === 'simple_range') {
    return {
      ...metric,
      refMode: nextMode,
      refRangeLow: low,
      refRangeHigh: high,
      refText: low !== null && high !== null ? `${low}-${high}` : ''
    };
  }
  if (nextMode === 'upper_bound') {
    return {
      ...metric,
      refMode: nextMode,
      refRangeLow: null,
      refRangeHigh: high,
      refText: high !== null ? `≤${high}` : ''
    };
  }
  if (nextMode === 'lower_bound') {
    return {
      ...metric,
      refMode: nextMode,
      refRangeLow: low,
      refRangeHigh: null,
      refText: low !== null ? `≥${low}` : ''
    };
  }
  if (nextMode === 'complex_text') {
    return {
      ...metric,
      refMode: nextMode,
      refRangeLow: null,
      refRangeHigh: null,
      refText: refText || formatReference(metric)
    };
  }
  return {
    ...metric,
    refMode: nextMode,
    refRangeLow: null,
    refRangeHigh: null,
    refText: ''
  };
}

module.exports = {
  REF_RANGE_MODES,
  TONE_OPTIONS,
  formatReference,
  hasNumericReference,
  inferRefMode,
  modeState,
  normalizeReferenceByMode,
  toNumberOrNull,
  toneState,
  validTone
};
