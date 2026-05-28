const { api } = require('../../utils/api');
const { buildProfileFields } = require('../../utils/profile');

function refreshFields(page, profile) {
  page.setData({
    profile,
    fields: buildProfileFields(profile || {})
  });
}

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
      refreshFields(this, profile);
      this.setData({ loading: false });
    }).catch(() => {
      this.setData({ loading: false });
      wx.showToast({ title: '\u52a0\u8f7d\u6863\u6848\u5931\u8d25', icon: 'none' });
    });
  },
  goBack() {
    wx.navigateBack();
  },
  save() {
    if (!this.data.profile) return;
    api.updateProfile(this.profileId, this.data.profile, {
      idempotencyKey: `profile_archive_${this.profileId}_${Date.now()}`
    }).then((profile) => {
      refreshFields(this, profile || this.data.profile);
      wx.showToast({ title: '\u5df2\u4fdd\u5b58', icon: 'success' });
    }).catch(() => {
      wx.showToast({ title: '\u4fdd\u5b58\u6863\u6848\u5931\u8d25', icon: 'none' });
    });
  },
  editField(event) {
    const key = event.currentTarget.dataset.key;
    const label = event.currentTarget.dataset.label || '\u5b57\u6bb5';
    if (!key) {
      wx.showToast({ title: '\u7528\u836f\u7f16\u8f91\u540e\u7eed\u63a5\u5165', icon: 'none' });
      return;
    }
    if (key === 'gender') {
      wx.showActionSheet({
        itemList: ['\u5973', '\u7537'],
        success: (res) => {
          refreshFields(this, {
            ...this.data.profile,
            gender: res.tapIndex === 0 ? 'F' : 'M'
          });
        }
      });
      return;
    }
    if (key === 'treatmentPhase') {
      wx.showActionSheet({
        itemList: ['\u5eb7\u590d\u968f\u8bbf', '\u6cbb\u7597\u4e2d'],
        success: (res) => {
          refreshFields(this, {
            ...this.data.profile,
            treatmentPhase: res.tapIndex === 0 ? 'recovery' : 'treating'
          });
        }
      });
      return;
    }
    wx.showModal({
      title: `\u7f16\u8f91${label}`,
      editable: true,
      placeholderText: '\u8bf7\u8f93\u5165',
      content: String((this.data.profile && this.data.profile[key]) || ''),
      confirmText: '\u4fdd\u5b58',
      success: (res) => {
        if (!res.confirm) return;
        refreshFields(this, {
          ...this.data.profile,
          [key]: String(res.content || '').trim()
        });
      }
    });
  }
});
