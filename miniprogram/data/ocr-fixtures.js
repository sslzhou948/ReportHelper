const rawRealcaseOcrDrafts = [
  {
    caseId: 'acth',
    draftId: 'fixture_acth',
    sourcePhotoIds: ['real_ACTH'],
    pageCount: 1,
    basicInfo: {
      type: '血浆ACTH (8AM)',
      typeKey: 'endocrine_acth',
      hospital: '北京协和医院',
      reportDate: '2025-12-22',
      patientName: '张艳华',
      department: '泌尿外科门诊',
      orderNo: '2210545265',
      confidence: 0.96
    },
    metrics: [
      {
        metricKey: 'acth',
        metricName: '促肾上腺皮质激素',
        category: 'endocrine',
        categoryCn: '内分泌',
        valueType: 'quantitative',
        valueNumeric: 301.0,
        unit: 'pg/ml',
        refRangeLow: 7.2,
        refRangeHigh: 63.3,
        tone: 'high',
        ocrConfidence: 0.95
      }
    ],
    conflicts: [],
    warnings: [],
    status: 'needs_review'
  },
  {
    caseId: 'thyroid',
    draftId: 'fixture_thyroid',
    sourcePhotoIds: ['real_thyroid'],
    pageCount: 1,
    basicInfo: {
      type: '甲功1',
      typeKey: 'thyroid_function',
      hospital: '北京协和医院',
      reportDate: '2025-12-22',
      patientName: '张艳华',
      department: '泌尿外科门诊',
      orderNo: '2210545239',
      confidence: 0.95
    },
    metrics: [
      { metricKey: 'ft3', metricName: '游离三碘甲状腺原氨酸', category: 'thyroid_function', categoryCn: '甲状腺功能', valueType: 'quantitative', valueNumeric: 3.65, unit: 'pg/ml', refRangeLow: 1.8, refRangeHigh: 4.1, tone: 'ok', ocrConfidence: 0.94 },
      { metricKey: 'ft4', metricName: '游离甲状腺素', category: 'thyroid_function', categoryCn: '甲状腺功能', valueType: 'quantitative', valueNumeric: 1.04, unit: 'ng/dl', refRangeLow: 0.81, refRangeHigh: 1.89, tone: 'ok', ocrConfidence: 0.94 },
      { metricKey: 'tsh', metricName: '促甲状腺激素', category: 'thyroid_function', categoryCn: '甲状腺功能', valueType: 'quantitative', valueNumeric: 3.596, unit: 'μIU/mL', refRangeLow: 0.38, refRangeHigh: 4.34, tone: 'ok', ocrConfidence: 0.94 }
    ],
    conflicts: [],
    warnings: [],
    status: 'needs_review'
  },
  {
    caseId: 'cortisol',
    draftId: 'fixture_cortisol',
    sourcePhotoIds: ['real_cortisol'],
    pageCount: 1,
    basicInfo: {
      type: '血清总皮质醇(8AM)',
      typeKey: 'endocrine_cortisol',
      hospital: '北京协和医院',
      reportDate: '2025-12-22',
      patientName: '张艳华',
      department: '泌尿外科门诊',
      orderNo: '2210545266',
      confidence: 0.96
    },
    metrics: [
      { metricKey: 'cortisol_8am', metricName: '血总皮质醇[8AM]', category: 'endocrine', categoryCn: '内分泌', valueType: 'quantitative', valueNumeric: 4.3, unit: 'μg/dl', refRangeLow: 4.0, refRangeHigh: 22.3, tone: 'ok', ocrConfidence: 0.95 }
    ],
    conflicts: [],
    warnings: [],
    status: 'needs_review'
  },
  {
    caseId: 'liver_function',
    draftId: 'fixture_liver_function',
    sourcePhotoIds: ['real_liver_function'],
    pageCount: 1,
    basicInfo: {
      type: '肝功',
      typeKey: 'liver_function',
      hospital: '北京协和医院',
      reportDate: '2026-01-23',
      patientName: '张艳华',
      department: '泌尿外科门诊',
      orderNo: '2211144594',
      confidence: 0.93
    },
    metrics: [
      { metricKey: 'alt', metricName: '丙氨酸氨基转移酶', category: 'liver_function', categoryCn: '肝功能', valueType: 'quantitative', valueNumeric: 23, unit: 'U/L', refRangeLow: 7, refRangeHigh: 40, tone: 'ok', ocrConfidence: 0.93 },
      { metricKey: 'tp', metricName: '总蛋白', category: 'liver_function', categoryCn: '肝功能', valueType: 'quantitative', valueNumeric: 69, unit: 'g/L', refRangeLow: 60, refRangeHigh: 85, tone: 'ok', ocrConfidence: 0.93 },
      { metricKey: 'alb', metricName: '白蛋白(BCG法)', category: 'liver_function', categoryCn: '肝功能', valueType: 'quantitative', valueNumeric: 43, unit: 'g/L', refRangeLow: 35, refRangeHigh: 52, tone: 'ok', ocrConfidence: 0.93 },
      { metricKey: 'tbil', metricName: '总胆红素', category: 'liver_function', categoryCn: '肝功能', valueType: 'quantitative', valueNumeric: 5.6, unit: 'μmol/L', refRangeLow: 5.1, refRangeHigh: 22.2, tone: 'ok', ocrConfidence: 0.93 },
      { metricKey: 'dbil', metricName: '直接胆红素', category: 'liver_function', categoryCn: '肝功能', valueType: 'quantitative', valueNumeric: 1.6, unit: 'μmol/L', refRangeLow: null, refRangeHigh: 6.8, tone: 'ok', ocrConfidence: 0.92 }
    ],
    conflicts: [],
    warnings: [],
    status: 'needs_review'
  },
  {
    caseId: 'uric_electrolyte_lipid',
    draftId: 'fixture_uric_electrolyte_lipid',
    sourcePhotoIds: ['real_uric_electrolyte_lipid'],
    pageCount: 1,
    basicInfo: {
      type: '尿酸、电解质、血脂',
      typeKey: 'biochemistry_lipid',
      hospital: '北京协和医院',
      reportDate: '2026-01-23',
      patientName: '张艳华',
      confidence: 0.88
    },
    metrics: [
      { metricKey: 'ast', metricName: '天门冬氨酸氨基转移酶', category: 'liver_function', categoryCn: '肝功能', valueType: 'quantitative', valueNumeric: 41, unit: 'U/L', refRangeLow: 13, refRangeHigh: 35, tone: 'high', ocrConfidence: 0.88 },
      { metricKey: 'k', metricName: '钾', category: 'electrolyte', categoryCn: '电解质', valueType: 'quantitative', valueNumeric: 4.0, unit: 'mmol/L', refRangeLow: 3.5, refRangeHigh: 5.5, tone: 'ok', ocrConfidence: 0.9 },
      { metricKey: 'na', metricName: '钠', category: 'electrolyte', categoryCn: '电解质', valueType: 'quantitative', valueNumeric: 138, unit: 'mmol/L', refRangeLow: 135, refRangeHigh: 145, tone: 'ok', ocrConfidence: 0.9 },
      { metricKey: 'cl', metricName: '氯', category: 'electrolyte', categoryCn: '电解质', valueType: 'quantitative', valueNumeric: 102, unit: 'mmol/L', refRangeLow: 96, refRangeHigh: 111, tone: 'ok', ocrConfidence: 0.9 },
      { metricKey: 'creatinine', metricName: '肌酐(酶法)', category: 'kidney_function', categoryCn: '肾功能', valueType: 'quantitative', valueNumeric: 43, unit: 'μmol/L', refRangeLow: 45, refRangeHigh: 84, tone: 'low', ocrConfidence: 0.87 },
      { metricKey: 'urea', metricName: '尿素', category: 'kidney_function', categoryCn: '肾功能', valueType: 'quantitative', valueNumeric: 3.4, unit: 'mmol/L', refRangeLow: 2.8, refRangeHigh: 7.2, tone: 'ok', ocrConfidence: 0.89 },
      { metricKey: 'glucose', metricName: '葡萄糖', category: 'biochemistry', categoryCn: '生化', valueType: 'quantitative', valueNumeric: 4.2, unit: 'mmol/L', refRangeLow: 3.9, refRangeHigh: 6.1, tone: 'ok', ocrConfidence: 0.89 },
      { metricKey: 'uric_acid', metricName: '尿酸', category: 'kidney_function', categoryCn: '肾功能', valueType: 'quantitative', valueNumeric: 112, unit: 'μmol/L', refRangeLow: 150, refRangeHigh: 357, tone: 'low', ocrConfidence: 0.87 },
      { metricKey: 'tc', metricName: '总胆固醇', category: 'blood_lipid', categoryCn: '血脂', valueType: 'quantitative', valueNumeric: 5.81, unit: 'mmol/L', refRangeLow: null, refRangeHigh: 5.2, refText: '合适水平 <5.2；边缘升高 5.2-6.2；升高 ≥6.2', tone: 'high', ocrConfidence: 0.84 },
      { metricKey: 'tg', metricName: '甘油三酯', category: 'blood_lipid', categoryCn: '血脂', valueType: 'quantitative', valueNumeric: 1.33, unit: 'mmol/L', refRangeLow: null, refRangeHigh: 1.7, refText: '合适水平 <1.7；边缘升高 1.7-2.3；升高 ≥2.3', tone: 'ok', ocrConfidence: 0.82 },
      { metricKey: 'hdl_c', metricName: '高密度脂蛋白胆固醇', category: 'blood_lipid', categoryCn: '血脂', valueType: 'quantitative', valueNumeric: 2.27, unit: 'mmol/L', refRangeLow: 1.0, refRangeHigh: null, refText: '降低 <1.0；低危人群应 <3.4；中高危人群应 <2.6', tone: 'ok', ocrConfidence: 0.8 },
      { metricKey: 'ldl_c', metricName: '低密度脂蛋白胆固醇', category: 'blood_lipid', categoryCn: '血脂', valueType: 'quantitative', valueNumeric: 2.46, unit: 'mmol/L', refRangeLow: null, refRangeHigh: 3.4, refText: '低危人群应 <3.4；中高危人群应 <2.6；极高危人群应 <1.8', tone: 'ok', ocrConfidence: 0.78 }
    ],
    conflicts: [],
    warnings: [{ code: 'PARTIAL_SCREENSHOT', message: '截图为报告滚动区域，顶部基础信息不完整，报告日期按同批肝功记录暂定。' }],
    status: 'needs_review'
  },
  {
    caseId: 'chest_ct_plain',
    draftId: 'fixture_chest_ct_plain',
    sourcePhotoIds: ['real_chest_ct_plain'],
    pageCount: 1,
    basicInfo: {
      type: '胸腹盆CT平扫',
      typeKey: 'ct_chest_plain',
      hospital: '北京协和医院',
      reportDate: '2025-12-24',
      examDate: '2025-12-22',
      patientName: '张艳华',
      orderNo: 'GEPACS8954145',
      confidence: 0.9
    },
    metrics: [],
    findings: [
      '与本院2025-09-22前片对比：双肺多发微、小结节，大致同前。',
      '较大者位于右肺下叶背段，呈实性密度，约6mm×5mm，请随诊。',
      '双肺散在钙化灶、右肺门多发钙化灶，大致同前。',
      '双侧胸膜略增厚，大致同前。'
    ],
    conflicts: [],
    warnings: [],
    status: 'needs_review'
  },
  {
    caseId: 'abdomen_pelvis_ct_plain',
    draftId: 'fixture_abdomen_pelvis_ct_plain',
    sourcePhotoIds: ['real_abdomen_pelvis_ct_plain'],
    pageCount: 1,
    basicInfo: {
      type: '胸腹盆CT平扫',
      typeKey: 'ct_abdomen_pelvis_plain',
      hospital: '北京协和医院',
      reportDate: '2025-12-24',
      examDate: '2025-12-22',
      patientName: '张艳华',
      orderNo: 'GEPACS8954146',
      confidence: 0.9
    },
    metrics: [],
    findings: [
      '左侧肾上腺肿物切除术后改变，术区少许片絮影，与左肾实质分界不清，大致同前。',
      '肝内散在囊肿，大致同前；原肝右叶血管瘤本次平扫显示欠清。',
      '子宫未见显示，大致同前。',
      '右侧附件区囊肿可能，较前稍减小，请结合专科检查。',
      '左侧髂血管旁饱满淋巴结？左侧附件残端？较前显示清晰，请结合专科检查。',
      '右侧臀部少许钙化灶，大致同前。'
    ],
    conflicts: [],
    warnings: [],
    status: 'needs_review'
  },
  {
    caseId: 'empty_result',
    draftId: 'fixture_empty_result',
    sourcePhotoIds: ['real_empty_result'],
    pageCount: 1,
    basicInfo: {
      type: '\u5f85\u624b\u52a8\u8865\u5f55',
      typeKey: 'manual_entry',
      hospital: '',
      reportDate: '',
      confidence: 0.12,
      reportLike: true
    },
    metrics: [],
    findings: [],
    conflicts: [],
    warnings: [{ code: 'OCR_EMPTY_RESULT', message: '\u8fd9\u5f20\u56fe\u672a\u8bc6\u522b\u5230\u53ef\u7528\u5185\u5bb9\uff0c\u8bf7\u624b\u52a8\u8865\u5f55\u6216\u91cd\u65b0\u4e0a\u4f20\u3002' }],
    status: 'needs_manual_input'
  },
  {
    caseId: 'non_report_image',
    draftId: 'fixture_non_report_image',
    sourcePhotoIds: ['real_non_report_image'],
    pageCount: 1,
    basicInfo: {
      type: '\u672a\u8bc6\u522b\u5230\u68c0\u67e5\u62a5\u544a',
      typeKey: 'not_medical_report',
      hospital: '',
      reportDate: '',
      confidence: 0.08,
      reportLike: false
    },
    metrics: [],
    findings: [],
    conflicts: [],
    warnings: [{ code: 'NOT_MEDICAL_REPORT', message: '\u8fd9\u5f20\u56fe\u4e0d\u50cf\u68c0\u67e5\u62a5\u544a\uff0c\u5efa\u8bae\u8df3\u8fc7\u6216\u91cd\u65b0\u9009\u62e9\u3002' }],
    status: 'not_report'
  }
];

const reportTypeMeta = {
  acth: {
    originalType: '血浆ACTH (8AM)',
    typeKey: 'endocrine_acth',
    canonicalTypeName: 'ACTH',
    modality: 'laboratory',
    analysisPolicy: 'metric_analysis'
  },
  thyroid: {
    originalType: '甲功1',
    typeKey: 'thyroid_function',
    canonicalTypeName: '甲状腺功能',
    modality: 'laboratory',
    analysisPolicy: 'metric_analysis'
  },
  cortisol: {
    originalType: '血清总皮质醇(8AM)',
    typeKey: 'endocrine_cortisol',
    canonicalTypeName: '皮质醇',
    modality: 'laboratory',
    analysisPolicy: 'metric_analysis'
  },
  liver_function: {
    originalType: '肝功',
    typeKey: 'liver_function',
    canonicalTypeName: '肝功能',
    modality: 'laboratory',
    analysisPolicy: 'metric_analysis'
  },
  uric_electrolyte_lipid: {
    originalType: '尿酸、电解质、血脂',
    typeKey: 'biochemistry_lipid',
    canonicalTypeName: '生化/电解质/血脂组合',
    modality: 'laboratory',
    analysisPolicy: 'metric_analysis',
    hospitalSource: 'inferred_from_batch',
    reportDateSource: 'inferred_from_batch'
  },
  chest_ct_plain: {
    originalType: '胸腹盆CT平扫',
    typeKey: 'ct_plain',
    canonicalTypeName: 'CT平扫',
    modality: 'imaging',
    examPart: '胸部',
    examMethod: '平扫',
    analysisPolicy: 'view_only'
  },
  abdomen_pelvis_ct_plain: {
    originalType: '胸腹盆CT平扫',
    typeKey: 'ct_plain',
    canonicalTypeName: 'CT平扫',
    modality: 'imaging',
    examPart: '腹部盆腔',
    examMethod: '平扫',
    analysisPolicy: 'view_only'
  }
};

function enrichMetric(metric) {
  return {
    originalMetricName: metric.originalMetricName || metric.metricName || metric.metricKey,
    mappingStatus: metric.mappingStatus || (metric.ocrConfidence !== undefined && metric.ocrConfidence < 0.85 ? 'suggested' : 'confirmed'),
    ...metric
  };
}

function enrichDraft(draft) {
  const meta = reportTypeMeta[draft.caseId] || {};
  const basicInfo = draft.basicInfo || {};
  return {
    ...draft,
    basicInfo: {
      ...basicInfo,
      originalType: meta.originalType || basicInfo.originalType || basicInfo.type,
      typeKey: meta.typeKey || basicInfo.typeKey || 'unknown',
      canonicalTypeName: meta.canonicalTypeName || basicInfo.canonicalTypeName || basicInfo.type,
      modality: meta.modality || basicInfo.modality || 'laboratory',
      examPart: meta.examPart || basicInfo.examPart || '',
      examMethod: meta.examMethod || basicInfo.examMethod || '',
      hospitalSource: meta.hospitalSource || basicInfo.hospitalSource || (basicInfo.hospital ? 'ocr' : 'unknown'),
      reportDateSource: meta.reportDateSource || basicInfo.reportDateSource || (basicInfo.reportDate ? 'ocr' : 'unknown')
    },
    analysisPolicy: meta.analysisPolicy || draft.analysisPolicy || 'metric_analysis',
    metrics: (draft.metrics || []).map(enrichMetric)
  };
}

const edgecaseCaseIds = ['empty_result', 'non_report_image'];
const allOcrDrafts = rawRealcaseOcrDrafts.map(enrichDraft);
const realcaseOcrDrafts = allOcrDrafts.filter((draft) => !edgecaseCaseIds.includes(draft.caseId));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function getRealcaseOcrDrafts(caseIds) {
  const source = caseIds && caseIds.length ? allOcrDrafts : realcaseOcrDrafts;
  const ids = caseIds && caseIds.length ? caseIds : realcaseOcrDrafts.map((item) => item.caseId);
  return clone(source.filter((draft) => ids.includes(draft.caseId)));
}

function buildRealcaseOcrTask(profileId, caseIds) {
  const drafts = getRealcaseOcrDrafts(caseIds);
  return {
    id: `fixture_ocr_${Date.now()}`,
    profileId,
    status: 'needs_confirmation',
    photoCount: drafts.reduce((sum, draft) => sum + (draft.sourcePhotoIds || []).length, 0),
    reportCount: drafts.length,
    drafts
  };
}

module.exports = {
  realcaseOcrDrafts,
  getRealcaseOcrDrafts,
  buildRealcaseOcrTask
};
