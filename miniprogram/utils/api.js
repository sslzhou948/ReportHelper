const { createApiClient } = require('./api-client');
const { createMockApi } = require('./api-mock');
const { getRuntimeApiOptions } = require('./api-config');

function toBackendCreateOcrTaskPayload(payload = {}) {
  if (payload.fixtureCaseIds && payload.fixtureCaseIds.length) {
    return {
      fixtureCaseIds: payload.fixtureCaseIds
    };
  }
  return {
    profileId: payload.profileId,
    photos: payload.photos || []
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

function toQuery(params = {}) {
  const query = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .map((key) => `${key}=${encodeURIComponent(params[key])}`)
    .join('&');
  return query ? `?${query}` : '';
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
    signUploads(payload, config) {
      return client.post('/api/uploads/sign', payload, config);
    },
    completeUploads(payload, config) {
      return client.post('/api/uploads/complete', payload, config);
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
    updateRecheckPlan(planId, payload, config) {
      return client.patch(`/api/recheck-plans/${planId}`, payload, config);
    },
    updateRecheckTodo(planId, todoId, payload) {
      return client.patch(`/api/recheck-plans/${planId}/todos/${todoId}`, payload);
    },
    addRecheckTodo(planId, payload, config) {
      return client.post(`/api/recheck-plans/${planId}/todos`, payload, config);
    },
    completeRecheckPlan(planId, config) {
      return client.post(`/api/recheck-plans/${planId}/complete`, {}, config);
    },
    cancelRecheckPlan(planId, config) {
      return client.post(`/api/recheck-plans/${planId}/cancel`, {}, config);
    },
    deleteRecheckPlan(planId, config) {
      return client.delete(`/api/recheck-plans/${planId}`, config);
    },
    createOcrTask(payload, config) {
      return client.post('/api/ocr/tasks', payload, config);
    },
    listOcrTasks(params = {}) {
      return client.get(`/api/ocr/tasks${toQuery(params)}`);
    },
    getOcrTask(taskId) {
      return client.get(`/api/ocr/tasks/${taskId}`);
    },
    cancelOcrTask(taskId, config) {
      return client.post(`/api/ocr/tasks/${taskId}/cancel`, {}, config);
    },
    retryOcrTask(taskId, payload = {}, config) {
      return client.post(`/api/ocr/tasks/${taskId}/retry`, payload, config);
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
      const backendPayload = toBackendCreateOcrTaskPayload({
        ...payload,
        profileId: payload.profileId ? backendProfileId(payload.profileId) : payload.profileId
      });
      return backendApi.createOcrTask(backendPayload, config).then(rememberProfile);
    },
    signUploads(payload, config) {
      return backendApi.signUploads({
        ...payload,
        profileId: backendProfileId(payload.profileId)
      }, config);
    },
    completeUploads(payload, config) {
      return backendApi.completeUploads({
        ...payload,
        profileId: backendProfileId(payload.profileId)
      }, config);
    },
    listOcrTasks(params = {}) {
      return backendApi.listOcrTasks({
        ...params,
        profileId: params.profileId ? backendProfileId(params.profileId) : params.profileId
      });
    },
    getOcrTask(taskId) {
      return backendApi.getOcrTask(taskId).then(rememberProfile);
    },
    cancelOcrTask(taskId, config) {
      return backendApi.cancelOcrTask(taskId, config);
    },
    retryOcrTask(taskId, payload, config) {
      return backendApi.retryOcrTask(taskId, payload, config);
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
    updateRecheckPlan(planId, payload, config) {
      if (!hasBackendProfile()) return mockApi.updateRecheckPlan(planId, payload, config);
      return backendApi.updateRecheckPlan(planId, payload, config);
    },
    updateRecheckTodo(planId, todoId, payload) {
      if (!hasBackendProfile()) return mockApi.updateRecheckTodo(planId, todoId, payload);
      return backendApi.updateRecheckTodo(planId, todoId, payload);
    },
    addRecheckTodo(planId, payload, config) {
      if (!hasBackendProfile()) return mockApi.addRecheckTodo(planId, payload, config);
      return backendApi.addRecheckTodo(planId, payload, config);
    },
    completeRecheckPlan(planId, config) {
      if (!hasBackendProfile()) return mockApi.completeRecheckPlan(planId, config);
      return backendApi.completeRecheckPlan(planId, config);
    },
    cancelRecheckPlan(planId, config) {
      if (!hasBackendProfile()) return mockApi.cancelRecheckPlan(planId, config);
      return backendApi.cancelRecheckPlan(planId, config);
    },
    deleteRecheckPlan(planId, config) {
      if (!hasBackendProfile()) return mockApi.deleteRecheckPlan(planId, config);
      return backendApi.deleteRecheckPlan(planId, config);
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
