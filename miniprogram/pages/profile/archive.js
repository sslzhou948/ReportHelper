const { api } = require('../../utils/api');
const { showApiErrorFeedback } = require('../../utils/error');

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

function normalizeProfile(profile) {
  return {
    realName: '',
    gender: '',
    birthDate: '',
    diseaseType: '',
    diagnosedAt: '',
    stage: '',
    treatmentPhase: '',
    primaryHospital: '',
    primaryDoctor: '',
    primaryDepartment: '',
    ...(profile || {})
  };
}

function refreshForm(page, profile) {
  const form = normalizeProfile(profile);
  const medications = Array.isArray(form.medications) ? form.medications : [];
  page.setData({
    profile: form,
    form,
    medications,
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
    profile: null,
    form: {},
    medications: [],
    genderOptions,
    stageOptions,
    phaseOptions,
    genderIndex: 0,
    stageIndex: 0,
    phaseIndex: 0,
    genderText: '\u672a\u586b\u5199',
    stageText: '\u672a\u586b\u5199',
    phaseText: '\u672a\u586b\u5199',
    today: todayString(),
    loading: false,
    saving: false
  },
  onLoad(query) {
    this.profileId = query.profileId || getApp().getCurrentProfileId();
    this.load();
  },
  load() {
    this.setData({ loading: true });
    api.getProfile(this.profileId).then((profile) => {
      refreshForm(this, profile);
      this.setData({ loading: false });
    }).catch(() => {
      this.setData({ loading: false });
      wx.showToast({ title: '\u52a0\u8f7d\u6863\u6848\u5931\u8d25', icon: 'none' });
    });
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
  pickGender(event) {
    const option = genderOptions[Number(event.detail.value)] || genderOptions[0];
    refreshForm(this, {
      ...this.data.form,
      gender: option.value
    });
  },
  pickDate(event) {
    const key = event.currentTarget.dataset.key;
    refreshForm(this, {
      ...this.data.form,
      [key]: event.detail.value
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
  save() {
    if (!this.data.form || this.data.saving) return;
    const form = {
      ...this.data.form,
      realName: String(this.data.form.realName || '').trim(),
      diseaseType: String(this.data.form.diseaseType || '').trim(),
      stage: String(this.data.form.stage || '').trim(),
      primaryHospital: String(this.data.form.primaryHospital || '').trim(),
      primaryDoctor: String(this.data.form.primaryDoctor || '').trim(),
      primaryDepartment: String(this.data.form.primaryDepartment || '').trim()
    };
    this.setData({ saving: true });
    api.updateProfile(this.profileId, form, {
      idempotencyKey: `profile_archive_${this.profileId}_${Date.now()}`
    }).then((profile) => {
      refreshForm(this, profile || form);
      this.setData({ saving: false });
      wx.showToast({ title: '\u5df2\u4fdd\u5b58', icon: 'success' });
    }).catch((error) => {
      this.setData({ saving: false });
      showApiErrorFeedback(error, '\u4fdd\u5b58\u6863\u6848\u5931\u8d25');
    });
  }
});
