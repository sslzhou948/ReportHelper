const store = require('./utils/store');
const { getRuntimeApiOptions } = require('./utils/api-config');

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
    return wx.getStorageSync('healthhelperBackendProfileId') || this.globalData.currentProfileId || wx.getStorageSync('lastProfileId') || store.mock.profiles[0].id;
  },

  setCurrentProfileId(profileId) {
    this.globalData.currentProfileId = profileId;
    wx.setStorageSync('lastProfileId', profileId);
    if (getRuntimeApiOptions().mode === 'backend' || wx.getStorageSync('healthhelperBackendProfileId')) {
      wx.setStorageSync('healthhelperBackendProfileId', profileId);
    }
  },

  ensureCurrentProfileId(api) {
    const mode = getRuntimeApiOptions().mode;
    if (mode !== 'backend') return Promise.resolve(this.getCurrentProfileId());
    const current = this.getCurrentProfileId();
    return api.getProfiles().then((profiles) => {
      const matched = (profiles || []).find((profile) => profile.id === current);
      const profileId = (matched || profiles[0] || {}).id || current;
      if (profileId) this.setCurrentProfileId(profileId);
      return profileId;
    });
  },

  getLayout() {
    return this.globalData.layout;
  }
});
