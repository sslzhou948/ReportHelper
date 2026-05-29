const STORAGE_KEY = 'customMetricTemplates';

function canUseStorage() {
  return typeof wx !== 'undefined' && wx.getStorageSync && wx.setStorageSync;
}

function readAll() {
  if (!canUseStorage()) return {};
  const stored = wx.getStorageSync(STORAGE_KEY);
  return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
}

function writeAll(value) {
  if (canUseStorage()) wx.setStorageSync(STORAGE_KEY, value);
}

function listCustomMetrics(profileId) {
  const all = readAll();
  return (all[profileId] || [])
    .filter((item) => item.status !== 'archived')
    .sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0));
}

function saveCustomMetric(profileId, metric) {
  const all = readAll();
  const rows = all[profileId] || [];
  const now = Date.now();
  const metricKey = metric.metricKey || `custom_${now}`;
  const next = {
    metricKey,
    metricName: String(metric.metricName || '').trim(),
    category: metric.category || 'custom',
    categoryCn: metric.categoryCn || '\u81ea\u5b9a\u4e49',
    valueType: metric.valueType || 'quantitative',
    unit: String(metric.unit || '').trim(),
    refRangeLow: metric.refRangeLow === '' ? null : metric.refRangeLow,
    refRangeHigh: metric.refRangeHigh === '' ? null : metric.refRangeHigh,
    refQualitative: metric.refQualitative || '',
    status: 'active',
    source: 'custom',
    createdAt: metric.createdAt || now,
    updatedAt: now
  };
  const index = rows.findIndex((item) => item.metricKey === metricKey);
  all[profileId] = index >= 0
    ? rows.map((item, itemIndex) => (itemIndex === index ? { ...item, ...next } : item))
    : rows.concat(next);
  writeAll(all);
  return next;
}

function archiveCustomMetric(profileId, metricKey) {
  const all = readAll();
  const rows = all[profileId] || [];
  all[profileId] = rows.map((item) => (
    item.metricKey === metricKey ? { ...item, status: 'archived', updatedAt: Date.now() } : item
  ));
  writeAll(all);
}

function toTemplateFromSnapshot(snapshot) {
  return {
    metricKey: snapshot.metricKey,
    metricName: snapshot.metricName,
    category: snapshot.category || 'other',
    categoryCn: snapshot.categoryCn || '\u5176\u4ed6',
    valueType: snapshot.valueType || 'quantitative',
    unit: snapshot.unit || '',
    refRangeLow: snapshot.refRangeLow === undefined ? null : snapshot.refRangeLow,
    refRangeHigh: snapshot.refRangeHigh === undefined ? null : snapshot.refRangeHigh,
    source: 'history',
    lastDate: snapshot.lastDate,
    measureCount: snapshot.measureCount || 0
  };
}

function mergeMetricTemplates(customRows, snapshots) {
  const byKey = {};
  (snapshots || []).map(toTemplateFromSnapshot).forEach((item) => {
    byKey[item.metricKey] = item;
  });
  (customRows || []).forEach((item) => {
    byKey[item.metricKey] = {
      ...(byKey[item.metricKey] || {}),
      ...item,
      source: 'custom'
    };
  });
  return Object.values(byKey);
}

module.exports = {
  archiveCustomMetric,
  listCustomMetrics,
  mergeMetricTemplates,
  saveCustomMetric
};
