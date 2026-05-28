const { createApiClient } = require('./api-client');
const { createMockApi } = require('./api-mock');
const { getRuntimeApiOptions } = require('./api-config');

function toBackendCreateOcrTaskPayload(payload = {}) {
  return {
    fixtureCaseIds: payload.fixtureCaseIds
  };
}

function toBackendDuplicatePayload(payload = {}) {
  return {
    profileId: payload.profileId,
    ocrTaskId: payload.ocrTaskId
  };
}

function toBackendBatchCreatePayload(payload = {}) {
  return {
    profileId: payload.profileId,
    ocrTaskId: payload.ocrTaskId,
    duplicateDecisions: payload.duplicateDecisions || []
  };
}

function createHybridStorage(options = {}) {
  if (options.storage) return options.storage;
  return {
    get(key) {
      if (typeof wx === 'undefined' || !wx.getStorageSync) return '';
      return wx.getStorageSync(key);
    },
    set(key, value) {
      if (typeof wx !== 'undefined' && wx.setStorageSync) wx.setStorageSync(key, value);
    }
  };
}

function createBackendApi(client) {
  return {
    authWxLogin(payload, config) {
      return client.post('/api/auth/wx-login', payload, config);
    },
    refreshAuth(payload) {
      return client.post('/api/auth/refresh', payload);
    },
    logout(config) {
      return client.post('/api/auth/logout', {}, config);
    },
    getProfiles() {
      return client.get('/api/profiles');
    },
    createProfile(payload, config) {
      return client.post('/api/profiles', payload, config);
    },
    getProfile(profileId) {
      return client.get(`/api/profiles/${profileId}`);
    },
    updateProfile(profileId, payload, config) {
      return client.patch(`/api/profiles/${profileId}`, payload, config);
    },
    deleteProfile(profileId, config) {
      return client.delete(`/api/profiles/${profileId}`, config);
    },
    listReports(profileId, params = {}) {
      const query = params.limit ? `?limit=${params.limit}` : '';
      return client.get(`/api/profiles/${profileId}/reports${query}`);
    },
    getReportDetail(reportId) {
      return client.get(`/api/reports/${reportId}`);
    },
    updateReport(reportId, payload, config) {
      return client.patch(`/api/reports/${reportId}`, payload, config);
    },
    deleteReport(reportId, config) {
      return client.delete(`/api/reports/${reportId}`, config);
    },
    listMetricSnapshots(profileId, params = {}) {
      const query = Object.keys(params).length
        ? `?${Object.keys(params).map((key) => `${key}=${encodeURIComponent(params[key])}`).join('&')}`
        : '';
      return client.get(`/api/profiles/${profileId}/metrics/snapshots${query}`);
    },
    getMetricHistory(profileId, metricKey) {
      return client.get(`/api/profiles/${profileId}/metrics/${metricKey}/history`);
    },
    setMetricPinned(profileId, metricKey, isPinned) {
      return client.patch(`/api/profiles/${profileId}/metrics/${metricKey}/pin`, { isPinned });
    },
    listRecheckPlans(profileId) {
      return client.get(`/api/profiles/${profileId}/recheck-plans`);
    },
    createRecheckPlan(profileId, payload, config) {
      return client.post(`/api/profiles/${profileId}/recheck-plans`, payload, config);
    },
    updateRecheckTodo(planId, todoId, payload) {
      return client.patch(`/api/recheck-plans/${planId}/todos/${todoId}`, payload);
    },
    completeRecheckPlan(planId, config) {
      return client.post(`/api/recheck-plans/${planId}/complete`, {}, config);
    },
    cancelRecheckPlan(planId, config) {
      return client.post(`/api/recheck-plans/${planId}/cancel`, {}, config);
    },
    createOcrTask(payload, config) {
      return client.post('/api/ocr/tasks', payload, config);
    },
    getOcrTask(taskId) {
      return client.get(`/api/ocr/tasks/${taskId}`);
    },
    resolveOcrConflict(payload, config) {
      return client.patch(`/api/ocr/tasks/${payload.taskId}/drafts/${payload.draftId}/conflicts/${payload.metricKey}`, payload, config);
    },
    updateOcrDraft(payload, config) {
      return client.patch(`/api/ocr/tasks/${payload.taskId}/drafts/${payload.draftId}`, payload, config);
    },
    checkDuplicateReports(payload, config) {
      return client.post('/api/reports/duplicate-check', payload, config);
    },
    batchCreateReports(payload, config) {
      return client.post('/api/reports/batch-create', payload, config);
    }
  };
}

function createHybridUploadApi(options = {}) {
  const mockApi = createMockApi();
  const storage = createHybridStorage(options);
  const backendApi = createBackendApi(createApiClient(options));
  const backendProfileId = (profileId) => storage.get('healthhelperBackendProfileId') || profileId;
  const hasBackendProfile = () => !!storage.get('healthhelperBackendProfileId');
  const rememberProfile = (result) => {
    if (result && result.profileId) storage.set('healthhelperBackendProfileId', result.profileId);
    return result;
  };
  return {
    ...mockApi,
    createOcrTask(payload, config) {
      return backendApi.createOcrTask(toBackendCreateOcrTaskPayload(payload), config).then(rememberProfile);
    },
    getOcrTask(taskId) {
      return backendApi.getOcrTask(taskId).then(rememberProfile);
    },
    resolveOcrConflict(payload, config) {
      return backendApi.resolveOcrConflict(payload, config);
    },
    updateOcrDraft(payload, config) {
      return backendApi.updateOcrDraft(payload, config);
    },
    listReports(profileId, params) {
      return backendApi.listReports(backendProfileId(profileId), params);
    },
    getReportDetail(reportId) {
      return backendApi.getReportDetail(reportId);
    },
    updateReport(reportId, payload, config) {
      return backendApi.updateReport(reportId, payload, config);
    },
    deleteReport(reportId, config) {
      return backendApi.deleteReport(reportId, config);
    },
    listMetricSnapshots(profileId, params) {
      return backendApi.listMetricSnapshots(backendProfileId(profileId), params);
    },
    getMetricHistory(profileId, metricKey) {
      return backendApi.getMetricHistory(backendProfileId(profileId), metricKey);
    },
    setMetricPinned(profileId, metricKey, isPinned) {
      return backendApi.setMetricPinned(backendProfileId(profileId), metricKey, isPinned);
    },
    listRecheckPlans(profileId) {
      if (!hasBackendProfile()) return mockApi.listRecheckPlans(profileId);
      return backendApi.listRecheckPlans(backendProfileId(profileId));
    },
    createRecheckPlan(profileId, payload, config) {
      if (!hasBackendProfile()) return mockApi.createRecheckPlan(profileId, payload, config);
      return backendApi.createRecheckPlan(backendProfileId(profileId), payload, config);
    },
    updateRecheckTodo(planId, todoId, payload) {
      if (!hasBackendProfile()) return mockApi.updateRecheckTodo(planId, todoId, payload);
      return backendApi.updateRecheckTodo(planId, todoId, payload);
    },
    completeRecheckPlan(planId, config) {
      if (!hasBackendProfile()) return mockApi.completeRecheckPlan(planId, config);
      return backendApi.completeRecheckPlan(planId, config);
    },
    cancelRecheckPlan(planId, config) {
      if (!hasBackendProfile()) return mockApi.cancelRecheckPlan(planId, config);
      return backendApi.cancelRecheckPlan(planId, config);
    },
    checkDuplicateReports(payload, config) {
      return backendApi.checkDuplicateReports(toBackendDuplicatePayload(payload), config);
    },
    batchCreateReports(payload, config) {
      return backendApi.batchCreateReports(toBackendBatchCreatePayload(payload), config);
    }
  };
}

function createApi(options = {}) {
  const runtimeOptions = getRuntimeApiOptions(options);
  if (runtimeOptions.mode === 'backend') {
    return createBackendApi(createApiClient(runtimeOptions));
  }
  if (runtimeOptions.mode === 'hybrid-upload') {
    return createHybridUploadApi(runtimeOptions);
  }
  return createMockApi();
}

const api = createApi();

module.exports = {
  api,
  createApi,
  createBackendApi,
  createHybridUploadApi
};
