const { api } = require('../../utils/api');

function buildReportTitle(index, draft) {
  const pageCount = draft.pageCount || (draft.sourcePhotoIds || []).length || 1;
  if (pageCount > 1) return `\u62a5\u544a ${index + 1} \u00b7 \u5df2\u5408\u5e76 ${pageCount} \u9875`;
  return `\u62a5\u544a ${index + 1}`;
}

function buildReportMeta(draft) {
  const info = draft.basicInfo || {};
  const base = [info.hospital || '\u5f85\u786e\u8ba4\u533b\u9662', info.reportDate || '\u5f85\u786e\u8ba4\u65e5\u671f'];
  if (info.modality === 'imaging' && info.examPart) base.push(info.examPart);
  return base.join(' \u00b7 ');
}

function toDisplayReport(draft, index) {
  const conflicts = draft.conflicts || [];
  const metrics = draft.metrics || [];
  const findings = draft.findings || [];
  const info = draft.basicInfo || {};
  const abnormalCount = metrics.filter((metric) => metric.tone && metric.tone !== 'ok').length;
  const pendingCount = metrics.filter((metric) => ['pending', 'conflicted'].includes(metric.mappingStatus)).length;
  const inferred = [info.hospitalSource, info.reportDateSource].includes('inferred_from_batch');

  return {
    draftId: draft.draftId,
    title: buildReportTitle(index, draft),
    type: info.type || '\u5f85\u786e\u8ba4\u62a5\u544a',
    canonicalTypeName: info.canonicalTypeName || '',
    modality: info.modality || 'laboratory',
    examPart: info.examPart || '',
    analysisPolicy: draft.analysisPolicy || (info.modality === 'imaging' ? 'view_only' : 'metric_analysis'),
    meta: buildReportMeta(draft),
    count: metrics.length ? `${metrics.length} \u9879\u6307\u6807` : (findings.length ? '\u5f71\u50cf\u6240\u89c1' : '\u5f85\u786e\u8ba4\u6307\u6807'),
    abnormal: abnormalCount ? `${abnormalCount} \u9879\u5f02\u5e38` : '',
    pendingText: pendingCount ? `${pendingCount} \u9879\u5f85\u786e\u8ba4\u5f52\u7c7b` : '',
    inferredText: inferred ? '\u90e8\u5206\u57fa\u672c\u4fe1\u606f\u6765\u81ea\u540c\u6279\u63a8\u6d4b' : '',
    conflict: conflicts.length > 0,
    conflictCount: conflicts.length,
    metricKey: conflicts[0] && conflicts[0].metricKey,
    sourcePhotoIds: draft.sourcePhotoIds || []
  };
}

Page({
  taskId: '',
  drafts: [],

  data: {
    loading: false,
    saving: false,
    reports: [],
    reportCount: 0,
    unresolvedConflictCount: 0
  },

  onLoad(query = {}) {
    this.taskId = query.taskId || '';
  },

  onShow() {
    this.loadTask();
  },

  loadTask() {
    if (!this.taskId) {
      wx.showToast({ title: '\u672a\u627e\u5230\u8bc6\u522b\u4efb\u52a1', icon: 'none' });
      return;
    }

    this.setData({ loading: true });
    api.getOcrTask(this.taskId).then((task) => {
      this.drafts = task.drafts || [];
      const reports = this.drafts.map(toDisplayReport);
      this.setData({
        loading: false,
        reports,
        reportCount: task.reportCount || reports.length,
        unresolvedConflictCount: reports.reduce((sum, report) => sum + (report.conflictCount || 0), 0)
      });
    }).catch(() => {
      this.setData({ loading: false });
      wx.showToast({ title: '\u52a0\u8f7d\u8bc6\u522b\u7ed3\u679c\u5931\u8d25', icon: 'none' });
    });
  },

  goBack() {
    wx.navigateBack();
  },

  goEdit(event) {
    wx.navigateTo({ url: `/pages/upload/edit-detail?taskId=${this.taskId}&reportIdx=${event.currentTarget.dataset.index}` });
  },

  goConflict(event) {
    const report = this.data.reports[event.currentTarget.dataset.index] || {};
    wx.navigateTo({ url: `/pages/upload/conflict?taskId=${this.taskId}&reportIdx=${event.currentTarget.dataset.index}&metricKey=${report.metricKey || 'wbc'}` });
  },

  saveAll() {
    if (this.data.saving) return Promise.resolve(false);
    if (this.data.unresolvedConflictCount > 0) {
      wx.showToast({
        title: `\u8bf7\u5148\u5904\u7406 ${this.data.unresolvedConflictCount} \u4e2a\u51b2\u7a81`,
        icon: 'none'
      });
      return Promise.resolve(false);
    }

    this.setData({ saving: true });
    return api.batchCreateReports({
      ocrTaskId: this.taskId,
      reports: this.drafts
    }, {
      idempotencyKey: `save_${this.taskId}`
    }).then((result) => {
      const savedCount = result.reports ? result.reports.length : this.data.reportCount;
      wx.showToast({ title: `\u5df2\u4fdd\u5b58 ${savedCount} \u4efd\u62a5\u544a`, icon: 'success' });
      wx.setStorageSync('healthDefaultView', 'time');
      const pending = wx.getStorageSync('pendingOcrTasks') || [];
      wx.setStorageSync('pendingOcrTasks', pending.filter((item) => item.taskId !== this.taskId));
      setTimeout(() => wx.switchTab({ url: '/pages/health/index' }), 600);
    }).catch(() => {
      this.setData({ saving: false });
      wx.showToast({ title: '\u4fdd\u5b58\u62a5\u544a\u5931\u8d25', icon: 'none' });
    });
  }
});
