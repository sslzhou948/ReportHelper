Page({
  data: {
    text: '',
    contact: ''
  },
  goBack() {
    wx.navigateBack();
  },
  onText(event) {
    this.setData({ text: event.detail.value });
  },
  onContact(event) {
    this.setData({ contact: event.detail.value });
  },
  submit() {
    wx.showToast({ title: '感谢反馈', icon: 'success' });
  }
});

