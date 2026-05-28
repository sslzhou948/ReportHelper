const { createApiClient } = require('./api-client');
const { createMockApi } = require('./api-mock');

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

function createApi(options = {}) {
  if (options.mode === 'backend') {
    return createBackendApi(createApiClient(options));
  }
  return createMockApi();
}

const api = createApi();

module.exports = {
  api,
  createApi,
  createBackendApi
};
