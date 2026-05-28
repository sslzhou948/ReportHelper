Component({
  properties: {
    offline: {
      type: Boolean,
      value: false
    }
  },
  methods: {
    retry() {
      this.triggerEvent('retry');
    }
  }
});
