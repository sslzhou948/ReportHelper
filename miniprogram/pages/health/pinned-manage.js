const { api } = require('../../utils/api');
const { showApiErrorToast } = require('../../utils/error');
const { normalizeMetricCategory } = require('../../utils/metric-category');
const { isProfileRequiredError } = require('../../utils/profile');

const PINNED_LIMIT = 8;
const CATEGORY_ICONS = {
  blood_routine: '/assets/ui-refresh/health-icon-blood.png',
  liver_function: '/assets/ui-refresh/health-icon-liver.png',
  kidney_function: '/assets/ui-refresh/health-icon-kidney.png',
  tumor_marker: '/assets/ui-refresh/health-icon-tumor.png',
  tumor_markers: '/assets/ui-refresh/health-icon-tumor.png'
};

function metricIcon(metric) {
  const categoryInfo = normalizeMetricCategory(metric);
  return CATEGORY_ICONS[categoryInfo.category] || '/assets/ui-refresh/health-icon-default.png';
}

function decorateMetrics(metrics, savingKeys) {
  return (metrics || []).map((item) => ({
    ...item,
    icon: metricIcon(item),
    pinSaving: !!savingKeys[item.metricKey]
  }));
}

function buildMetricState(metrics, savingKeys) {
  const decorated = decorateMetrics(metrics, savingKeys);
  return {
    metrics: decorated,
    pinnedCount: decorated.filter((item) => item.isPinned).length
  };
}

Page({
  data: {
    metrics: [],
    pinnedCount: 0,
    pinnedLimit: PINNED_LIMIT,
    savingKeys: {},
    loading: false
  },
  onLoad() {
    getApp().ensureCurrentProfileId(api).then((profileId) => {
      this.profileId = profileId;
      this.load();
    }).catch((error) => {
      if (isProfileRequiredError(error)) return;
      showApiErrorToast(error, '\u52a0\u8f7d\u5173\u6ce8\u6307\u6807\u5931\u8d25');
    });
  },
  load() {
    if (!this.profileId) return;
    this.setData({ loading: true });
    api.listMetricSnapshots(this.profileId).then((metrics) => {
      this.setData({
        ...buildMetricState(metrics, this.data.savingKeys),
        loading: false
      });
    }).catch((error) => {
      this.setData({ loading: false });
      showApiErrorToast(error, '\u52a0\u8f7d\u5173\u6ce8\u6307\u6807\u5931\u8d25');
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
    if (nextPinned && this.data.pinnedCount >= PINNED_LIMIT) {
      wx.showToast({ title: `最多关注 ${PINNED_LIMIT} 项`, icon: 'none' });
      return;
    }
    this.setData({
      savingKeys: {
        ...this.data.savingKeys,
        [key]: true
      },
      ...buildMetricState(this.data.metrics.map((item) => (
        item.metricKey === key ? { ...item, isPinned: nextPinned } : item
      )), {
        ...this.data.savingKeys,
        [key]: true
      })
    });
    api.setMetricPinned(this.profileId, key, nextPinned).then(() => {
      const savingKeys = { ...this.data.savingKeys };
      delete savingKeys[key];
      this.setData({ savingKeys, ...buildMetricState(this.data.metrics, savingKeys) });
    }).catch((error) => {
      const savingKeys = { ...this.data.savingKeys };
      delete savingKeys[key];
      this.setData({
        savingKeys,
        ...buildMetricState(this.data.metrics.map((item) => (
          item.metricKey === key ? { ...item, isPinned: !nextPinned } : item
        )), savingKeys)
      });
      showApiErrorToast(error, '\u66f4\u65b0\u5173\u6ce8\u5931\u8d25');
    });
  },
  showFollowGuide() {
    wx.showModal({
      title: '\u5173\u6ce8\u8bf4\u660e',
      content: '\u5173\u6ce8\u540e\u7684\u6307\u6807\u4f1a\u663e\u793a\u5728\u9996\u9875\u3002\u5f02\u5e38\u6307\u6807\u4f1a\u4f18\u5148\u5c55\u793a\uff0c\u65b9\u4fbf\u5feb\u901f\u590d\u67e5\u3002',
      showCancel: false,
      confirmText: '\u77e5\u9053\u4e86'
    });
  }
});
