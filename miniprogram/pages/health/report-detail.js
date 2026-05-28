const { api } = require('../../utils/api');
const { showApiErrorToast } = require('../../utils/error');

Page({
  data: {
    report: null,
    groups: [],
    findings: [],
    loading: false
  },
  onLoad(query) {
    this.reportId = query.id;
    this.load();
  },
  onShow() {
    if (this.reportId) this.load();
  },
  load() {
    this.setData({ loading: true });
    api.getReportDetail(this.reportId).then(({ report, groups }) => {
      this.setData({ report, groups, findings: (report && report.findings) || [], loading: false });
    }).catch((error) => {
      this.setData({ loading: false });
      showApiErrorToast(error, '\u52a0\u8f7d\u62a5\u544a\u5931\u8d25');
    });
  },
  goBack() {
    wx.navigateBack();
  },
  goMetric(event) {
    wx.navigateTo({ url: `/pages/health/metric-detail?metricKey=${event.currentTarget.dataset.key}` });
  },
  showEdit() {
    if (!this.data.report) return;
    wx.navigateTo({ url: `/pages/upload/edit-detail?reportId=${this.reportId}&editing=1` });
  },
  showDelete() {
    wx.showModal({
      title: '\u5220\u9664\u62a5\u544a\uff1f',
      content: '\u62a5\u544a\u4f1a\u8f6f\u5220\u9664\uff0c30 \u5929\u540e\u7269\u7406\u5220\u9664\u3002',
      confirmText: '\u5220\u9664',
      confirmColor: '#C07060',
      success: (res) => {
        if (!res.confirm) return;
        api.deleteReport(this.reportId, {
          idempotencyKey: `delete_report_${this.reportId}`
        }).then(() => {
          wx.showToast({ title: '\u5df2\u5220\u9664', icon: 'success' });
          setTimeout(() => wx.navigateBack(), 500);
        }).catch((error) => {
          showApiErrorToast(error, '\u5220\u9664\u5931\u8d25');
        });
      }
    });
  }
});
