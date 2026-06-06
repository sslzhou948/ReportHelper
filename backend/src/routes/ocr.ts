import fs from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { createOcrProvider, toOcrProviderFailure, type OcrDraft } from '../services/ocr-provider.js';
import { assessOcrImageQuality, type PhotoQualityWarning } from '../services/image-quality.js';
import { requireSession } from '../services/dev-user.js';
import { createUploadStorageProvider } from '../services/upload-storage.js';
import { getRequestId } from '../utils/request-id.js';

const OCR_PROCESSING_STALE_MS = 5 * 60 * 1000;

const createOcrTaskSchema = z.object({
  profileId: z.string().uuid().optional(),
  fixtureCaseIds: z.array(z.string()).optional(),
  photos: z.array(z.object({
    photoId: z.string().uuid(),
    groupId: z.string().trim().min(1).max(128),
    sortOrder: z.number().int().positive()
  })).max(9).optional()
});

const listOcrTasksSchema = z.object({
  profileId: z.string().uuid().optional(),
  status: z.string().optional()
});

const updateDraftSchema = z.object({
  draft: z.object({
    basicInfo: z.unknown().optional(),
    metrics: z.unknown().optional(),
    findings: z.unknown().optional(),
    warnings: z.unknown().optional(),
    conflicts: z.unknown().optional(),
    status: z.string().optional()
  }).passthrough()
});

const resolveConflictSchema = z.object({
  selectedCandidateIndex: z.number().int().optional(),
  resolution: z.enum(['keep', 'delete']).optional()
});

const retryOcrTaskSchema = z.object({
  draftId: z.string().uuid().optional(),
  photoIds: z.array(z.string().uuid()).optional()
});

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function serializeDraft(draft: {
  id: string;
  sourcePhotoIds: Prisma.JsonValue;
  pageCount: number;
  basicInfo: Prisma.JsonValue;
  metrics: Prisma.JsonValue;
  findings: Prisma.JsonValue;
  conflicts: Prisma.JsonValue;
  warnings: Prisma.JsonValue;
  ocrEvidence?: Prisma.JsonValue | null;
  providerMetadata?: Prisma.JsonValue | null;
  status: string;
  version: number;
}) {
  return {
    draftId: draft.id,
    sourcePhotoIds: draft.sourcePhotoIds,
    pageCount: draft.pageCount,
    basicInfo: draft.basicInfo,
    metrics: draft.metrics,
    findings: draft.findings,
    conflicts: draft.conflicts,
    warnings: draft.warnings,
    ocrEvidence: draft.ocrEvidence || null,
    providerMetadata: draft.providerMetadata || null,
    status: draft.status,
    version: draft.version
  };
}

function serializeTask(task: {
  id: string;
  profileId: string;
  status: string;
  photoCount: number;
  reportCount: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  drafts: Array<ReturnType<typeof serializeDraft> | Parameters<typeof serializeDraft>[0]>;
}) {
  const processingElapsedMs = task.status === 'processing'
    ? Math.max(0, Date.now() - timestampMs(task.updatedAt || task.createdAt))
    : 0;
  const visibleDrafts = task.drafts.filter((draft: any) => isVisibleDraft(draft));
  return {
    id: task.id,
    profileId: task.profileId,
    status: task.status,
    photoCount: task.photoCount,
    reportCount: task.reportCount,
    errorCode: task.errorCode || '',
    errorMessage: task.errorMessage || '',
    progress: {
      processedReports: ['needs_confirmation', 'ready_to_save', 'confirmed'].includes(task.status)
        ? task.reportCount
        : visibleDrafts.length,
      totalReports: task.reportCount,
      processingElapsedMs,
      isStale: task.status === 'processing' && processingElapsedMs >= OCR_PROCESSING_STALE_MS
    },
    drafts: visibleDrafts.map((draft) => ('draftId' in draft ? draft : serializeDraft(draft)))
  };
}

function isVisibleDraft(draft: { status?: string }) {
  return !['superseded', 'discarded'].includes(draft.status || '');
}

function timestampMs(value: unknown) {
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function plainObject(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

function compactString(value: unknown) {
  return String(value || '').trim();
}

function missingBasicInfoValue(value: unknown, placeholder: string) {
  const text = compactString(value);
  return !text || text === placeholder;
}

function singleBatchValue(drafts: OcrDraft[], field: 'hospital' | 'reportDate') {
  const values = drafts
    .map((draft) => compactString(plainObject(draft.basicInfo)[field]))
    .filter(Boolean);
  const distinct = Array.from(new Set(values));
  return distinct.length === 1 ? distinct[0] : '';
}

function applyBatchBasicInfoInference(drafts: OcrDraft[]) {
  const batchHospital = singleBatchValue(drafts, 'hospital');
  const batchReportDate = singleBatchValue(drafts, 'reportDate');
  if (!batchHospital && !batchReportDate) return drafts;
  return drafts.map((draft) => {
    const basicInfo = { ...plainObject(draft.basicInfo) };
    const warnings = Array.isArray(draft.warnings) ? [...draft.warnings] : [];
    let inferred = false;

    if (batchHospital && missingBasicInfoValue(basicInfo.hospital, '待确认医院')) {
      basicInfo.hospital = batchHospital;
      basicInfo.hospitalSource = 'inferred_from_batch';
      inferred = true;
    }
    if (batchReportDate && missingBasicInfoValue(basicInfo.reportDate, '待确认日期')) {
      basicInfo.reportDate = batchReportDate;
      basicInfo.reportDateSource = 'inferred_from_batch';
      inferred = true;
    }
    if (!inferred) return draft;

    warnings.push({
      code: 'BASIC_INFO_INFERRED_FROM_BATCH',
      message: 'Some basic report fields were inferred from another report in the same OCR batch. Please review before saving.'
    });
    return {
      ...draft,
      basicInfo,
      warnings
    };
  });
}

function draftCreateData(taskId: string, profileId: string, draft: OcrDraft) {
  return {
    ocrTaskId: taskId,
    profileId,
    sourcePhotoIds: toJson(draft.sourcePhotoIds || []),
    pageCount: draft.pageCount || 1,
    basicInfo: toJson(draft.basicInfo || {}),
    metrics: toJson(draft.metrics || []),
    findings: toJson(draft.findings || []),
    conflicts: toJson(draft.conflicts || []),
    warnings: toJson(draft.warnings || []),
    ocrEvidence: draft.ocrEvidence === undefined ? undefined : toJson(draft.ocrEvidence),
    providerMetadata: draft.providerMetadata === undefined ? undefined : toJson(draft.providerMetadata),
    status: draft.status || 'needs_review'
  };
}

function countReportGroups(photos: { photoId: string; groupId: string }[]) {
  return new Set(photos.map((photo) => photo.groupId || photo.photoId)).size;
}

function providerGroups(photos: { photoId: string; groupId: string; sortOrder: number }[], storedPhotos: Array<{
  id: string;
  objectKey: string;
  mimeType: string;
  sizeBytes: bigint | number;
  sha256?: string | null;
}>, localPathForObject?: (objectKey: string) => string) {
  const storedById = new Map(storedPhotos.map((photo) => [photo.id, photo]));
  const groups = new Map<string, any[]>();
  for (const photo of photos) {
    const stored = storedById.get(photo.photoId);
    if (!stored) continue;
    const groupId = photo.groupId || photo.photoId;
    const item = {
      photoId: photo.photoId,
      objectKey: stored.objectKey,
      localPath: localPathForObject ? localPathForObject(stored.objectKey) : undefined,
      mimeType: stored.mimeType,
      sizeBytes: Number(stored.sizeBytes),
      sha256: stored.sha256 || undefined,
      groupId,
      sortOrder: photo.sortOrder
    };
    groups.set(groupId, (groups.get(groupId) || []).concat(item));
  }
  return Array.from(groups.entries()).map(([groupId, groupPhotos]) => ({
    groupId,
    photos: groupPhotos.sort((a, b) => a.sortOrder - b.sortOrder)
  }));
}

function dedupeQualityWarnings(warnings: PhotoQualityWarning[]) {
  const byCode = new Map<string, PhotoQualityWarning>();
  for (const warning of warnings) {
    const existing = byCode.get(warning.code);
    if (!existing) {
      byCode.set(warning.code, warning);
      continue;
    }
    const existingDetails = plainObject(existing.details);
    const warningDetails = plainObject(warning.details);
    const photoIds = Array.from(new Set([
      ...(Array.isArray(existingDetails.photoIds) ? existingDetails.photoIds.map(String) : []),
      ...(existingDetails.photoId ? [String(existingDetails.photoId)] : []),
      ...(Array.isArray(warningDetails.photoIds) ? warningDetails.photoIds.map(String) : []),
      ...(warningDetails.photoId ? [String(warningDetails.photoId)] : [])
    ]));
    byCode.set(warning.code, {
      ...existing,
      details: {
        ...existingDetails,
        photoIds,
        photoCount: photoIds.length || Number(existingDetails.photoCount || 1) + 1
      }
    });
  }
  return Array.from(byCode.values());
}

async function collectPhotoQualityWarnings(group: { photos: Array<{ photoId: string; objectKey: string; localPath?: string }> }) {
  const warnings: PhotoQualityWarning[] = [];
  for (const photo of group.photos) {
    if (!photo.localPath) continue;
    try {
      const bytes = await fs.readFile(photo.localPath);
      warnings.push(...assessOcrImageQuality(bytes, {
        photoId: photo.photoId,
        objectKey: photo.objectKey
      }));
    } catch {
      // OCR itself will surface missing/unreadable local files; quality checks are best-effort.
    }
  }
  return dedupeQualityWarnings(warnings);
}

function appendDraftWarnings(draft: OcrDraft, warnings: PhotoQualityWarning[]) {
  if (!warnings.length) return draft;
  const existingWarnings = Array.isArray(draft.warnings) ? draft.warnings : [];
  const existingCodes = new Set(existingWarnings
    .map((warning: any) => String(warning?.code || ''))
    .filter(Boolean));
  const mergedWarnings = existingWarnings.concat(warnings.filter((warning) => !existingCodes.has(warning.code)));
  return {
    ...draft,
    warnings: mergedWarnings
  };
}

async function findTaskForUser(app: FastifyInstance, taskId: string, userId: string) {
  return app.prisma.ocrTask.findFirst({
    where: {
      id: taskId,
      profile: {
        userId,
        deletedAt: null
      }
    },
    include: {
      drafts: {
        orderBy: { createdAt: 'asc' }
      }
    }
  });
}

function toArray(value: Prisma.JsonValue): any[] {
  return Array.isArray(value) ? value : [];
}

function draftUpdateData(draft: z.infer<typeof updateDraftSchema>['draft']) {
  const data: Record<string, unknown> = {
    version: { increment: 1 }
  };
  if (draft.basicInfo !== undefined) data.basicInfo = toJson(draft.basicInfo);
  if (draft.metrics !== undefined) data.metrics = toJson(draft.metrics);
  if (draft.findings !== undefined) data.findings = toJson(draft.findings);
  if (draft.warnings !== undefined) data.warnings = toJson(draft.warnings);
  if (draft.conflicts !== undefined) data.conflicts = toJson(draft.conflicts);
  if (draft.status !== undefined) data.status = draft.status;
  return data;
}

function nextTaskStatusAfterDraftChange(task: { status: string; drafts: Array<{ id: string; conflicts: Prisma.JsonValue; status: string }> }, updatedDraft: { id: string; conflicts: Prisma.JsonValue; status: string }) {
  if (['confirmed', 'cancelled', 'failed'].includes(task.status)) return task.status;
  const hasRemainingConflicts = task.drafts.some((draft) => {
    if (!isVisibleDraft(draft)) return false;
    const conflicts = draft.id === updatedDraft.id ? updatedDraft.conflicts : draft.conflicts;
    return toArray(conflicts).length > 0;
  });
  return hasRemainingConflicts ? 'needs_confirmation' : 'ready_to_save';
}

async function runWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  }));
  return results;
}

function normalizedIdentityValues(...values: unknown[]) {
  return values
    .flat()
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

function conflictIdentityValues(conflict: any) {
  return normalizedIdentityValues(
    conflict?.metricKey,
    conflict?.metricName,
    toArray(conflict?.candidates).flatMap((candidate: any) => [
      candidate?.metricKey,
      candidate?.metricName,
      candidate?.originalMetricName
    ])
  );
}

function metricMatchesConflict(metric: any, conflict: any, metricKey: string) {
  const conflictValues = new Set(normalizedIdentityValues(metricKey, conflictIdentityValues(conflict)));
  return normalizedIdentityValues(metric?.metricKey, metric?.metricName, metric?.originalMetricName)
    .some((value) => conflictValues.has(value));
}

function conflictMatchesKey(conflict: any, metricKey: string) {
  const normalizedKey = String(metricKey || '').trim();
  return !!normalizedKey && conflictIdentityValues(conflict).some((value) => value === normalizedKey);
}

function metricFromConflictCandidate(candidate: any, baseMetric: any, metricKey: string) {
  if (!candidate || typeof candidate !== 'object') return null;
  if (!candidate.metricKey && !candidate.metricName && !candidate.valueNumeric && !candidate.valueQualitative && !candidate.valueText) {
    return null;
  }
  return {
    ...(baseMetric || {}),
    ...candidate,
    metricKey: candidate.metricKey || baseMetric?.metricKey || metricKey,
    metricName: candidate.metricName || baseMetric?.metricName || metricKey,
    mappingStatus: candidate.mappingStatus === 'conflicted' ? 'suggested' : (candidate.mappingStatus || baseMetric?.mappingStatus || 'suggested')
  };
}

export async function registerOcrRoutes(app: FastifyInstance) {
  const ocrProvider = createOcrProvider(app.env);
  const storageProvider = createUploadStorageProvider(app.env);

  function taskDraftsInclude() {
    return {
      drafts: {
        orderBy: { createdAt: 'asc' as const }
      }
    };
  }

  async function findOcrTaskWithDrafts(taskId: string) {
    return app.prisma.ocrTask.findUniqueOrThrow({
      where: { id: taskId },
      include: taskDraftsInclude()
    });
  }

  function taskUpdatedAtWhere(value: Date | string) {
    return value instanceof Date ? value : new Date(timestampMs(value));
  }

  function activeRunWhere(taskId: string, expectedUpdatedAt?: Date | string) {
    const where: Record<string, unknown> = {
      id: taskId,
      status: { in: ['queued', 'processing'] }
    };
    if (expectedUpdatedAt) where.updatedAt = taskUpdatedAtWhere(expectedUpdatedAt);
    return where;
  }

  function processingRunWhere(taskId: string, expectedUpdatedAt: Date | string) {
    return {
      id: taskId,
      status: 'processing',
      updatedAt: taskUpdatedAtWhere(expectedUpdatedAt)
    };
  }

  async function failActiveOcrRunTask(taskId: string, failure: {
    code: string;
    message: string;
    retryAfterMs?: number;
  }, expectedUpdatedAt?: Date | string) {
    await app.prisma.ocrTask.updateMany({
      where: activeRunWhere(taskId, expectedUpdatedAt),
      data: {
        status: 'failed',
        errorCode: failure.code,
        errorMessage: failure.retryAfterMs
          ? `${failure.message} Retry after ${Math.ceil(failure.retryAfterMs / 1000)} seconds.`
          : failure.message
      }
    });
    return findOcrTaskWithDrafts(taskId);
  }

  async function runPhotoOcrTask(taskId: string, profile: {
    id: string;
    realName?: string | null;
    primaryHospital?: string | null;
  }, photos: Array<{ photoId: string; groupId: string; sortOrder: number }>) {
    const currentTask = await findOcrTaskWithDrafts(taskId);
    if (!['queued', 'processing'].includes(currentTask.status)) return currentTask;
    let activeRunUpdatedAt = currentTask.updatedAt;

    const uniquePhotoIds = Array.from(new Set(photos.map((photo) => photo.photoId)));
    const uploadedPhotos = await app.prisma.reportPhoto.findMany({
      where: {
        id: { in: uniquePhotoIds },
        profileId: profile.id,
        status: { in: ['uploaded', 'attached'] }
      }
    });
    if (uploadedPhotos.length !== uniquePhotoIds.length) {
      return failActiveOcrRunTask(taskId, {
        code: 'OCR_PHOTOS_UNAVAILABLE',
        message: 'Some photos are unavailable for OCR retry'
      }, activeRunUpdatedAt);
    }

    const groups = providerGroups(photos, uploadedPhotos, storageProvider.getLocalPath?.bind(storageProvider));
    if (!groups.length) {
      return failActiveOcrRunTask(taskId, {
        code: 'OCR_EMPTY_RESULT',
        message: 'No uploaded report photos were provided.'
      }, activeRunUpdatedAt);
    }

    try {
      const startResult = await app.prisma.$transaction(async (tx) => {
        const updateResult = await tx.ocrTask.updateMany({
          where: activeRunWhere(taskId, activeRunUpdatedAt),
          data: {
            status: 'processing',
            reportCount: groups.length,
            errorCode: null,
            errorMessage: null
          }
        });
        if (!updateResult.count) {
          return {
            started: false,
            task: await tx.ocrTask.findUniqueOrThrow({
              where: { id: taskId },
              include: taskDraftsInclude()
            })
          };
        }
        await tx.recognizedReportDraft.updateMany({
          where: { ocrTaskId: taskId },
          data: { status: 'superseded' }
        });
        return {
          started: true,
          task: await tx.ocrTask.findUniqueOrThrow({
            where: { id: taskId },
            include: taskDraftsInclude()
          })
        };
      });
      if (!startResult.started) return startResult.task;
      activeRunUpdatedAt = startResult.task.updatedAt;

      const groupResults = await runWithConcurrency(groups, app.env.OCR_GROUP_CONCURRENCY, async (group) => {
        const qualityWarnings = await collectPhotoQualityWarnings(group);
        const result = await ocrProvider.recognizePhotos({
          taskId,
          profileId: profile.id,
          groups: [group],
          context: {
            profileId: profile.id,
            patientNameHint: profile.realName || undefined,
            hospitalHint: profile.primaryHospital || undefined,
            language: 'zh-CN'
          },
          schemaVersion: 'ocr_draft_v1'
        });
        return {
          drafts: result.drafts.map((draft) => appendDraftWarnings(draft, qualityWarnings)),
          warnings: result.warnings || []
        };
      });
      const warnings = groupResults.flatMap((result) => result.warnings);
      const drafts = applyBatchBasicInfoInference(groupResults.flatMap((result) => result.drafts));
      const createdDraftCount = drafts.length;

      return app.prisma.$transaction(async (tx) => {
        if (!createdDraftCount) {
          const warning = warnings[0];
          await tx.ocrTask.updateMany({
            where: processingRunWhere(taskId, activeRunUpdatedAt),
            data: {
              status: 'failed',
              errorCode: warning?.code || 'OCR_EMPTY_RESULT',
              errorMessage: warning?.message || 'OCR provider returned no report drafts'
            }
          });
          return tx.ocrTask.findUniqueOrThrow({
            where: { id: taskId },
            include: taskDraftsInclude()
          });
        }

        const updateResult = await tx.ocrTask.updateMany({
          where: processingRunWhere(taskId, activeRunUpdatedAt),
          data: {
            status: 'needs_confirmation',
            reportCount: createdDraftCount,
            errorCode: null,
            errorMessage: null
          }
        });
        if (!updateResult.count) {
          return tx.ocrTask.findUniqueOrThrow({
            where: { id: taskId },
            include: taskDraftsInclude()
          });
        }

        await tx.recognizedReportDraft.createMany({
          data: drafts.map((draft) => draftCreateData(taskId, profile.id, draft))
        });

        return tx.ocrTask.findUniqueOrThrow({
          where: { id: taskId },
          include: taskDraftsInclude()
        });
      });
    } catch (error) {
      const failure = toOcrProviderFailure(error);
      return failActiveOcrRunTask(taskId, failure, activeRunUpdatedAt);
    }
  }

  function processingAutoFailMs(task: { reportCount?: number }) {
    const reportCount = Math.max(1, Number(task.reportCount || 1));
    const batches = Math.max(1, Math.ceil(reportCount / app.env.OCR_GROUP_CONCURRENCY));
    const timeoutBudget = (app.env.OCR_REQUEST_TIMEOUT_MS * batches) + 60000;
    return Math.max(OCR_PROCESSING_STALE_MS, timeoutBudget);
  }

  async function settleStaleProcessingTask<T extends {
    id: string;
    status: string;
    reportCount: number;
    createdAt?: Date | string;
    updatedAt?: Date | string;
  }>(task: T) {
    if (task.status !== 'processing') return task;
    const elapsedMs = Math.max(0, Date.now() - timestampMs(task.updatedAt || task.createdAt));
    if (elapsedMs < processingAutoFailMs(task)) return task;
    return app.prisma.ocrTask.update({
      where: { id: task.id },
      data: {
        status: 'failed',
        errorCode: 'OCR_TIMEOUT',
        errorMessage: 'OCR task did not finish in the expected time. Please retry recognition.'
      },
      include: {
        drafts: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });
  }

  async function discardOcrDraft(taskId: string, draftId: string, userId: string) {
    const task = await findTaskForUser(app, taskId, userId);
    const existingDraft = task?.drafts.find((draft) => draft.id === draftId && isVisibleDraft(draft));
    if (!task || !existingDraft) return null;

    await app.prisma.recognizedReportDraft.update({
      where: { id: existingDraft.id },
      data: {
        status: 'discarded',
        conflicts: toJson([]),
        version: { increment: 1 }
      } as any
    });
    const remainingCount = task.drafts.filter((draft) => draft.id !== existingDraft.id && isVisibleDraft(draft)).length;
    const hasRemainingConflicts = task.drafts.some((draft) => (
      draft.id !== existingDraft.id && isVisibleDraft(draft) && toArray(draft.conflicts).length > 0
    ));
    return app.prisma.ocrTask.update({
      where: { id: task.id },
      data: {
        reportCount: remainingCount,
        status: remainingCount
          ? (hasRemainingConflicts ? 'needs_confirmation' : 'ready_to_save')
          : 'cancelled'
      },
      include: {
        drafts: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });
  }

  async function splitOcrDraft(taskId: string, draftId: string, userId: string) {
    const task = await findTaskForUser(app, taskId, userId);
    const existingDraft = task?.drafts.find((draft) => draft.id === draftId && isVisibleDraft(draft));
    if (!task || !existingDraft) return null;
    if (['confirmed', 'cancelled'].includes(task.status)) {
      return { error: 'CONFLICT' as const };
    }

    const sourcePhotoIds = toArray(existingDraft.sourcePhotoIds)
      .map((photoId) => String(photoId || '').trim())
      .filter(Boolean);
    if (sourcePhotoIds.length < 2) {
      return { error: 'NOT_SPLITTABLE' as const };
    }

    const baseBasicInfo = (existingDraft.basicInfo && typeof existingDraft.basicInfo === 'object')
      ? existingDraft.basicInfo as Record<string, unknown>
      : {};
    const existingDraftExtra = existingDraft as any;
    const baseWarnings = toArray(existingDraft.warnings);
    const originalMetrics = toArray(existingDraft.metrics);
    const originalFindings = toArray(existingDraft.findings);
    const originalConflicts = toArray(existingDraft.conflicts);
    const firstSplitStatus = ['needs_manual_input', 'not_report'].includes(existingDraft.status)
      ? existingDraft.status
      : (originalConflicts.length ? 'needs_confirmation' : (originalMetrics.length || originalFindings.length ? 'needs_review' : 'needs_manual_input'));
    const splitWarning = {
      code: 'OCR_DRAFT_SPLIT_FROM_MULTIPAGE',
      message: 'This report was split from a multi-page OCR draft. Please review each page before saving.'
    };
    const splitDrafts = sourcePhotoIds.map((photoId, index) => {
      const isFirstPage = index === 0;
      return {
        ocrTaskId: task.id,
        profileId: task.profileId,
        sourcePhotoIds: toJson([photoId]),
        pageCount: 1,
        basicInfo: toJson({
          ...baseBasicInfo,
          reportLike: baseBasicInfo.reportLike !== false,
          splitFromDraftId: existingDraft.id,
          splitPageIndex: index + 1,
          splitPageCount: sourcePhotoIds.length
        }),
        metrics: toJson(isFirstPage ? originalMetrics : []),
        findings: toJson(isFirstPage ? originalFindings : []),
        conflicts: toJson(isFirstPage ? originalConflicts : []),
        warnings: toJson(baseWarnings.concat(splitWarning)),
        ocrEvidence: existingDraftExtra.ocrEvidence === undefined ? undefined : toJson({
          originalDraftId: existingDraft.id,
          splitSourcePhotoId: photoId,
          originalEvidence: existingDraftExtra.ocrEvidence || null
        }),
        providerMetadata: existingDraftExtra.providerMetadata === undefined ? undefined : toJson({
          originalDraftId: existingDraft.id,
          splitSourcePhotoId: photoId,
          originalProviderMetadata: existingDraftExtra.providerMetadata || null
        }),
        status: isFirstPage ? firstSplitStatus : 'needs_manual_input'
      };
    });

    await app.prisma.$transaction(async (tx) => {
      await tx.recognizedReportDraft.update({
        where: { id: existingDraft.id },
        data: {
          status: 'superseded',
          conflicts: toJson([]),
          version: { increment: 1 }
        } as any
      });
      await tx.recognizedReportDraft.createMany({
        data: splitDrafts as any
      });
      const visibleAfterCount = task.drafts.filter((draft) => draft.id !== existingDraft.id && isVisibleDraft(draft)).length
        + splitDrafts.length;
      const hasRemainingConflicts = task.drafts.some((draft) => (
        draft.id !== existingDraft.id && isVisibleDraft(draft) && toArray(draft.conflicts).length > 0
      )) || originalConflicts.length > 0;
      await tx.ocrTask.update({
        where: { id: task.id },
        data: {
          reportCount: visibleAfterCount,
          status: hasRemainingConflicts ? 'needs_confirmation' : 'ready_to_save'
        }
      });
    });

    return app.prisma.ocrTask.findUniqueOrThrow({
      where: { id: task.id },
      include: {
        drafts: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });
  }

  app.post('/api/ocr/tasks', async (request, reply) => {
    const requestId = getRequestId(request);
    const rawIdempotencyKey = request.headers['idempotency-key'];
    const idempotencyKey = Array.isArray(rawIdempotencyKey) ? rawIdempotencyKey[0] : rawIdempotencyKey;
    if (idempotencyKey && idempotencyKey.length > 128) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Idempotency-Key is too long'
        },
        requestId
      });
    }

    const parsed = createOcrTaskSchema.safeParse(request.body || {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'OCR 任务参数无效',
          details: parsed.error.flatten()
        },
        requestId
      });
    }

    const session = await requireSession(app, request, reply);
    if (!session) return;
    const { user, profile: defaultProfile } = session;
    if (idempotencyKey) {
      const existingTask = await app.prisma.ocrTask.findFirst({
        where: {
          userId: user.id,
          idempotencyKey
        },
        include: {
          drafts: {
            orderBy: { createdAt: 'asc' }
          }
        }
      });
      if (existingTask) {
        return {
          data: serializeTask(existingTask as unknown as Parameters<typeof serializeTask>[0]),
          requestId
        };
      }
    }

    const isFixtureTask = !!(parsed.data.fixtureCaseIds && parsed.data.fixtureCaseIds.length);
    if (isFixtureTask && app.env.NODE_ENV === 'production') {
      return reply.status(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'Fixture OCR is disabled in production'
        },
        requestId
      });
    }

    const profileId = parsed.data.profileId || defaultProfile?.id;
    if (!profileId) {
      return reply.status(400).send({
        error: {
          code: 'PROFILE_REQUIRED',
          message: 'Please create a profile before creating OCR tasks'
        },
        requestId
      });
    }

    const profile = await app.prisma.profile.findFirst({
      where: {
        id: profileId,
        userId: user.id,
        deletedAt: null
      }
    });

    if (!profile) {
      return reply.status(404).send({
        error: {
          code: 'NOT_FOUND',
          message: '档案不存在'
        },
        requestId
      });
    }

    const photos = parsed.data.photos || [];
    if (!isFixtureTask && photos.length === 0) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'OCR task requires photos or fixtureCaseIds'
        },
        requestId
      });
    }

    let uploadedPhotos: Array<{
      id: string;
      objectKey: string;
      mimeType: string;
      sizeBytes: bigint | number;
      sha256?: string | null;
    }> = [];
    if (!isFixtureTask) {
      const uniquePhotoIds = Array.from(new Set(photos.map((photo) => photo.photoId)));
      uploadedPhotos = await app.prisma.reportPhoto.findMany({
        where: {
          id: { in: uniquePhotoIds },
          profileId: profile.id,
          userId: user.id,
          status: { in: ['uploaded'] }
        }
      });
      if (uploadedPhotos.length !== uniquePhotoIds.length) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Some photos are unavailable for OCR task creation'
          },
          requestId
        });
      }
    }

    const drafts = isFixtureTask
      ? await ocrProvider.recognizeFixture({ caseIds: parsed.data.fixtureCaseIds })
      : [];
    if (isFixtureTask && !drafts.length) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: '未找到可用的 fixture 报告'
        },
        requestId
      });
    }

    let task = await app.prisma.$transaction(async (tx) => {
      const createdTask = await tx.ocrTask.create({
        data: {
          profileId: profile.id,
          userId: user.id,
          status: isFixtureTask ? 'needs_confirmation' : 'processing',
          idempotencyKey: idempotencyKey || null,
          photoCount: isFixtureTask ? drafts.reduce((sum, draft) => sum + (draft.sourcePhotoIds || []).length, 0) : photos.length,
          reportCount: isFixtureTask ? drafts.length : countReportGroups(photos)
        }
      });

      if (isFixtureTask) {
        await tx.recognizedReportDraft.createMany({
          data: drafts.map((draft) => draftCreateData(createdTask.id, profile.id, draft))
        });
      } else {
        await tx.ocrTaskPhoto.createMany({
          data: photos.map((photo) => ({
            ocrTaskId: createdTask.id,
            photoId: photo.photoId,
            groupId: photo.groupId || photo.photoId,
            sortOrder: photo.sortOrder
          }))
        });
        await tx.reportPhoto.updateMany({
          where: { id: { in: photos.map((photo) => photo.photoId) } },
          data: { status: 'attached' }
        });
      }

      return tx.ocrTask.findUniqueOrThrow({
        where: { id: createdTask.id },
        include: {
          drafts: {
            orderBy: { createdAt: 'asc' }
          }
        }
      });
    });

    if (!isFixtureTask) {
      setTimeout(() => {
        void runPhotoOcrTask(task.id, profile, photos).catch(async (error) => {
          const failure = toOcrProviderFailure(error);
          await failActiveOcrRunTask(task.id, failure).catch(() => null);
        });
      }, 0);
    }

    return {
      data: serializeTask({
        ...task,
        drafts: task.drafts.map(serializeDraft)
      }),
      requestId
    };
  });

  app.get<{ Querystring: { profileId?: string; status?: string } }>('/api/ocr/tasks', async (request, reply) => {
    const requestId = getRequestId(request);
    const parsed = listOcrTasksSchema.safeParse(request.query || {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'OCR task query is invalid',
          details: parsed.error.flatten()
        },
        requestId
      });
    }

    const session = await requireSession(app, request, reply);
    if (!session) return;
    const { user } = session;
    const statuses = (parsed.data.status || '')
      .split(',')
      .map((status) => status.trim())
      .filter(Boolean);
    const tasks = await app.prisma.ocrTask.findMany({
      where: {
        ...(parsed.data.profileId ? { profileId: parsed.data.profileId } : {}),
        ...(statuses.length ? { status: { in: statuses } } : {}),
        profile: {
          userId: user.id,
          deletedAt: null
        }
      },
      orderBy: { createdAt: 'desc' },
      include: {
        drafts: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    const settledTasks = await Promise.all(tasks.map((task) => settleStaleProcessingTask(task)));

    return {
      data: settledTasks.map((task) => serializeTask({
        ...task,
        drafts: task.drafts.map(serializeDraft)
      })),
      requestId
    };
  });

  app.get<{ Params: { taskId: string } }>('/api/ocr/tasks/:taskId', async (request, reply) => {
    const requestId = getRequestId(request);
    const session = await requireSession(app, request, reply);
    if (!session) return;
    const { user } = session;
    const task = await findTaskForUser(app, request.params.taskId, user.id);

    if (!task) {
      return reply.status(404).send({
        error: {
          code: 'NOT_FOUND',
          message: 'OCR 任务不存在'
        },
        requestId
      });
    }

    const settledTask = await settleStaleProcessingTask(task);

    return {
      data: serializeTask({
        ...settledTask,
        drafts: settledTask.drafts.map(serializeDraft)
      }),
      requestId
    };
  });

  app.post<{ Params: { taskId: string } }>('/api/ocr/tasks/:taskId/cancel', async (request, reply) => {
    const requestId = getRequestId(request);
    const session = await requireSession(app, request, reply);
    if (!session) return;
    const { user } = session;
    const task = await findTaskForUser(app, request.params.taskId, user.id);

    if (!task) {
      return reply.status(404).send({
        error: {
          code: 'NOT_FOUND',
          message: 'OCR task not found'
        },
        requestId
      });
    }

    if (task.status === 'confirmed') {
      return reply.status(409).send({
        error: {
          code: 'CONFLICT',
          message: 'Confirmed OCR task cannot be cancelled'
        },
        requestId
      });
    }

    const updatedTask = await app.prisma.$transaction(async (tx) => {
      await tx.recognizedReportDraft.updateMany({
        where: { ocrTaskId: task.id },
        data: { status: 'cancelled' }
      });
      return tx.ocrTask.update({
        where: { id: task.id },
        data: { status: 'cancelled' },
        include: {
          drafts: {
            orderBy: { createdAt: 'asc' }
          }
        }
      });
    });

    return {
      data: serializeTask({
        ...updatedTask,
        drafts: updatedTask.drafts.map(serializeDraft)
      }),
      requestId
    };
  });

  app.post<{ Params: { taskId: string } }>('/api/ocr/tasks/:taskId/retry', async (request, reply) => {
    const requestId = getRequestId(request);
    const parsed = retryOcrTaskSchema.safeParse(request.body || {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'OCR retry payload is invalid',
          details: parsed.error.flatten()
        },
        requestId
      });
    }

    const session = await requireSession(app, request, reply);
    if (!session) return;
    const { user } = session;
    const task = await findTaskForUser(app, request.params.taskId, user.id);

    if (!task) {
      return reply.status(404).send({
        error: {
          code: 'NOT_FOUND',
          message: 'OCR task not found'
        },
        requestId
      });
    }

    if (['confirmed', 'cancelled'].includes(task.status)) {
      return reply.status(409).send({
        error: {
          code: 'CONFLICT',
          message: 'OCR task cannot be retried in its current status'
        },
        requestId
      });
    }
    if (['queued', 'processing'].includes(task.status)) {
      return reply.status(409).send({
        error: {
          code: 'OCR_TASK_STILL_PROCESSING',
          message: 'OCR task is still processing. Please wait for it to finish or cancel it before retrying.'
        },
        requestId
      });
    }

    let updatedTask = await app.prisma.$transaction(async (tx) => {
      if (parsed.data.draftId) {
        await tx.recognizedReportDraft.updateMany({
          where: {
            ocrTaskId: task.id,
            id: parsed.data.draftId
          },
          data: { status: 'needs_review' }
        });
      }
      return tx.ocrTask.update({
        where: { id: task.id },
        data: {
          status: 'queued',
          errorCode: null,
          errorMessage: null
        },
        include: {
          drafts: {
            orderBy: { createdAt: 'asc' }
          }
        }
      });
    });

    const taskPhotos = await app.prisma.ocrTaskPhoto.findMany({
      where: { ocrTaskId: task.id },
      orderBy: [
        { groupId: 'asc' },
        { sortOrder: 'asc' }
      ]
    });
    if (taskPhotos.length) {
      const profile = await app.prisma.profile.findFirst({
        where: {
          id: task.profileId,
          userId: user.id,
          deletedAt: null
        }
      });
      if (!profile) {
        return reply.status(404).send({
          error: {
            code: 'NOT_FOUND',
            message: 'Profile not found for OCR retry'
          },
          requestId
        });
      }
      updatedTask = await runPhotoOcrTask(task.id, profile, taskPhotos.map((photo) => ({
        photoId: photo.photoId,
        groupId: photo.groupId,
        sortOrder: photo.sortOrder
      })));
    }

    return {
      data: serializeTask(updatedTask),
      requestId
    };
  });

  app.patch<{ Params: { taskId: string; draftId: string } }>('/api/ocr/tasks/:taskId/drafts/:draftId', async (request, reply) => {
    const requestId = getRequestId(request);
    const parsed = updateDraftSchema.safeParse(request.body || {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'OCR 草稿参数无效',
          details: parsed.error.flatten()
        },
        requestId
      });
    }

    const session = await requireSession(app, request, reply);
    if (!session) return;
    const { user } = session;
    const task = await findTaskForUser(app, request.params.taskId, user.id);
    const existingDraft = task?.drafts.find((draft) => draft.id === request.params.draftId);
    if (!task || !existingDraft) {
      return reply.status(404).send({
        error: {
          code: 'NOT_FOUND',
          message: 'OCR 草稿不存在'
        },
        requestId
      });
    }

    const updated = await app.prisma.recognizedReportDraft.update({
      where: { id: existingDraft.id },
      data: draftUpdateData(parsed.data.draft) as any
    });
    const nextStatus = nextTaskStatusAfterDraftChange(task, updated);
    if (nextStatus !== task.status) {
      await app.prisma.ocrTask.update({
        where: { id: task.id },
        data: { status: nextStatus }
      });
    }

    return {
      data: serializeDraft(updated),
      requestId
    };
  });

  app.delete<{ Params: { taskId: string; draftId: string } }>('/api/ocr/tasks/:taskId/drafts/:draftId', async (request, reply) => {
    const requestId = getRequestId(request);
    const session = await requireSession(app, request, reply);
    if (!session) return;
    const { user } = session;
    const updatedTask = await discardOcrDraft(request.params.taskId, request.params.draftId, user.id);
    if (!updatedTask) {
      return reply.status(404).send({
        error: {
          code: 'NOT_FOUND',
          message: 'OCR 草稿不存在'
        },
        requestId
      });
    }

    return {
      data: serializeTask(updatedTask),
      requestId
    };
  });

  app.post<{ Params: { taskId: string; draftId: string } }>('/api/ocr/tasks/:taskId/drafts/:draftId/delete', async (request, reply) => {
    const requestId = getRequestId(request);
    const session = await requireSession(app, request, reply);
    if (!session) return;
    const { user } = session;
    const updatedTask = await discardOcrDraft(request.params.taskId, request.params.draftId, user.id);
    if (!updatedTask) {
      return reply.status(404).send({
        error: {
          code: 'NOT_FOUND',
          message: 'OCR draft not found'
        },
        requestId
      });
    }

    return {
      data: serializeTask(updatedTask),
      requestId
    };
  });

  app.post<{ Params: { taskId: string; draftId: string } }>('/api/ocr/tasks/:taskId/drafts/:draftId/split', async (request, reply) => {
    const requestId = getRequestId(request);
    const session = await requireSession(app, request, reply);
    if (!session) return;
    const { user } = session;
    const updatedTask = await splitOcrDraft(request.params.taskId, request.params.draftId, user.id);
    if (!updatedTask) {
      return reply.status(404).send({
        error: {
          code: 'NOT_FOUND',
          message: 'OCR draft not found'
        },
        requestId
      });
    }
    if ('error' in updatedTask) {
      return reply.status(409).send({
        error: {
          code: updatedTask.error === 'NOT_SPLITTABLE' ? 'OCR_DRAFT_NOT_SPLITTABLE' : 'CONFLICT',
          message: updatedTask.error === 'NOT_SPLITTABLE'
            ? 'Only multi-page OCR drafts can be split'
            : 'OCR draft cannot be split in its current task status'
        },
        requestId
      });
    }

    return {
      data: serializeTask(updatedTask),
      requestId
    };
  });

  app.patch<{ Params: { taskId: string; draftId: string; metricKey: string } }>('/api/ocr/tasks/:taskId/drafts/:draftId/conflicts/:metricKey', async (request, reply) => {
    const requestId = getRequestId(request);
    const parsed = resolveConflictSchema.safeParse(request.body || {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'OCR 冲突参数无效',
          details: parsed.error.flatten()
        },
        requestId
      });
    }

    const session = await requireSession(app, request, reply);
    if (!session) return;
    const { user } = session;
    const task = await findTaskForUser(app, request.params.taskId, user.id);
    const existingDraft = task?.drafts.find((draft) => draft.id === request.params.draftId);
    if (!task || !existingDraft) {
      return reply.status(404).send({
        error: {
          code: 'NOT_FOUND',
          message: 'OCR 草稿不存在'
        },
        requestId
      });
    }

    const existingConflicts = toArray(existingDraft.conflicts);
    const resolvedConflict = existingConflicts.find((conflict) => conflictMatchesKey(conflict, request.params.metricKey)) || {};
    const nextConflicts = existingConflicts.filter((conflict) => !conflictMatchesKey(conflict, request.params.metricKey));
    const selectedCandidateIndex = parsed.data.selectedCandidateIndex ?? 0;
    const resolution = parsed.data.resolution || (selectedCandidateIndex < 0 ? 'delete' : 'keep');
    const currentMetrics = toArray(existingDraft.metrics);
    const baseMetric = currentMetrics.find((metric) => metricMatchesConflict(metric, resolvedConflict, request.params.metricKey));
    const selectedCandidate = toArray(resolvedConflict.candidates)[selectedCandidateIndex];
    const candidateMetric = resolution === 'keep'
      ? metricFromConflictCandidate(selectedCandidate, baseMetric, request.params.metricKey)
      : null;
    const nextMetrics = resolution === 'delete'
      ? currentMetrics.filter((metric) => !metricMatchesConflict(metric, resolvedConflict, request.params.metricKey))
      : currentMetrics.map((metric) => {
        if (!metricMatchesConflict(metric, resolvedConflict, request.params.metricKey)) return metric;
        return candidateMetric || {
          ...metric,
          mappingStatus: metric.mappingStatus === 'conflicted' ? 'suggested' : metric.mappingStatus
        };
      });
    const updatedDraft = await app.prisma.recognizedReportDraft.update({
      where: { id: existingDraft.id },
      data: {
        metrics: toJson(nextMetrics),
        conflicts: toJson(nextConflicts),
        status: nextConflicts.length ? existingDraft.status : 'needs_review',
        version: { increment: 1 }
      } as any
    });

    const hasRemainingConflicts = task.drafts.some((draft) => {
      if (draft.id === existingDraft.id) return nextConflicts.length > 0;
      return toArray(draft.conflicts).length > 0;
    });
    await app.prisma.ocrTask.update({
      where: { id: task.id },
      data: { status: hasRemainingConflicts ? 'needs_confirmation' : 'ready_to_save' }
    });

    return {
      data: {
        taskId: task.id,
        draftId: updatedDraft.id,
        metricKey: request.params.metricKey,
        selectedCandidateIndex,
        resolution,
        status: 'resolved'
      },
      requestId
    };
  });
}
