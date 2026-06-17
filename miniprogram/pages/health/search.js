const { api } = require('../../utils/api');
const { formatMonthDay } = require('../../utils/date');
const { showApiErrorToast } = require('../../utils/error');
const { normalizeMetricCategory } = require('../../utils/metric-category');
const { isProfileRequiredError } = require('../../utils/profile');

const CATEGORY_ICONS = {
  blood_routine: '/assets/ui-refresh/health-icon-blood.png',
  liver_function: '/assets/ui-refresh/health-icon-liver.png',
  kidney_function: '/assets/ui-refresh/health-icon-kidney.png',
  tumor_marker: '/assets/ui-refresh/health-icon-tumor.png',
  tumor_markers: '/assets/ui-refresh/health-icon-tumor.png',
  kidney: '/assets/ui-refresh/health-icon-kidney.png'
};

function categoryIcon(metric) {
  const categoryInfo = normalizeMetricCategory(metric);
  return CATEGORY_ICONS[categoryInfo.category] || '/assets/ui-refresh/health-icon-default.png';
}

function isAbnormalTone(tone) {
  return ['high', 'low', 'abnormal', 'positive'].includes(String(tone || ''));
}

Page({
  data: {
    keyword: '',
    allMetrics: [],
    allReports: [],
    metrics: [],
    reports: [],
    loading: false
  },
  onLoad() {
    getApp().ensureCurrentProfileId(api).then((profileId) => {
      this.profileId = profileId;
      this.load();
    }).catch((error) => {
      if (isProfileRequiredError(error)) return;
      showApiErrorToast(error, '\u641c\u7d22\u6570\u636e\u52a0\u8f7d\u5931\u8d25');
    });
  },
  load() {
    if (!this.profileId) return;
    this.setData({ loading: true });
    Promise.all([
      api.listMetricSnapshots(this.profileId),
      api.listReports(this.profileId)
    ]).then(([metrics, reports]) => {
      const displayReports = reports.map((report) => ({
        ...report,
        displayDate: formatMonthDay(report.reportDate),
        hasAbnormalTone: isAbnormalTone(report.lastTone),
        abnormalText: Number(report.abnormalCount) > 0 ? `${Number(report.abnormalCount)} 异常` : '',
        icon: '/assets/ui-refresh/report-doc.png'
      }));
      this.setData({
        allMetrics: metrics.map((metric) => ({
          ...metric,
          icon: categoryIcon(metric),
          hasAbnormalTone: isAbnormalTone(metric.lastTone)
        })),
        allReports: displayReports,
        loading: false
      });
      this.search(this.data.keyword);
    }).catch((error) => {
      this.setData({ loading: false });
      showApiErrorToast(error, '\u641c\u7d22\u6570\u636e\u52a0\u8f7d\u5931\u8d25');
    });
  },
  onInput(event) {
    const keyword = event.detail.value.trim();
    this.search(keyword);
  },
  clearKeyword() {
    this.search('');
  },
  search(keyword) {
    const hit = (text) => !keyword || String(text || '').indexOf(keyword) >= 0;
    this.setData({
      keyword,
      metrics: this.data.allMetrics.filter((item) => hit(item.metricName) || hit(item.categoryCn)).slice(0, 8),
      reports: this.data.allReports.filter((item) => hit(item.type) || hit(item.hospital)).slice(0, 8),
      emptyResult: !!keyword
        && this.data.allMetrics.filter((item) => hit(item.metricName) || hit(item.categoryCn)).length === 0
        && this.data.allReports.filter((item) => hit(item.type) || hit(item.hospital)).length === 0
    });
  },
  goBack() {
    wx.navigateBack();
  },
  goMetric(event) {
    wx.navigateTo({ url: `/pages/health/metric-detail?metricKey=${event.currentTarget.dataset.key}` });
  },
  goReport(event) {
    wx.navigateTo({ url: `/pages/health/report-detail?id=${event.currentTarget.dataset.id}` });
  }
});
