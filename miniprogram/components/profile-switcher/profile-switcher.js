Component({
  properties: {
    visible: Boolean,
    profiles: {
      type: Array,
      value: []
    },
    currentProfileId: String
  },
  data: {
    manage: false
  },
  methods: {
    noop() {},
    close() {
      this.setData({ manage: false });
      this.triggerEvent('close');
    },
    toggleManage() {
      this.setData({ manage: !this.data.manage });
    },
    onProfileTap(event) {
      const profileId = event.currentTarget.dataset.id;
      if (this.data.manage) {
        this.triggerEvent('edit', { profileId });
        return;
      }
      this.triggerEvent('switch', { profileId });
    },
    addProfile() {
      this.triggerEvent('add');
    }
  }
});
