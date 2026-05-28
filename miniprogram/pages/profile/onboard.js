const { api } = require('../../utils/api');
const { requestWxLoginCode } = require('../../utils/auth');
const { showApiErrorToast } = require('../../utils/error');

Page({
  data: {
    agreed: false,
    loggingIn: false
  },

  toggleAgree() {
    this.setData({ agreed: !this.data.agreed });
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

  goAdd(event) {
    this.login().then((ok) => {
      if (!ok) return;
      wx.navigateTo({ url: `/pages/profile/add?relation=${event.currentTarget.dataset.relation || ''}` });
    });
  }
});
