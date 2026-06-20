const DEFAULT_BACKEND_BASE_URL = 'http://127.0.0.1:8787';
const DEFAULT_LOCAL_API_MODE = 'mock';
const PRODUCTION_API_MODE = 'backend';
const TRIAL_BACKEND_BASE_URL = 'https://health.ads8260.win:8260';
const PRODUCTION_BACKEND_BASE_URL = 'https://health.ads8260.win:8260';
const DEPLOYED_BACKEND_BASE_URL = PRODUCTION_BACKEND_BASE_URL;

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

function getDeployedBackendBaseUrl(envVersion) {
  if (envVersion === 'trial') return TRIAL_BACKEND_BASE_URL;
  if (envVersion === 'release') return PRODUCTION_BACKEND_BASE_URL;
  return '';
}

function getRuntimeApiOptions(overrides = {}) {
  const envVersion = getMiniProgramEnvVersion();
  const deployedBaseUrl = getDeployedBackendBaseUrl(envVersion);
  const deployed = !!deployedBaseUrl;
  const requestedMode = deployed ? '' : (overrides.mode || getStoredValue('healthhelperApiMode'));
  const mode = deployed
    ? PRODUCTION_API_MODE
    : (requestedMode || DEFAULT_LOCAL_API_MODE);
  const baseUrl = deployed
    ? deployedBaseUrl
    : (overrides.baseUrl || getStoredValue('healthhelperBackendBaseUrl') || DEFAULT_BACKEND_BASE_URL);
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
  PRODUCTION_BACKEND_BASE_URL,
  TRIAL_BACKEND_BASE_URL,
  getRuntimeApiOptions
};
