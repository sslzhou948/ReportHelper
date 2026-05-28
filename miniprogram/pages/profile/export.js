Page({
  goBack() {
    wx.navigateBack();
  },
  exportData() {
    wx.showToast({ title: '导出任务已创建', icon: 'success' });
  }
});

