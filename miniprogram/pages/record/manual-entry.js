const { api } = require('../../utils/api');
const { showApiErrorToast } = require('../../utils/error');
const {
  beginSlowLoading,
  cancelSlowLoading: cancelPageLoading,
  finishSlowLoading
} = require('../../utils/loading');
const { bindNetworkStatus, refreshNetworkStatus } = require('../../utils/network');
const { isProfileRequiredError } = require('../../utils/profile');
const { calculateTone } = require('../../utils/trend');
const {
  REF_RANGE_MODES,
  TONE_OPTIONS,
  formatReference,
  inferRefMode,
  modeState,
  normalizeReferenceByMode,
  toNumberOrNull,
  toneState
} = require('../../utils/reference-range');

function today() {
  return new Date().toISOString().slice(0, 10);
}

function categoryIconFor(category) {
  const map = {
    lab: '/assets/ui-refresh/manual-flask-circle.png',
    exam: '/assets/ui-refresh/recheck-plan-scan.png',
    electrophysiology: '/assets/ui-refresh/recheck-plan-stethoscope.png',
    pathology: '/assets/ui-refresh/report-doc.png',
    other: '/assets/ui-refresh/profile-template.png'
  };
  return map[category] || map.lab;
}

function buildForm(template) {
  const refMode = inferRefMode(template);
  const reference = normalizeReferenceByMode(template, refMode);
  return {
    reportDate: today(),
    hospital: '',
    valueNumeric: '',
    valueQualitative: template.valueType === 'qualitative' ? '阴性' : '',
    valueText: '',
    qualitativeIndex: 0,
    unit: template.unit || '',
    ...modeState(refMode),
    ...toneState('unknown'),
    refRangeLow: reference.refRangeLow === null || reference.refRangeLow === undefined ? '' : String(reference.refRangeLow),
    refRangeHigh: reference.refRangeHigh === null || reference.refRangeHigh === undefined ? '' : String(reference.refRangeHigh),
    refText: reference.refText || '',
    note: ''
  };
}

function needsManualTone(form) {
  return form.refMode === 'complex_text' || form.refMode === 'none';
}

function buildReferencePayload(form) {
  return normalizeReferenceByMode({
    refMode: form.refMode,
    refRangeLow: form.refRangeLow,
    refRangeHigh: form.refRangeHigh,
    refText: form.refText
  }, form.refMode);
}

Page({
  data: {
    template: {},
    templateIcon: '/assets/ui-refresh/manual-flask-circle.png',
    form: buildForm({}),
    qualitativeOptions: ['阴性', '阳性', '弱阳性', '可疑'],
    refModeLabels: REF_RANGE_MODES.map((item) => item.label),
    toneLabels: TONE_OPTIONS.map((item) => item.label),
    showManualTone: false,
    networkOffline: false,
    loading: false,
    loadingSlow: false,
    saving: false
  },

  onLoad() {
    const template = wx.getStorageSync('manualEntryTemplate') || {};
    const form = buildForm(template);
    this.setData({
      template,
      templateIcon: categoryIconFor(template.category),
      form,
      showManualTone: needsManualTone(form)
    });
  },

  onShow() {
    bindNetworkStatus(this);
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ form: { ...this.data.form, [field]: event.detail.value } });
  },

  onRefModeChange(event) {
    const index = Number(event.detail.value) || 0;
    const mode = REF_RANGE_MODES[index] || REF_RANGE_MODES[0];
    const reference = normalizeReferenceByMode(this.data.form, mode.key);
    const form = {
      ...this.data.form,
      ...reference,
      ...modeState(reference.refMode),
      refRangeLow: reference.refRangeLow === null ? '' : String(reference.refRangeLow),
      refRangeHigh: reference.refRangeHigh === null ? '' : String(reference.refRangeHigh)
    };
    this.setData({
      form,
      showManualTone: needsManualTone(form)
    });
  },

  onToneChange(event) {
    const index = Number(event.detail.value) || 0;
    this.setData({
      form: {
        ...this.data.form,
        ...toneState((TONE_OPTIONS[index] || TONE_OPTIONS[0]).key)
      }
    });
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
    const hospital = String(form.hospital || '').trim();
    if (!hospital) {
      wx.showToast({ title: '\u8bf7\u586b\u5199\u533b\u9662', icon: 'none' });
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
    const reference = buildReferencePayload(form);
    const valueNumeric = template.valueType === 'quantitative' ? toNumberOrNull(form.valueNumeric) : null;
    const tone = template.valueType === 'quantitative'
      ? calculateTone(valueNumeric, reference.refRangeLow, reference.refRangeHigh, 'quantitative', needsManualTone(form) ? form.tone : '')
      : undefined;
    getApp().ensureCurrentProfileId(api).then((profileId) => api.createManualReport(profileId, {
      reportDate: form.reportDate,
      hospital,
      note: form.note,
      metric: {
        metricKey: template.metricKey,
        metricName: template.metricName,
        originalMetricName: template.metricName,
        category: template.category || 'lab',
        categoryCn: template.categoryCn || '\u68c0\u9a8c',
        valueType: template.valueType || 'quantitative',
        valueNumeric,
        valueQualitative: template.valueType === 'qualitative' ? form.valueQualitative : (template.valueType === 'text' ? form.valueText : ''),
        unit: form.unit,
        refRangeLow: reference.refRangeLow,
        refRangeHigh: reference.refRangeHigh,
        refQualitative: template.refQualitative || '',
        refText: reference.refText,
        tone,
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
