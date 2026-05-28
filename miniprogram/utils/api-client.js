class ApiError extends Error {
  constructor({ code, message, statusCode, details, requestId }) {
    super(message || code || 'API request failed');
    this.name = 'ApiError';
    this.code = code || 'UNKNOWN_ERROR';
    this.statusCode = statusCode || 0;
    this.details = details || {};
    this.requestId = requestId || '';
  }
}

function createRequestId() {
  return `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function createMemoryStorage(initial = {}) {
  const state = { ...initial };
  return {
    get(key) {
      return state[key];
    },
    set(key, value) {
      state[key] = value;
    },
    remove(key) {
      delete state[key];
    }
  };
}

function createWxStorage() {
  return {
    get(key) {
      return wx.getStorageSync(key);
    },
    set(key, value) {
      wx.setStorageSync(key, value);
    },
    remove(key) {
      wx.removeStorageSync(key);
    }
  };
}

function normalizeErrorPayload(payload, statusCode) {
  const error = payload && payload.error ? payload.error : {};
  return {
    code: error.code || (statusCode === 401 ? 'UNAUTHORIZED' : 'REQUEST_FAILED'),
    message: error.message || '服务暂时不可用',
    details: error.details || {},
    requestId: payload && payload.requestId,
    statusCode
  };
}

function createApiClient(options = {}) {
  const baseUrl = options.baseUrl || '';
  const storage = options.storage || (typeof wx !== 'undefined' ? createWxStorage() : createMemoryStorage());
  const request = options.request || ((config) => new Promise((resolve, reject) => {
    wx.request({
      ...config,
      success: resolve,
      fail: reject
    });
  }));
  const createId = options.createRequestId || createRequestId;

  async function requestJson(method, path, data, config = {}) {
    const requestId = config.requestId || createId();
    const token = storage.get('token');
    const headers = {
      'Content-Type': 'application/json',
      'X-Request-Id': requestId,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(config.idempotencyKey ? { 'Idempotency-Key': config.idempotencyKey } : {}),
      ...(config.headers || {})
    };

    const response = await request({
      url: `${baseUrl}${path}`,
      method,
      data,
      header: headers
    });

    const statusCode = response.statusCode || 0;
    const payload = response.data || {};
    if (statusCode >= 200 && statusCode < 300) {
      return payload.data === undefined ? payload : payload.data;
    }

    throw new ApiError(normalizeErrorPayload(payload, statusCode));
  }

  return {
    requestJson,
    get(path, config) {
      return requestJson('GET', path, undefined, config);
    },
    post(path, data, config) {
      return requestJson('POST', path, data, config);
    },
    patch(path, data, config) {
      return requestJson('PATCH', path, data, config);
    },
    delete(path, config) {
      return requestJson('DELETE', path, undefined, config);
    }
  };
}

module.exports = {
  ApiError,
  createApiClient,
  createMemoryStorage,
  createRequestId
};
