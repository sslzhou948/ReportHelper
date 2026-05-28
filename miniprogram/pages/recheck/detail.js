const { api } = require('../../utils/api');
const { daysBetween } = require('../../utils/date');

Page({
  data: {
    plan: null,
    days: 0,
    loading: false
  },
  onLoad(query) {
    this.planId = query.planId;
    this.load();
  },
  load() {
    this.setData({ loading: true });
    api.listRecheckPlans(getApp().getCurrentProfileId()).then((recheck) => {
      const plans = [recheck.nextPlan].concat(recheck.otherPlans || []).filter(Boolean);
      const plan = plans.find((item) => item.id === this.planId) || plans[0] || null;
      this.setData({
        plan,
        days: plan ? Math.max(0, daysBetween(new Date(), plan.date)) : 0,
        loading: false
      });
    }).catch(() => {
      this.setData({ loading: false });
      wx.showToast({ title: '\u52a0\u8f7d\u590d\u67e5\u8be6\u60c5\u5931\u8d25', icon: 'none' });
    });
  },
  goBack() {
    wx.navigateBack();
  },
  showPicker() {
    wx.showToast({ title: '\u7f16\u8f91\u5b57\u6bb5', icon: 'none' });
  },
  cancelPlan() {
    wx.showModal({
      title: '\u53d6\u6d88\u6b64\u6b21\u590d\u67e5\uff1f',
      content: '\u53d6\u6d88\u540e\u5c06\u4e0d\u518d\u51fa\u73b0\u5728\u5f85\u590d\u67e5\u5217\u8868\u3002',
      confirmColor: '#C07060',
      success: (res) => {
        if (!res.confirm || !this.data.plan) return;
        api.cancelRecheckPlan(this.data.plan.id, {
          idempotencyKey: `cancel_${this.data.plan.id}`
        }).then(() => {
          wx.showToast({ title: '\u5df2\u53d6\u6d88', icon: 'success' });
          setTimeout(() => wx.navigateBack(), 500);
        }).catch(() => {
          wx.showToast({ title: '\u53d6\u6d88\u5931\u8d25', icon: 'none' });
        });
      }
    });
  },
  deletePlan() {
    wx.showModal({
      title: '\u5220\u9664\u6b64\u8ba1\u5212\uff1f',
      content: '\u5220\u9664\u80fd\u529b\u5c06\u5728\u540e\u7eed\u7248\u672c\u63a5\u5165\uff0c\u5f53\u524d\u8bf7\u5148\u7528\u53d6\u6d88\u8ba1\u5212\u3002',
      confirmColor: '#C07060'
    });
  }
});
