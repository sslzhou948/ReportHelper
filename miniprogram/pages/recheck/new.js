const { api } = require('../../utils/api');
const { showApiErrorFeedback } = require('../../utils/error');
const { buildDefaultTodos, defaultRecheckDate, validateRecheckPlan } = require('../../utils/recheck');

const RECHECK_TEMPLATE_ID_KEY = 'recheckSubscribeTemplateId';

function getSubscribeTemplateId() {
  try {
    return wx.getStorageSync(RECHECK_TEMPLATE_ID_KEY) || '';
  } catch (error) {
    return '';
  }
}

function requestRecheckSubscribe() {
  const templateId = getSubscribeTemplateId();
  if (!templateId || !wx.requestSubscribeMessage) {
    return Promise.resolve({ subscribeAccepted: false, templateId: '' });
  }
  return new Promise((resolve) => {
    wx.requestSubscribeMessage({
      tmplIds: [templateId],
      success: (res) => {
        resolve({
          subscribeAccepted: res && res[templateId] === 'accept',
          templateId
        });
      },
      fail: () => resolve({ subscribeAccepted: false, templateId })
    });
  });
}

Page({
  data: {
    form: {
      type: '\u5e38\u89c4\u590d\u67e5',
      date: defaultRecheckDate(),
      timeOfDay: '09:00',
      hospital: '\u534f\u548c\u533b\u9662',
      department: '\u80bf\u7624\u79d1'
    },
    todos: buildDefaultTodos(),
    errors: {},
    today: defaultRecheckDate(new Date(), 0),
    addingTodo: false,
    todoDraft: '',
    saving: false
  },
  setTodoSwipeOpen(index) {
    this.setData({
      todos: this.data.todos.map((todo, todoIndex) => ({
        ...todo,
        swipeOpen: todoIndex === index
      }))
    });
  },
  closeTodoSwipe() {
    this.setTodoSwipeOpen(-1);
  },
  onTodoTouchStart(event) {
    const touch = event.touches && event.touches[0];
    if (!touch) return;
    this.todoTouch = {
      index: Number(event.currentTarget.dataset.index),
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
    if (isHorizontal) this.setTodoSwipeOpen(deltaX < 0 ? this.todoTouch.index : -1);
    this.todoTouch = null;
  },

  goBack() {
    wx.navigateBack();
  },

  setField(key, value) {
    const errors = { ...this.data.errors };
    delete errors[key];
    this.setData({
      form: { ...this.data.form, [key]: value },
      errors
    });
  },

  onInput(event) {
    this.setField(event.currentTarget.dataset.key, event.detail.value);
  },

  onDateChange(event) {
    this.setField('date', event.detail.value);
  },

  toggleTodo(event) {
    const index = Number(event.currentTarget.dataset.index);
    const todos = this.data.todos.slice();
    if (todos[index] && todos[index].swipeOpen) {
      this.closeTodoSwipe();
      return;
    }
    todos[index] = { ...todos[index], isDone: !todos[index].isDone };
    this.setData({ todos });
  },

  addTodo() {
    this.setData({ addingTodo: true, todoDraft: '' });
  },

  onTodoDraftInput(event) {
    this.setData({ todoDraft: event.detail.value });
  },

  cancelTodoDraft() {
    this.setData({ addingTodo: false, todoDraft: '' });
  },

  saveTodoDraft() {
    const text = String(this.data.todoDraft || '').trim();
    if (!text) {
      wx.showToast({ title: '\u8bf7\u8f93\u5165\u5f85\u529e\u5185\u5bb9', icon: 'none' });
      return;
    }
    const todos = this.data.todos.concat({
      id: `todo_custom_${Date.now()}`,
      text,
      isDone: false,
      isTemplate: false,
      sortOrder: this.data.todos.length + 1,
      swipeOpen: false
    });
    this.setData({ todos, addingTodo: false, todoDraft: '' });
  },

  deleteTodo(event) {
    const index = Number(event.currentTarget.dataset.index);
    this.setData({
      todos: this.data.todos.filter((_, todoIndex) => todoIndex !== index)
    });
  },

  save() {
    if (this.data.saving) return;
    const result = validateRecheckPlan(this.data.form);
    if (!result.ok) {
      this.setData({ errors: result.errors });
      wx.showToast({ title: Object.values(result.errors)[0], icon: 'none' });
      return;
    }

    const profileId = getApp().getCurrentProfileId();
    this.setData({ saving: true });
    return requestRecheckSubscribe().then((subscribe) => api.createRecheckPlan(profileId, {
      ...this.data.form,
      todos: this.data.todos.map((todo, index) => ({
        text: todo.text,
        isDone: todo.isDone,
        isTemplate: todo.isTemplate,
        sortOrder: index + 1
      })),
      reminderConfig: {
        advanceDays: [3, 1, 0],
        timeOfDay: this.data.form.timeOfDay || '09:00',
        subscribeAccepted: subscribe.subscribeAccepted,
        templateId: subscribe.templateId
      }
    }, {
      idempotencyKey: `recheck_${profileId}_${this.data.form.date}_${this.data.form.type}`
    }).then(() => subscribe)).then((subscribe) => {
      wx.showToast({
        title: subscribe.subscribeAccepted ? '\u5df2\u4fdd\u5b58' : '\u5df2\u4fdd\u5b58\uff0c\u672a\u5f00\u542f\u5fae\u4fe1\u63d0\u9192',
        icon: subscribe.subscribeAccepted ? 'success' : 'none'
      });
      setTimeout(() => wx.navigateBack(), 500);
    }).catch((error) => {
      this.setData({ saving: false });
      showApiErrorFeedback(error, '\u4fdd\u5b58\u590d\u67e5\u8ba1\u5212\u5931\u8d25');
    });
  }
});
