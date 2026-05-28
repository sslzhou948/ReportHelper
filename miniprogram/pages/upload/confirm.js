const { api } = require('../../utils/api');

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

function toDisplayReport(draft, index) {
  const conflicts = draft.conflicts || [];
  const metrics = draft.metrics || [];
  const findings = draft.findings || [];
  const info = draft.basicInfo || {};
  const abnormalCount = metrics.filter((metric) => metric.tone && metric.tone !== 'ok').length;
  const pendingCount = metrics.filter((metric) => ['pending', 'conflicted'].includes(metric.mappingStatus)).length;
  const inferred = [info.hospitalSource, info.reportDateSource].includes('inferred_from_batch');
  const reportLike = info.reportLike !== false;
  const needsManualInput = ['needs_manual_input', 'not_report'].includes(draft.status) || !reportLike;

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
    manualText: needsManualInput
      ? (reportLike ? '\u672a\u8bc6\u522b\u5230\u53ef\u7528\u5185\u5bb9\uff0c\u53ef\u624b\u52a8\u8865\u5f55\u3002' : '\u8fd9\u5f20\u56fe\u4e0d\u50cf\u68c0\u67e5\u62a5\u544a\uff0c\u8bf7\u6838\u5bf9\u3002')
      : '',
    inferredText: inferred ? '\u90e8\u5206\u57fa\u672c\u4fe1\u606f\u6765\u81ea\u540c\u6279\u63a8\u6d4b' : '',
    conflict: conflicts.length > 0,
    conflictCount: conflicts.length,
    metricKey: conflicts[0] && conflicts[0].metricKey,
    sourcePhotoIds: draft.sourcePhotoIds || [],
    status: draft.status || '',
    reportLike,
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

  data: {
    loading: false,
    saving: false,
    profileId: '',
    reports: [],
    reportCount: 0,
    unresolvedConflictCount: 0,
    taskStatus: '',
    errorMessage: '',
    retrying: false,
    profileNoticeText: ''
  },

  onLoad(query = {}) {
    this.taskId = query.taskId || '';
  },

  onShow() {
    this.loadTask();
  },

  loadTask() {
    if (!this.taskId) {
      wx.showToast({ title: '\u672a\u627e\u5230\u8bc6\u522b\u4efb\u52a1', icon: 'none' });
      return;
    }

    this.setData({ loading: true });
    api.getOcrTask(this.taskId).then((task) => {
      this.drafts = task.drafts || [];
      const reports = this.drafts.map(toDisplayReport);
      const failed = task.status === 'failed';
      this.setData({
        loading: false,
        profileId: task.profileId || '',
        reports: failed ? [] : reports,
        reportCount: task.reportCount || reports.length,
        unresolvedConflictCount: reports.reduce((sum, report) => sum + (report.conflictCount || 0), 0),
        taskStatus: task.status || '',
        errorMessage: task.errorMessage || '\u8bc6\u522b\u670d\u52a1\u6682\u65f6\u672a\u8fd4\u56de\u7ed3\u679c\uff0c\u8bf7\u91cd\u8bd5'
      });
      this.updateProfileNotice(task.profileId || '');
      if (task.profileId) wx.setStorageSync('healthhelperBackendProfileId', task.profileId);
    }).catch(() => {
      this.setData({ loading: false });
      wx.showToast({ title: '\u52a0\u8f7d\u8bc6\u522b\u7ed3\u679c\u5931\u8d25', icon: 'none' });
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
    api.cancelOcrTask(this.taskId).catch(() => null).then(() => {
      const pending = wx.getStorageSync('pendingOcrTasks') || [];
      wx.setStorageSync('pendingOcrTasks', pending.filter((item) => item.taskId !== this.taskId));
      wx.removeStorageSync('uploadPhotos');
      wx.navigateBack({
        fail: () => wx.switchTab({ url: '/pages/home/index' })
      });
    });
  },

  goEdit(event) {
    wx.navigateTo({ url: `/pages/upload/edit-detail?taskId=${this.taskId}&reportIdx=${event.currentTarget.dataset.index}` });
  },

  goManualFill(event) {
    wx.navigateTo({ url: `/pages/upload/edit-detail?taskId=${this.taskId}&reportIdx=${event.currentTarget.dataset.index}&editing=1&manual=1` });
  },

  goConflict(event) {
    const report = this.data.reports[event.currentTarget.dataset.index] || {};
    wx.navigateTo({ url: `/pages/upload/conflict?taskId=${this.taskId}&reportIdx=${event.currentTarget.dataset.index}&metricKey=${report.metricKey || 'wbc'}` });
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
      setTimeout(() => wx.switchTab({ url: '/pages/home/index' }), 500);
      return task;
    }).catch(() => {
      this.setData({ retrying: false });
      wx.showToast({ title: '\u91cd\u8bd5\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5', icon: 'none' });
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
    wx.showToast({ title: `\u5df2\u4fdd\u5b58 ${savedCount} \u4efd\u62a5\u544a`, icon: 'success' });
    wx.setStorageSync('healthDefaultView', 'time');
    const pending = wx.getStorageSync('pendingOcrTasks') || [];
    wx.setStorageSync('pendingOcrTasks', pending.filter((item) => item.taskId !== this.taskId));
    wx.removeStorageSync('uploadPhotos');
    setTimeout(() => wx.switchTab({ url: '/pages/health/index' }), 600);
  },

  handleDuplicateCandidates(candidates) {
    return chooseDuplicateDecision(candidates).then((decision) => {
      const duplicateDecisions = this.buildDuplicateDecisions(candidates, decision);
      return this.saveWithDecisions(duplicateDecisions);
    });
  },

  saveAll() {
    if (this.data.saving) return Promise.resolve(false);
    if (this.data.taskStatus === 'failed') {
      wx.showToast({ title: '\u8bf7\u5148\u91cd\u8bd5\u8bc6\u522b', icon: 'none' });
      return Promise.resolve(false);
    }
    if (this.data.unresolvedConflictCount > 0) {
      wx.showToast({
        title: `\u8bf7\u5148\u5904\u7406 ${this.data.unresolvedConflictCount} \u4e2a\u51b2\u7a81`,
        icon: 'none'
      });
      return Promise.resolve(false);
    }
    const unresolvedManualCount = this.data.reports.filter((report) => report.needsManualInput).length;
    if (unresolvedManualCount > 0) {
      wx.showToast({
        title: `\u8bf7\u5148\u5904\u7406 ${unresolvedManualCount} \u4efd\u672a\u8bc6\u522b\u62a5\u544a`,
        icon: 'none'
      });
      return Promise.resolve(false);
    }

    this.setData({ saving: true });
    return api.checkDuplicateReports({
      profileId: this.data.profileId,
      ocrTaskId: this.taskId,
      reports: this.drafts
    }).then((duplicateResult) => {
      if (duplicateResult.hasDuplicates) {
        return this.handleDuplicateCandidates(duplicateResult.candidates);
      }
      return this.saveWithDecisions();
    }).then((result) => {
      this.finishSave(result);
    }).catch((error) => {
      if (error && error.code === 'DUPLICATE_REPORT_REQUIRES_DECISION') {
        return this.handleDuplicateCandidates(error.details.candidates).then((result) => {
          this.finishSave(result);
        }).catch(() => {
          this.setData({ saving: false });
        });
      }
      this.setData({ saving: false });
      if (!error || error.errMsg !== 'showActionSheet:fail cancel') {
        wx.showToast({ title: '\u4fdd\u5b58\u62a5\u544a\u5931\u8d25', icon: 'none' });
      }
    });
  }
});
