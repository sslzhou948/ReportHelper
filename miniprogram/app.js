const store = require('./utils/store');
const { getRuntimeApiOptions } = require('./utils/api-config');
const {
  createAuthRequiredError,
  redirectToOnboard,
  shouldRequireLogin
} = require('./utils/session');

App({
  globalData: {
    currentProfileId: null,
    layout: {
      homeBannerPaddingTop: 172,
      homeBannerMinHeight: 312,
      navPaddingTop: 144,
      navMinHeight: 200
    }
  },

  onLaunch() {
    if (shouldRequireLogin()) {
      this.globalData.currentProfileId = null;
      redirectToOnboard();
      this.globalData.layout = this.createLayout();
      return;
    }

    const profileId = wx.getStorageSync('lastProfileId') || store.mock.profiles[0].id;
    this.globalData.currentProfileId = profileId;
    wx.setStorageSync('lastProfileId', profileId);
    this.globalData.layout = this.createLayout();
  },

  createLayout() {
    try {
      const system = wx.getSystemInfoSync();
      const menu = wx.getMenuButtonBoundingClientRect();
      const ratio = 750 / system.windowWidth;
      const capsuleBottom = menu && menu.bottom ? menu.bottom : (system.statusBarHeight || 44) + 32;
      const navPaddingTop = Math.ceil((capsuleBottom + 8) * ratio);
      const homeBannerPaddingTop = Math.ceil((capsuleBottom + 10) * ratio);
      return {
        homeBannerPaddingTop,
        homeBannerMinHeight: homeBannerPaddingTop + 124,
        navPaddingTop,
        navMinHeight: navPaddingTop + 56
      };
    } catch (error) {
      return this.globalData.layout;
    }
  },

  getCurrentProfileId() {
    const mode = getRuntimeApiOptions().mode;
    const backendProfileId = wx.getStorageSync('healthhelperBackendProfileId');
    if (mode === 'backend' && backendProfileId) return backendProfileId;
    return this.globalData.currentProfileId || wx.getStorageSync('lastProfileId') || store.mock.profiles[0].id;
  },

  setCurrentProfileId(profileId) {
    this.globalData.currentProfileId = profileId;
    wx.setStorageSync('lastProfileId', profileId);
    const mode = getRuntimeApiOptions().mode;
    if (mode === 'backend') {
      wx.setStorageSync('healthhelperBackendProfileId', profileId);
    } else if (mode === 'mock') {
      wx.removeStorageSync('healthhelperBackendProfileId');
    }
  },

  ensureCurrentProfileId(api) {
    if (shouldRequireLogin()) {
      redirectToOnboard();
      return Promise.reject(createAuthRequiredError());
    }

    const current = this.getCurrentProfileId();
    return api.getProfiles().then((profiles) => {
      if (!profiles || profiles.length === 0) {
        wx.removeStorageSync('lastProfileId');
        wx.removeStorageSync('healthhelperBackendProfileId');
        redirectToOnboard('state=noProfile');
        const error = new Error('PROFILE_REQUIRED');
        error.code = 'PROFILE_REQUIRED';
        throw error;
      }
      const matched = (profiles || []).find((profile) => profile.id === current);
      const profileId = (matched || profiles[0]).id;
      if (profileId) this.setCurrentProfileId(profileId);
      return profileId;
    });
  },

  getLayout() {
    return this.globalData.layout;
  }
});
