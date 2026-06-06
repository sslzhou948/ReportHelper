import { extractMetricReportMarkers, stripMetricReportMarkers } from '../domain/report-markers.js';

export type RawOcrPhotoRef = {
  photoId: string;
};

export type RawOcrReportGroupRef = {
  groupId: string;
  photos: RawOcrPhotoRef[];
};

function compactText(value: unknown) {
  return String(value || '').trim();
}

function normalizeDateOnly(value: unknown) {
  const text = compactText(value);
  const match = text.match(/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/);
  if (!match) return text;
  const [year, month, day] = match[0].replace(/[/.]/g, '-').split('-');
  return [year, month.padStart(2, '0'), day.padStart(2, '0')].join('-');
}

function rawOcrLines(rawText: string) {
  return rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const INLINE_LABELS = [
  '姓名',
  '性别',
  '年龄',
  '出生日期',
  '医院',
  '医院名称',
  '检查医院',
  '医疗机构',
  '就诊医院',
  '送检医院',
  '申请医院',
  '检验机构',
  '机构名称',
  '报告医院',
  '样本类型',
  '样本编号',
  '样本号',
  '标本编号',
  '检验单号',
  '条码号',
  '科室',
  '科别',
  '申请科室',
  '送检科室',
  '报告类型',
  '报告名称',
  '检查名称',
  '检验名称',
  '检验日期',
  '检测日期',
  '检测时间',
  '检验时间',
  '采样时间',
  '采集时间',
  '检查时间',
  '报告时间',
  '报告日期',
  '审核日期',
  '审核时间',
  '检查日期',
  '单号',
  '送检者',
  '检验者',
  '审核者'
];

const HOSPITAL_LABELS = ['就诊医院', '送检医院', '申请医院', '报告医院', '检查医院', '医院名称', '检验机构', '机构名称', '医疗机构'];
const REPORT_TYPE_LABELS = ['报告类型', '报告名称', '检查名称', '检验名称', '检验项目', '检查项目'];
const REPORT_DATE_LABELS = ['检验日期', '检测日期', '检测时间', '检验时间', '检查日期', '检查时间', '采样时间', '采集时间', '申请日期', '报告日期', '报告时间', '审核日期', '审核时间'];
const REPORT_ISSUE_DATE_LABELS = ['报告日期', '报告时间', '审核日期', '审核时间'];
const EXAM_DATE_LABELS = ['检查日期', '检查时间', '检验日期', '检测日期', '检测时间', '检验时间', '采样时间', '采集时间'];
const DEPARTMENT_LABELS = ['申请科室', '送检科室', '科室', '科别'];
const ORDER_NO_LABELS = ['检验单号', '条码号', '标本编号', '样本编号', '样本号', '单号'];

const NORMAL_INLINE_LABELS = [
  '姓名',
  '性别',
  '年龄',
  '出生日期',
  '医院',
  '医院名称',
  '检查医院',
  '医疗机构',
  '就诊医院',
  '送检医院',
  '申请医院',
  '检验机构',
  '机构名称',
  '报告医院',
  '样本类型',
  '样本编号',
  '样本号',
  '标本编号',
  '检验单号',
  '条码号',
  '科室',
  '科别',
  '申请科室',
  '送检科室',
  '报告类型',
  '报告名称',
  '检查名称',
  '检验名称',
  '检验日期',
  '检测日期',
  '检测时间',
  '检验时间',
  '采样时间',
  '采集时间',
  '检查时间',
  '报告时间',
  '报告日期',
  '审核日期',
  '审核时间',
  '检查日期',
  '单号',
  '送检者',
  '检验者',
  '审核者'
];
const NORMAL_HOSPITAL_LABELS = ['就诊医院', '送检医院', '申请医院', '报告医院', '检查医院', '医院名称', '检验机构', '机构名称', '医疗机构'];
const NORMAL_REPORT_TYPE_LABELS = ['报告类型', '报告名称', '检查名称', '检验名称', '检验项目', '检查项目'];
const NORMAL_REPORT_DATE_LABELS = ['检验日期', '检测日期', '检测时间', '检验时间', '检查日期', '检查时间', '采样时间', '采集时间', '申请日期', '报告日期', '报告时间', '审核日期', '审核时间'];
const NORMAL_DEPARTMENT_LABELS = ['申请科室', '送检科室', '科室', '科别'];
const NORMAL_ORDER_NO_LABELS = ['检验单号', '条码号', '标本编号', '样本编号', '样本号', '单号'];
const ALL_INLINE_LABELS = [...INLINE_LABELS, ...NORMAL_INLINE_LABELS];
const ALL_HOSPITAL_LABELS = [...HOSPITAL_LABELS, ...NORMAL_HOSPITAL_LABELS];
const ALL_REPORT_TYPE_LABELS = [...REPORT_TYPE_LABELS, ...NORMAL_REPORT_TYPE_LABELS];
const ALL_REPORT_DATE_LABELS = [...REPORT_DATE_LABELS, ...NORMAL_REPORT_DATE_LABELS];
const ALL_DEPARTMENT_LABELS = [...DEPARTMENT_LABELS, ...NORMAL_DEPARTMENT_LABELS];
const ALL_ORDER_NO_LABELS = [...ORDER_NO_LABELS, ...NORMAL_ORDER_NO_LABELS];
const LABEL_SEPARATOR_PATTERN = '[：:锛?]';
const OPTIONAL_LABEL_SEPARATOR_PATTERN = '[：:锛?]?';

function flexibleLabelSource(label: string) {
  return Array.from(label).map((char) => escapeRegExp(char)).join('\\s*');
}

function hasLabel(line: string, label: string) {
  return new RegExp(flexibleLabelSource(label)).test(line);
}

function stopAtNextInlineLabel(value: string, currentLabel: string) {
  const text = compactText(value);
  let stop = text.length;
  for (const label of ALL_INLINE_LABELS) {
    if (label === currentLabel) continue;
    const match = text.match(new RegExp(`(?:^|\\s|[，,；;]|${LABEL_SEPARATOR_PATTERN})${flexibleLabelSource(label)}\\s*(?:${LABEL_SEPARATOR_PATTERN}|\\s|$)`));
    if (match && match.index !== undefined && match.index < stop) stop = match.index;
  }
  return text.slice(0, stop).trim();
}

function cleanInlineLabelValue(value: string) {
  return compactText(value)
    .replace(/^[*#\s]+/, '')
    .replace(/^[：:\s]+/, '')
    .replace(/^[*#\s]+/, '')
    .replace(/^[：:\s]+/, '')
    .trim();
}

function lineAfterLabel(lines: string[], label: string) {
  const pattern = new RegExp(`${flexibleLabelSource(label)}\\s*[：:]?\\s*(.*)`);
  const index = lines.findIndex((line) => hasLabel(line, label));
  if (index < 0) return '';
  const match = lines[index].match(pattern);
  const inline = cleanInlineLabelValue(stopAtNextInlineLabel(match?.[1] || '', label));
  if (inline) return inline;
  return cleanInlineLabelValue(stopAtNextInlineLabel(lines[index + 1] || '', label));
}

function firstLineAfterAnyLabel(lines: string[], labels: string[]) {
  for (const label of labels) {
    const value = lineAfterLabel(lines, label);
    if (value) return value;
  }
  return '';
}

function lineAfterColonLabel(lines: string[], label: string) {
  const pattern = new RegExp(`${flexibleLabelSource(label)}\\s*[：:]\\s*(.*)`);
  const index = lines.findIndex((line) => pattern.test(line));
  if (index < 0) return '';
  const match = lines[index].match(pattern);
  const inline = cleanInlineLabelValue(stopAtNextInlineLabel(match?.[1] || '', label));
  if (inline) return inline;
  return cleanInlineLabelValue(stopAtNextInlineLabel(lines[index + 1] || '', label));
}

function firstDateAfterLabel(lines: string[], label: string) {
  const index = lines.findIndex((line) => hasLabel(line, label));
  if (index < 0) return '';
  const match = compactText(lineAfterLabel(lines, label)).match(/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/);
  return match ? normalizeDateOnly(match[0]) : '';
}

function firstDateAfterAnyLabel(lines: string[], labels: string[]) {
  for (const label of labels) {
    const value = firstDateAfterLabel(lines, label);
    if (value) return value;
  }
  return '';
}

function firstDateInText(text: string) {
  const match = compactText(text).match(/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/);
  return match ? normalizeDateOnly(match[0]) : '';
}

function cleanHospitalName(value: string) {
  const reportSuffixPattern = /\s*(?:\u8840\u6db2\u7ec6\u80de|\u8840\u5e38\u89c4|\u751f\u5316|\u514d\u75ab|\u533b\u5b66\u68c0\u9a8c|\u533b\u5b66|\u68c0\u9a8c|\u68c0\u67e5|\u68c0\u6d4b)?(?:\u68c0\u9a8c|\u68c0\u67e5|\u68c0\u6d4b)?\u62a5\u544a\u5355?[\s\S]*$/;
  return compactText(value)
    .replace(/^[#*\s]+/, '')
    .replace(/^[：:\s]+/, '')
    .replace(reportSuffixPattern, '')
    .replace(/(?:\u8840\u6db2\u7ec6\u80de|\u8840\u5e38\u89c4)$/, '')
    .trim();
}

function cleanMarkdownLine(value: string) {
  return compactText(value)
    .replace(/^#+\s*/, '')
    .replace(/^\*+|\*+$/g, '')
    .trim();
}

function isGenericLabIssuerLine(line: string) {
  return /^(?:医学)?检验实验室(?:检验)?报告单?$/i.test(cleanMarkdownLine(line))
    || /^Medical Laboratory(?: Test Report)?$/i.test(cleanMarkdownLine(line));
}

function isIssuerCandidateLine(line: string) {
  const text = cleanMarkdownLine(line);
  if (!text || isGenericLabIssuerLine(text)) return false;
  if (/送检单位|就诊|姓名|性别|年龄|科室|医生|项目|样本|编号|联系电话|临床诊断/.test(text)) return false;
  return /医院|卫生服务中心|社区卫生|检验中心|医学检验|实验室|门诊|诊所|DIAN/i.test(text);
}

function preferredReportIssuerLine(lines: string[]) {
  const issuerPattern = /\u533b\u5b66\u68c0\u9a8c|\u68c0\u9a8c.*\u5b9e\u9a8c\u5ba4|\u68c0\u6d4b.*\u5b9e\u9a8c\u5ba4|Medical Laboratory/i;
  const metadataPattern = /\u9001\u68c0\u5355\u4f4d|\u5c31\u8bca|\u59d3\u540d|\u6027\u522b|\u5e74\u9f84|\u79d1\u5ba4|\u533b\u751f|\u9879\u76ee\u540d\u79f0|\u9879\u76ee\u7b80\u79f0|\u9879\u76ee\u4ee3\u7801/;
  const cleanedLines = lines.map(cleanMarkdownLine);
  for (let index = 0; index < cleanedLines.length; index += 1) {
    const line = cleanedLines[index];
    if (!issuerPattern.test(line) || metadataPattern.test(line)) continue;
    if (isGenericLabIssuerLine(line)) {
      for (let previousIndex = index - 1; previousIndex >= Math.max(0, index - 3); previousIndex -= 1) {
        if (isIssuerCandidateLine(cleanedLines[previousIndex])) return cleanedLines[previousIndex];
      }
    }
    return line;
  }
  return '';
}

function inferImagingReportType(lines: string[]) {
  return lines
    .slice(0, 16)
    .map(cleanMarkdownLine)
    .find((line) => (
      /(?:(?:^|[^A-Z])CT(?:[^A-Z]|$)|MRI|MR|核磁|磁共振|超声|彩超|B超|DR|X线|平扫|增强)/i.test(line)
      && !/报告|医院|姓名|日期|医师|医生|单号|检查所见|检查意见/.test(line)
    )) || '';
}

function inferReportType(lines: string[], explicitType: string) {
  const text = lines.slice(0, 16).join(' ');
  const cleanExplicitType = cleanMarkdownLine(explicitType);
  const genericExplicitType = !cleanExplicitType
    || ['检验项目', '检查项目', '项目'].includes(cleanExplicitType)
    || /结果|参考|单位/.test(cleanExplicitType);
  if (!genericExplicitType) {
    return cleanExplicitType;
  }
  if (/血液细胞|血常规|白细胞|红细胞|血小板|WBC|RBC|PLT/i.test(text)) return '血常规';
  if (/胆固醇|甘油三酯|高密度脂蛋白|低密度脂蛋白|血脂/.test(text)) return '血脂';
  if (/甲状腺|FT3|FT4|TSH|促甲状腺/i.test(text)) return '甲功';
  if (/尿常规|尿液|尿沉渣|尿蛋白|尿潜血/.test(text)) return '尿常规';
  const imagingType = inferImagingReportType(lines);
  if (imagingType) return imagingType.replace(/\s+/g, '');
  return explicitType || '';
}

function parseNumeric(value: unknown) {
  const text = compactText(value).replace(/,/g, '');
  const match = text.match(/[-+]?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function parseRefRange(refText: string) {
  const text = compactText(refText).replace(/≤/g, '<=').replace(/≥/g, '>=');
  const lowThresholdMatch = text.match(/(?:降低|偏低|低于|低值)[^\d<>]*(?:<=|<)\s*([-+]?\d+(?:\.\d+)?)/);
  if (lowThresholdMatch) return { low: Number(lowThresholdMatch[1]), high: null as number | null };
  const upperMatch = text.match(/(?:<=|<|不高于|小于|低于)\s*([-+]?\d+(?:\.\d+)?)/);
  if (upperMatch) return { low: null as number | null, high: Number(upperMatch[1]) };
  const lowerMatch = text.match(/(?:>=|>|不低于|大于|高于)\s*([-+]?\d+(?:\.\d+)?)/);
  if (lowerMatch) return { low: Number(lowerMatch[1]), high: null as number | null };
  const match = text.match(/([-+]?\d+(?:\.\d+)?)\s*(?:[-~～—–]|至|到)\s*([-+]?\d+(?:\.\d+)?)/);
  if (!match) return { low: null as number | null, high: null as number | null };
  return {
    low: Number(match[1]),
    high: Number(match[2])
  };
}

function toneFromResultMarker(valueText: string) {
  const text = compactText(valueText);
  if (/↑|偏高|(?:^|\s)[Hh](?:\s|$)|[-+]?\d+(?:\.\d+)?\s*[Hh](?:\s|$)/.test(text)) return 'high';
  if (/↓|偏低|(?:^|\s)[Ll](?:\s|$)|[-+]?\d+(?:\.\d+)?\s*[Ll](?:\s|$)/.test(text)) return 'low';
  return '';
}

function calculateTone(valueNumeric: number | null, low: number | null, high: number | null, valueText = '') {
  const markerTone = toneFromResultMarker(valueText);
  if (markerTone) return markerTone;
  if (valueNumeric === null) return 'unknown';
  if (low !== null && valueNumeric < low) return 'low';
  if (high !== null && valueNumeric > high) return 'high';
  if (low !== null || high !== null) return 'ok';
  return 'unknown';
}

function metricKeyFromName(metricName: string) {
  const name = compactText(metricName);
  const codeAliases: Record<string, string> = {
    tc: 'total_cholesterol',
    cho: 'total_cholesterol',
    chol: 'total_cholesterol',
    tg: 'triglyceride',
    trig: 'triglyceride',
    hdl: 'hdl_cholesterol',
    hdl_c: 'hdl_cholesterol',
    ldl: 'ldl_cholesterol',
    ldl_c: 'ldl_cholesterol',
    t3: 't3',
    t4: 't4',
    p_lcr: 'p_lcr',
    p_lcc: 'p_lcc',
    rd: 'rdw_cv',
    rdw: 'rdw_cv',
    rdw_cv: 'rdw_cv',
    rdw_sd: 'rdw_sd'
  };
  const metricCodeToKey = (rawCode: string) => {
    const normalizedCode = compactText(rawCode).toLowerCase();
    if (normalizedCode.endsWith('%')) {
      return `${normalizedCode.slice(0, -1).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}_percent`;
    }
    if (normalizedCode.endsWith('#')) {
      return `${normalizedCode.slice(0, -1).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}_abs`;
    }
    const normalizedKey = normalizedCode.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return codeAliases[normalizedKey] || normalizedKey;
  };
  if (/降钙素原|procalcitonin/i.test(name)) return 'procalcitonin';
  if (/超敏C反应蛋白|hs-?CRP/i.test(name)) return 'hs_crp';
  if (/C反应蛋白|CRP/i.test(name)) return 'crp';
  const directCode = name.match(/^[*★▲△◆◇●○]?\s*([A-Za-z][A-Za-z0-9%#-]*)\s*$/)?.[1];
  if (directCode) return metricCodeToKey(directCode);
  const code = name.match(/[（(]\s*([A-Za-z][A-Za-z0-9%#-]*)\s*[)）]/)?.[1];
  if (code) return metricCodeToKey(code);
  const rules: Array<[RegExp, string]> = [
    [/白细胞.*(数目|计数)|WBC/i, 'wbc'],
    [/中性粒细胞百分比|Neu%/i, 'neu_percent'],
    [/淋巴细胞百分比|Lym%/i, 'lym_percent'],
    [/单核细胞百分比|Mon%/i, 'mon_percent'],
    [/嗜酸性粒细胞百分比|Eos%/i, 'eos_percent'],
    [/嗜碱性粒细胞百分比|Bas%/i, 'bas_percent'],
    [/中性粒细胞数目|Neu#/i, 'neu_abs'],
    [/淋巴细胞数目|Lym#/i, 'lym_abs'],
    [/单核细胞数目|Mon#/i, 'mon_abs'],
    [/嗜酸性粒细胞数目|Eos#/i, 'eos_abs'],
    [/嗜碱性粒细胞数目|Bas#/i, 'bas_abs'],
    [/红细胞数目|RBC/i, 'rbc'],
    [/血红蛋白|HGB/i, 'hgb'],
    [/红细胞压积|HCT/i, 'hct'],
    [/平均红细胞体积|MCV/i, 'mcv'],
    [/平均红细胞血红蛋白含量|MCH/i, 'mch'],
    [/平均红细胞血红蛋白浓度|MCHC/i, 'mchc'],
    [/血小板数目|PLT/i, 'plt'],
    [/平均血小板体积|MPV/i, 'mpv'],
    [/血小板分布宽度|PDW/i, 'pdw'],
    [/血小板压积|PCT/i, 'pct'],
    [/总胆固醇|TC\b|CHO\b|CHOL/i, 'total_cholesterol'],
    [/甘油三酯|TG\b|TRIG/i, 'triglyceride'],
    [/高密度脂蛋白胆固醇|HDL-C|HDL_C|HDL\b/i, 'hdl_cholesterol'],
    [/低密度脂蛋白胆固醇|LDL-C|LDL_C|LDL\b/i, 'ldl_cholesterol'],
    [/天门冬氨酸氨基转移酶|天冬氨酸氨基转移酶|AST\b/i, 'ast'],
    [/丙氨酸氨基转移酶|谷丙转氨酶|ALT\b/i, 'alt'],
    [/肌酐|CREA?\b|Cr\b/i, 'creatinine'],
    [/尿酸|UA\b/i, 'uric_acid']
  ];
  rules.push(
    [/ACTH|促肾上腺皮质/i, 'acth'],
    [/FT3|游离三碘甲状(?:腺原氨酸|旁腺素)?|游离三碘甲状腺素/i, 'ft3'],
    [/FT4|游离甲状腺素/i, 'ft4'],
    [/\bT3\b|\u8840\u6e05\u4e09\u7898\u7532\u72b6\u539f\u6c28\u9178|\u8840\u6e05\u4e09\u7898\u7532\u72b6\u817a\u539f\u6c28\u9178|\u4e09\u7898\u7532\u72b6\u817a\u539f\u6c28\u9178/i, 't3'],
    [/\bT4\b|\u8840\u6e05\u7532\u72b6\u817a\u7d20(?!\u7ed3\u5408)|\u7532\u72b6\u817a\u7d20$/i, 't4'],
    [/TSH|\u4fc3\u7532\u72b6\u817a\u6fc0\u7d20/i, 'tsh']
  );
  const match = rules.find(([pattern]) => pattern.test(name));
  if (match) return match[1];
  return name.toLowerCase().replace(/\s+/g, '_') || 'unknown_metric';
}

function reportTypeKey(reportType: string) {
  const text = compactText(reportType);
  if (/血液细胞|血常规|血细胞|白细胞|红细胞|血小板|WBC|RBC|PLT/i.test(text)) return 'blood_routine';
  if (/血脂|胆固醇|甘油三酯|脂蛋白|HDL|LDL|TC\b|TG\b/i.test(text)) return 'blood_lipid';
  if (/甲状腺|甲功|FT3|FT4|TSH|促甲状腺/i.test(text)) return 'thyroid_function';
  if (/尿常规|尿液|尿沉渣|尿蛋白|尿潜血/.test(text)) return 'urine_routine';
  if (text === '血常规') return 'blood_routine';
  if (text === '血脂') return 'blood_lipid';
  if (text === '甲功') return 'thyroid_function';
  if (text === '尿常规') return 'urine_routine';
  if (/ACTH|促肾上腺皮质/i.test(text)) return 'acth';
  const isCt = /(?:^|[^A-Z])CT(?:[^A-Z]|$)/i.test(text);
  if (isCt && /平扫/.test(text)) return 'ct_plain';
  if (isCt && /增强/.test(text)) return 'ct_enhanced';
  if (isCt) return 'ct';
  if (/MRI|MR|核磁|磁共振/i.test(text)) return 'mri';
  if (/超声|彩超|B超/i.test(text)) return 'ultrasound';
  return metricKeyFromName(text || 'laboratory_report');
}

function inferExamPart(reportType: string, lines: string[]) {
  const text = `${reportType} ${lines.slice(0, 20).join(' ')}`;
  const parts: string[] = [];
  if (/胸|肺/.test(text)) parts.push('胸部');
  if (/腹/.test(text)) parts.push('腹部');
  if (/盆/.test(text)) parts.push('盆腔');
  if (/头|颅脑/.test(text)) parts.push('头部');
  if (/甲状腺/.test(text)) parts.push('甲状腺');
  return Array.from(new Set(parts)).join('/');
}

function inferExamMethod(reportType: string) {
  const text = compactText(reportType);
  const isCt = /(?:^|[^A-Z])CT(?:[^A-Z]|$)/i.test(text);
  if (isCt && /平扫/.test(text)) return 'CT平扫';
  if (isCt && /增强/.test(text)) return 'CT增强';
  if (isCt) return 'CT';
  if (/MRI|MR|核磁|磁共振/i.test(text)) return 'MRI';
  if (/超声|彩超|B超/i.test(text)) return '超声';
  return '';
}

function cleanMetricName(metricName: string) {
  return compactText(stripMetricReportMarkers(metricName))
    .replace(/^\d+\s*/, '')
    .replace(/^[*★▲△◆◇●○\s]+/, '')
    .replace(/^\d+\s*/, '');
}

function isMetadataMetricName(metricName: string) {
  return /姓名|性别|年龄|科室|科别|样本|编号|时间|日期|医生|医师|报告|审核|申请|接收|采样|送检|检验者|审核者|项目|结果|结果状态|参考范围|参考区间|单位|方法学|单号|条码|解释与建议|临床意义|签署|注|正常非孕|哺乳期|孕早期|孕中期|孕晚期|妊娠/.test(cleanMetricName(metricName));
}

function cleanUnit(unit: string) {
  return stopAtNextInlineLabel(unit, '');
}

function isLikelyLabUnitText(value: string) {
  const text = compactText(value);
  return /^(?:%|10\^?\d+\/L|[\u03bcnpmu]?mol\/L|mmol\/L|g\/L|U\/L|IU\/L|mIU\/L|ng\/L|pg\/mL|fL|pg|L\/L)$/i.test(text);
}

function isBloodRoutineMetricName(metricName: string) {
  if (/降钙素原|procalcitonin/i.test(metricName)) return false;
  return /白细胞|红细胞|血红蛋白|血小板|粒细胞|淋巴细胞|单核细胞|嗜酸|嗜碱|有核|未成熟|WBC|RBC|HGB|HCT|MCV|MCHC?|PLT|MPV|PDW|PCT|RDW|NRBC|ALY|LIC|Neu|Lym|Mon|Eos|Bas|P-LCR|P-LCC/i.test(metricName);
}

function categoryFromMetric(cleanName: string, metricKey: string) {
  const bloodRoutineKeys = new Set([
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
    'rbc',
    'hgb',
    'hct',
    'mcv',
    'mch',
    'mchc',
    'plt',
    'mpv',
    'pdw',
    'pct',
    'rdw_cv',
    'rdw_sd',
    'p_lcr',
    'p_lcc',
    'nrbc_abs',
    'nrbc_percent'
  ]);
  const lipidKeys = new Set(['total_cholesterol', 'triglyceride', 'hdl_cholesterol', 'ldl_cholesterol']);
  const thyroidKeys = new Set(['ft3', 'ft4', 't3', 't4', 'tsh']);
  const liverFunctionKeys = new Set(['ast', 'alt']);
  const kidneyFunctionKeys = new Set(['creatinine', 'uric_acid']);
  if (isBloodRoutineMetricName(cleanName) || bloodRoutineKeys.has(metricKey)) return 'blood_routine';
  if (lipidKeys.has(metricKey) || /鑳嗗浐閱噟鐢樻补涓夐叝|鑴傝泲鐧絴琛€鑴?/i.test(cleanName)) return 'blood_lipid';
  if (thyroidKeys.has(metricKey) || /甲状腺|鐢茬姸鑵簗/i.test(cleanName)) return 'thyroid_function';
  if (liverFunctionKeys.has(metricKey) || /氨基转移酶|转氨酶/i.test(cleanName)) return 'liver_function';
  if (kidneyFunctionKeys.has(metricKey) || /肌酐|尿酸/i.test(cleanName)) return 'kidney_function';
  if (metricKey === 'acth' || /ACTH|促肾上腺皮质/i.test(cleanName)) return 'endocrine';
  return 'other';
}

function categoryCnFromType(reportType: string) {
  if (reportType === 'blood_routine') return '血常规';
  if (reportType === 'blood_lipid') return '血脂';
  if (reportType === 'thyroid_function') return '甲状腺功能';
  if (reportType === 'liver_function') return '肝功能';
  if (reportType === 'kidney_function') return '肾功能';
  if (reportType === 'endocrine') return '内分泌';
  return '其他';
}

function canonicalMetricNameFromCodeHint(metricKey: string, keyHint: string) {
  if (!compactText(keyHint)) return '';
  if (metricKey === 't3') return '\u8840\u6e05\u4e09\u7898\u7532\u72b6\u539f\u6c28\u9178';
  if (metricKey === 't4') return '\u8840\u6e05\u7532\u72b6\u817a\u7d20';
  if (metricKey === 'tsh') return '\u8840\u6e05\u4fc3\u7532\u72b6\u817a\u6fc0\u7d20';
  return '';
}

function metricFromParts(metricName: string, valueText: string, refText: string, unit: string, confidence = 0.85, keyHint = '') {
  const markerInfo = extractMetricReportMarkers(metricName);
  const cleanName = cleanMetricName(markerInfo.cleanName || metricName);
  if (!cleanName) return null;
  if (isMetadataMetricName(cleanName)) return null;
  const valueNumeric = parseNumeric(valueText);
  const range = parseRefRange(refText);
  const metricKey = metricKeyFromName(keyHint || cleanName);
  const displayName = canonicalMetricNameFromCodeHint(metricKey, keyHint) || cleanName;
  const inferredReportType = categoryFromMetric(cleanName, metricKey);
  const reportType = isBloodRoutineMetricName(cleanName)
    ? 'blood_routine'
    : /胆固醇|甘油三酯|脂蛋白|血脂/.test(cleanName)
      ? 'blood_lipid'
      : 'other';
  const normalizedUnit = cleanUnit(unit);
  return {
    metricKey,
    metricName: displayName,
    originalMetricName: markerInfo.markers.length ? markerInfo.markedName : cleanName,
    reportMarkers: markerInfo.markers,
    category: inferredReportType,
    categoryCn: categoryCnFromType(inferredReportType),
    mappingStatus: ['blood_routine', 'blood_lipid', 'thyroid_function', 'liver_function', 'kidney_function', 'endocrine'].includes(inferredReportType) ? 'suggested' : 'pending',
    valueType: valueNumeric === null ? 'text' : 'quantitative',
    valueNumeric,
    valueQualitative: valueNumeric === null ? compactText(valueText) : null,
    valueText: compactText(valueText),
    unit: normalizedUnit || null,
    refRangeLow: range.low,
    refRangeHigh: range.high,
    refQualitative: null,
    refText: compactText(refText),
    tone: calculateTone(valueNumeric, range.low, range.high, valueText),
    ocrConfidence: confidence
  };
}

function splitIndexedMetricSegments(line: string) {
  const text = compactText(line)
    .replace(/[：:]/g, ' ')
    .replace(/\s+/g, ' ');
  const starts: number[] = [];
  const startPattern = /(?:^|\s)(\d{1,2})\s+(?=[*★▲△◆◇●○]?\s*[\u4e00-\u9fffA-Za-z])/g;
  let match: RegExpExecArray | null;
  while ((match = startPattern.exec(text))) {
    starts.push(match.index + (match[0].startsWith(' ') ? 1 : 0));
  }
  if (!starts.length) return [text];
  return starts.map((start, index) => text.slice(start, starts[index + 1] || text.length).trim());
}

function splitUnindexedMetricSegments(line: string) {
  const text = compactText(line)
    .replace(/[：:]/g, ' ')
    .replace(/\s+/g, ' ');
  if (!text || /^\d+\s+/.test(text)) return [text];
  const starts: number[] = [];
  const startPattern = /(?:^|\s)([*★▲△◆◇●○]?(?:白细胞|红细胞|血红蛋白|血小板|中性粒细胞|淋巴细胞|单核细胞|嗜酸|嗜碱|总胆固醇|甘油三酯|高密度脂蛋白|低密度脂蛋白|天门冬氨酸氨基转移酶|天冬氨酸氨基转移酶|丙氨酸氨基转移酶|肌酐|尿酸|WBC|RBC|HGB|HCT|MCV|MCH|MCHC|PLT|MPV|PDW|PCT|AST|ALT|ACTH|FT3|FT4|TSH)(?=[^\d\n]*\s+[-+]?\d+(?:\.\d+)?))/gi;
  let match: RegExpExecArray | null;
  while ((match = startPattern.exec(text))) {
    starts.push(match.index + (match[0].startsWith(' ') ? 1 : 0));
  }
  if (starts.length <= 1) return [text];
  return starts.map((start, index) => text.slice(start, starts[index + 1] || text.length).trim());
}

function parseIndexedLabMetricSegment(segment: string) {
  const text = compactText(segment);
  const match = text.match(/^\d+\s+(.+?)\s+([-+]?\d+(?:\.\d+)?)\s*([↑↓HhLl]|偏高|偏低|高|低)?\s+((?:[<>]=?|≤|≥)?\s*[-+]?\d+(?:\.\d+)?(?:\s*(?:[-~～—–]|至|到)\s*[-+]?\d+(?:\.\d+)?)?)\s+(.+)$/);
  if (!match) return null;
  if (isMetadataMetricName(match[1])) return null;
  if (containsNextMetricStart(match[5])) return null;
  return metricFromParts(match[1], [match[2], match[3]].filter(Boolean).join(' '), match[4], match[5], 0.82);
}

function containsNextMetricStart(value: string) {
  return /\s(?:\d{1,3}\s+)?[*★▲△◆◇●○]?(?:白细胞|红细胞|血红蛋白|血小板|中性粒细胞|淋巴细胞|单核细胞|嗜酸|嗜碱|总胆固醇|甘油三酯|高密度脂蛋白|低密度脂蛋白|天门冬氨酸氨基转移酶|天冬氨酸氨基转移酶|丙氨酸氨基转移酶|肌酐|尿酸|WBC|RBC|HGB|HCT|MCV|MCH|MCHC|PLT|MPV|PDW|PCT|AST|ALT|ACTH|FT3|FT4|TSH)(?:[^\d\n]*\s+[-+]?\d+(?:\.\d+)?)?/i.test(value);
}

function parseUnindexedLabMetricLine(line: string) {
  const text = compactText(line)
    .replace(/[：:]/g, ' ')
    .replace(/\s+/g, ' ');
  if (!text || /^\d+\s+/.test(text)) return null;
  const match = text.match(/^(.+?)\s+([-+]?\d+(?:\.\d+)?)\s*([↑↓HhLl]|偏高|偏低|高|低)?\s+((?:[<>]=?|≤|≥)?\s*[-+]?\d+(?:\.\d+)?(?:\s*(?:[-~～—–]|至|到)\s*[-+]?\d+(?:\.\d+)?)?)\s+(.+)$/);
  if (!match) return null;
  const name = match[1];
  if (isMetadataMetricName(name)) return null;
  if (containsNextMetricStart(match[5])) return null;
  const metric = metricFromParts(name, [match[2], match[3]].filter(Boolean).join(' '), match[4], match[5], 0.78);
  if (!metric || metric.category === 'other') return null;
  return metric;
}

function parseWhitespaceCodeMetricLine(line: string) {
  const text = cleanMarkdownLine(line)
    .replace(/\*\*/g, '')
    .replace(/[：:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text || !/\d/.test(text)) return null;
  const match = text.match(/^(?:\d+\s+)?(.+?)\s+([A-Za-z][A-Za-z0-9%+\-/().]*)\s+([-+]?\d+(?:\.\d+)?(?:\s*(?:[↑↓HhLl]|偏高|偏低|高|低))?)\s+([^\s]+)\s+(.+)$/);
  if (!match) return null;
  const [, name, codeHint, valueText, unit, refText] = match;
  if (isMetadataMetricName(name)) return null;
  if (!isLikelyLabUnitText(unit)) return null;
  if (containsNextMetricStart(refText)) return null;
  const metric = metricFromParts(name, valueText, refText, unit, 0.8, codeHint);
  if (!metric || metric.category === 'other') return null;
  return metric;
}

function parseWhitespaceCodeLabMetricsFromRawText(lines: string[]) {
  const metrics: any[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const metric = parseWhitespaceCodeMetricLine(line);
    if (!metric) continue;
    const identity = metricIdentity(metric);
    if (seen.has(identity)) continue;
    seen.add(identity);
    metrics.push(metric);
  }
  return metrics;
}

function isKnownMetricName(value: string) {
  const name = cleanMetricName(value);
  if (!name || isMetadataMetricName(name)) return false;
  const metricKey = metricKeyFromName(name);
  return categoryFromMetric(name, metricKey) !== 'other';
}

function normalizeLabeledBlockLine(line: string) {
  return cleanMarkdownLine(line)
    .replace(/\*\*/g, '')
    .replace(/^[-•]\s*/, '')
    .trim();
}

function labeledField(line: string, label: string) {
  const text = normalizeLabeledBlockLine(line);
  const match = text.match(new RegExp(`${flexibleLabelSource(label)}(?:\\s*[：:]\\s*|\\s+)(.*)$`));
  if (match) return { matched: true, value: cleanInlineLabelValue(match[1] || '') };
  const emptyMatch = text.match(new RegExp(`${flexibleLabelSource(label)}\\s*[：:]?\\s*$`));
  return { matched: !!emptyMatch, value: '' };
}

function labeledValue(line: string, label: string) {
  return labeledField(line, label).value;
}

function isLabeledBlockBoundary(line: string) {
  const text = normalizeLabeledBlockLine(line);
  return /^-{3,}$/.test(text) || /^#{2,}\s+/.test(compactText(line));
}

function isMetricNameCandidateFromLabeledBlock(line: string) {
  const text = normalizeLabeledBlockLine(line)
    .replace(/^#{2,}\s*/, '')
    .replace(/^项目名称\s*$/, '')
    .trim();
  if (!text || isMetadataMetricName(text)) return false;
  if (/^(?:项目简称|结果|单位|参考区间|参考范围|方法学|结果状态)\b/.test(text)) return false;
  return isKnownMetricName(text)
    || /[（(]\s*[A-Za-z][A-Za-z0-9%#-]*\s*[)）]/.test(text)
    || /^[A-Za-z][A-Za-z0-9%#-]*$/.test(text)
    || (/[\u4e00-\u9fffA-Za-z]/.test(text) && !/报告|医院|姓名|性别|年龄|科室|样本|编号|时间|日期|医生|医师/.test(text));
}

function metricNameBeforeLabeledCode(lines: string[], codeIndex: number) {
  for (let index = codeIndex - 1; index >= Math.max(0, codeIndex - 5); index -= 1) {
    const text = normalizeLabeledBlockLine(lines[index]).replace(/^#{2,}\s*/, '').trim();
    if (!text) continue;
    if (/^-{3,}$/.test(text)) break;
    if (isMetricNameCandidateFromLabeledBlock(text)) return text;
  }
  return '';
}

function labeledValueAfter(lines: string[], startIndex: number, labels: string[]) {
  for (let index = startIndex + 1; index < Math.min(lines.length, startIndex + 14); index += 1) {
    if (index > startIndex + 1 && isLabeledBlockBoundary(lines[index])) break;
    for (const label of labels) {
      const field = labeledField(lines[index], label);
      if (field.matched) return { value: field.value, index };
    }
  }
  return { value: '', index: -1 };
}

function rangeFromLabeledRef(lines: string[], refIndex: number, inlineRef: string) {
  if (refIndex < 0) return '';
  const inlineRange = parseRefRange(inlineRef);
  if (inlineRange.low !== null || inlineRange.high !== null) return inlineRef;
  let firstRange = '';
  for (let index = refIndex + 1; index < Math.min(lines.length, refIndex + 12); index += 1) {
    if (isLabeledBlockBoundary(lines[index])) break;
    const text = normalizeLabeledBlockLine(lines[index]);
    if (/^(?:项目名称|项目简称|结果|单位|方法学|结果状态|注|签署)\b/.test(text)) break;
    const range = parseRefRange(text);
    if (range.low === null && range.high === null) continue;
    if (!firstRange) firstRange = text;
    if (!/(?:妊娠|孕早期|孕中期|孕晚期|孕\d|\d+周|哺乳)/.test(text)) return text;
  }
  return firstRange;
}

function unitFromValueText(valueText: string) {
  const match = compactText(valueText).match(/\b(%|10\^?\d+\/L|[\u03bcnpmu]?mol\/L|mmol\/L|g\/L|U\/L|IU\/L|mIU\/L|ng\/L|pg\/mL|fL|pg|L\/L)\b/i);
  return match ? match[1] : '';
}

function labeledMetricConflict(left: any, right: any) {
  if (left.metricKey !== right.metricKey) return false;
  const leftValue = metricNumericValue(left);
  const rightValue = metricNumericValue(right);
  const leftUnit = compactText(left.unit).toLowerCase();
  const rightUnit = compactText(right.unit).toLowerCase();
  if (leftValue !== null && rightValue !== null && Math.abs(leftValue - rightValue) > 0.0001) return true;
  return !!leftUnit && !!rightUnit && leftUnit !== rightUnit;
}

function dedupeLabeledBlockMetrics(metrics: any[]) {
  const byKey = new Map<string, any>();
  for (const metric of metrics) {
    const existing = byKey.get(metric.metricKey);
    if (!existing) {
      byKey.set(metric.metricKey, metric);
      continue;
    }
    if (labeledMetricConflict(existing, metric)) return [];
  }
  return [...byKey.values()];
}

function parseLabeledBlockLabMetricsFromRawText(lines: string[]) {
  const metrics: any[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const codeHint = labeledValue(lines[index], '项目简称');
    if (!codeHint) continue;
    const name = metricNameBeforeLabeledCode(lines, index);
    const result = labeledValueAfter(lines, index, ['结果']);
    const unitValue = labeledValueAfter(lines, index, ['单位']);
    const ref = labeledValueAfter(lines, index, ['参考区间', '参考范围']);
    const unit = unitValue.value || unitFromValueText(result.value);
    const refText = rangeFromLabeledRef(lines, ref.index, ref.value);
    if (!name || !result.value || !unit || !isLikelyLabUnitText(unit) || !refText) continue;
    const refRange = parseRefRange(refText);
    if (refRange.low === null && refRange.high === null) continue;
    const metric = metricFromParts(name, result.value, refText, unit, 0.72, codeHint);
    if (!metric || metric.category === 'other') continue;
    metrics.push(metric);
  }
  return dedupeLabeledBlockMetrics(metrics);
}

function parseResultRefUnitLine(line: string) {
  const text = compactText(line)
    .replace(/[：:]/g, ' ')
    .replace(/\s+/g, ' ');
  const match = text.match(/^([-+]?\d+(?:\.\d+)?)\s*([↑↓HhLl]|偏高|偏低|高|低)?\s+((?:[<>]=?|≤|≥)?\s*[-+]?\d+(?:\.\d+)?(?:\s*(?:[-~～—–]|至|到)\s*[-+]?\d+(?:\.\d+)?)?)\s+(.+)$/);
  if (!match) return null;
  if (containsNextMetricStart(match[4])) return null;
  return {
    valueText: [match[1], match[2]].filter(Boolean).join(' '),
    refText: match[3],
    unit: match[4]
  };
}

function metricIdentity(metric: any) {
  return [metric.metricKey, metric.valueText, metric.refText, metric.unit]
    .map((item) => compactText(item).toLowerCase())
    .join('|');
}

function parseIndexedLabMetricsFromRawText(lines: string[]) {
  const metrics: any[] = [];
  const seen = new Set<string>();
  const candidates = [
    ...lines,
    ...lines.slice(0, -1).map((line, index) => `${line} ${lines[index + 1]}`),
    ...lines.slice(0, -3).map((line, index) => `${line} ${lines[index + 1]} ${lines[index + 2]} ${lines[index + 3]}`)
  ];
  for (const candidate of candidates) {
    for (const segment of splitIndexedMetricSegments(candidate)) {
      const metric = parseIndexedLabMetricSegment(segment);
      if (!metric) continue;
      const identity = metricIdentity(metric);
      if (seen.has(identity)) continue;
      seen.add(identity);
      metrics.push(metric);
    }
  }
  return metrics;
}

function parseUnindexedLabMetricsFromRawText(lines: string[]) {
  const metrics: any[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    for (const segment of splitUnindexedMetricSegments(line)) {
      const metric = parseUnindexedLabMetricLine(segment);
      if (!metric) continue;
      const identity = metricIdentity(metric);
      if (seen.has(identity)) continue;
      seen.add(identity);
      metrics.push(metric);
    }
  }
  return metrics;
}

function parseSplitLineLabMetricsFromRawText(lines: string[]) {
  const metrics: any[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < lines.length - 1; index += 1) {
    const name = compactText(lines[index]);
    if (!isKnownMetricName(name)) continue;
    const resultParts = parseResultRefUnitLine(lines[index + 1]);
    if (!resultParts) continue;
    const metric = metricFromParts(name, resultParts.valueText, resultParts.refText, resultParts.unit, 0.76);
    if (!metric) continue;
    const identity = metricIdentity(metric);
    if (seen.has(identity)) continue;
    seen.add(identity);
    metrics.push(metric);
  }
  return metrics;
}

type DelimitedColumnMap = {
  nameIndex: number;
  codeIndex: number;
  valueIndex: number;
  refIndex: number;
  unitIndex: number;
  width: number;
  groupWidth: number;
};

function cleanDelimitedCell(value: string) {
  return compactText(value)
    .replace(/^\*\*|\*\*$/g, '')
    .replace(/^`|`$/g, '')
    .trim();
}

function splitDelimitedCells(line: string) {
  const text = compactText(line);
  if (text.includes('|')) {
    return text.split('|').map(cleanDelimitedCell).filter(Boolean);
  }
  if (text.includes('\t')) {
    return text.split(/\t+/).map(cleanDelimitedCell).filter(Boolean);
  }
  return [];
}

function isMarkdownSeparatorRow(cells: string[]) {
  return cells.length > 0 && cells.every((cell) => /^:?-{2,}:?$/.test(cell));
}

function headerIndex(cells: string[], pattern: RegExp) {
  return cells.findIndex((cell) => pattern.test(cell));
}

function columnMapFromHeader(cells: string[]): DelimitedColumnMap | null {
  const nameHeaderPattern = /\u9879\u76ee|\u540d\u79f0|item|test|\u68c0\u9a8c|\u68c0\u67e5/i;
  const nameIndex = headerIndex(cells, nameHeaderPattern);
  const codeIndex = headerIndex(cells, /\u7b80\u79f0|\u4ee3\u7801|code|abbr/i);
  const valueIndex = headerIndex(cells, /\u7ed3\u679c|result/i);
  const refIndex = headerIndex(cells, /\u53c2\u8003|\u8303\u56f4|reference|range/i);
  const unitIndex = headerIndex(cells, /\u5355\u4f4d|unit/i);
  if (nameIndex < 0 || valueIndex < 0) return null;
  const nextNameIndex = cells.findIndex((cell, index) => index > nameIndex && nameHeaderPattern.test(cell));
  const groupWidth = nextNameIndex > nameIndex
    ? nextNameIndex - nameIndex
    : Math.max(nameIndex, valueIndex, refIndex, unitIndex) + 1;
  return {
    nameIndex,
    codeIndex,
    valueIndex,
    refIndex,
    unitIndex,
    width: cells.length,
    groupWidth
  };
}

function isResultMarkerCell(value: string) {
  return /^[↑↓HhLl]$/.test(compactText(value)) || /^(?:\u504f\u9ad8|\u504f\u4f4e|\u9ad8|\u4f4e)$/.test(compactText(value));
}

function hasMetricValueSignal(value: string) {
  return /\d|[+-]|阳性|阴性|positive|negative/i.test(value);
}

function isLikelyDelimitedUnitCell(value: string) {
  return isLikelyLabUnitText(value);
}

function isLikelyDelimitedRefCell(value: string) {
  const text = compactText(value);
  if (!text) return false;
  return /(?:[<>]=?|≤|≥|鈮?[<>]?)\s*[-+]?\d+(?:\.\d+)?/.test(text)
    || /[-+]?\d+(?:\.\d+)?\s*(?:[-~～—–]|至|到)\s*[-+]?\d+(?:\.\d+)?/.test(text);
}

function isLikelyDelimitedMetricStart(cells: string[], start: number, columnMap: DelimitedColumnMap) {
  const name = cleanMetricName(cells[start + columnMap.nameIndex] || '');
  const value = cells[start + columnMap.valueIndex] || '';
  if (!name || !hasMetricValueSignal(value)) return false;
  if (isMetadataMetricName(name)) return false;
  if (/\u9879\u76ee|\u540d\u79f0|item|test|\u7ed3\u679c|result/i.test(name)) return false;
  if (/^\d+(?:\.\d+)?(?:\s*[-~]\s*\d+(?:\.\d+)?)?$/.test(name)) return false;
  if (isLikelyDelimitedUnitCell(name)) return false;
  return /[\u4e00-\u9fffA-Za-z]/.test(name);
}

function delimitedMetricGroupStarts(cells: string[], columnMap: DelimitedColumnMap) {
  const starts: number[] = [];
  for (let start = 0; start + columnMap.valueIndex < cells.length; start += 1) {
    if (isLikelyDelimitedMetricStart(cells, start, columnMap)) {
      starts.push(start);
    }
  }
  return starts.length ? starts : [0];
}

function delimitedMetricCellGroups(cells: string[], columnMap: DelimitedColumnMap) {
  const starts = delimitedMetricGroupStarts(cells, columnMap);
  return starts.map((start, index) => cells.slice(start, starts[index + 1] || cells.length));
}

function isLikelyOcrClassificationResidual(metricName: string, valueText: string, refText: string, unit: string) {
  const cleanName = cleanMetricName(metricName);
  if (!/分类/.test(cleanName)) return false;
  const metricKey = metricKeyFromName(cleanName);
  const valueNumeric = parseNumeric(valueText);
  const range = parseRefRange(refText);
  const normalizedUnit = cleanUnit(unit);
  if (metricKey === 'rbc') {
    return /10\^?9\/L/i.test(normalizedUnit) || (range.low === 3.5 && range.high === 9.5);
  }
  if (['wbc', 'lym_percent', 'mon_percent', 'eos_percent', 'bas_percent'].includes(metricKey)) {
    return valueNumeric === 0 && range.high !== null && range.high <= 0.5;
  }
  return false;
}

function parseDelimitedMetricCellGroup(
  cells: string[],
  nameIndex: number,
  codeIndex: number,
  valueIndex: number,
  refIndex: number,
  unitIndex: number
) {
  if (cells.length < 3) return null;
  const name = cells[nameIndex] || '';
  const codeHint = codeIndex >= 0 ? (cells[codeIndex] || '') : '';
  const markerOffset = isResultMarkerCell(cells[valueIndex + 1] || '') ? 1 : 0;
  const value = [cells[valueIndex], cells[valueIndex + 1]]
    .filter((item, index) => index === 0 || isResultMarkerCell(item || ''))
    .join(' ')
    .trim();
  let ref = refIndex >= 0 ? (cells[refIndex + markerOffset] || '') : '';
  if (!ref && unitIndex >= 0) {
    const shiftedRef = cells[unitIndex + markerOffset + 1] || '';
    if (isLikelyDelimitedRefCell(shiftedRef)) ref = shiftedRef;
  }
  const unit = unitIndex >= 0 ? (cells[unitIndex + markerOffset] || '') : '';
  if (!name || isMetadataMetricName(name) || /\u9879\u76ee|\u540d\u79f0|item|test|\u7ed3\u679c|result/i.test(name)) return null;
  if (!hasMetricValueSignal(value)) return null;
  if (isLikelyOcrClassificationResidual(name, value, ref, unit)) return null;
  return metricFromParts(name, value, ref, unit, 0.8, codeHint);
}

function parseDelimitedMetricCells(rawCells: string[], columnMap: DelimitedColumnMap | null) {
  if (isMarkdownSeparatorRow(rawCells)) return [];
  let cells = rawCells;
  let nameIndex = 0;
  let codeIndex = -1;
  let valueIndex = 1;
  let refIndex = 2;
  let unitIndex = 3;

  if (columnMap) {
    nameIndex = columnMap.nameIndex;
    codeIndex = columnMap.codeIndex;
    valueIndex = columnMap.valueIndex;
    refIndex = columnMap.refIndex;
    unitIndex = columnMap.unitIndex;
    return delimitedMetricCellGroups(cells, columnMap)
      .map((group) => parseDelimitedMetricCellGroup(group, nameIndex, codeIndex, valueIndex, refIndex, unitIndex))
      .filter(Boolean);
  }

  if (/^\d{1,3}$/.test(cells[0] || '')) {
    cells = cells.slice(1);
  }

  if (cells.length >= 5 && isResultMarkerCell(cells[2])) {
    valueIndex = 1;
    refIndex = 3;
    unitIndex = 4;
  }

  const metric = parseDelimitedMetricCellGroup(cells, nameIndex, codeIndex, valueIndex, refIndex, unitIndex);
  return metric ? [metric] : [];
}

function parseDelimitedLabMetricsFromRawText(lines: string[]) {
  const metrics: any[] = [];
  const seen = new Set<string>();
  let columnMap: DelimitedColumnMap | null = null;
  for (const line of lines) {
    const cells = splitDelimitedCells(line);
    if (!cells.length) continue;
    if (isMarkdownSeparatorRow(cells)) continue;
    const nextColumnMap = columnMapFromHeader(cells);
    if (nextColumnMap) {
      columnMap = nextColumnMap;
      continue;
    }
    for (const metric of parseDelimitedMetricCells(cells, columnMap)) {
      const identity = metricIdentity(metric);
      if (seen.has(identity)) continue;
      seen.add(identity);
      metrics.push(metric);
    }
  }
  return metrics;
}

function parseLabMetricsFromRawText(lines: string[]) {
  const indexedMetrics = parseIndexedLabMetricsFromRawText(lines);
  const delimitedMetrics = parseDelimitedLabMetricsFromRawText(lines);
  const whitespaceCodeMetrics = parseWhitespaceCodeLabMetricsFromRawText(lines);
  const labeledBlockMetrics = parseLabeledBlockLabMetricsFromRawText(lines);
  const unindexedMetrics = parseUnindexedLabMetricsFromRawText(lines);
  const splitLineMetrics = parseSplitLineLabMetricsFromRawText(lines);
  if (indexedMetrics.length || delimitedMetrics.length || whitespaceCodeMetrics.length || labeledBlockMetrics.length || unindexedMetrics.length || splitLineMetrics.length) {
    const metrics: any[] = [];
    const seen = new Set<string>();
    const fallbackMetrics = (whitespaceCodeMetrics.length || labeledBlockMetrics.length) ? [] : unindexedMetrics.concat(splitLineMetrics);
    for (const metric of indexedMetrics.concat(delimitedMetrics, whitespaceCodeMetrics, labeledBlockMetrics, fallbackMetrics)) {
      const identity = metricIdentity(metric);
      if (seen.has(identity)) continue;
      seen.add(identity);
      metrics.push(metric);
    }
    return metrics;
  }
  const metrics: any[] = [];
  const headerIndex = lines.findIndex((line, index) => (
    line.includes('项目')
    && lines.slice(index, index + 6).some((candidate) => candidate.includes('结果'))
    && lines.slice(index, index + 8).some((candidate) => candidate.includes('参考'))
  ));
  if (headerIndex < 0) return metrics;

  let index = headerIndex + 1;
  while (index < lines.length && !lines[index].includes('单位')) index += 1;
  index += 1;

  while (index < lines.length) {
    const name = compactText(lines[index]);
    if (!name || /备注|说明|此报告|审核|医生|日期/.test(name)) break;
    if (isMetadataMetricName(name)) {
      index += 1;
      continue;
    }
    const valueText = compactText(lines[index + 1]);
    const refText = compactText(lines[index + 2]);
    const unit = compactText(lines[index + 3]);
    if (!valueText || !refText || /备注|说明|此报告/.test(valueText)) break;
    if (!/\d/.test(valueText) && !/[阴阳+-]/.test(valueText)) {
      index += 1;
      continue;
    }

    const metric = metricFromParts(name, valueText, refText, unit);
    if (metric && metric.category !== 'other') metrics.push(metric);
    index += 4;
  }
  return metrics;
}

function metricNumericValue(metric: any) {
  if (metric?.valueNumeric !== undefined && metric.valueNumeric !== null && metric.valueNumeric !== '') {
    const value = Number(metric.valueNumeric);
    return Number.isFinite(value) ? value : null;
  }
  return parseNumeric(metric?.valueText || metric?.valueQualitative || '');
}

function isStrongBloodRoutineContext(originalType: string, lines: string[], metrics: any[]) {
  if (reportTypeKey(originalType) !== 'blood_routine') return false;
  const headerText = lines.slice(0, 8).join(' ');
  if (/C反应蛋白|CRP|超敏|降钙素原|炎症|感染/i.test(headerText)) return false;
  if (!/血液细胞|血细胞|血常规|WBC|RBC|PLT/i.test(headerText)) return false;
  const bloodMetrics = metrics.filter((metric) => metric.category === 'blood_routine');
  const keys = new Set(metrics.map((metric) => metric.metricKey));
  return bloodMetrics.length >= 20 && ['wbc', 'rbc', 'hgb', 'plt'].every((key) => keys.has(key));
}

function isLikelyFalseInflammationMetricInBloodRoutine(metric: any) {
  if (!['hs_crp', 'crp', 'procalcitonin'].includes(String(metric?.metricKey || ''))) return false;
  const value = metricNumericValue(metric);
  const high = metric?.refRangeHigh === undefined || metric.refRangeHigh === null || metric.refRangeHigh === ''
    ? null
    : Number(metric.refRangeHigh);
  return value === 0 && (high === null || (Number.isFinite(high) && high <= 10));
}

function filterMetricsForReportContext(metrics: any[], originalType: string, lines: string[]) {
  if (!isStrongBloodRoutineContext(originalType, lines, metrics)) {
    return { metrics, warnings: [] as Array<{ code: string; message: string }> };
  }
  const suppressed = metrics.filter(isLikelyFalseInflammationMetricInBloodRoutine);
  if (!suppressed.length) {
    return { metrics, warnings: [] as Array<{ code: string; message: string }> };
  }
  const suppressedNames = suppressed.map((metric) => metric.metricName || metric.metricKey).join('、');
  return {
    metrics: metrics.filter((metric) => !isLikelyFalseInflammationMetricInBloodRoutine(metric)),
    warnings: [{
      code: 'OCR_SUSPECT_METRICS_SUPPRESSED',
      message: `OCR 可能把血常规末尾行误识别为 ${suppressedNames}，已从自动指标中移除，请核对原图。`
    }]
  };
}

function maxIndexedMetricNumber(lines: string[]) {
  let max = 0;
  for (const line of lines) {
    const candidates = splitDelimitedCells(line).length ? splitDelimitedCells(line) : [line];
    for (const candidate of candidates) {
      const text = compactText(candidate).replace(/[：:]/g, ' ');
      const match = text.match(/^(?:[*★▲△◆◇●○]?\s*)?(\d{1,2})\s+[*★▲△◆◇●○]?\s*[\u4e00-\u9fffA-Za-z]/);
      if (!match) continue;
      const value = Number(match[1]);
      if (Number.isFinite(value)) max = Math.max(max, value);
    }
  }
  return max;
}

function partialIndexedTableWarnings(originalType: string, lines: string[], metrics: any[]) {
  if (reportTypeKey(originalType) !== 'blood_routine') return [];
  const maxIndex = maxIndexedMetricNumber(lines);
  if (maxIndex < 20) return [];
  const bloodRoutineMetricCount = metrics.filter((metric) => metric.category === 'blood_routine').length;
  const missingCount = Math.max(0, maxIndex - bloodRoutineMetricCount);
  if (missingCount < 4) return [];
  return [{
    code: 'OCR_PARTIAL_INDEXED_TABLE',
    message: `OCR 原文显示这张血常规表至少编号到 ${maxIndex} 项，但当前只解析到 ${bloodRoutineMetricCount} 项，可能漏行或错行。请裁剪/重拍后重试，或人工核对补录。`
  }];
}

function parseFindingsFromRawText(lines: string[]) {
  const labels = ['检查所见', '检查意见', '诊断意见', '影像所见', '超声提示', '报告内容', '结论', '提示'];
  const findings: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const label = labels.find((candidate) => lines[index].includes(candidate));
    if (!label) continue;
    const inline = lines[index].split(/[：:]/).slice(1).join(':').trim();
    if (inline) findings.push(inline);
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const line = lines[cursor];
      if (labels.some((candidate) => line.includes(candidate)) || /审核|医生|日期|报告单/.test(line)) break;
      if (line) findings.push(line);
      if (findings.length >= 8) break;
    }
  }
  return Array.from(new Set(findings.map(compactText).filter(Boolean)));
}

function isReportLike(rawText: string) {
  return /报告|项目|结果|参考范围|检查所见|检查意见/.test(rawText);
}

export function draftFromRawOcr(rawText: string, group: RawOcrReportGroupRef) {
  const lines = rawOcrLines(rawText);
  const hospital = cleanHospitalName(preferredReportIssuerLine(lines)
    || firstLineAfterAnyLabel(lines, ALL_HOSPITAL_LABELS)
    || lineAfterColonLabel(lines, '医院')
    || lines.find((line) => /医院|卫生服务中心|社区卫生|检验中心|医学检验/.test(line))
    || '');
  const originalType = inferReportType(lines, firstLineAfterAnyLabel(lines, ALL_REPORT_TYPE_LABELS));
  const reportDate = firstDateAfterAnyLabel(lines, REPORT_ISSUE_DATE_LABELS)
    || firstDateAfterAnyLabel(lines, ALL_REPORT_DATE_LABELS)
    || firstDateInText(lines.slice(0, 20).join(' '));
  const examDate = firstDateAfterAnyLabel(lines, EXAM_DATE_LABELS);
  const parsedMetrics = parseLabMetricsFromRawText(lines);
  const contextFiltered = filterMetricsForReportContext(parsedMetrics, originalType, lines);
  const metrics = contextFiltered.metrics;
  const findings = metrics.length ? [] : parseFindingsFromRawText(lines);
  const hasImagingFindings = findings.length > 0;
  const examPart = hasImagingFindings ? inferExamPart(originalType, lines) : '';
  const examMethod = hasImagingFindings ? inferExamMethod(originalType) : '';
  const reportLike = isReportLike(rawText) || metrics.length > 0 || findings.length > 0;
  const qualityWarnings = partialIndexedTableWarnings(originalType, lines, metrics);
  const warnings: Array<{ code: string; message: string }> = [...contextFiltered.warnings, ...qualityWarnings];
  let status = reportLike ? 'needs_review' : 'not_report';
  if (!metrics.length && !findings.length && status !== 'not_report') {
    warnings.push({
      code: 'OCR_RAW_TEXT_UNSTRUCTURED',
      message: 'OCR returned text, but no laboratory metric table could be parsed automatically.'
    });
    status = 'needs_manual_input';
  }
  if (qualityWarnings.length && status === 'needs_review') {
    status = 'needs_manual_input';
  }

  return {
    caseId: `raw_${group.groupId}`,
    draftId: `raw_${group.groupId}`,
    sourcePhotoIds: group.photos.map((photo) => photo.photoId),
    pageCount: group.photos.length || 1,
    basicInfo: {
      type: originalType || '检验报告',
      originalType,
      typeKey: reportTypeKey(originalType),
      canonicalTypeName: originalType || '检验报告',
      modality: hasImagingFindings ? 'imaging' : 'laboratory',
      analysisPolicy: hasImagingFindings ? 'view_only' : 'metric_analysis',
      hospital,
      hospitalSource: hospital ? 'ocr' : 'unknown',
      reportDate,
      reportDateSource: reportDate ? 'ocr' : 'unknown',
      examDate,
      patientName: lineAfterLabel(lines, '姓名'),
      department: firstLineAfterAnyLabel(lines, ALL_DEPARTMENT_LABELS),
      orderNo: firstLineAfterAnyLabel(lines, ALL_ORDER_NO_LABELS),
      examPart,
      examMethod,
      reportLike,
      confidence: metrics.length ? 0.84 : 0.72
    },
    metrics,
    findings,
    conflicts: [],
    warnings,
    evidence: {
      rawText
    },
    status
  };
}
