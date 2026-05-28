const { api } = require('../../utils/api');
const { buildProfileFields, validateProfile } = require('../../utils/profile');

function refreshFields(page, form) {
  page.setData({
    form,
    fields: buildProfileFields(form)
  });
}

function defaultProfile(relation) {
  const isSelf = relation === '\u6211\u81ea\u5df1';
  return {
    relation: relation || '\u5988\u5988',
    realName: isSelf ? '\u674e\u5efa\u56fd' : '\u738b\u82ac',
    gender: isSelf ? 'M' : 'F',
    birthDate: isSelf ? '1978-08-16' : '1958-03-12',
    diseaseType: isSelf ? '\u9ad8\u8840\u538b' : '\u4e73\u817a\u764c',
    diagnosedAt: isSelf ? '' : '2024-04-10',
    stage: isSelf ? '' : 'IIA \u671f',
    treatmentPhase: isSelf ? 'treating' : 'recovery',
    primaryHospital: isSelf ? '\u793e\u533a\u533b\u9662' : '\u534f\u548c\u533b\u9662',
    primaryDoctor: '',
    primaryDepartment: isSelf ? '\u5fc3\u5185\u79d1' : '\u80bf\u7624\u79d1'
  };
}

Page({
  data: {
    form: {},
    fields: [],
    saving: false
  },

  onLoad(query = {}) {
    const form = defaultProfile(query.relation);
    refreshFields(this, form);
  },

  goBack() {
    wx.navigateBack();
  },

  save() {
    if (this.data.saving) return;
    const result = validateProfile(this.data.form);
    if (!result.ok) {
      wx.showToast({ title: Object.values(result.errors)[0], icon: 'none' });
      return;
    }

    this.setData({ saving: true });
    api.createProfile(this.data.form, {
      idempotencyKey: `profile_${Date.now()}`
    }).then((profile) => {
      getApp().setCurrentProfileId(profile.id);
      wx.showToast({ title: '\u5df2\u4fdd\u5b58', icon: 'success' });
      setTimeout(() => wx.switchTab({ url: '/pages/home/index' }), 500);
    }).catch(() => {
      this.setData({ saving: false });
      wx.showToast({ title: '\u4fdd\u5b58\u6863\u6848\u5931\u8d25', icon: 'none' });
    });
  },

  editField(event) {
    const key = event.currentTarget.dataset.key;
    const label = event.currentTarget.dataset.label || '\u5b57\u6bb5';
    if (key === 'gender') {
      wx.showActionSheet({
        itemList: ['\u5973', '\u7537'],
        success: (res) => {
          const form = {
            ...this.data.form,
            gender: res.tapIndex === 0 ? 'F' : 'M'
          };
          refreshFields(this, form);
        }
      });
      return;
    }
    if (key === 'treatmentPhase') {
      wx.showActionSheet({
        itemList: ['\u5eb7\u590d\u968f\u8bbf', '\u6cbb\u7597\u4e2d'],
        success: (res) => {
          const form = {
            ...this.data.form,
            treatmentPhase: res.tapIndex === 0 ? 'recovery' : 'treating'
          };
          refreshFields(this, form);
        }
      });
      return;
    }
    wx.showModal({
      title: `\u7f16\u8f91${label}`,
      editable: true,
      placeholderText: '\u8bf7\u8f93\u5165',
      content: String(this.data.form[key] || ''),
      confirmText: '\u4fdd\u5b58',
      success: (res) => {
        if (!res.confirm) return;
        const form = {
          ...this.data.form,
          [key]: String(res.content || '').trim()
        };
        refreshFields(this, form);
      }
    });
  }
});
