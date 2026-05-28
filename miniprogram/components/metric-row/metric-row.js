Component({
  properties: {
    metric: {
      type: Object,
      value: {}
    }
  },
  methods: {
    onTap() {
      this.triggerEvent('metrictap', { metricKey: this.data.metric.metricKey });
    }
  }
});
