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
  userMetricSnapshots: Row[] = [];

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
    findMany: async ({ where, include, orderBy, take }: any) => {
      const rows = this.reports.filter((report) => {
        if (where.profileId && report.profileId !== where.profileId) return false;
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

console.log('Backend smoke passed: fixture OCR, report save/read/edit/delete, and duplicate check routes');
