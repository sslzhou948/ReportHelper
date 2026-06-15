const { api } = require('../../utils/api');
const { addDays, formatDate, formatMonthDay, daysBetween } = require('../../utils/date');
const { showApiErrorToast } = require('../../utils/error');
const {
  beginSlowLoading,
  cancelSlowLoading: cancelPageLoading,
  finishSlowLoading
} = require('../../utils/loading');
const { bindNetworkStatus, refreshNetworkStatus } = require('../../utils/network');
const { isProfileRequiredError } = require('../../utils/profile');

const ACTIVE_OCR_STATUSES = ['queued', 'processing', 'needs_confirmation', 'ready_to_save', 'failed'];
const HOME_RECENT_REPORT_LIMIT = 6;
const HOME_ALERT_METRIC_LIMIT = 5;
const HOME_SPARKLINE_RANGE_DAYS = 365;
const HOME_SPARKLINE_POINT_LIMIT = 6;
const HOME_SPARKLINE = {
  width: 186,
  height: 44,
  left: 12,
  right: 12,
  top: 9,
  bottom: 9
};

function isAbnormalTone(tone) {
  return ['high', 'low', 'abnormal', 'positive'].includes(String(tone || ''));
}

function recentAlertQuery() {
  const today = formatDate(new Date());
  return {
    since: addDays(today, -29),
    until: today
  };
}

function homeSparklineQuery() {
  const today = formatDate(new Date());
  return {
    since: addDays(today, -(HOME_SPARKLINE_RANGE_DAYS - 1)),
    until: today
  };
}

function toNumberOrNull(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function pointTone(row, fallbackTone) {
  return row.tone || row.lastTone || fallbackTone || 'ok';
}

function buildHomeSparkline(history, snapshot) {
  const rows = (history || [])
    .filter((row) => row.valueType !== 'qualitative' && row.valueType !== 'text')
    .map((row) => ({
      ...row,
      numericValue: toNumberOrNull(row.valueNumeric)
    }))
    .filter((row) => row.numericValue !== null)
    .sort((left, right) => new Date(left.reportDate || 0) - new Date(right.reportDate || 0))
    .slice(-HOME_SPARKLINE_POINT_LIMIT);

  if (rows.length < 2) {
    const fallbackValue = toNumberOrNull(snapshot && snapshot.lastValueNumeric);
    if (fallbackValue === null) {
      return { tone: snapshot && snapshot.lastTone || 'ok', segments: [], points: [] };
    }
    rows.splice(0, rows.length, {
      reportDate: `${snapshot && snapshot.lastDate || ''}-start`,
      numericValue: fallbackValue,
      tone: snapshot && snapshot.lastTone
    }, {
      reportDate: snapshot && snapshot.lastDate || 'latest',
      numericValue: fallbackValue,
      tone: snapshot && snapshot.lastTone
    });
  }

  const values = rows.map((row) => row.numericValue);
  let min = Math.min(...values);
  let max = Math.max(...values);
  const padding = Math.max((max - min) * 0.22, max === min ? Math.max(Math.abs(max) * 0.1, 1) : 0.2);
  min -= padding;
  max += padding;

  const span = max - min || 1;
  const plotWidth = HOME_SPARKLINE.width - HOME_SPARKLINE.left - HOME_SPARKLINE.right;
  const plotHeight = HOME_SPARKLINE.height - HOME_SPARKLINE.top - HOME_SPARKLINE.bottom;
  const fallbackTone = snapshot && snapshot.lastTone || 'ok';
  const points = rows.map((row, index) => {
    const x = rows.length > 1
      ? HOME_SPARKLINE.left + plotWidth * index / (rows.length - 1)
      : HOME_SPARKLINE.left + plotWidth;
    const y = HOME_SPARKLINE.top + (max - row.numericValue) / span * plotHeight;
    return {
      id: `${index}`,
      x: Number(x.toFixed(1)),
      y: Number(y.toFixed(1)),
      tone: pointTone(row, fallbackTone),
      isLatest: index === rows.length - 1
    };
  });

  const segments = [];
  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1];
    const to = points[i];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    segments.push({
      id: `${i}`,
      left: from.x,
      top: from.y,
      width: Number(Math.sqrt(dx * dx + dy * dy).toFixed(1)),
      angle: Number((Math.atan2(dy, dx) * 180 / Math.PI).toFixed(1)),
      tone: to.tone
    });
  }

  const latest = points[points.length - 1];
  return {
    tone: latest ? latest.tone : fallbackTone,
    segments,
    points: latest ? [{
      id: 'latest',
      left: latest.x,
      top: latest.y,
      tone: latest.tone
    }] : []
  };
}

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

function reportDisplayHospital(report) {
  const label = String(report.hospital || '待确认医院').trim();
  return label.length > 4 ? `${label.slice(0, 3)}…` : label;
}

function reportFullType(report) {
  const metrics = report.metrics || [];
  if (String(report.typeKey || '').startsWith('manual_') && metrics[0] && metrics[0].metricName) {
    return metrics[0].metricName;
  }
  return report.canonicalTypeName || report.type || '\u68c0\u67e5';
}

function formatAlertSummary(metrics) {
  const names = (metrics || []).map((item) => item.metricName).filter(Boolean);
  if (names.length <= 3) return names.join('、');
  return `${names.slice(0, 3).join('、')}等 ${names.length} 项`;
}

function getGreetingText(now = new Date()) {
  const hour = now.getHours();
  if (hour < 6) return '\u591c\u6df1\u4e86\uff0c\u613f\u60a8\u65e9\u65e5\u5eb7\u590d';
  if (hour < 11) return '\u65e9\u4e0a\u597d\uff0c\u613f\u60a8\u65e9\u65e5\u5eb7\u590d';
  if (hour < 14) return '\u4e2d\u5348\u597d\uff0c\u613f\u60a8\u65e9\u65e5\u5eb7\u590d';
  if (hour < 18) return '\u4e0b\u5348\u597d\uff0c\u613f\u60a8\u65e9\u65e5\u5eb7\u590d';
  return '\u665a\u4e0a\u597d\uff0c\u613f\u60a8\u65e9\u65e5\u5eb7\u590d';
}

Page({
  data: {
    profile: null,
    profiles: [],
    reports: [],
    pinnedMetrics: [],
    alertMetrics: [],
    alertSummaryText: '',
    nextPlan: null,
    daysToNext: 0,
    layout: {},
    greetingText: getGreetingText(),
    switcherVisible: false,
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
    this.setData({ layout: app.getLayout(), greetingText: getGreetingText() });

    app.ensureCurrentProfileId(api).then((profileId) => Promise.all([
      api.getProfile(profileId),
      api.getProfiles(),
      api.listReports(profileId),
      api.listMetricSnapshots(profileId),
      api.listMetricSnapshots(profileId, recentAlertQuery()),
      api.listRecheckPlans(profileId),
      this.loadPendingOcrTask(profileId)
    ]).then((results) => ({ profileId, results }))).then(({ profileId, results }) => {
      const [profile, profiles, reports, snapshots, recentSnapshots, recheck, pendingOcrTask] = results;
      const pinnedMetricRows = snapshots.filter((item) => item.isPinned).slice(0, 8);
      const sparklineQuery = homeSparklineQuery();
      return Promise.all(pinnedMetricRows.map((metric) => (
        api.getMetricHistory(profileId, metric.metricKey, sparklineQuery)
          .then((result) => result && result.history || [])
          .catch(() => [])
      ))).then((sparklineRows) => ({
        profile,
        profiles,
        reports,
        recentSnapshots,
        recheck,
        pendingOcrTask,
        pinnedMetrics: pinnedMetricRows.map((metric, index) => ({
          ...metric,
          sparkline: buildHomeSparkline(sparklineRows[index], metric)
        }))
      }));
    }).then(({ profile, profiles, reports, recentSnapshots, recheck, pendingOcrTask, pinnedMetrics }) => {
      if (!finishSlowLoading(this, loadingToken)) return;
      const nextPlan = recheck.nextPlan || null;
      const alertMetrics = recentSnapshots.filter((item) => isAbnormalTone(item.lastTone)).slice(0, HOME_ALERT_METRIC_LIMIT);
      this.setData({
        profile,
        profiles,
        reports: reports.slice(0, HOME_RECENT_REPORT_LIMIT).map((report) => ({
          ...report,
          displayType: reportDisplayType(report),
          displayHospital: reportDisplayHospital(report),
          fullType: reportFullType(report),
          fullHospital: report.hospital || '待确认医院',
          displayDate: formatMonthDay(report.reportDate)
        })),
        pinnedMetrics,
        alertMetrics,
        alertSummaryText: formatAlertSummary(alertMetrics),
        nextPlan,
        daysToNext: nextPlan ? Math.max(0, daysBetween(new Date(), nextPlan.date)) : 0,
        pendingOcrTask
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

  goOcrTask() {
    const currentTask = this.data.pendingOcrTask || {};
    if (currentTask.taskId) {
      wx.navigateTo({ url: `/pages/upload/confirm?taskId=${currentTask.taskId}` });
      return;
    }

    const currentProfileId = getApp().getCurrentProfileId();
    const pending = readPendingOcrTasks();
    const task = sortPendingOcrTasks(pending.filter((item) => item.profileId === currentProfileId))[0];
    if (!task) {
      wx.showToast({ title: '识别任务已更新，请刷新首页', icon: 'none' });
      this.load();
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
