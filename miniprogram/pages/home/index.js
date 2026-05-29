const { api } = require('../../utils/api');
const { formatMonthDay, daysBetween } = require('../../utils/date');
const { showApiErrorToast } = require('../../utils/error');
const {
  beginSlowLoading,
  cancelSlowLoading: cancelPageLoading,
  finishSlowLoading
} = require('../../utils/loading');
const { bindNetworkStatus, refreshNetworkStatus } = require('../../utils/network');
const { isProfileRequiredError } = require('../../utils/profile');

const ACTIVE_OCR_STATUSES = ['queued', 'processing', 'needs_confirmation', 'ready_to_save', 'failed'];

function readPendingOcrTasks() {
  const pending = wx.getStorageSync('pendingOcrTasks');
  return Array.isArray(pending) ? pending : [];
}

function toPendingOcrTask(task, profileId) {
  return {
    taskId: task.taskId || task.id,
    profileId: task.profileId || profileId,
    status: task.status || 'processing',
    photoCount: Number(task.photoCount) || 0,
    reportCount: Number(task.reportCount) || (task.drafts ? task.drafts.length : 0),
    errorCode: task.errorCode || '',
    errorMessage: task.errorMessage || '',
    source: task.source || '',
    createdAt: task.createdAt || Date.now()
  };
}

function isActiveOcrTask(task) {
  return task && task.taskId && ACTIVE_OCR_STATUSES.includes(task.status || 'processing');
}

function taskPriority(task) {
  const status = task && task.status;
  if (['needs_confirmation', 'ready_to_save'].includes(status)) return 0;
  if (status === 'failed') return 1;
  return 2;
}

function sortPendingOcrTasks(tasks) {
  return (tasks || []).slice().sort((left, right) => {
    const priority = taskPriority(left) - taskPriority(right);
    if (priority !== 0) return priority;
    return Number(right.createdAt || 0) - Number(left.createdAt || 0);
  });
}

function writePendingOcrTasks(profileId, tasks) {
  const others = readPendingOcrTasks().filter((task) => task.profileId !== profileId);
  const activeTasks = sortPendingOcrTasks((tasks || []).map((task) => toPendingOcrTask(task, profileId)).filter(isActiveOcrTask));
  wx.setStorageSync('pendingOcrTasks', activeTasks.concat(others));
  return activeTasks;
}

function formatPendingOcrTask(task) {
  if (!task) return null;
  const photoCount = task.photoCount || 0;
  const reportCount = task.reportCount || 0;
  const status = task.status || 'processing';
  const isSlow = ['queued', 'processing'].includes(status) && task.createdAt && Date.now() - task.createdAt > 60000;
  if (status === 'failed') {
    return {
      ...task,
      title: '\u8bc6\u522b\u4efb\u52a1\u5931\u8d25',
      detail: task.errorMessage || '\u53ef\u8fdb\u5165\u4efb\u52a1\u9875\u91cd\u8bd5\uff0c\u4e0d\u4f1a\u4e22\u5931\u5df2\u4e0a\u4f20\u7684\u56fe\u7247\u3002',
      actionText: '\u5904\u7406 \u203a',
      statusLabel: '\u9700\u5904\u7406',
      tone: 'warning'
    };
  }
  if (['needs_confirmation', 'ready_to_save'].includes(status)) {
    return {
      ...task,
      title: `\u5df2\u8bc6\u522b\u51fa ${reportCount} \u4efd\u62a5\u544a`,
      detail: '\u8bf7\u786e\u8ba4\u57fa\u672c\u4fe1\u606f\u548c\u6307\u6807\u540e\u518d\u5f52\u6863\u3002',
      actionText: '\u786e\u8ba4 \u203a',
      statusLabel: `${reportCount || 1} \u4efd\u5f85\u786e\u8ba4`,
      tone: 'ready'
    };
  }
  return {
    ...task,
    title: `\u6b63\u5728\u8bc6\u522b ${photoCount} \u5f20\u62a5\u544a`,
    detail: isSlow
      ? '\u8bc6\u522b\u65f6\u95f4\u8f83\u957f\uff0c\u53ef\u70b9\u51fb\u67e5\u770b\u4efb\u52a1\u72b6\u6001\u3002'
      : '\u8bc6\u522b\u5b8c\u6210\u540e\u4f1a\u63d0\u793a\u786e\u8ba4\uff0c\u60a8\u53ef\u7ee7\u7eed\u4f7f\u7528\u5176\u4ed6\u529f\u80fd\u3002',
    actionText: '\u67e5\u770b \u203a',
    statusLabel: reportCount ? `\u8bc6\u522b\u4e2d ${reportCount}` : '\u8bc6\u522b\u4e2d',
    tone: isSlow ? 'warning' : 'processing'
  };
}

function formatPendingOcrSummary(tasks) {
  const activeTasks = sortPendingOcrTasks(tasks).filter(isActiveOcrTask);
  const firstTask = activeTasks[0] || null;
  const summary = formatPendingOcrTask(firstTask);
  if (!summary || activeTasks.length <= 1) return summary;
  const readyCount = activeTasks.filter((task) => ['needs_confirmation', 'ready_to_save'].includes(task.status)).length;
  const failedCount = activeTasks.filter((task) => task.status === 'failed').length;
  const countText = `\u5171 ${activeTasks.length} \u4e2a\u8bc6\u522b\u4efb\u52a1`;
  return {
    ...summary,
    taskCount: activeTasks.length,
    title: readyCount
      ? `${readyCount} \u4e2a\u4efb\u52a1\u5f85\u786e\u8ba4`
      : (failedCount ? `${failedCount} \u4e2a\u4efb\u52a1\u9700\u5904\u7406` : `\u8bc6\u522b\u4e2d\uff08${activeTasks.length} \u4e2a\u4efb\u52a1\uff09`),
    detail: `${countText}\uff0c\u4f18\u5148\u5904\u7406\uff1a${summary.title}`,
    actionText: '\u67e5\u770b \u203a',
    statusLabel: readyCount ? `${readyCount} \u4e2a\u5f85\u786e\u8ba4` : `${activeTasks.length} \u4e2a\u4efb\u52a1`,
    tone: readyCount || failedCount ? 'warning' : summary.tone
  };
}

function reportDisplayType(report) {
  const metrics = report.metrics || [];
  const label = String(
    (String(report.typeKey || '').startsWith('manual_') && metrics[0] && metrics[0].metricName)
      ? metrics[0].metricName
      : (report.canonicalTypeName || report.type || '\u68c0\u67e5')
  ).trim();
  return label.length > 4 ? `${label.slice(0, 3)}…` : label;
}

function reportFullType(report) {
  const metrics = report.metrics || [];
  if (String(report.typeKey || '').startsWith('manual_') && metrics[0] && metrics[0].metricName) {
    return metrics[0].metricName;
  }
  return report.canonicalTypeName || report.type || '\u68c0\u67e5';
}

Page({
  data: {
    profile: null,
    profiles: [],
    reports: [],
    pinnedMetrics: [],
    alertMetrics: [],
    nextPlan: null,
    daysToNext: 0,
    layout: {},
    switcherVisible: false,
    recognizing: false,
    pendingOcrTask: null,
    networkOffline: false,
    loading: false,
    loadingSlow: false
  },

  onShow() {
    bindNetworkStatus(this);
    this.load();
  },

  load() {
    const app = getApp();
    const loadingToken = beginSlowLoading(this);
    this.setData({ layout: app.getLayout() });

    app.ensureCurrentProfileId(api).then((profileId) => Promise.all([
      api.getProfile(profileId),
      api.getProfiles(),
      api.listReports(profileId),
      api.listMetricSnapshots(profileId),
      api.listRecheckPlans(profileId),
      this.loadPendingOcrTask(profileId)
    ])).then(([profile, profiles, reports, snapshots, recheck, pendingOcrTask]) => {
      if (!finishSlowLoading(this, loadingToken)) return;
      const nextPlan = recheck.nextPlan || null;
      this.setData({
        profile,
        profiles,
        reports: reports.slice(0, 3).map((report) => ({
          ...report,
          displayType: reportDisplayType(report),
          fullType: reportFullType(report),
          displayDate: formatMonthDay(report.reportDate)
        })),
        pinnedMetrics: snapshots.filter((item) => item.isPinned).slice(0, 8),
        alertMetrics: snapshots.filter((item) => item.lastTone !== 'ok').slice(0, 3),
        nextPlan,
        daysToNext: nextPlan ? Math.max(0, daysBetween(new Date(), nextPlan.date)) : 0,
        pendingOcrTask,
        recognizing: pendingOcrTask ? (this.data.recognizing || ['ready', 'warning'].includes(pendingOcrTask.tone)) : false
      });
    }).catch((error) => {
      if (!finishSlowLoading(this, loadingToken)) return;
      if (isProfileRequiredError(error)) return;
      showApiErrorToast(error, '\u52a0\u8f7d\u9996\u9875\u6570\u636e\u5931\u8d25');
    });
  },

  loadPendingOcrTask(profileId) {
    const localTasks = readPendingOcrTasks().filter((task) => task.profileId === profileId);
    return api.listOcrTasks({
      profileId,
      status: ACTIVE_OCR_STATUSES.join(',')
    }).then((tasks) => {
      const syncedTasks = writePendingOcrTasks(profileId, tasks);
      if (syncedTasks.length === 0 && localTasks.length > 0 && (wx.getStorageSync('uploadPhotos') || []).length > 0) {
        const activeLocalTasks = writePendingOcrTasks(profileId, localTasks);
        return formatPendingOcrSummary(activeLocalTasks);
      }
      return formatPendingOcrSummary(syncedTasks);
    }).catch(() => {
      const activeTasks = sortPendingOcrTasks(localTasks.map((task) => toPendingOcrTask(task, profileId)).filter(isActiveOcrTask));
      return formatPendingOcrSummary(activeTasks);
    });
  },

  openSwitcher() {
    this.setData({ switcherVisible: true });
  },

  closeSwitcher() {
    this.setData({ switcherVisible: false });
  },

  switchProfile(event) {
    getApp().setCurrentProfileId(event.detail.profileId);
    this.setData({ switcherVisible: false });
    this.load();
  },

  addProfile() {
    wx.navigateTo({ url: '/pages/profile/add' });
  },

  editProfile(event) {
    wx.navigateTo({ url: `/pages/profile/archive?profileId=${event.detail.profileId}` });
  },

  goUpload() {
    wx.navigateTo({ url: '/pages/upload/pick' });
  },

  goRecord() {
    wx.navigateTo({ url: '/pages/record/new' });
  },

  goRecheck() {
    wx.switchTab({ url: '/pages/recheck/index' });
  },

  goMetric(event) {
    wx.navigateTo({ url: `/pages/health/metric-detail?metricKey=${event.currentTarget.dataset.key}` });
  },

  goPinnedManage() {
    wx.navigateTo({ url: '/pages/health/pinned-manage' });
  },

  goReport(event) {
    wx.navigateTo({ url: `/pages/health/report-detail?id=${event.currentTarget.dataset.id}` });
  },

  goHealthTime() {
    wx.setStorageSync('healthDefaultView', 'time');
    wx.switchTab({ url: '/pages/health/index' });
  },

  showRecognizing() {
    this.setData({ recognizing: !this.data.recognizing });
  },

  goOcrTask() {
    const pending = readPendingOcrTasks();
    const currentProfileId = getApp().getCurrentProfileId();
    const task = sortPendingOcrTasks(pending.filter((item) => item.profileId === currentProfileId))[0]
      || sortPendingOcrTasks(pending)[0];
    if (!task) {
      wx.navigateTo({ url: '/pages/upload/pick' });
      return;
    }
    wx.navigateTo({ url: `/pages/upload/confirm?taskId=${task.taskId}` });
  },

  retryAfterNetwork() {
    refreshNetworkStatus(this).then(() => this.load());
  },

  retrySlowLoading() {
    this.load();
  },

  cancelSlowLoading() {
    cancelPageLoading(this);
  }
});
