const { api } = require('../../utils/api');
const { showApiErrorToast } = require('../../utils/error');
const { calculateTone } = require('../../utils/trend');
const { buildSourcePreviewUrls, getStoredUploadPhotos } = require('../../utils/source-preview');
const { markerText, metricReportMarkers } = require('../../utils/report-markers');
const { normalizeMetricCategory } = require('../../utils/metric-category');
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

function formatRef(metric) {
  const ref = formatReference(metric);
  return ref === '--' ? '待确认' : ref;
}

function formatValue(metric) {
  if (metric.valueType === 'text') return metric.valueQualitative || '';
  if (metric.valueType === 'qualitative') return metric.valueQualitative || '';
  return metric.valueNumeric !== undefined && metric.valueNumeric !== null ? String(metric.valueNumeric) : '';
}

function shouldShowTonePicker(metric) {
  const refMode = inferRefMode(metric);
  return (metric.valueType || 'quantitative') === 'quantitative'
    && (refMode === 'complex_text' || refMode === 'none');
}

function hasCompleteNumericReference(metric) {
  const refMode = inferRefMode(metric);
  const hasLow = toNumberOrNull(metric.refRangeLow) !== null;
  const hasHigh = toNumberOrNull(metric.refRangeHigh) !== null;
  if (refMode === 'simple_range') return hasLow && hasHigh;
  if (refMode === 'upper_bound') return hasHigh;
  if (refMode === 'lower_bound') return hasLow;
  return false;
}

function recalculateMetricTone(metric) {
  const valueType = metric.valueType || 'quantitative';
  if (valueType === 'text') return 'unknown';
  if (valueType === 'qualitative') return calculateTone(metric.valueQualitative, null, null, 'qualitative', metric.tone);
  if (!shouldShowTonePicker(metric) && !hasCompleteNumericReference(metric)) return 'unknown';
  return calculateTone(metric.valueNumeric, metric.refRangeLow, metric.refRangeHigh, 'quantitative', metric.tone);
}

function groupMetrics(metrics) {
  const groups = {};
  (metrics || []).forEach((metric, index) => {
    const categoryInfo = normalizeMetricCategory(metric);
    const key = categoryInfo.category;
    const toneUiState = toneState(metric.tone || 'unknown');
    if (!groups[key]) {
      groups[key] = {
        key,
        name: categoryInfo.categoryCn,
        items: []
      };
    }
    const reportMarkers = metricReportMarkers(metric);
    groups[key].items.push({
      index,
      name: metric.metricName === undefined || metric.metricName === null ? (metric.metricKey || '') : String(metric.metricName),
      reportMarkers,
      markerText: markerText(reportMarkers),
      hasReportMarkers: reportMarkers.length > 0,
      isManual: !!metric.isManuallyEdited || String(metric.metricKey || '').indexOf('manual_') === 0,
      value: formatValue(metric),
      valueType: metric.valueType || 'quantitative',
      valueQualitative: metric.valueQualitative || '',
      qualitativeIndex: Math.max(0, ['\u9634\u6027', '\u9633\u6027', '\u5f31\u9633\u6027', '\u53ef\u7591'].indexOf(metric.valueQualitative || '')),
      unit: metric.unit || '',
      refLow: metric.refRangeLow === undefined || metric.refRangeLow === null ? '' : String(metric.refRangeLow),
      refHigh: metric.refRangeHigh === undefined || metric.refRangeHigh === null ? '' : String(metric.refRangeHigh),
      refText: metric.refText || '',
      ref: formatRef(metric),
      tone: metric.tone || 'ok',
      ...modeState(inferRefMode(metric)),
      toneIndex: toneUiState.toneIndex,
      toneLabel: toneUiState.toneLabel,
      showTonePicker: shouldShowTonePicker(metric),
      mappingStatus: metric.mappingStatus || 'confirmed',
      uncertain: metric.ocrConfidence !== undefined && metric.ocrConfidence < 0.85
    });
  });
  return Object.keys(groups).map((key) => groups[key]);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isImagingInfo(info) {
  return (info && info.modality) === 'imaging';
}

function isMissingBasicInfoValue(value, placeholders = []) {
  const text = value === undefined || value === null ? '' : String(value).trim();
  return !text || placeholders.includes(text);
}

function hasRecognizedDraftContent(draft) {
  if (!draft || draft.status === 'not_report' || (draft.basicInfo || {}).reportLike === false) return false;
  const hasMetric = (draft.metrics || []).some((metric) => {
    if (!metric) return false;
    if (['qualitative', 'text'].includes(metric.valueType)) return !!String(metric.valueQualitative || '').trim();
    return metric.valueNumeric !== null && metric.valueNumeric !== undefined && metric.valueNumeric !== '';
  });
  const hasFinding = (draft.findings || []).some((finding) => !!String(finding || '').trim());
  return hasMetric || hasFinding;
}

function getMissingBasicInfoFields(draft) {
  if (!hasRecognizedDraftContent(draft)) return [];
  const info = draft.basicInfo || {};
  const missingFields = [];
  if (isMissingBasicInfoValue(info.hospital, ['待确认', '待确认医院'])) missingFields.push('hospital');
  if (isMissingBasicInfoValue(info.reportDate, ['待确认', '待确认日期'])) missingFields.push('reportDate');
  return missingFields;
}

function missingBasicInfoToastTitle(fields) {
  if (fields.includes('hospital') && fields.includes('reportDate')) return '请填写医院和检查日期';
  if (fields.includes('hospital')) return '请填写医院';
  return '请选择检查日期';
}

function fieldValue(info, field, fallback, editing) {
  if (editing && Object.prototype.hasOwnProperty.call(info || {}, field)) return info[field];
  return info && info[field] ? info[field] : fallback;
}

function markOcrReviewed(draft) {
  if (!draft) return;
  draft.basicInfo = {
    ...(draft.basicInfo || {}),
    ocrReviewedAt: new Date().toISOString(),
    ocrReviewSource: 'edit_detail'
  };
}

Page({
  taskId: '',
  reportId: '',
  reportIdx: 0,
  draftId: '',
  draft: null,
  source: 'ocr',
  manualMode: false,
  replaceConfirm: false,

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
    isImagingReport: false,
    sourcePreviewUrls: [],
    warnings: [],
    saveDebug: '',
    refModeLabels: REF_RANGE_MODES.map((item) => item.label),
    toneLabels: TONE_OPTIONS.map((item) => item.label)
  },

  onLoad(query = {}) {
    this.taskId = query.taskId || '';
    this.reportId = query.reportId || '';
    this.source = this.reportId ? 'report' : 'ocr';
    this.reportIdx = Number(query.reportIdx || 0);
    this.manualMode = query.manual === '1';
    this.replaceConfirm = query.replaceConfirm === '1';
    if (query.editing === '1') this.setData({ editing: true });
    if (this.source === 'report') this.loadReport();
    else this.loadDraft();
  },

  refreshData() {
    const draft = this.draft || {};
    const info = draft.basicInfo || {};
    const isImagingReport = isImagingInfo(info);
    const editing = this.data.editing;
    const sourcePreviewUrls = this.source === 'ocr'
      ? buildSourcePreviewUrls(draft.sourcePhotoIds || [], getStoredUploadPhotos())
      : [];
    this.setData({
      basicInfo: {
        type: fieldValue(info, 'type', '待确认报告', editing),
        hospital: fieldValue(info, 'hospital', '待确认医院', editing),
        reportDate: fieldValue(info, 'reportDate', '待确认日期', editing),
        canonicalTypeName: info.canonicalTypeName || '',
        modality: info.modality || 'laboratory',
        examPart: fieldValue(info, 'examPart', '', editing),
        examMethod: fieldValue(info, 'examMethod', '', editing),
        hospitalSource: info.hospitalSource || 'unknown',
        reportDateSource: info.reportDateSource || 'unknown'
      },
      groups: groupMetrics(draft.metrics || []),
      findings: isImagingReport ? (draft.findings || []) : [],
      isImagingReport,
      sourcePreviewUrls,
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
    if (this.source === 'ocr' && this.replaceConfirm) {
      this.returnToOcrConfirmation();
      return;
    }
    wx.navigateBack();
  },

  startEdit() {
    this.setData({ editing: true });
  },

  previewSourcePhoto(event) {
    const index = Number(event.currentTarget.dataset.index || 0);
    const urls = this.data.sourcePreviewUrls || [];
    if (!urls.length) return;
    wx.previewImage({
      current: urls[index] || urls[0],
      urls
    });
  },

  cancelEdit() {
    this.setData({ editing: false });
    if (this.source === 'report') this.loadReport();
    else this.loadDraft();
  },

  onBasicInput(event) {
    const field = event.currentTarget.dataset.field;
    if (!field || !this.draft) return;
    const value = event.detail.value;
    const currentInfo = this.draft.basicInfo || {};
    const nextInfo = {
      ...currentInfo,
      [field]: value
    };
    if (field === 'type') {
      nextInfo.originalType = value;
      nextInfo.canonicalTypeName = '';
      nextInfo.typeKey = value ? (currentInfo.typeKey || 'unknown_laboratory') : 'unknown_laboratory';
    }
    if (field === 'hospital') nextInfo.hospitalSource = 'user_edited';
    if (field === 'reportDate') nextInfo.reportDateSource = 'user_edited';
    this.draft.basicInfo = {
      ...nextInfo
    };
    this.markManualReviewed();
    this.setData({
      basicInfo: {
        ...this.data.basicInfo,
        [field]: value,
        canonicalTypeName: field === 'type' ? '' : this.data.basicInfo.canonicalTypeName,
        hospitalSource: nextInfo.hospitalSource || this.data.basicInfo.hospitalSource,
        reportDateSource: nextInfo.reportDateSource || this.data.basicInfo.reportDateSource
      }
    });
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

  returnToOcrConfirmation() {
    const confirmUrl = `/pages/upload/confirm?taskId=${this.taskId}`;
    let leaving = false;
    const redirectToConfirm = () => {
      if (leaving) return;
      leaving = true;
      wx.redirectTo({
        url: confirmUrl,
        fail: () => {
          wx.reLaunch({
            url: confirmUrl,
            fail: () => this.loadDraft()
          });
        }
      });
    };
    if (this.replaceConfirm) {
      redirectToConfirm();
      return;
    }
    wx.navigateBack({
      delta: 1,
      success: () => {
        leaving = true;
      },
      fail: redirectToConfirm
    });
    setTimeout(() => {
      redirectToConfirm();
    }, 800);
  },

  createManualMetric(valueType) {
    if (!this.draft) return;
    const now = Date.now();
    const metrics = this.draft.metrics || [];
    const isText = valueType === 'text';
    const isQualitative = valueType === 'qualitative';
    this.draft.metrics = metrics.concat([{
      metricKey: `manual_metric_${now}`,
      metricName: isText ? '\u624b\u52a8\u8865\u5f55\u63cf\u8ff0' : '\u624b\u52a8\u8865\u5f55\u6307\u6807',
      originalMetricName: isText ? '\u624b\u52a8\u8865\u5f55\u63cf\u8ff0' : '\u624b\u52a8\u8865\u5f55\u6307\u6807',
      category: 'other',
      categoryCn: '\u5176\u4ed6',
      mappingStatus: 'pending',
      valueType,
      valueNumeric: null,
      valueQualitative: '',
      unit: '',
      refRangeLow: null,
      refRangeHigh: null,
      refQualitative: isQualitative ? '\u9634\u6027' : '',
      refText: isText ? '\u8bf7\u586b\u5199\u63cf\u8ff0' : '',
      refMode: isText || isQualitative ? 'none' : 'none',
      tone: 'unknown',
      isManuallyEdited: true
    }]);
    this.markManualReviewed();
    this.refreshData();
  },

  addManualMetric() {
    if (!this.draft) return;
    wx.showActionSheet({
      alertText: '\u9009\u62e9\u8981\u6dfb\u52a0\u7684\u7ed3\u679c\u7c7b\u578b',
      itemList: ['\u91cf\u5316\u6307\u6807', '\u9634\u6027 / \u9633\u6027', '\u6587\u5b57\u63cf\u8ff0'],
      success: (res) => {
        if (res.tapIndex === 2) {
          if (isImagingInfo(this.draft.basicInfo || {})) this.addFinding();
          else this.createManualMetric('text');
          return;
        }
        this.createManualMetric(res.tapIndex === 1 ? 'qualitative' : 'quantitative');
      },
      fail: (error) => {
        if (!error || error.errMsg !== 'showActionSheet:fail cancel') {
          wx.showToast({ title: '\u672a\u80fd\u6253\u5f00\u7c7b\u578b\u9009\u62e9', icon: 'none' });
        }
      }
    });
  },

  addFinding() {
    if (!this.draft) return;
    if (!isImagingInfo(this.draft.basicInfo || {})) {
      wx.showToast({ title: '\u4ec5\u5f71\u50cf\u7c7b\u62a5\u544a\u53ef\u6dfb\u52a0\u5f71\u50cf\u6240\u89c1', icon: 'none' });
      return;
    }
    this.draft.findings = (this.draft.findings || []).concat(['']);
    this.draft.basicInfo = {
      ...(this.draft.basicInfo || {}),
      analysisPolicy: 'view_only'
    };
    this.draft.analysisPolicy = 'view_only';
    this.markManualReviewed();
    this.refreshData();
  },

  deleteMetric(event) {
    const index = Number(event.currentTarget.dataset.index);
    if (!this.draft || !this.draft.metrics || !this.draft.metrics[index]) return;
    this.draft.metrics = this.draft.metrics.filter((_, metricIndex) => metricIndex !== index);
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
    else if (field === 'metricName') {
      metric.metricName = value;
      metric.originalMetricName = value;
    }
    else if (field === 'refRangeLow') metric.refRangeLow = toNumberOrNull(value);
    else if (field === 'refRangeHigh') metric.refRangeHigh = toNumberOrNull(value);
    else metric[field] = value;

    if (['refRangeLow', 'refRangeHigh', 'refText'].includes(field)) {
      Object.assign(metric, normalizeReferenceByMode(metric, metric.refMode || inferRefMode(metric)));
    }
    metric.tone = recalculateMetricTone(metric);
    this.draft.metrics[index] = metric;
    this.markManualReviewed();
    this.refreshData();
  },

  onRefModeChange(event) {
    const index = Number(event.currentTarget.dataset.index);
    const modeIndex = Number(event.detail.value) || 0;
    if (!this.draft || !this.draft.metrics || !this.draft.metrics[index]) return;
    const mode = REF_RANGE_MODES[modeIndex] || REF_RANGE_MODES[0];
    const metric = {
      ...this.draft.metrics[index],
      isManuallyEdited: true
    };
    Object.assign(metric, normalizeReferenceByMode(metric, mode.key));
    metric.tone = recalculateMetricTone(metric);
    this.draft.metrics[index] = metric;
    this.markManualReviewed();
    this.refreshData();
  },

  onMetricToneChange(event) {
    const index = Number(event.currentTarget.dataset.index);
    const toneIndex = Number(event.detail.value) || 0;
    if (!this.draft || !this.draft.metrics || !this.draft.metrics[index]) return;
    const tone = (TONE_OPTIONS[toneIndex] || TONE_OPTIONS[0]).key;
    this.draft.metrics[index] = {
      ...this.draft.metrics[index],
      tone,
      isManuallyEdited: true
    };
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
    metric.tone = recalculateMetricTone(metric);
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

  deleteFinding(event) {
    const index = Number(event.currentTarget.dataset.index);
    if (!this.draft || !this.draft.findings || this.draft.findings[index] === undefined) return;
    this.draft.findings = this.draft.findings.filter((_, findingIndex) => findingIndex !== index);
    this.markManualReviewed();
    this.refreshData();
  },

  saveAndBack() {
    if (!this.draftId || this.data.saving) {
      this.setData({ saveDebug: !this.draftId ? 'blocked:NO_DRAFT' : 'blocked:SAVING' });
      return Promise.resolve(false);
    }
    const unnamedMetric = (this.draft.metrics || []).find((metric) => (
      (!!metric.isManuallyEdited || String(metric.metricKey || '').indexOf('manual_') === 0)
      && !String(metric.metricName || '').trim()
    ));
    if (unnamedMetric) {
      this.setData({ saveDebug: 'blocked:UNNAMED_METRIC' });
      wx.showToast({ title: '\u8bf7\u586b\u5199\u6307\u6807\u540d\u79f0', icon: 'none' });
      return Promise.resolve(false);
    }
    if (!this.data.isImagingReport && this.draft) this.draft.findings = [];
    if (this.manualMode) {
      const hasMetric = (this.draft.metrics || []).some((metric) => {
        if (['qualitative', 'text'].includes(metric.valueType)) return String(metric.valueQualitative || '').trim();
        return metric.valueNumeric !== null && metric.valueNumeric !== undefined && metric.valueNumeric !== '';
      });
      const hasFinding = (this.draft.findings || []).some((item) => String(item || '').trim());
      if (!hasMetric && !hasFinding) {
        this.setData({ saveDebug: 'blocked:EMPTY_MANUAL_DRAFT' });
        wx.showToast({ title: '\u8bf7\u5148\u8865\u5f55\u6307\u6807\u6216\u5f71\u50cf\u6240\u89c1', icon: 'none' });
        return Promise.resolve(false);
      }
      this.markManualReviewed();
    }
    if (this.source === 'ocr') {
      const missingBasicInfo = getMissingBasicInfoFields(this.draft);
      if (missingBasicInfo.length) {
        this.setData({ saveDebug: `blocked:MISSING_BASIC_INFO:${missingBasicInfo.join(',')}` });
        wx.showToast({ title: missingBasicInfoToastTitle(missingBasicInfo), icon: 'none' });
        return Promise.resolve(false);
      }
      markOcrReviewed(this.draft);
    }
    this.setData({ saving: true, saveDebug: 'saving' });
    if (this.source === 'report') {
      return api.updateReport(this.reportId, {
        basicInfo: this.draft.basicInfo || {},
        metrics: this.draft.metrics || [],
        findings: this.data.isImagingReport ? (this.draft.findings || []) : [],
        warnings: this.draft.warnings || []
      }, {
        idempotencyKey: `edit_report_${this.reportId}`
      }).then(() => {
        wx.showToast({ title: '已保存修改', icon: 'success' });
        this.setData({ saving: false, editing: false, saveDebug: 'saved' });
        setTimeout(() => wx.navigateBack(), 500);
      }).catch((error) => {
        this.setData({ saving: false, saveDebug: error && error.code ? `failed:${error.code}` : 'failed' });
        showApiErrorToast(error, '保存修改失败');
      });
    }
    return api.updateOcrDraft({
      taskId: this.taskId,
      draftId: this.draftId,
      draft: {
        ...this.draft,
        findings: this.data.isImagingReport ? (this.draft.findings || []) : []
      }
    }, {
      idempotencyKey: `edit_draft_${this.taskId}_${this.draftId}`
    }).then(() => {
      wx.showToast({ title: '已保存修改', icon: 'success' });
      this.setData({ saving: false, editing: false, saveDebug: 'saved' });
      this.returnToOcrConfirmation();
    }).catch((error) => {
      this.setData({ saving: false, saveDebug: error && error.code ? `failed:${error.code}` : 'failed' });
      showApiErrorToast(error, '保存修改失败');
    });
  }
});
