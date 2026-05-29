const { api } = require('../../utils/api');
const { showApiErrorToast } = require('../../utils/error');
const {
  beginSlowLoading,
  cancelSlowLoading: cancelPageLoading,
  finishSlowLoading
} = require('../../utils/loading');
const { bindNetworkStatus, refreshNetworkStatus } = require('../../utils/network');
const { isProfileRequiredError } = require('../../utils/profile');

Page({
  data: {
    profile: {},
    networkOffline: false,
    loading: false,
    loadingSlow: false
  },

  onShow() {
    bindNetworkStatus(this);
    this.load();
  },

  load() {
    const loadingToken = beginSlowLoading(this);
    getApp().ensureCurrentProfileId(api).then((profileId) => api.getProfile(profileId)).then((profile) => {
      if (!finishSlowLoading(this, loadingToken)) return;
      this.setData({ profile: profile || {} });
    }).catch((error) => {
      if (!finishSlowLoading(this, loadingToken)) return;
      if (isProfileRequiredError(error)) return;
      showApiErrorToast(error, '\u52a0\u8f7d\u6863\u6848\u5931\u8d25');
    });
  },

  goBack() {
    wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/home/index' }) });
  },

  goUpload() {
    wx.navigateTo({ url: '/pages/upload/pick' });
  },

  goManual() {
    wx.navigateTo({
      url: '/pages/profile/custom-metrics?mode=select',
      fail: (error) => wx.setStorageSync('lastManualRouteError', error && error.errMsg ? error.errMsg : 'navigateTo failed')
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
