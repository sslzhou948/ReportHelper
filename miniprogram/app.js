const store = require('./utils/store');

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
    return this.globalData.currentProfileId || wx.getStorageSync('lastProfileId') || store.mock.profiles[0].id;
  },

  setCurrentProfileId(profileId) {
    this.globalData.currentProfileId = profileId;
    wx.setStorageSync('lastProfileId', profileId);
  },

  getLayout() {
    return this.globalData.layout;
  }
});
