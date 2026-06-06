const { calculateTone, calculateTrend } = require('./trend');
const { toNumberOrNull } = require('./reference-range');
const { metricReportMarkers } = require('./report-markers');
const { normalizeMetricCategory } = require('./metric-category');
const { canonicalMetricKey } = require('./metric-key');

function normalizeReportMetrics(report, metricDefinitions) {
  return report.metrics.map((row) => {
    const metricKey = canonicalMetricKey(row, { fallback: row.metricKey || row.metricName || 'unknown' });
    const definition = metricDefinitions[metricKey] || metricDefinitions[row.metricKey] || {
      key: metricKey,
      nameCn: row.metricName || row.metricKey || metricKey,
      category: row.category || 'other',
      categoryCn: row.categoryCn || '其他',
      valueType: row.valueType || 'quantitative'
    };
    const valueType = row.valueType || definition.valueType;
    const value = valueType === 'qualitative' ? row.valueQualitative : row.valueNumeric;
    const refLow = toNumberOrNull(row.refRangeLow);
    const refHigh = toNumberOrNull(row.refRangeHigh);
    const calculatedTone = calculateTone(value, refLow, refHigh, valueType, row.tone);
    const reportMarkers = metricReportMarkers(row);
    const categoryInfo = normalizeMetricCategory({
      ...row,
      category: definition.category,
      categoryCn: definition.categoryCn
    });
    return {
      ...row,
      metricKey,
      reportId: report.id,
      reportDate: report.reportDate,
      hospital: report.hospital,
      metricName: definition.nameCn,
      category: categoryInfo.category,
      categoryCn: categoryInfo.categoryCn,
      valueType,
      reportMarkers,
      tone: calculatedTone
    };
  });
}

function groupMetricsByCategory(metricRows) {
  return metricRows.reduce((acc, row) => {
    const categoryInfo = normalizeMetricCategory(row);
    const key = categoryInfo.category;
    if (!acc[key]) {
      acc[key] = {
        category: key,
        categoryCn: categoryInfo.categoryCn,
        items: []
      };
    }
    acc[key].items.push({
      ...row,
      category: categoryInfo.category,
      categoryCn: categoryInfo.categoryCn
    });
    return acc;
  }, {});
}

function buildMetricSnapshots(reports, metricDefinitions) {
  const allRows = reports
    .filter((report) => (report.analysisPolicy || 'metric_analysis') !== 'view_only')
    .flatMap((report) => normalizeReportMetrics(report, metricDefinitions))
    .filter((row) => row.category === 'custom' || row.mappingStatus !== 'conflicted')
    .filter((row) => row.category === 'custom' || row.mappingStatus !== 'pending' || row.valueType !== 'text');
  const byMetric = allRows.reduce((acc, row) => {
    if (!acc[row.metricKey]) acc[row.metricKey] = [];
    acc[row.metricKey].push(row);
    return acc;
  }, {});

  return Object.keys(byMetric).map((metricKey) => {
    const rows = byMetric[metricKey].sort((a, b) => new Date(a.reportDate) - new Date(b.reportDate));
    const last = rows[rows.length - 1];
    const trend = calculateTrend(rows);
    return {
      profileId: reports[0] && reports[0].profileId,
      metricKey,
      metricName: last.metricName,
      category: last.category,
      categoryCn: last.categoryCn,
      valueType: last.valueType,
      lastValueNumeric: last.valueNumeric,
      lastValueQualitative: last.valueQualitative,
      unit: last.unit,
      lastDate: last.reportDate,
      lastReportId: last.reportId,
      lastTone: last.tone,
      trendDirection: trend.direction,
      trendLabel: trend.label,
      measureCount: rows.length,
      isPinned: rows.some((row) => row.isPinned)
    };
  });
}

module.exports = {
  normalizeReportMetrics,
  groupMetricsByCategory,
  buildMetricSnapshots
};
