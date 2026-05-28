const DEFAULT_BACKEND_BASE_URL = 'http://127.0.0.1:8787';

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

function getRuntimeApiOptions(overrides = {}) {
  const mode = overrides.mode || getStoredValue('healthhelperApiMode') || 'mock';
  const baseUrl = overrides.baseUrl || getStoredValue('healthhelperBackendBaseUrl') || DEFAULT_BACKEND_BASE_URL;
  return {
    ...overrides,
    mode,
    baseUrl
  };
}

module.exports = {
  DEFAULT_BACKEND_BASE_URL,
  getRuntimeApiOptions
};
