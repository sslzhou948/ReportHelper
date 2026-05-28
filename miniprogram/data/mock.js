const metricDefinitions = {
  wbc: {
    key: 'wbc',
    nameCn: '白细胞',
    nameEn: 'WBC',
    category: 'blood_routine',
    categoryCn: '血常规',
    valueType: 'quantitative',
    defaultUnit: '×10⁹/L'
  },
  hgb: {
    key: 'hgb',
    nameCn: '血红蛋白',
    nameEn: 'HGB',
    category: 'blood_routine',
    categoryCn: '血常规',
    valueType: 'quantitative',
    defaultUnit: 'g/L'
  },
  plt: {
    key: 'plt',
    nameCn: '血小板',
    nameEn: 'PLT',
    category: 'blood_routine',
    categoryCn: '血常规',
    valueType: 'quantitative',
    defaultUnit: '×10⁹/L'
  },
  alt: {
    key: 'alt',
    nameCn: 'ALT 谷丙转氨酶',
    nameEn: 'ALT',
    category: 'liver_function',
    categoryCn: '肝功能',
    valueType: 'quantitative',
    defaultUnit: 'U/L'
  },
  ast: {
    key: 'ast',
    nameCn: 'AST 谷草转氨酶',
    nameEn: 'AST',
    category: 'liver_function',
    categoryCn: '肝功能',
    valueType: 'quantitative',
    defaultUnit: 'U/L'
  },
  tbil: {
    key: 'tbil',
    nameCn: '总胆红素',
    category: 'liver_function',
    categoryCn: '肝功能',
    valueType: 'quantitative',
    defaultUnit: 'μmol/L'
  },
  cea: {
    key: 'cea',
    nameCn: 'CEA 癌胚抗原',
    nameEn: 'CEA',
    category: 'tumor_markers',
    categoryCn: '肿瘤标志物',
    valueType: 'quantitative',
    defaultUnit: 'ng/mL'
  },
  ca153: {
    key: 'ca153',
    nameCn: 'CA15-3',
    category: 'tumor_markers',
    categoryCn: '肿瘤标志物',
    valueType: 'quantitative',
    defaultUnit: 'U/mL'
  },
  hbsag: {
    key: 'hbsag',
    nameCn: 'HBsAg 乙肝表面抗原',
    category: 'immunology',
    categoryCn: '免疫',
    valueType: 'qualitative'
  }
};

const profiles = [
  {
    id: 'profile_mom',
    relation: '妈妈',
    realName: '王芬',
    avatarText: '芬',
    gender: 'F',
    birthDate: '1958-03-12',
    diseaseType: '乳腺癌',
    diagnosedAt: '2024-04-10',
    stage: 'IIA 期',
    treatmentPhase: 'recovery',
    summary: '乳腺癌术后 · 第 24 个月',
    primaryHospital: '协和医院',
    primaryDoctor: '李医生',
    primaryDepartment: '肿瘤科'
  },
  {
    id: 'profile_self',
    relation: '我自己',
    realName: '李建国',
    avatarText: '建',
    gender: 'M',
    diseaseType: '高血压',
    summary: '高血压随访'
  }
];

const reports = [
  {
    id: 'report_blood_20260428',
    profileId: 'profile_mom',
    type: '血常规',
    typeKey: 'blood_routine',
    hospital: '协和医院',
    reportDate: '2026-04-28',
    abnormalCount: 2,
    note: '术后第 24 个月常规复查',
    metrics: [
      { metricKey: 'wbc', valueType: 'quantitative', valueNumeric: 3.2, unit: '×10⁹/L', refRangeLow: 3.5, refRangeHigh: 10.0, isPinned: true },
      { metricKey: 'hgb', valueType: 'quantitative', valueNumeric: 128, unit: 'g/L', refRangeLow: 115, refRangeHigh: 150, isPinned: true },
      { metricKey: 'plt', valueType: 'quantitative', valueNumeric: 189, unit: '×10⁹/L', refRangeLow: 125, refRangeHigh: 350 }
    ]
  },
  {
    id: 'report_ct_20260415',
    profileId: 'profile_mom',
    type: 'CT 胸部',
    typeKey: 'ct_chest',
    hospital: '肿瘤医院',
    reportDate: '2026-04-15',
    abnormalCount: 0,
    metrics: []
  },
  {
    id: 'report_liver_20260410',
    profileId: 'profile_mom',
    type: '肝功能',
    typeKey: 'liver_function',
    hospital: '协和医院',
    reportDate: '2026-04-10',
    abnormalCount: 1,
    metrics: [
      { metricKey: 'alt', valueType: 'quantitative', valueNumeric: 32, unit: 'U/L', refRangeLow: 0, refRangeHigh: 40 },
      { metricKey: 'ast', valueType: 'quantitative', valueNumeric: 28, unit: 'U/L', refRangeLow: 0, refRangeHigh: 40 },
      { metricKey: 'tbil', valueType: 'quantitative', valueNumeric: 24, unit: 'μmol/L', refRangeLow: 3, refRangeHigh: 22 }
    ]
  },
  {
    id: 'report_marker_20260322',
    profileId: 'profile_mom',
    type: '肿瘤标志物',
    typeKey: 'tumor_markers',
    hospital: '协和医院',
    reportDate: '2026-03-22',
    abnormalCount: 1,
    metrics: [
      { metricKey: 'cea', valueType: 'quantitative', valueNumeric: 6.8, unit: 'ng/mL', refRangeLow: 0, refRangeHigh: 5.0, isPinned: true },
      { metricKey: 'ca153', valueType: 'quantitative', valueNumeric: 18, unit: 'U/mL', refRangeLow: 0, refRangeHigh: 31.3 }
    ]
  }
];

const recheckPlans = [
  {
    id: 'recheck_next',
    profileId: 'profile_mom',
    type: '常规复查',
    date: '2026-06-01',
    hospital: '协和医院',
    status: 'pending',
    reminderConfig: { advance: [3, 1, 0] },
    todos: [
      { id: 'todo_1', text: '预约挂号', isDone: true, isTemplate: true },
      { id: 'todo_2', text: '准备身份证和病历本', isDone: true, isTemplate: true },
      { id: 'todo_3', text: '复查前一日清淡饮食', isDone: true, isTemplate: true },
      { id: 'todo_4', text: '复查当天空腹', isDone: false, isTemplate: true },
      { id: 'todo_5', text: '提前 2 小时出发', isDone: false, isTemplate: true }
    ]
  },
  {
    id: 'recheck_ct',
    profileId: 'profile_mom',
    type: 'CT 检查',
    date: '2026-06-12',
    hospital: '肿瘤医院',
    department: '影像科',
    doctor: '',
    status: 'pending',
    reminderConfig: { advance: [3, 1] },
    todos: [
      { id: 'todo_ct_1', text: '预约挂号', isDone: false, isTemplate: true },
      { id: 'todo_ct_2', text: '检查前 6 小时禁食', isDone: false, isTemplate: true }
    ]
  }
];

module.exports = {
  metricDefinitions,
  profiles,
  reports,
  recheckPlans
};
