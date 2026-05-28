const { api } = require('../../utils/api');
const { showApiErrorToast } = require('../../utils/error');

Page({
  data: {
    exportReady: false,
    loading: false,
    exportResult: null
  },

  goBack() {
    wx.navigateBack();
  },

  exportData() {
    if (this.data.loading) return;
    const profileId = getApp().getCurrentProfileId();
    this.setData({ loading: true });
    api.createExport(profileId, {
      includeReports: true,
      includeMetrics: true,
      includeRecheckPlans: true,
      format: 'json'
    }, {
      idempotencyKey: `export_${profileId}_${Date.now()}`
    }).then((result) => {
      if (result && result.status === 'ready') return result;
      return api.getExport(result.exportId);
    }).then((result) => {
      this.setData({
        exportReady: result && result.status === 'ready',
        exportResult: result || null,
        loading: false
      });
      wx.showToast({ title: result && result.status === 'ready' ? '导出已生成' : '导出处理中', icon: 'none' });
    }).catch((error) => {
      this.setData({ loading: false });
      showApiErrorToast(error, '导出失败，请重试');
    });
  },

  copyDownloadUrl() {
    const url = this.data.exportResult && this.data.exportResult.downloadUrl;
    if (!url) return;
    if (!wx.setClipboardData) {
      wx.showToast({ title: url, icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: url,
      success: () => wx.showToast({ title: '下载链接已复制', icon: 'success' })
    });
  }
});
