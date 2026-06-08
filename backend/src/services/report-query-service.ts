import type { Prisma, PrismaClient } from '@prisma/client';
import { extractMetricReportMarkers } from '../domain/report-markers.js';
import { normalizeMetricCategory } from '../domain/metric-category.js';
import { canonicalMetricKey } from '../domain/metric-key.js';

type ReportWithMetrics = {
  id: string;
  profileId: string;
  type: string;
  originalType: string;
  typeKey: string;
  canonicalTypeName: string;
  modality: string;
  examPart: string | null;
  examMethod: string | null;
  analysisPolicy: string;
  hospital: string;
  reportDate: Date;
  findings: Prisma.JsonValue;
  warnings: Prisma.JsonValue;
  abnormalCount: number;
  note: string | null;
  metrics?: MetricRow[];
};

type MetricRow = {
  id: string;
  reportId: string;
  profileId: string;
  metricKey: string;
  metricName: string;
  originalMetricName: string;
  category: string;
  categoryCn: string;
  mappingStatus: string;
  valueType: string;
  valueNumeric: Prisma.Decimal | number | string | null;
  valueQualitative: string | null;
  unit: string | null;
  normalizedUnit: string | null;
  refRangeLow: Prisma.Decimal | number | string | null;
  refRangeHigh: Prisma.Decimal | number | string | null;
  refQualitative: string | null;
  refText: string | null;
  tone: string;
  ocrConfidence: Prisma.Decimal | number | string | null;
  isManuallyEdited: boolean;
  reportDate: Date;
};

type MetricHistoryRow = ReturnType<typeof serializeMetric> & {
  reportId: string;
  reportDate: string;
  hospital: string;
};

type ManualEntryTemplateInput = {
  metricKey?: string;
  metricName?: string;
  category?: string;
  categoryCn?: string;
  valueType?: string;
  unit?: string;
  refRangeLow?: unknown;
  refRangeHigh?: unknown;
  refQualitative?: string;
  refText?: string;
};

type DateRangeParams = {
  since?: string;
  until?: string;
};

type MetricRowOptions = {
  includePending?: boolean;
  includeConflicted?: boolean;
  includeTextPending?: boolean;
};

function toDateOnly(value: Date | string) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value || '').slice(0, 10);
}

function toNumber(value: Prisma.Decimal | number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function toJsonArray(value: Prisma.JsonValue): unknown[] {
  return Array.isArray(value) ? value : [];
}

function compactString(value: unknown) {
  return String(value || '').trim();
}

function parseDateBound(value?: string) {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function inDateRange(value: Date | string, params: DateRangeParams = {}) {
  const date = value instanceof Date ? value : new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return false;
  const since = parseDateBound(params.since);
  const until = parseDateBound(params.until);
  if (since && date < since) return false;
  if (until && date > until) return false;
  return true;
}

function isAbnormalTone(tone: unknown) {
  return ['high', 'low', 'abnormal', 'positive'].includes(compactString(tone));
}

function normalizedTone(value: unknown) {
  const tone = compactString(value);
  return ['low', 'ok', 'high', 'abnormal', 'unknown', 'positive'].includes(tone) ? tone : '';
}

function metricMappingStatus(metric: { mappingStatus?: unknown }) {
  return compactString(metric.mappingStatus) || 'confirmed';
}

function shouldIncludeMetricRow(metric: MetricRow, options: MetricRowOptions = {}) {
  const status = metricMappingStatus(metric);
  if (status === 'conflicted' && !options.includeConflicted) return false;
  if (status === 'pending') {
    if (!options.includePending) return false;
    if (metric.valueType === 'text' && !options.includeTextPending) return false;
  }
  return true;
}

function trendFor(rows: MetricHistoryRow[]) {
  const numeric = rows
    .filter((row) => row.valueType !== 'qualitative' && typeof row.valueNumeric === 'number')
    .sort((a, b) => new Date(a.reportDate).getTime() - new Date(b.reportDate).getTime());
  if (!numeric.length) return { direction: 'none', label: '无趋势' };
  if (numeric.length === 1) return { direction: 'new', label: '首次记录' };

  const recent = numeric.slice(-3);
  const first = recent[0].valueNumeric || 0;
  const last = recent[recent.length - 1].valueNumeric || 0;
  const span = recent
    .map((item) => {
      if (typeof item.refRangeLow === 'number' && typeof item.refRangeHigh === 'number') {
        return Math.abs(item.refRangeHigh - item.refRangeLow);
      }
      return null;
    })
    .find((value) => value && value > 0) || 1;
  const delta = ((last - first) / span) * 100;
  const abs = Math.abs(delta);
  if (abs <= 5) return { direction: 'flat', label: '平稳' };
  if (delta > 15) return { direction: 'up', label: '持续上升' };
  if (delta > 5) return { direction: 'up', label: '略上升' };
  if (delta < -15) return { direction: 'down', label: '持续下降' };
  return { direction: 'down', label: '略下降' };
}

function serializeMetric(metric: MetricRow) {
  const markerInfo = extractMetricReportMarkers(metric.originalMetricName || metric.metricName, 'derived');
  const metricKey = canonicalMetricKey(metric, { fallback: metric.metricKey || metric.metricName || 'unknown' });
  const categoryInfo = normalizeMetricCategory(metric);
  return {
    id: metric.id,
    reportId: metric.reportId,
    profileId: metric.profileId,
    metricKey,
    metricName: metric.metricName,
    originalMetricName: metric.originalMetricName,
    reportMarkers: markerInfo.markers,
    category: categoryInfo.category,
    categoryCn: categoryInfo.categoryCn,
    mappingStatus: metric.mappingStatus,
    valueType: metric.valueType,
    valueNumeric: toNumber(metric.valueNumeric),
    valueQualitative: metric.valueQualitative,
    unit: metric.unit,
    normalizedUnit: metric.normalizedUnit,
    refRangeLow: toNumber(metric.refRangeLow),
    refRangeHigh: toNumber(metric.refRangeHigh),
    refQualitative: metric.refQualitative,
    refText: metric.refText,
    tone: metric.tone,
    ocrConfidence: toNumber(metric.ocrConfidence),
    isManuallyEdited: metric.isManuallyEdited
  };
}

function serializeReport(report: ReportWithMetrics) {
  return {
    id: report.id,
    profileId: report.profileId,
    type: report.type,
    originalType: report.originalType,
    typeKey: report.typeKey,
    canonicalTypeName: report.canonicalTypeName,
    modality: report.modality,
    examPart: report.examPart || '',
    examMethod: report.examMethod || '',
    analysisPolicy: report.analysisPolicy,
    hospital: report.hospital,
    reportDate: toDateOnly(report.reportDate),
    findings: toJsonArray(report.findings),
    warnings: toJsonArray(report.warnings),
    abnormalCount: report.abnormalCount,
    note: report.note || '',
    metrics: (report.metrics || []).map(serializeMetric)
  };
}

function groupMetrics(metrics: ReturnType<typeof serializeMetric>[]) {
  return Object.values(metrics.reduce<Record<string, { category: string; categoryCn: string; items: typeof metrics }>>((acc, row) => {
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
  }, {}));
}

async function ensureProfileForUser(prisma: PrismaClient, profileId: string, userId: string) {
  return prisma.profile.findFirst({
    where: {
      id: profileId,
      userId,
      deletedAt: null
    }
  });
}

function manualTemplateStore(prisma: PrismaClient) {
  return (prisma as unknown as {
    manualEntryTemplate: {
      findMany: (args: unknown) => Promise<Record<string, unknown>[]>;
      findFirst: (args: unknown) => Promise<Record<string, unknown> | null>;
      create: (args: unknown) => Promise<Record<string, unknown>>;
      update: (args: unknown) => Promise<Record<string, unknown>>;
    };
  }).manualEntryTemplate;
}

function serializeManualEntryTemplate(row: Record<string, unknown>) {
  return {
    id: String(row.id || ''),
    profileId: String(row.profileId || ''),
    metricKey: String(row.metricKey || ''),
    metricName: String(row.metricName || ''),
    category: String(row.category || 'lab'),
    categoryCn: String(row.categoryCn || '检验'),
    valueType: String(row.valueType || 'quantitative'),
    unit: String(row.unit || ''),
    refRangeLow: toNumber(row.refRangeLow as Prisma.Decimal | number | string | null | undefined),
    refRangeHigh: toNumber(row.refRangeHigh as Prisma.Decimal | number | string | null | undefined),
    refQualitative: String(row.refQualitative || ''),
    refText: String(row.refText || ''),
    status: String(row.status || 'active'),
    source: String(row.source || 'custom'),
    createdAt: row.createdAt instanceof Date ? row.createdAt.getTime() : row.createdAt,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.getTime() : row.updatedAt
  };
}

function manualTemplateData(input: ManualEntryTemplateInput, fallbackMetricKey?: string) {
  const metricName = compactString(input.metricName);
  const valueType = compactString(input.valueType) || 'quantitative';
  const textOnly = valueType === 'text';
  return {
    metricKey: compactString(input.metricKey) || fallbackMetricKey || `custom_${Date.now()}`,
    metricName,
    category: compactString(input.category) || 'lab',
    categoryCn: compactString(input.categoryCn) || '检验',
    valueType,
    unit: textOnly ? null : compactString(input.unit) || null,
    refRangeLow: textOnly ? null : toNumber(input.refRangeLow as Prisma.Decimal | number | string | null | undefined),
    refRangeHigh: textOnly ? null : toNumber(input.refRangeHigh as Prisma.Decimal | number | string | null | undefined),
    refQualitative: textOnly ? null : compactString(input.refQualitative) || null,
    refText: compactString(input.refText) || null,
    source: 'custom',
    status: 'active',
    archivedAt: null
  };
}

export async function listManualEntryTemplates(prisma: PrismaClient, profileId: string, userId: string) {
  const profile = await ensureProfileForUser(prisma, profileId, userId);
  if (!profile) return null;
  const rows = await manualTemplateStore(prisma).findMany({
    where: {
      profileId,
      userId,
      status: {
        not: 'archived'
      }
    },
    orderBy: [
      { updatedAt: 'desc' },
      { createdAt: 'desc' }
    ]
  });
  return rows.map(serializeManualEntryTemplate);
}

export async function saveManualEntryTemplate(prisma: PrismaClient, profileId: string, userId: string, input: ManualEntryTemplateInput) {
  const profile = await ensureProfileForUser(prisma, profileId, userId);
  if (!profile) return null;
  const fallbackMetricKey = `custom_${Date.now()}`;
  const data = manualTemplateData(input, fallbackMetricKey);
  const store = manualTemplateStore(prisma);
  const existing = await store.findFirst({
    where: {
      profileId,
      userId,
      metricKey: data.metricKey
    }
  });
  const saved = existing
    ? await store.update({
      where: { id: existing.id },
      data
    })
    : await store.create({
      data: {
        profileId,
        userId,
        ...data
      }
    });
  return serializeManualEntryTemplate(saved);
}

export async function archiveManualEntryTemplate(prisma: PrismaClient, profileId: string, userId: string, metricKey: string) {
  const profile = await ensureProfileForUser(prisma, profileId, userId);
  if (!profile) return null;
  const store = manualTemplateStore(prisma);
  const existing = await store.findFirst({
    where: {
      profileId,
      userId,
      metricKey
    }
  });
  if (!existing) return null;
  await store.update({
    where: { id: existing.id },
    data: {
      status: 'archived',
      archivedAt: new Date()
    }
  });
  return { ok: true };
}

export async function listReportsForProfile(prisma: PrismaClient, profileId: string, userId: string, params: DateRangeParams & { limit?: number } = {}) {
  const profile = await ensureProfileForUser(prisma, profileId, userId);
  if (!profile) return null;
  const reports = await prisma.report.findMany({
    where: {
      profileId,
      deletedAt: null
    },
    orderBy: [
      { reportDate: 'desc' },
      { createdAt: 'desc' }
    ],
    include: {
      metrics: {
        orderBy: { createdAt: 'asc' }
      }
    }
  });
  return reports
    .filter((report) => inDateRange((report as unknown as ReportWithMetrics).reportDate, params))
    .slice(0, params.limit && params.limit > 0 ? params.limit : undefined)
    .map((report) => serializeReport(report as unknown as ReportWithMetrics));
}

export async function getReportDetail(prisma: PrismaClient, reportId: string, userId: string) {
  const report = await prisma.report.findFirst({
    where: {
      id: reportId,
      deletedAt: null,
      profile: {
        userId,
        deletedAt: null
      }
    },
    include: {
      metrics: {
        orderBy: { createdAt: 'asc' }
      }
    }
  });
  if (!report) return null;
  const serialized = serializeReport(report as unknown as ReportWithMetrics);
  return {
    report: serialized,
    groups: groupMetrics(serialized.metrics)
  };
}

function calculateMetricTone(metric: { valueType?: string; valueNumeric?: unknown; valueQualitative?: unknown; refRangeLow?: unknown; refRangeHigh?: unknown; tone?: unknown }) {
  if (metric.valueType === 'text') return 'unknown';
  if (metric.valueType === 'qualitative') {
    const value = String(metric.valueQualitative || '');
    return value && value !== '阴性' ? 'positive' : 'ok';
  }
  const value = toNumber(metric.valueNumeric as Prisma.Decimal | number | string | null | undefined);
  const low = toNumber(metric.refRangeLow as Prisma.Decimal | number | string | null | undefined);
  const high = toNumber(metric.refRangeHigh as Prisma.Decimal | number | string | null | undefined);
  if (value === null) return 'unknown';
  if (low !== null && value < low) return 'low';
  if (high !== null && value > high) return 'high';
  if (low !== null || high !== null) return 'ok';
  return normalizedTone(metric.tone) || 'unknown';
}

function metricUpdateData(metric: Record<string, unknown>) {
  const valueType = String(metric.valueType || 'quantitative');
  const categoryInfo = normalizeMetricCategory(metric);
  return {
    metricName: String(metric.metricName || metric.metricKey || '未知指标'),
    originalMetricName: String(metric.originalMetricName || metric.metricName || metric.metricKey || '未知指标'),
    category: categoryInfo.category,
    categoryCn: categoryInfo.categoryCn,
    mappingStatus: String(metric.mappingStatus || 'confirmed'),
    valueType,
    valueNumeric: valueType === 'quantitative' ? toNumber(metric.valueNumeric as Prisma.Decimal | number | string | null | undefined) : null,
    valueQualitative: ['qualitative', 'text'].includes(valueType) ? String(metric.valueQualitative || '') : null,
    unit: metric.unit !== undefined ? String(metric.unit || '') : null,
    normalizedUnit: metric.normalizedUnit ? String(metric.normalizedUnit) : null,
    refRangeLow: toNumber(metric.refRangeLow as Prisma.Decimal | number | string | null | undefined),
    refRangeHigh: toNumber(metric.refRangeHigh as Prisma.Decimal | number | string | null | undefined),
    refQualitative: metric.refQualitative ? String(metric.refQualitative) : null,
    refText: metric.refText ? String(metric.refText) : null,
    tone: calculateMetricTone(metric),
    ocrConfidence: toNumber(metric.ocrConfidence as Prisma.Decimal | number | string | null | undefined),
    isManuallyEdited: !!metric.isManuallyEdited
  };
}

function metricCreateData(report: ReportWithMetrics, metric: Record<string, unknown>, index: number) {
  const metricKey = canonicalMetricKey(metric, { fallback: `manual_metric_${Date.now()}_${index}` });
  return {
    reportId: report.id,
    profileId: report.profileId,
    metricKey,
    reportDate: report.reportDate,
    ...metricUpdateData(metric)
  };
}

function reportUpdateData(payload: { basicInfo?: Record<string, unknown>; findings?: unknown[]; warnings?: unknown[] }, report: ReportWithMetrics) {
  const info = payload.basicInfo || {};
  return {
    type: info.type !== undefined ? String(info.type) : report.type,
    originalType: info.originalType !== undefined ? String(info.originalType) : report.originalType,
    canonicalTypeName: info.canonicalTypeName !== undefined ? String(info.canonicalTypeName) : report.canonicalTypeName,
    modality: info.modality !== undefined ? String(info.modality) : report.modality,
    examPart: info.examPart !== undefined ? String(info.examPart || '') : report.examPart,
    examMethod: info.examMethod !== undefined ? String(info.examMethod || '') : report.examMethod,
    hospital: info.hospital !== undefined ? String(info.hospital) : report.hospital,
    hospitalSource: info.hospital !== undefined ? 'user_edited' : undefined,
    reportDate: info.reportDate !== undefined ? new Date(String(info.reportDate)) : report.reportDate,
    reportDateSource: info.reportDate !== undefined ? 'user_edited' : undefined,
    findings: payload.findings !== undefined ? payload.findings as Prisma.InputJsonValue : report.findings as Prisma.InputJsonValue,
    warnings: payload.warnings !== undefined ? payload.warnings as Prisma.InputJsonValue : report.warnings as Prisma.InputJsonValue,
    note: info.note !== undefined ? String(info.note || '') : report.note
  };
}

export async function updateReportDetail(prisma: PrismaClient, reportId: string, userId: string, payload: { basicInfo?: Record<string, unknown>; metrics?: Array<Record<string, unknown>>; findings?: unknown[]; warnings?: unknown[] }) {
  const updatedId = await prisma.$transaction(async (tx) => {
    const report = await tx.report.findFirst({
      where: {
        id: reportId,
        deletedAt: null,
        profile: {
          userId,
          deletedAt: null
        }
      },
      include: {
        metrics: true
      }
    });
    if (!report) return null;

    let abnormalCount = report.abnormalCount;
    if (payload.metrics) {
      const existingMetricIds = new Set(report.metrics.map((metric) => metric.id));
      const updatedMetrics: Array<{ id: string; data: ReturnType<typeof metricUpdateData> }> = [];
      const createdMetrics: Array<ReturnType<typeof metricCreateData>> = [];
      payload.metrics.forEach((metric, index) => {
        if (metric.id && existingMetricIds.has(String(metric.id))) {
          updatedMetrics.push({
            id: String(metric.id),
            data: metricUpdateData(metric)
          });
          return;
        }
        createdMetrics.push(metricCreateData(report as unknown as ReportWithMetrics, metric, index));
      });

      await tx.reportMetricValue.deleteMany({
        where: {
          reportId: report.id,
          id: {
            notIn: updatedMetrics.map((metric) => metric.id)
          }
        }
      });

      for (const metric of updatedMetrics) {
        await tx.reportMetricValue.update({
          where: { id: metric.id },
          data: metric.data
        });
      }
      if (createdMetrics.length) {
        await tx.reportMetricValue.createMany({
          data: createdMetrics
        });
      }
      abnormalCount = [...updatedMetrics.map((metric) => metric.data), ...createdMetrics]
        .filter((metric) => !['ok', 'unknown'].includes(metric.tone)).length;
    }

    await tx.report.update({
      where: { id: report.id },
      data: {
        ...reportUpdateData(payload, report as unknown as ReportWithMetrics),
        abnormalCount
      }
    });

    return report.id;
  });

  if (!updatedId) return null;
  return getReportDetail(prisma, updatedId, userId);
}

export async function createManualReport(prisma: PrismaClient, profileId: string, userId: string, payload: { reportDate?: string; hospital?: string; note?: string; metric?: Record<string, unknown> }) {
  const metric = payload.metric || {};
  const valueType = String(metric.valueType || 'quantitative');
  const category = String(metric.category || 'lab');
  const isImagingCategory = ['exam', 'imaging', 'ultrasound'].includes(category);
  const isViewOnly = ['exam', 'electrophysiology', 'pathology', 'imaging', 'ultrasound'].includes(category) || valueType === 'text';
  const findings = valueType === 'text' && metric.valueQualitative ? [String(metric.valueQualitative)] : [];
  const reportDate = new Date(String(payload.reportDate || new Date().toISOString().slice(0, 10)));
  const createdId = await prisma.$transaction(async (tx) => {
    const profile = await tx.profile.findFirst({
      where: {
        id: profileId,
        userId,
        deletedAt: null
      }
    });
    if (!profile) return null;

    const metricKey = canonicalMetricKey(metric, { fallback: `manual_metric_${Date.now()}` });
    const metricData = metricUpdateData({
      ...metric,
      metricKey,
      metricName: metric.metricName || '手动指标',
      originalMetricName: metric.originalMetricName || metric.metricName || '手动指标',
      category: metric.category || 'lab',
      categoryCn: metric.categoryCn || '检验',
      mappingStatus: metric.mappingStatus || 'confirmed',
      valueType,
      isManuallyEdited: true
    });
    const report = await tx.report.create({
      data: {
        profileId,
        userId,
        type: String(metric.categoryCn || '手动录入'),
        originalType: String(metric.categoryCn || '手动录入'),
        typeKey: `manual_${category}`,
        canonicalTypeName: String(metric.categoryCn || '手动录入'),
        modality: isImagingCategory ? 'imaging' : 'laboratory',
        examPart: '',
        examMethod: '',
        analysisPolicy: isViewOnly ? 'view_only' : 'metric_analysis',
        hospital: String(payload.hospital || '手动录入'),
        hospitalSource: payload.hospital ? 'user_edited' : 'unknown',
        reportDate,
        reportDateSource: 'user_edited',
        findings,
        warnings: [],
        abnormalCount: ['ok', 'unknown'].includes(metricData.tone) ? 0 : 1,
        note: payload.note ? String(payload.note) : null
      }
    });
    await tx.reportMetricValue.createMany({
      data: [{
        reportId: report.id,
        profileId,
        metricKey,
        reportDate,
        sourcePhotoIds: [],
        ...metricData
      }]
    });
    return report.id;
  });

  if (!createdId) return null;
  return getReportDetail(prisma, createdId, userId);
}

export async function deleteReportForUser(prisma: PrismaClient, reportId: string, userId: string) {
  const report = await prisma.report.findFirst({
    where: {
      id: reportId,
      deletedAt: null,
      profile: {
        userId,
        deletedAt: null
      }
    }
  });
  if (!report) return null;
  await prisma.report.update({
    where: { id: report.id },
    data: { deletedAt: new Date() }
  });
  return { ok: true };
}

export async function listMetricRowsForProfile(prisma: PrismaClient, profileId: string, userId: string, params: DateRangeParams = {}) {
  return listMetricRowsForProfileWithOptions(prisma, profileId, userId, params);
}

async function listMetricRowsForProfileWithOptions(prisma: PrismaClient, profileId: string, userId: string, params: DateRangeParams = {}, options: MetricRowOptions = {}) {
  const profile = await ensureProfileForUser(prisma, profileId, userId);
  if (!profile) return null;
  const reports = await prisma.report.findMany({
    where: {
      profileId,
      deletedAt: null,
      analysisPolicy: {
        not: 'view_only'
      }
    },
    include: {
      metrics: true
    },
    orderBy: [
      { reportDate: 'desc' },
      { createdAt: 'desc' }
    ]
  });

  return (reports as unknown as ReportWithMetrics[])
    .filter((report) => inDateRange(report.reportDate, params))
    .flatMap((report) => (
    (report.metrics || [])
      .filter((metric) => shouldIncludeMetricRow(metric, options))
      .map((metric) => ({
        ...serializeMetric(metric),
        reportId: report.id,
        reportDate: toDateOnly(report.reportDate),
        hospital: report.hospital
      }))
    ));
}

export async function listMetricSnapshots(prisma: PrismaClient, profileId: string, userId: string, params: { filter?: string; category?: string; since?: string; until?: string }) {
  const rows = await listMetricRowsForProfileWithOptions(prisma, profileId, userId, params, { includePending: true });
  if (!rows) return null;
  const pinnedRows = await prisma.userMetricSnapshot.findMany({
    where: {
      profileId,
      isPinned: true
    },
    select: {
      metricKey: true
    }
  });
  const pinnedKeys = new Set(pinnedRows.map((item) => canonicalMetricKey({ metricKey: item.metricKey })));
  const byMetric = rows.reduce<Record<string, MetricHistoryRow[]>>((acc, row) => {
    if (!acc[row.metricKey]) acc[row.metricKey] = [];
    acc[row.metricKey].push(row);
    return acc;
  }, {});

  let snapshots = Object.keys(byMetric).map((metricKey) => {
    const history = byMetric[metricKey].sort((a, b) => new Date(a.reportDate).getTime() - new Date(b.reportDate).getTime());
    const last = history[history.length - 1];
    const trend = trendFor(history);
    return {
      profileId,
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
      measureCount: history.length,
      isPinned: pinnedKeys.has(metricKey)
    };
  });

  if (params.filter === 'abnormal') snapshots = snapshots.filter((item) => isAbnormalTone(item.lastTone));
  if (params.filter === 'pinned') snapshots = snapshots.filter((item) => item.isPinned);
  if (params.category) snapshots = snapshots.filter((item) => item.category === params.category || item.categoryCn === params.category);

  return snapshots.sort((a, b) => {
    const abnormalA = isAbnormalTone(a.lastTone) ? 1 : 0;
    const abnormalB = isAbnormalTone(b.lastTone) ? 1 : 0;
    if (abnormalA !== abnormalB) return abnormalB - abnormalA;
    return new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime();
  });
}

export async function getMetricHistory(prisma: PrismaClient, profileId: string, userId: string, metricKey: string, params: DateRangeParams = {}) {
  const rows = await listMetricRowsForProfileWithOptions(prisma, profileId, userId, params, { includePending: true });
  if (!rows) return null;
  const canonicalKey = canonicalMetricKey({ metricKey });
  const history = rows
    .filter((row) => row.metricKey === canonicalKey)
    .sort((a, b) => new Date(b.reportDate).getTime() - new Date(a.reportDate).getTime());
  return {
    metricKey: canonicalKey,
    metricName: history[0]?.metricName || canonicalKey,
    valueType: history[0]?.valueType || 'quantitative',
    history
  };
}

function pendingCandidateKey(row: MetricHistoryRow) {
  const name = compactString(row.metricName) || compactString(row.originalMetricName) || compactString(row.metricKey);
  return [
    name.toLowerCase(),
    compactString(row.unit).toLowerCase(),
    compactString(row.category).toLowerCase(),
    compactString(row.valueType).toLowerCase()
  ].join('|');
}

function addCompact(set: Set<string>, value: unknown) {
  const text = compactString(value);
  if (text) set.add(text);
}

export async function listPendingMetricCandidates(prisma: PrismaClient, profileId: string, userId: string, params: DateRangeParams = {}) {
  const rows = await listMetricRowsForProfileWithOptions(prisma, profileId, userId, params, {
    includePending: true,
    includeTextPending: true
  });
  if (!rows) return null;

  const groups = rows
    .filter((row) => metricMappingStatus(row) === 'pending')
    .reduce<Record<string, {
      candidateKey: string;
      metricName: string;
      category: string;
      categoryCn: string;
      valueType: string;
      rows: MetricHistoryRow[];
      metricKeys: Set<string>;
      originalMetricNames: Set<string>;
      units: Set<string>;
      refTexts: Set<string>;
      reportIds: Set<string>;
    }>>((acc, row) => {
      const key = pendingCandidateKey(row);
      if (!acc[key]) {
        acc[key] = {
          candidateKey: key,
          metricName: row.metricName || row.originalMetricName || row.metricKey,
          category: row.category || 'other',
          categoryCn: row.categoryCn || 'Other',
          valueType: row.valueType || 'quantitative',
          rows: [],
          metricKeys: new Set<string>(),
          originalMetricNames: new Set<string>(),
          units: new Set<string>(),
          refTexts: new Set<string>(),
          reportIds: new Set<string>()
        };
      }
      acc[key].rows.push(row);
      addCompact(acc[key].metricKeys, row.metricKey);
      addCompact(acc[key].originalMetricNames, row.originalMetricName);
      addCompact(acc[key].units, row.unit);
      addCompact(acc[key].refTexts, row.refText);
      addCompact(acc[key].reportIds, row.reportId);
      return acc;
    }, {});

  return Object.values(groups).map((group) => {
    const byDateAsc = [...group.rows].sort((a, b) => new Date(a.reportDate).getTime() - new Date(b.reportDate).getTime());
    const byDateDesc = [...byDateAsc].reverse();
    return {
      candidateKey: group.candidateKey,
      metricKey: [...group.metricKeys][0] || '',
      metricKeys: [...group.metricKeys],
      metricName: group.metricName,
      originalMetricNames: [...group.originalMetricNames].slice(0, 5),
      category: group.category,
      categoryCn: group.categoryCn,
      valueType: group.valueType,
      units: [...group.units],
      refTexts: [...group.refTexts].slice(0, 5),
      occurrenceCount: group.rows.length,
      reportCount: group.reportIds.size,
      abnormalCount: group.rows.filter((row) => isAbnormalTone(row.tone)).length,
      firstSeenAt: byDateAsc[0]?.reportDate || '',
      latestSeenAt: byDateDesc[0]?.reportDate || '',
      examples: byDateDesc.slice(0, 3).map((row) => ({
        reportId: row.reportId,
        reportDate: row.reportDate,
        hospital: row.hospital,
        metricKey: row.metricKey,
        originalMetricName: row.originalMetricName,
        valueNumeric: row.valueNumeric,
        valueQualitative: row.valueQualitative,
        unit: row.unit,
        tone: row.tone,
        refText: row.refText
      }))
    };
  }).sort((a, b) => {
    if (a.occurrenceCount !== b.occurrenceCount) return b.occurrenceCount - a.occurrenceCount;
    return new Date(b.latestSeenAt).getTime() - new Date(a.latestSeenAt).getTime();
  });
}

export async function setMetricPinned(prisma: PrismaClient, profileId: string, userId: string, metricKey: string, isPinned: boolean) {
  const canonicalKey = canonicalMetricKey({ metricKey });
  const snapshots = await listMetricSnapshots(prisma, profileId, userId, {});
  if (!snapshots) return null;
  const snapshot = snapshots.find((item) => item.metricKey === canonicalKey);
  if (!snapshot) {
    return null;
  }
  const lastDate = new Date(`${snapshot.lastDate}T00:00:00.000Z`);
  const snapshotData = {
    profileId: snapshot.profileId,
    metricKey: snapshot.metricKey,
    metricName: snapshot.metricName,
    category: snapshot.category,
    categoryCn: snapshot.categoryCn,
    valueType: snapshot.valueType,
    lastValueNumeric: snapshot.lastValueNumeric,
    lastValueQualitative: snapshot.lastValueQualitative,
    unit: snapshot.unit,
    lastDate,
    lastReportId: snapshot.lastReportId,
    lastTone: snapshot.lastTone,
    trendDirection: snapshot.trendDirection,
    trendLabel: snapshot.trendLabel,
    measureCount: snapshot.measureCount
  };

  await prisma.userMetricSnapshot.upsert({
    where: {
      profileId_metricKey: {
        profileId,
        metricKey: canonicalKey
      }
    },
    update: {
      ...snapshotData,
      isPinned
    },
    create: {
      ...snapshotData,
      isPinned
    }
  });

  return {
    ...snapshot,
    isPinned
  };
}
