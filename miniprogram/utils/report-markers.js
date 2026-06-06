const markerPrefixPattern = /^\s*(?:\d{1,3}\s*)?((?:\*|[\u203b\u2605\u2606\u25a0\u25a1\u25aa\u25ab\u25b2\u25b3\u25b4\u25b5\u25b6\u25b7\u25b8\u25b9\u25bc\u25bd\u25be\u25bf\u25c6\u25c7\u25cf\u25cb\u2794])+)\s*/;
const markerCharPattern = /^(?:\*|[\u203b\u2605\u2606\u25a0\u25a1\u25aa\u25ab\u25b2\u25b3\u25b4\u25b5\u25b6\u25b7\u25b8\u25b9\u25bc\u25bd\u25be\u25bf\u25c6\u25c7\u25cf\u25cb\u2794])$/;

function compactText(value) {
  return String(value === undefined || value === null ? '' : value).trim().replace(/\s+/g, ' ');
}

function markerType(raw) {
  if (/^[\u2605\u2606]$/.test(raw)) return 'star';
  if (raw === '*' || raw === '\u203b') return 'asterisk';
  if (/^[\u25b2\u25b3\u25b4\u25b5\u25b6\u25b7\u25b8\u25b9\u25bc\u25bd\u25be\u25bf\u2794]$/.test(raw)) return 'triangle';
  if (/^[\u25a0\u25a1\u25aa\u25ab\u25c6\u25c7\u25cf\u25cb]$/.test(raw)) return 'shape';
  return 'unknown';
}

function markerKey(marker) {
  return `${marker.position}:${marker.raw}:${marker.type}`;
}

function markersFromRaw(value, source) {
  const rawText = compactText(value).replace(/\s+/g, '');
  const markers = [];
  Array.from(rawText).forEach((raw) => {
    if (!markerCharPattern.test(raw)) return;
    markers.push({
      type: markerType(raw),
      raw,
      position: 'prefix',
      meaning: 'report_marker',
      source: source || 'derived'
    });
  });
  return markers;
}

function normalizeReportMarkers(value, source) {
  if (!value) return [];
  const rawMarkers = Array.isArray(value) ? value : [value];
  const markers = [];
  const seen = {};
  rawMarkers.forEach((item) => {
    const itemSource = item && typeof item === 'object' && ['ocr', 'derived', 'manual'].indexOf(item.source) >= 0
      ? item.source
      : (source || 'derived');
    const raw = item && typeof item === 'object'
      ? (item.raw || item.symbol || item.marker)
      : item;
    markersFromRaw(raw, itemSource).forEach((marker) => {
      const key = markerKey(marker);
      if (seen[key]) return;
      seen[key] = true;
      markers.push(marker);
    });
  });
  return markers;
}

function extractMetricReportMarkers(value, source) {
  const originalName = compactText(value);
  if (!originalName) return [];
  const match = originalName.match(markerPrefixPattern);
  if (!match) return [];
  return normalizeReportMarkers(match[1], source || 'derived');
}

function metricReportMarkers(metric) {
  if (!metric) return [];
  return normalizeReportMarkers([
    ...normalizeReportMarkers(metric.reportMarkers, 'ocr'),
    ...extractMetricReportMarkers(metric.originalMetricName || metric.metricName, 'derived'),
    ...extractMetricReportMarkers(metric.metricName, 'derived')
  ]);
}

function markerText(markers) {
  return normalizeReportMarkers(markers).length ? '\u25b2' : '';
}

module.exports = {
  normalizeReportMarkers,
  extractMetricReportMarkers,
  metricReportMarkers,
  markerText
};
