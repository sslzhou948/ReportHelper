const { api } = require('../../utils/api');
const { formatMonthDay, daysBetween } = require('../../utils/date');

Page({
  data: {
    profile: null,
    profiles: [],
    reports: [],
    pinnedMetrics: [],
    alertMetrics: [],
    nextPlan: null,
    daysToNext: 0,
    layout: {},
    switcherVisible: false,
    recognizing: false,
    loading: false
  },

  onShow() {
    this.load();
  },

  load() {
    const app = getApp();
    this.setData({ loading: true, layout: app.getLayout() });

    app.ensureCurrentProfileId(api).then((profileId) => Promise.all([
      api.getProfile(profileId),
      api.getProfiles(),
      api.listReports(profileId),
      api.listMetricSnapshots(profileId),
      api.listRecheckPlans(profileId)
    ])).then(([profile, profiles, reports, snapshots, recheck]) => {
      const nextPlan = recheck.nextPlan || null;
      this.setData({
        profile,
        profiles,
        reports: reports.slice(0, 3).map((report) => ({
          ...report,
          displayDate: formatMonthDay(report.reportDate)
        })),
        pinnedMetrics: snapshots.filter((item) => item.isPinned).slice(0, 8),
        alertMetrics: snapshots.filter((item) => item.lastTone !== 'ok').slice(0, 3),
        nextPlan,
        daysToNext: nextPlan ? Math.max(0, daysBetween(new Date(), nextPlan.date)) : 0,
        loading: false
      });
    }).catch(() => {
      this.setData({ loading: false });
      wx.showToast({ title: '\u52a0\u8f7d\u9996\u9875\u6570\u636e\u5931\u8d25', icon: 'none' });
    });
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

  editProfile(event) {
    wx.navigateTo({ url: `/pages/profile/archive?profileId=${event.detail.profileId}` });
  },

  goUpload() {
    wx.navigateTo({ url: '/pages/upload/pick' });
  },

  goRecheck() {
    wx.switchTab({ url: '/pages/recheck/index' });
  },

  goMetric(event) {
    wx.navigateTo({ url: `/pages/health/metric-detail?metricKey=${event.currentTarget.dataset.key}` });
  },

  goPinnedManage() {
    wx.navigateTo({ url: '/pages/health/pinned-manage' });
  },

  goReport(event) {
    wx.navigateTo({ url: `/pages/health/report-detail?id=${event.currentTarget.dataset.id}` });
  },

  goHealthTime() {
    wx.setStorageSync('healthDefaultView', 'time');
    wx.switchTab({ url: '/pages/health/index' });
  },

  showRecognizing() {
    this.setData({ recognizing: !this.data.recognizing });
  },

  goOcrTask() {
    const pending = wx.getStorageSync('pendingOcrTasks') || [];
    const currentProfileId = getApp().getCurrentProfileId();
    const task = pending.find((item) => item.profileId === currentProfileId) || pending[0];
    if (!task) {
      wx.navigateTo({ url: '/pages/upload/pick' });
      return;
    }
    wx.navigateTo({ url: `/pages/upload/confirm?taskId=${task.taskId}` });
  }
});
