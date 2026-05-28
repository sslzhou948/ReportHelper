const { api } = require('../../utils/api');
const { buildProfileFields } = require('../../utils/profile');

Page({
  data: {
    profile: null,
    fields: [],
    loading: false
  },
  onLoad(query) {
    this.profileId = query.profileId || getApp().getCurrentProfileId();
    this.load();
  },
  load() {
    this.setData({ loading: true });
    api.getProfile(this.profileId).then((profile) => {
      this.setData({
        profile,
        fields: buildProfileFields(profile || {}),
        loading: false
      });
    }).catch(() => {
      this.setData({ loading: false });
      wx.showToast({ title: '\u52a0\u8f7d\u6863\u6848\u5931\u8d25', icon: 'none' });
    });
  },
  goBack() {
    wx.navigateBack();
  },
  save() {
    wx.showToast({ title: '\u5df2\u4fdd\u5b58', icon: 'success' });
  },
  editField() {
    wx.showToast({ title: '\u6253\u5f00\u5b57\u6bb5\u7f16\u8f91', icon: 'none' });
  }
});
