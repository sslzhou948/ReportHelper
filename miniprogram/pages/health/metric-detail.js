const { api } = require('../../utils/api');

const PINNED_TOAST = '\u5df2\u52a0\u5165\u5173\u6ce8';
const UNPINNED_TOAST = '\u5df2\u53d6\u6d88\u5173\u6ce8';

Page({
  data: {
    metricKey: '',
    latest: null,
    history: [],
    isQualitative: false,
    isPinned: false,
    loading: false
  },
  onLoad(query) {
    this.profileId = getApp().getCurrentProfileId();
    const metricKey = query.metricKey || 'wbc';
    this.setData({ metricKey });
    this.load(metricKey);
  },
  load(metricKey) {
    this.setData({ loading: true });
    api.getMetricHistory(this.profileId, metricKey).then(({ history }) => {
      const latest = history[0];
      this.setData({
        latest,
        history,
        isQualitative: latest && latest.valueType === 'qualitative',
        isPinned: !!(latest && latest.isPinned),
        loading: false
      });
    }).catch(() => {
      this.setData({ loading: false });
      wx.showToast({ title: '\u52a0\u8f7d\u6307\u6807\u5931\u8d25', icon: 'none' });
    });
  },
  goBack() {
    wx.navigateBack();
  },
  goReport(event) {
    wx.navigateTo({ url: `/pages/health/report-detail?id=${event.currentTarget.dataset.id}` });
  },
  togglePin() {
    const nextPinned = !this.data.isPinned;
    this.setData({ isPinned: nextPinned });
    api.setMetricPinned(this.profileId, this.data.metricKey, nextPinned).then(() => {
      wx.showToast({ title: nextPinned ? PINNED_TOAST : UNPINNED_TOAST, icon: 'none' });
    }).catch(() => {
      this.setData({ isPinned: !nextPinned });
      wx.showToast({ title: '\u66f4\u65b0\u5173\u6ce8\u5931\u8d25', icon: 'none' });
    });
  }
});
