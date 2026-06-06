const { api } = require('../../utils/api');
const { addDays, formatDate } = require('../../utils/date');
const { showApiErrorToast } = require('../../utils/error');
const { formatReference: formatReferenceValue, hasNumericReference, toNumberOrNull } = require('../../utils/reference-range');

const PINNED_TOAST = '\u5df2\u52a0\u5165\u5173\u6ce8';
const UNPINNED_TOAST = '\u5df2\u53d6\u6d88\u5173\u6ce8';
const DEFAULT_RANGE = '1y';
const RANGE_OPTIONS = [
  { key: '30d', label: '近30天', days: 30 },
  { key: '90d', label: '近90天', days: 90 },
  { key: '1y', label: '近1年', days: 365 },
  { key: 'all', label: '全部' }
];

function formatReference(row) {
  if (!row) return '\u53c2\u8003 --';
  return `\u53c2\u8003 ${formatReferenceValue(row)}`;
}

function decorateHistory(history) {
  return (history || []).map((row) => ({
    ...row,
    referenceText: formatReference(row),
    hasNumericReference: hasNumericReference(row)
  }));
}

function rangeQuery(rangeKey) {
  const option = RANGE_OPTIONS.find((item) => item.key === rangeKey) || RANGE_OPTIONS[0];
  const today = formatDate(new Date());
  if (!option.days) return {};
  return {
    since: addDays(today, -(option.days - 1)),
    until: today
  };
}

function normalizeRangeKey(rangeKey) {
  return RANGE_OPTIONS.some((item) => item.key === rangeKey) ? rangeKey : DEFAULT_RANGE;
}

function getStoredRangeKey() {
  if (typeof wx === 'undefined' || !wx.getStorageSync) return '';
  return normalizeRangeKey(wx.getStorageSync('healthDataRange'));
}

function setStoredRangeKey(rangeKey) {
  if (typeof wx !== 'undefined' && wx.setStorageSync) wx.setStorageSync('healthDataRange', rangeKey);
}

function isTrendNumericRow(row) {
  return row.valueType !== 'qualitative' && toNumberOrNull(row.valueNumeric) !== null;
}

function trendNoticeText({ isQualitative, numericHistoryCount, rangeKey }) {
  if (isQualitative) return '此项为定性指标，结果为阴性 / 阳性，不显示趋势曲线';
  if (numericHistoryCount > 1) return '';
  return rangeKey === 'all'
    ? '目前少于 2 次数值记录，暂不绘制趋势线'
    : '当前时间范围内少于 2 次数值记录，切换到全部可查看更早结果';
}

Page({
  data: {
    metricKey: '',
    range: DEFAULT_RANGE,
    rangeOptions: RANGE_OPTIONS,
    latest: null,
    history: [],
    isQualitative: false,
    hasTrendChart: false,
    trendNotice: '',
    chartReferenceNotice: '',
    isPinned: false,
    pinSaving: false,
    loading: false
  },
  onLoad(query = {}) {
    this.profileId = getApp().getCurrentProfileId();
    const metricKey = query.metricKey || 'wbc';
    const range = normalizeRangeKey(query.range || getStoredRangeKey());
    this.setData({ metricKey, range });
    return this.load(metricKey, range);
  },
  load(metricKey, rangeKey = this.data.range) {
    const requestId = (this.loadRequestId || 0) + 1;
    this.loadRequestId = requestId;
    this.setData({ loading: true });
    return api.getMetricHistory(this.profileId, metricKey, rangeQuery(rangeKey)).then(({ history }) => {
      if (requestId !== this.loadRequestId) return;
      const decoratedHistory = decorateHistory(history);
      const latest = decoratedHistory[0];
      const numericRows = decoratedHistory.filter(isTrendNumericRow);
      const numericHistoryCount = numericRows.length;
      const complexReferenceCount = numericRows.filter((item) => !item.hasNumericReference).length;
      const isQualitative = !!(latest && latest.valueType === 'qualitative');
      this.setData({
        range: rangeKey,
        latest,
        history: decoratedHistory,
        isQualitative,
        hasTrendChart: !isQualitative && numericHistoryCount > 1,
        trendNotice: trendNoticeText({ isQualitative, numericHistoryCount, rangeKey }),
        chartReferenceNotice: complexReferenceCount
          ? '\u90e8\u5206\u8bb0\u5f55\u662f\u590d\u6742\u53c2\u8003\u8303\u56f4\uff0c\u56fe\u4e0a\u4ec5\u7ed8\u5236\u53ef\u660e\u786e\u8ba1\u7b97\u7684\u4e0a\u4e0b\u9650'
          : '\u53c2\u8003\u8303\u56f4\u53ef\u80fd\u56e0\u533b\u9662\u4e0d\u540c\u6709\u5dee\u5f02\uff0c\u6bcf\u6b21\u62a5\u544a\u7684\u53c2\u8003\u503c\u89c1\u4e0b\u65b9\u5386\u53f2\u8bb0\u5f55',
        isPinned: !!(latest && latest.isPinned),
        loading: false
      });
    }).catch((error) => {
      if (requestId !== this.loadRequestId) return;
      this.setData({ loading: false });
      showApiErrorToast(error, '\u52a0\u8f7d\u6307\u6807\u5931\u8d25');
    });
  },
  goBack() {
    wx.navigateBack();
  },
  switchRange(event) {
    const range = normalizeRangeKey(event.currentTarget.dataset.range);
    this.setData({ range });
    setStoredRangeKey(range);
    return this.load(this.data.metricKey, range);
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
