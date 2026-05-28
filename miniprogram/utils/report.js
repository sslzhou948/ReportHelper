const { calculateTone, calculateTrend } = require('./trend');

function normalizeReportMetrics(report, metricDefinitions) {
  return report.metrics.map((row) => {
    const definition = metricDefinitions[row.metricKey] || {
      key: row.metricKey,
      nameCn: row.metricName || row.metricKey,
      category: row.category || 'other',
      categoryCn: row.categoryCn || '其他',
      valueType: row.valueType || 'quantitative'
    };
    const valueType = row.valueType || definition.valueType;
    const value = valueType === 'qualitative' ? row.valueQualitative : row.valueNumeric;
    return {
      ...row,
      reportId: report.id,
      reportDate: report.reportDate,
      hospital: report.hospital,
      metricName: definition.nameCn,
      category: definition.category,
      categoryCn: definition.categoryCn,
      valueType,
      tone: row.tone || calculateTone(value, row.refRangeLow, row.refRangeHigh, valueType)
    };
  });
}

function groupMetricsByCategory(metricRows) {
  return metricRows.reduce((acc, row) => {
    const key = row.category || 'other';
    if (!acc[key]) {
      acc[key] = {
        category: key,
        categoryCn: row.categoryCn || '其他',
        items: []
      };
    }
    acc[key].items.push(row);
    return acc;
  }, {});
}

function buildMetricSnapshots(reports, metricDefinitions) {
  const allRows = reports
    .filter((report) => (report.analysisPolicy || 'metric_analysis') !== 'view_only')
    .flatMap((report) => normalizeReportMetrics(report, metricDefinitions))
    .filter((row) => !['pending', 'conflicted'].includes(row.mappingStatus));
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
