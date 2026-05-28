const { api } = require('../../utils/api');
const { showApiErrorToast } = require('../../utils/error');

const PINNED_TOAST = '\u5df2\u52a0\u5165\u5173\u6ce8';
const UNPINNED_TOAST = '\u5df2\u53d6\u6d88\u5173\u6ce8';

function formatReference(row) {
  if (!row || row.valueType === 'qualitative') return '\u53c2\u8003 \u9634\u6027';
  if (row.refText) return `\u53c2\u8003 ${row.refText}`;
  const low = row.refRangeLow;
  const high = row.refRangeHigh;
  if (low !== null && low !== undefined && high !== null && high !== undefined) return `\u53c2\u8003 ${low}-${high}`;
  if (low !== null && low !== undefined) return `\u53c2\u8003 >=${low}`;
  if (high !== null && high !== undefined) return `\u53c2\u8003 <=${high}`;
  return '\u53c2\u8003 --';
}

function decorateHistory(history) {
  return (history || []).map((row) => ({
    ...row,
    referenceText: formatReference(row)
  }));
}

Page({
  data: {
    metricKey: '',
    latest: null,
    history: [],
    isQualitative: false,
    hasTrendChart: false,
    trendNotice: '',
    isPinned: false,
    pinSaving: false,
    loading: false
  },
  onLoad(query) {
    this.profileId = getApp().getCurrentProfileId();
    const metricKey = query.metricKey || 'wbc';
    this.setData({ metricKey });
    this.load(metricKey);
  },
  load(metricKey) {
    this.setData({ loading: true });
    api.getMetricHistory(this.profileId, metricKey).then(({ history }) => {
      const decoratedHistory = decorateHistory(history);
      const latest = decoratedHistory[0];
      const numericHistoryCount = decoratedHistory.filter((item) => item.valueType !== 'qualitative' && typeof item.valueNumeric === 'number').length;
      const isQualitative = !!(latest && latest.valueType === 'qualitative');
      this.setData({
        latest,
        history: decoratedHistory,
        isQualitative,
        hasTrendChart: !isQualitative && numericHistoryCount > 1,
        trendNotice: isQualitative
          ? '\u6b64\u9879\u4e3a\u5b9a\u6027\u6307\u6807\uff0c\u7ed3\u679c\u4e3a\u9634\u6027 / \u9633\u6027\uff0c\u4e0d\u663e\u793a\u8d8b\u52bf\u66f2\u7ebf'
          : (numericHistoryCount <= 1 ? '\u76ee\u524d\u53ea\u6709\u9996\u6b21\u8bb0\u5f55\uff0c\u6682\u4e0d\u7ed8\u5236\u8d8b\u52bf\u7ebf' : ''),
        isPinned: !!(latest && latest.isPinned),
        loading: false
      });
    }).catch((error) => {
      this.setData({ loading: false });
      showApiErrorToast(error, '\u52a0\u8f7d\u6307\u6807\u5931\u8d25');
    });
  },
  goBack() {
    wx.navigateBack();
  },
  goReport(event) {
    wx.navigateTo({ url: `/pages/health/report-detail?id=${event.currentTarget.dataset.id}` });
  },
  togglePin() {
    if (this.data.pinSaving || !this.data.latest) return;
    const nextPinned = !this.data.isPinned;
    this.setData({ isPinned: nextPinned, pinSaving: true });
    api.setMetricPinned(this.profileId, this.data.metricKey, nextPinned).then(() => {
      this.setData({ pinSaving: false });
      wx.showToast({ title: nextPinned ? PINNED_TOAST : UNPINNED_TOAST, icon: 'none' });
    }).catch((error) => {
      this.setData({ isPinned: !nextPinned, pinSaving: false });
      showApiErrorToast(error, '\u66f4\u65b0\u5173\u6ce8\u5931\u8d25');
    });
  }
});
