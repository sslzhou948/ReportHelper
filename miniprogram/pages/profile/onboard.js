const { api } = require('../../utils/api');
const { requestWxLoginCode } = require('../../utils/auth');
const { showApiErrorToast } = require('../../utils/error');

function selectionState(relation, agreed) {
  return {
    selectedRelation: relation,
    selfSelectedClass: relation === '\u6211\u81ea\u5df1' ? 'selected' : '',
    familySelectedClass: relation === '\u5988\u5988' ? 'selected' : '',
    continueDisabledClass: agreed ? '' : 'disabled'
  };
}

Page({
  data: {
    agreed: false,
    loggingIn: false,
    selectedRelation: '',
    selfSelectedClass: '',
    familySelectedClass: '',
    continueDisabledClass: 'disabled'
  },

  toggleAgree() {
    const agreed = !this.data.agreed;
    this.setData({
      agreed,
      ...selectionState(this.data.selectedRelation, agreed)
    });
  },

  selectRelation(event) {
    this.setData(selectionState(event.currentTarget.dataset.relation || '', this.data.agreed));
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
      wx.showToast({ title: '\u8bf7\u5148\u9605\u8bfb\u5e76\u540c\u610f\u534f\u8bae', icon: 'none' });
      return Promise.resolve(false);
    }

    this.setData({ loggingIn: true });
    return requestWxLoginCode().then((code) => api.authWxLogin({ code })).then((session) => {
      wx.setStorageSync('token', session.token);
      wx.setStorageSync('refreshToken', session.refreshToken);
      wx.setStorageSync('userId', session.userId);
      wx.setStorageSync('agreementAccepted', true);
      this.setData({ loggingIn: false });
      return true;
    }).catch((error) => {
      this.setData({ loggingIn: false });
      showApiErrorToast(error, '\u767b\u5f55\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5');
      return false;
    });
  },

  continueCreate() {
    this.login().then((ok) => {
      if (!ok) return;
      return api.getProfiles().then((profiles) => {
        if (profiles && profiles.length) {
          const app = getApp();
          const current = app.getCurrentProfileId && app.getCurrentProfileId();
          const matched = profiles.find((profile) => profile.id === current) || profiles[0];
          if (matched && app.setCurrentProfileId) app.setCurrentProfileId(matched.id);
          wx.switchTab({ url: '/pages/home/index' });
          return;
        }
        if (!this.data.selectedRelation) {
          wx.showToast({ title: '\u8bf7\u5148\u9009\u62e9\u4e3a\u8c01\u521b\u5efa\u6863\u6848', icon: 'none' });
          return;
        }
        wx.navigateTo({ url: `/pages/profile/add?relation=${this.data.selectedRelation}` });
      }).catch((error) => {
        showApiErrorToast(error, '\u83b7\u53d6\u6863\u6848\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5');
      });
    });
  }
});
