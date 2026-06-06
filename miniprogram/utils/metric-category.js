const categoryLabels = {
  blood_routine: '\u8840\u5e38\u89c4',
  blood_lipid: '\u8840\u8102',
  thyroid_function: '\u7532\u72b6\u817a\u529f\u80fd',
  liver_function: '\u809d\u529f\u80fd',
  kidney_function: '\u80be\u529f\u80fd',
  endocrine: '\u6fc0\u7d20',
  tumor_marker: '\u80bf\u7624\u6807\u5fd7\u7269',
  custom: '\u81ea\u5b9a\u4e49',
  exam: '\u68c0\u67e5',
  imaging: '\u5f71\u50cf',
  ultrasound: 'B\u8d85',
  electrophysiology: '\u7535\u751f\u7406',
  pathology: '\u75c5\u7406',
  lab: '\u68c0\u9a8c',
  other: '\u5176\u4ed6'
};

const passthroughCategories = new Set(['custom', 'exam', 'imaging', 'ultrasound', 'electrophysiology', 'pathology', 'lab']);
const bloodRoutineMetricKeys = new Set(['wbc', 'neu_percent', 'lym_percent', 'mon_percent', 'eos_percent', 'bas_percent', 'neu_abs', 'lym_abs', 'mon_abs', 'eos_abs', 'bas_abs', 'aly_abs', 'aly_percent', 'lic_abs', 'lic_percent', 'nrbc_abs', 'nrbc_percent', 'rbc', 'hgb', 'hct', 'mcv', 'mch', 'mchc', 'rdw_cv', 'rdw_sd', 'plt', 'mpv', 'pdw', 'pct', 'p_lcr', 'p_lcc']);
const bloodLipidMetricKeys = new Set(['total_cholesterol', 'cholesterol', 'tc', 'triglyceride', 'tg', 'hdl_cholesterol', 'hdl', 'hdl_c', 'ldl_cholesterol', 'ldl', 'ldl_c']);
const thyroidMetricKeys = new Set(['ft3', 'ft4', 't3', 't4', 'tsh', 'tt3', 'tt4']);
const liverMetricKeys = new Set(['alt', 'ast', 'ggt', 'alp', 'tbil', 'dbil', 'ibil', 'albumin', 'globulin']);
const kidneyMetricKeys = new Set(['creatinine', 'crea', 'scr', 'uric_acid', 'ua', 'urea', 'bun']);
const endocrineMetricKeys = new Set(['acth', 'cortisol', 'progesterone', 'estradiol', 'fsh', 'lh', 'prl', 'testosterone']);
const tumorMarkerMetricKeys = new Set(['cea', 'afp', 'ca125', 'ca199', 'ca153', 'ca724', 'psa', 'fpsa']);

function compactText(value) {
  return String(value === undefined || value === null ? '' : value).trim().replace(/\s+/g, ' ');
}

function normalizeToken(value) {
  return compactText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function combinedText(input) {
  return [input.metricKey, input.metricName, input.originalMetricName, input.category, input.categoryCn].map(compactText).join(' ').toLowerCase();
}

function categoryAliasFromText(input) {
  const token = normalizeToken(`${compactText(input.category)} ${compactText(input.categoryCn)}`);
  const text = combinedText({ category: input.category, categoryCn: input.categoryCn });
  if (['blood_routine', 'blood_cell', 'blood_cells', 'blood_cell_test', 'blood_cell_report', 'blood_cell_test_report', 'hematology', 'cbc', 'cbc_diff', 'complete_blood_count'].includes(token)
    || /blood\s*(routine|cell)|complete\s*blood\s*count|cbc|\u8840\u5e38\u89c4|\u8840\u6db2\u7ec6\u80de|\u8840\u7ec6\u80de|\u5168\u8840/.test(text)) return 'blood_routine';
  if (['blood_lipid', 'blood_lipids', 'lipid', 'lipids', 'lipid_profile'].includes(token)
    || /lipid|cholesterol|hdl|ldl|\u8840\u8102|\u80c6\u56fa\u9187|\u7518\u6cb9\u4e09\u916f/.test(text)) return 'blood_lipid';
  if (['thyroid', 'thyroid_function', 'thyroid_panel'].includes(token)
    || /thyroid|ft3|ft4|tsh|\u7532\u529f|\u7532\u72b6\u817a/.test(text)) return 'thyroid_function';
  if (['liver', 'liver_function', 'hepatic_function'].includes(token)
    || /liver|hepatic|\u809d\u529f|\u8f6c\u6c28\u9176|\u80c6\u7ea2\u7d20/.test(text)) return 'liver_function';
  if (['kidney', 'kidney_function', 'renal_function'].includes(token)
    || /kidney|renal|\u80be\u529f|\u808c\u9150|\u5c3f\u9178|\u5c3f\u7d20/.test(text)) return 'kidney_function';
  if (['endocrine', 'endocrine_hormone', 'hormone', 'hormones'].includes(token)
    || /hormone|endocrine|acth|cortisol|progesterone|\u6fc0\u7d20|\u5185\u5206\u6ccc|\u5b55\u916e|\u96cc\u4e8c\u9187|\u76ae\u8d28\u9187/.test(text)) return 'endocrine';
  if (['tumor_marker', 'tumor_markers', 'tumour_marker'].includes(token)
    || /tumou?r|marker|cea|afp|ca125|ca199|psa|\u80bf\u7624\u6807\u5fd7/.test(text)) return 'tumor_marker';
  return '';
}

function categoryFromMetricIdentity(input) {
  const key = normalizeToken(input.metricKey);
  const text = combinedText(input);
  if (bloodRoutineMetricKeys.has(key) || /\bwbc\b|\brbc\b|\bhgb\b|\bhct\b|\bplt\b|\bmcv\b|\bmchc?\b|\brdw\b|\u767d\u7ec6\u80de|\u7ea2\u7ec6\u80de|\u8840\u7ea2\u86cb\u767d|\u8840\u5c0f\u677f/.test(text)) return 'blood_routine';
  if (bloodLipidMetricKeys.has(key) || /\bhdl\b|\bhdl-c\b|\bldl\b|\bldl-c\b|\btg\b|\btc\b|\u80c6\u56fa\u9187|\u7518\u6cb9\u4e09\u916f|\u9ad8\u5bc6\u5ea6|\u4f4e\u5bc6\u5ea6/.test(text)) return 'blood_lipid';
  if (thyroidMetricKeys.has(key) || /\bft3\b|\bft4\b|\btsh\b|\u7532\u72b6\u817a|\u4fc3\u7532\u72b6\u817a/.test(text)) return 'thyroid_function';
  if (liverMetricKeys.has(key) || /\balt\b|\bast\b|\bggt\b|\balp\b|\u8f6c\u6c28\u9176|\u80c6\u7ea2\u7d20/.test(text)) return 'liver_function';
  if (kidneyMetricKeys.has(key) || /creatinine|uric\s*acid|\bua\b|\bbun\b|\u808c\u9150|\u5c3f\u9178|\u5c3f\u7d20/.test(text)) return 'kidney_function';
  if (endocrineMetricKeys.has(key) || /\bacth\b|cortisol|progesterone|estradiol|\bfsh\b|\blh\b|\bprl\b|\u5b55\u916e|\u96cc\u4e8c\u9187|\u76ae\u8d28\u9187|\u4fc3\u5375\u6ce1|\u4fc3\u9ec4\u4f53/.test(text)) return 'endocrine';
  if (tumorMarkerMetricKeys.has(key) || /\bcea\b|\bafp\b|\bca\s*125\b|\bca\s*199\b|\bpsa\b|\u7532\u80ce\u86cb\u767d|\u764c\u80da\u6297\u539f/.test(text)) return 'tumor_marker';
  return '';
}

function normalizeMetricCategory(input = {}) {
  const rawCategory = compactText(input.category);
  const rawCategoryCn = compactText(input.categoryCn);
  const inferred = categoryFromMetricIdentity(input) || categoryAliasFromText(input);
  if (inferred) return { category: inferred, categoryCn: categoryLabels[inferred] };
  const rawToken = normalizeToken(rawCategory);
  if (passthroughCategories.has(rawToken)) {
    return { category: rawToken, categoryCn: rawCategoryCn || categoryLabels[rawToken] || rawCategory || categoryLabels.other };
  }
  if (rawCategory) return { category: rawToken || rawCategory, categoryCn: rawCategoryCn || rawCategory };
  return { category: 'other', categoryCn: rawCategoryCn || categoryLabels.other };
}

module.exports = {
  normalizeMetricCategory
};
