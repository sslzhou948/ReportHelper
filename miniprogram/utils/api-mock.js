const store = require('./store');
const { ApiError } = require('./api-client');
const { buildMetricSnapshots, groupMetricsByCategory, normalizeReportMetrics } = require('./report');
const { avatarText, formatProfileSummary: buildProfileSummary } = require('./profile');
const { buildRecognitionReports } = require('./upload');
const { calculateTone } = require('./trend');
const { normalizeReferenceByMode, toNumberOrNull } = require('./reference-range');
const { canonicalMetricKey } = require('./metric-key');
const {
  archiveCustomMetric,
  listCustomMetrics,
  saveCustomMetric
} = require('./custom-metrics');
const { buildRealcaseOcrTask } = require('../data/ocr-fixtures');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ok(data) {
  return Promise.resolve(clone(data));
}

function canUseWxStorage() {
  return typeof wx !== 'undefined' && wx.getStorageSync && wx.setStorageSync;
}

function readStoredReports() {
  if (!canUseWxStorage()) return null;
  const stored = wx.getStorageSync('mockReports');
  return Array.isArray(stored) ? stored : null;
}

function persistStoredReports(reports) {
  if (canUseWxStorage()) wx.setStorageSync('mockReports', clone(reports));
}

function extractNumber(value, fallback) {
  const match = String(value || '').match(/\d+/);
  return match ? Number(match[0]) : fallback;
}

function normalizedMetricTone(metric, valueType = metric.valueType || 'quantitative') {
  const value = valueType === 'qualitative'
    ? metric.valueQualitative
    : toNumberOrNull(metric.valueNumeric);
  const refLow = toNumberOrNull(metric.refRangeLow);
  const refHigh = toNumberOrNull(metric.refRangeHigh);
  return calculateTone(value, refLow, refHigh, valueType, metric.tone);
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

function isMockImagingReport(report) {
  return /CT|MRI|MR|DR|X光|影像|超声|B超/.test(`${report.type || ''} ${report.count || ''}`);
}

function mockMetricForReport(report) {
  if (isMockImagingReport(report)) return [];
  const biochemical = /生化|肝功|肾功|血脂/.test(report.type || '');
  const valueNumeric = biochemical ? 32 : 4.3;
  const refRangeLow = biochemical ? 9 : 3.5;
  const refRangeHigh = biochemical ? 50 : 9.5;
  const metricKey = biochemical ? 'alt' : 'wbc';
  const metricName = biochemical ? '丙氨酸氨基转移酶(ALT)' : '白细胞数目(WBC)';
  return [{
    metricKey,
    metricName,
    originalMetricName: metricName,
    category: biochemical ? 'biochemistry' : 'blood_routine',
    categoryCn: biochemical ? '生化' : '血常规',
    mappingStatus: 'suggested',
    valueType: 'quantitative',
    valueNumeric,
    valueQualitative: null,
    valueText: String(valueNumeric),
    unit: biochemical ? 'U/L' : '10^9/L',
    refRangeLow,
    refRangeHigh,
    refQualitative: null,
    refText: `${refRangeLow}-${refRangeHigh}`,
    tone: calculateTone(valueNumeric, refRangeLow, refRangeHigh, 'quantitative'),
    ocrConfidence: 0.86
  }];
}

function mockFindingsForReport(report) {
  if (!isMockImagingReport(report)) return [];
  return ['双肺纹理清晰，未见明确急性异常。'];
}

function toOcrDraft(report) {
  const imaging = isMockImagingReport(report);
  return {
    draftId: report.id,
    sourcePhotoIds: report.photoIds.map((id) => `photo_${id}`),
    pageCount: report.pageCount,
    basicInfo: {
      type: report.type,
      originalType: report.type,
      typeKey: 'mock',
      canonicalTypeName: report.type,
      modality: imaging ? 'imaging' : 'laboratory',
      analysisPolicy: imaging ? 'view_only' : 'metric_analysis',
      examPart: '',
      examMethod: '',
      hospital: report.meta.split(' 路 ')[0] || '',
      hospitalSource: 'ocr',
      reportDate: '2026-04-28',
      reportDateSource: 'ocr',
      confidence: 0.9,
      reportLike: true
    },
    metrics: mockMetricForReport(report),
    findings: mockFindingsForReport(report),
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
      tone: normalizedMetricTone(metric, valueType),
      isManuallyEdited: !!metric.isManuallyEdited
    };
  });
  const abnormalCount = metrics.filter((metric) => (
    ['high', 'low', 'abnormal', 'positive'].includes(String(metric.tone || ''))
  )).length;

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
    const reference = normalizeReferenceByMode({
      ...metric,
      valueType,
      valueNumeric: valueType === 'quantitative' ? numericValue : metric.valueNumeric
    });
    return {
      ...reference,
      valueType,
      valueNumeric: valueType === 'quantitative' ? numericValue : metric.valueNumeric,
      tone: normalizedMetricTone(reference, valueType)
    };
  });
  return next;
}

function sameText(a, b) {
  return String(a || '').trim() === String(b || '').trim();
}

function normalizeHospitalName(value) {
  return String(value || '')
    .replace(/[（）()]/g, '')
    .replace(/北京|上海|广州|深圳/g, '')
    .replace(/大学|医学院|附属|有限公司/g, '')
    .replace(/医院|门诊部|院区|总院|分院/g, '')
    .replace(/\s+/g, '')
    .trim();
}

function sameHospitalName(a, b) {
  const left = normalizeHospitalName(a);
  const right = normalizeHospitalName(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function metricValueSignature(metric) {
  const valueType = metric.valueType || 'quantitative';
  const value = valueType === 'qualitative' ? metric.valueQualitative : metric.valueNumeric;
  return `${metric.metricKey || metric.metricName || ''}:${valueType}:${String(value ?? '').trim()}:${metric.unit || ''}`;
}

function compareMetricResults(incomingMetrics, existingMetrics) {
  const incoming = (incomingMetrics || []).filter((metric) => metric.metricKey);
  const existingByKey = (existingMetrics || []).reduce((acc, metric) => {
    if (metric.metricKey) acc[metric.metricKey] = metric;
    return acc;
  }, {});
  if (!incoming.length) return { metricOverlapRatio: 0, sameResultRatio: 0 };

  let overlapCount = 0;
  let sameResultCount = 0;
  incoming.forEach((metric) => {
    const existing = existingByKey[metric.metricKey];
    if (!existing) return;
    overlapCount += 1;
    if (metricValueSignature(metric) === metricValueSignature(existing)) {
      sameResultCount += 1;
    }
  });

  return {
    metricOverlapRatio: overlapCount / incoming.length,
    sameResultRatio: sameResultCount / incoming.length
  };
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
  const exports = {};
  const duplicateCandidates = [];
  const profiles = clone(store.mock.profiles);
  const reports = readStoredReports() || clone(store.mock.reports);
  const recheckPlans = clone(store.mock.recheckPlans);

  function findRecheckPlan(planId) {
    return recheckPlans.find((plan) => plan.id === planId && !plan.deletedAt);
  }

  function serializeRecheckPlans(profileId) {
    const plans = recheckPlans
      .filter((plan) => plan.profileId === profileId && !plan.deletedAt)
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

  function inRange(report, params = {}) {
    const date = new Date(`${String(report.reportDate || '').slice(0, 10)}T00:00:00`);
    if (Number.isNaN(date.getTime())) return false;
    if (params.since && date < new Date(`${String(params.since).slice(0, 10)}T00:00:00`)) return false;
    if (params.until && date > new Date(`${String(params.until).slice(0, 10)}T00:00:00`)) return false;
    return true;
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

  function getMetricSnapshots(profileId, params = {}) {
    return buildMetricSnapshots(getActiveReports(profileId).filter((report) => inRange(report, params)), store.mock.metricDefinitions)
      .sort((a, b) => {
        const abnormalA = a.lastTone === 'ok' ? 0 : 1;
        const abnormalB = b.lastTone === 'ok' ? 0 : 1;
        if (abnormalA !== abnormalB) return abnormalB - abnormalA;
        return new Date(b.lastDate) - new Date(a.lastDate);
      });
  }

  function getMetricHistory(profileId, metricKey, params = {}) {
    const canonicalKey = canonicalMetricKey({ metricKey });
    return getActiveReports(profileId)
      .filter((report) => inRange(report, params))
      .flatMap((report) => normalizeReportMetrics(report, store.mock.metricDefinitions))
      .filter((row) => row.metricKey === canonicalKey)
      .sort((a, b) => new Date(b.reportDate) - new Date(a.reportDate));
  }

  function compactText(value) {
    return String(value || '').trim();
  }

  function pendingCandidateKey(row) {
    const name = compactText(row.metricName) || compactText(row.originalMetricName) || compactText(row.metricKey);
    return [
      name.toLowerCase(),
      compactText(row.unit).toLowerCase(),
      compactText(row.category).toLowerCase(),
      compactText(row.valueType).toLowerCase()
    ].join('|');
  }

  function addCompact(set, value) {
    const text = compactText(value);
    if (text) set.add(text);
  }

  function getPendingMetricCandidates(profileId, params = {}) {
    const groups = getActiveReports(profileId)
      .filter((report) => inRange(report, params))
      .filter((report) => (report.analysisPolicy || 'metric_analysis') !== 'view_only')
      .flatMap((report) => normalizeReportMetrics(report, store.mock.metricDefinitions))
      .filter((row) => row.mappingStatus === 'pending')
      .reduce((acc, row) => {
        const key = pendingCandidateKey(row);
        if (!acc[key]) {
          acc[key] = {
            candidateKey: key,
            metricName: row.metricName || row.originalMetricName || row.metricKey,
            category: row.category || 'other',
            categoryCn: row.categoryCn || 'Other',
            valueType: row.valueType || 'quantitative',
            rows: [],
            metricKeys: new Set(),
            originalMetricNames: new Set(),
            units: new Set(),
            refTexts: new Set(),
            reportIds: new Set()
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
      const byDateAsc = group.rows.slice().sort((a, b) => new Date(a.reportDate) - new Date(b.reportDate));
      const byDateDesc = byDateAsc.slice().reverse();
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
        abnormalCount: group.rows.filter((row) => ['high', 'low', 'abnormal', 'positive'].includes(String(row.tone || ''))).length,
        firstSeenAt: byDateAsc[0] && byDateAsc[0].reportDate || '',
        latestSeenAt: byDateDesc[0] && byDateDesc[0].reportDate || '',
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
      return new Date(b.latestSeenAt) - new Date(a.latestSeenAt);
    });
  }

  function detectDuplicateCandidates({ profileId, ocrTaskId, reports: draftReports }) {
    const candidates = [];
    const drafts = draftReports || [];
    drafts.forEach((draft) => {
      const incoming = normalizeReportIdentity(draft);
      if (!incoming.reportDate) return;
      getActiveReports(profileId).forEach((existing) => {
        const current = normalizeReportIdentity(existing);
        const sameDate = sameText(incoming.reportDate, current.reportDate);
        const sameHospital = sameHospitalName(incoming.hospital, current.hospital);
        const sameTypeKey = incoming.typeKey && current.typeKey
          ? sameText(incoming.typeKey, current.typeKey)
          : sameText(incoming.type, current.type);
        const sameExamPart = sameText(incoming.examPart, current.examPart);
        const sameExamMethod = sameText(incoming.examMethod, current.examMethod);
        if (!sameDate || !sameTypeKey || !sameExamPart || !sameExamMethod) return;

        const { metricOverlapRatio, sameResultRatio } = compareMetricResults(draft.metrics, existing.metrics);
        const isImaging = incoming.modality === 'imaging' || existing.modality === 'imaging';
        const resultMatches = isImaging || sameResultRatio >= 0.8;
        const highOverlap = isImaging || metricOverlapRatio >= 0.8;
        if (!sameHospital && !resultMatches && !highOverlap) return;
        const matchLevel = resultMatches || sameHospital ? 'strong' : 'possible';

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
            metricOverlapRatio,
            sameResultRatio
          },
          suggestedDecision: matchLevel === 'strong' ? 'replace' : 'skip'
        });
      });
    });
    return candidates;
  }

  function rejectDuplicateCandidates(candidates) {
    return Promise.reject(new ApiError({
      code: 'DUPLICATE_REPORT_REQUIRES_DECISION',
      statusCode: 409,
      message: '发现相似报告，请选择覆盖旧报告或跳过重复报告',
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

    signUploads({ profileId, files } = {}) {
      return ok({
        uploads: (files || []).map((file, index) => ({
          clientFileId: file.clientFileId,
          photoId: `photo_mock_${Date.now()}_${index + 1}`,
          objectKey: `mock/${profileId || 'profile'}/${file.fileName || `image_${index + 1}`}`,
          uploadUrl: `mock-upload://${file.clientFileId || index + 1}`,
          headers: {},
          expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString()
        }))
      });
    },

    completeUploads({ uploads } = {}) {
      return ok({
        photos: (uploads || []).map((upload) => ({
          photoId: upload.photoId,
          objectKey: upload.objectKey || '',
          status: 'uploaded',
          sha256: upload.sha256 || null
        }))
      });
    },

    listReports(profileId, params = {}) {
      const rows = getActiveReports(profileId).filter((report) => inRange(report, params));
      return ok(params.limit ? rows.slice(0, Number(params.limit)) : rows);
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
        report.metrics = payload.metrics.map((metric) => ({
          ...metric,
          tone: normalizedMetricTone(metric, metric.valueType || 'quantitative')
        }));
      }
      report.abnormalCount = (report.metrics || []).filter((metric) => {
        return ['high', 'low', 'abnormal', 'positive'].includes(String(metric.tone || ''));
      }).length;
      persistStoredReports(reports);
      return this.getReportDetail(reportId);
    },

    createManualReport(profileId, payload = {}) {
      const metric = payload.metric || {};
      const reportDate = payload.reportDate || new Date().toISOString().slice(0, 10);
      const draftId = `manual_${Date.now()}`;
      const category = metric.category || 'lab';
      const isImagingCategory = ['exam', 'imaging', 'ultrasound'].includes(category);
      const isViewOnly = ['exam', 'electrophysiology', 'pathology', 'imaging', 'ultrasound'].includes(category) || metric.valueType === 'text';
      const findings = metric.valueType === 'text' && metric.valueQualitative ? [metric.valueQualitative] : [];
      const report = toPersistedReport({
        draftId,
        sourcePhotoIds: [],
        pageCount: 0,
        basicInfo: {
          type: metric.categoryCn || '\u624b\u52a8\u5f55\u5165',
          originalType: metric.categoryCn || '\u624b\u52a8\u5f55\u5165',
          typeKey: `manual_${category}`,
          canonicalTypeName: metric.categoryCn || '\u624b\u52a8\u5f55\u5165',
          modality: isImagingCategory ? 'imaging' : 'laboratory',
          analysisPolicy: isViewOnly ? 'view_only' : 'metric_analysis',
          hospital: payload.hospital || '\u624b\u52a8\u5f55\u5165',
          hospitalSource: payload.hospital ? 'user_edited' : 'unknown',
          reportDate,
          reportDateSource: 'user_edited'
        },
        metrics: [{
          ...metric,
          metricKey: canonicalMetricKey(metric, { fallback: `manual_metric_${Date.now()}` }),
          metricName: metric.metricName || '\u624b\u52a8\u6307\u6807',
          originalMetricName: metric.originalMetricName || metric.metricName || '\u624b\u52a8\u6307\u6807',
          mappingStatus: metric.mappingStatus || 'confirmed',
          isManuallyEdited: true
        }],
        findings,
        warnings: [],
        status: 'confirmed',
        note: payload.note || ''
      }, profileId, null, reports.length);
      report.id = `report_${draftId}`;
      report.note = payload.note || '';
      reports.push(report);
      persistStoredReports(reports);
      return this.getReportDetail(report.id);
    },

    listManualTemplates(profileId) {
      return ok(listCustomMetrics(profileId));
    },

    saveManualTemplate(profileId, payload = {}) {
      return ok(saveCustomMetric(profileId, payload));
    },

    archiveManualTemplate(profileId, metricKey) {
      archiveCustomMetric(profileId, metricKey);
      return ok({ ok: true });
    },

    deleteReport(reportId) {
      const report = reports.find((item) => item.id === reportId);
      if (report) report.deletedAt = new Date().toISOString();
      persistStoredReports(reports);
      return ok({ ok: true });
    },

    listMetricSnapshots(profileId, params = {}) {
      let rows = getMetricSnapshots(profileId, params).map(applyPinned);
      if (params.filter === 'abnormal') rows = rows.filter((item) => ['high', 'low', 'abnormal', 'positive'].includes(String(item.lastTone || '')));
      if (params.filter === 'pinned') rows = rows.filter((item) => item.isPinned);
      if (params.category) rows = rows.filter((item) => item.category === params.category || item.categoryCn === params.category);
      return ok(rows);
    },

    listPendingMetricCandidates(profileId, params = {}) {
      return ok(getPendingMetricCandidates(profileId, params));
    },

    getMetricHistory(profileId, metricKey, params = {}) {
      const canonicalKey = canonicalMetricKey({ metricKey });
      const history = getMetricHistory(profileId, canonicalKey, params);
      return ok({
        metricKey: canonicalKey,
        metricName: history[0] && history[0].metricName,
        valueType: history[0] && history[0].valueType,
        history
      });
    },

    setMetricPinned(profileId, metricKey, isPinned) {
      const canonicalKey = canonicalMetricKey({ metricKey });
      return this.listMetricSnapshots(profileId).then((rows) => {
        const snapshot = rows.find((item) => item.metricKey === canonicalKey);
        if (!snapshot) {
          return Promise.reject({
            code: 'NOT_FOUND',
            message: '指标不存在'
          });
        }
        pinnedOverrides[`${profileId}:${canonicalKey}`] = !!isPinned;
        return { ...snapshot, isPinned: !!isPinned };
      });
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

    updateRecheckPlan(planId, payload) {
      const plan = findRecheckPlan(planId);
      if (!plan) return ok(null);
      ['type', 'date', 'timeOfDay', 'hospital', 'department', 'doctor'].forEach((key) => {
        if (payload[key] !== undefined) plan[key] = payload[key] || '';
      });
      if (payload.reminderConfig !== undefined) plan.reminderConfig = payload.reminderConfig;
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

    addRecheckTodo(planId, payload) {
      const plan = findRecheckPlan(planId);
      if (!plan) return ok(null);
      const sortOrder = payload.sortOrder || ((plan.todos || []).reduce((max, todo) => Math.max(max, todo.sortOrder || 0), 0) + 1);
      const todo = {
        id: `todo_mock_${planId}_${sortOrder}`,
        text: payload.text,
        isDone: !!payload.isDone,
        isTemplate: payload.isTemplate === true,
        sortOrder
      };
      plan.todos = (plan.todos || []).concat(todo);
      return ok(plan);
    },

    deleteRecheckTodo(planId, todoId) {
      const plan = findRecheckPlan(planId);
      if (!plan) return ok(null);
      plan.todos = (plan.todos || []).filter((todo) => todo.id !== todoId);
      return ok(plan);
    },

    completeRecheckPlan(planId) {
      const plan = findRecheckPlan(planId);
      if (!plan) return ok(null);
      const unfinished = (plan.todos || []).filter((todo) => !todo.isDone);
      if (unfinished.length) {
        return Promise.reject({
          code: 'RECHECK_TODOS_NOT_READY',
          message: '请先完成全部复查待办',
          details: {
            unfinishedTodoIds: unfinished.map((todo) => todo.id)
          }
        });
      }
      plan.status = 'done';
      return ok(plan);
    },

    cancelRecheckPlan(planId) {
      const plan = findRecheckPlan(planId);
      if (!plan) return ok(null);
      plan.status = 'cancelled';
      return ok(plan);
    },

    deleteRecheckPlan(planId) {
      const plan = findRecheckPlan(planId);
      if (!plan) return ok(null);
      plan.deletedAt = new Date().toISOString();
      return ok(plan);
    },

    createExport(profileId, payload = {}) {
      const exportId = `export_mock_${Object.keys(exports).length + 1}`;
      const createdAt = new Date();
      const result = {
        exportId,
        status: 'ready',
        format: 'json',
        fileName: `healthhelper-${profileId}-${createdAt.toISOString().slice(0, 10)}.json`,
        downloadUrl: `mock-download://${exportId}`,
        expiresAt: new Date(createdAt.getTime() + 24 * 60 * 60 * 1000).toISOString(),
        payload
      };
      exports[exportId] = result;
      return ok(result);
    },

    getExport(exportId) {
      return ok(exports[exportId] || null);
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
        drafts: reports.map(toOcrDraft)
      };
      ocrTasks[task.id] = task;
      return ok(task);
    },

    listOcrTasks(params = {}) {
      const statuses = String(params.status || '')
        .split(',')
        .map((status) => status.trim())
        .filter(Boolean);
      const tasks = Object.values(ocrTasks)
        .filter((task) => {
          if (params.profileId && task.profileId !== params.profileId) return false;
          if (statuses.length && !statuses.includes(task.status)) return false;
          return true;
        })
        .sort((a, b) => String(b.id).localeCompare(String(a.id)));
      return ok(tasks);
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

    cancelOcrTask(taskId) {
      const task = ocrTasks[taskId];
      if (!task) return ok({ id: taskId, status: 'cancelled', drafts: [] });
      task.status = 'cancelled';
      task.drafts = (task.drafts || []).map((draft) => ({
        ...draft,
        status: 'cancelled'
      }));
      return ok(task);
    },

    retryOcrTask(taskId) {
      const task = ocrTasks[taskId];
      if (!task) return ok({ id: taskId, status: 'queued', drafts: [], errorCode: '', errorMessage: '' });
      if (['confirmed', 'cancelled'].includes(task.status)) {
        return Promise.reject(new ApiError({
          code: 'CONFLICT',
          statusCode: 409,
          message: 'AI识别任务当前状态不能重试'
        }));
      }
      task.status = 'queued';
      task.errorCode = '';
      task.errorMessage = '';
      return ok(task);
    },

    resolveOcrConflict({ taskId, draftId, metricKey, selectedCandidateIndex = 0, resolution }) {
      const identityValues = (conflict) => [
        conflict && conflict.metricKey,
        conflict && conflict.metricName,
        ...((conflict && conflict.candidates) || []).flatMap((candidate) => [
          candidate && candidate.metricKey,
          candidate && candidate.metricName,
          candidate && candidate.originalMetricName
        ])
      ].map((value) => String(value || '').trim()).filter(Boolean);
      const conflictMatchesKey = (conflict) => identityValues(conflict).indexOf(String(metricKey || '').trim()) >= 0;
      const metricMatchesConflict = (metric, conflict) => {
        const keys = identityValues(conflict).concat(String(metricKey || '').trim()).filter(Boolean);
        return [metric && metric.metricKey, metric && metric.metricName, metric && metric.originalMetricName]
          .map((value) => String(value || '').trim())
          .filter(Boolean)
          .some((value) => keys.indexOf(value) >= 0);
      };
      const task = ocrTasks[taskId];
      if (!task) return ok({ taskId, draftId, metricKey, selectedCandidateIndex, status: 'resolved' });
      const draft = task.drafts.find((item) => item.draftId === draftId);
      if (!draft) return ok({ taskId, draftId, metricKey, selectedCandidateIndex, status: 'resolved' });
      const conflict = (draft.conflicts || []).find(conflictMatchesKey);
      const resolvedResolution = resolution || (selectedCandidateIndex < 0 ? 'delete' : 'keep');
      const candidate = conflict && resolvedResolution !== 'delete' && selectedCandidateIndex >= 0 ? conflict.candidates[selectedCandidateIndex] : null;
      if (candidate) {
        const valueNumeric = Number(candidate.value);
        const refRangeLow = 3.5;
        const refRangeHigh = 9.5;
        const metric = {
          metricKey: candidate.metricKey || conflict.metricKey || metricKey,
          metricName: candidate.metricName || conflict.metricName || metricKey,
          originalMetricName: candidate.originalMetricName || candidate.metricName || conflict.metricName || metricKey,
          category: 'blood_routine',
          categoryCn: '血常规',
          mappingStatus: 'confirmed',
          valueType: 'quantitative',
          valueNumeric: Number.isFinite(valueNumeric) ? valueNumeric : null,
          valueQualitative: null,
          valueText: String(candidate.value || ''),
          unit: candidate.unit || '',
          refRangeLow,
          refRangeHigh,
          refQualitative: null,
          refText: `${refRangeLow}-${refRangeHigh}`,
          tone: Number.isFinite(valueNumeric) ? calculateTone(valueNumeric, refRangeLow, refRangeHigh, 'quantitative') : 'unknown',
          ocrConfidence: candidate.confidence || 0.8
        };
        draft.metrics = (draft.metrics || []).filter((item) => !metricMatchesConflict(item, conflict)).concat(metric);
      } else if (resolvedResolution === 'delete') {
        draft.metrics = (draft.metrics || []).filter((item) => !metricMatchesConflict(item, conflict));
      }
      draft.conflicts = (draft.conflicts || []).filter((conflict) => !conflictMatchesKey(conflict));
      if (draft.conflicts.length === 0) draft.status = 'needs_review';
      task.status = task.drafts.some((item) => (item.conflicts || []).length > 0) ? 'needs_confirmation' : 'ready_to_save';
      return ok({ taskId, draftId, metricKey, selectedCandidateIndex, resolution: resolvedResolution, status: 'resolved' });
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

    deleteOcrDraft(taskId, draftId) {
      const task = ocrTasks[taskId];
      if (!task) return ok({ id: taskId, drafts: [], reportCount: 0, status: 'cancelled' });
      task.drafts = (task.drafts || []).filter((draft) => draft.draftId !== draftId);
      task.reportCount = task.drafts.length;
      task.status = task.reportCount
        ? (task.drafts.some((draft) => (draft.conflicts || []).length > 0) ? 'needs_confirmation' : 'ready_to_save')
        : 'cancelled';
      return ok(task);
    },

    splitOcrDraft(taskId, draftId) {
      const task = ocrTasks[taskId];
      if (!task) return Promise.reject(new ApiError({ code: 'NOT_FOUND', statusCode: 404, message: 'AI识别草稿不存在' }));
      const index = (task.drafts || []).findIndex((draft) => draft.draftId === draftId);
      if (index < 0) return Promise.reject(new ApiError({ code: 'NOT_FOUND', statusCode: 404, message: 'AI识别草稿不存在' }));
      if (['confirmed', 'cancelled'].includes(task.status)) {
        return Promise.reject(new ApiError({ code: 'CONFLICT', statusCode: 409, message: 'AI识别草稿当前状态不能拆分' }));
      }
      const draft = task.drafts[index];
      const sourcePhotoIds = (draft.sourcePhotoIds || []).filter(Boolean);
      if (sourcePhotoIds.length < 2) {
        return Promise.reject(new ApiError({ code: 'OCR_DRAFT_NOT_SPLITTABLE', statusCode: 409, message: '只有多页 AI识别草稿可以拆分' }));
      }
      const originalMetrics = draft.metrics || [];
      const originalFindings = draft.findings || [];
      const originalConflicts = draft.conflicts || [];
      const firstSplitStatus = ['needs_manual_input', 'not_report'].includes(draft.status)
        ? draft.status
        : (originalConflicts.length ? 'needs_confirmation' : (originalMetrics.length || originalFindings.length ? 'needs_review' : 'needs_manual_input'));
      const splitWarning = {
        code: 'OCR_DRAFT_SPLIT_FROM_MULTIPAGE',
        message: '这份报告由多页 AI识别草稿拆分而来，保存前请逐页核对。'
      };
      const splitDrafts = sourcePhotoIds.map((photoId, photoIndex) => ({
        ...clone(draft),
        draftId: `${draftId}_split_${photoIndex + 1}`,
        sourcePhotoIds: [photoId],
        pageCount: 1,
        basicInfo: {
          ...(draft.basicInfo || {}),
          reportLike: draft.basicInfo?.reportLike !== false,
          splitFromDraftId: draftId,
          splitPageIndex: photoIndex + 1,
          splitPageCount: sourcePhotoIds.length
        },
        metrics: photoIndex === 0 ? originalMetrics : [],
        findings: photoIndex === 0 ? originalFindings : [],
        conflicts: photoIndex === 0 ? originalConflicts : [],
        warnings: (draft.warnings || []).concat(splitWarning),
        status: photoIndex === 0 ? firstSplitStatus : 'needs_manual_input'
      }));
      task.drafts.splice(index, 1, ...splitDrafts);
      task.reportCount = task.drafts.length;
      task.status = task.drafts.some((item) => (item.conflicts || []).length > 0) ? 'needs_confirmation' : 'ready_to_save';
      return ok(task);
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
      if (task && !['needs_confirmation', 'ready_to_save', 'confirmed'].includes(task.status)) {
        return Promise.reject({
          code: 'UNREVIEWED_OCR_DRAFTS',
          message: 'AI识别报告仍需核对或手动补全后再保存',
          details: {
            drafts: [{
              draftId: '',
              status: task.status,
              reason: ['queued', 'processing'].includes(task.status) ? 'task_still_processing' : 'task_not_ready'
            }]
          }
        });
      }
      const unresolvedConflicts = drafts
        .map((draft) => ({
          draftId: draft.draftId,
          conflicts: draft.conflicts || []
        }))
        .filter((item) => item.conflicts.length > 0);
      if (unresolvedConflicts.length) {
        return Promise.reject({
          code: 'UNRESOLVED_REPORT_CONFLICTS',
          message: '请先处理冲突后再保存',
          details: {
            conflicts: unresolvedConflicts
          }
        });
      }
      const blockedDrafts = drafts.map((draft) => {
        const info = draft.basicInfo || {};
        const metrics = draft.metrics || [];
        const findings = (draft.findings || []).filter((item) => String(item || '').trim());
        let reason = '';
        if (['needs_manual_input', 'not_report', 'cancelled', 'failed'].includes(draft.status)) reason = 'status_not_reviewed';
        else if (info.reportLike === false) reason = 'not_report_like';
        else if (!metrics.length && !findings.length) reason = 'empty_report_content';
        else if (!info.hospital || !info.reportDate || info.hospital === '待确认医院' || info.reportDate === '待确认日期') reason = 'missing_basic_info';
        return {
          draftId: draft.draftId || '',
          status: draft.status || '',
          reason
        };
      }).filter((draft) => draft.reason);
      if (!drafts.length || blockedDrafts.length) {
        return Promise.reject({
          code: 'UNREVIEWED_OCR_DRAFTS',
          message: 'AI识别报告仍需核对或手动补全后再保存',
          details: {
            drafts: blockedDrafts.length
              ? blockedDrafts
              : [{ draftId: '', status: 'empty', reason: 'no_reviewable_drafts' }]
          }
        });
      }
      const candidates = detectDuplicateCandidates({ profileId, ocrTaskId, reports: drafts });
      const decisionByDraft = duplicateDecisions.reduce((acc, item) => {
        if (item && item.draftId) acc[item.draftId] = item;
        return acc;
      }, {});
      const unresolved = candidates.filter((candidate) => !decisionByDraft[candidate.draftId]);
      if (unresolved.length) return rejectDuplicateCandidates(unresolved);
      const draftIds = new Set(drafts.map((draft) => draft.draftId));
      const allowedExistingByDraft = candidates.reduce((acc, candidate) => {
        if (!candidate.draftId || !candidate.existingReportId) return acc;
        if (!acc[candidate.draftId]) acc[candidate.draftId] = new Set();
        acc[candidate.draftId].add(candidate.existingReportId);
        return acc;
      }, {});
      const invalidDecision = duplicateDecisions.some((decision) => {
        if (!draftIds.has(decision.draftId)) return true;
        if (decision.decision !== 'replace') return false;
        return !decision.existingReportId || !allowedExistingByDraft[decision.draftId] || !allowedExistingByDraft[decision.draftId].has(decision.existingReportId);
      });
      if (invalidDecision) {
        return Promise.reject({
          code: 'INVALID_DUPLICATE_DECISION',
          message: '重复报告处理参数无效，请重新确认后再保存'
        });
      }

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
      persistStoredReports(reports);
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
