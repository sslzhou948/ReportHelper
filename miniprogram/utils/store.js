const mock = require('../data/mock');
const { buildMetricSnapshots, normalizeReportMetrics, groupMetricsByCategory } = require('./report');

function getProfiles() {
  return mock.profiles;
}

function getProfile(profileId) {
  return mock.profiles.find((profile) => profile.id === profileId) || mock.profiles[0];
}

function getReports(profileId) {
  return mock.reports
    .filter((report) => report.profileId === profileId)
    .sort((a, b) => new Date(b.reportDate) - new Date(a.reportDate));
}

function getReport(reportId) {
  return mock.reports.find((report) => report.id === reportId) || mock.reports[0];
}

function getMetricSnapshots(profileId) {
  const reports = getReports(profileId);
  return buildMetricSnapshots(reports, mock.metricDefinitions)
    .sort((a, b) => {
      const abnormalA = a.lastTone === 'ok' ? 0 : 1;
      const abnormalB = b.lastTone === 'ok' ? 0 : 1;
      if (abnormalA !== abnormalB) return abnormalB - abnormalA;
      return new Date(b.lastDate) - new Date(a.lastDate);
    });
}

function getMetricHistory(profileId, metricKey) {
  return getReports(profileId)
    .flatMap((report) => normalizeReportMetrics(report, mock.metricDefinitions))
    .filter((row) => row.metricKey === metricKey)
    .sort((a, b) => new Date(b.reportDate) - new Date(a.reportDate));
}

function getReportMetricGroups(reportId) {
  const report = getReport(reportId);
  const rows = normalizeReportMetrics(report, mock.metricDefinitions);
  return Object.values(groupMetricsByCategory(rows));
}

function getRecheckPlans(profileId) {
  return mock.recheckPlans
    .filter((plan) => plan.profileId === profileId)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

module.exports = {
  mock,
  getProfiles,
  getProfile,
  getReports,
  getReport,
  getMetricSnapshots,
  getMetricHistory,
  getReportMetricGroups,
  getRecheckPlans
};
