const { api } = require('../../utils/api');
const { showApiErrorToast } = require('../../utils/error');

const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'abnormal', label: '异常报告' },
  { key: 'normal', label: '无异常' },
  { key: 'archive', label: '仅归档' }
];

function pad2(value) {
  return String(value).padStart(2, '0');
}

function parseReportDate(value) {
  const dateText = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return null;
  const date = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return {
    raw: dateText,
    monthKey: `${date.getFullYear()}-${pad2(month)}`,
    monthTitle: `${date.getFullYear()}年${month}月`,
    dateTile: pad2(day),
    weekday: `${month}月`
  };
}

function normalizeText(value) {
  return String(value || '').trim();
}

function displayHospitalName(value) {
  const text = normalizeText(value);
  const stripped = text.replace(/\s*[·・]\s*(?:\d{4}[/-])?\d{1,2}(?:月|[/-])\d{1,2}日?\s*$/, '').trim();
  return stripped || text;
}

function decorateReport(report) {
  const parsedDate = parseReportDate(report.reportDate);
  const abnormalCount = Number(report.abnormalCount) || 0;
  const analysisPolicy = report.analysisPolicy || 'metric_analysis';
  const isViewOnly = analysisPolicy === 'view_only';
  const title = normalizeText(report.type || report.canonicalTypeName || report.originalType) || '未命名报告';
  const rawHospital = normalizeText(report.hospital) || '未填写医院';
  const hospital = displayHospitalName(rawHospital);
  const displayDate = parsedDate ? parsedDate.raw : normalizeText(report.reportDate) || '未标日期';
  let statusText = '无异常';
  let statusTone = 'normal';

  if (abnormalCount > 0) {
    statusText = `${abnormalCount} 异常`;
    statusTone = 'high';
  } else if (isViewOnly) {
    statusText = '仅归档';
    statusTone = 'muted';
  }

  return {
    ...report,
    title,
    hospital,
    displayDate,
    dateTile: parsedDate ? parsedDate.dateTile : '--',
    weekday: parsedDate ? parsedDate.weekday : '--',
    monthKey: parsedDate ? parsedDate.monthKey : 'unknown',
    monthTitle: parsedDate ? parsedDate.monthTitle : '未标日期',
    abnormalCount,
    isAbnormal: abnormalCount > 0,
    isViewOnly,
    statusText,
    statusTone,
    searchText: `${title} ${rawHospital} ${hospital} ${displayDate}`.toLowerCase()
  };
}

function groupReports(reports) {
  const groups = [];
  const byMonth = {};
  reports.forEach((report) => {
    if (!byMonth[report.monthKey]) {
      byMonth[report.monthKey] = {
        key: report.monthKey,
        monthTitle: report.monthTitle,
        countText: '0份',
        reports: []
      };
      groups.push(byMonth[report.monthKey]);
    }
    byMonth[report.monthKey].reports.push(report);
  });
  groups.forEach((group) => {
    group.countText = `${group.reports.length}份`;
  });
  return groups;
}

Page({
  rawReports: [],
  data: {
    reports: [],
    reportGroups: [],
    keyword: '',
    filterKey: 'all',
    filterLabel: '全部',
    visibleCount: 0,
    emptyText: '暂无归档报告',
    loading: false
  },
  onLoad() {
    this.load();
  },
  load() {
    const profileId = getApp().getCurrentProfileId();
    this.setData({ loading: true });
    api.listReports(profileId).then((reports) => {
      this.rawReports = reports.map(decorateReport);
      this.setData({ reports: this.rawReports, loading: false });
      this.applyView();
    }).catch((error) => {
      this.setData({ loading: false });
      showApiErrorToast(error, '加载报告失败');
    });
  },
  applyView(overrides = {}) {
    const keyword = String(overrides.keyword !== undefined ? overrides.keyword : this.data.keyword || '').trim().toLowerCase();
    const filterKey = overrides.filterKey || this.data.filterKey || 'all';
    const filtered = this.rawReports.filter((report) => {
      const keywordMatched = !keyword || report.searchText.includes(keyword);
      if (!keywordMatched) return false;
      if (filterKey === 'abnormal') return report.isAbnormal;
      if (filterKey === 'normal') return !report.isAbnormal && !report.isViewOnly;
      if (filterKey === 'archive') return report.isViewOnly;
      return true;
    });
    this.setData({
      reportGroups: groupReports(filtered),
      visibleCount: filtered.length,
      emptyText: keyword || filterKey !== 'all' ? '没有找到符合条件的报告' : '暂无归档报告'
    });
  },
  onSearchInput(event) {
    const keyword = event.detail.value || '';
    this.setData({ keyword });
    this.applyView({ keyword });
  },
  openFilter() {
    wx.showActionSheet({
      itemList: FILTERS.map((item) => item.label),
      success: (res) => {
        const filter = FILTERS[res.tapIndex] || FILTERS[0];
        this.setData({
          filterKey: filter.key,
          filterLabel: filter.label
        });
        this.applyView({ filterKey: filter.key });
      }
    });
  },
  goBack() {
    wx.navigateBack();
  },
  goReport(event) {
    wx.navigateTo({ url: `/pages/health/report-detail?id=${event.currentTarget.dataset.id}` });
  }
});
