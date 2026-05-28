const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { formatDate, formatCnDate, formatMonthDay, daysBetween, relativeFromToday } = require('../miniprogram/utils/date');
const { calculateTone, calculateTrend } = require('../miniprogram/utils/trend');
const { normalizeReportMetrics, groupMetricsByCategory, buildMetricSnapshots } = require('../miniprogram/utils/report');
const { buildPhotoBatches, buildRecognitionReports, getReportCount } = require('../miniprogram/utils/upload');
const { validateProfile } = require('../miniprogram/utils/profile');
const { buildDefaultTodos, validateRecheckPlan } = require('../miniprogram/utils/recheck');
const { ApiError, createApiClient, createMemoryStorage } = require('../miniprogram/utils/api-client');
const { createApi } = require('../miniprogram/utils/api');
const { realcaseOcrDrafts } = require('../miniprogram/data/ocr-fixtures');
const mock = require('../miniprogram/data/mock');

function walkFiles(dir, predicate, output = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(fullPath, predicate, output);
    else if (predicate(fullPath)) output.push(fullPath);
  }
  return output;
}

const asyncChecks = [];

assert.strictEqual(formatDate('2026-05-07'), '2026-05-07');
assert.strictEqual(formatCnDate('2026-05-07'), '2026 年 5 月 7 日');
assert.strictEqual(formatMonthDay('2026-05-07'), '5月7日');
assert.strictEqual(daysBetween('2026-05-01', '2026-05-03'), 2);
assert.strictEqual(relativeFromToday('2026-05-26', '2026-05-27'), '1 天前');
assert.strictEqual(relativeFromToday('2026-05-29', '2026-05-27'), '2 天后');

assert.strictEqual(calculateTone(2.9, 3.5, 9.5, 'quantitative'), 'low');
assert.strictEqual(calculateTone(10.2, 3.5, 9.5, 'quantitative'), 'high');
assert.strictEqual(calculateTone(5.6, 3.5, 9.5, 'quantitative'), 'ok');
assert.strictEqual(calculateTone('阳性', null, null, 'qualitative'), 'positive');
assert.deepStrictEqual(
  calculateTrend([
    { reportDate: '2026-01-01', valueNumeric: 10, valueType: 'quantitative', refRangeLow: 0, refRangeHigh: 20 },
    { reportDate: '2026-02-01', valueNumeric: 14, valueType: 'quantitative', refRangeLow: 0, refRangeHigh: 20 }
  ]),
  { direction: 'up', label: '持续上升' }
);

const rows = normalizeReportMetrics(mock.reports[0], mock.metricDefinitions);
assert.strictEqual(rows[0].metricName, mock.metricDefinitions[rows[0].metricKey].nameCn);
assert.ok(rows.every((row) => row.profileId === undefined), 'normalized rows should not invent profile ownership');
assert.ok(Object.keys(groupMetricsByCategory(rows)).length >= 1);

const snapshots = buildMetricSnapshots(mock.reports.filter((report) => report.profileId === 'profile_mom'), mock.metricDefinitions);
const pinned = snapshots.filter((item) => item.isPinned);
assert.ok(snapshots.length >= 6, 'expected metric snapshots from mock reports');
assert.ok(pinned.length >= 1, 'expected at least one pinned metric');
assert.ok(snapshots.every((item) => item.metricName && item.lastDate), 'snapshots must have display fields');
assert.deepStrictEqual(buildMetricSnapshots([
  { id: 'report_view_only', profileId: 'profile_x', reportDate: '2026-01-01', hospital: 'A', analysisPolicy: 'view_only', metrics: [{ metricKey: 'acth', metricName: 'ACTH', valueNumeric: 100, valueType: 'quantitative' }] },
  { id: 'report_pending', profileId: 'profile_x', reportDate: '2026-01-02', hospital: 'A', metrics: [{ metricKey: 'unknown_metric', metricName: '未知指标', valueNumeric: 1, valueType: 'quantitative', mappingStatus: 'pending' }] }
], mock.metricDefinitions), [], 'view-only and pending metrics must not feed snapshots');

const uploadPhotos = [
  { id: 1, group: 1 },
  { id: 2, group: 1 },
  { id: 3, group: 0 },
  { id: 4, group: 0 }
];
const uploadBatches = buildPhotoBatches(uploadPhotos);
assert.strictEqual(getReportCount(uploadPhotos), 3, 'one two-page group plus two standalone photos should produce three reports');
assert.deepStrictEqual(uploadBatches.map((batch) => batch.photoIds), [[1, 2], [3], [4]]);
const uploadReports = buildRecognitionReports(uploadPhotos);
assert.strictEqual(uploadReports.length, 3);
assert.deepStrictEqual(uploadReports.map((report) => report.pageCount), [2, 1, 1]);
assert.strictEqual(uploadReports.filter((report) => report.isMerged).length, 1, 'only the grouped photos should produce a merged report');

assert.strictEqual(realcaseOcrDrafts.length, 7, 'realcase OCR baseline should cover all provided images');
assert.ok(realcaseOcrDrafts.some((draft) => (draft.metrics || []).some((metric) => metric.tone === 'high')), 'realcase baseline should include abnormal metrics');
assert.ok(realcaseOcrDrafts.some((draft) => (draft.findings || []).length > 0), 'realcase baseline should include imaging findings');
assert.ok(realcaseOcrDrafts.every((draft) => draft.basicInfo.originalType && draft.basicInfo.typeKey && draft.basicInfo.canonicalTypeName), 'realcase drafts need normalized report type fields');
assert.ok(realcaseOcrDrafts.filter((draft) => draft.basicInfo.modality === 'imaging').every((draft) => draft.analysisPolicy === 'view_only' && draft.basicInfo.examPart), 'imaging drafts need view-only exam part fields');
assert.ok(realcaseOcrDrafts.flatMap((draft) => draft.metrics || []).every((metric) => metric.originalMetricName && metric.mappingStatus), 'fixture metrics need mapping provenance');
assert.ok(realcaseOcrDrafts.flatMap((draft) => draft.metrics || []).some((metric) => metric.metricKey === 'tc' && metric.refText), 'complex lipid references should keep display refText');

assert.strictEqual(buildDefaultTodos().length, 5);
assert.strictEqual(validateRecheckPlan({
  type: '常规复查',
  date: '2026-06-01',
  hospital: '协和医院'
}, new Date('2026-05-27T00:00:00')).ok, true);
assert.strictEqual(validateRecheckPlan({
  type: '',
  date: '2026-05-01',
  hospital: ''
}, new Date('2026-05-27T00:00:00')).ok, false);
assert.strictEqual(validateProfile({ relation: '妈妈', realName: '王芬' }).ok, true);
assert.strictEqual(validateProfile({ relation: '', realName: '' }).ok, false);

const storage = createMemoryStorage({ token: 'token_1' });
let capturedRequest = null;
const client = createApiClient({
  baseUrl: 'https://api.example.test',
  storage,
  createRequestId: () => 'req_test',
  request(config) {
    capturedRequest = config;
    return Promise.resolve({
      statusCode: 200,
      data: {
        data: { ok: true },
        requestId: 'req_test'
      }
    });
  }
});

asyncChecks.push(client.get('/api/profiles').then((data) => {
  assert.deepStrictEqual(data, { ok: true });
  assert.strictEqual(capturedRequest.url, 'https://api.example.test/api/profiles');
  assert.strictEqual(capturedRequest.header.Authorization, 'Bearer token_1');
  assert.strictEqual(capturedRequest.header['X-Request-Id'], 'req_test');
}));

const refreshStorage = createMemoryStorage({
  token: 'expired_token',
  refreshToken: 'refresh_token_1',
  userId: 'user_old'
});
const refreshRequests = [];
const refreshClient = createApiClient({
  baseUrl: 'https://api.example.test',
  storage: refreshStorage,
  createRequestId: () => `req_refresh_${refreshRequests.length + 1}`,
  request(config) {
    refreshRequests.push(config);
    if (refreshRequests.length === 1) {
      return Promise.resolve({
        statusCode: 401,
        data: {
          error: { code: 'UNAUTHORIZED', message: 'expired' },
          requestId: config.header['X-Request-Id']
        }
      });
    }
    if (config.url.endsWith('/api/auth/refresh')) {
      return Promise.resolve({
        statusCode: 200,
        data: {
          data: {
            token: 'fresh_token',
            refreshToken: 'refresh_token_2',
            userId: 'user_new'
          },
          requestId: config.header['X-Request-Id']
        }
      });
    }
    return Promise.resolve({
      statusCode: 200,
      data: {
        data: { ok: true },
        requestId: config.header['X-Request-Id']
      }
    });
  }
});

asyncChecks.push(refreshClient.get('/api/profiles').then((data) => {
  assert.deepStrictEqual(data, { ok: true });
  assert.strictEqual(refreshRequests.length, 3, '401 should refresh and retry once');
  assert.strictEqual(refreshRequests[1].url, 'https://api.example.test/api/auth/refresh');
  assert.deepStrictEqual(refreshRequests[1].data, { refreshToken: 'refresh_token_1' });
  assert.strictEqual(refreshRequests[2].header.Authorization, 'Bearer fresh_token');
  assert.strictEqual(refreshStorage.get('token'), 'fresh_token');
  assert.strictEqual(refreshStorage.get('refreshToken'), 'refresh_token_2');
  assert.strictEqual(refreshStorage.get('userId'), 'user_new');
}));

const hybridRequests = [];
const hybridStorage = createMemoryStorage();
const hybridApi = createApi({
  mode: 'hybrid-upload',
  baseUrl: 'http://127.0.0.1:8787',
  storage: hybridStorage,
  createRequestId: () => `req_hybrid_${hybridRequests.length + 1}`,
  request(config) {
    hybridRequests.push(config);
    return Promise.resolve({
      statusCode: 200,
      data: {
        data: config.url.includes('/duplicate-check')
          ? { hasDuplicates: false, candidates: [] }
          : { id: 'task_1', profileId: '33333333-3333-4333-8333-333333333333', reports: [] },
        requestId: config.header['X-Request-Id']
      }
    });
  }
});

asyncChecks.push(hybridApi.createOcrTask({
  profileId: 'profile_mock',
  photos: [{ photoId: 'photo_1' }],
  fixtureCaseIds: ['acth']
}).then(() => hybridApi.signUploads({
  profileId: 'profile_mock',
  files: [{
    clientFileId: 'local_1',
    fileName: 'report.jpg',
    mimeType: 'image/jpeg',
    size: 1024
  }]
})).then(() => hybridApi.createOcrTask({
  profileId: 'profile_mock',
  photos: [{
    photoId: '44444444-4444-4444-8444-444444444444',
    groupId: 'group_1',
    sortOrder: 1
  }]
})).then(() => hybridApi.listOcrTasks({
  profileId: 'profile_mock',
  status: 'needs_confirmation'
})).then(() => hybridApi.cancelOcrTask('task_1')).then(() => hybridApi.checkDuplicateReports({
  profileId: '11111111-1111-4111-8111-111111111111',
  ocrTaskId: '22222222-2222-4222-8222-222222222222',
  reports: [{ draftId: 'draft_mock' }]
})).then(() => hybridApi.batchCreateReports({
  ocrTaskId: '22222222-2222-4222-8222-222222222222',
  reports: [{ draftId: 'draft_mock' }],
  duplicateDecisions: [{ draftId: 'draft_mock', decision: 'skip' }]
})).then(() => hybridApi.listReports('profile_mock')).then(() => hybridApi.listMetricSnapshots('profile_mock')).then(() => hybridApi.createRecheckPlan('profile_mock', {
  type: '常规复查',
  date: '2026-06-01',
  hospital: '协和医院',
  todos: [{ text: '预约挂号', sortOrder: 1 }]
})).then(() => hybridApi.listRecheckPlans('profile_mock')).then(() => hybridApi.updateRecheckTodo('plan_1', 'todo_1', { isDone: true })).then(() => {
  assert.strictEqual(hybridRequests[0].url, 'http://127.0.0.1:8787/api/ocr/tasks');
  assert.deepStrictEqual(hybridRequests[0].data, { fixtureCaseIds: ['acth'] });
  assert.strictEqual(hybridRequests[1].url, 'http://127.0.0.1:8787/api/uploads/sign');
  assert.strictEqual(hybridRequests[1].data.profileId, '33333333-3333-4333-8333-333333333333');
  assert.strictEqual(hybridRequests[1].data.files[0].clientFileId, 'local_1');
  assert.strictEqual(hybridRequests[2].url, 'http://127.0.0.1:8787/api/ocr/tasks');
  assert.deepStrictEqual(hybridRequests[2].data, {
    profileId: '33333333-3333-4333-8333-333333333333',
    photos: [{
      photoId: '44444444-4444-4444-8444-444444444444',
      groupId: 'group_1',
      sortOrder: 1
    }]
  });
  assert.strictEqual(hybridRequests[3].url, 'http://127.0.0.1:8787/api/ocr/tasks?profileId=33333333-3333-4333-8333-333333333333&status=needs_confirmation');
  assert.strictEqual(hybridRequests[4].url, 'http://127.0.0.1:8787/api/ocr/tasks/task_1/cancel');
  assert.strictEqual(hybridRequests[5].url, 'http://127.0.0.1:8787/api/reports/duplicate-check');
  assert.deepStrictEqual(hybridRequests[5].data, {
    profileId: '11111111-1111-4111-8111-111111111111',
    ocrTaskId: '22222222-2222-4222-8222-222222222222'
  });
  assert.strictEqual(hybridRequests[6].url, 'http://127.0.0.1:8787/api/reports/batch-create');
  assert.deepStrictEqual(hybridRequests[6].data, {
    profileId: undefined,
    ocrTaskId: '22222222-2222-4222-8222-222222222222',
    duplicateDecisions: [{ draftId: 'draft_mock', decision: 'skip' }]
  });
  assert.strictEqual(hybridStorage.get('healthhelperBackendProfileId'), '33333333-3333-4333-8333-333333333333');
  assert.strictEqual(hybridRequests[7].url, 'http://127.0.0.1:8787/api/profiles/33333333-3333-4333-8333-333333333333/reports');
  assert.strictEqual(hybridRequests[8].url, 'http://127.0.0.1:8787/api/profiles/33333333-3333-4333-8333-333333333333/metrics/snapshots');
  assert.strictEqual(hybridRequests[9].url, 'http://127.0.0.1:8787/api/profiles/33333333-3333-4333-8333-333333333333/recheck-plans');
  assert.strictEqual(hybridRequests[10].url, 'http://127.0.0.1:8787/api/profiles/33333333-3333-4333-8333-333333333333/recheck-plans');
  assert.strictEqual(hybridRequests[11].url, 'http://127.0.0.1:8787/api/recheck-plans/plan_1/todos/todo_1');
}));

const errorClient = createApiClient({
  storage: createMemoryStorage(),
  createRequestId: () => 'req_error',
  request() {
    return Promise.resolve({
      statusCode: 400,
      data: {
        error: {
          code: 'VALIDATION_FAILED',
          message: 'bad input',
          details: { fieldErrors: { hospital: 'required' } }
        },
        requestId: 'req_error'
      }
    });
  }
});

asyncChecks.push(errorClient.post('/api/recheck-plans', {}).then(
  () => assert.fail('expected ApiError'),
  (error) => {
    assert.ok(error instanceof ApiError);
    assert.strictEqual(error.code, 'VALIDATION_FAILED');
    assert.strictEqual(error.statusCode, 400);
    assert.strictEqual(error.details.fieldErrors.hospital, 'required');
  }
));

const mockApi = createApi();
let savedFixtureCtReportId = '';
asyncChecks.push(mockApi.getProfiles().then((profiles) => {
  assert.ok(profiles.length >= 1, 'mock api should return profiles');
  assert.ok(profiles[0].id && profiles[0].realName, 'profile list items should match API contract');
}));
asyncChecks.push(mockApi.authWxLogin({ code: 'code_1' }).then((session) => {
  assert.ok(session.token);
  assert.ok(session.refreshToken);
  return mockApi.createProfile({
    relation: '爸爸',
    realName: '测试档案',
    gender: 'M',
    diseaseType: '高血压'
  });
}).then((profile) => {
  assert.ok(profile.id);
  assert.strictEqual(profile.realName, '测试档案');
  return mockApi.getProfiles().then((profiles) => ({ profile, profiles }));
}).then(({ profile, profiles }) => {
  assert.ok(profiles.some((item) => item.id === profile.id), 'created profile should be listed');
  return mockApi.updateProfile(profile.id, { primaryHospital: '社区医院' }).then(() => mockApi.getProfile(profile.id));
}).then((profile) => {
  assert.strictEqual(profile.primaryHospital, '社区医院');
  return mockApi.deleteProfile(profile.id).then(() => mockApi.getProfiles());
}).then((profiles) => {
  assert.ok(!profiles.some((item) => item.realName === '测试档案'), 'deleted profile should be hidden');
  return mockApi.logout();
}).then((result) => {
  assert.strictEqual(result.ok, true);
}));
asyncChecks.push(mockApi.signUploads({
  profileId: 'profile_mom',
  files: [{
    clientFileId: 'local_mock_1',
    fileName: 'report.jpg',
    mimeType: 'image/jpeg',
    size: 1024
  }]
}).then((result) => {
  assert.strictEqual(result.uploads.length, 1);
  assert.strictEqual(result.uploads[0].clientFileId, 'local_mock_1');
  assert.ok(result.uploads[0].photoId);
}));
asyncChecks.push(mockApi.createOcrTask({
  profileId: 'profile_mom',
  photos: [
    { photoId: 'photo_1', groupId: 'group_1', sortOrder: 1 },
    { photoId: 'photo_2', groupId: 'group_1', sortOrder: 2 },
    { photoId: 'photo_3', groupId: 'photo_3', sortOrder: 1 },
    { photoId: 'photo_4', groupId: 'photo_4', sortOrder: 1 }
  ]
}).then((task) => {
  assert.strictEqual(task.status, 'needs_confirmation');
  assert.strictEqual(task.photoCount, 4);
  assert.strictEqual(task.reportCount, 3);
  assert.deepStrictEqual(task.drafts.map((draft) => draft.pageCount), [2, 1, 1]);
  assert.strictEqual(task.drafts.filter((draft) => draft.pageCount > 1).length, 1, 'only one report should be merged');
  return mockApi.listOcrTasks({
    profileId: 'profile_mom',
    status: 'needs_confirmation'
  }).then((tasks) => {
    assert.ok(tasks.some((item) => item.id === task.id), 'mock OCR task list should include active task');
    return mockApi.getOcrTask(task.id);
  });
}).then((task) => {
  assert.strictEqual(task.drafts.length, 3);
  const conflictedDraft = task.drafts.find((draft) => draft.conflicts.length > 0);
  assert.ok(conflictedDraft, 'mock OCR task should include one conflict for confirmation flow');
  return mockApi.resolveOcrConflict({
    taskId: task.id,
    draftId: conflictedDraft.draftId,
    metricKey: conflictedDraft.conflicts[0].metricKey,
    selectedCandidateIndex: 0
  }).then(() => mockApi.getOcrTask(task.id));
}).then((task) => {
  assert.strictEqual(task.drafts.reduce((sum, draft) => sum + draft.conflicts.length, 0), 0);
  return mockApi.batchCreateReports({ ocrTaskId: task.id, reports: task.drafts });
}).then((result) => {
  assert.strictEqual(result.reports.length, 3);
}));
asyncChecks.push(mockApi.createOcrTask({
  profileId: 'profile_mom',
  fixtureCaseIds: ['acth']
}).then((task) => mockApi.cancelOcrTask(task.id).then((cancelled) => {
  assert.strictEqual(cancelled.status, 'cancelled');
  assert.ok(cancelled.drafts.every((draft) => draft.status === 'cancelled'));
  return mockApi.listOcrTasks({ profileId: 'profile_mom', status: 'cancelled' });
})).then((tasks) => {
  assert.ok(tasks.length >= 1, 'cancelled OCR task should be listable by status');
}));
asyncChecks.push(mockApi.createOcrTask({
  profileId: 'profile_self',
  fixtureCaseIds: ['acth', 'thyroid', 'chest_ct_plain']
}).then((task) => {
  assert.strictEqual(task.reportCount, 3);
  assert.strictEqual(task.photoCount, 3);
  assert.strictEqual(task.drafts[0].metrics[0].metricKey, 'acth');
  assert.strictEqual(task.drafts[1].basicInfo.canonicalTypeName, '甲状腺功能');
  assert.strictEqual(task.drafts[2].basicInfo.modality, 'imaging');
  assert.strictEqual(task.drafts[2].basicInfo.examPart, '胸部');
  assert.strictEqual(task.drafts[2].findings.length > 0, true);
  const editedDraft = {
    ...task.drafts[0],
    basicInfo: {
      ...task.drafts[0].basicInfo,
      hospital: '用户校准医院',
      hospitalSource: 'user_edited'
    },
    metrics: task.drafts[0].metrics.map((metric, index) => (
      index === 0 ? { ...metric, valueNumeric: 80, isManuallyEdited: true } : metric
    ))
  };
  return mockApi.updateOcrDraft({
    taskId: task.id,
    draftId: editedDraft.draftId,
    draft: editedDraft
  }).then((updated) => {
    assert.strictEqual(updated.basicInfo.hospital, '用户校准医院');
    assert.strictEqual(updated.metrics[0].valueNumeric, 80);
    return mockApi.getOcrTask(task.id);
  });
}).then((task) => {
  assert.strictEqual(task.drafts[0].basicInfo.hospitalSource, 'user_edited');
  assert.strictEqual(task.drafts[0].metrics[0].isManuallyEdited, true);
  return mockApi.batchCreateReports({ ocrTaskId: task.id, reports: task.drafts });
}).then((result) => {
  assert.strictEqual(result.reports.length, 3);
  return mockApi.listReports('profile_self');
}).then((reports) => {
  assert.ok(reports.some((report) => report.ocrTaskId && report.type === '血浆ACTH (8AM)' && report.hospital === '用户校准医院'), 'saved fixture report should use edited draft fields');
  const ct = reports.find((report) => report.type === '胸腹盆CT平扫');
  assert.ok(ct && ct.modality === 'imaging' && ct.examPart === '胸部' && ct.analysisPolicy === 'view_only', 'saved imaging report should keep view-only CT metadata');
  savedFixtureCtReportId = ct.id;
  return mockApi.listMetricSnapshots('profile_self');
}).then((snapshots) => {
  assert.ok(snapshots.some((snapshot) => snapshot.metricKey === 'acth' && snapshot.lastTone === 'high'), 'fixture metrics should feed snapshots');
  assert.ok(!snapshots.some((snapshot) => snapshot.lastReportId === savedFixtureCtReportId), 'imaging reports should not feed metric snapshots');
  return mockApi.createOcrTask({
    profileId: 'profile_self',
    fixtureCaseIds: ['acth']
  });
}).then((task) => mockApi.batchCreateReports({ ocrTaskId: task.id, reports: task.drafts }).then(
  () => assert.fail('duplicate reports should require a user decision'),
  (error) => {
    assert.ok(error instanceof ApiError);
    assert.strictEqual(error.code, 'DUPLICATE_REPORT_REQUIRES_DECISION');
    assert.ok(error.details.candidates.length >= 1, 'duplicate error should include candidates');
    return { task, candidates: error.details.candidates };
  }
)).then(({ task, candidates }) => mockApi.checkDuplicateReports({
  profileId: 'profile_self',
  ocrTaskId: task.id,
  reports: task.drafts
}).then((result) => {
  assert.strictEqual(result.hasDuplicates, true);
  assert.ok(result.candidates.some((candidate) => candidate.existingReportId && ['strong', 'possible'].includes(candidate.matchLevel)));
  return mockApi.batchCreateReports({
    ocrTaskId: task.id,
    reports: task.drafts,
    duplicateDecisions: candidates.map((candidate) => ({
      draftId: candidate.draftId,
      decision: 'replace',
      existingReportId: candidate.existingReportId
    }))
  });
})).then((result) => {
  assert.strictEqual(result.reports.length, 1);
  assert.strictEqual(result.reports[0].action, 'replaced');
  assert.ok(result.reports[0].replacedReportId);
  return mockApi.createOcrTask({
    profileId: 'profile_self',
    fixtureCaseIds: ['acth']
  });
}).then((task) => {
  const aliasDrafts = task.drafts.map((draft) => ({
    ...draft,
    basicInfo: {
      ...draft.basicInfo,
      hospital: '协和'
    }
  }));
  return mockApi.checkDuplicateReports({
    profileId: 'profile_self',
    ocrTaskId: task.id,
    reports: aliasDrafts
  });
}).then((result) => {
  assert.strictEqual(result.hasDuplicates, true, 'hospital aliases should not prevent duplicate detection');
  assert.ok(result.candidates.some((candidate) => candidate.matchLevel === 'strong'), 'same results and hospital alias should be a strong duplicate');
  return mockApi.createOcrTask({
    profileId: 'profile_self',
    fixtureCaseIds: ['abdomen_pelvis_ct_plain']
  });
}).then((task) => mockApi.checkDuplicateReports({
  profileId: 'profile_self',
  ocrTaskId: task.id,
  reports: task.drafts
})).then((result) => {
  assert.strictEqual(result.hasDuplicates, false, 'same CT type with different exam part should not be treated as duplicate');
}));
const fixtureRepeatApi = createApi();
asyncChecks.push(fixtureRepeatApi.createOcrTask({
  profileId: 'profile_mom',
  fixtureCaseIds: ['acth', 'thyroid', 'cortisol', 'liver_function', 'uric_electrolyte_lipid', 'chest_ct_plain', 'abdomen_pelvis_ct_plain']
}).then((task) => fixtureRepeatApi.batchCreateReports({
  ocrTaskId: task.id,
  reports: task.drafts
}).then(() => fixtureRepeatApi.createOcrTask({
  profileId: 'profile_mom',
  fixtureCaseIds: ['acth', 'thyroid', 'cortisol', 'liver_function', 'uric_electrolyte_lipid', 'chest_ct_plain', 'abdomen_pelvis_ct_plain']
}))).then((task) => fixtureRepeatApi.checkDuplicateReports({
  profileId: 'profile_mom',
  ocrTaskId: task.id,
  reports: task.drafts
}).then((result) => {
  assert.strictEqual(result.hasDuplicates, true, 'saving the full realcase fixture twice should trigger duplicates');
  assert.ok(result.candidates.length >= 7, 'full fixture duplicate check should include each repeated report');
  return fixtureRepeatApi.batchCreateReports({
    ocrTaskId: task.id,
    reports: task.drafts
  }).then(
    () => assert.fail('full fixture duplicate save should require a decision'),
    (error) => {
      assert.strictEqual(error.code, 'DUPLICATE_REPORT_REQUIRES_DECISION');
    }
  );
})));
asyncChecks.push(mockApi.listRecheckPlans('profile_mom').then((recheck) => {
  assert.ok(recheck.nextPlan, 'mock api should expose next recheck plan');
  assert.ok(Array.isArray(recheck.otherPlans), 'mock api should expose other recheck plans');
  assert.strictEqual(typeof recheck.doneCount, 'number');
}));
asyncChecks.push(mockApi.createRecheckPlan('profile_mom', {
  type: '常规复查',
  date: '2026-06-20',
  hospital: '协和医院',
  department: '肿瘤科',
  todos: buildDefaultTodos()
}).then((plan) => {
  assert.strictEqual(plan.status, 'pending');
  assert.strictEqual(plan.todos.length, 5);
  return mockApi.updateRecheckTodo(plan.id, plan.todos[0].id, { isDone: false }).then(() => mockApi.listRecheckPlans('profile_mom'));
}).then((recheck) => {
  const created = [recheck.nextPlan].concat(recheck.otherPlans).filter(Boolean).find((plan) => plan.date === '2026-06-20');
  assert.ok(created, 'created recheck plan should be listed');
  assert.strictEqual(created.todos[0].isDone, false);
  return mockApi.completeRecheckPlan(created.id).then(() => mockApi.listRecheckPlans('profile_mom'));
}).then((recheck) => {
  assert.ok(recheck.doneCount >= 1, 'completed plan should increase done count');
  return mockApi.createRecheckPlan('profile_mom', {
    type: 'CT 检查',
    date: '2026-06-22',
    hospital: '肿瘤医院',
    todos: buildDefaultTodos().slice(0, 2)
  });
}).then((plan) => mockApi.cancelRecheckPlan(plan.id).then(() => mockApi.listRecheckPlans('profile_mom'))).then((recheck) => {
  const visible = [recheck.nextPlan].concat(recheck.otherPlans).filter(Boolean);
  assert.ok(!visible.some((plan) => plan.date === '2026-06-22'), 'cancelled plan should be hidden from pending list');
}));
asyncChecks.push(mockApi.setMetricPinned('profile_mom', 'wbc', false).then((snapshot) => {
  assert.strictEqual(snapshot.metricKey, 'wbc');
  assert.strictEqual(snapshot.isPinned, false);
  return mockApi.listMetricSnapshots('profile_mom', { filter: 'pinned' });
}).then((snapshots) => {
  assert.ok(!snapshots.some((item) => item.metricKey === 'wbc'), 'unpinned metric should be absent from pinned filter');
}));
asyncChecks.push(mockApi.getReportDetail('report_blood_20260428').then(({ report }) => {
  const editedMetrics = report.metrics.map((metric, index) => (
    index === 0 ? { ...metric, valueNumeric: 10.6, isManuallyEdited: true } : metric
  ));
  return mockApi.updateReport(report.id, {
    basicInfo: { note: 'manual check' },
    metrics: editedMetrics
  });
}).then(({ report }) => {
  assert.strictEqual(report.note, 'manual check');
  assert.ok(report.abnormalCount >= 1, 'editing a metric should recalculate abnormal count');
  return mockApi.deleteReport(report.id).then(() => mockApi.listReports('profile_mom'));
}).then((reports) => {
  assert.ok(!reports.some((report) => report.id === 'report_blood_20260428'), 'deleted report should be hidden from report list');
  return mockApi.listMetricSnapshots('profile_mom');
}).then((snapshots) => {
  assert.ok(!snapshots.some((item) => item.lastReportId === 'report_blood_20260428'), 'snapshots should be recalculated after report deletion');
}));

const jsFiles = walkFiles(path.join(__dirname, '..', 'miniprogram'), (file) => file.endsWith('.js'));
for (const file of jsFiles) {
  require('child_process').execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
}

const jsonFiles = walkFiles(path.join(__dirname, '..'), (file) => file.endsWith('.json') && !file.includes(`${path.sep}node_modules${path.sep}`));
for (const file of jsonFiles) {
  JSON.parse(fs.readFileSync(file, 'utf8'));
}

Promise.all(asyncChecks).then(() => {
  console.log(`Unit checks passed: ${jsFiles.length} JS files, ${jsonFiles.length} JSON files`);
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
