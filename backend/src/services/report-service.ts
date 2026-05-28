import { Prisma, type PrismaClient } from '@prisma/client';
import { findDuplicateCandidates, type DuplicateReportIdentity, type DuplicateCandidate } from '../domain/duplicate.js';

type JsonObject = Record<string, any>;

type DraftLike = {
  id: string;
  profileId: string;
  ocrTaskId: string;
  sourcePhotoIds: Prisma.JsonValue;
  pageCount: number;
  basicInfo: Prisma.JsonValue;
  metrics: Prisma.JsonValue;
  findings: Prisma.JsonValue;
  conflicts: Prisma.JsonValue;
  warnings: Prisma.JsonValue;
  status: string;
};

type ReportLike = {
  id: string;
  profileId: string;
  type: string;
  typeKey: string;
  hospital: string;
  reportDate: Date;
  modality: string;
  examPart: string | null;
  examMethod: string | null;
  metrics?: Array<{
    metricKey: string;
    metricName: string;
    valueType: string;
    valueNumeric: Prisma.Decimal | number | string | null;
    valueQualitative: string | null;
    unit: string | null;
  }>;
};

export type DuplicateDecision = {
  draftId: string;
  decision: 'replace' | 'keep_both' | 'skip';
  existingReportId?: string;
};

export type BatchCreateReportsInput = {
  profileId: string;
  userId: string;
  ocrTaskId: string;
  duplicateDecisions?: DuplicateDecision[];
};

export class DuplicateReportRequiresDecisionError extends Error {
  code = 'DUPLICATE_REPORT_REQUIRES_DECISION';
  statusCode = 409;

  constructor(public candidates: DuplicateCandidate[]) {
    super('发现相似报告，请选择覆盖旧报告或跳过重复报告');
  }
}

function toPlainObject(value: Prisma.JsonValue): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as JsonObject;
}

function toArray<T = JsonObject>(value: Prisma.JsonValue): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function toInputJson(value: Prisma.JsonValue): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null ? Prisma.JsonNull : value as Prisma.InputJsonValue;
}

function toNullableInputJson(value: Prisma.JsonValue): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  return value === null ? Prisma.JsonNull : value as Prisma.InputJsonValue;
}

function toDateOnly(value: Date | string): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value || '').slice(0, 10);
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function calculateTone(metric: JsonObject): string {
  if (metric.tone) return String(metric.tone);
  if (metric.valueType === 'qualitative') {
    return metric.valueQualitative && metric.valueQualitative !== '阴性' ? 'positive' : 'ok';
  }
  const value = toNumberOrNull(metric.valueNumeric);
  const low = toNumberOrNull(metric.refRangeLow);
  const high = toNumberOrNull(metric.refRangeHigh);
  if (value === null) return 'unknown';
  if (low !== null && value < low) return 'low';
  if (high !== null && value > high) return 'high';
  return 'ok';
}

function metricValueSignature(metric: JsonObject): string {
  const valueType = String(metric.valueType || 'quantitative');
  const value = valueType === 'qualitative'
    ? String(metric.valueQualitative || '').trim()
    : String(metric.valueNumeric ?? '').trim();
  return [
    String(metric.metricKey || metric.metricName || 'unknown'),
    valueType,
    value,
    String(metric.unit || '').trim()
  ].join('|');
}

function metricConfidence(metric: JsonObject): number {
  const value = toNumberOrNull(metric.ocrConfidence);
  return value === null ? 0 : value;
}

function dedupeMetrics(metrics: JsonObject[]) {
  const bySignature = new Map<string, JsonObject>();
  for (const metric of metrics) {
    const signature = metricValueSignature(metric);
    const existing = bySignature.get(signature);
    if (!existing || metricConfidence(metric) > metricConfidence(existing)) {
      bySignature.set(signature, metric);
    }
  }
  return [...bySignature.values()];
}

function analysisPolicy(info: JsonObject, draft: DraftLike): string {
  if (info.analysisPolicy) return String(info.analysisPolicy);
  const draftPolicy = (toPlainObject(draft.basicInfo).analysisPolicy || (draft as any).analysisPolicy) as string | undefined;
  if (draftPolicy) return draftPolicy;
  return info.modality === 'imaging' ? 'view_only' : 'metric_analysis';
}

function draftIdentity(draft: DraftLike): DuplicateReportIdentity {
  const info = toPlainObject(draft.basicInfo);
  return {
    profileId: draft.profileId,
    draftId: draft.id,
    reportDate: String(info.reportDate || ''),
    typeKey: String(info.typeKey || 'unknown'),
    type: String(info.type || '待确认报告'),
    hospital: String(info.hospital || ''),
    examPart: String(info.examPart || ''),
    examMethod: String(info.examMethod || ''),
    modality: String(info.modality || 'laboratory'),
    metrics: toArray<JsonObject>(draft.metrics)
  };
}

function reportIdentity(report: ReportLike): DuplicateReportIdentity {
  return {
    profileId: report.profileId,
    reportId: report.id,
    reportDate: toDateOnly(report.reportDate),
    typeKey: report.typeKey,
    type: report.type,
    hospital: report.hospital,
    examPart: report.examPart || '',
    examMethod: report.examMethod || '',
    modality: report.modality,
    metrics: (report.metrics || []).map((metric) => ({
      metricKey: metric.metricKey,
      metricName: metric.metricName,
      valueType: metric.valueType,
      valueNumeric: metric.valueNumeric === null ? null : String(metric.valueNumeric),
      valueQualitative: metric.valueQualitative,
      unit: metric.unit
    }))
  };
}

function reportCreateData(draft: DraftLike, userId: string) {
  const info = toPlainObject(draft.basicInfo);
  const metrics = dedupeMetrics(toArray<JsonObject>(draft.metrics));
  const abnormalCount = metrics.filter((metric) => {
    const tone = calculateTone(metric);
    return tone !== 'ok' && tone !== 'unknown';
  }).length;

  return {
    profileId: draft.profileId,
    userId,
    ocrTaskId: draft.ocrTaskId,
    draftId: draft.id,
    type: String(info.type || '待确认报告'),
    originalType: String(info.originalType || info.type || '待确认报告'),
    typeKey: String(info.typeKey || 'unknown'),
    canonicalTypeName: String(info.canonicalTypeName || info.type || '待确认报告'),
    modality: String(info.modality || 'laboratory'),
    examPart: String(info.examPart || ''),
    examMethod: String(info.examMethod || ''),
    analysisPolicy: analysisPolicy(info, draft),
    hospital: String(info.hospital || '待确认医院'),
    hospitalSource: String(info.hospitalSource || (info.hospital ? 'ocr' : 'unknown')),
    reportDate: new Date(String(info.reportDate || new Date().toISOString().slice(0, 10))),
    reportDateSource: String(info.reportDateSource || (info.reportDate ? 'ocr' : 'unknown')),
    findings: toInputJson(draft.findings),
    warnings: toInputJson(draft.warnings),
    abnormalCount,
    note: toArray<string>(draft.findings).join('\n') || null
  };
}

function metricCreateData(reportId: string, draft: DraftLike, reportDate: Date) {
  return dedupeMetrics(toArray<JsonObject>(draft.metrics)).map((metric) => {
    const valueType = String(metric.valueType || 'quantitative');
    return {
      reportId,
      profileId: draft.profileId,
      metricKey: String(metric.metricKey || metric.metricName || 'unknown'),
      metricName: String(metric.metricName || metric.metricKey || '未知指标'),
      originalMetricName: String(metric.originalMetricName || metric.metricName || metric.metricKey || '未知指标'),
      category: String(metric.category || 'other'),
      categoryCn: String(metric.categoryCn || '其他'),
      mappingStatus: String(metric.mappingStatus || 'confirmed'),
      valueType,
      valueNumeric: valueType === 'quantitative' ? toNumberOrNull(metric.valueNumeric) : null,
      valueQualitative: valueType === 'qualitative' ? String(metric.valueQualitative || '') : null,
      unit: metric.unit ? String(metric.unit) : null,
      normalizedUnit: metric.normalizedUnit ? String(metric.normalizedUnit) : null,
      refRangeLow: toNumberOrNull(metric.refRangeLow),
      refRangeHigh: toNumberOrNull(metric.refRangeHigh),
      refQualitative: metric.refQualitative ? String(metric.refQualitative) : null,
      refText: metric.refText ? String(metric.refText) : null,
      tone: calculateTone(metric),
      ocrConfidence: toNumberOrNull(metric.ocrConfidence),
      isManuallyEdited: !!metric.isManuallyEdited,
      sourcePhotoIds: toNullableInputJson(draft.sourcePhotoIds),
      reportDate
    };
  });
}

export async function getDraftsForTask(prisma: PrismaClient, profileId: string, ocrTaskId: string): Promise<DraftLike[]> {
  const drafts = await prisma.recognizedReportDraft.findMany({
    where: {
      ocrTaskId,
      profileId
    },
    orderBy: { createdAt: 'asc' }
  });
  return drafts as DraftLike[];
}

export async function checkDuplicateReports(prisma: PrismaClient, profileId: string, drafts: DraftLike[]) {
  const existingReports = await prisma.report.findMany({
    where: {
      profileId,
      deletedAt: null
    },
    include: {
      metrics: true
    }
  });

  return findDuplicateCandidates(
    drafts.map(draftIdentity),
    (existingReports as unknown as ReportLike[]).map(reportIdentity)
  );
}

async function savedReportsForTask(prisma: PrismaClient, profileId: string, ocrTaskId: string) {
  const reports = await prisma.report.findMany({
    where: {
      profileId,
      ocrTaskId,
      deletedAt: null
    },
    orderBy: [
      { reportDate: 'desc' },
      { createdAt: 'desc' }
    ]
  });
  return reports.map((report) => ({
    draftId: report.draftId || '',
    reportId: report.id,
    action: report.replacedByReportId ? 'replaced' : 'created',
    replacedReportId: report.replacedByReportId || null
  }));
}

export async function batchCreateReports(prisma: PrismaClient, input: BatchCreateReportsInput) {
  const duplicateDecisions = input.duplicateDecisions || [];
  const decisionByDraft = new Map(duplicateDecisions.map((decision) => [decision.draftId, decision]));

  return prisma.$transaction(async (tx) => {
    const task = await tx.ocrTask.findFirst({
      where: {
        id: input.ocrTaskId,
        profileId: input.profileId
      }
    });
    if (!task) {
      throw new Error('OCR_TASK_NOT_FOUND');
    }
    if (task?.status === 'confirmed') {
      return savedReportsForTask(tx as PrismaClient, input.profileId, input.ocrTaskId);
    }

    const drafts = await getDraftsForTask(tx as PrismaClient, input.profileId, input.ocrTaskId);
    const candidates = await checkDuplicateReports(tx as PrismaClient, input.profileId, drafts);
    const unresolved = candidates.filter((candidate) => !candidate.draftId || !decisionByDraft.has(candidate.draftId));
    if (unresolved.length) throw new DuplicateReportRequiresDecisionError(unresolved);

    const saved: Array<{ draftId: string; reportId: string; action: string; replacedReportId: string | null }> = [];

    for (const draft of drafts) {
      const decision = decisionByDraft.get(draft.id);
      if (decision?.decision === 'skip') continue;

      let replacedReportId: string | null = null;
      if (decision?.decision === 'replace' && decision.existingReportId) {
        replacedReportId = decision.existingReportId;
        await tx.report.update({
          where: { id: decision.existingReportId },
          data: { deletedAt: new Date() }
        });
      }

      const reportData = reportCreateData(draft, input.userId);
      const report = await tx.report.create({
        data: {
          ...reportData,
          replacedByReportId: replacedReportId
        }
      });

      const metrics = metricCreateData(report.id, draft, report.reportDate);
      if (metrics.length) {
        await tx.reportMetricValue.createMany({ data: metrics });
      }

      saved.push({
        draftId: draft.id,
        reportId: report.id,
        action: replacedReportId ? 'replaced' : 'created',
        replacedReportId
      });
    }

    await tx.ocrTask.update({
      where: { id: input.ocrTaskId },
      data: { status: 'confirmed' }
    });

    return saved;
  });
}
