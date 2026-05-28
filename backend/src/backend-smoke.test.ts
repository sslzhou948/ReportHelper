import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { buildApp } from './app.js';
import type { Env } from './config/env.js';

type Row = Record<string, any>;

function now() {
  return new Date();
}

class MemoryPrisma {
  users: Row[] = [];
  profiles: Row[] = [];
  ocrTasks: Row[] = [];
  drafts: Row[] = [];
  reports: Row[] = [];
  reportMetricValues: Row[] = [];

  user = {
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
        if (where.profile) {
          const profile = this.profiles.find((profileRow) => profileRow.id === item.profileId);
          if (!profile || profile.userId !== where.profile.userId) return false;
          if (where.profile.deletedAt === null && profile.deletedAt) return false;
        }
        return true;
      });
      return task ? this.withTaskIncludes(task, include) : null;
    },
    update: async ({ where, data }: any) => {
      const task = this.ocrTasks.find((item) => item.id === where.id);
      if (!task) throw new Error('task not found');
      Object.assign(task, data, { updatedAt: now() });
      return task;
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
    }
  };

  report = {
    findMany: async ({ where, include }: any) => {
      const rows = this.reports.filter((report) => {
        if (where.profileId && report.profileId !== where.profileId) return false;
        if (where.deletedAt === null && report.deletedAt) return false;
        return true;
      });
      if (!include?.metrics) return rows;
      return rows.map((report) => ({
        ...report,
        metrics: this.reportMetricValues.filter((metric) => metric.reportId === report.id)
      }));
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

const profilesResponse = await app.inject({
  method: 'GET',
  url: '/api/profiles'
});
assert.equal(profilesResponse.statusCode, 200);
const profilesPayload = profilesResponse.json();
assert.equal(profilesPayload.data.length, 1);
const profileId = profilesPayload.data[0].id;

const createTaskResponse = await app.inject({
  method: 'POST',
  url: '/api/ocr/tasks',
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

const getTaskResponse = await app.inject({
  method: 'GET',
  url: `/api/ocr/tasks/${createTaskPayload.data.id}`
});
assert.equal(getTaskResponse.statusCode, 200);
const getTaskPayload = getTaskResponse.json();
assert.equal(getTaskPayload.data.id, createTaskPayload.data.id);
assert.equal(getTaskPayload.data.drafts.length, 7);

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

await app.close();

console.log('Backend smoke passed: fixture OCR, duplicate check, and batch save routes');
