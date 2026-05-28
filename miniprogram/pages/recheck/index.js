const { api } = require('../../utils/api');
const { daysBetween, formatMonthDay } = require('../../utils/date');
const { bindNetworkStatus, refreshNetworkStatus } = require('../../utils/network');
const { isProfileRequiredError } = require('../../utils/profile');

function decoratePlan(plan) {
  const date = new Date(`${plan.date}T00:00:00`);
  const weekdays = [
    '\u5468\u65e5',
    '\u5468\u4e00',
    '\u5468\u4e8c',
    '\u5468\u4e09',
    '\u5468\u56db',
    '\u5468\u4e94',
    '\u5468\u516d'
  ];
  return {
    ...plan,
    displayDate: formatMonthDay(plan.date),
    weekday: weekdays[date.getDay()],
    dayText: String(Number(plan.date.slice(8, 10))),
    monthText: `${Number(plan.date.slice(5, 7))}\u6708`
  };
}

function buildPlanState(recheck) {
  const nextPlan = recheck.nextPlan ? decoratePlan(recheck.nextPlan) : null;
  const readyCount = nextPlan ? nextPlan.todos.filter((todo) => todo.isDone).length : 0;
  const totalCount = nextPlan ? nextPlan.todos.length : 0;
  return {
    nextPlan,
    otherPlans: (recheck.otherPlans || []).map(decoratePlan),
    doneCount: recheck.doneCount || 0,
    readyCount,
    progressPercent: totalCount ? Math.round((readyCount / totalCount) * 100) : 0,
    allReady: totalCount > 0 && readyCount === totalCount,
    daysToNext: nextPlan ? Math.max(0, daysBetween(new Date(), nextPlan.date)) : 0
  };
}

Page({
  data: {
    nextPlan: null,
    otherPlans: [],
    doneCount: 0,
    readyCount: 0,
    progressPercent: 0,
    allReady: false,
    daysToNext: 0,
    networkOffline: false,
    loading: false
  },
  onShow() {
    bindNetworkStatus(this);
    this.load();
  },
  load() {
    this.setData({ loading: true });
    const app = getApp();
    app.ensureCurrentProfileId(api).then((profileId) => api.listRecheckPlans(profileId)).then((recheck) => {
      this.setData({ ...buildPlanState(recheck), loading: false });
    }).catch((error) => {
      this.setData({ loading: false });
      if (isProfileRequiredError(error)) return;
      wx.showToast({ title: '\u52a0\u8f7d\u590d\u67e5\u8ba1\u5212\u5931\u8d25', icon: 'none' });
    });
  },
  goNew() {
    wx.navigateTo({ url: '/pages/recheck/new' });
  },
  goDetail(event) {
    wx.navigateTo({ url: `/pages/recheck/detail?planId=${event.currentTarget.dataset.id}` });
  },
  goNextDetail() {
    if (!this.data.nextPlan) return;
    wx.navigateTo({ url: `/pages/recheck/detail?planId=${this.data.nextPlan.id}` });
  },
  toggleTodo(event) {
    const index = event.currentTarget.dataset.index;
    const nextPlan = { ...this.data.nextPlan, todos: this.data.nextPlan.todos.slice() };
    const todo = nextPlan.todos[index];
    nextPlan.todos[index] = {
      ...todo,
      isDone: !todo.isDone
    };
    const readyCount = nextPlan.todos.filter((todo) => todo.isDone).length;
    const totalCount = nextPlan.todos.length;
    this.setData({
      nextPlan,
      readyCount,
      progressPercent: totalCount ? Math.round((readyCount / totalCount) * 100) : 0,
      allReady: totalCount > 0 && readyCount === totalCount
    });
    api.updateRecheckTodo(nextPlan.id, todo.id, { isDone: nextPlan.todos[index].isDone }).then((plan) => {
      if (plan) this.load();
    }).catch(() => {
      wx.showToast({ title: '\u66f4\u65b0\u5f85\u529e\u5931\u8d25', icon: 'none' });
      this.load();
    });
  },
  addTodo() {
    if (!this.data.nextPlan) return;
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
        api.addRecheckTodo(this.data.nextPlan.id, {
          text,
          isDone: false,
          isTemplate: false
        }, {
          idempotencyKey: `todo_${this.data.nextPlan.id}_${Date.now()}`
        }).then(() => {
          wx.showToast({ title: '\u5df2\u6dfb\u52a0', icon: 'success' });
          this.load();
        }).catch(() => {
          wx.showToast({ title: '\u6dfb\u52a0\u5f85\u529e\u5931\u8d25', icon: 'none' });
        });
      }
    });
  },
  completePlan() {
    if (!this.data.allReady) {
      wx.showToast({ title: '\u8bf7\u5148\u5b8c\u6210\u5168\u90e8\u5f85\u529e', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '\u6807\u8bb0\u4e3a\u5df2\u5b8c\u6210\uff1f',
      content: '\u8ba1\u5212\u4f1a\u79fb\u5230\u5e95\u90e8\u5df2\u5b8c\u6210\u5217\u8868\u3002',
      success: (res) => {
        if (!res.confirm || !this.data.nextPlan) return;
        api.completeRecheckPlan(this.data.nextPlan.id, {
          idempotencyKey: `complete_${this.data.nextPlan.id}`
        }).then(() => {
          wx.showToast({ title: '\u5df2\u5b8c\u6210', icon: 'success' });
          this.load();
        }).catch(() => {
          wx.showToast({ title: '\u5b8c\u6210\u8ba1\u5212\u5931\u8d25', icon: 'none' });
        });
      }
    });
  },
  retryAfterNetwork() {
    refreshNetworkStatus(this).then(() => this.load());
  }
});
