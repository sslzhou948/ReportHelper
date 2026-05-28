const store = require('./store');
const { ApiError } = require('./api-client');
const { buildMetricSnapshots, groupMetricsByCategory, normalizeReportMetrics } = require('./report');
const { avatarText, formatProfileSummary: buildProfileSummary } = require('./profile');
const { buildRecognitionReports } = require('./upload');
const { calculateTone } = require('./trend');
const { buildRealcaseOcrTask } = require('../data/ocr-fixtures');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ok(data) {
  return Promise.resolve(clone(data));
}

function extractNumber(value, fallback) {
  const match = String(value || '').match(/\d+/);
  return match ? Number(match[0]) : fallback;
}

function toProfileListItem(profile) {
  return {
    id: profile.id,
    relation: profile.relation,
    realName: profile.realName,
    summary: buildProfileSummary(profile),
    avatarText: profile.avatarText || avatarText(profile.realName, profile.relation)
  };
}

function toOcrDraft(report) {
  return {
    draftId: report.id,
    sourcePhotoIds: report.photoIds.map((id) => `photo_${id}`),
    pageCount: report.pageCount,
    basicInfo: {
      type: report.type,
      originalType: report.type,
      typeKey: 'mock',
      canonicalTypeName: report.type,
      modality: 'laboratory',
      examPart: '',
      examMethod: '',
      hospital: report.meta.split(' 路 ')[0] || '',
      hospitalSource: 'ocr',
      reportDate: '2026-04-28',
      reportDateSource: 'ocr',
      confidence: 0.9
    },
    metrics: [],
    conflicts: report.conflict ? [{
      metricKey: 'wbc',
      metricName: '\u767d\u7ec6\u80de',
      candidates: [
        { value: '3.2', unit: '\u00d710\u2079/L', sourcePhotoId: report.photoIds[0] ? `photo_${report.photoIds[0]}` : 'photo_1', confidence: 0.86 },
        { value: '3.5', unit: '\u00d710\u2079/L', sourcePhotoId: report.photoIds[1] ? `photo_${report.photoIds[1]}` : 'photo_2', confidence: 0.78 }
      ]
    }] : [],
    warnings: [],
    status: report.conflict ? 'has_conflict' : 'needs_review'
  };
}

function toPersistedReport(draft, profileId, ocrTaskId, index) {
  const info = draft.basicInfo || {};
  const modality = info.modality || (draft.findings && draft.findings.length ? 'imaging' : 'laboratory');
  const metrics = (draft.metrics || []).map((metric, metricIndex) => {
    const valueType = metric.valueType || 'quantitative';
    const value = valueType === 'qualitative' ? metric.valueQualitative : metric.valueNumeric;
    return {
      id: metric.id || `${draft.draftId}_metric_${metricIndex + 1}`,
      originalMetricName: metric.originalMetricName || metric.metricName || metric.metricKey,
      mappingStatus: metric.mappingStatus || 'confirmed',
      ...metric,
      valueType,
      tone: metric.tone || calculateTone(value, metric.refRangeLow, metric.refRangeHigh, valueType),
      isManuallyEdited: !!metric.isManuallyEdited
    };
  });
  const abnormalCount = metrics.filter((metric) => metric.tone && metric.tone !== 'ok').length;

  return {
    id: `report_${draft.draftId}_${index + 1}`,
    draftId: draft.draftId,
    profileId,
    type: info.type || '待确认报告',
    originalType: info.originalType || info.type || '待确认报告',
    typeKey: info.typeKey || 'unknown',
    canonicalTypeName: info.canonicalTypeName || info.type || '待确认报告',
    modality,
    examPart: info.examPart || '',
    examMethod: info.examMethod || '',
    analysisPolicy: draft.analysisPolicy || (modality === 'imaging' ? 'view_only' : 'metric_analysis'),
    hospital: info.hospital || '待确认医院',
    hospitalSource: info.hospitalSource || (info.hospital ? 'ocr' : 'unknown'),
    reportDate: info.reportDate || '待确认日期',
    reportDateSource: info.reportDateSource || (info.reportDate ? 'ocr' : 'unknown'),
    abnormalCount,
    note: draft.note || (draft.findings || []).join('\n'),
    ocrTaskId,
    sourcePhotoIds: draft.sourcePhotoIds || [],
    warnings: draft.warnings || [],
    findings: draft.findings || [],
    metrics
  };
}

function normalizeEditedDraft(draft) {
  const next = clone(draft);
  next.metrics = (next.metrics || []).map((metric) => {
    const valueType = metric.valueType || 'quantitative';
    const value = valueType === 'qualitative' ? metric.valueQualitative : Number(metric.valueNumeric);
    const numericValue = valueType === 'quantitative' && Number.isFinite(value) ? value : metric.valueNumeric;
    return {
      ...metric,
      valueType,
      valueNumeric: valueType === 'quantitative' ? numericValue : metric.valueNumeric,
      refRangeLow: metric.refRangeLow === '' ? null : metric.refRangeLow,
      refRangeHigh: metric.refRangeHigh === '' ? null : metric.refRangeHigh,
      tone: metric.tone || calculateTone(value, metric.refRangeLow, metric.refRangeHigh, valueType)
    };
  });
  return next;
}

function sameText(a, b) {
  return String(a || '').trim() === String(b || '').trim();
}

function normalizeReportIdentity(reportOrDraft) {
  const info = reportOrDraft.basicInfo || reportOrDraft;
  return {
    type: info.type || '',
    typeKey: info.typeKey || '',
    hospital: info.hospital || '',
    reportDate: info.reportDate || '',
    modality: info.modality || 'laboratory',
    examPart: info.examPart || '',
    examMethod: info.examMethod || ''
  };
}

function createMockApi() {
  const pinnedOverrides = {};
  const ocrTasks = {};
  const duplicateCandidates = [];
  const profiles = clone(store.mock.profiles);
  const reports = clone(store.mock.reports);
  const recheckPlans = clone(store.mock.recheckPlans);

  function findRecheckPlan(planId) {
    return recheckPlans.find((plan) => plan.id === planId);
  }

  function serializeRecheckPlans(profileId) {
    const plans = recheckPlans
      .filter((plan) => plan.profileId === profileId)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    const pending = plans.filter((plan) => plan.status === 'pending');
    return {
      nextPlan: pending[0] || null,
      otherPlans: pending.slice(1),
      doneCount: plans.filter((plan) => plan.status === 'done').length
    };
  }

  function findProfile(profileId) {
    return profiles.find((profile) => profile.id === profileId && !profile.deletedAt) || null;
  }

  function getActiveReports(profileId) {
    return reports
      .filter((report) => report.profileId === profileId && !report.deletedAt)
      .sort((a, b) => new Date(b.reportDate) - new Date(a.reportDate));
  }

  function getReport(reportId) {
    return reports.find((report) => report.id === reportId && !report.deletedAt) || null;
  }

  function getReportMetricGroups(reportId) {
    const report = getReport(reportId);
    if (!report) return [];
    const rows = normalizeReportMetrics(report, store.mock.metricDefinitions);
    return Object.values(groupMetricsByCategory(rows));
  }

  function getMetricSnapshots(profileId) {
    return buildMetricSnapshots(getActiveReports(profileId), store.mock.metricDefinitions)
      .sort((a, b) => {
        const abnormalA = a.lastTone === 'ok' ? 0 : 1;
        const abnormalB = b.lastTone === 'ok' ? 0 : 1;
        if (abnormalA !== abnormalB) return abnormalB - abnormalA;
        return new Date(b.lastDate) - new Date(a.lastDate);
      });
  }

  function getMetricHistory(profileId, metricKey) {
    return getActiveReports(profileId)
      .flatMap((report) => normalizeReportMetrics(report, store.mock.metricDefinitions))
      .filter((row) => row.metricKey === metricKey)
      .sort((a, b) => new Date(b.reportDate) - new Date(a.reportDate));
  }

  function detectDuplicateCandidates({ profileId, ocrTaskId, reports: draftReports }) {
    const candidates = [];
    const drafts = draftReports || [];
    drafts.forEach((draft) => {
      const incoming = normalizeReportIdentity(draft);
      if (!incoming.reportDate) return;
      const draftMetricKeys = new Set((draft.metrics || []).map((metric) => metric.metricKey).filter(Boolean));
      getActiveReports(profileId).forEach((existing) => {
        const current = normalizeReportIdentity(existing);
        const sameDate = sameText(incoming.reportDate, current.reportDate);
        const sameHospital = sameText(incoming.hospital, current.hospital);
        const sameTypeKey = incoming.typeKey && current.typeKey
          ? sameText(incoming.typeKey, current.typeKey)
          : sameText(incoming.type, current.type);
        const sameExamPart = sameText(incoming.examPart, current.examPart);
        const sameExamMethod = sameText(incoming.examMethod, current.examMethod);
        if (!sameDate || !sameTypeKey || !sameExamPart || !sameExamMethod) return;

        const existingMetricKeys = new Set((existing.metrics || []).map((metric) => metric.metricKey).filter(Boolean));
        const overlapCount = Array.from(draftMetricKeys).filter((key) => existingMetricKeys.has(key)).length;
        const overlapBase = Math.max(draftMetricKeys.size, existingMetricKeys.size, 1);
        const metricOverlapRatio = overlapCount / overlapBase;
        const matchLevel = sameHospital ? 'strong' : 'possible';
        if (matchLevel !== 'strong' && metricOverlapRatio < 0.8) return;

        candidates.push({
          id: `dup_${ocrTaskId || 'manual'}_${draft.draftId}_${existing.id}`,
          draftId: draft.draftId,
          existingReportId: existing.id,
          existingReportType: existing.type,
          existingReportDate: existing.reportDate,
          existingHospital: existing.hospital,
          matchLevel,
          matchReason: {
            sameProfile: true,
            sameReportDate: sameDate,
            sameHospital,
            sameTypeKey,
            sameExamPart,
            sameExamMethod,
            metricOverlapRatio
          },
          suggestedDecision: matchLevel === 'strong' ? 'replace' : 'keep_both'
        });
      });
    });
    return candidates;
  }

  function rejectDuplicateCandidates(candidates) {
    return Promise.reject(new ApiError({
      code: 'DUPLICATE_REPORT_REQUIRES_DECISION',
      statusCode: 409,
      message: '发现相似报告，请选择覆盖旧报告或另存一份',
      details: { candidates }
    }));
  }

  function applyPinned(snapshot) {
    const key = `${snapshot.profileId}:${snapshot.metricKey}`;
    if (Object.prototype.hasOwnProperty.call(pinnedOverrides, key)) {
      return { ...snapshot, isPinned: pinnedOverrides[key] };
    }
    return snapshot;
  }

  return {
    authWxLogin({ code }) {
      return ok({
        token: `mock_token_${code || Date.now()}`,
        refreshToken: 'mock_refresh_token',
        userId: 'mock_user_1',
        isNewUser: false
      });
    },

    refreshAuth() {
      return this.authWxLogin({ code: 'refresh' });
    },

    logout() {
      return ok({ ok: true });
    },

    getProfiles() {
      return ok(profiles.filter((profile) => !profile.deletedAt).map(toProfileListItem));
    },

    createProfile(payload) {
      const profile = {
        id: `profile_mock_${profiles.length + 1}`,
        relation: payload.relation,
        realName: payload.realName,
        avatarText: payload.avatarText || avatarText(payload.realName, payload.relation),
        gender: payload.gender || '',
        birthDate: payload.birthDate || '',
        diseaseType: payload.diseaseType || '',
        diagnosedAt: payload.diagnosedAt || '',
        stage: payload.stage || '',
        treatmentPhase: payload.treatmentPhase || '',
        primaryHospital: payload.primaryHospital || '',
        primaryDoctor: payload.primaryDoctor || '',
        primaryDepartment: payload.primaryDepartment || ''
      };
      profile.summary = buildProfileSummary(profile);
      profiles.push(profile);
      return ok(profile);
    },

    getProfile(profileId) {
      return ok(findProfile(profileId) || profiles.filter((profile) => !profile.deletedAt)[0] || null);
    },

    updateProfile(profileId, payload) {
      const profile = findProfile(profileId);
      if (!profile) return ok(null);
      Object.assign(profile, payload);
      profile.avatarText = profile.avatarText || avatarText(profile.realName, profile.relation);
      profile.summary = buildProfileSummary(profile);
      return ok(profile);
    },

    deleteProfile(profileId) {
      const profile = profiles.find((item) => item.id === profileId);
      if (profile) profile.deletedAt = new Date().toISOString();
      return ok({ ok: true });
    },

    listReports(profileId) {
      return ok(getActiveReports(profileId));
    },

    getReportDetail(reportId) {
      const report = getReport(reportId);
      return ok({
        report,
        groups: report ? getReportMetricGroups(report.id) : []
      });
    },

    updateReport(reportId, payload) {
      const report = getReport(reportId);
      if (!report) return ok({ report: null, groups: [] });
      if (payload.basicInfo) {
        Object.assign(report, payload.basicInfo);
      }
      if (payload.metrics) {
        report.metrics = payload.metrics;
      }
      report.abnormalCount = (report.metrics || []).filter((metric) => {
        if (metric.valueType === 'qualitative') return metric.valueQualitative && metric.valueQualitative !== '\u9634\u6027';
        if (metric.refRangeLow !== undefined && metric.valueNumeric < metric.refRangeLow) return true;
        if (metric.refRangeHigh !== undefined && metric.valueNumeric > metric.refRangeHigh) return true;
        return false;
      }).length;
      return this.getReportDetail(reportId);
    },

    deleteReport(reportId) {
      const report = reports.find((item) => item.id === reportId);
      if (report) report.deletedAt = new Date().toISOString();
      return ok({ ok: true });
    },

    listMetricSnapshots(profileId, params = {}) {
      let rows = getMetricSnapshots(profileId).map(applyPinned);
      if (params.filter === 'abnormal') rows = rows.filter((item) => item.lastTone !== 'ok');
      if (params.filter === 'pinned') rows = rows.filter((item) => item.isPinned);
      if (params.category) rows = rows.filter((item) => item.category === params.category || item.categoryCn === params.category);
      return ok(rows);
    },

    getMetricHistory(profileId, metricKey) {
      const history = getMetricHistory(profileId, metricKey);
      return ok({
        metricKey,
        metricName: history[0] && history[0].metricName,
        valueType: history[0] && history[0].valueType,
        history
      });
    },

    setMetricPinned(profileId, metricKey, isPinned) {
      pinnedOverrides[`${profileId}:${metricKey}`] = !!isPinned;
      return this.listMetricSnapshots(profileId).then((rows) => (
        rows.find((item) => item.metricKey === metricKey) || { profileId, metricKey, isPinned: !!isPinned }
      ));
    },

    listRecheckPlans(profileId) {
      return ok(serializeRecheckPlans(profileId));
    },

    createRecheckPlan(profileId, payload) {
      const plan = {
        id: `recheck_mock_${recheckPlans.length + 1}`,
        profileId,
        type: payload.type,
        date: payload.date,
        timeOfDay: payload.timeOfDay || '',
        hospital: payload.hospital,
        department: payload.department || '',
        status: 'pending',
        reminderConfig: payload.reminderConfig || { advanceDays: [3, 1, 0], subscribeAccepted: false },
        todos: (payload.todos || []).map((todo, index) => ({
          id: `todo_mock_${recheckPlans.length + 1}_${index + 1}`,
          text: todo.text,
          isDone: !!todo.isDone,
          isTemplate: todo.isTemplate !== false,
          sortOrder: todo.sortOrder || index + 1
        }))
      };
      recheckPlans.push(plan);
      return ok(plan);
    },

    updateRecheckTodo(planId, todoId, payload) {
      const plan = findRecheckPlan(planId);
      if (!plan) return ok(null);
      plan.todos = (plan.todos || []).map((todo) => (
        todo.id === todoId ? { ...todo, isDone: !!payload.isDone } : todo
      ));
      return ok(plan);
    },

    completeRecheckPlan(planId) {
      const plan = findRecheckPlan(planId);
      if (!plan) return ok(null);
      plan.status = 'done';
      return ok(plan);
    },

    cancelRecheckPlan(planId) {
      const plan = findRecheckPlan(planId);
      if (!plan) return ok(null);
      plan.status = 'cancelled';
      return ok(plan);
    },

    createOcrTask({ profileId, photos, fixtureCaseIds } = {}) {
      if (fixtureCaseIds && fixtureCaseIds.length) {
        const task = buildRealcaseOcrTask(profileId, fixtureCaseIds);
        task.id = `ocr_mock_${Object.keys(ocrTasks).length + 1}`;
        ocrTasks[task.id] = task;
        return ok(task);
      }

      const reports = buildRecognitionReports((photos || []).map((photo, index) => ({
        id: extractNumber(photo.photoId, index + 1),
        group: String(photo.groupId || '').startsWith('group_') ? extractNumber(photo.groupId, 0) : 0
      })));
      const task = {
        id: `ocr_mock_${Object.keys(ocrTasks).length + 1}`,
        profileId,
        status: 'needs_confirmation',
        photoCount: photos ? photos.length : 0,
        reportCount: reports.length,
        progress: {
          processedReports: reports.length,
          totalReports: reports.length
        },
        drafts: reports.map((report) => ({
          draftId: report.id,
          sourcePhotoIds: report.photoIds.map((id) => `photo_${id}`),
          pageCount: report.pageCount,
          basicInfo: {
            type: report.type,
            originalType: report.type,
            typeKey: 'mock',
            canonicalTypeName: report.type,
            modality: 'laboratory',
            examPart: '',
            examMethod: '',
            hospital: report.meta.split(' · ')[0] || '',
            hospitalSource: 'ocr',
            reportDate: '2026-04-28',
            reportDateSource: 'ocr',
            confidence: 0.9
          },
          metrics: [],
          conflicts: report.conflict ? [{
            metricKey: 'wbc',
            metricName: '\u767d\u7ec6\u80de',
            candidates: [
              { value: '3.2', unit: '\u00d710\u2079/L', sourcePhotoId: report.photoIds[0] ? `photo_${report.photoIds[0]}` : 'photo_1', confidence: 0.86 },
              { value: '3.5', unit: '\u00d710\u2079/L', sourcePhotoId: report.photoIds[1] ? `photo_${report.photoIds[1]}` : 'photo_2', confidence: 0.78 }
            ]
          }] : [],
          warnings: [],
          status: report.conflict ? 'has_conflict' : 'needs_review'
        }))
      };
      ocrTasks[task.id] = task;
      return ok(task);
    },

    getOcrTask(taskId) {
      if (!ocrTasks[taskId] && typeof wx !== 'undefined') {
        const photos = wx.getStorageSync('uploadPhotos') || [];
        const pending = wx.getStorageSync('pendingOcrTasks') || [];
        if (photos.length) {
          const reports = buildRecognitionReports(photos);
          ocrTasks[taskId] = {
            id: taskId,
            profileId: pending[0] && pending[0].profileId,
            status: 'needs_confirmation',
            photoCount: photos.length,
            reportCount: reports.length,
            drafts: reports.map(toOcrDraft)
          };
        }
      }
      return ok(ocrTasks[taskId] || {
        id: taskId,
        profileId: store.getProfiles()[0].id,
        status: 'needs_confirmation',
        photoCount: 0,
        reportCount: 0,
        drafts: []
      });
    },

    resolveOcrConflict({ taskId, draftId, metricKey, selectedCandidateIndex = 0 }) {
      const task = ocrTasks[taskId];
      if (!task) return ok({ taskId, draftId, metricKey, selectedCandidateIndex, status: 'resolved' });
      const draft = task.drafts.find((item) => item.draftId === draftId);
      if (!draft) return ok({ taskId, draftId, metricKey, selectedCandidateIndex, status: 'resolved' });
      draft.conflicts = (draft.conflicts || []).filter((conflict) => conflict.metricKey !== metricKey);
      if (draft.conflicts.length === 0) draft.status = 'needs_review';
      task.status = task.drafts.some((item) => (item.conflicts || []).length > 0) ? 'needs_confirmation' : 'ready_to_save';
      return ok({ taskId, draftId, metricKey, selectedCandidateIndex, status: 'resolved' });
    },

    updateOcrDraft({ taskId, draftId, draft }) {
      const task = ocrTasks[taskId];
      if (!task) return ok(null);
      const index = task.drafts.findIndex((item) => item.draftId === draftId);
      if (index < 0) return ok(null);
      task.drafts[index] = normalizeEditedDraft({
        ...task.drafts[index],
        ...draft,
        draftId
      });
      return ok(task.drafts[index]);
    },

    checkDuplicateReports({ profileId, ocrTaskId, reports: draftReports }) {
      const task = ocrTaskId && ocrTasks[ocrTaskId];
      const drafts = draftReports || (task && task.drafts) || [];
      const resolvedProfileId = profileId || (task && task.profileId) || (reports[0] && reports[0].profileId) || store.getProfiles()[0].id;
      const candidates = detectDuplicateCandidates({
        profileId: resolvedProfileId,
        ocrTaskId,
        reports: drafts
      });
      duplicateCandidates.push(...candidates.map((candidate) => ({
        ...candidate,
        profileId: resolvedProfileId,
        ocrTaskId,
        status: 'pending'
      })));
      return ok({
        hasDuplicates: candidates.length > 0,
        candidates
      });
    },

    batchCreateReports({ ocrTaskId, reports: draftReports, duplicateDecisions = [] }) {
      const task = ocrTaskId && ocrTasks[ocrTaskId];
      const drafts = draftReports || (task && task.drafts) || [];
      const profileId = (task && task.profileId) || (reports[0] && reports[0].profileId) || store.getProfiles()[0].id;
      const candidates = detectDuplicateCandidates({ profileId, ocrTaskId, reports: drafts });
      const decisionByDraft = duplicateDecisions.reduce((acc, item) => {
        if (item && item.draftId) acc[item.draftId] = item;
        return acc;
      }, {});
      const unresolved = candidates.filter((candidate) => !decisionByDraft[candidate.draftId]);
      if (unresolved.length) return rejectDuplicateCandidates(unresolved);

      const startIndex = reports.length;
      const savedReports = drafts.reduce((acc, draft, index) => {
        const decision = decisionByDraft[draft.draftId];
        if (decision && decision.decision === 'skip') return acc;
        if (decision && decision.decision === 'replace' && decision.existingReportId) {
          const oldReport = reports.find((report) => report.id === decision.existingReportId);
          if (oldReport) oldReport.deletedAt = new Date().toISOString();
        }
        const report = toPersistedReport(draft, profileId, ocrTaskId, startIndex + index);
        if (decision && decision.decision === 'replace') {
          report.replacedByReportId = decision.existingReportId || null;
          report.action = 'replaced';
        } else if (decision && decision.decision === 'keep_both') {
          report.action = 'created';
          const candidate = duplicateCandidates.find((item) => (
            item.draftId === draft.draftId && item.existingReportId === decision.existingReportId
          ));
          if (candidate) candidate.status = 'ignored';
        } else {
          report.action = 'created';
        }
        acc.push(report);
        return acc;
      }, []);
      reports.push(...savedReports);
      return ok({
        reports: savedReports.map((report) => ({
          draftId: report.draftId,
          reportId: report.id,
          action: report.action || 'created',
          replacedReportId: report.replacedByReportId || null
        }))
      });
    }
  };
}

module.exports = {
  createMockApi
};
