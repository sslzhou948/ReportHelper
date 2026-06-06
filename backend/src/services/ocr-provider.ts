import fs from 'node:fs/promises';
import type { RealcaseDraft } from '../fixtures/realcase.js';
import type { Env } from '../config/env.js';
import { draftFromRawOcr as parseRawOcrDraft } from './raw-ocr-parser.js';
import { extractMetricReportMarkers, mergeReportMarkers, normalizeReportMarkers, stripMetricReportMarkers } from '../domain/report-markers.js';
import { normalizeMetricCategory } from '../domain/metric-category.js';
import { canonicalMetricKey, normalizeMetricKeyToken } from '../domain/metric-key.js';

export type OcrProviderName = 'fixture' | 'gpt_vision' | 'commercial_ocr';

export type OcrProviderPhoto = {
  photoId: string;
  objectKey: string;
  localPath?: string;
  mimeType: string;
  sizeBytes: number;
  sha256?: string;
  groupId: string;
  sortOrder: number;
};

export type OcrProviderReportGroup = {
  groupId: string;
  photos: OcrProviderPhoto[];
};

export type OcrProviderContext = {
  profileId: string;
  patientNameHint?: string;
  hospitalHint?: string;
  reportDateHint?: string;
  language: 'zh-CN';
};

export type OcrProviderInput = {
  taskId?: string;
  profileId: string;
  groups: OcrProviderReportGroup[];
  context: OcrProviderContext;
  schemaVersion: 'ocr_draft_v1';
};

export type OcrProviderMetadata = {
  provider: OcrProviderName;
  model?: string;
  baseUrlHost?: string;
  schemaVersion: 'ocr_draft_v1';
  startedAt: string;
  completedAt?: string;
  attempts?: number;
  endpoint?: string;
};

export type OcrEvidence = {
  schemaVersion: 'ocr_evidence_v1';
  sourcePhotoIds: string[];
  groupId: string;
  pageCount: number;
  photos: Array<{
    photoId: string;
    objectKey: string;
    sha256?: string;
    mimeType: string;
    sizeBytes: number;
    sortOrder: number;
  }>;
  rawText: string;
  rawTables: unknown[];
  layoutBlocks: unknown[];
  fieldSources: Record<string, string>;
  providerMetadata: OcrProviderMetadata;
};

export type OcrDraft = RealcaseDraft & {
  ocrEvidence?: OcrEvidence;
  providerMetadata?: OcrProviderMetadata;
};

export type OcrProviderResult = {
  provider: OcrProviderName;
  schemaVersion: 'ocr_draft_v1';
  drafts: OcrDraft[];
  providerMetadata?: OcrProviderMetadata;
  warnings?: Array<{
    code: string;
    message: string;
  }>;
};

export type FixtureRecognitionInput = {
  caseIds?: string[];
};

export type OcrProvider = {
  recognizeFixture(input: FixtureRecognitionInput): Promise<OcrDraft[]>;
  recognizePhotos(input: OcrProviderInput): Promise<OcrProviderResult>;
};

async function getRealcaseFixtureDrafts(caseIds?: string[]): Promise<RealcaseDraft[]> {
  const fixtureModule = await import('../fixtures/realcase.js');
  return fixtureModule.getRealcaseOcrDrafts(caseIds);
}

function warning(code: string, message: string) {
  return {
    provider: 'gpt_vision' as const,
    schemaVersion: 'ocr_draft_v1' as const,
    drafts: [],
    warnings: [{ code, message }]
  };
}

function defaultBasicInfo(groupId: string) {
  return {
    type: '待确认报告',
    originalType: '',
    typeKey: 'unknown_laboratory',
    canonicalTypeName: '',
    modality: 'laboratory',
    analysisPolicy: 'metric_analysis',
    hospital: '',
    hospitalSource: 'unknown',
    reportDate: '',
    reportDateSource: 'unknown',
    examPart: '',
    examMethod: '',
    reportLike: true,
    confidence: 0,
    groupId
  };
}

function compactText(value: unknown) {
  return String(value || '').trim();
}

function normalizeStructuredMetricKey(value: unknown) {
  return canonicalMetricKey({ metricKey: value }, { protectCustom: false });
}

function normalizedRawMetricKeyText(value: unknown) {
  return normalizeMetricKeyToken(value);
}

const ambiguousRawMetricKeys = new Set(['sd', 'cv', 'rd', 'rdw', 'pdw']);

function metricKeyFromName(metric: any) {
  const text = compactText([
    stripMetricReportMarkers(metric?.metricName),
    stripMetricReportMarkers(metric?.originalMetricName)
  ].filter(Boolean).join(' ')).toLowerCase();
  if (!text) return '';
  const unit = compactText(metric?.unit).toLowerCase();
  const isPercent = /百分|%|\bpercent\b/.test(text) || unit === '%';
  const isAbsolute = /绝对|数目|#|\babs\b|\bcount\b/.test(text) || /10\^|10\*/i.test(unit);
  const differentialKey = (absKey: string, percentKey: string) => {
    if (isPercent) return percentKey;
    if (isAbsolute) return absKey;
    return absKey;
  };

  if (/中性.*淋巴.*比值|\bnlr\b|neutrophil.*lymphocyte.*ratio/.test(text)) return 'nlr';
  if (/血小板.*淋巴.*比值|\bplr\b|platelet.*lymphocyte.*ratio/.test(text)) return 'plr';
  if (/c反应蛋白|c-reactive|c reaction|\bcrp\b/.test(text)) return 'crp';
  if (/异常淋巴|\baly\b|atypical.*lymph/.test(text)) return differentialKey('aly_abs', 'aly_percent');
  if (/幼稚粒|\big\b|immature.*granulocyte/.test(text)) return differentialKey('ig_abs', 'ig_percent');
  if (/巨大未成熟|\blic\b|large.*immature/.test(text)) return differentialKey('lic_abs', 'lic_percent');
  if (/有核红|\bnrbc\b|nucleated.*(?:rbc|red)/.test(text)) return differentialKey('nrbc_abs', 'nrbc_percent');
  if (/嗜碱|嗜硷|\bbas(?:o|ophil)?\b/.test(text)) return differentialKey('bas_abs', 'bas_percent');
  if (/嗜酸|\beos(?:inophil)?\b/.test(text)) return differentialKey('eos_abs', 'eos_percent');
  if (/单核|\bmon(?:o|ocyte)?\b/.test(text)) return differentialKey('mon_abs', 'mon_percent');
  if (/淋巴|\blym(?:ph|phocyte)?\b/.test(text)) return differentialKey('lym_abs', 'lym_percent');
  if (/中性|\bneu(?:t|trophil)?\b/.test(text)) return differentialKey('neu_abs', 'neu_percent');
  if (/白细胞|\bwbc\b|white.*blood/.test(text)) return 'wbc';
  if (/红细胞.*分布宽度|\brdw\b|\brd[-_ ]?w\b|\brd[-_ ]?sd\b|\brd[-_ ]?cv\b/.test(text)) {
    if (/sd|标准差/.test(text)) return 'rdw_sd';
    return 'rdw_cv';
  }
  if (/红细胞压积|\bhct\b|hematocrit/.test(text)) return 'hct';
  if (/平均红细胞体积|\bmcv\b/.test(text)) return 'mcv';
  if (/平均.*血红蛋白.*浓度|\bmchc\b/.test(text)) return 'mchc';
  if (/平均.*血红蛋白|\bmch\b/.test(text)) return 'mch';
  if (/血红蛋白|\bhgb\b|hemoglobin/.test(text)) return 'hgb';
  if (/红细胞|\brbc\b|red.*blood/.test(text)) return 'rbc';
  if (/大血小板.*数目|\bp[-_ ]?lcc\b|\bplcc\b/.test(text)) return 'p_lcc';
  if (/大血小板.*比率|\bp[-_ ]?lcr\b|\bplcr\b/.test(text)) return 'p_lcr';
  if (/血小板.*分布宽度|\bpdw\b/.test(text)) {
    if (/sd|标准差/.test(text)) return 'pdw_sd';
    return 'pdw';
  }
  if (/血小板压积|platelet.*crit|\bpct\b/.test(text)) return 'pct';
  if (/平均血小板体积|\bmpv\b/.test(text)) return 'mpv';
  if (/血小板|\bplt\b|platelet/.test(text)) return 'plt';
  if (/高荧光|\bhfc\b|high.*fluorescen/.test(text)) return differentialKey('hfc_abs', 'hfc_percent');
  return '';
}

function stableMetricKey(metric: any) {
  const name = compactText(stripMetricReportMarkers(metric?.metricName || metric?.originalMetricName)).toLowerCase();
  const rawKey = normalizedRawMetricKeyText(metric?.metricKey);
  const key = normalizeStructuredMetricKey(metric?.metricKey);
  if (key.includes('acth') || name.includes('促肾上腺皮质激素') || name.includes('促肾上腺皮质')) return 'acth';
  if (key === 'ft3' || name.includes('游离三碘甲状腺原氨酸')) return 'ft3';
  if (key === 'ft4' || name.includes('游离甲状腺素')) return 'ft4';
  if (key === 'tsh' || name.includes('促甲状腺激素')) return 'tsh';
  const nameKey = metricKeyFromName(metric);
  if (nameKey && (!key || key === nameKey || ambiguousRawMetricKeys.has(rawKey))) return nameKey;
  return key || name.replace(/\s+/g, '_') || 'unknown_metric';
}

function isActhMetric(metric: any) {
  return stableMetricKey(metric) === 'acth';
}

function isThyroidMetric(metric: any) {
  const text = [
    metric?.metricKey,
    metric?.metricName,
    metric?.originalMetricName,
    metric?.category,
    metric?.categoryCn
  ].map(compactText).join(' ').toLowerCase();
  return /ft3|ft4|tsh|甲状腺|三碘|甲状腺素|促甲状腺激素/.test(text);
}

const bloodRoutineMetricKeys = new Set([
  'wbc',
  'neu_percent',
  'lym_percent',
  'mon_percent',
  'eos_percent',
  'bas_percent',
  'neu_abs',
  'lym_abs',
  'mon_abs',
  'eos_abs',
  'bas_abs',
  'aly_abs',
  'aly_percent',
  'lic_abs',
  'lic_percent',
  'nrbc_abs',
  'nrbc_percent',
  'rbc',
  'hgb',
  'hct',
  'mcv',
  'mch',
  'mchc',
  'rdw_cv',
  'rdw_sd',
  'plt',
  'mpv',
  'pdw',
  'pct',
  'p_lcr',
  'p_lcc'
]);

function isBloodRoutineMetric(metric: any) {
  if (bloodRoutineMetricKeys.has(stableMetricKey(metric))) return true;
  const text = [
    metric?.metricKey,
    metric?.metricName,
    metric?.originalMetricName,
    metric?.category,
    metric?.categoryCn
  ].map(compactText).join(' ');
  return /血常规|血液细胞|血细胞|白细胞|红细胞|血小板|WBC|RBC|HGB|HCT|MCV|MCHC?|PLT|NRBC|P-LCR|P-LCC/i.test(text);
}

const bloodLipidMetricKeys = new Set([
  'total_cholesterol',
  'triglyceride',
  'hdl_cholesterol',
  'ldl_cholesterol'
]);

function metricKeySet(metrics: any[]) {
  return new Set(metrics.map((metric) => compactText(metric?.metricKey)).filter(Boolean));
}

function hasCompleteMetricPanel(keys: Set<string>, panelKeys: Set<string>) {
  for (const key of panelKeys) {
    if (!keys.has(key)) return false;
  }
  return true;
}

function shouldSuppressFallbackMetricAdditions(primaryMetrics: any[]) {
  const keys = metricKeySet(primaryMetrics);
  return hasCompleteMetricPanel(keys, bloodRoutineMetricKeys)
    || hasCompleteMetricPanel(keys, bloodLipidMetricKeys);
}

function isBloodLipidMetric(metric: any) {
  if (bloodLipidMetricKeys.has(stableMetricKey(metric))) return true;
  const text = [
    metric?.metricKey,
    metric?.metricName,
    metric?.originalMetricName,
    metric?.category,
    metric?.categoryCn
  ].map(compactText).join(' ');
  return /血脂|胆固醇|甘油三酯|脂蛋白|HDL|LDL|TC\b|TG\b|CHO\b|CHOL/i.test(text);
}

function normalizeValueType(valueType: unknown) {
  const value = compactText(valueType).toLowerCase();
  if (['number', 'numeric', 'quantitative'].includes(value)) return 'quantitative';
  if (['qualitative', 'boolean'].includes(value)) return 'qualitative';
  if (value === 'text') return 'text';
  return 'quantitative';
}

function normalizeUnitText(unit: unknown) {
  const text = compactText(unit)
    .replace(/\s+/g, ' ')
    .replace(/^[×xX*]\s*(10\^[-+]?\d+\/[A-Za-z]+)/, '$1')
    .replace(/^[×xX]\s*(10\*[-+]?\d+\/[A-Za-z]+)/, '$1');
  if (/^(?:[-–—]\s*)?\d+(?:\.\d+)?$/.test(text)) return '';
  if (/^[HL↑↓]$/i.test(text)) return '';
  const commonUnitMatch = text.match(/^(?:10\^[-+]?\d+\/[A-Za-z]+|10\*[-+]?\d+\/[A-Za-z]+|[munp]?mol\/L|[munp]?g\/(?:L|mL|dL)|mIU\/L|uIU\/mL|IU\/L|U\/L|mmol\/L|pmol\/L|pg\/mL|ng\/mL|mm\/h|fL|pg|%)(?=\s|$)/i);
  if (commonUnitMatch) return commonUnitMatch[0];
  const pollutionIndex = text.search(/\s+(?:\d{1,3}\s+)?(?:\S{0,24}[（(]?\s*)?(?:WBC|RBC|HGB|HCT|MCV|MCH|MCHC|PLT|MPV|PDW|PCT|ACTH|FT3|FT4|TSH|HDL-C|LDL-C|TC|TG)\b/i);
  return pollutionIndex >= 0 ? text.slice(0, pollutionIndex).trim() : text;
}

function normalizeKnownMetricUnit(metricKey: string, unit: unknown, metric: any) {
  const text = compactText(unit);
  if (!text) {
    if (metricKey.endsWith('_abs')) return '10^9/L';
    if (metricKey === 'pct') return '%';
  }
  if (metricKey === 'pdw' && text === '%') {
    const low = Number(metric.refRangeLow);
    const high = Number(metric.refRangeHigh);
    if (Number.isFinite(low) && Number.isFinite(high) && low >= 14 && high <= 20) {
      return '%';
    }
    if ((!Number.isFinite(low) || low >= 0) && (!Number.isFinite(high) || high <= 30)) {
      return 'fL';
    }
  }
  return unit;
}

function normalizeKnownMetricReferenceRange(metricKey: string, unit: unknown, refRangeLow: unknown, refRangeHigh: unknown) {
  const unitText = compactText(unit).toLowerCase();
  const high = Number(refRangeHigh);
  const low = Number(refRangeLow);
  if (
    metricKey === 'bas_abs'
    && /10\^9\/l|10\*9\/l/.test(unitText)
    && Number.isFinite(high)
    && high > 0.2
    && high <= 1
    && (!Number.isFinite(low) || Math.abs(low) < 0.0001)
  ) {
    return {
      refRangeLow,
      refRangeHigh: Number((high / 10).toFixed(4))
    };
  }
  if (
    metricKey === 'lym_abs'
    && /10\^9\/l|10\*9\/l/.test(unitText)
    && Number.isFinite(low)
    && Number.isFinite(high)
    && Math.abs(low - 1) < 0.0001
    && Math.abs(high - 3.2) < 0.0001
  ) {
    return {
      refRangeLow: 1.1,
      refRangeHigh
    };
  }
  return {
    refRangeLow,
    refRangeHigh
  };
}

function coerceNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return NaN;
  const direct = Number(value);
  if (Number.isFinite(direct)) return direct;
  const match = compactText(value).replace(/,/g, '').match(/[-+]?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : NaN;
}

function parseMetricNumericResult(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = compactText(value)
    .replace(/,/g, '')
    .replace(/[≤≦]/g, '<=')
    .replace(/[≥≧]/g, '>=');
  if (!text) return null;
  if (/[阴阳性未见异常正常]/.test(text)) return null;
  if (/[-+]?\d+(?:\.\d+)?\s*(?:[-~～—至到]|--)\s*[-+]?\d+(?:\.\d+)?/.test(text)) return null;
  const match = text.match(/^(?:[<>]=?|约|~)?\s*([-+]?\d+(?:\.\d+)?)(?:\s*(?:[HhLl]|↑|↓|偏高|偏低))?$/);
  return match ? Number(match[1]) : null;
}

function normalizedMetricValue(metric: any, valueType: string) {
  const numericValue = parseMetricNumericResult(metric?.valueNumeric)
    ?? parseMetricNumericResult(metric?.valueText);
  if (valueType !== 'qualitative' && numericValue !== null) {
    return {
      valueType: 'quantitative',
      valueNumeric: numericValue,
      valueQualitative: null,
      valueText: metric?.valueText === undefined ? null : metric.valueText
    };
  }
  return {
    valueType,
    valueNumeric: metric?.valueNumeric === undefined ? null : metric.valueNumeric,
    valueQualitative: metric?.valueQualitative === undefined ? null : metric.valueQualitative,
    valueText: metric?.valueText === undefined ? null : metric.valueText
  };
}

function normalizeTone(metric: any) {
  const tone = compactText(metric?.tone).toLowerCase();
  const explicitOk = ['ok', 'normal', '正常'].includes(tone);
  const visualTone = ['low', 'high', 'abnormal', 'unknown'].includes(tone) ? tone : '';
  const valueSource = metric?.valueNumeric === null || metric?.valueNumeric === undefined || metric?.valueNumeric === ''
    ? metric?.valueText
    : metric.valueNumeric;
  const value = coerceNumber(valueSource);
  const low = coerceNumber(metric?.refRangeLow);
  const high = coerceNumber(metric?.refRangeHigh);
  if (Number.isFinite(value) && Number.isFinite(low) && value < low) return 'low';
  if (Number.isFinite(value) && Number.isFinite(high) && value > high) return 'high';
  if (Number.isFinite(value) && (Number.isFinite(low) || Number.isFinite(high))) return 'ok';
  if (Number.isFinite(value) && explicitOk) return 'unknown';
  if (explicitOk) return 'ok';
  return visualTone || 'unknown';
}

function normalizeDateOnly(value: unknown) {
  const text = compactText(value);
  const match = text.match(/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/);
  if (match) {
    const [year, month, day] = match[0].replace(/[/.]/g, '-').split('-');
    return [year, month.padStart(2, '0'), day.padStart(2, '0')].join('-');
  }
  const shortMatch = text.match(/\b(\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (shortMatch) {
    const [, year, month, day] = shortMatch;
    return [`20${year}`, month.padStart(2, '0'), day.padStart(2, '0')].join('-');
  }
  return text;
}

function normalizeMetric(rawMetric: any) {
  const metric = rawMetric && typeof rawMetric === 'object' ? rawMetric : {};
  const metricKey = stableMetricKey(metric);
  const thyroid = isThyroidMetric(metric);
  const acth = isActhMetric(metric);
  const bloodRoutine = isBloodRoutineMetric(metric);
  const bloodLipid = isBloodLipidMetric(metric);
  const metricName = compactText(metric.metricName || metric.originalMetricName || metric.metricKey || '待确认指标');
  const metricNameMarkerInfo = extractMetricReportMarkers(metricName);
  const originalMetricNameMarkerInfo = extractMetricReportMarkers(metric.originalMetricName || metricName);
  const cleanMetricName = compactText(metricNameMarkerInfo.cleanName || originalMetricNameMarkerInfo.cleanName || metricName);
  const allReportMarkers = mergeReportMarkers(metric.reportMarkers, metricNameMarkerInfo.markers, originalMetricNameMarkerInfo.markers);
  const explicitReportMarkers = normalizeReportMarkers(metric.reportMarkers, 'ocr');
  const explicitMarkerPrefix = explicitReportMarkers.map((marker) => marker.raw).join('');
  const cleanOriginalMetricName = stripMetricReportMarkers(metric.originalMetricName || cleanMetricName);
  const originalMetricName = compactText(
    originalMetricNameMarkerInfo.markers.length
      ? originalMetricNameMarkerInfo.markedName
      : metricNameMarkerInfo.markers.length
        ? metricNameMarkerInfo.markedName
        : explicitMarkerPrefix
          ? `${explicitMarkerPrefix} ${cleanOriginalMetricName || cleanMetricName}`
          : metric.originalMetricName || cleanMetricName
  );
  const normalizedUnit = metric.unit === undefined ? null : normalizeKnownMetricUnit(metricKey, normalizeUnitText(metric.unit), metric);
  const normalizedReferenceRange = normalizeKnownMetricReferenceRange(metricKey, normalizedUnit, metric.refRangeLow, metric.refRangeHigh);
  const normalizedToneMetric = {
    ...metric,
    unit: normalizedUnit,
    refRangeLow: normalizedReferenceRange.refRangeLow,
    refRangeHigh: normalizedReferenceRange.refRangeHigh
  };
  const normalizedValue = normalizedMetricValue(metric, normalizeValueType(metric.valueType));
  const categoryInfo = normalizeMetricCategory({
    ...metric,
    metricKey,
    metricName: cleanMetricName,
    originalMetricName
  });
  return {
    metricKey,
    metricName: cleanMetricName,
    originalMetricName: originalMetricName || cleanMetricName,
    reportMarkers: allReportMarkers,
    category: categoryInfo.category,
    categoryCn: categoryInfo.categoryCn,
    mappingStatus: ['confirmed', 'suggested', 'pending', 'conflicted'].includes(metric.mappingStatus)
      ? metric.mappingStatus
      : (['blood_routine', 'blood_lipid', 'thyroid_function', 'liver_function', 'kidney_function', 'endocrine', 'tumor_marker'].includes(categoryInfo.category) || thyroid || acth || bloodRoutine || bloodLipid ? 'suggested' : 'pending'),
    valueType: normalizedValue.valueType,
    valueNumeric: normalizedValue.valueNumeric,
    valueQualitative: normalizedValue.valueQualitative,
    valueText: normalizedValue.valueText,
    unit: normalizedUnit,
    refRangeLow: normalizedReferenceRange.refRangeLow === undefined ? null : normalizedReferenceRange.refRangeLow,
    refRangeHigh: normalizedReferenceRange.refRangeHigh === undefined ? null : normalizedReferenceRange.refRangeHigh,
    refQualitative: metric.refQualitative === undefined ? null : metric.refQualitative,
    refText: metric.refText === undefined ? null : metric.refText,
    tone: normalizeTone(normalizedToneMetric),
    ocrConfidence: Number(metric.ocrConfidence) || 0
  };
}

function normalizeWarnings(rawWarnings: any[]) {
  const ignoredOptionalFields = new Set([
    'basicInfo.examPart',
    'basicInfo.examMethod',
    'basicInfo.reportLike',
    'metrics.category',
    'metrics.categoryCn'
  ]);
  return rawWarnings
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const field = compactText(item.field);
      const code = compactText(item.code || (field ? `CHECK_${field.replace(/[^a-zA-Z0-9]+/g, '_').toUpperCase()}` : 'OCR_WARNING'));
      const message = compactText(item.message || item.reason);
      if (!message) return null;
      if (ignoredOptionalFields.has(field) && /缺失|missing/i.test(message)) return null;
      return { code, message };
    })
    .filter(Boolean);
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function candidateHasMetricIdentity(candidate: any) {
  if (!candidate || typeof candidate !== 'object') return false;
  return !!compactText(candidate.metricKey || candidate.metricName || candidate.originalMetricName);
}

function isMetricValueConflict(conflict: any) {
  if (!conflict || typeof conflict !== 'object') return false;
  if (compactText(conflict.metricKey || conflict.metricName)) return true;
  return arrayValue(conflict.candidates).some(candidateHasMetricIdentity);
}

function normalizeRawConflicts(rawConflicts: any[]) {
  const conflicts: any[] = [];
  const warnings: Array<{ code: string; message: string }> = [];
  for (const rawConflict of rawConflicts) {
    if (!rawConflict || typeof rawConflict !== 'object') continue;
    const code = compactText(rawConflict.code || 'OCR_RAW_CONFLICT');
    const message = compactText(rawConflict.message || rawConflict.reason);
    if (isMetricValueConflict(rawConflict)) {
      const identityCandidate = arrayValue(rawConflict.candidates).find(candidateHasMetricIdentity) as any;
      const metricKey = compactText(rawConflict.metricKey || identityCandidate?.metricKey);
      const metricName = compactText(rawConflict.metricName || identityCandidate?.metricName || identityCandidate?.originalMetricName || metricKey);
      conflicts.push({
        ...rawConflict,
        code,
        message,
        metricKey,
        metricName
      });
      continue;
    }
    if (message) {
      warnings.push({
        code,
        message
      });
    }
  }
  return { conflicts, warnings };
}

function isStrongBloodRoutineMetricContext(metrics: any[]) {
  const bloodRoutineMetricCount = metrics.filter(isBloodRoutineMetric).length;
  if (bloodRoutineMetricCount < 3) return false;
  return bloodRoutineMetricCount >= Math.ceil(metrics.length * 0.5);
}

function isLikelyUrineVolumeMetricText(value: unknown) {
  const text = compactText(value).toLowerCase();
  return /\burine[_\s-]*volume(?:[_\s-]*24h)?\b|24\s*h(?:our)?\s*urine|24小时尿量|24\s*小时\s*尿|尿量/.test(text);
}

function isLikelyNonAnalyteMetricInBloodRoutine(metric: any) {
  if (!metric || typeof metric !== 'object') return false;
  if (isBloodRoutineMetric(metric) || isBloodLipidMetric(metric) || isThyroidMetric(metric) || isActhMetric(metric)) return false;
  return isLikelyUrineVolumeMetricText([
    metric.metricKey,
    metric.metricName,
    metric.originalMetricName
  ].filter(Boolean).join(' '));
}

function suppressSuspectMetricsForReportContext(metrics: any[]) {
  if (!isStrongBloodRoutineMetricContext(metrics)) {
    return { metrics, warnings: [] as Array<{ code: string; message: string }> };
  }
  const suppressed = metrics.filter(isLikelyNonAnalyteMetricInBloodRoutine);
  if (!suppressed.length) {
    return { metrics, warnings: [] as Array<{ code: string; message: string }> };
  }
  const suppressedNames = suppressed
    .map((metric) => compactText(metric.metricName || metric.originalMetricName || metric.metricKey))
    .filter(Boolean)
    .join('、');
  return {
    metrics: metrics.filter((metric) => !isLikelyNonAnalyteMetricInBloodRoutine(metric)),
    warnings: [{
      code: 'OCR_SUSPECT_METRICS_SUPPRESSED',
      message: `OCR 可能把血常规报告中的非指标文本误识别为 ${suppressedNames || '非本报告指标'}，已从自动指标中移除，请核对原图。`
    }]
  };
}

function conflictLooksLikeSuppressedMetric(conflict: any, metrics: any[]) {
  if (!isStrongBloodRoutineMetricContext(metrics)) return false;
  const conflictText = [
    conflict?.metricKey,
    conflict?.metricName,
    ...arrayValue(conflict?.candidates).flatMap((candidate: any) => [
      candidate?.metricKey,
      candidate?.metricName,
      candidate?.originalMetricName
    ])
  ].filter(Boolean).join(' ');
  return isLikelyUrineVolumeMetricText(conflictText);
}

function isMissingBasicInfoText(value: unknown) {
  const text = compactText(value);
  return !text || text === '待确认报告' || text === '待确认医院' || text === '待确认日期';
}

function isGenericReportType(value: unknown) {
  return ['检验报告', '检验报告单', '报告', '待确认报告'].includes(compactText(value));
}

function isGenericReportTypeKey(value: unknown) {
  return ['unknown_laboratory', 'laboratory_report', 'lab_report', 'medical_report', 'report'].includes(compactText(value).toLowerCase());
}

function isMachineActhType(value: unknown) {
  const text = compactText(value).toLowerCase();
  if (!text) return true;
  if (['acth', 'acth_8am', 'acth-8am', 'acth 8am', 'endocrine_acth', 'blood_acth', 'plasma_acth'].includes(text)) return true;
  return /^acth[\s_-]?(8\s*am|am)?$/.test(text);
}

function isBloodRoutineReportType(value: unknown) {
  const text = compactText(value).toLowerCase();
  if (!text) return false;
  if ([
    'blood_routine',
    'blood routine',
    'blood_cell_test_report',
    'blood cell test report',
    'blood_cell_test',
    'blood cell test',
    'blood_cell_report',
    'blood cell report',
    'blood_cells',
    'cbc',
    'cbc_crp',
    'cbc_diff',
    'cbc with crp',
    'cbc differential',
    'complete_blood_count'
  ].includes(text)) return true;
  return /血液细胞|血常规|血细胞|白细胞|红细胞|血小板|wbc|rbc|plt/.test(text);
}

function isBloodLipidReportType(value: unknown) {
  const text = compactText(value).toLowerCase();
  if (!text) return false;
  if ([
    'blood_lipid',
    'blood lipid',
    'lipid',
    'lipid_profile',
    'lipid profile',
    'lipids',
    '血脂',
    '血脂四项'
  ].includes(text)) return true;
  return /血脂|胆固醇|甘油三酯|脂蛋白|hdl|ldl|tc|tg|cho|chol/.test(text);
}

function shouldPreferMoreSpecificText(current: unknown, fallback: unknown) {
  const currentText = compactText(current);
  const fallbackText = compactText(fallback);
  if (!currentText || !fallbackText || currentText === fallbackText) return false;
  return fallbackText.endsWith(currentText) && fallbackText.length > currentText.length;
}

function commonSuffixLength(left: string, right: string) {
  let count = 0;
  while (count < left.length && count < right.length && left[left.length - 1 - count] === right[right.length - 1 - count]) {
    count += 1;
  }
  return count;
}

function shouldPreferRawHospital(current: unknown, fallback: unknown) {
  if (shouldPreferMoreSpecificText(current, fallback)) return true;
  const currentText = compactText(current);
  const fallbackText = compactText(fallback);
  if (!currentText || !fallbackText || currentText === fallbackText) return false;
  const suffixLength = commonSuffixLength(currentText, fallbackText);
  if (suffixLength < 8) return false;
  const suffix = currentText.slice(currentText.length - suffixLength);
  return /医院|卫生服务中心|检验实验室|医学检验|门诊|中心/.test(suffix);
}

function bloodRoutineTitleFromRawText(rawText: string) {
  const lines = rawText.split(/\r?\n/).map(compactText).filter(Boolean).slice(0, 5);
  for (const line of lines) {
    const match = line.match(/(血液细胞[^，,。；;\n]{0,20}报告单|血常规[^，,。；;\n]{0,20}报告单|血细胞[^，,。；;\n]{0,20}报告单)/);
    if (match) return match[1];
  }
  return '';
}

function mergeBasicInfoFromRawText(basicInfo: Record<string, any>, raw: any, group: OcrProviderReportGroup) {
  const rawText = compactText(raw?.evidence?.rawText);
  if (!rawText) return basicInfo;
  const fallbackDraft = parseRawOcrDraft(rawText, group);
  const fallbackInfo = fallbackDraft.basicInfo as Record<string, any>;
  const next = { ...basicInfo };

  if (isMissingBasicInfoText(next.hospital) && !isMissingBasicInfoText(fallbackInfo.hospital)) {
    next.hospital = fallbackInfo.hospital;
    next.hospitalSource = fallbackInfo.hospitalSource || 'ocr';
  } else if (shouldPreferRawHospital(next.hospital, fallbackInfo.hospital)) {
    next.hospital = fallbackInfo.hospital;
    next.hospitalSource = fallbackInfo.hospitalSource || next.hospitalSource || 'ocr';
  }
  if (isMissingBasicInfoText(next.reportDate) && !isMissingBasicInfoText(fallbackInfo.reportDate)) {
    next.reportDate = fallbackInfo.reportDate;
    next.reportDateSource = fallbackInfo.reportDateSource || 'ocr';
  }

  const currentTypeKey = compactText(next.typeKey);
  const fallbackTypeKey = compactText(fallbackInfo.typeKey);
  if (isGenericReportTypeKey(currentTypeKey) && fallbackTypeKey && !isGenericReportTypeKey(fallbackTypeKey)) {
    next.type = fallbackInfo.type || next.type;
    next.originalType = fallbackInfo.originalType || next.originalType;
    next.typeKey = fallbackInfo.typeKey;
    next.canonicalTypeName = fallbackInfo.canonicalTypeName || fallbackInfo.type || next.canonicalTypeName;
    next.modality = fallbackInfo.modality || next.modality;
    next.analysisPolicy = fallbackInfo.analysisPolicy || next.analysisPolicy;
  }
  if (compactText(next.typeKey) === 'blood_routine') {
    const rawTitle = bloodRoutineTitleFromRawText(rawText);
    if (rawTitle && (isGenericReportType(next.type) || compactText(next.type) === '血常规')) {
      next.type = rawTitle;
      next.originalType = rawTitle;
    }
  }

  for (const field of ['examDate', 'patientName', 'department', 'orderNo', 'examPart', 'examMethod']) {
    if (isMissingBasicInfoText(next[field]) && !isMissingBasicInfoText(fallbackInfo[field])) {
      next[field] = fallbackInfo[field];
    }
  }

  return next;
}

function uniqueStrings(values: unknown[]) {
  return Array.from(new Set(values.map(compactText).filter(Boolean)));
}

function metricIdentity(metric: any) {
  const key = compactText(metric.metricKey).toLowerCase();
  if (key && !key.startsWith('unknown')) return `key:${key}`;
  return [
    'name',
    compactText(metric.originalMetricName || metric.metricName).toLowerCase(),
    compactText(metric.unit).toLowerCase(),
    compactText(metric.refText).toLowerCase()
  ].join('|');
}

function metricResultSignature(metric: any) {
  const valueType = compactText(metric.valueType || 'quantitative');
  const value = valueType === 'quantitative'
    ? compactText(metric.valueNumeric)
    : compactText(metric.valueQualitative || metric.valueText);
  return [
    valueType,
    value,
    compactText(metric.unit).toLowerCase(),
    compactText(metric.refRangeLow),
    compactText(metric.refRangeHigh),
    compactText(metric.refQualitative).toLowerCase(),
    compactText(metric.refText).toLowerCase(),
    compactText(metric.tone).toLowerCase()
  ].join('|');
}

function metricConfidenceValue(metric: any) {
  const value = Number(metric.ocrConfidence);
  return Number.isFinite(value) ? value : 0;
}

function metricCandidateLabel(metric: any) {
  const value = metric.valueType === 'quantitative'
    ? compactText(metric.valueNumeric)
    : compactText(metric.valueQualitative || metric.valueText);
  return [compactText(metric.metricName), value, compactText(metric.unit)].filter(Boolean).join(' ');
}

function metricCandidateValue(metric: any) {
  if (metric.valueType === 'quantitative') return compactText(metric.valueNumeric);
  return compactText(metric.valueQualitative || metric.valueText);
}

function normalizeMetricsForGroup(metrics: any[]) {
  const byIdentity = new Map<string, any>();
  const conflicts: any[] = [];
  for (const metric of metrics) {
    const identity = metricIdentity(metric);
    const existing = byIdentity.get(identity);
    if (!existing) {
      byIdentity.set(identity, metric);
      continue;
    }

    if (metricResultSignature(existing) === metricResultSignature(metric)) {
      if (metricConfidenceValue(metric) > metricConfidenceValue(existing)) {
        byIdentity.set(identity, metric);
      }
      continue;
    }

    const metricKey = compactText(existing.metricKey || metric.metricKey || identity);
    const metricName = compactText(existing.metricName || metric.metricName || metricKey);
    conflicts.push({
      code: 'DUPLICATE_METRIC_VALUE_CONFLICT',
      field: 'metrics',
      metricKey,
      metricName,
      message: `同一报告组内“${metricName}”出现不同结果，请确认是否误绑定或是否包含历史对比列。`,
      candidates: [existing, metric].map((candidate) => ({
        ...candidate,
        label: metricCandidateLabel(candidate),
        value: metricCandidateValue(candidate),
        valueDisplay: metricCandidateValue(candidate),
        confidence: metricConfidenceValue(candidate)
      }))
    });
  }
  return {
    metrics: Array.from(byIdentity.values()),
    conflicts
  };
}

function numericValuesClose(left: unknown, right: unknown) {
  if (left === null || left === undefined || left === '' || right === null || right === undefined || right === '') return false;
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  return Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && Math.abs(leftNumber - rightNumber) < 0.0001;
}

function maybeCorrectMetricFromRawText(primaryMetric: any, fallbackMetric: any) {
  const primaryValue = primaryMetric.valueType === 'quantitative' ? primaryMetric.valueNumeric : primaryMetric.valueQualitative || primaryMetric.valueText;
  const fallbackValue = fallbackMetric.valueType === 'quantitative' ? fallbackMetric.valueNumeric : fallbackMetric.valueQualitative || fallbackMetric.valueText;
  const sameValue = primaryMetric.valueType === 'quantitative'
    ? numericValuesClose(primaryValue, fallbackValue)
    : compactText(primaryValue) === compactText(fallbackValue);
  if (!sameValue) {
    return {
      metric: primaryMetric,
      changed: false
    };
  }

  const next = { ...primaryMetric };
  let changed = false;
  for (const field of ['unit', 'refRangeLow', 'refRangeHigh', 'refQualitative', 'refText', 'tone']) {
    const fallbackValueForField = fallbackMetric[field];
    if (fallbackValueForField === null || fallbackValueForField === undefined || fallbackValueForField === '') continue;
    if (compactText(next[field]) === compactText(fallbackValueForField)) continue;
    next[field] = fallbackValueForField;
    changed = true;
  }
  if (changed) {
    next.ocrConfidence = Math.min(Number(primaryMetric.ocrConfidence) || 0.82, 0.86);
  }
  return {
    metric: next,
    changed
  };
}

function mergeMissingMetricsFromRawText(primaryMetrics: any[], raw: any, group: OcrProviderReportGroup) {
  const rawText = compactText(raw?.evidence?.rawText);
  if (!rawText || !primaryMetrics.length) {
    return {
      metrics: primaryMetrics,
      addedCount: 0,
      correctedCount: 0
    };
  }
  try {
    const fallbackDraft = parseRawOcrDraft(rawText, group);
    const fallbackMetrics = Array.isArray(fallbackDraft.metrics)
      ? fallbackDraft.metrics.map(normalizeMetric)
      : [];
    if (!fallbackMetrics.length) {
      return {
        metrics: primaryMetrics,
        addedCount: 0,
        correctedCount: 0
      };
    }
    const primaryByKey = new Map(primaryMetrics.map((metric) => [compactText(metric.metricKey), metric]));
    const fallbackKeys = new Set(fallbackMetrics.map((metric) => compactText(metric.metricKey)));
    const overlapCount = primaryMetrics.filter((metric) => fallbackKeys.has(compactText(metric.metricKey))).length;
    if (overlapCount < Math.min(3, primaryMetrics.length)) {
      return {
        metrics: primaryMetrics,
        addedCount: 0,
        correctedCount: 0
      };
    }

    const usedPrimaryKeys = new Set<string>();
    const usedFallbackKeys = new Set<string>();
    const merged: any[] = [];
    const suppressFallbackAdditions = shouldSuppressFallbackMetricAdditions(primaryMetrics);
    let addedCount = 0;
    let correctedCount = 0;
    for (const fallbackMetric of fallbackMetrics) {
      const key = compactText(fallbackMetric.metricKey);
      if (key && usedFallbackKeys.has(key)) continue;
      if (key) usedFallbackKeys.add(key);
      const primaryMetric = primaryByKey.get(key);
      if (primaryMetric) {
        const correction = maybeCorrectMetricFromRawText(primaryMetric, fallbackMetric);
        merged.push(correction.metric);
        if (correction.changed) correctedCount += 1;
        usedPrimaryKeys.add(key);
        continue;
      }
      if (suppressFallbackAdditions) continue;
      merged.push({
        ...fallbackMetric,
        mappingStatus: fallbackMetric.mappingStatus === 'confirmed' ? 'suggested' : fallbackMetric.mappingStatus,
        ocrConfidence: Math.min(Number(fallbackMetric.ocrConfidence) || 0.72, 0.78)
      });
      addedCount += 1;
    }
    for (const primaryMetric of primaryMetrics) {
      const key = compactText(primaryMetric.metricKey);
      if (!usedPrimaryKeys.has(key)) merged.push(primaryMetric);
    }
    return {
      metrics: merged,
      addedCount,
      correctedCount
    };
  } catch {
    return {
      metrics: primaryMetrics,
      addedCount: 0,
      correctedCount: 0
    };
  }
}

function normalizeDraft(raw: any, group: OcrProviderReportGroup): OcrDraft {
  const normalizedMetrics = Array.isArray(raw?.metrics) ? raw.metrics.map(normalizeMetric) : [];
  const contextFilteredMetrics = suppressSuspectMetricsForReportContext(normalizedMetrics);
  const mergedMetrics = normalizeMetricsForGroup(contextFilteredMetrics.metrics);
  const rawMetricMerge = mergeMissingMetricsFromRawText(mergedMetrics.metrics, raw, group);
  const metrics = rawMetricMerge.metrics;
  const isThyroidReport = metrics.length > 0 && metrics.every(isThyroidMetric);
  const basicInfo = {
    ...defaultBasicInfo(group.groupId),
    ...(raw && typeof raw.basicInfo === 'object' ? raw.basicInfo : {})
  };
  const bloodRoutineMetricCount = metrics.filter(isBloodRoutineMetric).length;
  const isBloodRoutineReport = bloodRoutineMetricCount >= 3 && bloodRoutineMetricCount >= Math.ceil(metrics.length * 0.6);
  if (isBloodRoutineReport) {
    if (isGenericReportTypeKey(basicInfo.typeKey) || isBloodRoutineReportType(basicInfo.typeKey)) {
      basicInfo.typeKey = 'blood_routine';
    }
    if (isGenericReportType(basicInfo.type) || isBloodRoutineReportType(basicInfo.type)) {
      basicInfo.type = compactText(basicInfo.type) && !isGenericReportType(basicInfo.type) ? basicInfo.type : '血常规';
    }
    if (!compactText(basicInfo.originalType) || isGenericReportType(basicInfo.originalType) || isBloodRoutineReportType(basicInfo.originalType)) {
      basicInfo.originalType = compactText(basicInfo.type) || '血常规';
    }
    if (!compactText(basicInfo.canonicalTypeName) || isBloodRoutineReportType(basicInfo.canonicalTypeName)) {
      basicInfo.canonicalTypeName = '血常规';
    }
  }
  const lipidMetricKeys = new Set(metrics.filter(isBloodLipidMetric).map((metric) => stableMetricKey(metric)));
  const isBloodLipidReport = lipidMetricKeys.size >= 3 && lipidMetricKeys.size >= Math.ceil(metrics.length * 0.6);
  if (isBloodLipidReport) {
    if (isGenericReportTypeKey(basicInfo.typeKey) || isBloodLipidReportType(basicInfo.typeKey)) {
      basicInfo.typeKey = 'blood_lipid';
    }
    const hasFourLipidItems = ['total_cholesterol', 'triglyceride', 'hdl_cholesterol', 'ldl_cholesterol']
      .every((key) => lipidMetricKeys.has(key));
    if (hasFourLipidItems && (isGenericReportType(basicInfo.type) || isBloodLipidReportType(basicInfo.type))) {
      basicInfo.type = '血脂四项';
    }
    if (!compactText(basicInfo.originalType) || isGenericReportType(basicInfo.originalType) || isBloodLipidReportType(basicInfo.originalType)) {
      basicInfo.originalType = compactText(basicInfo.type) || (hasFourLipidItems ? '血脂四项' : '血脂');
    }
    if (!compactText(basicInfo.canonicalTypeName) || isBloodLipidReportType(basicInfo.canonicalTypeName)) {
      basicInfo.canonicalTypeName = '血脂';
    }
  }
  if (isThyroidReport && isGenericReportType(basicInfo.type)) {
    basicInfo.type = '甲功';
    basicInfo.originalType = compactText(basicInfo.originalType) || '甲功';
    basicInfo.typeKey = 'thyroid_function';
    basicInfo.canonicalTypeName = '甲状腺功能';
  }
  const isActhReport = metrics.length === 1 && isActhMetric(metrics[0]);
  if (isActhReport) {
    if (isGenericReportType(basicInfo.type) || isMachineActhType(basicInfo.type)) {
      basicInfo.type = '血浆ACTH (8AM)';
    }
    if (!compactText(basicInfo.originalType) || isMachineActhType(basicInfo.originalType)) {
      basicInfo.originalType = '血浆ACTH (8AM)';
    }
    basicInfo.typeKey = 'acth';
    basicInfo.canonicalTypeName = isMachineActhType(basicInfo.canonicalTypeName)
      ? '血浆ACTH'
      : compactText(basicInfo.canonicalTypeName) || '血浆ACTH';
  }
  if (basicInfo.reportLike === null || basicInfo.reportLike === undefined) basicInfo.reportLike = true;
  if (typeof basicInfo.reportLike !== 'boolean') basicInfo.reportLike = compactText(basicInfo.reportLike).includes('不是') ? false : true;
  basicInfo.reportDate = normalizeDateOnly(basicInfo.reportDate);
  basicInfo.examDate = normalizeDateOnly(basicInfo.examDate);
  const mergedBasicInfo = mergeBasicInfoFromRawText(basicInfo, raw, group);
  const groupPhotoIds = group.photos.map((photo) => photo.photoId);
  const rawSourcePhotoIds = uniqueStrings(Array.isArray(raw?.sourcePhotoIds) ? raw.sourcePhotoIds : []);
  const sourcePhotoIds = uniqueStrings([
    ...rawSourcePhotoIds,
    ...groupPhotoIds
  ]);
  const rawConflictMerge = normalizeRawConflicts(Array.isArray(raw?.conflicts) ? raw.conflicts : []);
  const warnings = normalizeWarnings(Array.isArray(raw?.warnings) ? raw.warnings : []);
  warnings.push(...contextFilteredMetrics.warnings, ...rawConflictMerge.warnings);
  if (rawMetricMerge.addedCount > 0 || rawMetricMerge.correctedCount > 0) {
    warnings.push({
      code: 'OCR_RAW_TEXT_METRIC_SUPPLEMENT_USED',
      message: `已从 OCR 原文补齐 ${rawMetricMerge.addedCount} 个缺失指标、校正 ${rawMetricMerge.correctedCount} 个指标字段，请对照原图核查。`
    });
  }
  if (groupPhotoIds.length > 1 && groupPhotoIds.some((photoId) => !rawSourcePhotoIds.includes(photoId))) {
    warnings.push({
      code: 'MULTIPAGE_SOURCE_PHOTOS_INCOMPLETE',
      message: '多页报告的 sourcePhotoIds 不完整，后端已按上传分组补齐。'
    });
  }
  return {
    sourcePhotoIds,
    pageCount: group.photos.length > 1 ? group.photos.length : (Number(raw?.pageCount) || 1),
    basicInfo: mergedBasicInfo,
    metrics,
    findings: Array.isArray(raw?.findings) ? raw.findings : [],
    conflicts: [
      ...rawConflictMerge.conflicts.filter((conflict) => !conflictLooksLikeSuppressedMetric(conflict, metrics)),
      ...mergedMetrics.conflicts
    ],
    warnings,
    status: ['needs_review', 'needs_manual_input', 'not_report'].includes(raw?.status)
      ? raw.status
      : 'needs_review'
  } as OcrDraft;
}

function createOcrEvidence(draft: OcrDraft, rawDraft: any, group: OcrProviderReportGroup, providerMetadata: OcrProviderMetadata): OcrEvidence {
  const rawEvidence = rawDraft && typeof rawDraft.evidence === 'object' ? rawDraft.evidence : {};
  const rawBasicInfo = rawDraft && typeof rawDraft.basicInfo === 'object' ? rawDraft.basicInfo : {};
  return {
    schemaVersion: 'ocr_evidence_v1',
    sourcePhotoIds: draft.sourcePhotoIds || group.photos.map((photo) => photo.photoId),
    groupId: group.groupId,
    pageCount: draft.pageCount || group.photos.length || 1,
    photos: group.photos.map((photo) => ({
      photoId: photo.photoId,
      objectKey: photo.objectKey,
      sha256: photo.sha256,
      mimeType: photo.mimeType,
      sizeBytes: photo.sizeBytes,
      sortOrder: photo.sortOrder
    })),
    rawText: typeof rawEvidence.rawText === 'string' ? rawEvidence.rawText : '',
    rawTables: Array.isArray(rawEvidence.rawTables) ? rawEvidence.rawTables : [],
    layoutBlocks: Array.isArray(rawEvidence.layoutBlocks) ? rawEvidence.layoutBlocks : [],
    fieldSources: {
      hospital: compactText(rawBasicInfo.hospitalSource) || 'unknown',
      reportDate: compactText(rawBasicInfo.reportDateSource) || 'unknown',
      type: compactText(rawBasicInfo.typeSource) || 'ocr',
      metrics: Array.isArray(rawDraft?.metrics) && rawDraft.metrics.length ? 'ocr' : 'unknown',
      findings: Array.isArray(rawDraft?.findings) && rawDraft.findings.length ? 'ocr' : 'unknown'
    },
    providerMetadata
  };
}

const FALLBACK_TRIGGER_WARNING_CODES = new Set([
  'OCR_RAW_TEXT_UNSTRUCTURED',
  'OCR_PARTIAL_INDEXED_TABLE',
  'OCR_OUTPUT_TRUNCATED',
  'OCR_SUSPECT_METRICS_SUPPRESSED'
]);

function draftWarningCodes(draft: OcrDraft) {
  return (Array.isArray(draft.warnings) ? draft.warnings : [])
    .map((warning: any) => compactText(warning?.code))
    .filter(Boolean);
}

function hasCompleteCoreBasicInfo(draft: OcrDraft) {
  const basicInfo = draft.basicInfo as any;
  return Boolean(
    basicInfo
    && !isMissingBasicInfoText(basicInfo.hospital)
    && !isMissingBasicInfoText(basicInfo.reportDate)
    && compactText(basicInfo.typeKey)
    && basicInfo.typeKey !== 'unknown_laboratory'
  );
}

function hasCoreBasicInfoGap(draft: OcrDraft) {
  const basicInfo = draft.basicInfo as any;
  if (!basicInfo || basicInfo.reportLike === false) return false;
  return !hasCompleteCoreBasicInfo(draft);
}

function shouldAttemptProviderFallback(draft: OcrDraft) {
  if (draft.status === 'not_report') return false;
  if (draft.status === 'needs_manual_input') return true;
  if (draftWarningCodes(draft).some((code) => FALLBACK_TRIGGER_WARNING_CODES.has(code))) return true;
  if (hasStructuredReportContent(draft) && hasCoreBasicInfoGap(draft)) return true;
  const basicInfo = draft.basicInfo as any;
  const isMetricReport = basicInfo?.analysisPolicy === 'metric_analysis' || basicInfo?.modality === 'laboratory';
  return Boolean(isMetricReport && basicInfo?.reportLike !== false && !(draft.metrics || []).length && !(draft.findings || []).length);
}

function draftStructuredContentScore(draft: OcrDraft) {
  const basicInfo = draft.basicInfo as any;
  const basicScore = [
    basicInfo?.hospital,
    basicInfo?.reportDate,
    basicInfo?.typeKey && basicInfo.typeKey !== 'unknown_laboratory' ? basicInfo.typeKey : '',
    basicInfo?.canonicalTypeName
  ].filter((value) => compactText(value)).length;
  return (draft.status === 'needs_review' ? 5 : 0)
    + ((draft.metrics || []).length * 4)
    + ((draft.findings || []).length * 3)
    + basicScore;
}

function hasStructuredReportContent(draft: OcrDraft) {
  return draft.status === 'needs_review' && ((draft.metrics || []).length > 0 || (draft.findings || []).length > 0);
}

function shouldUseFallbackDraft(primaryDraft: OcrDraft, fallbackDraft: OcrDraft) {
  if (!hasStructuredReportContent(fallbackDraft)) return false;
  if (primaryDraft.status === 'needs_manual_input') return true;
  return draftStructuredContentScore(fallbackDraft) > draftStructuredContentScore(primaryDraft);
}

function shouldMergeFallbackBasicInfo(primaryDraft: OcrDraft, fallbackDraft: OcrDraft) {
  return hasStructuredReportContent(primaryDraft)
    && hasStructuredReportContent(fallbackDraft)
    && hasCoreBasicInfoGap(primaryDraft)
    && hasCompleteCoreBasicInfo(fallbackDraft);
}

function mergeDraftWarnings(...warningGroups: Array<unknown>) {
  const merged = new Map<string, { code: string; message: string }>();
  for (const group of warningGroups) {
    if (!Array.isArray(group)) continue;
    for (const warning of group) {
      const code = compactText((warning as any)?.code);
      if (!code || merged.has(code)) continue;
      merged.set(code, {
        code,
        message: compactText((warning as any)?.message) || code
      });
    }
  }
  return Array.from(merged.values());
}

function withFallbackUsedWarning(fallbackDraft: OcrDraft, primaryDraft: OcrDraft): OcrDraft {
  return {
    ...fallbackDraft,
    warnings: mergeDraftWarnings(fallbackDraft.warnings, [{
      code: 'OCR_PROVIDER_FALLBACK_USED',
      message: `Primary OCR provider returned a risky draft (${draftWarningCodes(primaryDraft).join(', ') || primaryDraft.status}); GPT vision fallback was used for this report group.`
    }])
  };
}

function withFallbackBasicInfoMerged(primaryDraft: OcrDraft, fallbackDraft: OcrDraft): OcrDraft {
  const primaryBasicInfo = primaryDraft.basicInfo as Record<string, any>;
  const fallbackBasicInfo = fallbackDraft.basicInfo as Record<string, any>;
  const basicInfo = { ...primaryBasicInfo };

  if (isMissingBasicInfoText(basicInfo.hospital) && !isMissingBasicInfoText(fallbackBasicInfo.hospital)) {
    basicInfo.hospital = fallbackBasicInfo.hospital;
    basicInfo.hospitalSource = fallbackBasicInfo.hospitalSource || 'ocr';
  }
  if (isMissingBasicInfoText(basicInfo.reportDate) && !isMissingBasicInfoText(fallbackBasicInfo.reportDate)) {
    basicInfo.reportDate = fallbackBasicInfo.reportDate;
    basicInfo.reportDateSource = fallbackBasicInfo.reportDateSource || 'ocr';
  }

  const currentTypeKey = compactText(basicInfo.typeKey);
  const fallbackTypeKey = compactText(fallbackBasicInfo.typeKey);
  if ((!currentTypeKey || currentTypeKey === 'unknown_laboratory') && fallbackTypeKey && fallbackTypeKey !== 'unknown_laboratory') {
    basicInfo.type = fallbackBasicInfo.type || basicInfo.type;
    basicInfo.originalType = fallbackBasicInfo.originalType || basicInfo.originalType;
    basicInfo.typeKey = fallbackBasicInfo.typeKey;
    basicInfo.canonicalTypeName = fallbackBasicInfo.canonicalTypeName || fallbackBasicInfo.type || basicInfo.canonicalTypeName;
    basicInfo.modality = fallbackBasicInfo.modality || basicInfo.modality;
    basicInfo.analysisPolicy = fallbackBasicInfo.analysisPolicy || basicInfo.analysisPolicy;
  }

  for (const field of ['examDate', 'patientName', 'department', 'orderNo', 'examPart', 'examMethod']) {
    if (isMissingBasicInfoText(basicInfo[field]) && !isMissingBasicInfoText(fallbackBasicInfo[field])) {
      basicInfo[field] = fallbackBasicInfo[field];
    }
  }

  return {
    ...primaryDraft,
    basicInfo,
    warnings: mergeDraftWarnings(primaryDraft.warnings, [{
      code: 'OCR_PROVIDER_FALLBACK_USED',
      message: 'GPT vision fallback filled missing core report metadata while preserving the primary OCR metric table.'
    }])
  };
}

function createGptVisionFallbackEnv(env: Env): Env {
  return {
    ...env,
    OCR_PROVIDER: 'gpt_vision',
    OPENAI_API_KEY: env.OCR_FALLBACK_API_KEY,
    OPENAI_OCR_MODEL: env.OCR_FALLBACK_OCR_MODEL,
    OPENAI_API_BASE_URL: env.OCR_FALLBACK_API_BASE_URL
  };
}

function hasConfiguredGptVisionFallback(env: Env) {
  return env.OCR_FALLBACK_PROVIDER === 'gpt_vision' && !!env.OCR_FALLBACK_API_KEY;
}

function extractTextFromContentParts(content: any[]) {
  return content
    .map((item: any) => {
      if (typeof item === 'string') return item;
      if (typeof item?.text === 'string') return item.text;
      if (typeof item?.content === 'string') return item.content;
      return '';
    })
    .filter(Boolean)
    .join('');
}

function extractOutputText(payload: any) {
  if (typeof payload?.output_text === 'string') return payload.output_text;
  const content = Array.isArray(payload?.output)
    ? payload.output.flatMap((item: any) => Array.isArray(item.content) ? item.content : [])
    : [];
  return extractTextFromContentParts(content);
}

function extractChatCompletionText(payload: any) {
  const message = payload?.choices?.[0]?.message;
  if (typeof message?.content === 'string') return message.content;
  if (Array.isArray(message?.content)) {
    return extractTextFromContentParts(message.content);
  }
  return '';
}

function chatCompletionFinishReason(payload: any) {
  return compactText(payload?.choices?.[0]?.finish_reason).toLowerCase();
}

function parseJsonOutput(outputText: string) {
  const trimmed = outputText.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const jsonText = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(jsonText);
  } catch (error) {
    const extracted = extractFirstJsonValue(jsonText);
    if (extracted && extracted !== jsonText) return JSON.parse(extracted);
    throw error;
  }
}

function extractFirstJsonValue(text: string) {
  const start = text.search(/[\[{]/);
  if (start < 0) return '';
  const opening = text[start];
  const closing = opening === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === opening) {
      depth += 1;
      continue;
    }
    if (char === closing) {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return '';
}

export class OcrApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message?: string,
    readonly retryable = false,
    readonly retryAfterMs?: number,
    readonly partialText?: string
  ) {
    super(message || `OPENAI_OCR_FAILED:${code || status}`);
  }
}

export type OcrProviderFailure = {
  code: string;
  message: string;
  retryable: boolean;
  retryAfterMs?: number;
};

function parseRetryAfterMs(value: string | null) {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const dateMs = Date.parse(value);
  if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());
  return undefined;
}

function classifyOcrApiFailure(status: number, code: string, message?: string) {
  const text = `${code || ''} ${message || ''}`.toLowerCase();
  if (status === 429 || /quota|rate|limit|too many requests/.test(text)) {
    return { code: 'OCR_RATE_LIMITED', retryable: true };
  }
  if ([401, 403].includes(status) || /auth|permission|api key|forbidden|unauthorized/.test(text)) {
    return { code: 'OCR_AUTH_FAILED', retryable: false };
  }
  if (['invalid_json', 'bad_response', 'schema_validation_failed'].includes(code) || /json|schema|parse/.test(text)) {
    return { code: 'OCR_PROVIDER_BAD_RESPONSE', retryable: false };
  }
  if (status === 408 || status >= 500 || /timeout|temporar|overload|unavailable/.test(text)) {
    return { code: 'OCR_PROVIDER_TEMPORARY', retryable: true };
  }
  return { code: 'OCR_PROVIDER_FAILED', retryable: false };
}

function createOcrApiError(status: number, code: string, message?: string, retryAfterMs?: number) {
  const classification = classifyOcrApiFailure(status, code, message);
  return new OcrApiError(classification.code, status, message, classification.retryable, retryAfterMs);
}

export function toOcrProviderFailure(error: unknown): OcrProviderFailure {
  if (error instanceof OcrApiError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      retryAfterMs: error.retryAfterMs
    };
  }
  if (error instanceof SyntaxError) {
    return {
      code: 'OCR_PROVIDER_BAD_RESPONSE',
      message: error.message,
      retryable: false
    };
  }
  if (error instanceof Error && ['TypeError', 'AbortError'].includes(error.name)) {
    return {
      code: error.name === 'AbortError' ? 'OCR_TIMEOUT' : 'OCR_PROVIDER_TEMPORARY',
      message: error.message,
      retryable: true
    };
  }
  return {
    code: 'OCR_PROVIDER_FAILED',
    message: error instanceof Error ? error.message : 'OCR provider failed',
    retryable: false
  };
}

async function readApiPayload(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function shouldFallbackToChatCompletions(error: unknown) {
  if (!(error instanceof OcrApiError)) return false;
  if (/not implemented|unsupported|does not support feature/i.test(error.message || '')) return true;
  if (['convert_request_failed', 'unsupported_endpoint', 'not_found'].includes(error.code)) return true;
  return [400, 404, 405, 422, 501].includes(error.status);
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  if (!timeoutMs || timeoutMs <= 0) return fetch(url, init);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: init.signal || controller.signal
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new OcrApiError('OCR_TIMEOUT', 408, `OCR request timed out after ${Math.ceil(timeoutMs / 1000)} seconds.`, true);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function safeBaseUrlHost(baseUrl: string) {
  try {
    return new URL(baseUrl).host;
  } catch {
    return 'unknown';
  }
}

function supportsChatResponseFormat(env: Env) {
  const model = String(env.OPENAI_OCR_MODEL || '').toLowerCase();
  const host = safeBaseUrlHost(env.OPENAI_API_BASE_URL).toLowerCase();
  if (model.includes('deepseek-ocr') || host.includes('wcode.net')) return false;
  return true;
}

function createPlainJsonOcrPrompt() {
  return [
    '请识别图片中的医疗检查报告，并只返回 JSON，不要返回 Markdown。',
    '顶层格式：{"drafts":[...]}。',
    '每个 draft 包含：pageCount, basicInfo, metrics, findings, conflicts, warnings, status。',
    'basicInfo 至少包含：type, originalType, typeKey, canonicalTypeName, modality, analysisPolicy, hospital, hospitalSource, reportDate, reportDateSource, examDate, patientName, department, orderNo, examPart, examMethod, reportLike, confidence。',
    'metrics 是数组。每个检验项目包含：metricKey, metricName, originalMetricName, reportMarkers, category, categoryCn, mappingStatus, valueType, valueNumeric, valueQualitative, valueText, unit, refRangeLow, refRangeHigh, refQualitative, refText, tone, ocrConfidence。',
    '检验报告表格中每一条可见当前结果都必须进入 metrics。',
    '不要诊断，不要给治疗建议。保留原始单位和参考范围文本。',
    '如果数值和参考范围明确，按范围计算 tone: low/ok/high；项目名前的星号或三角形不是高低异常，但必须保留：originalMetricName 保留原始前缀符号，reportMarkers 填写符号数组，例如 ["★"]，没有则 []。',
    '如果不是医疗报告，status 返回 not_report；否则 status 返回 needs_review。'
  ].join('\n');
}

function createCommercialRawOcrPrompt() {
  return [
    '只做 OCR 原文提取。逐字抄录图片中真实可见的文字，不要寒暄、不要解释、不要总结、不要改写、不要补充。',
    '禁止输出医学解释、建议、诊断、常识补充或“解释与建议”章节；如果图片上没有这些文字，不要生成。',
    '禁止输出 HTML、Markdown、表格标签或标题标记；不要添加 #、**、|---| 等格式符号。',
    '保留原文标点、微/小/大、↑/↓/H/L/高/低、日期、单位、参考范围。',
    '检验表格必须逐行输出，每个项目单独一行，尽量保留序号、项目名称、项目简称/代码、结果、异常标记、单位、参考范围、方法学。',
    '不要合并相邻项目，不要因为页眉、元数据或项目简称里出现过项目名就省略表格中的结果行。',
    '双栏或多栏表格按阅读顺序输出，先左栏后右栏，并保留每个项目序号。影像所见/意见按原句输出。'
  ].join('\n');
}

function createCommercialRawOcrFallbackPrompt() {
  return '只做 OCR。逐字抄录图片中的可见文字，不要寒暄、不要解释、不要总结、不要改写、不要补充。禁止输出 HTML、Markdown、表格标签或标题标记。保留原文标点、微/小/大、↑/↓/H/L/高/低、日期、单位、参考范围。按阅读顺序逐行输出；检验表格中每个项目单独一行，影像所见/意见按原句输出。';
}

function createCommercialRawOcrPrompts() {
  return [createCommercialRawOcrPrompt(), createCommercialRawOcrFallbackPrompt()];
}

function delay(ms: number) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestOcrWithRetry<T>(
  env: Env,
  endpoint: string,
  operation: () => Promise<T>,
  onAttempt?: (attempt: number, endpoint: string) => void
) {
  const maxRetries = env.OCR_MAX_RETRIES ?? 1;
  const baseMs = env.OCR_RETRY_BASE_MS ?? 250;
  let attempt = 0;
  let lastError: unknown;

  while (attempt <= maxRetries) {
    attempt += 1;
    if (onAttempt) onAttempt(attempt, endpoint);
    try {
      return await operation();
    } catch (error) {
      const failure = toOcrProviderFailure(error);
      lastError = error;
      if (!failure.retryable || attempt > maxRetries) break;
      if (failure.code === 'OCR_TIMEOUT') break;
      if (failure.code === 'OCR_RATE_LIMITED' && (failure.retryAfterMs || 0) > 2000) break;
      const waitMs = failure.retryAfterMs ?? (baseMs * Math.max(1, attempt));
      await delay(waitMs);
    }
  }

  throw lastError;
}

function ocrResponseSchema() {
  const warningSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['code', 'message'],
    properties: {
      code: { type: 'string' },
      message: { type: 'string' }
    }
  };
  const conflictSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['code', 'field', 'message', 'candidates'],
    properties: {
      code: { type: 'string' },
      field: { type: ['string', 'null'] },
      message: { type: 'string' },
      candidates: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['label', 'value', 'confidence'],
          properties: {
            label: { type: 'string' },
            value: { type: 'string' },
            confidence: { type: 'number' }
          }
        }
      }
    }
  };
  return {
    type: 'object',
    additionalProperties: false,
    required: ['drafts'],
    properties: {
      drafts: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['sourcePhotoIds', 'pageCount', 'basicInfo', 'metrics', 'findings', 'conflicts', 'warnings', 'status'],
          properties: {
            sourcePhotoIds: { type: 'array', items: { type: 'string' } },
            pageCount: { type: 'number' },
            basicInfo: {
              type: 'object',
              additionalProperties: false,
              required: [
                'type',
                'originalType',
                'typeKey',
                'canonicalTypeName',
                'modality',
                'analysisPolicy',
                'hospital',
                'hospitalSource',
                'reportDate',
                'reportDateSource',
                'examDate',
                'patientName',
                'department',
                'orderNo',
                'examPart',
                'examMethod',
                'reportLike',
                'confidence'
              ],
              properties: {
                type: { type: 'string' },
                originalType: { type: ['string', 'null'] },
                typeKey: { type: 'string' },
                canonicalTypeName: { type: ['string', 'null'] },
                modality: { type: 'string', enum: ['laboratory', 'imaging', 'electrophysiology', 'pathology', 'other'] },
                analysisPolicy: { type: 'string', enum: ['metric_analysis', 'view_only'] },
                hospital: { type: 'string' },
                hospitalSource: { type: 'string', enum: ['ocr', 'inferred_from_batch', 'user_edited', 'unknown'] },
                reportDate: { type: 'string' },
                reportDateSource: { type: 'string', enum: ['ocr', 'inferred_from_batch', 'user_edited', 'unknown'] },
                examDate: { type: ['string', 'null'] },
                patientName: { type: ['string', 'null'] },
                department: { type: ['string', 'null'] },
                orderNo: { type: ['string', 'null'] },
                examPart: { type: ['string', 'null'] },
                examMethod: { type: ['string', 'null'] },
                reportLike: { type: 'boolean' },
                confidence: { type: 'number' }
              }
            },
            metrics: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: [
                  'metricKey',
                  'metricName',
                  'originalMetricName',
                  'reportMarkers',
                  'category',
                  'categoryCn',
                  'mappingStatus',
                  'valueType',
                  'valueNumeric',
                  'valueQualitative',
                  'valueText',
                  'unit',
                  'refRangeLow',
                  'refRangeHigh',
                  'refQualitative',
                  'refText',
                  'tone',
                  'ocrConfidence'
                ],
                properties: {
                  metricKey: { type: 'string' },
                  metricName: { type: 'string' },
                  originalMetricName: { type: ['string', 'null'] },
                  reportMarkers: {
                    type: 'array',
                    items: { type: 'string' }
                  },
                  category: { type: 'string' },
                  categoryCn: { type: 'string' },
                  mappingStatus: { type: 'string', enum: ['confirmed', 'suggested', 'pending', 'conflicted'] },
                  valueType: { type: 'string', enum: ['quantitative', 'qualitative', 'text'] },
                  valueNumeric: { type: ['number', 'null'] },
                  valueQualitative: { type: ['string', 'null'] },
                  valueText: { type: ['string', 'null'] },
                  unit: { type: ['string', 'null'] },
                  refRangeLow: { type: ['number', 'null'] },
                  refRangeHigh: { type: ['number', 'null'] },
                  refQualitative: { type: ['string', 'null'] },
                  refText: { type: ['string', 'null'] },
                  tone: { type: 'string', enum: ['low', 'ok', 'high', 'abnormal', 'unknown'] },
                  ocrConfidence: { type: 'number' }
                }
              }
            },
            findings: { type: 'array', items: { type: 'string' } },
            conflicts: { type: 'array', items: conflictSchema },
            warnings: { type: 'array', items: warningSchema },
            evidence: {
              type: ['object', 'null'],
              additionalProperties: false,
              properties: {
                rawText: { type: ['string', 'null'] }
              }
            },
            status: { type: 'string', enum: ['needs_review', 'needs_manual_input', 'not_report'] }
          }
        }
      }
    }
  };
}

class FixtureOcrProvider implements OcrProvider {
  async recognizeFixture(input: FixtureRecognitionInput): Promise<OcrDraft[]> {
    return getRealcaseFixtureDrafts(input.caseIds);
  }

  async recognizePhotos(_input: OcrProviderInput): Promise<OcrProviderResult> {
    return {
      provider: 'fixture',
      schemaVersion: 'ocr_draft_v1',
      drafts: [],
      warnings: [{
        code: 'REAL_OCR_PROVIDER_NOT_CONFIGURED',
        message: 'Real OCR provider is not configured in this environment.'
      }]
    };
  }
}

class GptVisionOcrProvider implements OcrProvider {
  private lastAttemptCount = 0;
  private lastEndpoint = '';

  constructor(private readonly env: Env) {}

  async recognizeFixture(input: FixtureRecognitionInput): Promise<OcrDraft[]> {
    return getRealcaseFixtureDrafts(input.caseIds);
  }

  async recognizePhotos(input: OcrProviderInput): Promise<OcrProviderResult> {
    if (!this.env.OPENAI_API_KEY) {
      return warning('OPENAI_API_KEY_MISSING', 'OPENAI_API_KEY is required for GPT vision OCR.');
    }
    if (!input.groups.length) {
      return warning('OCR_EMPTY_RESULT', 'No uploaded report photos were provided.');
    }

    const content: any[] = [{
      type: 'input_text',
      text: [
        '你是医疗检查报告 OCR 结构化助手，只提取图片中的客观报告信息。',
        '不要做诊断，不要给治疗建议，不要编造缺失字段。',
        '输出必须是严格 JSON 对象，顶层必须包含 drafts 数组。每个 groupId 输出一份 draft。',
        '同一 groupId 下的多张图片按 sortOrder 视为同一份报告的多页/多段截图：按顺序拼接，去除重复页眉、页脚、表头和重复指标行；同一指标出现冲突结果时写入 conflicts，不要静默选择。',
        '如果同一 groupId 内医院、患者、日期、报告类型或检查部位明显冲突，返回 MULTIPAGE_INCONSISTENT warning/conflict，提示可能错误绑定。',
        '报告中的“本次/上次/历史结果”列只保存本次结果，历史对比列不能作为当前指标重复入库。',
        '检验报告中只要出现“项目/结果/参考范围/单位”或类似结果表格，metrics 不能为空；必须把每一行本次检查结果提取为一个 metric。',
        '对检验报告必须先在内部逐行审计结果表格：只统计表头“项目/结果/参考范围/单位”下方的可见结果行，每个可见结果行必须进入 metrics，最终 metrics.length 必须等于可见结果行数量。',
        '项目名称可能换行显示，例如“游离三碘甲状腺原氨酸”可能拆成两行；这仍然是一条完整指标，不要因为换行、缩进、三角标记或行高较小而跳过。',
        '不要把报告头部字段如单号、姓名、申请日期、审核日期放入 metrics；它们只属于 basicInfo 或忽略。',
        '例如 ACTH、甲功、肝功、电解质、血脂等检验项目，即使只有一行结果，也必须输出 metrics[0]，不要只输出 basicInfo。',
        '字段缺失时用空字符串或 null，并在 warnings 中说明。',
        '如果能读到报告头部或表格原文，请把可见原文放入 evidence.rawText，后端会用它校验并补齐缺失的医院、日期和报告类型。',
        '单位、参考范围文字、影像所见尽量保留原文。',
        '检验类报告使用 modality=laboratory、analysisPolicy=metric_analysis；CT、核磁、B超等检查类报告使用 modality=imaging、analysisPolicy=view_only，并把描述性内容放入 findings。',
        '影像、病理、电生理报告只要出现“检查所见”“检查意见”“影像所见”“诊断意见”“报告内容”等描述性段落，findings 不能为空；请按原文拆成若干条 findings，不要放入 metrics。',
        '报告类型优先使用报告单上明确的项目名称或套餐名称，例如“甲功”“甲功1”“甲状腺功能”“血常规”；不要用泛化的“检验报告/检验报告单”覆盖真实检查项目。',
        '日期字段优先级：若有“申请日期”，basicInfo.reportDate 必须使用申请日期；没有申请日期时再用采样/采集/检验/报告日期，并在 reportDateSource=ocr。',
        'FT3、FT4、TSH、游离三碘甲状腺原氨酸、游离甲状腺素、促甲状腺激素都归入 category=thyroid_function、categoryCn=甲状腺功能、typeKey=thyroid_function、canonicalTypeName=甲状腺功能。',
        '检查项名称左侧的星号/三角形/重点标记只表示该指标被医院重点标识，不表示偏高或偏低；不要写入 tone，但必须保留到 originalMetricName 前缀，并把原始符号写入 reportMarkers 字符串数组，例如 ["★"]、["△"]；没有重点符号时 reportMarkers=[]。',
        '结果值旁边的 ↑、H、偏高 表示 tone=high；结果值旁边的 ↓、L、偏低 表示 tone=low；没有异常箭头时按参考范围比较，范围内表示 tone=ok。不要输出 normal/numeric 等 schema 外枚举。',
        '结果值如果是 <104、<=5.6、>10、>=2、≤1300 这类比较符号加数字，仍然是 valueType=quantitative；valueNumeric 填数字本身，valueText 保留原文。',
        '血常规指标不要同时输出缩写和英文全称同义项；LIC#/LIC% 只输出 metricKey=lic_abs/lic_percent，NRBC#/NRBC% 只输出 metricKey=nrbc_abs/nrbc_percent。',
        'basicInfo 必须包含 type、originalType、typeKey、canonicalTypeName、modality、analysisPolicy、hospital、hospitalSource、reportDate、reportDateSource、examDate、patientName、department、orderNo、examPart、examMethod、reportLike、confidence。',
        '每个检验指标必须包含 metricKey、metricName、originalMetricName、reportMarkers、category、categoryCn、mappingStatus、valueType、valueNumeric、valueQualitative、valueText、unit、refRangeLow、refRangeHigh、refQualitative、refText、tone、ocrConfidence。',
        '如果无法确定 metricKey，可使用 originalMetricName 的拼音、英文或稳定小写 key，并把 mappingStatus 设为 pending 或 suggested。',
        `上下文: ${JSON.stringify(input.context)}`,
        `图片分组: ${JSON.stringify(input.groups.map((group) => ({
          groupId: group.groupId,
          sourcePhotoIds: group.photos.map((photo) => photo.photoId)
        })))}`
      ].join('\n')
    }];

    for (const group of input.groups) {
      content.push({
        type: 'input_text',
        text: `下面是 groupId=${group.groupId} 的报告图片，按顺序识别为一份报告。`
      });
      for (const photo of group.photos) {
        if (!photo.localPath) {
          return warning('LOCAL_IMAGE_PATH_MISSING', 'Local image path is required for GPT vision OCR in development.');
        }
        const bytes = await fs.readFile(photo.localPath);
        content.push({
          type: 'input_image',
          image_url: `data:${photo.mimeType};base64,${bytes.toString('base64')}`,
          detail: 'high'
        });
      }
    }

    const startedAt = new Date().toISOString();
    const parsed = await this.requestParsedStructuredOcr(content);
    const rawDrafts = Array.isArray(parsed.drafts) ? parsed.drafts : [];
    const providerMetadata: OcrProviderMetadata = {
      provider: 'gpt_vision',
      model: this.env.OPENAI_OCR_MODEL,
      baseUrlHost: safeBaseUrlHost(this.env.OPENAI_API_BASE_URL),
      schemaVersion: 'ocr_draft_v1',
      startedAt,
      completedAt: new Date().toISOString(),
      attempts: this.lastAttemptCount,
      endpoint: this.lastEndpoint
    };
    const drafts = rawDrafts.map((draft: any, index: number) => {
      const group = input.groups[index] || input.groups[0];
      const normalizedDraft = normalizeDraft(draft, group);
      return {
        ...normalizedDraft,
        ocrEvidence: createOcrEvidence(normalizedDraft, draft, group, providerMetadata),
        providerMetadata
      };
    });
    return {
      provider: 'gpt_vision',
      schemaVersion: 'ocr_draft_v1',
      drafts,
      providerMetadata
    };
  }

  private async requestParsedStructuredOcr(content: any[]) {
    const maxRetries = this.env.OCR_MAX_RETRIES ?? 1;
    let lastError: OcrApiError | null = null;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const outputText = await this.requestStructuredOcr(content);
      if (!outputText) {
        lastError = new OcrApiError('OCR_EMPTY_RESULT', 200, 'GPT vision OCR returned no structured text.', attempt < maxRetries);
      } else {
        try {
          const parsed = parseJsonOutput(outputText);
          this.lastAttemptCount = Math.max(this.lastAttemptCount || 0, attempt + 1);
          return parsed;
        } catch (error) {
          lastError = new OcrApiError(
            'OCR_PROVIDER_BAD_RESPONSE',
            502,
            error instanceof Error ? error.message : 'GPT vision OCR returned malformed JSON.',
            attempt < maxRetries
          );
        }
      }
      this.lastAttemptCount = Math.max(this.lastAttemptCount || 0, attempt + 1);
      if (attempt >= maxRetries) break;
      await delay((this.env.OCR_RETRY_BASE_MS ?? 250) * Math.max(1, attempt + 1));
    }
    throw lastError || new OcrApiError('OCR_PROVIDER_BAD_RESPONSE', 502, 'GPT vision OCR returned malformed JSON.', false);
  }

  private async requestStructuredOcr(content: any[]) {
    try {
      const outputText = await this.requestResponsesApi(content);
      if (outputText) return outputText;
      return await this.requestChatCompletionsApi(content);
    } catch (error) {
      if (!shouldFallbackToChatCompletions(error)) throw error;
      return this.requestChatCompletionsApi(content);
    }
  }

  private async requestWithRetry<T>(endpoint: string, operation: () => Promise<T>) {
    return requestOcrWithRetry(this.env, endpoint, operation, (attempt, activeEndpoint) => {
      this.lastAttemptCount = attempt;
      this.lastEndpoint = activeEndpoint;
    });
  }

  private async requestResponsesApi(content: any[]) {
    const payload = await this.requestWithRetry('responses', async () => {
      const response = await fetchWithTimeout(`${this.env.OPENAI_API_BASE_URL.replace(/\/$/, '')}/responses`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.env.OPENAI_OCR_MODEL,
          input: [{
            role: 'user',
            content
          }],
          text: {
            format: {
              type: 'json_schema',
              name: 'ocr_draft_v1',
              strict: true,
              schema: ocrResponseSchema()
            }
          }
        })
      }, this.env.OCR_REQUEST_TIMEOUT_MS);

      const payload = await readApiPayload(response);
      if (!response.ok) {
        throw createOcrApiError(
          response.status,
          payload?.error?.code || String(response.status),
          payload?.error?.message,
          parseRetryAfterMs(response.headers.get('retry-after'))
        );
      }
      return payload;
    });

    return extractOutputText(payload);
  }

  private async requestChatCompletionsApi(content: any[]) {
    const payload = await this.requestWithRetry('chat.completions', async () => {
      const usePlainJsonPrompt = !supportsChatResponseFormat(this.env);
      const messageContent = usePlainJsonPrompt
        ? [
            { type: 'text', text: createPlainJsonOcrPrompt() },
            ...content
              .filter((item) => item.type === 'input_image')
              .map((item) => ({
                type: 'image_url',
                image_url: { url: item.image_url, detail: item.detail || 'high' }
              }))
          ]
        : content.map((item) => {
            if (item.type === 'input_image') {
              return {
                type: 'image_url',
                image_url: { url: item.image_url, detail: item.detail || 'high' }
              };
            }
            return {
              type: 'text',
              text: item.text || ''
            };
          });
      const body: Record<string, unknown> = {
        model: this.env.OPENAI_OCR_MODEL,
        messages: [{
          role: 'user',
          content: messageContent
        }],
        temperature: 0,
        max_tokens: this.env.OCR_MAX_OUTPUT_TOKENS
      };
      if (supportsChatResponseFormat(this.env)) {
        body.response_format = { type: 'json_object' };
      }
      const response = await fetchWithTimeout(`${this.env.OPENAI_API_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      }, this.env.OCR_REQUEST_TIMEOUT_MS);

      const payload = await readApiPayload(response);
      if (!response.ok) {
        throw createOcrApiError(
          response.status,
          payload?.error?.code || String(response.status),
          payload?.error?.message,
          parseRetryAfterMs(response.headers.get('retry-after'))
        );
      }
      return payload;
    });

    return extractChatCompletionText(payload);
  }
}

// Deprecated DeepSeek/WCode experiment path.
// The product OCR route is now `gpt_vision`; this adapter is retained only so
// historical tests and comparison artifacts can be removed incrementally.
class CommercialOcrProvider implements OcrProvider {
  private lastAttemptCount = 0;
  private lastEndpoint = '';

  constructor(private readonly env: Env) {}

  async recognizeFixture(input: FixtureRecognitionInput): Promise<OcrDraft[]> {
    return getRealcaseFixtureDrafts(input.caseIds);
  }

  async recognizePhotos(input: OcrProviderInput): Promise<OcrProviderResult> {
    if (!this.env.OPENAI_API_KEY) {
      return {
        provider: 'commercial_ocr',
        schemaVersion: 'ocr_draft_v1',
        drafts: [],
        warnings: [{ code: 'COMMERCIAL_OCR_API_KEY_MISSING', message: 'OPENAI_API_KEY is required for commercial OCR.' }]
      };
    }
    if (!input.groups.length) {
      return {
        provider: 'commercial_ocr',
        schemaVersion: 'ocr_draft_v1',
        drafts: [],
        warnings: [{ code: 'OCR_EMPTY_RESULT', message: 'No uploaded report photos were provided.' }]
      };
    }

    const startedAt = new Date().toISOString();
    const providerMetadata: OcrProviderMetadata = {
      provider: 'commercial_ocr',
      model: this.env.OPENAI_OCR_MODEL,
      baseUrlHost: safeBaseUrlHost(this.env.OPENAI_API_BASE_URL),
      schemaVersion: 'ocr_draft_v1',
      startedAt,
      endpoint: 'chat.completions'
    };

    const drafts: OcrDraft[] = [];
    const resultWarnings: Array<{ code: string; message: string }> = [];
    let maxAttemptCount = 0;
    for (const group of input.groups) {
      const rawResult = await this.extractRawText(group);
      resultWarnings.push(...rawResult.warnings);
      const draft = parseRawOcrDraft(rawResult.rawText, group);
      const attemptCount = this.lastAttemptCount || 1;
      const endpoint = this.lastEndpoint || providerMetadata.endpoint;
      maxAttemptCount = Math.max(maxAttemptCount, attemptCount);
      const completedMetadata = {
        ...providerMetadata,
        completedAt: new Date().toISOString(),
        attempts: attemptCount,
        endpoint
      };
      const draftWarnings = [
        ...(Array.isArray(draft.warnings) ? draft.warnings : []),
        ...rawResult.warnings
      ];
      if (!hasConfiguredGptVisionFallback(this.env) && shouldAttemptProviderFallback({
        ...draft,
        warnings: draftWarnings
      })) {
        draftWarnings.push({
          code: 'OCR_PROVIDER_FALLBACK_UNAVAILABLE',
          message: '当前仅使用首轮 OCR，未启用 GPT 视觉兜底；这份结果存在结构化风险，请对照原图核查后再保存。'
        });
      }
      drafts.push({
        ...draft,
        warnings: draftWarnings,
        ocrEvidence: createOcrEvidence(draft, { evidence: { rawText: rawResult.rawText } }, group, completedMetadata),
        providerMetadata: completedMetadata
      });
    }

    return {
      provider: 'commercial_ocr',
      schemaVersion: 'ocr_draft_v1',
      drafts,
      warnings: resultWarnings,
      providerMetadata: {
        ...providerMetadata,
        completedAt: new Date().toISOString(),
        attempts: maxAttemptCount || 1,
        endpoint: this.lastEndpoint || providerMetadata.endpoint
      }
    };
  }

  private async extractRawText(group: OcrProviderReportGroup) {
    this.lastAttemptCount = 0;
    this.lastEndpoint = '';
    const imageContent: any[] = [];
    for (const photo of group.photos) {
      if (!photo.localPath) {
        throw new OcrApiError('LOCAL_IMAGE_PATH_MISSING', 400, 'Local image path is required for commercial OCR in development.');
      }
      const bytes = await fs.readFile(photo.localPath);
      imageContent.push({
        type: 'image_url',
        image_url: { url: `data:${photo.mimeType};base64,${bytes.toString('base64')}` }
      });
    }

    let fallbackUsed = false;
    let lastEmptyError: unknown;
    const prompts = createCommercialRawOcrPrompts();
    for (let index = 0; index < prompts.length; index += 1) {
      const content: any[] = [{
        type: 'text',
        text: prompts[index]
      }, ...imageContent];

      try {
        const text = await this.requestRawOcrContent(content);
        return {
          rawText: text,
          warnings: fallbackUsed
            ? [{
              code: 'OCR_PROMPT_FALLBACK_USED',
              message: '首次 OCR 提示词未返回文本，已使用兼容提示词重新识别。请对照原图核查。'
            }]
            : [] as Array<{ code: string; message: string }>
        };
      } catch (error) {
        if (error instanceof OcrApiError && error.code === 'OCR_EMPTY_RESULT' && index < prompts.length - 1) {
          fallbackUsed = true;
          lastEmptyError = error;
          continue;
        }
        if (error instanceof OcrApiError && error.code === 'OCR_OUTPUT_TRUNCATED' && compactText(error.partialText)) {
          return {
            rawText: error.partialText || '',
            warnings: [{
              code: 'OCR_OUTPUT_TRUNCATED',
              message: 'OCR 输出被截断，仅保留部分识别文本。请对照原图逐项核查，必要时重新上传更清晰图片。'
            }]
          };
        }
        throw error;
      }
    }

    throw lastEmptyError;
  }

  private async requestRawOcrContent(content: any[]) {
    return this.requestWithRetry('chat.completions', async () => {
      const response = await fetchWithTimeout(`${this.env.OPENAI_API_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.env.OPENAI_OCR_MODEL,
          messages: [{ role: 'user', content }],
          temperature: 0,
          max_tokens: this.env.OCR_MAX_OUTPUT_TOKENS
        })
      }, this.env.OCR_REQUEST_TIMEOUT_MS);
      const payload = await readApiPayload(response);
      if (!response.ok) {
        throw createOcrApiError(
          response.status,
          payload?.error?.code || String(response.status),
          payload?.error?.message,
          parseRetryAfterMs(response.headers.get('retry-after'))
        );
      }
      if (chatCompletionFinishReason(payload) === 'length') {
        const partialText = extractChatCompletionText(payload);
        throw new OcrApiError('OCR_OUTPUT_TRUNCATED', 200, 'Commercial OCR output was truncated before all report text was returned.', true, undefined, partialText);
      }
      const text = extractChatCompletionText(payload);
      if (!text.trim()) {
        throw new OcrApiError('OCR_EMPTY_RESULT', 200, 'Commercial OCR returned no text.', false);
      }
      return text;
    });
  }

  private async requestWithRetry<T>(endpoint: string, operation: () => Promise<T>) {
    const startingAttemptCount = this.lastAttemptCount;
    return requestOcrWithRetry(this.env, endpoint, operation, (attempt, activeEndpoint) => {
      this.lastAttemptCount = startingAttemptCount + attempt;
      this.lastEndpoint = activeEndpoint;
    });
  }
}

class ProviderFallbackOcrProvider implements OcrProvider {
  constructor(
    private readonly primary: OcrProvider,
    private readonly fallback: OcrProvider
  ) {}

  async recognizeFixture(input: FixtureRecognitionInput): Promise<OcrDraft[]> {
    return this.primary.recognizeFixture(input);
  }

  async recognizePhotos(input: OcrProviderInput): Promise<OcrProviderResult> {
    const primaryResult = await this.primary.recognizePhotos(input);
    const fallbackEntries = primaryResult.drafts
      .map((draft, index) => ({
        draft,
        index,
        group: input.groups[index]
      }))
      .filter((entry) => entry.group && shouldAttemptProviderFallback(entry.draft));

    if (!fallbackEntries.length) return primaryResult;

    let fallbackResult: OcrProviderResult;
    try {
      fallbackResult = await this.fallback.recognizePhotos({
        ...input,
        groups: fallbackEntries.map((entry) => entry.group)
      });
    } catch (error) {
      const failure = toOcrProviderFailure(error);
      return {
        ...primaryResult,
        warnings: mergeDraftWarnings(primaryResult.warnings, [{
          code: 'OCR_PROVIDER_FALLBACK_FAILED',
          message: `GPT vision fallback failed after primary OCR produced risky drafts: ${failure.code} ${failure.message}`.trim()
        }])
      };
    }

    let replacedCount = 0;
    let mergedCount = 0;
    const drafts = [...primaryResult.drafts];
    fallbackEntries.forEach((entry, fallbackIndex) => {
      const fallbackDraft = fallbackResult.drafts[fallbackIndex];
      if (fallbackDraft && shouldUseFallbackDraft(entry.draft, fallbackDraft)) {
        drafts[entry.index] = withFallbackUsedWarning(fallbackDraft, entry.draft);
        replacedCount += 1;
        return;
      }
      if (fallbackDraft && shouldMergeFallbackBasicInfo(entry.draft, fallbackDraft)) {
        drafts[entry.index] = withFallbackBasicInfoMerged(entry.draft, fallbackDraft);
        mergedCount += 1;
        return;
      }
      drafts[entry.index] = {
        ...entry.draft,
        warnings: mergeDraftWarnings(entry.draft.warnings, [{
          code: 'OCR_PROVIDER_FALLBACK_NOT_USED',
          message: 'GPT vision fallback did not produce a better structured draft; primary OCR draft was kept for manual review.'
        }])
      };
    });

    return {
      ...primaryResult,
      drafts,
      warnings: mergeDraftWarnings(primaryResult.warnings, fallbackResult.warnings, [{
        code: replacedCount + mergedCount > 0 ? 'OCR_PROVIDER_FALLBACK_USED' : 'OCR_PROVIDER_FALLBACK_NOT_USED',
        message: replacedCount + mergedCount > 0
          ? `GPT vision fallback improved ${replacedCount + mergedCount} risky OCR draft(s) (${replacedCount} replaced, ${mergedCount} metadata merged).`
          : 'GPT vision fallback was attempted, but no draft was better than the primary OCR result.'
      }])
    };
  }
}

export function createOcrProvider(env?: Env): OcrProvider {
  if (env?.OCR_PROVIDER === 'commercial_ocr') {
    const primary = new CommercialOcrProvider(env);
    if (hasConfiguredGptVisionFallback(env)) {
      return new ProviderFallbackOcrProvider(primary, new GptVisionOcrProvider(createGptVisionFallbackEnv(env)));
    }
    return primary;
  }
  if (env?.OCR_PROVIDER === 'gpt_vision') return new GptVisionOcrProvider(env);
  return new FixtureOcrProvider();
}
