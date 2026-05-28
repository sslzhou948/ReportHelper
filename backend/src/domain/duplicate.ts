export type DuplicateMetric = {
  metricKey?: string;
  metricName?: string;
  valueType?: 'quantitative' | 'qualitative' | string;
  valueNumeric?: number | string | null;
  valueQualitative?: string | null;
  unit?: string | null;
};

export type DuplicateReportIdentity = {
  profileId: string;
  reportId?: string;
  draftId?: string;
  reportDate: string;
  typeKey: string;
  type?: string;
  hospital?: string;
  examPart?: string | null;
  examMethod?: string | null;
  modality?: string;
  metrics?: DuplicateMetric[];
};

export type DuplicateCandidate = {
  draftId?: string;
  existingReportId?: string;
  matchLevel: 'strong' | 'possible';
  suggestedDecision: 'replace' | 'skip';
  matchReason: {
    sameProfile: boolean;
    sameReportDate: boolean;
    sameTypeKey: boolean;
    sameExamPart: boolean;
    sameExamMethod: boolean;
    sameHospital: boolean;
    metricOverlapRatio: number;
    sameResultRatio: number;
  };
};

function sameText(a?: string | null, b?: string | null): boolean {
  return String(a || '').trim() === String(b || '').trim();
}

export function normalizeHospitalName(value?: string | null): string {
  return String(value || '')
    .replace(/[（）()]/g, '')
    .replace(/北京|上海|广州|深圳/g, '')
    .replace(/大学|医学院|附属|有限公司/g, '')
    .replace(/医院|门诊部|院区|总院|分院/g, '')
    .replace(/\s+/g, '')
    .trim();
}

export function sameHospitalName(a?: string | null, b?: string | null): boolean {
  const left = normalizeHospitalName(a);
  const right = normalizeHospitalName(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function metricValueSignature(metric: DuplicateMetric): string {
  const valueType = metric.valueType || 'quantitative';
  const value = valueType === 'qualitative' ? metric.valueQualitative : metric.valueNumeric;
  return `${metric.metricKey || metric.metricName || ''}:${valueType}:${String(value ?? '').trim()}:${metric.unit || ''}`;
}

export function compareMetricResults(incomingMetrics: DuplicateMetric[] = [], existingMetrics: DuplicateMetric[] = []) {
  const incoming = incomingMetrics.filter((metric) => metric.metricKey);
  const existingByKey = existingMetrics.reduce<Record<string, DuplicateMetric>>((acc, metric) => {
    if (metric.metricKey) acc[metric.metricKey] = metric;
    return acc;
  }, {});
  if (!incoming.length) return { metricOverlapRatio: 0, sameResultRatio: 0 };

  let overlapCount = 0;
  let sameResultCount = 0;
  for (const metric of incoming) {
    const existing = existingByKey[metric.metricKey || ''];
    if (!existing) continue;
    overlapCount += 1;
    if (metricValueSignature(metric) === metricValueSignature(existing)) {
      sameResultCount += 1;
    }
  }

  return {
    metricOverlapRatio: overlapCount / incoming.length,
    sameResultRatio: sameResultCount / incoming.length
  };
}

export function findDuplicateCandidates(
  incomingReports: DuplicateReportIdentity[],
  existingReports: DuplicateReportIdentity[]
): DuplicateCandidate[] {
  const candidates: DuplicateCandidate[] = [];

  for (const incoming of incomingReports) {
    for (const existing of existingReports) {
      const sameProfile = sameText(incoming.profileId, existing.profileId);
      const sameReportDate = sameText(incoming.reportDate, existing.reportDate);
      const sameTypeKey = sameText(incoming.typeKey, existing.typeKey);
      const sameExamPart = sameText(incoming.examPart, existing.examPart);
      const sameExamMethod = sameText(incoming.examMethod, existing.examMethod);
      if (!sameProfile || !sameReportDate || !sameTypeKey || !sameExamPart || !sameExamMethod) continue;

      const sameHospital = sameHospitalName(incoming.hospital, existing.hospital);
      const { metricOverlapRatio, sameResultRatio } = compareMetricResults(incoming.metrics, existing.metrics);
      const isImaging = incoming.modality === 'imaging' || existing.modality === 'imaging';
      const resultMatches = isImaging || sameResultRatio >= 0.8;
      const highOverlap = isImaging || metricOverlapRatio >= 0.8;
      if (!sameHospital && !resultMatches && !highOverlap) continue;

      candidates.push({
        draftId: incoming.draftId,
        existingReportId: existing.reportId,
        matchLevel: resultMatches || sameHospital ? 'strong' : 'possible',
        suggestedDecision: resultMatches || sameHospital ? 'replace' : 'skip',
        matchReason: {
          sameProfile,
          sameReportDate,
          sameTypeKey,
          sameExamPart,
          sameExamMethod,
          sameHospital,
          metricOverlapRatio,
          sameResultRatio
        }
      });
    }
  }

  return candidates;
}
