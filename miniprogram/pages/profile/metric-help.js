Page({
  data: {
    groups: [
      { name: '血常规', text: '展示白细胞、血红蛋白、血小板等基础指标。' },
      { name: '肝功能', text: '展示 ALT、AST、胆红素等与肝功能相关的指标。' },
      { name: '肿瘤标志物', text: '展示 CEA、CA15-3 等随访常见指标。' }
    ]
  },
  goBack() {
    wx.navigateBack();
  }
});

