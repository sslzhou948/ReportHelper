const { api } = require('../../utils/api');

function sourceLabel(sourcePhotoId) {
  const match = String(sourcePhotoId || '').match(/\d+/);
  return match ? `\u6765\u81ea\u7b2c ${match[0]} \u5f20` : '\u6765\u81ea\u5f85\u786e\u8ba4\u56fe\u7247';
}

Page({
  taskId: '',
  draftId: '',
  metricKey: '',

  data: {
    loading: false,
    selectedIndex: 0,
    reportTitle: '',
    metricName: '',
    candidates: []
  },

  onLoad(query = {}) {
    this.taskId = query.taskId || '';
    this.metricKey = query.metricKey || 'wbc';
    this.reportIdx = Number(query.reportIdx || 0);
    this.loadConflict();
  },

  loadConflict() {
    if (!this.taskId) return;
    this.setData({ loading: true });
    api.getOcrTask(this.taskId).then((task) => {
      const draft = (task.drafts || [])[this.reportIdx] || {};
      const conflict = (draft.conflicts || []).find((item) => item.metricKey === this.metricKey) || {};
      this.draftId = draft.draftId || '';
      this.setData({
        loading: false,
        reportTitle: `\u62a5\u544a ${this.reportIdx + 1} \u00b7 ${(draft.basicInfo && draft.basicInfo.type) || '\u5f85\u786e\u8ba4\u62a5\u544a'}`,
        metricName: conflict.metricName || this.metricKey,
        candidates: (conflict.candidates || []).map((candidate, index) => ({
          ...candidate,
          index,
          sourceLabel: sourceLabel(candidate.sourcePhotoId)
        }))
      });
    }).catch(() => {
      this.setData({ loading: false });
      wx.showToast({ title: '\u52a0\u8f7d\u51b2\u7a81\u4fe1\u606f\u5931\u8d25', icon: 'none' });
    });
  },

  goBack() {
    wx.navigateBack();
  },

  choose(event) {
    this.setData({ selectedIndex: Number(event.currentTarget.dataset.index) });
  },

  apply() {
    return api.resolveOcrConflict({
      taskId: this.taskId,
      draftId: this.draftId,
      metricKey: this.metricKey,
      selectedCandidateIndex: this.data.selectedIndex
    }).then(() => {
      wx.showToast({ title: '\u5df2\u5e94\u7528\u9009\u62e9', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 500);
    }).catch(() => {
      wx.showToast({ title: '\u5e94\u7528\u9009\u62e9\u5931\u8d25', icon: 'none' });
    });
  }
});
