const { getRuntimeApiOptions } = require('./api-config');

const SESSION_KEYS = [
  'token',
  'refreshToken',
  'userId'
];

const PROFILE_KEYS = [
  'lastProfileId',
  'healthhelperBackendProfileId'
];

function readStorage(key, storage) {
  if (storage && typeof storage.get === 'function') return storage.get(key);
  if (typeof wx === 'undefined' || !wx.getStorageSync) return '';
  return wx.getStorageSync(key);
}

function removeStorage(key, storage) {
  if (storage && typeof storage.remove === 'function') {
    storage.remove(key);
    return;
  }
  if (typeof wx !== 'undefined' && wx.removeStorageSync) wx.removeStorageSync(key);
}

function hasAuthSession(storage) {
  return !!(readStorage('token', storage) || readStorage('refreshToken', storage));
}

function isBackendApiMode(options) {
  const runtimeOptions = options || getRuntimeApiOptions();
  return runtimeOptions.mode === 'backend';
}

function shouldRequireLogin(options, storage) {
  return isBackendApiMode(options) && !hasAuthSession(storage);
}

function clearAuthSession(storage) {
  SESSION_KEYS.concat(PROFILE_KEYS).forEach((key) => removeStorage(key, storage));
}

function createAuthRequiredError() {
  const error = new Error('AUTH_REQUIRED');
  error.code = 'AUTH_REQUIRED';
  return error;
}

function redirectToOnboard(query = '') {
  if (typeof wx === 'undefined' || !wx.reLaunch) return;
  const suffix = query ? `?${query}` : '';
  wx.reLaunch({ url: `/pages/profile/onboard${suffix}` });
}

module.exports = {
  clearAuthSession,
  createAuthRequiredError,
  hasAuthSession,
  isBackendApiMode,
  redirectToOnboard,
  shouldRequireLogin
};
