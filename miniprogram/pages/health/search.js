const { api } = require('../../utils/api');
const { addDays, formatDate, formatMonthDay } = require('../../utils/date');
const { showApiErrorToast } = require('../../utils/error');

function isAbnormalTone(tone) {
  return ['high', 'low', 'abnormal', 'positive'].includes(String(tone || ''));
}

function defaultRangeQuery() {
  const today = formatDate(new Date());
  return {
    since: addDays(today, -29),
    until: today
  };
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
    this.profileId = getApp().getCurrentProfileId();
    this.load();
  },
  load() {
    this.setData({ loading: true });
    const query = defaultRangeQuery();
    Promise.all([
      api.listMetricSnapshots(this.profileId, query),
      api.listReports(this.profileId, query)
    ]).then(([metrics, reports]) => {
      const displayReports = reports.map((report) => ({
        ...report,
        displayDate: formatMonthDay(report.reportDate),
        hasAbnormalTone: isAbnormalTone(report.lastTone)
      }));
      this.setData({
        allMetrics: metrics.map((metric) => ({
          ...metric,
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
  search(keyword) {
    const hit = (text) => !keyword || String(text || '').indexOf(keyword) >= 0;
    this.setData({
      keyword,
      metrics: this.data.allMetrics.filter((item) => hit(item.metricName) || hit(item.categoryCn)).slice(0, 8),
      reports: this.data.allReports.filter((item) => hit(item.type) || hit(item.hospital)).slice(0, 8)
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
