const { api } = require('../../utils/api');
const { isNotFoundError, showApiErrorToast } = require('../../utils/error');
const { isRecognizingTaskStatus, shouldShowRecognitionSlow } = require('../../utils/ocr-task');
const { buildSourcePreviewUrls, getStoredUploadPhotos } = require('../../utils/source-preview');

const RECOGNITION_POLL_INTERVAL_MS = 1500;
const RECOGNITION_SLOW_MS = 10000;

function buildReportTitle(index, draft) {
  const pageCount = draft.pageCount || (draft.sourcePhotoIds || []).length || 1;
  if (pageCount > 1) return `\u62a5\u544a ${index + 1} \u00b7 \u5df2\u5408\u5e76 ${pageCount} \u9875`;
  return `\u62a5\u544a ${index + 1}`;
}

function buildReportMeta(draft) {
  const info = draft.basicInfo || {};
  const base = [info.hospital || '\u5f85\u786e\u8ba4\u533b\u9662', info.reportDate || '\u5f85\u786e\u8ba4\u65e5\u671f'];
  if (info.modality === 'imaging' && info.examPart) base.push(info.examPart);
  return base.join(' \u00b7 ');
}

function isMissingBasicInfoValue(value, placeholder) {
  const text = String(value || '').trim();
  return !text || text === placeholder;
}

function hasMissingRequiredBasicInfo(info) {
  return isMissingBasicInfoValue(info.hospital, '\u5f85\u786e\u8ba4\u533b\u9662')
    || isMissingBasicInfoValue(info.reportDate, '\u5f85\u786e\u8ba4\u65e5\u671f');
}

function manualReviewText(reportLike, missingBasicInfo) {
  if (!reportLike) return '\u8fd9\u5f20\u56fe\u4e0d\u50cf\u68c0\u67e5\u62a5\u544a\uff0c\u8bf7\u6838\u5bf9\u3002';
  if (missingBasicInfo) return '\u533b\u9662\u6216\u68c0\u67e5\u65e5\u671f\u5f85\u786e\u8ba4\uff0c\u8bf7\u7f16\u8f91\u8865\u9f50\u540e\u4fdd\u5b58\u3002';
  return '\u672a\u8bc6\u522b\u5230\u53ef\u7528\u5185\u5bb9\uff0c\u53ef\u624b\u52a8\u8865\u5f55\u3002';
}

function warningMessage(warning) {
  if (!warning || typeof warning !== 'object') return '';
  return String(warning.message || warning.code || '').trim();
}

function isOcrReviewed(info) {
  return !!String((info || {}).ocrReviewedAt || '').trim();
}

function metricRequiresDetailReview(metric) {
  if (!metric || typeof metric !== 'object') return false;
  if (['pending', 'conflicted'].includes(String(metric.mappingStatus || ''))) return true;
  if (metric.ocrConfidence === undefined || metric.ocrConfidence === null || metric.ocrConfidence === '') return false;
  const confidence = Number(metric.ocrConfidence);
  return Number.isFinite(confidence) && confidence < 0.85;
}

function hasReviewableWarning(warning) {
  if (!warning || typeof warning !== 'object') return false;
  return !!String(warning.code || warning.message || '').trim();
}

function draftRequiresDetailReview(draft) {
  const warnings = draft.warnings || [];
  const metrics = draft.metrics || [];
  return warnings.some(hasReviewableWarning) || metrics.some(metricRequiresDetailReview);
}

function formatRecognitionElapsed(ms) {
  const seconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  if (!seconds) return '';
  if (seconds < 60) return `\u5df2\u7b49\u5f85 ${seconds} \u79d2`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds
    ? `\u5df2\u7b49\u5f85 ${minutes} \u5206 ${remainingSeconds} \u79d2`
    : `\u5df2\u7b49\u5f85 ${minutes} \u5206`;
}

function recognitionElapsedMs(progress, startedAt, now) {
  const backendElapsed = Number(progress.processingElapsedMs || 0);
  const localElapsed = startedAt ? Math.max(0, now - startedAt) : 0;
  return Math.max(0, backendElapsed, localElapsed);
}

function activeRecognitionProgressPercent(processedReports, totalReports, elapsedMs) {
  const safeTotal = Math.max(1, Number(totalReports || 1));
  const safeProcessed = Math.max(0, Number(processedReports || 0));
  const exactPercent = Math.max(0, Math.min(100, Math.round((safeProcessed / safeTotal) * 100)));
  if (safeProcessed > 0 || exactPercent >= 100) return exactPercent;

  const seconds = Math.max(0, Math.floor((Number(elapsedMs) || 0) / 1000));
  const firstSegmentCap = Math.max(8, Math.min(85, Math.round((100 / safeTotal) * 0.85)));
  const activePercent = Math.max(8, Math.round(seconds * 3));
  return Math.min(firstSegmentCap, activePercent);
}

function toDisplayReport(draft, index, uploadPhotos = []) {
  const conflicts = draft.conflicts || [];
  const metrics = draft.metrics || [];
  const findings = draft.findings || [];
  const warnings = draft.warnings || [];
  const info = draft.basicInfo || {};
  const sourcePhotoIds = draft.sourcePhotoIds || [];
  const sourcePreviewUrls = buildSourcePreviewUrls(sourcePhotoIds, uploadPhotos);
  const abnormalCount = metrics.filter((metric) => ['high', 'low', 'abnormal', 'positive'].includes(String(metric.tone || ''))).length;
  const pendingCount = metrics.filter((metric) => ['pending', 'conflicted'].includes(metric.mappingStatus)).length;
  const inferred = [info.hospitalSource, info.reportDateSource].includes('inferred_from_batch');
  const reportLike = info.reportLike !== false;
  const hasContent = metrics.length > 0 || findings.some((item) => String(item || '').trim());
  const missingBasicInfo = hasMissingRequiredBasicInfo(info);
  const needsManualInput = ['needs_manual_input', 'not_report'].includes(draft.status) || !reportLike || !hasContent || missingBasicInfo;
  const requiresDetailReview = !needsManualInput && draftRequiresDetailReview(draft) && !isOcrReviewed(info);
  const warningMessages = warnings.map(warningMessage).filter(Boolean);

  return {
    draftId: draft.draftId,
    title: buildReportTitle(index, draft),
    type: !reportLike ? '\u672a\u8bc6\u522b\u5230\u68c0\u67e5\u62a5\u544a' : (info.type || '\u5f85\u786e\u8ba4\u62a5\u544a'),
    canonicalTypeName: info.canonicalTypeName || '',
    modality: info.modality || 'laboratory',
    examPart: info.examPart || '',
    analysisPolicy: draft.analysisPolicy || (info.modality === 'imaging' ? 'view_only' : 'metric_analysis'),
    meta: buildReportMeta(draft),
    count: !reportLike
      ? '\u8bf7\u8df3\u8fc7\u6216\u91cd\u65b0\u9009\u62e9'
      : (metrics.length ? `${metrics.length} \u9879\u6307\u6807` : (findings.length ? '\u5f71\u50cf\u6240\u89c1' : '\u672a\u8bc6\u522b\u5230\u5185\u5bb9')),
    abnormal: abnormalCount ? `${abnormalCount} \u9879\u5f02\u5e38` : '',
    pendingText: pendingCount ? `${pendingCount} \u9879\u5f85\u786e\u8ba4\u5f52\u7c7b` : '',
    warningText: warningMessages[0] || '',
    warningMoreText: warningMessages.length > 1 ? `另有 ${warningMessages.length - 1} 项 AI识别风险提示` : '',
    manualText: needsManualInput ? manualReviewText(reportLike, missingBasicInfo) : '',
    inferredText: inferred ? '\u90e8\u5206\u57fa\u672c\u4fe1\u606f\u6765\u81ea\u540c\u6279\u63a8\u6d4b' : '',
    conflict: conflicts.length > 0,
    conflictCount: conflicts.length,
    metricKey: conflicts[0] && conflicts[0].metricKey,
    sourcePhotoIds,
    sourcePreviewUrls,
    sourcePreviewCount: sourcePreviewUrls.length,
    pageCount: draft.pageCount || sourcePhotoIds.length || 1,
    canSplit: (draft.pageCount || sourcePhotoIds.length || 1) > 1,
    status: draft.status || '',
    reportLike,
    basicInfoIncomplete: missingBasicInfo,
    reviewRequiredText: requiresDetailReview ? 'AI识别风险项请重点核对，确认无误后可直接保存。' : '',
    requiresDetailReview,
    needsManualInput
  };
}

function chooseDuplicateDecision(candidates) {
  const first = candidates[0] || {};
  const countText = candidates.length > 1 ? `等 ${candidates.length} 份` : '';
  const typeText = first.existingReportType || '相似报告';
  const dateText = first.existingReportDate || '';
  return new Promise((resolve, reject) => {
    wx.showActionSheet({
      alertText: `已存在 ${dateText} ${typeText}${countText}，请选择保存方式`,
      itemList: ['覆盖旧报告', '跳过重复报告'],
      success(res) {
        const decisions = ['replace', 'skip'];
        resolve(decisions[res.tapIndex] || 'skip');
      },
      fail(error) {
        reject(error);
      }
    });
  });
}

function buildProfileLabel(profile) {
  if (!profile) return '\u53d1\u8d77\u4e0a\u4f20\u65f6\u7684\u6863\u6848';
  return `${profile.relation || ''}${profile.realName || ''}` || '\u53d1\u8d77\u4e0a\u4f20\u65f6\u7684\u6863\u6848';
}

Page({
  taskId: '',
  drafts: [],
  recognitionTimer: null,
  recognitionStartedAt: 0,

  data: {
    loading: false,
    saving: false,
    recognizing: false,
    slowRecognition: false,
    recognitionTitle: '正在识别报告',
    recognitionMessage: '系统正在读取图片内容，请稍候。',
    recognitionStatusText: '当前状态：后台识别中',
    recognitionProgressText: '已处理 0 / 0 份',
    recognitionProgressPercent: 0,
    profileId: '',
    reports: [],
    reportCount: 0,
    unresolvedConflictCount: 0,
    taskStatus: '',
    errorMessage: '',
    retrying: false,
    removingDraftIndex: -1,
    splittingDraftIndex: -1,
    openingDetailIndex: -1,
    openingManualIndex: -1,
    profileNoticeText: '',
    saveDebug: ''
  },

  onLoad(query = {}) {
    this.taskId = query.taskId || '';
    this.recognitionStartedAt = query.recognizing ? Date.now() : 0;
  },

  onShow() {
    this.setData({
      openingDetailIndex: -1,
      openingManualIndex: -1
    });
    this.loadTask();
  },

  onUnload() {
    this.clearRecognitionTimer();
  },

  clearRecognitionTimer() {
    if (!this.recognitionTimer) return;
    clearTimeout(this.recognitionTimer);
    this.recognitionTimer = null;
  },

  scheduleRecognitionPoll() {
    this.clearRecognitionTimer();
    this.recognitionTimer = setTimeout(() => {
      this.loadTask();
    }, RECOGNITION_POLL_INTERVAL_MS);
  },

  syncPendingTask(task) {
    const pending = wx.getStorageSync('pendingOcrTasks') || [];
    const next = pending.map((item) => {
      if (item.taskId !== task.id) return item;
      return {
        ...item,
        status: task.status,
        reportCount: task.reportCount,
        photoCount: task.photoCount
      };
    });
    wx.setStorageSync('pendingOcrTasks', next);
  },

  removePendingTask() {
    const pending = wx.getStorageSync('pendingOcrTasks') || [];
    wx.setStorageSync('pendingOcrTasks', pending.filter((item) => item.taskId !== this.taskId));
  },

  handleStaleTask() {
    this.clearRecognitionTimer();
    this.removePendingTask();
    this.setData({
      loading: false,
      recognizing: false,
      slowRecognition: false,
      retrying: false,
      errorMessage: ''
    });
    wx.showToast({ title: '识别任务已失效，请重新上传', icon: 'none' });
    setTimeout(() => {
      wx.switchTab({ url: '/pages/home/index' });
    }, 600);
  },

  showRecognizingTask(task) {
    const now = Date.now();
    if (!this.recognitionStartedAt) this.recognitionStartedAt = now;
    const progress = task.progress || {};
    const isStaleRecognition = !!progress.isStale;
    const slowRecognition = isStaleRecognition || shouldShowRecognitionSlow(this.recognitionStartedAt, now, RECOGNITION_SLOW_MS);
    const processedReports = Number(progress.processedReports || 0);
    const totalReports = Math.max(1, Number(progress.totalReports || task.reportCount || 1));
    const elapsedMs = recognitionElapsedMs(progress, this.recognitionStartedAt, now);
    const recognitionProgressPercent = activeRecognitionProgressPercent(processedReports, totalReports, elapsedMs);
    const elapsedText = formatRecognitionElapsed(elapsedMs);
    const progressSuffix = elapsedText ? ` \u00b7 ${elapsedText}` : '';
    this.drafts = [];
    this.setData({
      loading: false,
      recognizing: true,
      slowRecognition,
      recognitionTitle: isStaleRecognition ? '识别耗时较久' : (slowRecognition ? '识别时间比预期更久' : '正在识别报告'),
      recognitionMessage: slowRecognition
        ? '真实 AI识别可能需要更长时间。你可以稍后从首页继续查看，也可以取消本次任务。'
        : '系统正在读取图片内容，请保持网络通畅。',
      recognitionStatusText: slowRecognition
        ? (isStaleRecognition ? '当前状态：后台处理时间已超过预期，建议稍后查看；长时间无变化可取消后重新上传。' : '当前状态：仍在后台处理，完成后会自动进入确认')
        : '当前状态：后台识别中，完成后会自动刷新',
      recognitionProgressText: `已处理 ${processedReports} / ${totalReports} 份${progressSuffix}`,
      recognitionProgressPercent,
      profileId: task.profileId || '',
      reports: [],
      reportCount: task.reportCount || 0,
      unresolvedConflictCount: 0,
      taskStatus: task.status || '',
      errorMessage: ''
    });
    this.updateProfileNotice(task.profileId || '');
    this.syncPendingTask(task);
    this.scheduleRecognitionPoll();
  },

  loadTask() {
    if (!this.taskId) {
      wx.showToast({ title: '\u672a\u627e\u5230\u8bc6\u522b\u4efb\u52a1', icon: 'none' });
      return;
    }

    this.setData({ loading: true });
    return api.getOcrTask(this.taskId).then((task) => {
      if (isRecognizingTaskStatus(task.status)) {
        this.showRecognizingTask(task);
        return;
      }
      this.clearRecognitionTimer();
      this.drafts = task.drafts || [];
      const uploadPhotos = getStoredUploadPhotos();
      const reports = this.drafts.map((draft, index) => toDisplayReport(draft, index, uploadPhotos));
      const failed = task.status === 'failed';
      this.setData({
        loading: false,
        recognizing: false,
        slowRecognition: false,
        profileId: task.profileId || '',
        reports: failed ? [] : reports,
        reportCount: task.reportCount || reports.length,
        unresolvedConflictCount: reports.reduce((sum, report) => sum + (report.conflictCount || 0), 0),
        taskStatus: task.status || '',
        errorMessage: failed ? (task.errorMessage || '\u8bc6\u522b\u670d\u52a1\u6682\u65f6\u672a\u8fd4\u56de\u7ed3\u679c\uff0c\u8bf7\u91cd\u8bd5') : ''
      });
      this.updateProfileNotice(task.profileId || '');
      this.syncPendingTask(task);
      if (task.profileId) wx.setStorageSync('healthhelperBackendProfileId', task.profileId);
    }).catch((error) => {
      this.clearRecognitionTimer();
      this.setData({ loading: false, recognizing: false, slowRecognition: false });
      if (isNotFoundError(error)) {
        this.handleStaleTask();
        return;
      }
      showApiErrorToast(error, '\u52a0\u8f7d\u8bc6\u522b\u7ed3\u679c\u5931\u8d25');
    });
  },

  updateProfileNotice(profileId) {
    if (!profileId || profileId === getApp().getCurrentProfileId()) {
      this.setData({ profileNoticeText: '' });
      return;
    }
    api.getProfiles().then((profiles) => {
      const profile = (profiles || []).find((item) => item.id === profileId);
      this.setData({
        profileNoticeText: `\u6b63\u5728\u786e\u8ba4${buildProfileLabel(profile)}\u7684\u62a5\u544a\uff0c\u4fdd\u5b58\u65f6\u4e0d\u4f1a\u5f52\u5165\u5f53\u524d\u6d4f\u89c8\u6863\u6848\u3002`
      });
    }).catch(() => {
      this.setData({
        profileNoticeText: '\u6b63\u5728\u786e\u8ba4\u53d1\u8d77\u4e0a\u4f20\u65f6\u7684\u6863\u6848\u62a5\u544a\uff0c\u4fdd\u5b58\u65f6\u4e0d\u4f1a\u5f52\u5165\u5f53\u524d\u6d4f\u89c8\u6863\u6848\u3002'
      });
    });
  },

  goBack() {
    if (!this.taskId) {
      wx.navigateBack();
      return;
    }
    wx.showModal({
      title: '\u53d6\u6d88\u4fdd\u5b58\uff1f',
      content: '\u8bc6\u522b\u7ed3\u679c\u5c1a\u672a\u4fdd\u5b58\uff0c\u53d6\u6d88\u540e\u5c06\u4e22\u5f03\u672c\u6b21\u8bc6\u522b\u4efb\u52a1\u3002',
      confirmText: '\u4e22\u5f03',
      confirmColor: '#C56F5F',
      success: (res) => {
        if (!res.confirm) return;
        this.cancelTaskAndLeave();
      }
    });
  },

  cancelTaskAndLeave() {
    this.clearRecognitionTimer();
    api.cancelOcrTask(this.taskId).catch(() => null).then(() => {
      const pending = wx.getStorageSync('pendingOcrTasks') || [];
      wx.setStorageSync('pendingOcrTasks', pending.filter((item) => item.taskId !== this.taskId));
      wx.removeStorageSync('uploadPhotos');
      wx.navigateBack({
        fail: () => wx.switchTab({ url: '/pages/home/index' })
      });
    });
  },

  goHomeWhileRecognizing() {
    this.clearRecognitionTimer();
    wx.switchTab({ url: '/pages/home/index' });
  },

  goHome() {
    wx.switchTab({ url: '/pages/home/index' });
  },

  reupload() {
    wx.removeStorageSync('uploadPhotos');
    wx.redirectTo({
      url: '/pages/upload/pick',
      fail: () => wx.switchTab({ url: '/pages/home/index' })
    });
  },

  openDetailPage(index, querySuffix = '', manual = false) {
    if (this.data.openingDetailIndex >= 0 || this.data.openingManualIndex >= 0) return;
    const reportIndex = Number(index);
    if (!this.taskId || !Number.isFinite(reportIndex) || reportIndex < 0) {
      wx.showToast({ title: '未找到报告详情', icon: 'none' });
      return;
    }
    this.setData(manual ? { openingManualIndex: reportIndex } : { openingDetailIndex: reportIndex });
    const url = `/pages/upload/edit-detail?taskId=${this.taskId}&reportIdx=${reportIndex}${querySuffix}`;
    wx.navigateTo({
      url,
      fail: () => {
        wx.redirectTo({
          url: `${url}&replaceConfirm=1`,
          fail: () => {
            this.setData({
              openingDetailIndex: -1,
              openingManualIndex: -1
            });
            wx.showToast({ title: '打开详情失败，请重试', icon: 'none' });
          }
        });
      }
    });
  },

  goEdit(event) {
    this.openDetailPage(event.currentTarget.dataset.index);
  },

  goManualFill(event) {
    this.openDetailPage(event.currentTarget.dataset.index, '&editing=1&manual=1', true);
  },

  previewSourcePhoto(event) {
    const index = Number(event.currentTarget.dataset.index);
    const report = this.data.reports[index] || {};
    const urls = report.sourcePreviewUrls || [];
    if (!urls.length) return;
    wx.previewImage({
      current: urls[0],
      urls
    });
  },

  removeDraft(event) {
    const index = Number(event.currentTarget.dataset.index);
    if (this.data.removingDraftIndex >= 0) return;
    const draft = this.drafts[index];
    if (!draft || !draft.draftId) {
      wx.showToast({ title: '未找到可移除的报告', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '移除本次报告？',
      content: '仅从本次识别结果中移除，不会影响已经保存到病例夹的报告。',
      confirmText: '移除',
      confirmColor: '#C07060',
      success: (res) => {
        if (!res.confirm) return;
        this.setData({ removingDraftIndex: index });
        api.deleteOcrDraft(this.taskId, draft.draftId).then((task) => {
          wx.showToast({ title: '已移除', icon: 'success' });
          this.drafts = task.drafts || [];
          const uploadPhotos = getStoredUploadPhotos();
          const reports = this.drafts.map((draft, draftIndex) => toDisplayReport(draft, draftIndex, uploadPhotos));
          this.setData({
            removingDraftIndex: -1,
            reports,
            reportCount: task.reportCount || reports.length,
            unresolvedConflictCount: reports.reduce((sum, report) => sum + (report.conflictCount || 0), 0),
            taskStatus: task.status || ''
          });
          this.syncPendingTask(task);
        }).catch((error) => {
          this.setData({ removingDraftIndex: -1 });
          if (isNotFoundError(error)) {
            this.handleStaleTask();
            return;
          }
          showApiErrorToast(error, '移除失败');
        });
      }
    });
  },

  splitDraft(event) {
    const index = Number(event.currentTarget.dataset.index);
    if (this.data.splittingDraftIndex >= 0) return;
    const draft = this.drafts[index];
    const displayReport = this.data.reports[index] || {};
    if (!draft || !draft.draftId || !displayReport.canSplit) {
      wx.showToast({ title: '这份报告不能继续拆分', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '拆分这份报告？',
      content: '会按图片页拆成多份待核查报告。已识别到的内容会保留在第一份，其余页面需要手动补录或重新上传核对。',
      confirmText: '拆分',
      confirmColor: '#5B7F5E',
      success: (res) => {
        if (!res.confirm) return;
        this.setData({ splittingDraftIndex: index });
        api.splitOcrDraft(this.taskId, draft.draftId).then((task) => {
          wx.showToast({ title: '已拆分', icon: 'success' });
          this.drafts = task.drafts || [];
          const uploadPhotos = getStoredUploadPhotos();
          const reports = this.drafts.map((draft, draftIndex) => toDisplayReport(draft, draftIndex, uploadPhotos));
          this.setData({
            splittingDraftIndex: -1,
            reports,
            reportCount: task.reportCount || reports.length,
            unresolvedConflictCount: reports.reduce((sum, report) => sum + (report.conflictCount || 0), 0),
            taskStatus: task.status || ''
          });
          this.syncPendingTask(task);
        }).catch((error) => {
          this.setData({ splittingDraftIndex: -1 });
          if (isNotFoundError(error)) {
            this.handleStaleTask();
            return;
          }
          showApiErrorToast(error, '拆分失败');
        });
      }
    });
  },

  goConflict(event) {
    wx.navigateTo({ url: `/pages/upload/conflict?taskId=${this.taskId}&reportIdx=${event.currentTarget.dataset.index}` });
  },

  retryTask() {
    if (this.data.retrying || !this.taskId) return Promise.resolve(false);
    this.setData({ retrying: true });
    return api.retryOcrTask(this.taskId, {}, {
      idempotencyKey: `retry_${this.taskId}_${Date.now()}`
    }).then((task) => {
      const pending = wx.getStorageSync('pendingOcrTasks') || [];
      wx.setStorageSync('pendingOcrTasks', [{
        taskId: task.id,
        profileId: task.profileId,
        status: task.status,
        photoCount: task.photoCount,
        reportCount: task.reportCount,
        createdAt: Date.now()
      }].concat(pending.filter((item) => item.taskId !== task.id)));
      wx.showToast({ title: '\u5df2\u91cd\u65b0\u53d1\u8d77\u8bc6\u522b', icon: 'success' });
      this.clearRecognitionTimer();
      this.setData({ retrying: false });
      setTimeout(() => wx.switchTab({ url: '/pages/home/index' }), 500);
      return task;
    }).catch((error) => {
      this.setData({ retrying: false });
      if (isNotFoundError(error)) {
        this.handleStaleTask();
        return false;
      }
      showApiErrorToast(error, '\u91cd\u8bd5\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5');
      return false;
    });
  },

  buildDuplicateDecisions(candidates, decision) {
    return (candidates || []).map((candidate) => ({
      draftId: candidate.draftId,
      decision,
      existingReportId: candidate.existingReportId
    }));
  },

  saveWithDecisions(duplicateDecisions = []) {
    return api.batchCreateReports({
      profileId: this.data.profileId,
      ocrTaskId: this.taskId,
      reports: this.drafts,
      duplicateDecisions
    }, {
      idempotencyKey: `save_${this.taskId}_${duplicateDecisions.map((item) => item.decision).join('_') || 'new'}`
    });
  },

  finishSave(result) {
    const savedCount = result.reports ? result.reports.length : this.data.reportCount;
    wx.setStorageSync('lastSavedReportToast', `\u5df2\u4fdd\u5b58 ${savedCount} \u4efd\u62a5\u544a`);
    wx.setStorageSync('healthDefaultView', 'time');
    wx.setStorageSync('healthDataRange', 'all');
    const pending = wx.getStorageSync('pendingOcrTasks') || [];
    wx.setStorageSync('pendingOcrTasks', pending.filter((item) => item.taskId !== this.taskId));
    wx.removeStorageSync('uploadPhotos');
    this.setData({ saving: false, saveDebug: 'navigation_scheduled' });
    setTimeout(() => {
      this.setData({ saveDebug: 'navigating_health' });
      wx.switchTab({
        url: '/pages/health/index',
        success: () => this.setData({ saveDebug: 'navigated_health' }),
        fail: (error) => this.setData({ saveDebug: `switch_failed:${error && error.errMsg ? error.errMsg : 'unknown'}` })
      });
    }, 50);
  },

  handleDuplicateCandidates(candidates) {
    return chooseDuplicateDecision(candidates).then((decision) => {
      const duplicateDecisions = this.buildDuplicateDecisions(candidates, decision);
      return this.saveWithDecisions(duplicateDecisions);
    });
  },

  handleUnreviewedDraftsError(error) {
    const blockedDrafts = (error && error.details && error.details.drafts) || [];
    if (blockedDrafts.some((draft) => draft.reason === 'task_still_processing')) {
      this.setData({
        saving: false,
        saveDebug: 'failed:OCR_TASK_STILL_PROCESSING'
      });
      wx.showToast({
        title: '识别完成后再保存',
        icon: 'none'
      });
      return false;
    }
    const blockedIds = new Set(blockedDrafts.map((draft) => draft.draftId).filter(Boolean));
    const blockedById = new Map(blockedDrafts.map((draft) => [draft.draftId, draft]));
    const reports = (this.data.reports || []).map((report) => {
      if (blockedIds.size && !blockedIds.has(report.draftId)) return report;
      const reason = (blockedById.get(report.draftId) || {}).reason;
      const basicInfoIncomplete = report.basicInfoIncomplete || reason === 'missing_basic_info';
      return {
        ...report,
        needsManualInput: true,
        basicInfoIncomplete,
        manualText: report.manualText || manualReviewText(report.reportLike !== false, basicInfoIncomplete)
      };
    });
    const count = blockedIds.size || blockedDrafts.length || reports.filter((report) => report.needsManualInput).length || 1;
    this.setData({
      saving: false,
      saveDebug: 'failed:UNREVIEWED_OCR_DRAFTS',
      reports
    });
    const basicInfoCount = reports.filter((report) => report.basicInfoIncomplete).length;
    const toastTitle = basicInfoCount ? `请先补齐 ${basicInfoCount} 份报告基础信息` : `请先处理 ${count} 份未识别报告`;
    wx.showToast({
      title: toastTitle,
      icon: 'none'
    });
    return false;
  },

  saveAll() {
    if (this.data.saving) return Promise.resolve(false);
    if (this.data.reportCount === 0) {
      this.setData({ saveDebug: 'blocked:NO_REPORTS' });
      wx.showToast({ title: '没有可保存的报告', icon: 'none' });
      return Promise.resolve(false);
    }
    if (this.data.recognizing) {
      this.setData({ saveDebug: 'blocked:OCR_TASK_STILL_PROCESSING' });
      wx.showToast({ title: '识别完成后再保存', icon: 'none' });
      return Promise.resolve(false);
    }
    if (this.data.taskStatus === 'failed') {
      this.setData({ saveDebug: 'blocked:OCR_TASK_FAILED' });
      wx.showToast({ title: '\u8bf7\u5148\u91cd\u8bd5\u8bc6\u522b', icon: 'none' });
      return Promise.resolve(false);
    }
    if (this.data.unresolvedConflictCount > 0) {
      this.setData({ saveDebug: 'refreshing:UNRESOLVED_CONFLICTS' });
      return Promise.resolve(this.loadTask()).then(() => {
        if (this.data.unresolvedConflictCount <= 0) return this.saveAll();
        this.setData({ saveDebug: 'blocked:UNRESOLVED_CONFLICTS' });
        wx.showToast({
          title: `\u8bf7\u5148\u5904\u7406 ${this.data.unresolvedConflictCount} \u4e2a\u51b2\u7a81`,
          icon: 'none'
        });
        return false;
      });
    }
    const unresolvedBasicInfoCount = this.data.reports.filter((report) => report.basicInfoIncomplete).length;
    if (unresolvedBasicInfoCount > 0) {
      this.setData({ saveDebug: 'blocked:MISSING_BASIC_INFO' });
      wx.showToast({
        title: `请先补齐 ${unresolvedBasicInfoCount} 份报告基础信息`,
        icon: 'none'
      });
      return Promise.resolve(false);
    }
    const unresolvedManualCount = this.data.reports.filter((report) => report.needsManualInput).length;
    if (unresolvedManualCount > 0) {
      this.setData({ saveDebug: 'blocked:NEEDS_MANUAL_INPUT' });
      wx.showToast({
        title: `\u8bf7\u5148\u5904\u7406 ${unresolvedManualCount} \u4efd\u672a\u8bc6\u522b\u62a5\u544a`,
        icon: 'none'
      });
      return Promise.resolve(false);
    }

    this.setData({ saving: true, saveDebug: 'checking_duplicates' });
    return Promise.resolve().then(() => api.checkDuplicateReports({
      profileId: this.data.profileId,
      ocrTaskId: this.taskId,
      reports: this.drafts
    })).then((duplicateResult) => {
      this.setData({ saveDebug: duplicateResult.hasDuplicates ? 'duplicates_found' : 'saving_reports' });
      if (duplicateResult.hasDuplicates) {
        return this.handleDuplicateCandidates(duplicateResult.candidates);
      }
      return this.saveWithDecisions();
    }).then((result) => {
      this.setData({ saveDebug: 'saved' });
      this.finishSave(result);
    }).catch((error) => {
      if (error && error.code === 'DUPLICATE_REPORT_REQUIRES_DECISION') {
        this.setData({ saveDebug: 'duplicates_requires_decision' });
        return this.handleDuplicateCandidates(error.details.candidates).then((result) => {
          this.setData({ saveDebug: 'saved' });
          this.finishSave(result);
        }).catch(() => {
          this.setData({ saving: false, saveDebug: 'duplicate_decision_cancelled' });
        });
      }
      if (error && error.code === 'UNREVIEWED_OCR_DRAFTS') {
        return this.handleUnreviewedDraftsError(error);
      }
      this.setData({ saving: false, saveDebug: error && error.code ? `failed:${error.code}` : 'failed' });
      if (!error || error.errMsg !== 'showActionSheet:fail cancel') {
        showApiErrorToast(error, '\u4fdd\u5b58\u62a5\u544a\u5931\u8d25');
      }
    });
  }
});
