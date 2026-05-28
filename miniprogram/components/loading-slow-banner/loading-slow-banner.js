Component({
  properties: {
    visible: {
      type: Boolean,
      value: false
    },
    message: {
      type: String,
      value: '加载时间较长，请检查网络或稍后重试'
    }
  },
  methods: {
    retry() {
      this.triggerEvent('retry');
    },
    cancel() {
      this.triggerEvent('cancel');
    }
  }
});
