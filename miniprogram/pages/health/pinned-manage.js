const { api } = require('../../utils/api');
const { showApiErrorToast } = require('../../utils/error');

function decorateSaving(metrics, savingKeys) {
  return (metrics || []).map((item) => ({
    ...item,
    pinSaving: !!savingKeys[item.metricKey]
  }));
}

Page({
  data: {
    metrics: [],
    savingKeys: {},
    loading: false
  },
  onLoad() {
    this.profileId = getApp().getCurrentProfileId();
    this.load();
  },
  load() {
    this.setData({ loading: true });
    api.listMetricSnapshots(this.profileId).then((metrics) => {
      this.setData({ metrics: decorateSaving(metrics, this.data.savingKeys), loading: false });
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
    if (this.data.savingKeys[key]) return;
    const current = this.data.metrics.find((item) => item.metricKey === key);
    if (!current) return;
    const nextPinned = !current.isPinned;
    this.setData({
      savingKeys: {
        ...this.data.savingKeys,
        [key]: true
      },
      metrics: decorateSaving(this.data.metrics.map((item) => (
        item.metricKey === key ? { ...item, isPinned: nextPinned } : item
      )), {
        ...this.data.savingKeys,
        [key]: true
      })
    });
    api.setMetricPinned(this.profileId, key, nextPinned).then(() => {
      const savingKeys = { ...this.data.savingKeys };
      delete savingKeys[key];
      this.setData({ savingKeys, metrics: decorateSaving(this.data.metrics, savingKeys) });
    }).catch((error) => {
      const savingKeys = { ...this.data.savingKeys };
      delete savingKeys[key];
      this.setData({
        savingKeys,
        metrics: decorateSaving(this.data.metrics.map((item) => (
          item.metricKey === key ? { ...item, isPinned: !nextPinned } : item
        )), savingKeys)
      });
      showApiErrorToast(error, '\u66f4\u65b0\u5173\u6ce8\u5931\u8d25');
    });
  }
});
