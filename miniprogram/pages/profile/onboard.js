const { api } = require('../../utils/api');
const { requestWxLoginCode } = require('../../utils/auth');
const { showApiErrorToast } = require('../../utils/error');
const { clearAuthSession, hasAuthSession } = require('../../utils/session');

function agreementClass(agreed) {
  return agreed ? 'checked' : '';
}

Page({
  data: {
    state: 'guest',
    agreed: false,
    loggingIn: false,
    checkingSession: false,
    agreementClass: ''
  },

  onLoad(query = {}) {
    if (query.state === 'noProfile' && hasAuthSession()) {
      this.setData({ state: 'noProfile' });
      return;
    }
    this.checkExistingSession();
  },

  checkExistingSession() {
    if (!hasAuthSession()) {
      this.setData({ state: 'guest', checkingSession: false });
      return;
    }

    this.setData({ checkingSession: true });
    api.getProfiles().then((profiles) => {
      this.setData({ checkingSession: false });
      if (profiles && profiles.length) {
        const app = getApp();
        if (app.setCurrentProfileId) app.setCurrentProfileId(profiles[0].id);
        wx.switchTab({ url: '/pages/home/index' });
        return;
      }
      this.setData({ state: 'noProfile' });
    }).catch((error) => {
      if (error && error.code === 'UNAUTHORIZED') {
        clearAuthSession();
        this.setData({ state: 'guest', checkingSession: false });
        return;
      }
      this.setData({ state: 'guest', checkingSession: false });
      showApiErrorToast(error, '获取档案失败，请重试');
    });
  },

  toggleAgree() {
    const agreed = !this.data.agreed;
    this.setData({
      agreed,
      agreementClass: agreementClass(agreed)
    });
  },

  openAgreement() {
    wx.navigateTo({ url: '/pages/profile/agreement' });
  },

  openPrivacy() {
    wx.navigateTo({ url: '/pages/profile/privacy' });
  },

  login() {
    if (this.data.loggingIn) return Promise.resolve(false);
    if (!this.data.agreed) {
      wx.showToast({ title: '请先阅读并同意协议', icon: 'none' });
      return Promise.resolve(false);
    }

    this.setData({ loggingIn: true });
    return requestWxLoginCode().then((code) => api.authWxLogin({ code })).then((session) => {
      wx.setStorageSync('token', session.token);
      wx.setStorageSync('refreshToken', session.refreshToken);
      wx.setStorageSync('userId', session.userId);
      wx.setStorageSync('agreementAccepted', true);
      return api.getProfiles();
    }).then((profiles) => {
      this.setData({ loggingIn: false });
      if (profiles && profiles.length) {
        const app = getApp();
        if (app.setCurrentProfileId) app.setCurrentProfileId(profiles[0].id);
        wx.switchTab({ url: '/pages/home/index' });
        return true;
      }
      this.setData({ state: 'noProfile' });
      return true;
    }).catch((error) => {
      this.setData({ loggingIn: false });
      showApiErrorToast(error, '登录失败，请重试');
      return false;
    });
  },

  createSelfProfile() {
    const relation = encodeURIComponent('\u6211\u81ea\u5df1');
    wx.navigateTo({ url: `/pages/profile/add?relation=${relation}&onboarding=1` });
  },

  createFamilyProfile() {
    const relation = encodeURIComponent('\u5988\u5988');
    wx.navigateTo({ url: `/pages/profile/add?relation=${relation}&onboarding=1` });
  }
});
