const { api } = require('../../utils/api');

const ROUTE_MAP = {
  '\u6570\u636e\u5bfc\u51fa': '/pages/profile/export',
  '\u62a5\u544a\u5f52\u6863\u7ba1\u7406': '/pages/profile/reports-archive',
  '\u4f7f\u7528\u6307\u5357': '/pages/profile/guide',
  '\u6307\u6807\u8bf4\u660e': '/pages/profile/metric-help',
  '\u610f\u89c1\u53cd\u9988': '/pages/profile/feedback',
  '\u5173\u4e8e\u6211\u4eec v1.0.0': '/pages/profile/about'
};

Page({
  data: {
    profile: null,
    profiles: [],
    reportsCount: 0,
    metricsCount: 0,
    recheckCount: 0,
    switcherVisible: false,
    loading: false
  },
  onShow() {
    this.load();
  },
  load() {
    const profileId = getApp().getCurrentProfileId();
    this.setData({ loading: true });
    Promise.all([
      api.getProfile(profileId),
      api.getProfiles(),
      api.listReports(profileId),
      api.listMetricSnapshots(profileId),
      api.listRecheckPlans(profileId)
    ]).then(([profile, profiles, reports, metrics, recheck]) => {
      this.setData({
        profile,
        profiles,
        reportsCount: reports.length,
        metricsCount: metrics.length,
        recheckCount: (recheck.nextPlan ? 1 : 0) + (recheck.otherPlans || []).length,
        loading: false
      });
    }).catch(() => {
      this.setData({ loading: false });
      wx.showToast({ title: '\u52a0\u8f7d\u6211\u7684\u9875\u9762\u5931\u8d25', icon: 'none' });
    });
  },
  goArchive() {
    wx.navigateTo({ url: '/pages/profile/archive' });
  },
  openSwitcher() {
    this.setData({ switcherVisible: true });
  },
  closeSwitcher() {
    this.setData({ switcherVisible: false });
  },
  switchProfile(event) {
    getApp().setCurrentProfileId(event.detail.profileId);
    this.setData({ switcherVisible: false });
    this.load();
  },
  addProfile() {
    wx.navigateTo({ url: '/pages/profile/add' });
  },
  showStatic(event) {
    const title = event.currentTarget.dataset.title;
    if (ROUTE_MAP[title]) {
      wx.navigateTo({ url: ROUTE_MAP[title] });
      return;
    }
    wx.showToast({ title, icon: 'none' });
  },
  logout() {
    wx.showModal({
      title: '\u9000\u51fa\u767b\u5f55\uff1f',
      content: '\u9000\u51fa\u540e\u53ef\u91cd\u65b0\u5fae\u4fe1\u767b\u5f55\u3002',
      success: (res) => {
        if (!res.confirm) return;
        api.logout({
          idempotencyKey: `logout_${Date.now()}`
        }).finally(() => {
          wx.removeStorageSync('token');
          wx.removeStorageSync('refreshToken');
          wx.removeStorageSync('userId');
          wx.removeStorageSync('lastProfileId');
          getApp().setCurrentProfileId('');
          wx.reLaunch({ url: '/pages/profile/onboard' });
        });
      }
    });
  }
});
