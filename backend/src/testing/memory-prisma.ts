import { randomUUID } from 'node:crypto';

type Row = Record<string, any>;

function now() {
  return new Date();
}

function offsetDateOnly(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export class MemoryPrisma {
  users: Row[] = [];
  profiles: Row[] = [];
  ocrTasks: Row[] = [];
  ocrTaskPhotos: Row[] = [];
  drafts: Row[] = [];
  reports: Row[] = [];
  reportPhotos: Row[] = [];
  reportMetricValues: Row[] = [];
  userMetricSnapshots: Row[] = [];
  manualEntryTemplates: Row[] = [];
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
    },
    updateMany: async ({ where, data }: any) => {
      const rows = this.ocrTasks.filter((item) => {
        if (where.id && item.id !== where.id) return false;
        if (where.profileId && item.profileId !== where.profileId) return false;
        if (where.userId && item.userId !== where.userId) return false;
        if (typeof where.status === 'string' && item.status !== where.status) return false;
        if (where.status?.in && !where.status.in.includes(item.status)) return false;
        if (where.updatedAt && item.updatedAt.getTime() !== new Date(where.updatedAt).getTime()) return false;
        return true;
      });
      rows.forEach((task) => Object.assign(task, data, { updatedAt: now() }));
      return { count: rows.length };
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
    },
    updateMany: async ({ where, data }: any) => {
      const rows = this.reports.filter((item) => {
        if (where.id && item.id !== where.id) return false;
        if (where.profileId && item.profileId !== where.profileId) return false;
        if (where.deletedAt === null && item.deletedAt) return false;
        return true;
      });
      rows.forEach((report) => Object.assign(report, data, { updatedAt: now() }));
      return { count: rows.length };
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
    },
    deleteMany: async ({ where }: any) => {
      const before = this.reportMetricValues.length;
      this.reportMetricValues = this.reportMetricValues.filter((metric) => {
        if (where.reportId && metric.reportId !== where.reportId) return true;
        if (where.id?.notIn && where.id.notIn.includes(metric.id)) return true;
        return false;
      });
      return { count: before - this.reportMetricValues.length };
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
    },
    findMany: async ({ where, orderBy }: any) => {
      const rows = this.ocrTaskPhotos.filter((photo) => {
        if (where.ocrTaskId && photo.ocrTaskId !== where.ocrTaskId) return false;
        if (where.photoId?.in && !where.photoId.in.includes(photo.photoId)) return false;
        return true;
      });
      if (Array.isArray(orderBy)) {
        rows.sort((a, b) => {
          for (const item of orderBy) {
            const key = Object.keys(item)[0];
            const direction = item[key];
            if (a[key] === b[key]) continue;
            return direction === 'desc'
              ? (a[key] > b[key] ? -1 : 1)
              : (a[key] > b[key] ? 1 : -1);
          }
          return 0;
        });
      }
      return rows;
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
        this.userMetricSnapshots.push(snapshot as Row);
      }
      return snapshot as Row;
    }
  };

  manualEntryTemplate = {
    findMany: async ({ where, orderBy }: any) => {
      const rows = this.manualEntryTemplates.filter((template) => {
        if (where.profileId && template.profileId !== where.profileId) return false;
        if (where.userId && template.userId !== where.userId) return false;
        if (where.status?.not && template.status === where.status.not) return false;
        if (where.status && typeof where.status === 'string' && template.status !== where.status) return false;
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
      return rows;
    },
    findFirst: async ({ where }: any) => {
      return this.manualEntryTemplates.find((template) => {
        if (where.id && template.id !== where.id) return false;
        if (where.profileId && template.profileId !== where.profileId) return false;
        if (where.userId && template.userId !== where.userId) return false;
        if (where.metricKey && template.metricKey !== where.metricKey) return false;
        if (where.status?.not && template.status === where.status.not) return false;
        return true;
      }) || null;
    },
    create: async ({ data }: any) => {
      const template = {
        id: randomUUID(),
        ...data,
        createdAt: now(),
        updatedAt: now()
      };
      this.manualEntryTemplates.push(template);
      return template;
    },
    update: async ({ where, data }: any) => {
      const template = this.manualEntryTemplates.find((item) => item.id === where.id);
      if (!template) throw new Error('manual entry template not found');
      Object.assign(template, data, { updatedAt: now() });
      return template;
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
    create: async ({ data }: any) => {
      const todo = {
        id: randomUUID(),
        ...data,
        createdAt: now(),
        updatedAt: now()
      };
      this.recheckTodos.push(todo);
      return todo;
    },
    update: async ({ where, data }: any) => {
      const todo = this.recheckTodos.find((item) => item.id === where.id);
      if (!todo) throw new Error('recheck todo not found');
      Object.assign(todo, data, { updatedAt: now() });
      return todo;
    },
    delete: async ({ where }: any) => {
      const before = this.recheckTodos.length;
      this.recheckTodos = this.recheckTodos.filter((item) => item.id !== where.id);
      if (before === this.recheckTodos.length) throw new Error('recheck todo not found');
      return { id: where.id };
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

export function createMemoryPrisma() {
  return new MemoryPrisma();
}
