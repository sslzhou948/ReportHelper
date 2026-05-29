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

const VALUE_TYPES = ['quantitative', 'qualitative'];
const VALUE_TYPE_LABELS = ['数值', '阴性/阳性'];

function emptyForm() {
  return {
    metricKey: '',
    metricName: '',
    category: 'custom',
    categoryCn: '自定义',
    valueType: 'quantitative',
    valueTypeIndex: 0,
    valueTypeLabel: VALUE_TYPE_LABELS[0],
    unit: '',
    refRangeLow: '',
    refRangeHigh: '',
    refQualitative: '阴性'
  };
}

function normalizeForm(metric = {}) {
  const valueType = metric.valueType || 'quantitative';
  const valueTypeIndex = VALUE_TYPES.indexOf(valueType) >= 0 ? VALUE_TYPES.indexOf(valueType) : 0;
  return {
    ...emptyForm(),
    ...metric,
    valueType,
    valueTypeIndex,
    valueTypeLabel: VALUE_TYPE_LABELS[valueTypeIndex],
    refRangeLow: metric.refRangeLow === null || metric.refRangeLow === undefined ? '' : String(metric.refRangeLow),
    refRangeHigh: metric.refRangeHigh === null || metric.refRangeHigh === undefined ? '' : String(metric.refRangeHigh)
  };
}

Page({
  data: {
    mode: 'manage',
    isSelectMode: false,
    isManageMode: true,
    pageTitle: '我的检查项目',
    sectionTitle: '个人自定义',
    saveText: '保存',
    formTitle: '新建检查项目',
    keyword: '',
    items: [],
    filteredItems: [],
    editing: false,
    form: emptyForm(),
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
      pageTitle: mode === 'select' ? '选择检查项目' : '我的检查项目',
      sectionTitle: mode === 'select' ? '可录入项目' : '个人自定义',
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
    wx.showModal({
      title: '\u65b0\u5efa\u68c0\u67e5\u9879\u76ee',
      editable: true,
      placeholderText: '\u5982 XX\u8840\u836f\u6d53\u5ea6',
      success: (res) => {
        if (!res.confirm) return;
        const metricName = String(res.content || '').trim();
        if (!metricName) {
          wx.showToast({ title: '\u8bf7\u586b\u5199\u9879\u76ee\u540d\u79f0', icon: 'none' });
          return;
        }
        const saved = saveCustomMetric(this.profileId, {
          metricName,
          category: 'custom',
          categoryCn: '\u81ea\u5b9a\u4e49',
          valueType: 'quantitative',
          unit: ''
        });
        if (this.data.mode === 'select') {
          wx.setStorageSync('manualEntryTemplate', saved);
          wx.navigateTo({ url: `/pages/record/manual-entry?metricKey=${saved.metricKey}` });
          return;
        }
        this.load();
      }
    });
  },

  editMetric(event) {
    const metric = this.data.items.find((item) => item.metricKey === event.currentTarget.dataset.key);
    if (!metric) return;
    wx.showModal({
      title: '\u7f16\u8f91\u9879\u76ee\u540d\u79f0',
      editable: true,
      placeholderText: metric.metricName,
      success: (res) => {
        if (!res.confirm) return;
        const metricName = String(res.content || '').trim();
        if (!metricName) return;
        saveCustomMetric(this.profileId, {
          ...metric,
          metricName
        });
        this.load();
      }
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

  cancelEdit() {
    this.setData({ editing: false, formTitle: '新建检查项目', form: emptyForm() });
  },

  saveTemplate() {
    const form = this.data.form;
    if (!String(form.metricName || '').trim()) {
      wx.showToast({ title: '\u8bf7\u586b\u5199\u9879\u76ee\u540d\u79f0', icon: 'none' });
      return;
    }
    const saved = saveCustomMetric(this.profileId, form);
    this.setData({ editing: false, formTitle: '新建检查项目', form: emptyForm() });
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
