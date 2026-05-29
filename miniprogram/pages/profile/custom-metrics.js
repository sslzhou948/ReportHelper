const { api } = require('../../utils/api');
const { showApiErrorToast } = require('../../utils/error');
const {
  archiveCustomMetric,
  listCustomMetrics,
  mergeMetricTemplates,
  saveCustomMetric
} = require('../../utils/custom-metrics');
const {
  beginSlowLoading,
  cancelSlowLoading: cancelPageLoading,
  finishSlowLoading
} = require('../../utils/loading');
const { bindNetworkStatus, refreshNetworkStatus } = require('../../utils/network');
const { isProfileRequiredError } = require('../../utils/profile');

const VALUE_TYPES = ['quantitative', 'qualitative', 'text'];
const VALUE_TYPE_LABELS = ['数值', '阴性/阳性', '文字描述'];
const CATEGORY_OPTIONS = [
  { key: 'custom', label: '自定义检查' },
  { key: 'laboratory', label: '血液/化验' },
  { key: 'drug_level', label: '血药浓度' },
  { key: 'imaging', label: 'CT/核磁/影像' },
  { key: 'ultrasound', label: '彩超/超声' },
  { key: 'pathology', label: '病理/其他' }
];
const CATEGORY_LABELS = CATEGORY_OPTIONS.map((item) => item.label);
const TEXT_CATEGORY_KEYS = ['imaging', 'ultrasound', 'pathology'];

function emptyForm() {
  return {
    metricKey: '',
    metricName: '',
    category: 'custom',
    categoryCn: '自定义检查',
    categoryIndex: 0,
    valueType: 'quantitative',
    valueTypeIndex: 0,
    valueTypeLabel: VALUE_TYPE_LABELS[0],
    unit: '',
    refRangeLow: '',
    refRangeHigh: '',
    refQualitative: '阴性',
    refText: ''
  };
}

function normalizeForm(metric = {}) {
  const valueType = metric.valueType || 'quantitative';
  const valueTypeIndex = VALUE_TYPES.indexOf(valueType) >= 0 ? VALUE_TYPES.indexOf(valueType) : 0;
  const categoryIndex = CATEGORY_OPTIONS.findIndex((item) => item.key === metric.category);
  return {
    ...emptyForm(),
    ...metric,
    categoryIndex: categoryIndex >= 0 ? categoryIndex : 0,
    categoryCn: metric.categoryCn || (categoryIndex >= 0 ? CATEGORY_OPTIONS[categoryIndex].label : '自定义检查'),
    valueType,
    valueTypeIndex,
    valueTypeLabel: VALUE_TYPE_LABELS[valueTypeIndex],
    refRangeLow: metric.refRangeLow === null || metric.refRangeLow === undefined ? '' : String(metric.refRangeLow),
    refRangeHigh: metric.refRangeHigh === null || metric.refRangeHigh === undefined ? '' : String(metric.refRangeHigh),
    refText: metric.refText || ''
  };
}

Page({
  data: {
    mode: 'manage',
    isSelectMode: false,
    isManageMode: true,
    pageTitle: '维护手动录入模板',
    sectionTitle: '自定义录入模板',
    saveText: '保存',
    formTitle: '新建录入模板',
    keyword: '',
    items: [],
    filteredItems: [],
    editing: false,
    form: emptyForm(),
    categoryLabels: CATEGORY_LABELS,
    valueTypeLabels: VALUE_TYPE_LABELS,
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
      pageTitle: mode === 'select' ? '选择录入模板' : '维护手动录入模板',
      sectionTitle: mode === 'select' ? '可录入模板' : '自定义录入模板',
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
      Promise.resolve(listCustomMetrics(profileId)),
      this.data.mode === 'select' ? api.listMetricSnapshots(profileId) : Promise.resolve([])
    ]).then(([customRows, snapshots]) => ({ profileId, customRows, snapshots }))).then(({ profileId, customRows, snapshots }) => {
      if (!finishSlowLoading(this, loadingToken)) return;
      this.profileId = profileId;
      const items = this.data.mode === 'select'
        ? mergeMetricTemplates(customRows, snapshots)
        : customRows;
      this.setData({ items: this.decorateItems(items) }, () => this.applyFilter());
    }).catch((error) => {
      if (!finishSlowLoading(this, loadingToken)) return;
      if (isProfileRequiredError(error)) return;
      showApiErrorToast(error, '\u52a0\u8f7d\u68c0\u67e5\u9879\u76ee\u5931\u8d25');
    });
  },

  applyFilter() {
    const keyword = String(this.data.keyword || '').trim().toLowerCase();
    const filteredItems = keyword
      ? this.data.items.filter((item) => [item.metricName, item.categoryCn, item.unit].some((value) => String(value || '').toLowerCase().includes(keyword)))
      : this.data.items;
    this.setData({ filteredItems });
  },

  decorateItems(items) {
    return (items || []).map((item) => ({
      ...item,
      sourceText: item.source === 'custom' ? '自' : '史'
    }));
  },

  onSearchInput(event) {
    this.setData({ keyword: event.detail.value }, () => this.applyFilter());
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

  deleteMetric(event) {
    const metricKey = event.currentTarget.dataset.key;
    wx.showModal({
      title: '\u5220\u9664\u68c0\u67e5\u9879\u76ee\uff1f',
      content: '\u5220\u9664\u540e\u4e0d\u4f1a\u5f71\u54cd\u5df2\u7ecf\u4fdd\u5b58\u7684\u68c0\u67e5\u7ed3\u679c\u3002',
      confirmText: '\u5220\u9664',
      confirmColor: '#C07060',
      success: (res) => {
        if (!res.confirm) return;
        archiveCustomMetric(this.profileId, metricKey);
        this.load();
      }
    });
  },

  onFormInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ form: { ...this.data.form, [field]: event.detail.value } });
  },

  onValueTypeChange(event) {
    const index = Number(event.detail.value) || 0;
    this.setData({
      form: {
        ...this.data.form,
        valueTypeIndex: index,
        valueType: VALUE_TYPES[index] || 'quantitative',
        valueTypeLabel: VALUE_TYPE_LABELS[index] || VALUE_TYPE_LABELS[0]
      }
    });
  },

  onCategoryChange(event) {
    const index = Number(event.detail.value) || 0;
    const option = CATEGORY_OPTIONS[index] || CATEGORY_OPTIONS[0];
    const nextForm = {
      ...this.data.form,
      categoryIndex: index,
      category: option.key,
      categoryCn: option.label
    };
    if (TEXT_CATEGORY_KEYS.includes(option.key) && nextForm.valueType === 'quantitative') {
      nextForm.valueTypeIndex = 2;
      nextForm.valueType = 'text';
      nextForm.valueTypeLabel = VALUE_TYPE_LABELS[2];
    }
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
    const saved = saveCustomMetric(this.profileId, form);
    this.setData({ editing: false, formTitle: '新建录入模板', form: emptyForm() });
    if (this.data.mode === 'select') {
      wx.setStorageSync('manualEntryTemplate', saved);
      wx.navigateTo({ url: `/pages/record/manual-entry?metricKey=${saved.metricKey}` });
      return;
    }
    wx.showToast({ title: '\u5df2\u4fdd\u5b58', icon: 'success' });
    this.load();
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
