Component({
  properties: {
    title: String,
    desc: String,
    cta: String
  },
  methods: {
    onTap() {
      this.triggerEvent('ctatap');
    }
  }
});
