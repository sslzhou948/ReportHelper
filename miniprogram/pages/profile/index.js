const { api } = require('../../utils/api');
const { showApiErrorToast } = require('../../utils/error');
const {
  beginSlowLoading,
  cancelSlowLoading: cancelPageLoading,
  finishSlowLoading
} = require('../../utils/loading');
const { bindNetworkStatus, refreshNetworkStatus } = require('../../utils/network');
const { isProfileRequiredError } = require('../../utils/profile');
const { DEFAULT_BACKEND_BASE_URL } = require('../../utils/api-config');

const DEFAULT_LAYOUT = {
  homeBannerPaddingTop: 172,
  homeBannerMinHeight: 312
};
const ROUTE_MAP = {
  '\u6570\u636e\u5bfc\u51fa': '/pages/profile/export',
  '\u62a5\u544a\u5f52\u6863\u7ba1\u7406': '/pages/profile/reports-archive',
  '\u7ef4\u62a4\u624b\u52a8\u5f55\u5165\u6a21\u677f': '/pages/profile/custom-metrics?mode=manage',
  '\u4f7f\u7528\u6307\u5357': '/pages/profile/guide',
  '\u6307\u6807\u8bf4\u660e': '/pages/profile/metric-help',
  '\u610f\u89c1\u53cd\u9988': '/pages/profile/feedback',
  '\u5173\u4e8e\u6211\u4eec v1.0.0': '/pages/profile/about'
};
const REAL_UPLOAD_BACKEND_BASE_URL = 'http://127.0.0.1:18788';

Page({
  data: {
    profile: null,
    profiles: [],
    reportsCount: 0,
    metricsCount: 0,
    recheckCount: 0,
    switcherVisible: false,
    devRuntimeVisible: false,
    devApiMode: 'mock',
    devBackendBaseUrl: DEFAULT_BACKEND_BASE_URL,
    devBackendProfileId: '',
    devBackendStatus: '未检测',
    layout: DEFAULT_LAYOUT,
    networkOffline: false,
    loading: false,
    loadingSlow: false
  },
  onShow() {
    bindNetworkStatus(this);
    this.setData({ layout: getApp().getLayout ? getApp().getLayout() : DEFAULT_LAYOUT });
    this.refreshDevRuntime();
    this.load();
  },
  getEnvVersion() {
    if (!wx.getAccountInfoSync) return '';
    try {
      const account = wx.getAccountInfoSync();
      return account && account.miniProgram ? account.miniProgram.envVersion || '' : '';
    } catch (error) {
      return '';
    }
  },
  refreshDevRuntime() {
    const envVersion = this.getEnvVersion();
    const mode = wx.getStorageSync('healthhelperApiMode') || 'mock';
    const baseUrl = wx.getStorageSync('healthhelperBackendBaseUrl') || DEFAULT_BACKEND_BASE_URL;
    this.setData({
      devRuntimeVisible: envVersion === 'develop',
      devApiMode: mode,
      devBackendBaseUrl: baseUrl,
      devBackendProfileId: wx.getStorageSync('healthhelperBackendProfileId') || ''
    });
  },
  load() {
    const app = getApp();
    const loadingToken = beginSlowLoading(this);
    app.ensureCurrentProfileId(api).then((profileId) => Promise.all([
      api.getProfile(profileId),
      api.getProfiles(),
      api.listReports(profileId),
      api.listMetricSnapshots(profileId),
      api.listRecheckPlans(profileId)
    ])).then(([profile, profiles, reports, metrics, recheck]) => {
      if (!finishSlowLoading(this, loadingToken)) return;
      this.setData({
        profile,
        profiles,
        reportsCount: reports.length,
        metricsCount: metrics.length,
        recheckCount: (recheck.nextPlan ? 1 : 0) + (recheck.otherPlans || []).length
      });
    }).catch((error) => {
      if (!finishSlowLoading(this, loadingToken)) return;
      if (isProfileRequiredError(error)) return;
      showApiErrorToast(error, '\u52a0\u8f7d\u6211\u7684\u9875\u9762\u5931\u8d25');
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
    if (title === '\u6e05\u7a7a\u5f53\u524d\u6863\u6848\u6570\u636e') {
      wx.showModal({
        title: '\u6682\u4e0d\u652f\u6301\u6e05\u7a7a',
        content: '\u8fd9\u662f\u9ad8\u98ce\u9669\u64cd\u4f5c\uff0c\u9700\u8981\u5b8c\u6574\u7684\u5907\u4efd\u3001\u5ba1\u8ba1\u548c\u6062\u590d\u673a\u5236\u540e\u624d\u4f1a\u5f00\u653e\u3002',
        showCancel: false,
        confirmText: '\u77e5\u9053\u4e86'
      });
      return;
    }
    if (ROUTE_MAP[title]) {
      wx.navigateTo({ url: ROUTE_MAP[title] });
      return;
    }
    wx.showToast({ title, icon: 'none' });
  },
  setDevApiMode(event) {
    const mode = event.currentTarget.dataset.mode || 'mock';
    wx.setStorageSync('healthhelperApiMode', mode);
    if (mode === 'mock') {
      wx.removeStorageSync('healthhelperBackendProfileId');
      this.setData({ devBackendStatus: '已切换到 mock' });
      this.refreshDevRuntime();
      this.load();
      return;
    }
    const currentBaseUrl = wx.getStorageSync('healthhelperBackendBaseUrl');
    if (mode === 'hybrid-upload' && (!currentBaseUrl || currentBaseUrl === DEFAULT_BACKEND_BASE_URL)) {
      wx.setStorageSync('healthhelperBackendBaseUrl', REAL_UPLOAD_BACKEND_BASE_URL);
    } else if (!currentBaseUrl) {
      wx.setStorageSync('healthhelperBackendBaseUrl', DEFAULT_BACKEND_BASE_URL);
    }
    this.refreshDevRuntime();
    this.connectDevBackend();
  },
  chooseDevBackendBaseUrl() {
    const urls = [
      DEFAULT_BACKEND_BASE_URL,
      REAL_UPLOAD_BACKEND_BASE_URL
    ];
    wx.showActionSheet({
      itemList: ['本地后端 8787', '自动化后端 18788'],
      success: (res) => {
        const value = urls[res.tapIndex] || DEFAULT_BACKEND_BASE_URL;
        wx.setStorageSync('healthhelperBackendBaseUrl', value);
        this.refreshDevRuntime();
        this.connectDevBackend();
      }
    });
  },
  connectDevBackend() {
    const baseUrl = wx.getStorageSync('healthhelperBackendBaseUrl') || DEFAULT_BACKEND_BASE_URL;
    this.setData({ devBackendStatus: '检测中...' });
    wx.request({
      url: `${baseUrl}/api/profiles`,
      method: 'GET',
      success: (res) => {
        const profile = res.data && res.data.data && res.data.data[0];
        if (res.statusCode >= 200 && res.statusCode < 300 && profile && profile.id) {
          wx.setStorageSync('healthhelperBackendProfileId', profile.id);
          this.setData({
            devBackendProfileId: profile.id,
            devBackendStatus: '已连接'
          });
          this.load();
          return;
        }
        this.setData({ devBackendStatus: `连接失败 ${res.statusCode}` });
      },
      fail: () => {
        this.setData({ devBackendStatus: '连接失败，请确认后端已启动' });
      }
    });
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
  },
  retryAfterNetwork() {
    refreshNetworkStatus(this).then(() => this.load());
  },
  retrySlowLoading() {
    this.load();
  },
  cancelSlowLoading() {
    cancelPageLoading(this);
  }
});
