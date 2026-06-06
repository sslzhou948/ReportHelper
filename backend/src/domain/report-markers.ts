export type ReportMarkerSource = 'ocr' | 'derived' | 'manual';

export type ReportMarker = {
  type: 'star' | 'asterisk' | 'triangle' | 'shape' | 'unknown';
  raw: string;
  position: 'prefix';
  meaning: 'report_marker';
  source: ReportMarkerSource;
};

const markerPrefixPattern = /^\s*(?:\d{1,3}\s*)?((?:\*|[\u203b\u2605\u2606\u25a0\u25a1\u25aa\u25ab\u25b2\u25b3\u25b4\u25b5\u25b6\u25b7\u25b8\u25b9\u25bc\u25bd\u25be\u25bf\u25c6\u25c7\u25cf\u25cb\u2794])+)\s*/u;
const markerCharPattern = /^(?:\*|[\u203b\u2605\u2606\u25a0\u25a1\u25aa\u25ab\u25b2\u25b3\u25b4\u25b5\u25b6\u25b7\u25b8\u25b9\u25bc\u25bd\u25be\u25bf\u25c6\u25c7\u25cf\u25cb\u2794])$/u;

function compactText(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function markerType(raw: string): ReportMarker['type'] {
  if (/^[\u2605\u2606]$/u.test(raw)) return 'star';
  if (raw === '*' || raw === '\u203b') return 'asterisk';
  if (/^[\u25b2\u25b3\u25b4\u25b5\u25b6\u25b7\u25b8\u25b9\u25bc\u25bd\u25be\u25bf\u2794]$/u.test(raw)) return 'triangle';
  if (/^[\u25a0\u25a1\u25aa\u25ab\u25c6\u25c7\u25cf\u25cb]$/u.test(raw)) return 'shape';
  return 'unknown';
}

function normalizeMarker(value: unknown, source: ReportMarkerSource): ReportMarker[] {
  const text = compactText(value).replace(/\s+/g, '');
  const markers: ReportMarker[] = [];
  for (const raw of Array.from(text)) {
    if (!markerCharPattern.test(raw)) continue;
    markers.push({
      type: markerType(raw),
      raw,
      position: 'prefix',
      meaning: 'report_marker',
      source
    });
  }
  return markers;
}

function markerDedupKey(marker: ReportMarker) {
  return `${marker.position}:${marker.raw}:${marker.type}`;
}

export function normalizeReportMarkers(value: unknown, source: ReportMarkerSource = 'ocr') {
  if (!value) return [];
  const rawMarkers = Array.isArray(value) ? value : [value];
  const markers: ReportMarker[] = [];
  const seen = new Set<string>();
  for (const item of rawMarkers) {
    const itemSource = typeof item === 'object' && item
      && ['ocr', 'derived', 'manual'].includes(String((item as any).source))
      ? (item as any).source as ReportMarkerSource
      : source;
    const raw = typeof item === 'object' && item
      ? (item as any).raw || (item as any).symbol || (item as any).marker
      : item;
    for (const marker of normalizeMarker(raw, itemSource)) {
      const key = markerDedupKey(marker);
      if (seen.has(key)) continue;
      seen.add(key);
      markers.push(marker);
    }
  }
  return markers;
}

export function extractMetricReportMarkers(value: unknown, source: ReportMarkerSource = 'ocr') {
  const originalName = compactText(value);
  if (!originalName) {
    return {
      originalName: '',
      markedName: '',
      cleanName: '',
      markerText: '',
      markers: [] as ReportMarker[]
    };
  }
  const match = originalName.match(markerPrefixPattern);
  if (!match) {
    return {
      originalName,
      markedName: originalName,
      cleanName: originalName,
      markerText: '',
      markers: [] as ReportMarker[]
    };
  }
  const markerText = compactText(match[1]).replace(/\s+/g, '');
  const cleanName = originalName.slice(match[0].length).trim();
  const markedName = `${markerText}${cleanName ? ` ${cleanName}` : ''}`.trim();
  return {
    originalName,
    markedName,
    cleanName: cleanName || originalName,
    markerText,
    markers: normalizeReportMarkers(markerText, source)
  };
}

export function stripMetricReportMarkers(value: unknown) {
  return extractMetricReportMarkers(value).cleanName;
}

export function mergeReportMarkers(...values: unknown[]) {
  const markers: ReportMarker[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    for (const marker of normalizeReportMarkers(value, 'derived')) {
      const key = markerDedupKey(marker);
      if (seen.has(key)) continue;
      seen.add(key);
      markers.push(marker);
    }
  }
  return markers;
}
