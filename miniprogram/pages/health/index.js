const { api } = require('../../utils/api');
const { addDays, formatDate, formatMonthDay } = require('../../utils/date');
const { showApiErrorToast } = require('../../utils/error');
const {
  beginSlowLoading,
  cancelSlowLoading: cancelPageLoading,
  finishSlowLoading
} = require('../../utils/loading');
const { bindNetworkStatus, refreshNetworkStatus } = require('../../utils/network');
const { isProfileRequiredError } = require('../../utils/profile');
const { normalizeMetricCategory } = require('../../utils/metric-category');

const FILTER_ALL = '\u5168\u90e8';
const FILTER_ABNORMAL = '\u5f02\u5e38\u6307\u6807';
const DEFAULT_CHIPS = [
  FILTER_ALL,
  FILTER_ABNORMAL,
  '\u8840\u5e38\u89c4',
  '\u809d\u529f\u80fd',
  '\u80be\u529f\u80fd',
  '\u80bf\u7624\u6807\u5fd7\u7269'
];
const DEFAULT_RANGE = '30d';
const RANGE_OPTIONS = [
  { key: 'all', label: '全部' },
  { key: '30d', label: '近30天', days: 30 },
  { key: '90d', label: '近90天', days: 90 },
  { key: '1y', label: '近1年', days: 365 }
];
const DEFAULT_LAYOUT = {
  homeBannerPaddingTop: 172,
  homeBannerMinHeight: 312
};
const CATEGORY_ICONS = {
  blood_routine: '/assets/ui-refresh/health-icon-blood.png',
  liver_function: '/assets/ui-refresh/health-icon-liver.png',
  kidney_function: '/assets/ui-refresh/health-icon-kidney.png',
  tumor_marker: '/assets/ui-refresh/health-icon-tumor.png',
  tumor_markers: '/assets/ui-refresh/health-icon-tumor.png'
};

function isAbnormalTone(tone) {
  return ['high', 'low', 'abnormal', 'positive'].includes(String(tone || ''));
}

function categoryIcon(category) {
  return CATEGORY_ICONS[category] || '/assets/ui-refresh/health-icon-default.png';
}

function displayMetricValue(item) {
  if (item.valueType === 'qualitative') return item.lastValueQualitative || '-';
  if (item.valueType === 'text') return item.lastValueText || item.lastValueQualitative || '-';
  return item.lastValueNumeric === undefined || item.lastValueNumeric === null ? '-' : String(item.lastValueNumeric);
}

function formatLatestDate(date) {
  return date ? formatMonthDay(date) : '暂无';
}

function decorateMetric(item) {
  return {
    ...item,
    displayValue: displayMetricValue(item),
    isAbnormal: isAbnormalTone(item.lastTone)
  };
}

function groupMetrics(metrics) {
  return Object.values(metrics.reduce((acc, item) => {
    const categoryInfo = normalizeMetricCategory(item);
    const key = categoryInfo.category;
    if (!acc[key]) {
      acc[key] = {
        category: key,
        categoryCn: categoryInfo.categoryCn,
        abnormalCount: 0,
        latestDate: item.lastDate,
        items: []
      };
    }
    acc[key].items.push(decorateMetric({
      ...item,
      category: categoryInfo.category,
      categoryCn: categoryInfo.categoryCn
    }));
    if (isAbnormalTone(item.lastTone)) acc[key].abnormalCount += 1;
    if (new Date(item.lastDate) > new Date(acc[key].latestDate)) acc[key].latestDate = item.lastDate;
    return acc;
  }, {})).map((group) => ({
    ...group,
    icon: categoryIcon(group.category),
    displayLatestDate: formatLatestDate(group.latestDate)
  }));
}

function filterMetrics(metrics, filter) {
  if (filter === FILTER_ABNORMAL) return metrics.filter((item) => isAbnormalTone(item.lastTone));
  if (filter === FILTER_ALL) return metrics;
  return metrics.filter((item) => normalizeMetricCategory(item).categoryCn === filter);
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
      dayText: report.reportDate.slice(8, 10),
      monthText: `${Number(report.reportDate.slice(5, 7))}\u6708`,
      statusText: Number(report.abnormalCount) > 0 ? `${Number(report.abnormalCount)} 项异常` : '全部正常',
      statusTone: Number(report.abnormalCount) > 0 ? 'high' : 'primary'
    });
    return acc;
  }, {}));
}

function rangeQuery(rangeKey) {
  const option = RANGE_OPTIONS.find((item) => item.key === rangeKey)
    || RANGE_OPTIONS.find((item) => item.key === DEFAULT_RANGE)
    || RANGE_OPTIONS[0];
  const today = formatDate(new Date());
  if (!option.days) return {};
  return {
    since: addDays(today, -(option.days - 1)),
    until: today
  };
}

function rangeLabel(rangeKey) {
  const option = RANGE_OPTIONS.find((item) => item.key === rangeKey)
    || RANGE_OPTIONS.find((item) => item.key === DEFAULT_RANGE)
    || RANGE_OPTIONS[0];
  return option.label;
}

Page({
  data: {
    view: 'metric',
    range: DEFAULT_RANGE,
    rangeLabel: rangeLabel(DEFAULT_RANGE),
    rangeOptions: RANGE_OPTIONS,
    filter: FILTER_ALL,
    metricCount: 0,
    reportCount: 0,
    abnormalCount: 0,
    reportAbnormalTotal: 0,
    metrics: [],
    groupedMetrics: [],
    reportsByMonth: [],
    chips: DEFAULT_CHIPS,
    layout: DEFAULT_LAYOUT,
    networkOffline: false,
    loading: false,
    loadingSlow: false
  },

  onLoad(query = {}) {
    this.setData({
      view: query.view || 'metric',
      layout: getApp().getLayout ? getApp().getLayout() : DEFAULT_LAYOUT
    });
  },

  onShow() {
    bindNetworkStatus(this);
    this.setData({ layout: getApp().getLayout ? getApp().getLayout() : DEFAULT_LAYOUT });
    const savedRange = wx.getStorageSync('healthDataRange');
    if (savedRange && savedRange !== this.data.range) {
      this.setData({ range: savedRange, rangeLabel: rangeLabel(savedRange) });
    }
    const defaultView = wx.getStorageSync('healthDefaultView');
    if (defaultView) {
      wx.removeStorageSync('healthDefaultView');
      this.setData({ view: defaultView });
    }
    const savedToast = wx.getStorageSync('lastSavedReportToast');
    if (savedToast) {
      wx.removeStorageSync('lastSavedReportToast');
      setTimeout(() => wx.showToast({ title: savedToast, icon: 'success' }), 300);
    }
    this.load(savedRange || this.data.range, this.data.filter);
  },

  load(rangeKey = this.data.range, filterKey = this.data.filter) {
    const app = getApp();
    const loadingToken = beginSlowLoading(this);
    const requestId = (this.loadRequestId || 0) + 1;
    this.loadRequestId = requestId;
    const query = rangeQuery(rangeKey);
    app.ensureCurrentProfileId(api).then((profileId) => Promise.all([
      api.listMetricSnapshots(profileId, query),
      api.listReports(profileId, query)
    ])).then(([metrics, reports]) => {
      if (requestId !== this.loadRequestId) return;
      if (!finishSlowLoading(this, loadingToken)) return;
      this.setData({
        range: rangeKey,
        rangeLabel: rangeLabel(rangeKey),
        filter: filterKey,
        metrics,
        metricCount: metrics.length,
        reportCount: reports.length,
        abnormalCount: metrics.filter((item) => isAbnormalTone(item.lastTone)).length,
        reportAbnormalTotal: reports.reduce((sum, report) => sum + (Number(report.abnormalCount) || 0), 0),
        groupedMetrics: groupMetrics(filterMetrics(metrics, filterKey)),
        reportsByMonth: buildReportsByMonth(reports)
      });
    }).catch((error) => {
      if (requestId !== this.loadRequestId) return;
      if (!finishSlowLoading(this, loadingToken)) return;
      if (isProfileRequiredError(error)) return;
      showApiErrorToast(error, '\u52a0\u8f7d\u5065\u5eb7\u6570\u636e\u5931\u8d25');
    });
  },

  switchView(event) {
    this.setData({ view: event.currentTarget.dataset.view });
  },

  switchRange(event) {
    const range = event.currentTarget.dataset.range;
    this.setData({
      range,
      rangeLabel: rangeLabel(range)
    });
    wx.setStorageSync('healthDataRange', range);
    this.load(range, this.data.filter);
  },

  switchFilter(event) {
    const filter = event.currentTarget.dataset.filter;
    this.setData({ filter });
    this.load(this.data.range, filter);
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
    const metricKey = (event.detail && event.detail.metricKey) || event.currentTarget.dataset.key;
    wx.navigateTo({ url: `/pages/health/metric-detail?metricKey=${metricKey}&range=${this.data.range}` });
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
