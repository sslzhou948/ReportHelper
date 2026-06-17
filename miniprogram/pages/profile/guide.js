Page({
  data: {
    faqList: [
      {
        id: 'accuracy',
        title: '如何提高AI识别准确率',
        detail: '优先上传完整、清晰、端正的报告截图或照片。纸质报告尽量避免反光、折痕和遮挡。'
      },
      {
        id: 'merge',
        title: '多页报告怎么合并',
        detail: '同一份报告的多张图片可以在上传页用合并标记归为一份报告，系统会按一份报告识别。'
      },
      {
        id: 'abnormal',
        title: '异常标记怎么看',
        detail: '异常标记来自报告参考范围和结构化结果整理，用于提醒复核，不代表诊断结论。'
      },
      {
        id: 'storage',
        title: '数据会保存在哪里',
        detail: '报告和结构化指标会保存在当前病例夹中，用于归档、趋势查看和后续导出。'
      }
    ]
  },
  goBack() {
    wx.navigateBack();
  },
  openFaq(event) {
    const id = event.currentTarget.dataset.id;
    const item = this.data.faqList.find((faq) => faq.id === id);
    if (!item) return;
    wx.showModal({
      title: item.title,
      content: item.detail,
      showCancel: false,
      confirmText: '知道了',
      confirmColor: '#5A7A5A'
    });
  }
});
