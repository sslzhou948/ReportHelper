const { api } = require('../../utils/api');
const { daysBetween, formatMonthDay } = require('../../utils/date');
const { showApiErrorToast } = require('../../utils/error');
const {
  beginSlowLoading,
  cancelSlowLoading: cancelPageLoading,
  finishSlowLoading
} = require('../../utils/loading');
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
    todos: (plan.todos || []).map((todo) => ({
      ...todo,
      swipeOpen: !!todo.swipeOpen
    })),
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
    progressPercent: totalCount ? Math.round((readyCount / totalCount) * 100) : 100,
    allReady: !!nextPlan && (totalCount === 0 || readyCount === totalCount),
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
    addingTodo: false,
    todoDraft: '',
    loading: false,
    loadingSlow: false
  },
  setTodoSwipeOpen(todoId) {
    if (!this.data.nextPlan) return;
    this.setData({
      nextPlan: {
        ...this.data.nextPlan,
        todos: this.data.nextPlan.todos.map((todo) => ({
          ...todo,
          swipeOpen: todo.id === todoId
        }))
      }
    });
  },
  closeTodoSwipe() {
    this.setTodoSwipeOpen('');
  },
  onTodoTouchStart(event) {
    const touch = event.touches && event.touches[0];
    if (!touch) return;
    this.todoTouch = {
      id: event.currentTarget.dataset.id,
      startX: touch.clientX,
      startY: touch.clientY
    };
  },
  onTodoTouchEnd(event) {
    if (!this.todoTouch) return;
    const touch = event.changedTouches && event.changedTouches[0];
    if (!touch) {
      this.todoTouch = null;
      return;
    }
    const deltaX = touch.clientX - this.todoTouch.startX;
    const deltaY = touch.clientY - this.todoTouch.startY;
    const isHorizontal = Math.abs(deltaX) > 44 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2;
    if (isHorizontal) this.setTodoSwipeOpen(deltaX < 0 ? this.todoTouch.id : '');
    this.todoTouch = null;
  },
  onShow() {
    bindNetworkStatus(this);
    this.load();
  },
  load() {
    const loadingToken = beginSlowLoading(this);
    const app = getApp();
    app.ensureCurrentProfileId(api).then((profileId) => api.listRecheckPlans(profileId)).then((recheck) => {
      if (!finishSlowLoading(this, loadingToken)) return;
      this.setData(buildPlanState(recheck));
    }).catch((error) => {
      if (!finishSlowLoading(this, loadingToken)) return;
      if (isProfileRequiredError(error)) return;
      showApiErrorToast(error, '\u52a0\u8f7d\u590d\u67e5\u8ba1\u5212\u5931\u8d25');
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
    const index = Number(event.currentTarget.dataset.index);
    const nextPlan = { ...this.data.nextPlan, todos: this.data.nextPlan.todos.slice() };
    const todo = nextPlan.todos[index];
    if (todo && todo.swipeOpen) {
      this.closeTodoSwipe();
      return;
    }
    nextPlan.todos[index] = {
      ...todo,
      isDone: !todo.isDone,
      swipeOpen: false
    };
    const readyCount = nextPlan.todos.filter((todo) => todo.isDone).length;
    const totalCount = nextPlan.todos.length;
    this.setData({
      nextPlan,
      readyCount,
      progressPercent: totalCount ? Math.round((readyCount / totalCount) * 100) : 100,
      allReady: totalCount === 0 || readyCount === totalCount
    });
    api.updateRecheckTodo(nextPlan.id, todo.id, { isDone: nextPlan.todos[index].isDone }).then((plan) => {
      if (plan) this.load();
    }).catch((error) => {
      showApiErrorToast(error, '\u66f4\u65b0\u5f85\u529e\u5931\u8d25');
      this.load();
    });
  },
  addTodo() {
    if (!this.data.nextPlan) return;
    this.setData({ addingTodo: true, todoDraft: '' });
  },
  onTodoDraftInput(event) {
    this.setData({ todoDraft: event.detail.value });
  },
  cancelTodoDraft() {
    this.setData({ addingTodo: false, todoDraft: '' });
  },
  saveTodoDraft() {
    if (!this.data.nextPlan) return;
    const text = String(this.data.todoDraft || '').trim();
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
      this.setData({ addingTodo: false, todoDraft: '' });
      this.load();
    }).catch((error) => {
      showApiErrorToast(error, '\u6dfb\u52a0\u5f85\u529e\u5931\u8d25');
    });
  },
  deleteTodo(event) {
    if (!this.data.nextPlan) return;
    const todoId = event.currentTarget.dataset.id;
    api.deleteRecheckTodo(this.data.nextPlan.id, todoId, {
      idempotencyKey: `delete_todo_${this.data.nextPlan.id}_${todoId}`
    }).then(() => {
      wx.showToast({ title: '\u5df2\u5220\u9664', icon: 'success' });
      this.load();
    }).catch((error) => {
      showApiErrorToast(error, '\u5220\u9664\u5f85\u529e\u5931\u8d25');
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
        }).catch((error) => {
          showApiErrorToast(error, '\u5b8c\u6210\u8ba1\u5212\u5931\u8d25');
        });
      }
    });
  },
  retryAfterNetwork() {
    refreshNetworkStatus(this).then(() => this.load());
  },
  retrySlowLoading() {
    this.load();
  },
  cancelSlowLoading() {
    cancelPageLoading(this);
  }
});
