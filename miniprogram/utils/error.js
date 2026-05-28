const FRIENDLY_ERROR_MESSAGES = {
  REQUEST_TIMEOUT: '请求超时，请稍后重试',
  NETWORK_ERROR: '网络连接失败，请重试',
  UNAUTHORIZED: '登录已失效，请重新登录',
  FORBIDDEN: '权限不足，无法访问',
  NOT_FOUND: '内容不存在或已删除',
  RATE_LIMITED: '操作太频繁，请稍后重试',
  INTERNAL_ERROR: '服务暂时不可用，请稍后重试',
  WX_LOGIN_FAILED: '微信登录失败，请重试',
  WX_LOGIN_NO_CODE: '微信登录失败，请重试'
};

function getShortRequestId(requestId) {
  if (!requestId) return '';
  const text = String(requestId);
  return text.length > 8 ? text.slice(-8) : text;
}

function getApiErrorMessage(error, fallback = '操作失败，请重试') {
  if (!error) return fallback;
  if (FRIENDLY_ERROR_MESSAGES[error.code]) return FRIENDLY_ERROR_MESSAGES[error.code];
  if (error.statusCode >= 500) return FRIENDLY_ERROR_MESSAGES.INTERNAL_ERROR;
  return error.message || fallback;
}

function getApiErrorToastTitle(error, fallback) {
  const message = getApiErrorMessage(error, fallback);
  const requestId = getShortRequestId(error && error.requestId);
  return requestId ? `${message} ${requestId}` : message;
}

function showApiErrorToast(error, fallback) {
  wx.showToast({
    title: getApiErrorToastTitle(error, fallback),
    icon: 'none'
  });
}

module.exports = {
  getApiErrorMessage,
  getApiErrorToastTitle,
  showApiErrorToast
};
