const { api } = require('../../utils/api');
const { showApiErrorToast } = require('../../utils/error');
const {
  beginSlowLoading,
  cancelSlowLoading: cancelPageLoading,
  finishSlowLoading
} = require('../../utils/loading');
const { bindNetworkStatus, refreshNetworkStatus } = require('../../utils/network');
const { isProfileRequiredError } = require('../../utils/profile');

function today() {
  return new Date().toISOString().slice(0, 10);
}

function toNumberOrNull(value) {
  if (value === '' || value === null || value === undefined) return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function buildForm(template) {
  return {
    reportDate: today(),
    hospital: '',
    valueNumeric: '',
    valueQualitative: template.valueType === 'qualitative' ? '阴性' : '',
    valueText: '',
    qualitativeIndex: 0,
    unit: template.unit || '',
    refRangeLow: template.refRangeLow === null || template.refRangeLow === undefined ? '' : String(template.refRangeLow),
    refRangeHigh: template.refRangeHigh === null || template.refRangeHigh === undefined ? '' : String(template.refRangeHigh),
    refText: template.refText || '',
    note: ''
  };
}

Page({
  data: {
    template: {},
    form: buildForm({}),
    qualitativeOptions: ['阴性', '阳性', '弱阳性', '可疑'],
    networkOffline: false,
    loading: false,
    loadingSlow: false,
    saving: false
  },

  onLoad() {
    const template = wx.getStorageSync('manualEntryTemplate') || {};
    this.setData({
      template,
      form: buildForm(template)
    });
  },

  onShow() {
    bindNetworkStatus(this);
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ form: { ...this.data.form, [field]: event.detail.value } });
  },

  onDateChange(event) {
    this.setData({ form: { ...this.data.form, reportDate: event.detail.value } });
  },

  onQualitativeChange(event) {
    const index = Number(event.detail.value) || 0;
    this.setData({
      form: {
        ...this.data.form,
        qualitativeIndex: index,
        valueQualitative: this.data.qualitativeOptions[index]
      }
    });
  },

  saveManualReport() {
    if (this.data.saving) return;
    const template = this.data.template;
    const form = this.data.form;
    if (!template.metricKey || !template.metricName) {
      wx.showToast({ title: '\u8bf7\u5148\u9009\u62e9\u68c0\u67e5\u9879\u76ee', icon: 'none' });
      return;
    }
    if (template.valueType === 'qualitative' && !form.valueQualitative) {
      wx.showToast({ title: '\u8bf7\u9009\u62e9\u7ed3\u679c', icon: 'none' });
      return;
    }
    if (template.valueType === 'quantitative' && toNumberOrNull(form.valueNumeric) === null) {
      wx.showToast({ title: '\u8bf7\u586b\u5199\u7ed3\u679c\u6570\u503c', icon: 'none' });
      return;
    }
    if (template.valueType === 'text' && !String(form.valueText || '').trim()) {
      wx.showToast({ title: '\u8bf7\u586b\u5199\u68c0\u67e5\u63cf\u8ff0', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    const loadingToken = beginSlowLoading(this);
    getApp().ensureCurrentProfileId(api).then((profileId) => api.createManualReport(profileId, {
      reportDate: form.reportDate,
      hospital: form.hospital,
      note: form.note,
      metric: {
        metricKey: template.metricKey,
        metricName: template.metricName,
        originalMetricName: template.metricName,
        category: template.category || 'lab',
        categoryCn: template.categoryCn || '\u68c0\u9a8c',
        valueType: template.valueType || 'quantitative',
        valueNumeric: template.valueType === 'quantitative' ? toNumberOrNull(form.valueNumeric) : null,
        valueQualitative: template.valueType === 'qualitative' ? form.valueQualitative : (template.valueType === 'text' ? form.valueText : ''),
        unit: form.unit,
        refRangeLow: toNumberOrNull(form.refRangeLow),
        refRangeHigh: toNumberOrNull(form.refRangeHigh),
        refQualitative: template.refQualitative || '',
        refText: form.refText,
        mappingStatus: 'confirmed',
        isManuallyEdited: true
      }
    }, {
      idempotencyKey: `manual_report_${profileId}_${template.metricKey}_${form.reportDate}_${Date.now()}`
    })).then((result) => {
      if (!finishSlowLoading(this, loadingToken)) return;
      wx.showToast({ title: '\u5df2\u4fdd\u5b58', icon: 'success' });
      const reportId = result && result.report && result.report.id;
      setTimeout(() => {
        if (reportId) wx.redirectTo({ url: `/pages/health/report-detail?id=${reportId}` });
        else wx.switchTab({ url: '/pages/health/index' });
      }, 500);
    }).catch((error) => {
      if (!finishSlowLoading(this, loadingToken)) return;
      this.setData({ saving: false });
      if (isProfileRequiredError(error)) return;
      showApiErrorToast(error, '\u4fdd\u5b58\u624b\u52a8\u8bb0\u5f55\u5931\u8d25');
    });
  },

  goBack() {
    wx.navigateBack({ fail: () => wx.navigateTo({ url: '/pages/profile/custom-metrics?mode=select' }) });
  },

  retryAfterNetwork() {
    refreshNetworkStatus(this);
  },

  retrySlowLoading() {
    this.saveManualReport();
  },

  cancelSlowLoading() {
    cancelPageLoading(this);
  }
});
