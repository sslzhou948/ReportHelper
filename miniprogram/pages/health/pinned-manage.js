const { api } = require('../../utils/api');

Page({
  data: {
    metrics: [],
    loading: false
  },
  onLoad() {
    this.profileId = getApp().getCurrentProfileId();
    this.load();
  },
  load() {
    this.setData({ loading: true });
    api.listMetricSnapshots(this.profileId).then((metrics) => {
      this.setData({ metrics, loading: false });
    }).catch(() => {
      this.setData({ loading: false });
      wx.showToast({ title: '\u52a0\u8f7d\u5173\u6ce8\u6307\u6807\u5931\u8d25', icon: 'none' });
    });
  },
  goBack() {
    wx.navigateBack();
  },
  toggle(event) {
    const key = event.currentTarget.dataset.key;
    const current = this.data.metrics.find((item) => item.metricKey === key);
    if (!current) return;
    const nextPinned = !current.isPinned;
    this.setData({
      metrics: this.data.metrics.map((item) => (
        item.metricKey === key ? { ...item, isPinned: nextPinned } : item
      ))
    });
    api.setMetricPinned(this.profileId, key, nextPinned).catch(() => {
      this.setData({
        metrics: this.data.metrics.map((item) => (
          item.metricKey === key ? { ...item, isPinned: !nextPinned } : item
        ))
      });
      wx.showToast({ title: '\u66f4\u65b0\u5173\u6ce8\u5931\u8d25', icon: 'none' });
    });
  }
});
