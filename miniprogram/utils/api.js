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
    },
    remove(key) {
      if (typeof wx !== 'undefined' && wx.removeStorageSync) wx.removeStorageSync(key);
    }
  };
}

function createBackendApi(client) {
  return {
    authWxLogin(payload, config) {
      return client.post('/api/auth/wx-login', payload, {
        ...config,
        skipUnauthorizedRedirect: true
      });
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
      return client.get(`/api/profiles/${profileId}/reports${toQuery(params)}`);
    },
    getReportDetail(reportId) {
      return client.get(`/api/reports/${reportId}`);
    },
    updateReport(reportId, payload, config) {
      return client.patch(`/api/reports/${reportId}`, payload, config);
    },
    createManualReport(profileId, payload, config) {
      return client.post(`/api/profiles/${profileId}/manual-reports`, payload, config);
    },
    listManualTemplates(profileId) {
      return client.get(`/api/profiles/${profileId}/manual-templates`);
    },
    saveManualTemplate(profileId, payload, config) {
      return client.post(`/api/profiles/${profileId}/manual-templates`, payload, config);
    },
    archiveManualTemplate(profileId, metricKey, config) {
      return client.delete(`/api/profiles/${profileId}/manual-templates/${encodeURIComponent(metricKey)}`, config);
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
    listPendingMetricCandidates(profileId, params = {}) {
      return client.get(`/api/profiles/${profileId}/metrics/pending-candidates${toQuery(params)}`);
    },
    getMetricHistory(profileId, metricKey, params = {}) {
      return client.get(`/api/profiles/${profileId}/metrics/${encodeURIComponent(metricKey)}/history${toQuery(params)}`);
    },
    setMetricPinned(profileId, metricKey, isPinned) {
      return client.patch(`/api/profiles/${profileId}/metrics/${encodeURIComponent(metricKey)}/pin`, { isPinned });
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
    deleteRecheckTodo(planId, todoId, config) {
      return client.delete(`/api/recheck-plans/${planId}/todos/${todoId}`, config);
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
    createExport(profileId, payload, config) {
      return client.post(`/api/profiles/${profileId}/exports`, payload, config);
    },
    getExport(exportId, config) {
      return client.get(`/api/exports/${exportId}`, config);
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
      return client.patch(`/api/ocr/tasks/${encodeURIComponent(payload.taskId)}/drafts/${encodeURIComponent(payload.draftId)}/conflicts/${encodeURIComponent(payload.metricKey)}`, payload, config);
    },
    updateOcrDraft(payload, config) {
      return client.patch(`/api/ocr/tasks/${payload.taskId}/drafts/${payload.draftId}`, payload, config);
    },
    deleteOcrDraft(taskId, draftId, config) {
      return client.post(`/api/ocr/tasks/${encodeURIComponent(taskId)}/drafts/${encodeURIComponent(draftId)}/delete`, {}, config);
    },
    splitOcrDraft(taskId, draftId, config) {
      return client.post(`/api/ocr/tasks/${encodeURIComponent(taskId)}/drafts/${encodeURIComponent(draftId)}/split`, {}, config);
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
  let refreshProfilePromise = null;
  const backendProfileId = (profileId) => storage.get('healthhelperBackendProfileId') || profileId;
  const hasBackendProfile = () => !!storage.get('healthhelperBackendProfileId');
  const forgetBackendProfile = () => {
    if (storage.remove) {
      storage.remove('healthhelperBackendProfileId');
    } else {
      storage.set('healthhelperBackendProfileId', '');
    }
  };
  const rememberProfile = (result) => {
    if (result && result.profileId) storage.set('healthhelperBackendProfileId', result.profileId);
    return result;
  };
  const shouldRefreshProfile = (error) => {
    if (!error) return false;
    if (error.code === 'NOT_FOUND') return true;
    if (error.code !== 'VALIDATION_FAILED') return false;
    const detailsText = JSON.stringify(error.details || {});
    return detailsText.includes('profileId');
  };
  const refreshBackendProfileId = () => {
    if (refreshProfilePromise) return refreshProfilePromise;
    refreshProfilePromise = backendApi.getProfiles().then((profiles) => {
      const profile = (profiles || [])[0];
      if (!profile || !profile.id) {
        forgetBackendProfile();
        return '';
      }
      storage.set('healthhelperBackendProfileId', profile.id);
      return profile.id;
    }).catch((error) => {
      forgetBackendProfile();
      throw error;
    }).finally(() => {
      refreshProfilePromise = null;
    });
    return refreshProfilePromise;
  };
  const withRefreshedProfile = (action) => action().catch((error) => {
    if (!shouldRefreshProfile(error)) throw error;
    return refreshBackendProfileId().then((profileId) => {
      if (!profileId) throw error;
      return action();
    });
  });
  return {
    ...mockApi,
    createOcrTask(payload, config) {
      return withRefreshedProfile(() => {
        const backendPayload = toBackendCreateOcrTaskPayload({
          ...payload,
          profileId: payload.profileId ? backendProfileId(payload.profileId) : payload.profileId
        });
        return backendApi.createOcrTask(backendPayload, config).then(rememberProfile);
      });
    },
    signUploads(payload, config) {
      return withRefreshedProfile(() => backendApi.signUploads({
        ...payload,
        profileId: backendProfileId(payload.profileId)
      }, config));
    },
    completeUploads(payload, config) {
      return withRefreshedProfile(() => backendApi.completeUploads({
        ...payload,
        profileId: backendProfileId(payload.profileId)
      }, config));
    },
    listOcrTasks(params = {}) {
      return withRefreshedProfile(() => backendApi.listOcrTasks({
        ...params,
        profileId: params.profileId ? backendProfileId(params.profileId) : params.profileId
      }));
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
    deleteOcrDraft(taskId, draftId, config) {
      return backendApi.deleteOcrDraft(taskId, draftId, config).then(rememberProfile);
    },
    splitOcrDraft(taskId, draftId, config) {
      return backendApi.splitOcrDraft(taskId, draftId, config).then(rememberProfile);
    },
    listReports(profileId, params) {
      return withRefreshedProfile(() => backendApi.listReports(backendProfileId(profileId), params));
    },
    getReportDetail(reportId) {
      return backendApi.getReportDetail(reportId);
    },
    updateReport(reportId, payload, config) {
      return backendApi.updateReport(reportId, payload, config);
    },
    createManualReport(profileId, payload, config) {
      return withRefreshedProfile(() => backendApi.createManualReport(backendProfileId(profileId), payload, config));
    },
    listManualTemplates(profileId) {
      if (!hasBackendProfile()) return mockApi.listManualTemplates(profileId);
      return withRefreshedProfile(() => backendApi.listManualTemplates(backendProfileId(profileId)));
    },
    saveManualTemplate(profileId, payload, config) {
      if (!hasBackendProfile()) return mockApi.saveManualTemplate(profileId, payload, config);
      return withRefreshedProfile(() => backendApi.saveManualTemplate(backendProfileId(profileId), payload, config));
    },
    archiveManualTemplate(profileId, metricKey, config) {
      if (!hasBackendProfile()) return mockApi.archiveManualTemplate(profileId, metricKey, config);
      return withRefreshedProfile(() => backendApi.archiveManualTemplate(backendProfileId(profileId), metricKey, config));
    },
    deleteReport(reportId, config) {
      return backendApi.deleteReport(reportId, config);
    },
    listMetricSnapshots(profileId, params) {
      return withRefreshedProfile(() => backendApi.listMetricSnapshots(backendProfileId(profileId), params));
    },
    listPendingMetricCandidates(profileId, params) {
      if (!hasBackendProfile()) return mockApi.listPendingMetricCandidates(profileId, params);
      return withRefreshedProfile(() => backendApi.listPendingMetricCandidates(backendProfileId(profileId), params));
    },
    getMetricHistory(profileId, metricKey, params) {
      return withRefreshedProfile(() => backendApi.getMetricHistory(backendProfileId(profileId), metricKey, params));
    },
    setMetricPinned(profileId, metricKey, isPinned) {
      return withRefreshedProfile(() => backendApi.setMetricPinned(backendProfileId(profileId), metricKey, isPinned));
    },
    listRecheckPlans(profileId) {
      if (!hasBackendProfile()) return mockApi.listRecheckPlans(profileId);
      return withRefreshedProfile(() => backendApi.listRecheckPlans(backendProfileId(profileId)));
    },
    createRecheckPlan(profileId, payload, config) {
      if (!hasBackendProfile()) return mockApi.createRecheckPlan(profileId, payload, config);
      return withRefreshedProfile(() => backendApi.createRecheckPlan(backendProfileId(profileId), payload, config));
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
    deleteRecheckTodo(planId, todoId, config) {
      if (!hasBackendProfile()) return mockApi.deleteRecheckTodo(planId, todoId, config);
      return backendApi.deleteRecheckTodo(planId, todoId, config);
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
    createExport(profileId, payload, config) {
      if (!hasBackendProfile()) return mockApi.createExport(profileId, payload, config);
      return withRefreshedProfile(() => backendApi.createExport(backendProfileId(profileId), payload, config));
    },
    getExport(exportId, config) {
      if (!hasBackendProfile()) return mockApi.getExport(exportId, config);
      return backendApi.getExport(exportId, config);
    },
    checkDuplicateReports(payload, config) {
      return withRefreshedProfile(() => backendApi.checkDuplicateReports(toBackendDuplicatePayload({
        ...payload,
        profileId: payload && payload.profileId ? backendProfileId(payload.profileId) : payload.profileId
      }), config));
    },
    batchCreateReports(payload, config) {
      return withRefreshedProfile(() => backendApi.batchCreateReports(toBackendBatchCreatePayload({
        ...payload,
        profileId: payload && payload.profileId ? backendProfileId(payload.profileId) : payload.profileId
      }), config));
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

let cachedRuntimeApi = null;
let cachedRuntimeKey = '';

function getRuntimeApi() {
  const runtimeOptions = getRuntimeApiOptions();
  const runtimeKey = `${runtimeOptions.mode}|${runtimeOptions.baseUrl}`;
  if (!cachedRuntimeApi || cachedRuntimeKey !== runtimeKey) {
    cachedRuntimeApi = createApi(runtimeOptions);
    cachedRuntimeKey = runtimeKey;
  }
  return cachedRuntimeApi;
}

const api = new Proxy({}, {
  get(_target, property) {
    const runtimeApi = getRuntimeApi();
    const value = runtimeApi[property];
    return typeof value === 'function' ? value.bind(runtimeApi) : value;
  }
});

module.exports = {
  api,
  createApi,
  createBackendApi,
  createHybridUploadApi,
  getRuntimeApi
};
