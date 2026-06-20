const { api } = require('../../utils/api');

const PROVIDER_LABELS = ['OpenAI 兼容'];
const PRESETS = [
  {
    label: '当前代理',
    baseUrl: 'https://api.ads8260.win:8260/v1',
    model: 'gpt-5.4-mini'
  },
  {
    label: 'OpenAI 官方',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4.1-mini'
  },
  {
    label: '自定义',
    baseUrl: '',
    model: ''
  }
];

function normalizeBaseUrl(value) {
  let next = String(value || '').trim();
  if (!next) return '';
  if (!/^https?:\/\//i.test(next)) next = `https://${next}`;
  next = next.replace(/\/+$/, '');
  if (!/\/v\d+$/i.test(next)) next = `${next}/v1`;
  return next;
}

function endpointPreview(baseUrl) {
  const normalized = normalizeBaseUrl(baseUrl);
  if (!normalized) {
    return {
      responses: '-',
      chat: '-'
    };
  }
  return {
    responses: `${normalized}/responses`,
    chat: `${normalized}/chat/completions`
  };
}

function presetIndexFor(baseUrl) {
  const normalized = normalizeBaseUrl(baseUrl);
  const index = PRESETS.findIndex((item) => item.baseUrl && normalizeBaseUrl(item.baseUrl) === normalized);
  return index >= 0 ? index : PRESETS.length - 1;
}

function testTone(status) {
  if (status === 'ok') return 'ok';
  if (status === 'failed') return 'warn';
  return 'idle';
}

function testLabel(config) {
  if (!config) return '未测试';
  if (config.lastTestStatus === 'ok') return '已测试';
  if (config.lastTestStatus === 'failed') return '测试失败';
  return '未测试';
}

function sourceText(config) {
  if (!config) return '数据库配置优先，环境变量保底';
  if (config.source === 'database') return '当前使用数据库配置，环境变量作为兜底';
  if (config.source === 'env') return '当前使用环境变量配置，数据库配置未启用';
  return '当前为本地预览模式';
}

function historyRows(rows = []) {
  return rows.map((item) => ({
    title: item.active ? '当前启用' : '历史配置',
    meta: `${item.protocol === 'openai_compatible' ? 'OpenAI 兼容' : item.protocol || '-'} · ${item.model || '-'} · ${item.updatedAt ? item.updatedAt.slice(0, 10) : '-'}`,
    status: item.active ? '启用中' : '可恢复'
  }));
}

function toastError(error, fallback) {
  const message = error && error.message ? error.message : fallback;
  wx.showToast({ title: message || fallback, icon: 'none' });
}

Page({
  data: {
    adminPassword: '',
    adminUnlocked: false,
    authStatus: '请输入管理员密码后进入配置页',
    providerLabels: PROVIDER_LABELS,
    providerIndex: 0,
    presetLabels: PRESETS.map((item) => item.label),
    presetIndex: 0,
    presetLabel: PRESETS[0].label,
    providerStandard: 'OpenAI 兼容',
    baseUrl: PRESETS[0].baseUrl,
    model: PRESETS[0].model,
    apiKey: '',
    keyStatus: '加载中...',
    activeSource: '数据库配置优先，环境变量保底',
    lastTestStatus: '未测试',
    lastTestTone: 'idle',
    saveStatus: '加载配置中...',
    saving: false,
    testing: false,
    loading: false,
    canSave: false,
    preview: endpointPreview(PRESETS[0].baseUrl),
    history: []
  },
  goBack() {
    wx.navigateBack();
  },
  adminRequestConfig(config = {}) {
    return {
      ...config,
      skipUnauthorizedRedirect: true,
      headers: {
        ...(config.headers || {}),
        'X-Admin-Password': String(this.data.adminPassword || '')
      }
    };
  },
  onAdminPasswordInput(event) {
    this.setData({
      adminPassword: event.detail.value,
      authStatus: '请输入管理员密码后进入配置页'
    });
  },
  unlockAdminConfig() {
    if (!String(this.data.adminPassword || '').trim()) {
      wx.showToast({ title: '请输入管理员密码', icon: 'none' });
      return Promise.resolve(false);
    }
    return this.loadConfig();
  },
  applyConfig(payload) {
    const config = payload && payload.config ? payload.config : null;
    if (!config) return;
    const presetIndex = presetIndexFor(config.baseUrl);
    this.setData({
      loading: false,
      adminUnlocked: true,
      authStatus: '',
      providerIndex: 0,
      presetIndex,
      presetLabel: PRESETS[presetIndex].label,
      providerStandard: 'OpenAI 兼容',
      baseUrl: config.baseUrl || '',
      model: config.model || '',
      apiKey: '',
      keyStatus: config.keyStatus || 'API Key 未配置',
      activeSource: sourceText(config),
      lastTestStatus: config.lastTestMessage || testLabel(config),
      lastTestTone: testTone(config.lastTestStatus),
      saveStatus: config.source === 'database' ? '当前配置已启用' : '当前使用环境变量或预览配置',
      canSave: false,
      preview: endpointPreview(config.baseUrl),
      history: historyRows(payload.history || [])
    });
  },
  loadConfig() {
    this.setData({
      loading: true,
      saveStatus: '加载配置中...'
    });
    return api.getOcrProviderConfig({
      ...this.adminRequestConfig()
    }).then((payload) => {
      this.applyConfig(payload);
    }).catch((error) => {
      this.setData({
        loading: false,
        adminUnlocked: false,
        authStatus: '管理员密码错误或无权限',
        saveStatus: '配置加载失败，请稍后重试',
        lastTestStatus: '加载失败',
        lastTestTone: 'warn'
      });
      toastError(error, '配置加载失败');
    });
  },
  markDirty() {
    this.setData({
      canSave: false,
      lastTestStatus: '未测试',
      lastTestTone: 'idle',
      saveStatus: '修改后请先测试连接'
    });
  },
  onProviderChange(event) {
    this.setData({
      providerIndex: Number(event.detail.value || 0),
      providerStandard: PROVIDER_LABELS[Number(event.detail.value || 0)] || PROVIDER_LABELS[0]
    });
  },
  onPresetChange(event) {
    const presetIndex = Number(event.detail.value || 0);
    const preset = PRESETS[presetIndex] || PRESETS[0];
    this.setData({
      presetIndex,
      presetLabel: preset.label,
      baseUrl: preset.baseUrl || this.data.baseUrl,
      model: preset.model || this.data.model,
      preview: endpointPreview(preset.baseUrl || this.data.baseUrl)
    });
    this.markDirty();
  },
  onBaseUrlInput(event) {
    const baseUrl = event.detail.value;
    this.setData({
      baseUrl,
      preview: endpointPreview(baseUrl)
    });
    this.markDirty();
  },
  completeBaseUrl() {
    const baseUrl = normalizeBaseUrl(this.data.baseUrl);
    this.setData({
      baseUrl,
      presetIndex: presetIndexFor(baseUrl),
      presetLabel: PRESETS[presetIndexFor(baseUrl)].label,
      preview: endpointPreview(baseUrl)
    });
  },
  onModelInput(event) {
    this.setData({
      model: event.detail.value
    });
    this.markDirty();
  },
  onApiKeyInput(event) {
    const apiKey = event.detail.value;
    this.setData({
      apiKey,
      keyStatus: apiKey ? '将覆盖现有密钥' : '留空表示不修改现有密钥'
    });
    this.markDirty();
  },
  payload() {
    return {
      provider: 'gpt_vision',
      protocol: 'openai_compatible',
      baseUrl: normalizeBaseUrl(this.data.baseUrl),
      model: String(this.data.model || '').trim(),
      apiKey: String(this.data.apiKey || '').trim()
    };
  },
  testConnection() {
    const payload = this.payload();
    if (!payload.baseUrl || !payload.model) {
      wx.showToast({ title: '请先填写端点和模型', icon: 'none' });
      return Promise.resolve(false);
    }
    this.setData({
      testing: true,
      baseUrl: payload.baseUrl,
      preview: endpointPreview(payload.baseUrl),
      lastTestStatus: '测试中...',
      lastTestTone: 'loading',
      saveStatus: '正在验证端点...'
    });
    return api.testOcrProviderConfig(payload, {
      ...this.adminRequestConfig(),
      timeout: 20000
    }).then((result) => {
      this.setData({
        testing: false,
        canSave: !!result.ok,
        lastTestStatus: result.message || (result.ok ? '测试通过' : '测试失败'),
        lastTestTone: result.ok ? 'ok' : 'warn',
        saveStatus: result.ok ? '测试通过后可以保存启用' : '测试失败，当前配置未变更'
      });
    }).catch((error) => {
      this.setData({
        testing: false,
        canSave: false,
        lastTestStatus: '测试失败',
        lastTestTone: 'warn',
        saveStatus: '测试失败，当前配置未变更'
      });
      toastError(error, '测试连接失败');
    });
  },
  saveConfig() {
    if (this.data.saving) return Promise.resolve(false);
    if (!this.data.canSave) {
      wx.showToast({ title: '请先测试连接', icon: 'none' });
      return Promise.resolve(false);
    }
    const payload = this.payload();
    this.setData({
      saving: true,
      saveStatus: '保存并启用中...'
    });
    return api.saveOcrProviderConfig(payload, {
      ...this.adminRequestConfig(),
      timeout: 25000
    }).then((result) => {
      this.setData({
        saving: false,
        canSave: false
      });
      this.applyConfig(result);
      wx.showToast({ title: '已保存', icon: 'success' });
    }).catch((error) => {
      this.setData({
        saving: false,
        saveStatus: '保存失败，当前配置未变更'
      });
      toastError(error, '保存失败');
    });
  },
  rollbackConfig() {
    wx.showModal({
      title: '恢复上一版配置',
      content: '恢复后会立即影响新的 AI 识别任务，当前正在处理的任务不受影响。',
      confirmText: '恢复',
      confirmColor: '#5A7A5A',
      success: (res) => {
        if (!res.confirm) return;
        this.setData({
          saveStatus: '恢复中...'
        });
        api.rollbackOcrProviderConfig(this.adminRequestConfig()).then((result) => {
          this.applyConfig(result);
          wx.showToast({ title: '已恢复', icon: 'success' });
        }).catch((error) => {
          this.setData({
            saveStatus: '恢复失败，当前配置未变更'
          });
          toastError(error, '恢复失败');
        });
      }
    });
  }
});
