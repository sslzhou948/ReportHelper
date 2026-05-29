import assert from 'node:assert/strict';
import { buildApp } from './app.js';
import { loadEnv, parseDotEnv, type Env } from './config/env.js';
import { resolveWxLoginSession } from './routes/auth.js';
import { MemoryPrisma } from './testing/memory-prisma.js';

type Row = Record<string, any>;

function offsetDateOnly(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

assert.deepEqual(parseDotEnv(`
# local backend config
DATABASE_URL="postgresql://user:pass@localhost:5432/healthhelper?schema=public"
JWT_SECRET='local-secret-1234567890'
PORT=8788
`), {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/healthhelper?schema=public',
  JWT_SECRET: 'local-secret-1234567890',
  PORT: '8788'
});

const parsedEnv = loadEnv({
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  JWT_SECRET: 'test-secret-1234567890',
  WECHAT_APP_ID: 'test-app-id',
  WECHAT_APP_SECRET: 'test-app-secret',
  NODE_ENV: 'test',
  PORT: '8789'
});
assert.equal(parsedEnv.PORT, 8789);
assert.equal(parsedEnv.NODE_ENV, 'test');
assert.throws(() => loadEnv({
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  JWT_SECRET: 'replace-with-local-dev-secret',
  WECHAT_APP_ID: 'test-app-id',
  WECHAT_APP_SECRET: 'put-secret-in-local-env-only',
  NODE_ENV: 'production',
  PORT: '8789'
}));

const env: Env = {
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  JWT_SECRET: 'test-secret-1234567890',
  WECHAT_APP_ID: 'test-app-id',
  WECHAT_APP_SECRET: 'test-app-secret',
  NODE_ENV: 'test',
  PORT: 8787
};

const prisma = new MemoryPrisma();
const app = buildApp({ env, prisma: prisma as any });

const healthResponse = await app.inject({
  method: 'GET',
  url: '/api/health'
});
assert.equal(healthResponse.statusCode, 200);
assert.equal(healthResponse.json().data.ok, true);
assert.equal(healthResponse.json().data.database.status, 'unchecked');

const unhealthyApp = buildApp({
  env,
  prisma: {
    $queryRawUnsafe: async () => {
      throw new Error('database unavailable');
    }
  } as any
});
const unhealthyResponse = await unhealthyApp.inject({
  method: 'GET',
  url: '/api/health'
});
assert.equal(unhealthyResponse.statusCode, 503);
assert.equal(unhealthyResponse.json().data.ok, false);
assert.equal(unhealthyResponse.json().data.database.status, 'error');
await unhealthyApp.close();

const productionWxSession = await resolveWxLoginSession({
  ...env,
  NODE_ENV: 'production'
}, 'wx_code_for_test', async (url) => {
  const parsedUrl = new URL(url);
  assert.equal(parsedUrl.hostname, 'api.weixin.qq.com');
  assert.equal(parsedUrl.searchParams.get('appid'), env.WECHAT_APP_ID);
  assert.equal(parsedUrl.searchParams.get('secret'), env.WECHAT_APP_SECRET);
  assert.equal(parsedUrl.searchParams.get('js_code'), 'wx_code_for_test');
  assert.equal(parsedUrl.searchParams.get('grant_type'), 'authorization_code');
  return {
    ok: true,
    status: 200,
    json: async () => ({
      openid: 'wx_openid_from_tencent',
      unionid: 'wx_unionid_from_tencent'
    })
  };
});
assert.equal(productionWxSession.wxOpenid, 'wx_openid_from_tencent');
assert.equal(productionWxSession.wxUnionid, 'wx_unionid_from_tencent');

const loginResponse = await app.inject({
  method: 'POST',
  url: '/api/auth/wx-login',
  payload: {
    code: 'smoke_code'
  }
});
assert.equal(loginResponse.statusCode, 200);
const loginPayload = loginResponse.json();
assert.ok(loginPayload.data.token);
assert.ok(loginPayload.data.refreshToken);
assert.ok(loginPayload.data.userId);

const prodApp = buildApp({
  env: {
    ...env,
    NODE_ENV: 'production'
  },
  prisma: prisma as any
});
const prodNoTokenResponse = await prodApp.inject({
  method: 'GET',
  url: '/api/profiles'
});
assert.equal(prodNoTokenResponse.statusCode, 401);
const prodAccessToken = prodApp.jwt.sign({ sub: loginPayload.data.userId, typ: 'access' }, { expiresIn: '2h' });
const prodProfilesResponse = await prodApp.inject({
  method: 'GET',
  url: '/api/profiles',
  headers: {
    Authorization: `Bearer ${prodAccessToken}`
  }
});
assert.equal(prodProfilesResponse.statusCode, 200);
assert.equal(prodProfilesResponse.json().data.length, 0);
const prodFixtureResponse = await prodApp.inject({
  method: 'POST',
  url: '/api/ocr/tasks',
  headers: {
    Authorization: `Bearer ${prodAccessToken}`
  },
  payload: {
    fixtureCaseIds: ['acth']
  }
});
assert.equal(prodFixtureResponse.statusCode, 403);
assert.equal(prodFixtureResponse.json().error.code, 'FORBIDDEN');
await prodApp.close();

const refreshResponse = await app.inject({
  method: 'POST',
  url: '/api/auth/refresh',
  payload: {
    refreshToken: loginPayload.data.refreshToken
  }
});
assert.equal(refreshResponse.statusCode, 200);
assert.ok(refreshResponse.json().data.token);

const logoutResponse = await app.inject({
  method: 'POST',
  url: '/api/auth/logout'
});
assert.equal(logoutResponse.statusCode, 200);
assert.equal(logoutResponse.json().data.ok, true);

const profilesResponse = await app.inject({
  method: 'GET',
  url: '/api/profiles'
});
assert.equal(profilesResponse.statusCode, 200);
const profilesPayload = profilesResponse.json();
assert.equal(profilesPayload.data.length, 1);
const profileId = profilesPayload.data[0].id;

const signUploadsResponse = await app.inject({
  method: 'POST',
  url: '/api/uploads/sign',
  payload: {
    profileId,
    files: [
      {
        clientFileId: 'local_1',
        fileName: 'report1.jpg',
        mimeType: 'image/jpeg',
        size: 123456
      },
      {
        clientFileId: 'local_2',
        fileName: 'report2.png',
        mimeType: 'image/png',
        size: 456789
      }
    ]
  }
});
assert.equal(signUploadsResponse.statusCode, 200);
const signUploadsPayload = signUploadsResponse.json();
assert.equal(signUploadsPayload.data.uploads.length, 2);
assert.equal(signUploadsPayload.data.uploads[0].clientFileId, 'local_1');
assert.ok(signUploadsPayload.data.uploads[0].photoId);
assert.ok(signUploadsPayload.data.uploads[0].objectKey.includes(profileId));
assert.equal(prisma.reportPhotos.length, 2);
assert.equal(prisma.reportPhotos[0].status, 'signed');

const oversizedUploadResponse = await app.inject({
  method: 'POST',
  url: '/api/uploads/sign',
  payload: {
    profileId,
    files: [{
      clientFileId: 'too_large',
      fileName: 'large.jpg',
      mimeType: 'image/jpeg',
      size: 11 * 1024 * 1024
    }]
  }
});
assert.equal(oversizedUploadResponse.statusCode, 413);
assert.equal(oversizedUploadResponse.json().error.code, 'PAYLOAD_TOO_LARGE');

const unsupportedUploadResponse = await app.inject({
  method: 'POST',
  url: '/api/uploads/sign',
  payload: {
    profileId,
    files: [{
      clientFileId: 'bad_type',
      fileName: 'report.pdf',
      mimeType: 'application/pdf',
      size: 1024
    }]
  }
});
assert.equal(unsupportedUploadResponse.statusCode, 415);
assert.equal(unsupportedUploadResponse.json().error.code, 'UNSUPPORTED_MEDIA_TYPE');

const unsupportedWebpUploadResponse = await app.inject({
  method: 'POST',
  url: '/api/uploads/sign',
  payload: {
    profileId,
    files: [{
      clientFileId: 'bad_webp',
      fileName: 'report.webp',
      mimeType: 'image/webp',
      size: 1024
    }]
  }
});
assert.equal(unsupportedWebpUploadResponse.statusCode, 415);
assert.equal(unsupportedWebpUploadResponse.json().error.code, 'UNSUPPORTED_MEDIA_TYPE');

const tooManyOcrPhotosResponse = await app.inject({
  method: 'POST',
  url: '/api/ocr/tasks',
  payload: {
    profileId,
    photos: Array.from({ length: 10 }, (_, index) => ({
      photoId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      groupId: `photo_${index + 1}`,
      sortOrder: index + 1
    }))
  }
});
assert.equal(tooManyOcrPhotosResponse.statusCode, 400);
assert.equal(tooManyOcrPhotosResponse.json().error.code, 'VALIDATION_FAILED');

const incompletePhotoTaskResponse = await app.inject({
  method: 'POST',
  url: '/api/ocr/tasks',
  payload: {
    profileId,
    photos: signUploadsPayload.data.uploads.map((upload: Row, index: number) => ({
      photoId: upload.photoId,
      groupId: 'group_1',
      sortOrder: index + 1
    }))
  }
});
assert.equal(incompletePhotoTaskResponse.statusCode, 400);
assert.equal(incompletePhotoTaskResponse.json().error.code, 'VALIDATION_FAILED');

const completeUploadsResponse = await app.inject({
  method: 'POST',
  url: '/api/uploads/complete',
  payload: {
    profileId,
    uploads: signUploadsPayload.data.uploads.map((upload: Row) => ({
      photoId: upload.photoId,
      sha256: 'a'.repeat(64)
    }))
  }
});
assert.equal(completeUploadsResponse.statusCode, 200);
const completeUploadsPayload = completeUploadsResponse.json();
assert.equal(completeUploadsPayload.data.photos.length, 2);
assert.ok(completeUploadsPayload.data.photos.every((photo: Row) => photo.status === 'uploaded'));
assert.ok(prisma.reportPhotos.every((photo) => photo.status === 'uploaded'));

const signedPhotoTaskResponse = await app.inject({
  method: 'POST',
  url: '/api/ocr/tasks',
  payload: {
    profileId,
    photos: signUploadsPayload.data.uploads.map((upload: Row, index: number) => ({
      photoId: upload.photoId,
      groupId: 'group_1',
      sortOrder: index + 1
    }))
  }
});
assert.equal(signedPhotoTaskResponse.statusCode, 200);
const signedPhotoTaskPayload = signedPhotoTaskResponse.json();
assert.equal(signedPhotoTaskPayload.data.status, 'queued');
assert.equal(signedPhotoTaskPayload.data.photoCount, 2);
assert.equal(signedPhotoTaskPayload.data.reportCount, 1);
assert.equal(signedPhotoTaskPayload.data.drafts.length, 0);
assert.equal(prisma.ocrTaskPhotos.length, 2);
assert.ok(prisma.reportPhotos.every((photo) => photo.status === 'attached'));

await prisma.ocrTask.update({
  where: { id: signedPhotoTaskPayload.data.id },
  data: {
    status: 'failed',
    errorCode: 'OCR_TIMEOUT',
    errorMessage: 'OCR timed out'
  }
});
const failedPhotoTaskResponse = await app.inject({
  method: 'GET',
  url: `/api/ocr/tasks/${signedPhotoTaskPayload.data.id}`
});
assert.equal(failedPhotoTaskResponse.statusCode, 200);
assert.equal(failedPhotoTaskResponse.json().data.status, 'failed');
assert.equal(failedPhotoTaskResponse.json().data.errorCode, 'OCR_TIMEOUT');
const retryPhotoTaskResponse = await app.inject({
  method: 'POST',
  url: `/api/ocr/tasks/${signedPhotoTaskPayload.data.id}/retry`,
  payload: {
    photoIds: signUploadsPayload.data.uploads.map((upload: Row) => upload.photoId)
  }
});
assert.equal(retryPhotoTaskResponse.statusCode, 200);
assert.equal(retryPhotoTaskResponse.json().data.status, 'queued');
assert.equal(retryPhotoTaskResponse.json().data.errorCode, '');

const createProfileResponse = await app.inject({
  method: 'POST',
  url: '/api/profiles',
  payload: {
    relation: '爸爸',
    realName: '测试档案',
    gender: 'M',
    birthDate: '1970-01-02',
    diseaseType: '高血压',
    primaryHospital: '社区医院'
  }
});
assert.equal(createProfileResponse.statusCode, 200);
const createdProfile = createProfileResponse.json().data;
assert.equal(createdProfile.realName, '测试档案');
assert.equal(createdProfile.birthDate, '1970-01-02');
assert.equal(createdProfile.avatarText, '案');

const updateProfileResponse = await app.inject({
  method: 'PATCH',
  url: `/api/profiles/${createdProfile.id}`,
  payload: {
    primaryHospital: '协和医院',
    stage: '随访'
  }
});
assert.equal(updateProfileResponse.statusCode, 200);
assert.equal(updateProfileResponse.json().data.summary, '高血压 · 随访 · 协和医院');

const deleteProfileResponse = await app.inject({
  method: 'DELETE',
  url: `/api/profiles/${createdProfile.id}`
});
assert.equal(deleteProfileResponse.statusCode, 200);
const afterDeleteProfilesResponse = await app.inject({
  method: 'GET',
  url: '/api/profiles'
});
assert.equal(afterDeleteProfilesResponse.statusCode, 200);
assert.ok(!afterDeleteProfilesResponse.json().data.some((profile: Row) => profile.id === createdProfile.id));

const pastRecheckResponse = await app.inject({
  method: 'POST',
  url: `/api/profiles/${profileId}/recheck-plans`,
  payload: {
    type: '甯歌澶嶆煡',
    date: offsetDateOnly(-1),
    hospital: '鍗忓拰鍖婚櫌'
  }
});
assert.equal(pastRecheckResponse.statusCode, 400);
assert.equal(pastRecheckResponse.json().error.code, 'VALIDATION_FAILED');

const nextRecheckDate = offsetDateOnly(4);
const createRecheckResponse = await app.inject({
  method: 'POST',
  url: `/api/profiles/${profileId}/recheck-plans`,
  payload: {
    type: '常规复查',
    date: nextRecheckDate,
    hospital: '协和医院',
    department: '肿瘤科',
    todos: [
      { text: '预约挂号', sortOrder: 1, isDone: false, isTemplate: true },
      { text: '带病历本', sortOrder: 2, isDone: true, isTemplate: true }
    ],
    reminderConfig: {
      advanceDays: [3, 1, 0],
      subscribeAccepted: false
    }
  }
});
assert.equal(createRecheckResponse.statusCode, 200);
const recheckPlan = createRecheckResponse.json().data;
assert.equal(recheckPlan.date, nextRecheckDate);
assert.equal(recheckPlan.todos.length, 2);

const updateRecheckPlanResponse = await app.inject({
  method: 'PATCH',
  url: `/api/recheck-plans/${recheckPlan.id}`,
  payload: {
    hospital: '协和东院',
    department: '影像科'
  }
});
assert.equal(updateRecheckPlanResponse.statusCode, 200);
assert.equal(updateRecheckPlanResponse.json().data.hospital, '协和东院');
assert.equal(updateRecheckPlanResponse.json().data.department, '影像科');

const updateReminderResponse = await app.inject({
  method: 'PATCH',
  url: `/api/recheck-plans/${recheckPlan.id}`,
  payload: {
    reminderConfig: {
      advanceDays: [1],
      subscribeAccepted: false
    }
  }
});
assert.equal(updateReminderResponse.statusCode, 200);
assert.deepEqual(updateReminderResponse.json().data.reminderConfig.advanceDays, [1]);

const invalidUpdateRecheckPlanResponse = await app.inject({
  method: 'PATCH',
  url: `/api/recheck-plans/${recheckPlan.id}`,
  payload: {
    date: offsetDateOnly(-2)
  }
});
assert.equal(invalidUpdateRecheckPlanResponse.statusCode, 400);
assert.equal(invalidUpdateRecheckPlanResponse.json().error.code, 'VALIDATION_FAILED');

const listRecheckResponse = await app.inject({
  method: 'GET',
  url: `/api/profiles/${profileId}/recheck-plans`
});
assert.equal(listRecheckResponse.statusCode, 200);
assert.equal(listRecheckResponse.json().data.nextPlan.id, recheckPlan.id);

const addTodoResponse = await app.inject({
  method: 'POST',
  url: `/api/recheck-plans/${recheckPlan.id}/todos`,
  payload: {
    text: '准备影像资料'
  }
});
assert.equal(addTodoResponse.statusCode, 200);
assert.equal(addTodoResponse.json().data.todos.length, 3);
const customTodo = addTodoResponse.json().data.todos.find((todo: Row) => todo.text === '准备影像资料');
assert.ok(customTodo);
assert.equal(customTodo.isDone, false);

const incompleteRecheckResponse = await app.inject({
  method: 'POST',
  url: `/api/recheck-plans/${recheckPlan.id}/complete`
});
assert.equal(incompleteRecheckResponse.statusCode, 409);
assert.equal(incompleteRecheckResponse.json().error.code, 'RECHECK_TODOS_NOT_READY');

const updateTodoResponse = await app.inject({
  method: 'PATCH',
  url: `/api/recheck-plans/${recheckPlan.id}/todos/${recheckPlan.todos[0].id}`,
  payload: { isDone: true }
});
assert.equal(updateTodoResponse.statusCode, 200);
assert.equal(updateTodoResponse.json().data.todos[0].isDone, true);

const updateCustomTodoResponse = await app.inject({
  method: 'PATCH',
  url: `/api/recheck-plans/${recheckPlan.id}/todos/${customTodo.id}`,
  payload: { isDone: true }
});
assert.equal(updateCustomTodoResponse.statusCode, 200);

const completeRecheckResponse = await app.inject({
  method: 'POST',
  url: `/api/recheck-plans/${recheckPlan.id}/complete`
});
assert.equal(completeRecheckResponse.statusCode, 200);
assert.equal(completeRecheckResponse.json().data.status, 'done');
const doneRecheckResponse = await app.inject({
  method: 'GET',
  url: `/api/profiles/${profileId}/recheck-plans`
});
assert.equal(doneRecheckResponse.statusCode, 200);
assert.equal(doneRecheckResponse.json().data.doneCount, 1);

const cancelSeedResponse = await app.inject({
  method: 'POST',
  url: `/api/profiles/${profileId}/recheck-plans`,
  payload: {
    type: 'CT 检查',
    date: offsetDateOnly(25),
    hospital: '肿瘤医院',
    todos: [{ text: '取号', sortOrder: 1 }]
  }
});
assert.equal(cancelSeedResponse.statusCode, 200);
const cancelRecheckResponse = await app.inject({
  method: 'POST',
  url: `/api/recheck-plans/${cancelSeedResponse.json().data.id}/cancel`
});
assert.equal(cancelRecheckResponse.statusCode, 200);
assert.equal(cancelRecheckResponse.json().data.status, 'cancelled');

const deleteSeedResponse = await app.inject({
  method: 'POST',
  url: `/api/profiles/${profileId}/recheck-plans`,
  payload: {
    type: 'CT followup',
    date: offsetDateOnly(26),
    hospital: 'Union Hospital',
    todos: [{ text: 'Prepare documents', sortOrder: 1 }]
  }
});
assert.equal(deleteSeedResponse.statusCode, 200);
const deleteRecheckResponse = await app.inject({
  method: 'DELETE',
  url: `/api/recheck-plans/${deleteSeedResponse.json().data.id}`
});
assert.equal(deleteRecheckResponse.statusCode, 200);
const afterDeleteRecheckResponse = await app.inject({
  method: 'GET',
  url: `/api/profiles/${profileId}/recheck-plans`
});
assert.equal(afterDeleteRecheckResponse.statusCode, 200);
assert.ok(![afterDeleteRecheckResponse.json().data.nextPlan]
  .concat(afterDeleteRecheckResponse.json().data.otherPlans || [])
  .filter(Boolean)
  .some((plan: Row) => plan.id === deleteSeedResponse.json().data.id));

const createTaskResponse = await app.inject({
  method: 'POST',
  url: '/api/ocr/tasks',
  headers: {
    'Idempotency-Key': 'ocr_fixture_smoke'
  },
  payload: {
    profileId,
    fixtureCaseIds: ['acth', 'thyroid', 'cortisol', 'liver_function', 'uric_electrolyte_lipid', 'chest_ct_plain', 'abdomen_pelvis_ct_plain']
  }
});
assert.equal(createTaskResponse.statusCode, 200);
const createTaskPayload = createTaskResponse.json();
assert.equal(createTaskPayload.data.reportCount, 7);
assert.equal(createTaskPayload.data.drafts.length, 7);
assert.equal(createTaskPayload.data.drafts[0].basicInfo.typeKey, 'endocrine_acth');

const repeatTaskResponse = await app.inject({
  method: 'POST',
  url: '/api/ocr/tasks',
  headers: {
    'Idempotency-Key': 'ocr_fixture_smoke'
  },
  payload: {
    profileId,
    fixtureCaseIds: ['acth']
  }
});
assert.equal(repeatTaskResponse.statusCode, 200);
assert.equal(repeatTaskResponse.json().data.id, createTaskPayload.data.id);
assert.equal(prisma.ocrTasks.filter((task) => task.idempotencyKey === 'ocr_fixture_smoke').length, 1);

const getTaskResponse = await app.inject({
  method: 'GET',
  url: `/api/ocr/tasks/${createTaskPayload.data.id}`
});
assert.equal(getTaskResponse.statusCode, 200);
const getTaskPayload = getTaskResponse.json();
assert.equal(getTaskPayload.data.id, createTaskPayload.data.id);
assert.equal(getTaskPayload.data.drafts.length, 7);

const listTasksResponse = await app.inject({
  method: 'GET',
  url: `/api/ocr/tasks?profileId=${profileId}&status=needs_confirmation,ready_to_save`
});
assert.equal(listTasksResponse.statusCode, 200);
assert.ok(listTasksResponse.json().data.some((task: Row) => task.id === createTaskPayload.data.id));

const cancelTaskSeedResponse = await app.inject({
  method: 'POST',
  url: '/api/ocr/tasks',
  payload: {
    profileId,
    fixtureCaseIds: ['acth']
  }
});
assert.equal(cancelTaskSeedResponse.statusCode, 200);
const cancelTaskResponse = await app.inject({
  method: 'POST',
  url: `/api/ocr/tasks/${cancelTaskSeedResponse.json().data.id}/cancel`
});
assert.equal(cancelTaskResponse.statusCode, 200);
assert.equal(cancelTaskResponse.json().data.status, 'cancelled');
assert.ok(cancelTaskResponse.json().data.drafts.every((draft: Row) => draft.status === 'cancelled'));

const editableDraft = getTaskPayload.data.drafts[0];
const updatedDraftResponse = await app.inject({
  method: 'PATCH',
  url: `/api/ocr/tasks/${createTaskPayload.data.id}/drafts/${editableDraft.draftId}`,
  payload: {
    draft: {
      ...editableDraft,
      basicInfo: {
        ...editableDraft.basicInfo,
        hospital: '用户校准医院',
        hospitalSource: 'user_edited'
      },
      metrics: [
        ...(editableDraft.metrics || []),
        {
          ...(editableDraft.metrics || [])[0],
          metricName: 'ACTH low confidence duplicate',
          ocrConfidence: 0.1
        }
      ],
      conflicts: [{
        metricKey: 'acth',
        metricName: 'ACTH',
        candidates: []
      }]
    }
  }
});
assert.equal(updatedDraftResponse.statusCode, 200);
assert.equal(updatedDraftResponse.json().data.basicInfo.hospital, '用户校准医院');

const unresolvedSaveResponse = await app.inject({
  method: 'POST',
  url: '/api/reports/batch-create',
  payload: {
    profileId,
    ocrTaskId: createTaskPayload.data.id
  }
});
assert.equal(unresolvedSaveResponse.statusCode, 409);
assert.equal(unresolvedSaveResponse.json().error.code, 'UNRESOLVED_REPORT_CONFLICTS');
assert.equal(unresolvedSaveResponse.json().error.details.conflicts[0].draftId, editableDraft.draftId);

const resolveConflictResponse = await app.inject({
  method: 'PATCH',
  url: `/api/ocr/tasks/${createTaskPayload.data.id}/drafts/${editableDraft.draftId}/conflicts/acth`,
  payload: {
    selectedCandidateIndex: 0
  }
});
assert.equal(resolveConflictResponse.statusCode, 200);
assert.equal(resolveConflictResponse.json().data.status, 'resolved');

const afterResolveTaskResponse = await app.inject({
  method: 'GET',
  url: `/api/ocr/tasks/${createTaskPayload.data.id}`
});
assert.equal(afterResolveTaskResponse.statusCode, 200);
assert.equal(afterResolveTaskResponse.json().data.drafts[0].conflicts.length, 0);

const saveResponse = await app.inject({
  method: 'POST',
  url: '/api/reports/batch-create',
  payload: {
    profileId,
    ocrTaskId: createTaskPayload.data.id
  }
});
assert.equal(saveResponse.statusCode, 200);
const savePayload = saveResponse.json();
assert.equal(savePayload.data.reports.length, 7);
assert.equal(prisma.reports.filter((report) => !report.deletedAt).length, 7);
const editableReport = prisma.reports.find((report) => report.draftId === editableDraft.draftId);
assert.ok(editableReport);
assert.equal(prisma.reportMetricValues.filter((metric) => metric.reportId === editableReport.id && metric.metricKey === 'acth').length, 1);

const deleteProfileWithReportsResponse = await app.inject({
  method: 'DELETE',
  url: `/api/profiles/${profileId}`
});
assert.equal(deleteProfileWithReportsResponse.statusCode, 409);
assert.equal(deleteProfileWithReportsResponse.json().error.code, 'CONFLICT');

const repeatSaveResponse = await app.inject({
  method: 'POST',
  url: '/api/reports/batch-create',
  payload: {
    profileId,
    ocrTaskId: createTaskPayload.data.id
  }
});
assert.equal(repeatSaveResponse.statusCode, 200);
assert.equal(repeatSaveResponse.json().data.reports.length, 7);
assert.equal(prisma.reports.filter((report) => !report.deletedAt).length, 7);

const listReportsResponse = await app.inject({
  method: 'GET',
  url: `/api/profiles/${profileId}/reports`
});
assert.equal(listReportsResponse.statusCode, 200);
const reportsPayload = listReportsResponse.json();
assert.equal(reportsPayload.data.length, 7);
assert.ok(reportsPayload.data.some((report: Row) => report.modality === 'imaging' && report.analysisPolicy === 'view_only'));

const firstReportId = reportsPayload.data[0].id;
const reportDetailResponse = await app.inject({
  method: 'GET',
  url: `/api/reports/${firstReportId}`
});
assert.equal(reportDetailResponse.statusCode, 200);
const reportDetailPayload = reportDetailResponse.json();
assert.equal(reportDetailPayload.data.report.id, firstReportId);
assert.ok(Array.isArray(reportDetailPayload.data.groups));

const editableMetric = reportDetailPayload.data.report.metrics.find((metric: Row) => metric.valueType === 'quantitative');
if (editableMetric) {
  const manualMetricKey = `manual_backend_${Date.now()}`;
  const editedMetrics = reportDetailPayload.data.report.metrics.map((metric: Row) => (
    metric.id === editableMetric.id
      ? {
        ...metric,
        valueNumeric: Number(metric.refRangeHigh || 1) + 10,
        unit: 'edited-unit',
        isManuallyEdited: true
      }
      : metric
  )).concat([{
    metricKey: manualMetricKey,
    metricName: 'Manual smoke metric',
    originalMetricName: 'Manual smoke metric',
    category: 'other',
    categoryCn: 'Other',
    mappingStatus: 'pending',
    valueType: 'quantitative',
    valueNumeric: 12,
    unit: 'ng/mL',
    refRangeLow: null,
    refRangeHigh: null,
    tone: 'unknown',
    isManuallyEdited: true
  }]);
  const editReportResponse = await app.inject({
    method: 'PATCH',
    url: `/api/reports/${firstReportId}`,
    payload: {
      basicInfo: {
        hospital: '用户校准医院',
        reportDate: reportDetailPayload.data.report.reportDate,
        note: '用户已核对'
      },
      metrics: editedMetrics,
      findings: reportDetailPayload.data.report.findings,
      warnings: reportDetailPayload.data.report.warnings
    }
  });
  assert.equal(editReportResponse.statusCode, 200);
  const editReportPayload = editReportResponse.json();
  assert.equal(editReportPayload.data.report.hospital, '用户校准医院');
  assert.equal(editReportPayload.data.report.note, '用户已核对');
  assert.ok(editReportPayload.data.report.abnormalCount >= 1);
  assert.ok(editReportPayload.data.report.metrics.some((metric: Row) => metric.id === editableMetric.id && metric.isManuallyEdited));
  assert.ok(editReportPayload.data.report.metrics.some((metric: Row) => metric.id === editableMetric.id && metric.unit === 'edited-unit'));
  assert.ok(editReportPayload.data.report.metrics.some((metric: Row) => metric.metricKey === manualMetricKey && metric.unit === 'ng/mL'));
  const deleteManualMetricResponse = await app.inject({
    method: 'PATCH',
    url: `/api/reports/${firstReportId}`,
    payload: {
      basicInfo: {
        hospital: editReportPayload.data.report.hospital,
        reportDate: editReportPayload.data.report.reportDate,
        note: editReportPayload.data.report.note
      },
      metrics: editReportPayload.data.report.metrics.filter((metric: Row) => metric.metricKey !== manualMetricKey),
      findings: editReportPayload.data.report.findings,
      warnings: editReportPayload.data.report.warnings
    }
  });
  assert.equal(deleteManualMetricResponse.statusCode, 200);
  const deleteManualMetricPayload = deleteManualMetricResponse.json();
  assert.ok(!deleteManualMetricPayload.data.report.metrics.some((metric: Row) => metric.metricKey === manualMetricKey));
  if (reportDetailPayload.data.report.metrics.length > 1) {
    assert.ok(editReportPayload.data.report.metrics.some((metric: Row) => metric.id !== editableMetric.id && !metric.isManuallyEdited));
  }
}

const snapshotsResponse = await app.inject({
  method: 'GET',
  url: `/api/profiles/${profileId}/metrics/snapshots`
});
assert.equal(snapshotsResponse.statusCode, 200);
const snapshotsPayload = snapshotsResponse.json();
assert.ok(snapshotsPayload.data.some((snapshot: Row) => snapshot.metricKey === 'acth'));
assert.ok(!snapshotsPayload.data.some((snapshot: Row) => snapshot.lastReportId === reportsPayload.data.find((report: Row) => report.modality === 'imaging').id));

const historyResponse = await app.inject({
  method: 'GET',
  url: `/api/profiles/${profileId}/metrics/acth/history`
});
assert.equal(historyResponse.statusCode, 200);
const historyPayload = historyResponse.json();
assert.equal(historyPayload.data.metricKey, 'acth');
assert.ok(historyPayload.data.history.length >= 1);

const unknownPinResponse = await app.inject({
  method: 'PATCH',
  url: `/api/profiles/${profileId}/metrics/unknown_metric/pin`,
  payload: {
    isPinned: true
  }
});
assert.equal(unknownPinResponse.statusCode, 404);
assert.equal(unknownPinResponse.json().error.code, 'NOT_FOUND');

const pinResponse = await app.inject({
  method: 'PATCH',
  url: `/api/profiles/${profileId}/metrics/acth/pin`,
  payload: {
    isPinned: true
  }
});
assert.equal(pinResponse.statusCode, 200);
assert.equal(pinResponse.json().data.isPinned, true);

const secondTaskResponse = await app.inject({
  method: 'POST',
  url: '/api/ocr/tasks',
  payload: {
    profileId,
    fixtureCaseIds: ['acth', 'thyroid', 'cortisol', 'liver_function', 'uric_electrolyte_lipid', 'chest_ct_plain', 'abdomen_pelvis_ct_plain']
  }
});
assert.equal(secondTaskResponse.statusCode, 200);
const secondTaskPayload = secondTaskResponse.json();

const duplicateResponse = await app.inject({
  method: 'POST',
  url: '/api/reports/duplicate-check',
  payload: {
    profileId,
    ocrTaskId: secondTaskPayload.data.id
  }
});
assert.equal(duplicateResponse.statusCode, 200);
const duplicatePayload = duplicateResponse.json();
assert.equal(duplicatePayload.data.hasDuplicates, true);
assert.equal(duplicatePayload.data.candidates.length, 7);

const blockedSaveResponse = await app.inject({
  method: 'POST',
  url: '/api/reports/batch-create',
  payload: {
    profileId,
    ocrTaskId: secondTaskPayload.data.id
  }
});
assert.equal(blockedSaveResponse.statusCode, 409);
assert.equal(blockedSaveResponse.json().error.code, 'DUPLICATE_REPORT_REQUIRES_DECISION');

const invalidDuplicateDecisionResponse = await app.inject({
  method: 'POST',
  url: '/api/reports/batch-create',
  payload: {
    profileId,
    ocrTaskId: secondTaskPayload.data.id,
    duplicateDecisions: duplicatePayload.data.candidates.map((candidate: Row, index: number) => ({
      draftId: candidate.draftId,
      decision: index === 0 ? 'replace' : 'skip',
      existingReportId: index === 0 ? '00000000-0000-4000-8000-000000000000' : candidate.existingReportId
    }))
  }
});
assert.equal(invalidDuplicateDecisionResponse.statusCode, 400);
assert.equal(invalidDuplicateDecisionResponse.json().error.code, 'INVALID_DUPLICATE_DECISION');

const skipSaveResponse = await app.inject({
  method: 'POST',
  url: '/api/reports/batch-create',
  payload: {
    profileId,
    ocrTaskId: secondTaskPayload.data.id,
    duplicateDecisions: duplicatePayload.data.candidates.map((candidate: Row) => ({
      draftId: candidate.draftId,
      decision: 'skip',
      existingReportId: candidate.existingReportId
    }))
  }
});
assert.equal(skipSaveResponse.statusCode, 200);
assert.equal(skipSaveResponse.json().data.reports.length, 0);
assert.equal(prisma.reports.filter((report) => !report.deletedAt).length, 7);

const replaceTaskResponse = await app.inject({
  method: 'POST',
  url: '/api/ocr/tasks',
  payload: {
    profileId,
    fixtureCaseIds: ['acth']
  }
});
assert.equal(replaceTaskResponse.statusCode, 200);
const replaceDuplicateResponse = await app.inject({
  method: 'POST',
  url: '/api/reports/duplicate-check',
  payload: {
    profileId,
    ocrTaskId: replaceTaskResponse.json().data.id
  }
});
assert.equal(replaceDuplicateResponse.statusCode, 200);
const replaceCandidate = replaceDuplicateResponse.json().data.candidates[0];
const replaceSaveResponse = await app.inject({
  method: 'POST',
  url: '/api/reports/batch-create',
  payload: {
    profileId,
    ocrTaskId: replaceTaskResponse.json().data.id,
    duplicateDecisions: [{
      draftId: replaceCandidate.draftId,
      decision: 'replace',
      existingReportId: replaceCandidate.existingReportId
    }]
  }
});
assert.equal(replaceSaveResponse.statusCode, 200);
assert.equal(replaceSaveResponse.json().data.reports[0].action, 'replaced');
assert.equal(prisma.reports.filter((report) => !report.deletedAt).length, 7);

const scopedProfileResponse = await app.inject({
  method: 'POST',
  url: '/api/profiles',
  payload: {
    relation: 'scope',
    realName: 'Scoped Save',
    gender: '',
    diseaseType: '',
    primaryHospital: 'Union Hospital'
  }
});
assert.equal(scopedProfileResponse.statusCode, 200);
const scopedProfileId = scopedProfileResponse.json().data.id;
const scopedTaskResponse = await app.inject({
  method: 'POST',
  url: '/api/ocr/tasks',
  payload: {
    profileId: scopedProfileId,
    fixtureCaseIds: ['acth']
  }
});
assert.equal(scopedTaskResponse.statusCode, 200);
const scopedSaveResponse = await app.inject({
  method: 'POST',
  url: '/api/reports/batch-create',
  payload: {
    ocrTaskId: scopedTaskResponse.json().data.id
  }
});
assert.equal(scopedSaveResponse.statusCode, 200);
assert.equal(scopedSaveResponse.json().data.reports.length, 1);
assert.equal(prisma.reports.filter((report) => report.profileId === scopedProfileId && !report.deletedAt).length, 1);
assert.equal(prisma.reports.filter((report) => report.profileId === profileId && !report.deletedAt).length, 7);

const deleteReportResponse = await app.inject({
  method: 'DELETE',
  url: `/api/reports/${firstReportId}`
});
assert.equal(deleteReportResponse.statusCode, 200);
const afterDeleteListResponse = await app.inject({
  method: 'GET',
  url: `/api/profiles/${profileId}/reports`
});
assert.equal(afterDeleteListResponse.statusCode, 200);
assert.ok(!afterDeleteListResponse.json().data.some((report: Row) => report.id === firstReportId));

const createExportResponse = await app.inject({
  method: 'POST',
  url: `/api/profiles/${profileId}/exports`,
  payload: {
    includeReports: true,
    includeMetrics: true,
    includeRecheckPlans: true,
    format: 'json'
  }
});
assert.equal(createExportResponse.statusCode, 200);
const exportPayload = createExportResponse.json().data;
assert.equal(exportPayload.status, 'ready');
assert.ok(exportPayload.downloadUrl.includes(`/api/exports/${exportPayload.exportId}/download`));
const getExportResponse = await app.inject({
  method: 'GET',
  url: `/api/exports/${exportPayload.exportId}`
});
assert.equal(getExportResponse.statusCode, 200);
assert.equal(getExportResponse.json().data.fileName, exportPayload.fileName);
const downloadExportResponse = await app.inject({
  method: 'GET',
  url: exportPayload.downloadUrl
});
assert.equal(downloadExportResponse.statusCode, 200);
const downloadedExport = JSON.parse(downloadExportResponse.body);
assert.equal(downloadedExport.profile.id, profileId);
assert.ok(Array.isArray(downloadedExport.reports));
assert.ok(Array.isArray(downloadedExport.recheckPlans));

await app.close();

console.log('Backend smoke passed: auth, profile CRUD, upload sign/complete, recheck plans, OCR task list/cancel, fixture OCR draft edit, report save/read/edit/delete, duplicate check, and export routes');
