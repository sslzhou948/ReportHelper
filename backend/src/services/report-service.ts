import { Prisma, type PrismaClient } from '@prisma/client';
import { findDuplicateCandidates, type DuplicateReportIdentity, type DuplicateCandidate } from '../domain/duplicate.js';
import { normalizeMetricCategory } from '../domain/metric-category.js';
import { canonicalMetricKey } from '../domain/metric-key.js';

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
    mappingStatus: string;
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

export class UnresolvedDraftConflictsError extends Error {
  code = 'UNRESOLVED_REPORT_CONFLICTS';
  statusCode = 409;

  constructor(public conflicts: Array<{ draftId: string; conflicts: JsonObject[] }>) {
    super('OCR 结果仍有未处理冲突，请先完成校准后再保存');
  }
}

export class UnreviewedOcrDraftsError extends Error {
  code = 'UNREVIEWED_OCR_DRAFTS';
  statusCode = 409;

  constructor(public drafts: Array<{ draftId: string; status: string; reason: string }>) {
    super('OCR reports still need review or manual completion before saving');
  }
}

export class InvalidDuplicateDecisionError extends Error {
  code = 'INVALID_DUPLICATE_DECISION';
  statusCode = 400;

  constructor() {
    super('重复报告处理参数无效，请重新确认后再保存');
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

function normalizedTone(value: unknown) {
  const tone = String(value || '').trim();
  return ['low', 'ok', 'high', 'abnormal', 'unknown', 'positive'].includes(tone) ? tone : '';
}

function calculateTone(metric: JsonObject): string {
  if (metric.valueType === 'qualitative') {
    return metric.valueQualitative && metric.valueQualitative !== '阴性' ? 'positive' : 'ok';
  }
  const value = toNumberOrNull(metric.valueNumeric);
  const low = toNumberOrNull(metric.refRangeLow);
  const high = toNumberOrNull(metric.refRangeHigh);
  if (value === null) return 'unknown';
  if (low !== null && value < low) return 'low';
  if (high !== null && value > high) return 'high';
  if (low !== null || high !== null) return 'ok';
  return normalizedTone(metric.tone) || 'unknown';
}

function metricValueSignature(metric: JsonObject): string {
  const valueType = String(metric.valueType || 'quantitative');
  const value = valueType === 'qualitative'
    ? String(metric.valueQualitative || '').trim()
    : String(metric.valueNumeric ?? '').trim();
  return [
    canonicalMetricKey(metric, { fallback: metric.metricName || 'unknown' }),
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

function isMissingReportHospital(value: unknown) {
  const text = String(value || '').trim();
  return !text || text === '\u5f85\u786e\u8ba4\u533b\u9662';
}

function isMissingReportDate(value: unknown) {
  const text = String(value || '').trim();
  return !text || text === '\u5f85\u786e\u8ba4\u65e5\u671f';
}

function draftSaveBlockReason(draft: DraftLike) {
  const info = toPlainObject(draft.basicInfo);
  const metrics = toArray<JsonObject>(draft.metrics);
  const findings = toArray<string>(draft.findings).filter((item) => String(item || '').trim());
  if (['needs_manual_input', 'not_report', 'cancelled', 'failed'].includes(draft.status)) {
    return 'status_not_reviewed';
  }
  if (info.reportLike === false) return 'not_report_like';
  if (!metrics.length && !findings.length) return 'empty_report_content';
  if (isMissingReportHospital(info.hospital) || isMissingReportDate(info.reportDate)) return 'missing_basic_info';
  return '';
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
      unit: metric.unit,
      mappingStatus: metric.mappingStatus
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
    const categoryInfo = normalizeMetricCategory(metric);
    const metricKey = canonicalMetricKey(metric, { fallback: metric.metricName || 'unknown' });
    return {
      reportId,
      profileId: draft.profileId,
      metricKey: metricKey || 'unknown',
      metricName: String(metric.metricName || metric.metricKey || '未知指标'),
      originalMetricName: String(metric.originalMetricName || metric.metricName || metric.metricKey || '未知指标'),
      category: categoryInfo.category,
      categoryCn: categoryInfo.categoryCn,
      mappingStatus: String(metric.mappingStatus || 'confirmed'),
      valueType,
      valueNumeric: valueType === 'quantitative' ? toNumberOrNull(metric.valueNumeric) : null,
      valueQualitative: ['qualitative', 'text'].includes(valueType) ? String(metric.valueQualitative || '') : null,
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
  return (drafts as DraftLike[]).filter((draft) => !['superseded', 'discarded'].includes(draft.status));
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
    if (!['needs_confirmation', 'ready_to_save'].includes(task.status)) {
      throw new UnreviewedOcrDraftsError([{
        draftId: '',
        status: task.status,
        reason: task.status === 'queued' || task.status === 'processing'
          ? 'task_still_processing'
          : 'task_not_ready'
      }]);
    }

    const drafts = await getDraftsForTask(tx as PrismaClient, input.profileId, input.ocrTaskId);
    const unresolvedConflicts = drafts
      .map((draft) => ({
        draftId: draft.id,
        conflicts: toArray<JsonObject>(draft.conflicts)
      }))
      .filter((item) => item.conflicts.length > 0);
    if (unresolvedConflicts.length) throw new UnresolvedDraftConflictsError(unresolvedConflicts);

    const blockedDrafts = drafts
      .map((draft) => ({
        draftId: draft.id,
        status: draft.status,
        reason: draftSaveBlockReason(draft)
      }))
      .filter((draft) => draft.reason);
    if (!drafts.length || blockedDrafts.length) {
      throw new UnreviewedOcrDraftsError(
        blockedDrafts.length
          ? blockedDrafts
          : [{ draftId: '', status: 'empty', reason: 'no_reviewable_drafts' }]
      );
    }

    const candidates = await checkDuplicateReports(tx as PrismaClient, input.profileId, drafts);
    const unresolved = candidates.filter((candidate) => !candidate.draftId || !decisionByDraft.has(candidate.draftId));
    if (unresolved.length) throw new DuplicateReportRequiresDecisionError(unresolved);
    const draftIds = new Set(drafts.map((draft) => draft.id));
    const allowedExistingByDraft = candidates.reduce<Map<string, Set<string>>>((acc, candidate) => {
      if (!candidate.draftId || !candidate.existingReportId) return acc;
      if (!acc.has(candidate.draftId)) acc.set(candidate.draftId, new Set());
      acc.get(candidate.draftId)?.add(candidate.existingReportId);
      return acc;
    }, new Map());
    for (const decision of duplicateDecisions) {
      if (!draftIds.has(decision.draftId)) throw new InvalidDuplicateDecisionError();
      if (decision.decision === 'replace') {
        const allowed = decision.existingReportId
          ? allowedExistingByDraft.get(decision.draftId)?.has(decision.existingReportId)
          : false;
        if (!allowed) throw new InvalidDuplicateDecisionError();
      }
    }

    const saved: Array<{ draftId: string; reportId: string; action: string; replacedReportId: string | null }> = [];

    for (const draft of drafts) {
      const decision = decisionByDraft.get(draft.id);
      if (decision?.decision === 'skip') continue;

      let replacedReportId: string | null = null;
      if (decision?.decision === 'replace' && decision.existingReportId) {
        replacedReportId = decision.existingReportId;
        const replaceResult = await tx.report.updateMany({
          where: {
            id: decision.existingReportId,
            profileId: input.profileId,
            deletedAt: null
          },
          data: { deletedAt: new Date() }
        });
        if (replaceResult.count !== 1) throw new InvalidDuplicateDecisionError();
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
