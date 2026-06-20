let versionTapCount = 0;
let versionTapTimer = null;

Page({
  goBack() {
    wx.navigateBack();
  },
  tapVersion() {
    versionTapCount += 1;
    if (versionTapTimer) clearTimeout(versionTapTimer);
    versionTapTimer = setTimeout(() => {
      versionTapCount = 0;
      versionTapTimer = null;
    }, 1600);
    if (versionTapCount < 5) return;
    versionTapCount = 0;
    if (versionTapTimer) {
      clearTimeout(versionTapTimer);
      versionTapTimer = null;
    }
    wx.navigateTo({ url: '/pages/profile/ai-config' });
  },
  onUnload() {
    versionTapCount = 0;
    if (versionTapTimer) {
      clearTimeout(versionTapTimer);
      versionTapTimer = null;
    }
  }
});
