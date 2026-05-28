const { api } = require('../../utils/api');
const { formatMonthDay } = require('../../utils/date');
const { showApiErrorToast } = require('../../utils/error');

Page({
  data: {
    reports: [],
    loading: false
  },
  onLoad() {
    this.load();
  },
  load() {
    const profileId = getApp().getCurrentProfileId();
    this.setData({ loading: true });
    api.listReports(profileId).then((reports) => {
      this.setData({
        reports: reports.map((report) => ({
          ...report,
          displayDate: formatMonthDay(report.reportDate)
        })),
        loading: false
      });
    }).catch((error) => {
      this.setData({ loading: false });
      showApiErrorToast(error, '加载报告失败');
    });
  },
  goBack() {
    wx.navigateBack();
  },
  goReport(event) {
    wx.navigateTo({ url: `/pages/health/report-detail?id=${event.currentTarget.dataset.id}` });
  }
});
