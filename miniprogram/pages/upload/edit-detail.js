const { api } = require('../../utils/api');
const { showApiErrorToast } = require('../../utils/error');
const { calculateTone } = require('../../utils/trend');

function formatRef(metric) {
  if (metric.refText) return metric.refText;
  if (metric.refQualitative) return metric.refQualitative;
  const low = metric.refRangeLow;
  const high = metric.refRangeHigh;
  if (low !== undefined && low !== null && high !== undefined && high !== null) return `${low}-${high}`;
  if (low !== undefined && low !== null) return `>=${low}`;
  if (high !== undefined && high !== null) return `<=${high}`;
  return '待确认';
}

function formatValue(metric) {
  if (metric.valueType === 'qualitative') return metric.valueQualitative || '';
  return metric.valueNumeric !== undefined && metric.valueNumeric !== null ? String(metric.valueNumeric) : '';
}

function toNumberOrNull(value) {
  if (value === '' || value === undefined || value === null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function groupMetrics(metrics) {
  const groups = {};
  (metrics || []).forEach((metric, index) => {
    const key = metric.category || 'other';
    if (!groups[key]) {
      groups[key] = {
        key,
        name: metric.categoryCn || '其他',
        items: []
      };
    }
    groups[key].items.push({
      index,
      name: metric.metricName || metric.metricKey,
      value: formatValue(metric),
      valueType: metric.valueType || 'quantitative',
      valueQualitative: metric.valueQualitative || '',
      unit: metric.unit || '',
      refLow: metric.refRangeLow === undefined || metric.refRangeLow === null ? '' : String(metric.refRangeLow),
      refHigh: metric.refRangeHigh === undefined || metric.refRangeHigh === null ? '' : String(metric.refRangeHigh),
      refText: metric.refText || '',
      ref: formatRef(metric),
      tone: metric.tone || 'ok',
      mappingStatus: metric.mappingStatus || 'confirmed',
      uncertain: metric.ocrConfidence !== undefined && metric.ocrConfidence < 0.85
    });
  });
  return Object.keys(groups).map((key) => groups[key]);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

Page({
  taskId: '',
  reportId: '',
  reportIdx: 0,
  draftId: '',
  draft: null,
  source: 'ocr',
  manualMode: false,

  data: {
    loading: false,
    saving: false,
    editing: false,
    basicInfo: {
      type: '待确认报告',
      hospital: '待确认医院',
      reportDate: '待确认日期',
      canonicalTypeName: '',
      modality: 'laboratory',
      examPart: '',
      examMethod: '',
      hospitalSource: 'unknown',
      reportDateSource: 'unknown'
    },
    groups: [],
    findings: [],
    warnings: []
  },

  onLoad(query = {}) {
    this.taskId = query.taskId || '';
    this.reportId = query.reportId || '';
    this.source = this.reportId ? 'report' : 'ocr';
    this.reportIdx = Number(query.reportIdx || 0);
    this.manualMode = query.manual === '1';
    if (query.editing === '1') this.setData({ editing: true });
    if (this.source === 'report') this.loadReport();
    else this.loadDraft();
  },

  refreshData() {
    const draft = this.draft || {};
    const info = draft.basicInfo || {};
    this.setData({
      basicInfo: {
        type: info.type || '待确认报告',
        hospital: info.hospital || '待确认医院',
        reportDate: info.reportDate || '待确认日期',
        canonicalTypeName: info.canonicalTypeName || '',
        modality: info.modality || 'laboratory',
        examPart: info.examPart || '',
        examMethod: info.examMethod || '',
        hospitalSource: info.hospitalSource || 'unknown',
        reportDateSource: info.reportDateSource || 'unknown'
      },
      groups: groupMetrics(draft.metrics || []),
      findings: draft.findings || [],
      warnings: draft.warnings || []
    });
  },

  loadDraft() {
    if (!this.taskId) {
      wx.showToast({ title: '未找到识别任务', icon: 'none' });
      return;
    }
    this.setData({ loading: true });
    api.getOcrTask(this.taskId).then((task) => {
      this.draft = clone((task.drafts || [])[this.reportIdx] || {});
      this.draftId = this.draft.draftId || '';
      this.setData({ loading: false });
      this.refreshData();
    }).catch((error) => {
      this.setData({ loading: false });
      showApiErrorToast(error, '加载报告详情失败');
    });
  },

  loadReport() {
    if (!this.reportId) {
      wx.showToast({ title: '未找到报告', icon: 'none' });
      return;
    }
    this.setData({ loading: true });
    api.getReportDetail(this.reportId).then(({ report }) => {
      this.draft = clone({
        draftId: report.id,
        basicInfo: {
          type: report.type,
          originalType: report.originalType,
          canonicalTypeName: report.canonicalTypeName,
          modality: report.modality,
          examPart: report.examPart,
          examMethod: report.examMethod,
          hospital: report.hospital,
          reportDate: report.reportDate,
          hospitalSource: 'ocr',
          reportDateSource: 'ocr'
        },
        metrics: report.metrics || [],
        findings: report.findings || [],
        warnings: report.warnings || []
      });
      this.draftId = report.id;
      this.setData({ loading: false });
      this.refreshData();
    }).catch((error) => {
      this.setData({ loading: false });
      showApiErrorToast(error, '加载报告详情失败');
    });
  },

  goBack() {
    wx.navigateBack();
  },

  startEdit() {
    this.setData({ editing: true });
  },

  cancelEdit() {
    this.setData({ editing: false });
    if (this.source === 'report') this.loadReport();
    else this.loadDraft();
  },

  onBasicInput(event) {
    const field = event.currentTarget.dataset.field;
    if (!field || !this.draft) return;
    this.draft.basicInfo = {
      ...(this.draft.basicInfo || {}),
      [field]: event.detail.value
    };
    if (field === 'hospital') this.draft.basicInfo.hospitalSource = 'user_edited';
    if (field === 'reportDate') this.draft.basicInfo.reportDateSource = 'user_edited';
    this.markManualReviewed();
    this.refreshData();
  },

  onDateChange(event) {
    if (!this.draft) return;
    this.draft.basicInfo = {
      ...(this.draft.basicInfo || {}),
      reportDate: event.detail.value,
      reportDateSource: 'user_edited'
    };
    this.markManualReviewed();
    this.refreshData();
  },

  markManualReviewed() {
    if (!this.draft) return;
    if (this.manualMode || ['needs_manual_input', 'not_report'].includes(this.draft.status)) {
      this.draft.status = 'needs_review';
      this.draft.basicInfo = {
        ...(this.draft.basicInfo || {}),
        reportLike: true
      };
    }
  },

  addManualMetric() {
    if (!this.draft) return;
    const metrics = this.draft.metrics || [];
    this.draft.metrics = metrics.concat([{
      metricKey: `manual_metric_${Date.now()}`,
      metricName: '\u624b\u52a8\u8865\u5f55\u6307\u6807',
      originalMetricName: '\u624b\u52a8\u8865\u5f55\u6307\u6807',
      category: 'other',
      categoryCn: '\u5176\u4ed6',
      mappingStatus: 'pending',
      valueType: 'quantitative',
      valueNumeric: null,
      unit: '',
      refRangeLow: null,
      refRangeHigh: null,
      tone: 'unknown',
      isManuallyEdited: true
    }]);
    this.markManualReviewed();
    this.refreshData();
  },

  addFinding() {
    if (!this.draft) return;
    this.draft.findings = (this.draft.findings || []).concat(['']);
    this.draft.basicInfo = {
      ...(this.draft.basicInfo || {}),
      modality: (this.draft.basicInfo && this.draft.basicInfo.modality) || 'imaging',
      analysisPolicy: 'view_only'
    };
    this.draft.analysisPolicy = 'view_only';
    this.markManualReviewed();
    this.refreshData();
  },

  onMetricInput(event) {
    const index = Number(event.currentTarget.dataset.index);
    const field = event.currentTarget.dataset.field;
    if (!this.draft || !this.draft.metrics || !this.draft.metrics[index] || !field) return;
    const metric = {
      ...this.draft.metrics[index],
      isManuallyEdited: true
    };
    const value = event.detail.value;
    if (field === 'valueNumeric') metric.valueNumeric = toNumberOrNull(value);
    else if (field === 'valueQualitative') metric.valueQualitative = value;
    else if (field === 'refRangeLow') metric.refRangeLow = toNumberOrNull(value);
    else if (field === 'refRangeHigh') metric.refRangeHigh = toNumberOrNull(value);
    else metric[field] = value;

    const valueForTone = metric.valueType === 'qualitative' ? metric.valueQualitative : metric.valueNumeric;
    metric.tone = calculateTone(valueForTone, metric.refRangeLow, metric.refRangeHigh, metric.valueType || 'quantitative');
    this.draft.metrics[index] = metric;
    this.markManualReviewed();
    this.refreshData();
  },

  onQualitativeChange(event) {
    const options = ['阴性', '阳性', '弱阳性', '可疑'];
    const index = Number(event.currentTarget.dataset.index);
    if (!this.draft || !this.draft.metrics || !this.draft.metrics[index]) return;
    const value = options[Number(event.detail.value)] || '';
    const metric = {
      ...this.draft.metrics[index],
      valueType: 'qualitative',
      valueQualitative: value,
      isManuallyEdited: true
    };
    metric.tone = calculateTone(metric.valueQualitative, metric.refRangeLow, metric.refRangeHigh, 'qualitative');
    this.draft.metrics[index] = metric;
    this.markManualReviewed();
    this.refreshData();
  },

  onFindingInput(event) {
    const index = Number(event.currentTarget.dataset.index);
    if (!this.draft || !this.draft.findings || this.draft.findings[index] === undefined) return;
    this.draft.findings[index] = event.detail.value;
    this.markManualReviewed();
    this.refreshData();
  },

  saveAndBack() {
    if (!this.draftId || this.data.saving) return Promise.resolve(false);
    if (this.manualMode) {
      const hasMetric = (this.draft.metrics || []).some((metric) => (
        metric.valueType === 'qualitative'
          ? String(metric.valueQualitative || '').trim()
          : metric.valueNumeric !== null && metric.valueNumeric !== undefined && metric.valueNumeric !== ''
      ));
      const hasFinding = (this.draft.findings || []).some((item) => String(item || '').trim());
      if (!hasMetric && !hasFinding) {
        wx.showToast({ title: '\u8bf7\u5148\u8865\u5f55\u6307\u6807\u6216\u5f71\u50cf\u6240\u89c1', icon: 'none' });
        return Promise.resolve(false);
      }
      this.markManualReviewed();
    }
    this.setData({ saving: true });
    if (this.source === 'report') {
      return api.updateReport(this.reportId, {
        basicInfo: this.draft.basicInfo || {},
        metrics: this.draft.metrics || [],
        findings: this.draft.findings || [],
        warnings: this.draft.warnings || []
      }, {
        idempotencyKey: `edit_report_${this.reportId}`
      }).then(() => {
        wx.showToast({ title: '已保存修改', icon: 'success' });
        this.setData({ saving: false, editing: false });
        setTimeout(() => wx.navigateBack(), 500);
      }).catch((error) => {
        this.setData({ saving: false });
        showApiErrorToast(error, '保存修改失败');
      });
    }
    return api.updateOcrDraft({
      taskId: this.taskId,
      draftId: this.draftId,
      draft: this.draft
    }, {
      idempotencyKey: `edit_draft_${this.taskId}_${this.draftId}`
    }).then(() => {
      wx.showToast({ title: '已保存修改', icon: 'success' });
      this.setData({ saving: false, editing: false });
      this.loadDraft();
    }).catch((error) => {
      this.setData({ saving: false });
      showApiErrorToast(error, '保存修改失败');
    });
  }
});
