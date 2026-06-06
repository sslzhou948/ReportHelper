const { api } = require('../../utils/api');
const { showApiErrorFeedback } = require('../../utils/error');
const { validateProfile } = require('../../utils/profile');

const relationOptions = [
  { label: '\u6211\u81ea\u5df1', value: '\u6211\u81ea\u5df1' },
  { label: '\u5988\u5988', value: '\u5988\u5988' },
  { label: '\u7238\u7238', value: '\u7238\u7238' },
  { label: '\u914d\u5076', value: '\u914d\u5076' },
  { label: '\u5b50\u5973', value: '\u5b50\u5973' },
  { label: '\u5176\u4ed6\u4eb2\u5c5e', value: '\u4eb2\u5c5e' }
];
const genderOptions = [
  { label: '\u5973', value: 'F' },
  { label: '\u7537', value: 'M' }
];
const phaseOptions = [
  { label: '\u6cbb\u7597\u4e2d', value: 'treating' },
  { label: '\u5eb7\u590d\u968f\u8bbf', value: 'recovery' }
];
const stageOptions = [
  { label: '\u672a\u586b\u5199', value: '' },
  { label: 'I \u671f', value: 'I \u671f' },
  { label: 'II \u671f', value: 'II \u671f' },
  { label: 'III \u671f', value: 'III \u671f' },
  { label: 'IV \u671f', value: 'IV \u671f' },
  { label: '\u4e0d\u9002\u7528 / \u5f85\u786e\u8ba4', value: '\u4e0d\u9002\u7528 / \u5f85\u786e\u8ba4' }
];

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function optionIndex(options, value) {
  return Math.max(0, options.findIndex((item) => item.value === value));
}

function optionLabel(options, value, placeholder = '\u672a\u586b\u5199') {
  const option = options.find((item) => item.value === value);
  return option ? option.label : placeholder;
}

function defaultProfile(relation) {
  return {
    relation: relation || '',
    realName: '',
    gender: '',
    birthDate: '',
    diseaseType: '',
    diagnosedAt: '',
    stage: '',
    treatmentPhase: '',
    primaryHospital: '',
    primaryDoctor: '',
    primaryDepartment: ''
  };
}

function refreshForm(page, form) {
  page.setData({
    form,
    relationIndex: optionIndex(relationOptions, form.relation),
    relationText: form.relation || '\u8bf7\u9009\u62e9',
    genderIndex: optionIndex(genderOptions, form.gender),
    genderText: optionLabel(genderOptions, form.gender),
    stageIndex: optionIndex(stageOptions, form.stage),
    stageText: optionLabel(stageOptions, form.stage),
    phaseIndex: optionIndex(phaseOptions, form.treatmentPhase),
    phaseText: optionLabel(phaseOptions, form.treatmentPhase)
  });
}

Page({
  data: {
    form: {},
    relationOptions,
    genderOptions,
    stageOptions,
    phaseOptions,
    relationIndex: 0,
    genderIndex: 0,
    stageIndex: 0,
    phaseIndex: 0,
    relationText: '\u8bf7\u9009\u62e9',
    genderText: '\u672a\u586b\u5199',
    stageText: '\u672a\u586b\u5199',
    phaseText: '\u672a\u586b\u5199',
    today: todayString(),
    saving: false
  },

  onLoad(query = {}) {
    refreshForm(this, defaultProfile(query.relation));
  },

  goBack() {
    wx.navigateBack();
  },

  inputField(event) {
    const key = event.currentTarget.dataset.key;
    refreshForm(this, {
      ...this.data.form,
      [key]: event.detail.value
    });
  },

  pickRelation(event) {
    const option = relationOptions[Number(event.detail.value)] || relationOptions[0];
    refreshForm(this, {
      ...this.data.form,
      relation: option.value
    });
  },

  pickGender(event) {
    const option = genderOptions[Number(event.detail.value)] || genderOptions[0];
    refreshForm(this, {
      ...this.data.form,
      gender: option.value
    });
  },

  pickStage(event) {
    const option = stageOptions[Number(event.detail.value)] || stageOptions[0];
    refreshForm(this, {
      ...this.data.form,
      stage: option.value
    });
  },

  pickPhase(event) {
    const option = phaseOptions[Number(event.detail.value)] || phaseOptions[0];
    refreshForm(this, {
      ...this.data.form,
      treatmentPhase: option.value
    });
  },

  pickDate(event) {
    const key = event.currentTarget.dataset.key;
    refreshForm(this, {
      ...this.data.form,
      [key]: event.detail.value
    });
  },

  save() {
    if (this.data.saving) return;
    const form = {
      ...this.data.form,
      realName: String(this.data.form.realName || '').trim(),
      diseaseType: String(this.data.form.diseaseType || '').trim(),
      stage: String(this.data.form.stage || '').trim(),
      primaryHospital: String(this.data.form.primaryHospital || '').trim(),
      primaryDoctor: String(this.data.form.primaryDoctor || '').trim(),
      primaryDepartment: String(this.data.form.primaryDepartment || '').trim()
    };
    const result = validateProfile(form);
    if (!result.ok) {
      wx.showToast({ title: Object.values(result.errors)[0], icon: 'none' });
      return;
    }

    this.setData({ saving: true });
    api.createProfile(form, {
      idempotencyKey: `profile_${Date.now()}`
    }).then((profile) => {
      getApp().setCurrentProfileId(profile.id);
      wx.showToast({ title: '\u5df2\u4fdd\u5b58', icon: 'success' });
      setTimeout(() => wx.switchTab({ url: '/pages/home/index' }), 500);
    }).catch((error) => {
      this.setData({ saving: false });
      showApiErrorFeedback(error, '\u4fdd\u5b58\u6863\u6848\u5931\u8d25');
    });
  }
});
