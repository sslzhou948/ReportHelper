Page({
  data: {
    exportReady: false
  },

  goBack() {
    wx.navigateBack();
  },

  exportData() {
    wx.showModal({
      title: '导出暂未开放',
      content: '数据导出需要后端生成文件和安全下载链接。当前版本不会创建假导出任务，后续接入后会在这里开放。',
      showCancel: false,
      confirmText: '知道了'
    });
  }
});
