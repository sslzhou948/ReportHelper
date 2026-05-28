const { api } = require('../../utils/api');
const { daysBetween } = require('../../utils/date');
const { showApiErrorFeedback } = require('../../utils/error');
const { todayString } = require('../../utils/recheck');

function daysToPlan(plan) {
  return plan ? Math.max(0, daysBetween(new Date(), plan.date)) : 0;
}

function buildReminderRows(plan) {
  const config = (plan && plan.reminderConfig) || {};
  const advanceDays = Array.isArray(config.advanceDays) ? config.advanceDays : [3, 1, 0];
  const enabled = new Set(advanceDays.map(Number));
  return [
    { day: 3, label: '\u63d0\u524d 3 \u5929', checked: enabled.has(3) },
    { day: 1, label: '\u63d0\u524d 1 \u5929', checked: enabled.has(1) },
    { day: 0, label: '\u5f53\u5929\u4e0a\u5348', checked: enabled.has(0) }
  ];
}

function applyPlan(page, plan, extra = {}) {
  page.setData({
    plan,
    days: daysToPlan(plan),
    reminderRows: buildReminderRows(plan),
    ...extra
  });
}

Page({
  data: {
    plan: null,
    days: 0,
    reminderRows: [],
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
      applyPlan(this, plan, { loading: false });
    }).catch(() => {
      this.setData({ loading: false });
      wx.showToast({ title: '\u52a0\u8f7d\u590d\u67e5\u8be6\u60c5\u5931\u8d25', icon: 'none' });
    });
  },
  goBack() {
    wx.navigateBack();
  },
  editField(event) {
    if (!this.data.plan) return;
    const key = event.currentTarget.dataset.key;
    const label = event.currentTarget.dataset.label || '\u5b57\u6bb5';
    wx.showModal({
      title: `\u7f16\u8f91${label}`,
      editable: true,
      placeholderText: key === 'date' ? todayString() : '\u8bf7\u8f93\u5165',
      content: String(this.data.plan[key] || ''),
      confirmText: '\u4fdd\u5b58',
      success: (res) => {
        if (!res.confirm) return;
        const value = String(res.content || '').trim();
        if (!value && key !== 'department') {
          wx.showToast({ title: `\u8bf7\u8f93\u5165${label}`, icon: 'none' });
          return;
        }
        if (key === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
          wx.showToast({ title: '\u8bf7\u8f93\u5165 YYYY-MM-DD', icon: 'none' });
          return;
        }
        if (key === 'date' && value < todayString()) {
          wx.showToast({ title: '\u590d\u67e5\u65e5\u671f\u4e0d\u80fd\u65e9\u4e8e\u4eca\u5929', icon: 'none' });
          return;
        }
        api.updateRecheckPlan(this.data.plan.id, {
          [key]: value
        }, {
          idempotencyKey: `recheck_edit_${this.data.plan.id}_${key}_${Date.now()}`
        }).then((plan) => {
          applyPlan(this, plan);
          wx.showToast({ title: '\u5df2\u4fdd\u5b58', icon: 'success' });
        }).catch((error) => {
          showApiErrorFeedback(error, '\u4fdd\u5b58\u5931\u8d25');
        });
      }
    });
  },
  addTodo() {
    if (!this.data.plan) return;
    wx.showModal({
      title: '\u6dfb\u52a0\u5f85\u529e',
      editable: true,
      placeholderText: '\u4f8b\u5982\uff1a\u51c6\u5907\u68c0\u67e5\u5355',
      confirmText: '\u6dfb\u52a0',
      success: (res) => {
        if (!res.confirm) return;
        const text = String(res.content || '').trim();
        if (!text) {
          wx.showToast({ title: '\u8bf7\u8f93\u5165\u5f85\u529e\u5185\u5bb9', icon: 'none' });
          return;
        }
        api.addRecheckTodo(this.data.plan.id, {
          text,
          isDone: false,
          isTemplate: false
        }, {
          idempotencyKey: `todo_${this.data.plan.id}_${Date.now()}`
        }).then(() => {
          wx.showToast({ title: '\u5df2\u6dfb\u52a0', icon: 'success' });
          this.load();
        }).catch(() => {
          wx.showToast({ title: '\u6dfb\u52a0\u5f85\u529e\u5931\u8d25', icon: 'none' });
        });
      }
    });
  },
  toggleReminder(event) {
    if (!this.data.plan) return;
    const day = Number(event.currentTarget.dataset.day);
    const checked = !!event.detail.value;
    const currentConfig = this.data.plan.reminderConfig || {};
    const currentDays = Array.isArray(currentConfig.advanceDays) ? currentConfig.advanceDays.map(Number) : [3, 1, 0];
    const nextDays = currentDays
      .filter((item) => item !== day)
      .concat(checked ? [day] : [])
      .sort((a, b) => b - a);
    const nextConfig = {
      ...currentConfig,
      advanceDays: nextDays,
      subscribeAccepted: !!currentConfig.subscribeAccepted
    };
    const optimisticPlan = {
      ...this.data.plan,
      reminderConfig: nextConfig
    };
    applyPlan(this, optimisticPlan);
    api.updateRecheckPlan(this.data.plan.id, {
      reminderConfig: nextConfig
    }, {
      idempotencyKey: `recheck_reminder_${this.data.plan.id}_${day}_${Date.now()}`
    }).then((plan) => {
      applyPlan(this, plan);
    }).catch(() => {
      wx.showToast({ title: '\u66f4\u65b0\u63d0\u9192\u5931\u8d25', icon: 'none' });
      this.load();
    });
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
      content: '\u5220\u9664\u540e\u5c06\u4e0d\u518d\u51fa\u73b0\u5728\u590d\u67e5\u8ba1\u5212\u5217\u8868\u3002',
      confirmColor: '#C07060',
      success: (res) => {
        if (!res.confirm || !this.data.plan) return;
        api.deleteRecheckPlan(this.data.plan.id, {
          idempotencyKey: `delete_recheck_${this.data.plan.id}`
        }).then(() => {
          wx.showToast({ title: '\u5df2\u5220\u9664', icon: 'success' });
          setTimeout(() => wx.navigateBack(), 500);
        }).catch(() => {
          wx.showToast({ title: '\u5220\u9664\u5931\u8d25', icon: 'none' });
        });
      }
    });
  }
});
