const { api } = require('../../utils/api');
const { showApiErrorToast } = require('../../utils/error');
const { mergeMetricTemplates } = require('../../utils/custom-metrics');
const {
  REF_RANGE_MODES,
  formatReference,
  inferRefMode,
  modeState,
  normalizeReferenceByMode
} = require('../../utils/reference-range');
const {
  beginSlowLoading,
  cancelSlowLoading: cancelPageLoading,
  finishSlowLoading
} = require('../../utils/loading');
const { bindNetworkStatus, refreshNetworkStatus } = require('../../utils/network');
const { isProfileRequiredError } = require('../../utils/profile');

const VALUE_TYPES = ['quantitative', 'qualitative', 'text'];
const VALUE_TYPE_LABELS = ['指标数据', '阴性/阳性', '文字描述'];
const LAB_VALUE_TYPES = ['quantitative', 'qualitative'];
const LAB_VALUE_TYPE_LABELS = ['指标数据', '阴性/阳性'];
const CATEGORY_OPTIONS = [
  { key: 'lab', label: '检验（血液、尿液等）' },
  { key: 'exam', label: '检查（CT、核磁、B超等）' },
  { key: 'electrophysiology', label: '电生理（心电图等）' },
  { key: 'pathology', label: '病理' },
  { key: 'other', label: '其他' }
];
const CATEGORY_LABELS = CATEGORY_OPTIONS.map((item) => item.label);
const DEFAULT_CATEGORY_INDEX = 0;
const DEFAULT_CATEGORY = CATEGORY_OPTIONS[DEFAULT_CATEGORY_INDEX];
const TEXT_CATEGORY_KEYS = ['exam', 'electrophysiology', 'pathology', 'other'];
const LEGACY_CATEGORY_MAP = {
  custom: 'other',
  laboratory: 'lab',
  drug_level: 'lab',
  imaging: 'exam',
  ultrasound: 'exam'
};
const FILTER_OPTIONS = [
  { key: 'all', label: '全部模板' },
  { key: 'lab', label: '检验指标' },
  { key: 'exam', label: '影像检查' },
  { key: 'electrophysiology', label: '电生理' },
  { key: 'pathology', label: '病理' },
  { key: 'other', label: '其他' }
];

function normalizeCategoryKey(category) {
  return LEGACY_CATEGORY_MAP[category] || category || DEFAULT_CATEGORY.key;
}

function categoryIconFor(category) {
  const normalized = normalizeCategoryKey(category);
  const map = {
    lab: '/assets/ui-refresh/manual-flask-circle.png',
    exam: '/assets/ui-refresh/recheck-plan-scan.png',
    electrophysiology: '/assets/ui-refresh/recheck-plan-stethoscope.png',
    pathology: '/assets/ui-refresh/report-doc.png',
    other: '/assets/ui-refresh/profile-template.png'
  };
  return map[normalized] || map.other;
}

function filterLabelFor(key) {
  const option = FILTER_OPTIONS.find((item) => item.key === key) || FILTER_OPTIONS[0];
  return option.key === 'all' ? '筛选' : option.label;
}

function valueTypeStateForCategory(category, valueType) {
  if (TEXT_CATEGORY_KEYS.includes(category)) {
    return {
      valueType: 'text',
      valueTypeIndex: 2,
      valueTypeLabel: VALUE_TYPE_LABELS[2]
    };
  }
  const nextValueType = LAB_VALUE_TYPES.includes(valueType) ? valueType : 'quantitative';
  const valueTypeIndex = VALUE_TYPES.indexOf(nextValueType);
  return {
    valueType: nextValueType,
    valueTypeIndex,
    valueTypeLabel: VALUE_TYPE_LABELS[valueTypeIndex]
  };
}

function sanitizeFormByCategory(form) {
  const valueTypeState = valueTypeStateForCategory(form.category, form.valueType);
  const next = {
    ...form,
    ...valueTypeState
  };
  if (TEXT_CATEGORY_KEYS.includes(next.category)) {
    return {
      ...next,
      unit: '',
      refRangeLow: '',
      refRangeHigh: '',
      refQualitative: '',
      refText: ''
    };
  }
  if (next.valueType === 'quantitative') {
    const reference = normalizeReferenceByMode(next, next.refMode || inferRefMode(next));
    return {
      ...next,
      ...reference,
      ...modeState(reference.refMode),
      refRangeLow: reference.refRangeLow === null ? '' : String(reference.refRangeLow),
      refRangeHigh: reference.refRangeHigh === null ? '' : String(reference.refRangeHigh)
    };
  }
  return {
    ...next,
    refRangeLow: '',
    refRangeHigh: '',
    refText: ''
  };
}

function emptyForm() {
  const valueTypeState = valueTypeStateForCategory(DEFAULT_CATEGORY.key, 'quantitative');
  return {
    metricKey: '',
    metricName: '',
    category: DEFAULT_CATEGORY.key,
    categoryCn: DEFAULT_CATEGORY.label,
    categoryIndex: DEFAULT_CATEGORY_INDEX,
    ...valueTypeState,
    unit: '',
    ...modeState('simple_range'),
    refRangeLow: '',
    refRangeHigh: '',
    refQualitative: '阴性',
    refText: ''
  };
}

function normalizeForm(metric = {}) {
  const valueType = metric.valueType || 'quantitative';
  const normalizedCategory = LEGACY_CATEGORY_MAP[metric.category] || metric.category;
  const categoryIndex = CATEGORY_OPTIONS.findIndex((item) => item.key === normalizedCategory);
  const categoryOption = categoryIndex >= 0 ? CATEGORY_OPTIONS[categoryIndex] : DEFAULT_CATEGORY;
  return sanitizeFormByCategory({
    ...emptyForm(),
    ...metric,
    category: categoryOption.key,
    categoryIndex: categoryIndex >= 0 ? categoryIndex : DEFAULT_CATEGORY_INDEX,
    categoryCn: categoryOption.label,
    valueType,
    ...modeState(inferRefMode(metric)),
    refRangeLow: metric.refRangeLow === null || metric.refRangeLow === undefined ? '' : String(metric.refRangeLow),
    refRangeHigh: metric.refRangeHigh === null || metric.refRangeHigh === undefined ? '' : String(metric.refRangeHigh),
    refText: metric.refText || ''
  });
}

Page({
  data: {
    mode: 'manage',
    isSelectMode: false,
    isManageMode: true,
    pageTitle: '手动新增检查项',
    sectionTitle: '自定义录入模板',
    saveText: '保存',
    formTitle: '新建录入模板',
    keyword: '',
    filterKey: 'all',
    filterLabel: filterLabelFor('all'),
    items: [],
    filteredItems: [],
    editing: false,
    form: emptyForm(),
    categoryLabels: CATEGORY_LABELS,
    valueTypeLabels: VALUE_TYPE_LABELS,
    labValueTypeLabels: LAB_VALUE_TYPE_LABELS,
    refModeLabels: REF_RANGE_MODES.map((item) => item.label),
    networkOffline: false,
    loading: false,
    loadingSlow: false
  },

  onLoad(query = {}) {
    const mode = query.mode === 'select' ? 'select' : 'manage';
    this.setData({
      mode,
      isSelectMode: mode === 'select',
      isManageMode: mode === 'manage',
      pageTitle: mode === 'select' ? '选择录入模板' : '手动新增检查项',
      sectionTitle: mode === 'select' ? '可录入模板' : '常用模板',
      saveText: mode === 'select' ? '保存并录入' : '保存'
    });
  },

  onShow() {
    bindNetworkStatus(this);
    setTimeout(() => this.load(), 100);
  },

  load() {
    const loadingToken = beginSlowLoading(this);
    getApp().ensureCurrentProfileId(api).then((profileId) => Promise.all([
      api.listManualTemplates(profileId),
      api.listMetricSnapshots(profileId)
    ]).then(([customRows, snapshots]) => ({ profileId, customRows, snapshots }))).then(({ profileId, customRows, snapshots }) => {
      if (!finishSlowLoading(this, loadingToken)) return;
      this.profileId = profileId;
      const items = mergeMetricTemplates(customRows, snapshots);
      this.setData({ items: this.decorateItems(items) }, () => this.applyFilter());
    }).catch((error) => {
      if (!finishSlowLoading(this, loadingToken)) return;
      if (isProfileRequiredError(error)) return;
      showApiErrorToast(error, '\u52a0\u8f7d\u68c0\u67e5\u9879\u76ee\u5931\u8d25');
    });
  },

  applyFilter() {
    const keyword = String(this.data.keyword || '').trim().toLowerCase();
    const filterKey = this.data.filterKey;
    const byCategory = filterKey === 'all'
      ? this.data.items
      : this.data.items.filter((item) => item.categoryKey === filterKey);
    const filteredItems = keyword
      ? byCategory.filter((item) => [item.metricName, item.categoryCn, item.unit].some((value) => String(value || '').toLowerCase().includes(keyword)))
      : byCategory;
    this.setData({ filteredItems });
  },

  decorateItems(items) {
    return (items || []).map((item) => ({
      ...item,
      categoryKey: normalizeCategoryKey(item.category),
      icon: categoryIconFor(item.category),
      sourceText: item.source === 'custom' ? '自' : '史',
      refDisplay: item.valueType === 'quantitative' ? formatReference(item) : ''
    }));
  },

  onSearchInput(event) {
    this.setData({ keyword: event.detail.value }, () => this.applyFilter());
  },

  openFilter() {
    wx.showActionSheet({
      itemList: FILTER_OPTIONS.map((item) => item.label),
      success: (res) => {
        const option = FILTER_OPTIONS[res.tapIndex] || FILTER_OPTIONS[0];
        this.setData({
          filterKey: option.key,
          filterLabel: filterLabelFor(option.key)
        }, () => this.applyFilter());
      }
    });
  },

  startCreate() {
    this.setData({
      editing: true,
      formTitle: '新建录入模板',
      form: emptyForm()
    });
  },

  editMetric(event) {
    const metric = this.data.items.find((item) => item.metricKey === event.currentTarget.dataset.key);
    if (!metric) return;
    this.setData({
      editing: true,
      formTitle: '编辑录入模板',
      form: normalizeForm(metric)
    });
  },

  openMetric(event) {
    if (this.data.isSelectMode) {
      this.selectMetric(event);
      return;
    }
    this.editMetric(event);
  },

  deleteMetric(event) {
    const metricKey = event.currentTarget.dataset.key;
    wx.showModal({
      title: '\u5220\u9664\u68c0\u67e5\u9879\u76ee\uff1f',
      content: '\u5220\u9664\u540e\u4e0d\u4f1a\u5f71\u54cd\u5df2\u7ecf\u4fdd\u5b58\u7684\u68c0\u67e5\u7ed3\u679c\u3002',
      confirmText: '\u5220\u9664',
      confirmColor: '#C07060',
      success: (res) => {
        if (!res.confirm) return;
        api.archiveManualTemplate(this.profileId, metricKey)
          .then(() => this.load())
          .catch((error) => showApiErrorToast(error, '\u5220\u9664\u68c0\u67e5\u9879\u76ee\u5931\u8d25'));
      }
    });
  },

  onFormInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ form: { ...this.data.form, [field]: event.detail.value } });
  },

  onValueTypeChange(event) {
    const index = Number(event.detail.value) || 0;
    const valueType = LAB_VALUE_TYPES[index] || 'quantitative';
    const valueTypeIndex = VALUE_TYPES.indexOf(valueType);
    const nextForm = sanitizeFormByCategory({
      ...this.data.form,
      valueTypeIndex,
      valueType,
      valueTypeLabel: VALUE_TYPE_LABELS[valueTypeIndex] || VALUE_TYPE_LABELS[0]
    });
    this.setData({ form: nextForm });
  },

  onRefModeChange(event) {
    const index = Number(event.detail.value) || 0;
    const mode = REF_RANGE_MODES[index] || REF_RANGE_MODES[0];
    const reference = normalizeReferenceByMode(this.data.form, mode.key);
    this.setData({
      form: sanitizeFormByCategory({
        ...this.data.form,
        ...reference,
        ...modeState(reference.refMode),
        refRangeLow: reference.refRangeLow === null ? '' : String(reference.refRangeLow),
        refRangeHigh: reference.refRangeHigh === null ? '' : String(reference.refRangeHigh)
      })
    });
  },

  onCategoryChange(event) {
    const index = Number(event.detail.value) || 0;
    const option = CATEGORY_OPTIONS[index] || CATEGORY_OPTIONS[0];
    const nextForm = sanitizeFormByCategory({
      ...this.data.form,
      categoryIndex: index,
      category: option.key,
      categoryCn: option.label
    });
    this.setData({ form: nextForm });
  },

  cancelEdit() {
    this.setData({ editing: false, formTitle: '新建录入模板', form: emptyForm() });
  },

  saveTemplate() {
    const form = this.data.form;
    if (!String(form.metricName || '').trim()) {
      wx.showToast({ title: '\u8bf7\u586b\u5199\u6a21\u677f\u540d\u79f0', icon: 'none' });
      return;
    }
    const normalizedForm = sanitizeFormByCategory(form);
    api.saveManualTemplate(this.profileId, normalizedForm).then((saved) => {
      this.setData({ editing: false, formTitle: '新建录入模板', form: emptyForm() });
      if (this.data.mode === 'select') {
        wx.setStorageSync('manualEntryTemplate', saved);
        wx.navigateTo({ url: `/pages/record/manual-entry?metricKey=${saved.metricKey}` });
        return;
      }
      wx.showToast({ title: '\u5df2\u4fdd\u5b58', icon: 'success' });
      this.load();
    }).catch((error) => showApiErrorToast(error, '\u4fdd\u5b58\u68c0\u67e5\u9879\u76ee\u5931\u8d25'));
  },

  selectMetric(event) {
    if (this.data.mode !== 'select') return;
    const metric = this.data.items.find((item) => item.metricKey === event.currentTarget.dataset.key);
    if (!metric) return;
    wx.setStorageSync('manualEntryTemplate', metric);
    wx.navigateTo({ url: `/pages/record/manual-entry?metricKey=${metric.metricKey}` });
  },

  goBack() {
    wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/profile/index' }) });
  },

  retryAfterNetwork() {
    refreshNetworkStatus(this).then(() => this.load());
  },

  retrySlowLoading() {
    this.load();
  },

  cancelSlowLoading() {
    cancelPageLoading(this);
  }
});
