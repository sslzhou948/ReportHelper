const { api } = require('../../utils/api');
const { showApiErrorToast } = require('../../utils/error');

function sourceLabel(sourcePhotoId) {
  const match = String(sourcePhotoId || '').match(/\d+/);
  return match ? `来自第 ${match[0]} 张` : '来自待确认图片';
}

function candidateValue(candidate) {
  if (candidate.valueDisplay) return candidate.valueDisplay;
  if (candidate.valueNumeric !== undefined && candidate.valueNumeric !== null && candidate.valueNumeric !== '') return String(candidate.valueNumeric);
  return candidate.valueQualitative || candidate.valueText || candidate.label || candidate.value || '待确认';
}

function conflictMetricKey(conflict) {
  const direct = String(conflict && conflict.metricKey || '').trim();
  if (direct) return direct;
  const candidate = (Array.isArray(conflict && conflict.candidates) ? conflict.candidates : [])
    .find((item) => String(item && item.metricKey || '').trim());
  return candidate ? String(candidate.metricKey || '').trim() : '';
}

function conflictMetricName(conflict) {
  const direct = String(conflict && conflict.metricName || '').trim();
  if (direct) return direct;
  const candidate = (Array.isArray(conflict && conflict.candidates) ? conflict.candidates : [])
    .find((item) => String(item && (item.metricName || item.originalMetricName) || '').trim());
  return candidate ? String(candidate.metricName || candidate.originalMetricName || '').trim() : '';
}

function metricMatchesConflict(metric, conflict) {
  const metricKey = conflictMetricKey(conflict);
  const metricName = conflictMetricName(conflict);
  return String(metric.metricKey || '').trim() === metricKey
    || (!!metricName && String(metric.metricName || '').trim() === metricName);
}

function currentMetricForConflict(metrics, conflict) {
  return (metrics || []).find((metric) => metricMatchesConflict(metric, conflict)) || null;
}

function candidateRef(candidate) {
  if (candidate.refText) return candidate.refText;
  const values = [candidate.refRangeLow, candidate.refRangeHigh].filter((value) => value !== undefined && value !== null && value !== '');
  return values.join('-');
}

function candidateSourceLabel(candidate, fallback) {
  if (candidate.sourcePhotoId) return sourceLabel(candidate.sourcePhotoId);
  if (candidate.sourceLabel) return candidate.sourceLabel;
  return fallback;
}

function toDisplayCandidate(candidate, index, fallbackSourceLabel) {
  return {
    ...candidate,
    index,
    displayValue: candidateValue(candidate),
    displayUnit: candidate.unit || '',
    displayRef: candidateRef(candidate),
    sourceLabel: candidateSourceLabel(candidate, fallbackSourceLabel)
  };
}

function conflictCandidates(conflict) {
  return Array.isArray(conflict && conflict.candidates) ? conflict.candidates : [];
}

function isDisplayableConflict(conflict, metrics) {
  const metricKey = conflictMetricKey(conflict);
  const metricName = conflictMetricName(conflict);
  if (!metricKey && !metricName) return false;
  return conflictCandidates(conflict).length > 0 || !!currentMetricForConflict(metrics, conflict);
}

function isLikelyNonReportMetricConflict(conflict) {
  const text = [
    conflict && conflict.metricKey,
    conflict && conflict.metricName,
    ...conflictCandidates(conflict).map((candidate) => [
      candidate.metricKey,
      candidate.metricName,
      candidate.originalMetricName
    ].filter(Boolean).join(' '))
  ].filter(Boolean).join(' ').toLowerCase();
  return /\burine[_\s-]*volume(?:[_\s-]*24h)?\b|24\s*h(?:our)?\s*urine|24小时尿量|24\s*小时\s*尿|尿量/.test(text);
}

function buildConflictItem(conflict, index, metrics) {
  const currentMetric = currentMetricForConflict(metrics, conflict);
  const candidates = conflictCandidates(conflict);
  const rawCandidates = candidates.length
    ? candidates
    : (currentMetric ? [{
      ...currentMetric,
      label: '保留当前识别值',
      sourceLabel: '当前识别结果'
    }] : []);
  const shouldDeleteByDefault = isLikelyNonReportMetricConflict(conflict);
  const metricKey = conflictMetricKey(conflict);
  const metricName = conflictMetricName(conflict);
  return {
    id: `${metricKey || metricName || 'metric'}_${index}`,
    displayIndex: index + 1,
    metricKey,
    resolveKey: metricKey || metricName,
    metricName: metricName || metricKey || '待确认指标',
    message: shouldDeleteByDefault
      ? (conflict.message || '疑似非本报告指标，建议删除后回到确认页核对原图。')
      : (conflict.message || ''),
    selectedIndex: shouldDeleteByDefault ? -1 : (rawCandidates.length ? 0 : -1),
    candidates: rawCandidates.map((candidate, candidateIndex) => toDisplayCandidate(candidate, candidateIndex, '识别候选'))
  };
}

Page({
  taskId: '',
  draftId: '',
  metricKey: '',
  reportIdx: 0,
  draft: null,
  invalidConflicts: [],

  data: {
    loading: false,
    saving: false,
    reportTitle: '',
    conflictCount: 0,
    autoIgnoredCount: 0,
    conflicts: []
  },

  onLoad(query = {}) {
    this.taskId = query.taskId || '';
    this.metricKey = query.metricKey || '';
    this.reportIdx = Number(query.reportIdx || 0);
    this.loadConflict();
  },

  loadConflict() {
    if (!this.taskId) return;
    this.setData({ loading: true });
    api.getOcrTask(this.taskId).then((task) => {
      const draft = (task.drafts || [])[this.reportIdx] || {};
      const conflicts = draft.conflicts || [];
      const orderedConflicts = this.metricKey
        ? conflicts.slice().sort((left, right) => {
          if (left.metricKey === this.metricKey) return -1;
          if (right.metricKey === this.metricKey) return 1;
          return 0;
        })
        : conflicts;
      this.draftId = draft.draftId || '';
      this.draft = draft;
      this.invalidConflicts = orderedConflicts.filter((conflict) => !isDisplayableConflict(conflict, draft.metrics || []));
      const displayableConflicts = orderedConflicts.filter((conflict) => isDisplayableConflict(conflict, draft.metrics || []));
      this.setData({
        loading: false,
        reportTitle: `报告 ${this.reportIdx + 1} · ${(draft.basicInfo && draft.basicInfo.type) || '待确认报告'}`,
        conflictCount: displayableConflicts.length,
        autoIgnoredCount: this.invalidConflicts.length,
        conflicts: displayableConflicts.map((conflict, index) => buildConflictItem(conflict, index, draft.metrics || []))
      });
    }).catch((error) => {
      this.setData({ loading: false });
      showApiErrorToast(error, '加载冲突信息失败');
    });
  },

  goBack() {
    wx.navigateBack();
  },

  choose(event) {
    const conflictIndex = Number(event.currentTarget.dataset.conflictIndex);
    const selectedIndex = Number(event.currentTarget.dataset.index);
    const conflicts = (this.data.conflicts || []).map((conflict, index) => (
      index === conflictIndex ? { ...conflict, selectedIndex } : conflict
    ));
    this.setData({ conflicts });
  },

  cleanInvalidConflicts() {
    if (!this.invalidConflicts.length || !this.draftId || !this.draft) {
      return Promise.resolve(false);
    }
    const metrics = this.draft.metrics || [];
    const conflicts = (this.draft.conflicts || []).filter((conflict) => isDisplayableConflict(conflict, metrics));
    return api.updateOcrDraft({
      taskId: this.taskId,
      draftId: this.draftId,
      draft: {
        conflicts,
        status: conflicts.length ? this.draft.status : 'needs_review'
      }
    });
  },

  apply() {
    if (this.data.saving) return Promise.resolve(false);
    const conflicts = this.data.conflicts || [];
    if (!conflicts.length && !this.invalidConflicts.length) {
      wx.navigateBack();
      return Promise.resolve(false);
    }
    this.setData({ saving: true });
    return this.cleanInvalidConflicts().then(() => conflicts.reduce((chain, conflict) => chain.then(() => {
      const selectedCandidateIndex = Number(conflict.selectedIndex);
      return api.resolveOcrConflict({
        taskId: this.taskId,
        draftId: this.draftId,
        metricKey: conflict.resolveKey || conflict.metricKey,
        selectedCandidateIndex: selectedCandidateIndex < 0 ? 0 : selectedCandidateIndex,
        resolution: selectedCandidateIndex < 0 ? 'delete' : 'keep'
      });
    }), Promise.resolve())).then(() => {
      const handledCount = conflicts.length + this.invalidConflicts.length;
      wx.showToast({ title: `已处理 ${handledCount} 项冲突`, icon: 'success' });
      const pages = getCurrentPages();
      const previous = pages[pages.length - 2];
      if (previous && typeof previous.loadTask === 'function') {
        previous.loadTask();
      }
      setTimeout(() => wx.navigateBack(), 500);
    }).catch((error) => {
      this.setData({ saving: false });
      showApiErrorToast(error, '应用选择失败');
    });
  }
});
