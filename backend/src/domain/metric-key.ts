type MetricKeyInput = {
  metricKey?: unknown;
  metricName?: unknown;
  originalMetricName?: unknown;
  category?: unknown;
  categoryCn?: unknown;
};

type CanonicalMetricKeyOptions = {
  fallback?: unknown;
  protectCustom?: boolean;
};

const metricKeyAliases: Record<string, string> = {
  neu_pct: 'neu_percent',
  neut_pct: 'neu_percent',
  neut_percent: 'neu_percent',
  neutrophil_percent: 'neu_percent',
  lym_pct: 'lym_percent',
  lymph_pct: 'lym_percent',
  lymph_percent: 'lym_percent',
  lymphocyte_percent: 'lym_percent',
  mon_pct: 'mon_percent',
  mono_pct: 'mon_percent',
  mono_percent: 'mon_percent',
  monocyte_percent: 'mon_percent',
  eos_pct: 'eos_percent',
  eosinophil_pct: 'eos_percent',
  eosinophil_percent: 'eos_percent',
  bas_pct: 'bas_percent',
  basophil_pct: 'bas_percent',
  basophil_percent: 'bas_percent',
  baso_pct: 'bas_percent',
  baso_percent: 'bas_percent',
  neu_count: 'neu_abs',
  neu: 'neu_abs',
  neut_count: 'neu_abs',
  neut: 'neu_abs',
  neutrophil: 'neu_abs',
  neutrophil_count: 'neu_abs',
  neut_abs: 'neu_abs',
  neutrophil_abs: 'neu_abs',
  lym_count: 'lym_abs',
  lym: 'lym_abs',
  lymph: 'lym_abs',
  lymphocyte: 'lym_abs',
  lymph_count: 'lym_abs',
  lymphocyte_count: 'lym_abs',
  lymph_abs: 'lym_abs',
  lymphocyte_abs: 'lym_abs',
  mon_count: 'mon_abs',
  mon: 'mon_abs',
  mono: 'mon_abs',
  monocyte: 'mon_abs',
  mono_count: 'mon_abs',
  monocyte_count: 'mon_abs',
  mono_abs: 'mon_abs',
  monocyte_abs: 'mon_abs',
  eos_count: 'eos_abs',
  eos: 'eos_abs',
  eosinophil: 'eos_abs',
  eosinophil_count: 'eos_abs',
  eosinophil_abs: 'eos_abs',
  bas_count: 'bas_abs',
  bas: 'bas_abs',
  basophil: 'bas_abs',
  basophil_count: 'bas_abs',
  basophil_abs: 'bas_abs',
  baso_count: 'bas_abs',
  baso_abs: 'bas_abs',
  aly_pct: 'aly_percent',
  aly_count: 'aly_abs',
  aly: 'aly_abs',
  atypical_lymphocyte: 'aly_abs',
  atypical_lymphocyte_percent: 'aly_percent',
  atypical_lymphocyte_count: 'aly_abs',
  lic_pct: 'lic_percent',
  lic_count: 'lic_abs',
  lic: 'lic_abs',
  ig_pct: 'ig_percent',
  ig_count: 'ig_abs',
  ig_abs: 'ig_abs',
  ig: 'ig_abs',
  immature_granulocyte: 'ig_abs',
  immature_granulocyte_percent: 'ig_percent',
  immature_granulocyte_count: 'ig_abs',
  immature_granulocyte_abs: 'ig_abs',
  immature_granulocyte_absolute: 'ig_abs',
  immature_granulocytes: 'ig_abs',
  immature_granulocytes_percent: 'ig_percent',
  immature_granulocytes_count: 'ig_abs',
  immature_granulocytes_abs: 'ig_abs',
  immature_granulocytes_absolute: 'ig_abs',
  immature_large_cell: 'lic_abs',
  immature_large_cell_percent: 'lic_percent',
  immature_large_cell_count: 'lic_abs',
  large_immature_cell: 'lic_abs',
  large_immature_cell_percent: 'lic_percent',
  large_immature_cell_count: 'lic_abs',
  large_immature_lymphocyte: 'lic_abs',
  large_immature_lymphocyte_percent: 'lic_percent',
  large_immature_lymphocyte_count: 'lic_abs',
  nrbc_pct: 'nrbc_percent',
  nrbc_count: 'nrbc_abs',
  nrbc: 'nrbc_abs',
  nucleated_rbc: 'nrbc_abs',
  nucleated_rbc_percent: 'nrbc_percent',
  nucleated_rbc_count: 'nrbc_abs',
  nucleated_red_blood_cell: 'nrbc_abs',
  nucleated_red_blood_cell_percent: 'nrbc_percent',
  nucleated_red_blood_cell_count: 'nrbc_abs',
  rd: 'rdw_cv',
  rdw: 'rdw_cv',
  rd_cv: 'rdw_cv',
  rd_sd: 'rdw_sd',
  rdw_cv: 'rdw_cv',
  rdw_sd: 'rdw_sd',
  plcr: 'p_lcr',
  p_lcr: 'p_lcr',
  plcc: 'p_lcc',
  p_lcc: 'p_lcc',
  pdw_cv: 'pdw',
  pdw_sd: 'pdw_sd',
  hfc_pct: 'hfc_percent',
  hfc_count: 'hfc_abs',
  high_fluorescence_cell: 'hfc_abs',
  high_fluorescence_cell_percent: 'hfc_percent',
  high_fluorescence_cell_count: 'hfc_abs',
  high_fluorescent_cell: 'hfc_abs',
  high_fluorescent_cell_percent: 'hfc_percent',
  high_fluorescent_cell_count: 'hfc_abs',
  c_reactive_protein: 'crp',
  c_reaction_protein: 'crp',
  nlr: 'nlr',
  neutrophil_lymphocyte_ratio: 'nlr',
  neutrophil_to_lymphocyte_ratio: 'nlr',
  plr: 'plr',
  platelet_lymphocyte_ratio: 'plr',
  platelet_to_lymphocyte_ratio: 'plr',
  white_blood_cell: 'wbc',
  white_blood_cell_count: 'wbc',
  white_blood_cells: 'wbc',
  red_blood_cell: 'rbc',
  red_blood_cell_count: 'rbc',
  red_blood_cells: 'rbc',
  hemoglobin: 'hgb',
  hb: 'hgb',
  hematocrit: 'hct',
  plateletcrit: 'pct',
  platelet_crit: 'pct',
  platelet_count: 'plt',
  platelet: 'plt',
  platelets: 'plt',
  hdl_c: 'hdl_cholesterol',
  ldl_c: 'ldl_cholesterol',
  tc: 'total_cholesterol',
  cho: 'total_cholesterol',
  chol: 'total_cholesterol',
  tg: 'triglyceride',
  triglycerides: 'triglyceride'
};

function compactText(value: unknown) {
  return String(value === undefined || value === null ? '' : value).trim();
}

export function normalizeMetricKeyToken(value: unknown) {
  const text = compactText(value).toLowerCase();
  if (!text) return '';
  if (text.endsWith('%')) {
    return `${text.slice(0, -1).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}_percent`;
  }
  if (text.endsWith('#')) {
    return `${text.slice(0, -1).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}_abs`;
  }
  return text.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function isCustomMetricKey(token: string, input: MetricKeyInput) {
  const category = normalizeMetricKeyToken(`${compactText(input.category)} ${compactText(input.categoryCn)}`);
  return token.startsWith('manual_')
    || token.startsWith('custom_')
    || category.includes('custom')
    || compactText(input.categoryCn) === '\u81ea\u5b9a\u4e49';
}

export function canonicalMetricKey(input: MetricKeyInput = {}, options: CanonicalMetricKeyOptions = {}) {
  const raw = compactText(input.metricKey);
  const fallback = compactText(options.fallback);
  const token = normalizeMetricKeyToken(raw);
  if (!token) return raw || fallback;
  if (options.protectCustom !== false && isCustomMetricKey(token, input)) return raw || token;
  return metricKeyAliases[token] || token;
}

export function sameCanonicalMetricKey(left: MetricKeyInput | string, right: MetricKeyInput | string) {
  const leftKey = typeof left === 'string' ? canonicalMetricKey({ metricKey: left }) : canonicalMetricKey(left);
  const rightKey = typeof right === 'string' ? canonicalMetricKey({ metricKey: right }) : canonicalMetricKey(right);
  return !!leftKey && !!rightKey && leftKey === rightKey;
}
