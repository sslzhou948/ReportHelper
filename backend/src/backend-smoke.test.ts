import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { buildApp } from './app.js';
import type { Env } from './config/env.js';
import { resolveWxLoginSession } from './routes/auth.js';

type Row = Record<string, any>;

function now() {
  return new Date();
}

function offsetDateOnly(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

class MemoryPrisma {
  users: Row[] = [];
  profiles: Row[] = [];
  ocrTasks: Row[] = [];
  ocrTaskPhotos: Row[] = [];
  drafts: Row[] = [];
  reports: Row[] = [];
  reportPhotos: Row[] = [];
  reportMetricValues: Row[] = [];
  userMetricSnapshots: Row[] = [];
  recheckPlans: Row[] = [];
  recheckTodos: Row[] = [];

  user = {
    findUnique: async ({ where }: any) => {
      return this.users.find((item) => {
        if (where.id && item.id !== where.id) return false;
        if (where.wxOpenid && item.wxOpenid !== where.wxOpenid) return false;
        return true;
      }) || null;
    },
    upsert: async ({ where, create }: any) => {
      let user = this.users.find((item) => item.wxOpenid === where.wxOpenid);
      if (!user) {
        const createdUser = {
          id: randomUUID(),
          ...create,
          createdAt: now(),
          updatedAt: now()
        };
        this.users.push(createdUser);
        user = createdUser;
      }
      return user;
    }
  };

  profile = {
    findFirst: async ({ where }: any) => {
      return this.profiles.find((profile) => {
        if (where.id && profile.id !== where.id) return false;
        if (where.userId && profile.userId !== where.userId) return false;
        if (where.deletedAt === null && profile.deletedAt) return false;
        return true;
      }) || null;
    },
    findMany: async ({ where }: any) => {
      return this.profiles.filter((profile) => {
        if (where.userId && profile.userId !== where.userId) return false;
        if (where.deletedAt === null && profile.deletedAt) return false;
        return true;
      });
    },
    create: async ({ data }: any) => {
      const profile = {
        id: randomUUID(),
        ...data,
        createdAt: now(),
        updatedAt: now(),
        deletedAt: null
      };
      this.profiles.push(profile);
      return profile;
    },
    update: async ({ where, data }: any) => {
      const profile = this.profiles.find((item) => item.id === where.id);
      if (!profile) throw new Error('profile not found');
      Object.assign(profile, data, { updatedAt: now() });
      return profile;
    }
  };

  ocrTask = {
    create: async ({ data }: any) => {
      const task = {
        id: randomUUID(),
        ...data,
        createdAt: now(),
        updatedAt: now()
      };
      this.ocrTasks.push(task);
      return task;
    },
    findUniqueOrThrow: async ({ where, include }: any) => {
      const task = this.ocrTasks.find((item) => item.id === where.id);
      if (!task) throw new Error('task not found');
      return this.withTaskIncludes(task, include);
    },
    findFirst: async ({ where, include }: any) => {
      const task = this.ocrTasks.find((item) => {
        if (where.id && item.id !== where.id) return false;
        if (where.profileId && item.profileId !== where.profileId) return false;
        if (where.userId && item.userId !== where.userId) return false;
        if (where.idempotencyKey && item.idempotencyKey !== where.idempotencyKey) return false;
        if (where.status?.in && !where.status.in.includes(item.status)) return false;
        if (where.profile) {
          const profile = this.profiles.find((profileRow) => profileRow.id === item.profileId);
          if (!profile || profile.userId !== where.profile.userId) return false;
          if (where.profile.deletedAt === null && profile.deletedAt) return false;
        }
        return true;
      });
      return task ? this.withTaskIncludes(task, include) : null;
    },
    findMany: async ({ where, include, orderBy }: any) => {
      const rows = this.ocrTasks.filter((item) => {
        if (where.profileId && item.profileId !== where.profileId) return false;
        if (where.status?.in && !where.status.in.includes(item.status)) return false;
        if (where.profile) {
          const profile = this.profiles.find((profileRow) => profileRow.id === item.profileId);
          if (!profile || profile.userId !== where.profile.userId) return false;
          if (where.profile.deletedAt === null && profile.deletedAt) return false;
        }
        return true;
      });
      if (orderBy?.createdAt === 'desc') {
        rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      }
      return rows.map((task) => this.withTaskIncludes(task, include));
    },
    update: async ({ where, data, include }: any) => {
      const task = this.ocrTasks.find((item) => item.id === where.id);
      if (!task) throw new Error('task not found');
      Object.assign(task, data, { updatedAt: now() });
      return this.withTaskIncludes(task, include);
    }
  };

  recognizedReportDraft = {
    createMany: async ({ data }: any) => {
      for (const item of data) {
        this.drafts.push({
          id: randomUUID(),
          ...item,
          version: 1,
          createdAt: now(),
          updatedAt: now()
        });
      }
      return { count: data.length };
    },
    findMany: async ({ where, orderBy }: any) => {
      const rows = this.drafts.filter((draft) => {
        if (where.ocrTaskId && draft.ocrTaskId !== where.ocrTaskId) return false;
        if (where.profileId && draft.profileId !== where.profileId) return false;
        return true;
      });
      if (orderBy?.createdAt === 'asc') {
        return rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      }
      return rows;
    },
    update: async ({ where, data }: any) => {
      const draft = this.drafts.find((item) => item.id === where.id);
      if (!draft) throw new Error('draft not found');
      const nextData = { ...data };
      if (nextData.version?.increment) {
        nextData.version = (draft.version || 1) + nextData.version.increment;
      }
      Object.assign(draft, nextData, { updatedAt: now() });
      return draft;
    },
    updateMany: async ({ where, data }: any) => {
      const rows = this.drafts.filter((draft) => {
        if (where.ocrTaskId && draft.ocrTaskId !== where.ocrTaskId) return false;
        return true;
      });
      rows.forEach((draft) => Object.assign(draft, data, { updatedAt: now() }));
      return { count: rows.length };
    }
  };

  report = {
    findMany: async ({ where, include, orderBy, take }: any) => {
      const rows = this.reports.filter((report) => {
        if (where.profileId && report.profileId !== where.profileId) return false;
        if (where.ocrTaskId && report.ocrTaskId !== where.ocrTaskId) return false;
        if (where.deletedAt === null && report.deletedAt) return false;
        if (where.analysisPolicy?.not && report.analysisPolicy === where.analysisPolicy.not) return false;
        return true;
      });
      if (Array.isArray(orderBy)) {
        rows.sort((a, b) => {
          for (const item of orderBy) {
            const key = Object.keys(item)[0];
            const direction = item[key];
            const left = a[key] instanceof Date ? a[key].getTime() : a[key];
            const right = b[key] instanceof Date ? b[key].getTime() : b[key];
            if (left === right) continue;
            return direction === 'desc' ? (right > left ? 1 : -1) : (left > right ? 1 : -1);
          }
          return 0;
        });
      }
      const limitedRows = take ? rows.slice(0, take) : rows;
      if (!include?.metrics) return limitedRows;
      return limitedRows.map((report) => ({
        ...report,
        metrics: this.reportMetricValues.filter((metric) => metric.reportId === report.id)
      }));
    },
    findFirst: async ({ where, include }: any) => {
      const report = this.reports.find((item) => {
        if (where.id && item.id !== where.id) return false;
        if (where.deletedAt === null && item.deletedAt) return false;
        if (where.profile) {
          const profile = this.profiles.find((profileRow) => profileRow.id === item.profileId);
          if (!profile || profile.userId !== where.profile.userId) return false;
          if (where.profile.deletedAt === null && profile.deletedAt) return false;
        }
        return true;
      });
      if (!report) return null;
      if (!include?.metrics) return report;
      return {
        ...report,
        metrics: this.reportMetricValues.filter((metric) => metric.reportId === report.id)
      };
    },
    create: async ({ data }: any) => {
      const report = {
        id: randomUUID(),
        ...data,
        createdAt: now(),
        updatedAt: now(),
        deletedAt: null
      };
      this.reports.push(report);
      return report;
    },
    update: async ({ where, data }: any) => {
      const report = this.reports.find((item) => item.id === where.id);
      if (!report) throw new Error('report not found');
      Object.assign(report, data, { updatedAt: now() });
      return report;
    }
  };

  reportMetricValue = {
    createMany: async ({ data }: any) => {
      for (const item of data) {
        this.reportMetricValues.push({
          id: randomUUID(),
          ...item,
          createdAt: now(),
          updatedAt: now()
        });
      }
      return { count: data.length };
    },
    update: async ({ where, data }: any) => {
      const metric = this.reportMetricValues.find((item) => item.id === where.id);
      if (!metric) throw new Error('metric not found');
      Object.assign(metric, data, { updatedAt: now() });
      return metric;
    }
  };

  reportPhoto = {
    create: async ({ data }: any) => {
      const photo = {
        id: randomUUID(),
        ...data,
        createdAt: now(),
        updatedAt: now()
      };
      this.reportPhotos.push(photo);
      return photo;
    },
    findMany: async ({ where }: any) => {
      return this.reportPhotos.filter((photo) => {
        if (where.id?.in && !where.id.in.includes(photo.id)) return false;
        if (where.profileId && photo.profileId !== where.profileId) return false;
        if (where.userId && photo.userId !== where.userId) return false;
        if (where.status?.in && !where.status.in.includes(photo.status)) return false;
        return true;
      });
    },
    updateMany: async ({ where, data }: any) => {
      const rows = this.reportPhotos.filter((photo) => {
        if (where.id?.in && !where.id.in.includes(photo.id)) return false;
        if (where.profileId && photo.profileId !== where.profileId) return false;
        if (where.userId && photo.userId !== where.userId) return false;
        if (where.status?.in && !where.status.in.includes(photo.status)) return false;
        return true;
      });
      rows.forEach((photo) => Object.assign(photo, data, { updatedAt: now() }));
      return { count: rows.length };
    },
    update: async ({ where, data }: any) => {
      const photo = this.reportPhotos.find((item) => item.id === where.id);
      if (!photo) throw new Error('report photo not found');
      Object.assign(photo, data, { updatedAt: now() });
      return photo;
    }
  };

  ocrTaskPhoto = {
    createMany: async ({ data }: any) => {
      for (const item of data) {
        this.ocrTaskPhotos.push({
          id: randomUUID(),
          ...item,
          createdAt: now(),
          updatedAt: now()
        });
      }
      return { count: data.length };
    }
  };

  userMetricSnapshot = {
    findMany: async ({ where, select }: any) => {
      const rows = this.userMetricSnapshots.filter((snapshot) => {
        if (where.profileId && snapshot.profileId !== where.profileId) return false;
        if (where.isPinned !== undefined && snapshot.isPinned !== where.isPinned) return false;
        return true;
      });
      if (!select) return rows;
      return rows.map((row) => Object.keys(select).reduce((acc: Row, key) => {
        acc[key] = row[key];
        return acc;
      }, {}));
    },
    upsert: async ({ where, update, create }: any) => {
      const key = where.profileId_metricKey;
      let snapshot = this.userMetricSnapshots.find((item) => item.profileId === key.profileId && item.metricKey === key.metricKey);
      if (snapshot) {
        Object.assign(snapshot, update, { updatedAt: now() });
      } else {
        snapshot = {
          id: randomUUID(),
          ...create,
          createdAt: now(),
          updatedAt: now()
        };
        this.userMetricSnapshots.push(snapshot);
      }
      return snapshot;
    }
  };

  recheckPlan = {
    findMany: async ({ where, include, orderBy }: any) => {
      const rows = this.recheckPlans.filter((plan) => {
        if (where.profileId && plan.profileId !== where.profileId) return false;
        if (where.deletedAt === null && plan.deletedAt) return false;
        return true;
      });
      if (orderBy?.date === 'asc') rows.sort((a, b) => a.date.getTime() - b.date.getTime());
      if (!include?.todos) return rows;
      return rows.map((plan) => ({
        ...plan,
        todos: this.recheckTodos
          .filter((todo) => todo.planId === plan.id)
          .sort((a, b) => a.sortOrder - b.sortOrder)
      }));
    },
    findFirst: async ({ where, include }: any) => {
      const plan = this.recheckPlans.find((item) => {
        if (where.id && item.id !== where.id) return false;
        if (where.deletedAt === null && item.deletedAt) return false;
        if (where.profile) {
          const profile = this.profiles.find((profileRow) => profileRow.id === item.profileId);
          if (!profile || profile.userId !== where.profile.userId) return false;
          if (where.profile.deletedAt === null && profile.deletedAt) return false;
        }
        return true;
      });
      if (!plan) return null;
      if (!include?.todos) return plan;
      return {
        ...plan,
        todos: this.recheckTodos
          .filter((todo) => todo.planId === plan.id)
          .sort((a, b) => a.sortOrder - b.sortOrder)
      };
    },
    create: async ({ data, include }: any) => {
      const plan = {
        id: randomUUID(),
        profileId: data.profileId,
        type: data.type,
        date: data.date,
        timeOfDay: data.timeOfDay,
        hospital: data.hospital,
        department: data.department,
        doctor: data.doctor,
        status: data.status || 'pending',
        reminderConfig: data.reminderConfig,
        createdAt: now(),
        updatedAt: now(),
        deletedAt: null
      };
      this.recheckPlans.push(plan);
      for (const todoData of data.todos?.create || []) {
        this.recheckTodos.push({
          id: randomUUID(),
          planId: plan.id,
          ...todoData,
          createdAt: now(),
          updatedAt: now()
        });
      }
      if (!include?.todos) return plan;
      return {
        ...plan,
        todos: this.recheckTodos
          .filter((todo) => todo.planId === plan.id)
          .sort((a, b) => a.sortOrder - b.sortOrder)
      };
    },
    update: async ({ where, data, include }: any) => {
      const plan = this.recheckPlans.find((item) => item.id === where.id);
      if (!plan) throw new Error('recheck plan not found');
      Object.assign(plan, data, { updatedAt: now() });
      if (!include?.todos) return plan;
      return {
        ...plan,
        todos: this.recheckTodos
          .filter((todo) => todo.planId === plan.id)
          .sort((a, b) => a.sortOrder - b.sortOrder)
      };
    }
  };

  recheckTodo = {
    update: async ({ where, data }: any) => {
      const todo = this.recheckTodos.find((item) => item.id === where.id);
      if (!todo) throw new Error('recheck todo not found');
      Object.assign(todo, data, { updatedAt: now() });
      return todo;
    }
  };

  async $transaction<T>(fn: (tx: this) => Promise<T>): Promise<T> {
    return fn(this);
  }

  withTaskIncludes(task: Row, include: any) {
    if (!include?.drafts) return task;
    return {
      ...task,
      drafts: this.drafts
        .filter((draft) => draft.ocrTaskId === task.id)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    };
  }
}

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
assert.ok(prodProfilesResponse.json().data.length >= 1);
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

const listRecheckResponse = await app.inject({
  method: 'GET',
  url: `/api/profiles/${profileId}/recheck-plans`
});
assert.equal(listRecheckResponse.statusCode, 200);
assert.equal(listRecheckResponse.json().data.nextPlan.id, recheckPlan.id);

const updateTodoResponse = await app.inject({
  method: 'PATCH',
  url: `/api/recheck-plans/${recheckPlan.id}/todos/${recheckPlan.todos[0].id}`,
  payload: { isDone: true }
});
assert.equal(updateTodoResponse.statusCode, 200);
assert.equal(updateTodoResponse.json().data.todos[0].isDone, true);

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
  const editedMetrics = reportDetailPayload.data.report.metrics.map((metric: Row) => (
    metric.id === editableMetric.id
      ? {
        ...metric,
        valueNumeric: Number(metric.refRangeHigh || 1) + 10,
        isManuallyEdited: true
      }
      : metric
  ));
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
  if (editReportPayload.data.report.metrics.length > 1) {
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

await app.close();

console.log('Backend smoke passed: auth, profile CRUD, upload sign/complete, recheck plans, OCR task list/cancel, fixture OCR draft edit, report save/read/edit/delete, and duplicate check routes');
