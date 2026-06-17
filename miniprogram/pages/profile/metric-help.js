const HELP_ITEMS = [
  {
    id: 'abnormal',
    name: '异常标记',
    icon: '/assets/ui-refresh/metric-flag.png',
    text: '当指标值超出参考范围时会标记为异常，便于快速关注异常结果。',
    detail: '异常标记来自结构化结果和参考范围整理，用于提醒复核，不代表诊断结论。'
  },
  {
    id: 'range',
    name: '参考范围',
    icon: '/assets/ui-refresh/metric-range.png',
    text: '参考范围来自检验方法和年龄性别等因素综合设定，实际以报告为准。',
    detail: '不同医院、设备和检验方法的参考范围可能不同。系统展示时优先使用本次报告中的参考范围。'
  },
  {
    id: 'trend',
    name: '趋势图',
    icon: '/assets/ui-refresh/metric-trend.png',
    text: '展示指标随时间的变化趋势，帮助观察波动情况和恢复过程。',
    detail: '趋势图用于整理历史记录。单次波动是否有临床意义，需要结合医生意见和病情判断。'
  },
  {
    id: 'pinned',
    name: '重点指标',
    icon: '/assets/ui-refresh/metric-star-shield.png',
    text: '系统根据异常情况自动推荐重点关注指标，支持手动调整。',
    detail: '重点指标会出现在首页关注区域，便于持续查看，但不会替代医生制定的随访计划。'
  },
  {
    id: 'pending',
    name: '待确认归类',
    icon: '/assets/ui-refresh/metric-pending.png',
    text: '识别结果存在不确定归类时会提示，请先确认后再保存。',
    detail: '待确认归类通常来自报告类型、指标名称或多页合并不确定。确认后再保存能减少后续数据错位。'
  }
];

function filterItems(keyword) {
  const query = String(keyword || '').trim().toLowerCase();
  if (!query) return HELP_ITEMS;
  return HELP_ITEMS.filter((item) => `${item.name} ${item.text}`.toLowerCase().includes(query));
}

Page({
  data: {
    keyword: '',
    groups: HELP_ITEMS,
    filteredGroups: HELP_ITEMS,
    emptyText: '没有找到相关说明'
  },
  goBack() {
    wx.navigateBack();
  },
  onSearchInput(event) {
    const keyword = event.detail.value || '';
    this.setData({
      keyword,
      filteredGroups: filterItems(keyword)
    });
  },
  openHelp(event) {
    const id = event.currentTarget.dataset.id;
    const item = HELP_ITEMS.find((entry) => entry.id === id);
    if (!item) return;
    wx.showModal({
      title: item.name,
      content: item.detail,
      showCancel: false,
      confirmText: '知道了',
      confirmColor: '#5A7A5A'
    });
  }
});
