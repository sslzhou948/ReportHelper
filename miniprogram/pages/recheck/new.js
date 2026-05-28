const { api } = require('../../utils/api');
const { buildDefaultTodos, validateRecheckPlan } = require('../../utils/recheck');

function buildFields(form, errors) {
  return [
    { key: 'type', label: '\u68c0\u67e5\u7c7b\u578b', value: form.type, error: errors.type || '' },
    { key: 'date', label: '\u65e5\u671f', value: form.date, error: errors.date || '' },
    { key: 'hospital', label: '\u533b\u9662', value: form.hospital, error: errors.hospital || '' },
    { key: 'department', label: '\u79d1\u5ba4', value: form.department || '\u672a\u6307\u5b9a', error: '' }
  ];
}

Page({
  data: {
    form: {
      type: '\u5e38\u89c4\u590d\u67e5',
      date: '2026-06-01',
      hospital: '\u534f\u548c\u533b\u9662',
      department: '\u80bf\u7624\u79d1'
    },
    fields: [],
    todos: buildDefaultTodos(),
    errors: {},
    saving: false
  },

  onLoad() {
    this.refreshFields();
  },

  refreshFields() {
    this.setData({ fields: buildFields(this.data.form, this.data.errors) });
  },

  goBack() {
    wx.navigateBack();
  },

  setField(key, value) {
    const form = { ...this.data.form, [key]: value };
    this.setData({ form, errors: {} });
    this.refreshFields();
  },

  toggleTodo(event) {
    const index = event.currentTarget.dataset.index;
    const todos = this.data.todos.slice();
    todos[index] = { ...todos[index], isDone: !todos[index].isDone };
    this.setData({ todos });
  },

  addTodo() {
    wx.showModal({
      title: '\u81ea\u5b9a\u4e49\u5f85\u529e',
      editable: true,
      placeholderText: '\u4f8b\u5982\uff1a\u5e26\u4e0a\u65e7\u62a5\u544a',
      confirmText: '\u6dfb\u52a0',
      success: (res) => {
        if (!res.confirm) return;
        const text = String(res.content || '').trim();
        if (!text) {
          wx.showToast({ title: '\u8bf7\u8f93\u5165\u5f85\u529e\u5185\u5bb9', icon: 'none' });
          return;
        }
        const todos = this.data.todos.concat({
          id: `todo_custom_${Date.now()}`,
          text,
          isDone: false,
          isTemplate: false,
          sortOrder: this.data.todos.length + 1
        });
        this.setData({ todos });
      }
    });
  },

  save() {
    if (this.data.saving) return;
    const result = validateRecheckPlan(this.data.form);
    if (!result.ok) {
      this.setData({ errors: result.errors });
      this.refreshFields();
      wx.showToast({ title: Object.values(result.errors)[0], icon: 'none' });
      return;
    }

    const profileId = getApp().getCurrentProfileId();
    this.setData({ saving: true });
    api.createRecheckPlan(profileId, {
      ...this.data.form,
      todos: this.data.todos.map((todo, index) => ({
        text: todo.text,
        isDone: todo.isDone,
        isTemplate: todo.isTemplate,
        sortOrder: index + 1
      })),
      reminderConfig: {
        advanceDays: [3, 1, 0],
        subscribeAccepted: false
      }
    }, {
      idempotencyKey: `recheck_${profileId}_${this.data.form.date}_${this.data.form.type}`
    }).then(() => {
      wx.showToast({ title: '\u5df2\u4fdd\u5b58', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 500);
    }).catch(() => {
      this.setData({ saving: false });
      wx.showToast({ title: '\u4fdd\u5b58\u590d\u67e5\u8ba1\u5212\u5931\u8d25', icon: 'none' });
    });
  },

  pick(event) {
    const key = event.currentTarget.dataset.key;
    const demoValues = {
      type: '\u5e38\u89c4\u590d\u67e5',
      date: '2026-06-01',
      hospital: '\u534f\u548c\u533b\u9662',
      department: '\u80bf\u7624\u79d1'
    };
    this.setField(key, demoValues[key] || '');
  }
});
