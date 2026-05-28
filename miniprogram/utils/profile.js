const EMPTY = '\u672a\u586b\u5199';

function genderText(gender) {
  if (gender === 'F') return '\u5973';
  if (gender === 'M') return '\u7537';
  return EMPTY;
}

function treatmentText(phase) {
  if (phase === 'recovery') return '\u5eb7\u590d\u968f\u8bbf';
  if (phase === 'treating') return '\u6cbb\u7597\u4e2d';
  return EMPTY;
}

function avatarText(name, relation) {
  return String(name || relation || '?').slice(0, 1);
}

function formatProfileSummary(profile) {
  return profile.summary || [profile.diseaseType, treatmentText(profile.treatmentPhase)]
    .filter((item) => item && item !== EMPTY)
    .join(' \u00b7 ');
}

function buildProfileFields(profile) {
  return [
    { key: 'realName', label: '\u59d3\u540d', value: profile.realName || EMPTY },
    { key: 'gender', label: '\u6027\u522b', value: genderText(profile.gender) },
    { key: 'birthDate', label: '\u51fa\u751f\u65e5\u671f', value: profile.birthDate || EMPTY },
    { key: 'diseaseType', label: '\u75c5\u79cd', value: profile.diseaseType || EMPTY },
    { key: 'diagnosedAt', label: '\u786e\u8bca\u65e5\u671f', value: profile.diagnosedAt || EMPTY },
    { key: 'stage', label: '\u5206\u671f', value: profile.stage || EMPTY },
    { key: 'treatmentPhase', label: '\u6cbb\u7597\u9636\u6bb5', value: treatmentText(profile.treatmentPhase) },
    { key: 'primaryHospital', label: '\u4e3b\u6cbb\u533b\u9662', value: profile.primaryHospital || EMPTY },
    { key: 'primaryDoctor', label: '\u4e3b\u6cbb\u533b\u751f', value: profile.primaryDoctor || EMPTY },
    { key: 'primaryDepartment', label: '\u79d1\u5ba4', value: profile.primaryDepartment || EMPTY }
  ];
}

function validateProfile(profile) {
  const errors = {};
  if (!profile.relation) errors.relation = '\u8bf7\u9009\u62e9\u5173\u7cfb';
  if (!profile.realName) errors.realName = '\u8bf7\u586b\u5199\u59d3\u540d';
  return {
    ok: Object.keys(errors).length === 0,
    errors
  };
}

function isProfileRequiredError(error) {
  return !!error && error.code === 'PROFILE_REQUIRED';
}

module.exports = {
  avatarText,
  buildProfileFields,
  formatProfileSummary,
  genderText,
  isProfileRequiredError,
  treatmentText,
  validateProfile
};
