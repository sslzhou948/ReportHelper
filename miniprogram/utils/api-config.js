const DEFAULT_BACKEND_BASE_URL = 'http://127.0.0.1:8787';
const DEFAULT_LOCAL_API_MODE = 'mock';
const PRODUCTION_API_MODE = 'backend';
const DEPLOYED_BACKEND_BASE_URL = 'https://api.your-domain.com';

function canUseWxStorage() {
  return typeof wx !== 'undefined' && wx.getStorageSync;
}

function getStoredValue(key) {
  if (!canUseWxStorage()) return '';
  try {
    return wx.getStorageSync(key) || '';
  } catch (error) {
    return '';
  }
}

function getMiniProgramEnvVersion() {
  if (typeof wx === 'undefined' || !wx.getAccountInfoSync) return '';
  try {
    const account = wx.getAccountInfoSync();
    return account && account.miniProgram && account.miniProgram.envVersion
      ? account.miniProgram.envVersion
      : '';
  } catch (error) {
    return '';
  }
}

function getRuntimeApiOptions(overrides = {}) {
  const envVersion = getMiniProgramEnvVersion();
  const requestedMode = overrides.mode || getStoredValue('healthhelperApiMode');
  const deployed = envVersion === 'trial' || envVersion === 'release';
  const mode = deployed
    ? PRODUCTION_API_MODE
    : (requestedMode || DEFAULT_LOCAL_API_MODE);
  const baseUrl = overrides.baseUrl
    || getStoredValue('healthhelperBackendBaseUrl')
    || (deployed ? DEPLOYED_BACKEND_BASE_URL : DEFAULT_BACKEND_BASE_URL);
  return {
    ...overrides,
    mode,
    baseUrl
  };
}

module.exports = {
  DEFAULT_BACKEND_BASE_URL,
  DEFAULT_LOCAL_API_MODE,
  DEPLOYED_BACKEND_BASE_URL,
  PRODUCTION_API_MODE,
  getRuntimeApiOptions
};
