const { api } = require('../../utils/api');
const { daysBetween } = require('../../utils/date');
const { isNotFoundError, showApiErrorFeedback, showApiErrorToast } = require('../../utils/error');
const { todayString } = require('../../utils/recheck');

function backToRecheck() {
  wx.navigateBack({
    fail: () => wx.switchTab({ url: '/pages/recheck/index' })
  });
}

function daysToPlan(plan) {
  return plan ? Math.max(0, daysBetween(new Date(), plan.date)) : 0;
}

function withTodoSwipeState(plan) {
  if (!plan) return plan;
  return {
    ...plan,
    todos: (plan.todos || []).map((todo) => ({
      ...todo,
      swipeOpen: !!todo.swipeOpen
    }))
  };
}

function applyPlan(page, plan, extra = {}) {
  page.savedPlan = plan ? { ...plan } : null;
  const viewPlan = withTodoSwipeState(plan);
  page.setData({
    plan: viewPlan,
    days: daysToPlan(viewPlan),
    ...extra
  });
}

Page({
  data: {
    plan: null,
    days: 0,
    today: todayString(),
    addingTodo: false,
    todoDraft: '',
    loading: false
  },
  setTodoSwipeOpen(todoId) {
    if (!this.data.plan) return;
    this.setData({
      plan: {
        ...this.data.plan,
        todos: (this.data.plan.todos || []).map((todo) => ({
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
  onLoad(query) {
    this.planId = query.planId;
    this.load();
  },
  load() {
    this.setData({ loading: true });
    api.listRecheckPlans(getApp().getCurrentProfileId()).then((recheck) => {
      const plans = [recheck.nextPlan].concat(recheck.otherPlans || []).filter(Boolean);
      const plan = plans.find((item) => item.id === this.planId) || null;
      if (this.planId && !plan) {
        this.setData({ loading: false });
        this.showPlanGone();
        return;
      }
      applyPlan(this, plan, { loading: false });
    }).catch((error) => {
      this.setData({ loading: false });
      if (isNotFoundError(error)) {
        this.showPlanGone();
        return;
      }
      showApiErrorToast(error, '\u52a0\u8f7d\u590d\u67e5\u8be6\u60c5\u5931\u8d25');
    });
  },
  showPlanGone() {
    wx.showModal({
      title: '\u590d\u67e5\u8ba1\u5212\u5df2\u4e0d\u5b58\u5728',
      content: '\u8fd9\u6761\u590d\u67e5\u8ba1\u5212\u53ef\u80fd\u5df2\u53d6\u6d88\u6216\u5220\u9664\uff0c\u8fd4\u56de\u5217\u8868\u540e\u4f1a\u5237\u65b0\u6570\u636e\u3002',
      showCancel: false,
      confirmText: '\u77e5\u9053\u4e86',
      success: backToRecheck
    });
  },
  goBack() {
    wx.navigateBack();
  },
  onFieldInput(event) {
    if (!this.data.plan) return;
    const key = event.currentTarget.dataset.key;
    this.setData({
      plan: {
        ...this.data.plan,
        [key]: event.detail.value
      }
    });
  },
  onFieldBlur(event) {
    const key = event.currentTarget.dataset.key;
    this.saveField(key, event.detail.value);
  },
  onDateChange(event) {
    this.saveField('date', event.detail.value);
  },
  saveField(key, rawValue) {
    if (!this.data.plan) return;
    const value = String(rawValue || '').trim();
    const labels = {
      type: '\u68c0\u67e5\u7c7b\u578b',
      date: '\u65e5\u671f',
      hospital: '\u533b\u9662',
      department: '\u79d1\u5ba4'
    };
    if (!value && key !== 'department') {
      wx.showToast({ title: `\u8bf7\u586b\u5199${labels[key] || '\u5b57\u6bb5'}`, icon: 'none' });
      applyPlan(this, this.savedPlan || this.data.plan);
      return;
    }
    if (key === 'date' && value < todayString()) {
      wx.showToast({ title: '\u590d\u67e5\u65e5\u671f\u4e0d\u80fd\u65e9\u4e8e\u4eca\u5929', icon: 'none' });
      applyPlan(this, this.savedPlan || this.data.plan);
      return;
    }
    const savedValue = this.savedPlan ? String(this.savedPlan[key] || '').trim() : '';
    if (value === savedValue) return;
    const previousPlan = this.savedPlan || this.data.plan;
    const optimisticPlan = {
      ...this.data.plan,
      [key]: value
    };
    this.setData({
      plan: optimisticPlan,
      days: daysToPlan(optimisticPlan)
    });
    api.updateRecheckPlan(this.data.plan.id, {
      [key]: value
    }, {
      idempotencyKey: `recheck_edit_${this.data.plan.id}_${key}_${Date.now()}`
    }).then((plan) => {
      applyPlan(this, plan);
      wx.showToast({ title: '\u5df2\u4fdd\u5b58', icon: 'success' });
    }).catch((error) => {
      if (isNotFoundError(error)) {
        this.showPlanGone();
        return;
      }
      applyPlan(this, previousPlan);
      showApiErrorFeedback(error, '\u4fdd\u5b58\u5931\u8d25');
    });
  },
  addTodo() {
    if (!this.data.plan) return;
    this.setData({ addingTodo: true, todoDraft: '' });
  },
  onTodoDraftInput(event) {
    this.setData({ todoDraft: event.detail.value });
  },
  cancelTodoDraft() {
    this.setData({ addingTodo: false, todoDraft: '' });
  },
  saveTodoDraft() {
    if (!this.data.plan) return;
    const text = String(this.data.todoDraft || '').trim();
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
    }).then((plan) => {
      wx.showToast({ title: '\u5df2\u6dfb\u52a0', icon: 'success' });
      applyPlan(this, plan, { addingTodo: false, todoDraft: '' });
    }).catch((error) => {
      showApiErrorToast(error, '\u6dfb\u52a0\u5f85\u529e\u5931\u8d25');
    });
  },
  deleteTodo(event) {
    if (!this.data.plan) return;
    const todoId = event.currentTarget.dataset.id;
    api.deleteRecheckTodo(this.data.plan.id, todoId, {
      idempotencyKey: `delete_todo_${this.data.plan.id}_${todoId}`
    }).then((plan) => {
      wx.showToast({ title: '\u5df2\u5220\u9664', icon: 'success' });
      applyPlan(this, plan);
    }).catch((error) => {
      showApiErrorToast(error, '\u5220\u9664\u5f85\u529e\u5931\u8d25');
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
          setTimeout(backToRecheck, 500);
        }).catch((error) => {
          if (isNotFoundError(error)) {
            wx.showToast({ title: '\u590d\u67e5\u8ba1\u5212\u5df2\u4e0d\u5b58\u5728', icon: 'none' });
            setTimeout(backToRecheck, 500);
            return;
          }
          showApiErrorToast(error, '\u53d6\u6d88\u5931\u8d25');
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
          setTimeout(backToRecheck, 500);
        }).catch((error) => {
          if (isNotFoundError(error)) {
            wx.showToast({ title: '\u590d\u67e5\u8ba1\u5212\u5df2\u5220\u9664', icon: 'none' });
            setTimeout(backToRecheck, 500);
            return;
          }
          showApiErrorToast(error, '\u5220\u9664\u5931\u8d25');
        });
      }
    });
  }
});
