const { api } = require('../../utils/api');
const { formatMonthDay } = require('../../utils/date');
const { showApiErrorToast } = require('../../utils/error');
const {
  beginSlowLoading,
  cancelSlowLoading: cancelPageLoading,
  finishSlowLoading
} = require('../../utils/loading');
const { bindNetworkStatus, refreshNetworkStatus } = require('../../utils/network');
const { isProfileRequiredError } = require('../../utils/profile');

const FILTER_ALL = '\u5168\u90e8';
const FILTER_ABNORMAL = '\u5f02\u5e38';
const DEFAULT_CHIPS = [
  FILTER_ALL,
  FILTER_ABNORMAL,
  '\u8840\u5e38\u89c4',
  '\u809d\u529f\u80fd',
  '\u80be\u529f\u80fd',
  '\u80bf\u7624\u6807\u5fd7\u7269'
];

function groupMetrics(metrics) {
  return Object.values(metrics.reduce((acc, item) => {
    const key = item.category;
    if (!acc[key]) {
      acc[key] = {
        category: key,
        categoryCn: item.categoryCn,
        abnormalCount: 0,
        latestDate: item.lastDate,
        items: []
      };
    }
    acc[key].items.push(item);
    if (item.lastTone !== 'ok') acc[key].abnormalCount += 1;
    if (new Date(item.lastDate) > new Date(acc[key].latestDate)) acc[key].latestDate = item.lastDate;
    return acc;
  }, {}));
}

function filterMetrics(metrics, filter) {
  if (filter === FILTER_ABNORMAL) return metrics.filter((item) => item.lastTone !== 'ok');
  if (filter === FILTER_ALL) return metrics;
  return metrics.filter((item) => item.categoryCn === filter);
}

function buildReportsByMonth(reports) {
  return Object.values(reports.reduce((acc, report) => {
    const month = report.reportDate.slice(0, 7);
    if (!acc[month]) {
      acc[month] = {
        month,
        title: `${month.slice(0, 4)}\u5e74${Number(month.slice(5))}\u6708`,
        items: []
      };
    }
    acc[month].items.push({
      ...report,
      displayDate: formatMonthDay(report.reportDate),
      dayText: String(Number(report.reportDate.slice(8, 10))),
      monthText: `${Number(report.reportDate.slice(5, 7))}\u6708`
    });
    return acc;
  }, {}));
}

Page({
  data: {
    view: 'metric',
    filter: FILTER_ALL,
    metricCount: 0,
    reportCount: 0,
    abnormalCount: 0,
    metrics: [],
    groupedMetrics: [],
    reportsByMonth: [],
    chips: DEFAULT_CHIPS,
    networkOffline: false,
    loading: false,
    loadingSlow: false
  },

  onLoad(query = {}) {
    this.setData({ view: query.view || 'metric' });
  },

  onShow() {
    bindNetworkStatus(this);
    const defaultView = wx.getStorageSync('healthDefaultView');
    if (defaultView) {
      wx.removeStorageSync('healthDefaultView');
      this.setData({ view: defaultView });
    }
    this.load();
  },

  load() {
    const app = getApp();
    const loadingToken = beginSlowLoading(this);
    app.ensureCurrentProfileId(api).then((profileId) => Promise.all([
      api.listMetricSnapshots(profileId),
      api.listReports(profileId)
    ])).then(([metrics, reports]) => {
      if (!finishSlowLoading(this, loadingToken)) return;
      this.setData({
        metrics,
        metricCount: metrics.length,
        reportCount: reports.length,
        abnormalCount: metrics.filter((item) => item.lastTone !== 'ok').length,
        groupedMetrics: groupMetrics(filterMetrics(metrics, this.data.filter)),
        reportsByMonth: buildReportsByMonth(reports)
      });
    }).catch((error) => {
      if (!finishSlowLoading(this, loadingToken)) return;
      if (isProfileRequiredError(error)) return;
      showApiErrorToast(error, '\u52a0\u8f7d\u5065\u5eb7\u6570\u636e\u5931\u8d25');
    });
  },

  switchView(event) {
    this.setData({ view: event.currentTarget.dataset.view });
  },

  switchFilter(event) {
    const filter = event.currentTarget.dataset.filter;
    this.setData({
      filter,
      groupedMetrics: groupMetrics(filterMetrics(this.data.metrics, filter))
    });
  },

  goUpload() {
    wx.navigateTo({ url: '/pages/upload/pick' });
  },

  goRecord() {
    wx.navigateTo({ url: '/pages/record/new' });
  },

  goSearch() {
    wx.navigateTo({ url: '/pages/health/search' });
  },

  goMetric(event) {
    const metricKey = event.detail.metricKey || event.currentTarget.dataset.key;
    wx.navigateTo({ url: `/pages/health/metric-detail?metricKey=${metricKey}` });
  },

  goReport(event) {
    wx.navigateTo({ url: `/pages/health/report-detail?id=${event.currentTarget.dataset.id}` });
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
