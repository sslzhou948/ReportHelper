const { api } = require('../../utils/api');
const { getReportCount } = require('../../utils/upload');

const initialPhotos = [];
const realcaseFixtureCaseIds = [
  'acth',
  'thyroid',
  'cortisol',
  'liver_function',
  'uric_electrolyte_lipid',
  'chest_ct_plain',
  'abdomen_pelvis_ct_plain'
];

function decoratePhotos(photos, selected) {
  return photos.map((photo) => {
    const selectedIndex = selected.indexOf(photo.id);
    return {
      ...photo,
      isSelected: selectedIndex >= 0,
      selectedOrder: selectedIndex + 1
    };
  });
}

function toTaskPhotos(photos) {
  return photos.map((photo) => ({
    photoId: `photo_${photo.id}`,
    groupId: photo.group ? `group_${photo.group}` : `photo_${photo.id}`,
    sortOrder: photo.id
  }));
}

function createSmokeProfile(label) {
  return api.createProfile({
    relation: '测试',
    realName: `${label}${Date.now()}`,
    gender: '',
    diseaseType: '',
    primaryHospital: ''
  }).then((profile) => profile.id);
}

function saveTaskForSmoke(task) {
  return api.batchCreateReports({
    ocrTaskId: task.id,
    reports: task.drafts
  }).catch((error) => {
    if (!error || error.code !== 'DUPLICATE_REPORT_REQUIRES_DECISION') throw error;
    return api.batchCreateReports({
      ocrTaskId: task.id,
      reports: task.drafts,
      duplicateDecisions: (error.details.candidates || []).map((candidate) => ({
        draftId: candidate.draftId,
        decision: 'keep_both',
        existingReportId: candidate.existingReportId
      }))
    });
  });
}

Page({
  data: {
    photos: decoratePhotos(initialPhotos, []),
    reportCount: getReportCount(initialPhotos),
    grouping: false,
    selected: [],
    loading: false,
    showFixtureEntry: false
  },
  onLoad(query = {}) {
    this.setData({ showFixtureEntry: query.fixture === 'realcase' });
  },
  setSelected(selected) {
    this.setData({
      selected,
      photos: decoratePhotos(this.data.photos, selected)
    });
  },
  goBack() {
    wx.navigateBack();
  },
  chooseCamera() {
    wx.showToast({ title: '调用相机', icon: 'none' });
  },
  chooseAlbum() {
    wx.showToast({ title: '打开相册', icon: 'none' });
  },
  preview() {
    wx.showToast({ title: '预览图片', icon: 'none' });
  },
  startGrouping() {
    if (this.data.photos.length === 0) {
      wx.showToast({ title: '\u8bf7\u5148\u9009\u62e9\u62a5\u544a\u56fe\u7247', icon: 'none' });
      return;
    }
    this.setData({
      grouping: true,
      selected: [this.data.photos[0].id],
      photos: decoratePhotos(this.data.photos, [this.data.photos[0].id])
    });
  },
  toggleSelect(event) {
    const id = event.currentTarget.dataset.id;
    const selected = this.data.selected.slice();
    const index = selected.indexOf(id);
    if (index >= 0) selected.splice(index, 1);
    else selected.push(id);
    this.setSelected(selected);
  },
  finishGrouping() {
    const photos = this.data.photos.map((photo) => ({
      ...photo,
      group: this.data.selected.includes(photo.id) ? 1 : photo.group
    }));
    this.setData({
      photos: decoratePhotos(photos, this.data.selected),
      reportCount: getReportCount(photos),
      grouping: false
    });
  },
  cancelGrouping() {
    this.setData({ grouping: false });
  },
  startOcr() {
    if (this.data.loading) return Promise.resolve(null);
    if (this.data.photos.length === 0) {
      wx.showToast({ title: '\u8bf7\u5148\u9009\u62e9\u62a5\u544a\u56fe\u7247', icon: 'none' });
      return Promise.resolve(null);
    }
    const app = getApp();
    const profileId = app.getCurrentProfileId();
    const photos = this.data.photos.map((photo) => ({
      id: photo.id,
      group: photo.group || 0
    }));

    wx.setStorageSync('uploadPhotos', photos);
    this.setData({ loading: true });

    return api.createOcrTask({
      profileId,
      photos: toTaskPhotos(photos)
    }, {
      idempotencyKey: `ocr_${profileId}_${Date.now()}`
    }).then((task) => {
      const pending = wx.getStorageSync('pendingOcrTasks') || [];
      const url = `/pages/upload/confirm?taskId=${task.id}&recognizing=1`;
      wx.setStorageSync('pendingOcrTasks', [{
        taskId: task.id,
        profileId,
        status: task.status,
        photoCount: task.photoCount,
        reportCount: task.reportCount
      }].concat(pending.filter((item) => item.taskId !== task.id)));
      wx.navigateTo({
        url,
        fail: () => wx.redirectTo({ url })
      });
      return task;
    }).catch(() => {
      this.setData({ loading: false });
      wx.showToast({ title: '\u521b\u5efa\u8bc6\u522b\u4efb\u52a1\u5931\u8d25', icon: 'none' });
    });
  },
  startFixtureOcr(options = {}) {
    if (this.data.loading) return Promise.resolve(null);
    const app = getApp();
    const profileId = app.getCurrentProfileId();
    const fixtureCaseIds = realcaseFixtureCaseIds;

    this.setData({ loading: true });
    return api.createOcrTask({
      profileId,
      fixtureCaseIds
    }, {
      idempotencyKey: `ocr_fixture_${profileId}_${Date.now()}`
    }).then((task) => {
      const pending = wx.getStorageSync('pendingOcrTasks') || [];
      const url = `/pages/upload/confirm?taskId=${task.id}&fixture=realcase`;
      wx.setStorageSync('pendingOcrTasks', [{
        taskId: task.id,
        profileId,
        status: task.status,
        photoCount: task.photoCount,
        reportCount: task.reportCount,
        source: 'realcase-fixture'
      }].concat(pending.filter((item) => item.taskId !== task.id)));
      if (options.skipNavigate) return task;
      wx.navigateTo({
        url,
        fail: () => wx.redirectTo({ url })
      });
      return task;
    }).catch(() => {
      this.setData({ loading: false });
      wx.showToast({ title: '加载真实样例失败', icon: 'none' });
    });
  },
  runFixtureDuplicateSmokeForTest() {
    return createSmokeProfile('查重').then((profileId) => api.createOcrTask({
      profileId,
      fixtureCaseIds: realcaseFixtureCaseIds
    }).then((firstTask) => saveTaskForSmoke(firstTask)).then(() => {
      const firstCount = (wx.getStorageSync('mockReports') || [])
        .filter((report) => report.profileId === profileId && !report.deletedAt).length;
      return api.createOcrTask({
        profileId,
        fixtureCaseIds: realcaseFixtureCaseIds
      }).then((secondTask) => api.checkDuplicateReports({
        profileId,
        ocrTaskId: secondTask.id,
        reports: secondTask.drafts
      }).then((duplicateResult) => api.batchCreateReports({
        ocrTaskId: secondTask.id,
        reports: secondTask.drafts,
        duplicateDecisions: duplicateResult.candidates.map((candidate) => ({
          draftId: candidate.draftId,
          decision: 'skip',
          existingReportId: candidate.existingReportId
        }))
      }).then(() => {
        const secondCount = (wx.getStorageSync('mockReports') || [])
          .filter((report) => report.profileId === profileId && !report.deletedAt).length;
        return {
          hasDuplicates: duplicateResult.hasDuplicates,
          candidateCount: duplicateResult.candidates.length,
          firstCount,
          secondCount
        };
      })));
    }));
  },
  runFixtureReportEditSmokeForTest() {
    return createSmokeProfile('编辑').then((profileId) => api.createOcrTask({
      profileId,
      fixtureCaseIds: ['acth', 'chest_ct_plain']
    }).then((task) => saveTaskForSmoke(task).then(() => ({ task }))).then(({ task }) => api.listReports(profileId).then((reports) => {
      const report = reports.find((item) => item.ocrTaskId === task.id && item.analysisPolicy !== 'view_only');
      if (!report) throw new Error('missing saved editable fixture report');
      return api.getReportDetail(report.id);
    })).then(({ report }) => {
      const metric = (report.metrics || []).find((item) => item.valueType === 'quantitative');
      if (!metric) throw new Error('missing editable metric');
      const nextValue = Number(metric.refRangeHigh || metric.valueNumeric || 1) + 8;
      const editedMetrics = report.metrics.map((item) => (
        item.id === metric.id
          ? { ...item, valueNumeric: nextValue, isManuallyEdited: true }
          : item
      ));
      return api.updateReport(report.id, {
        basicInfo: {
          note: 'devtools edit smoke'
        },
        metrics: editedMetrics,
        findings: report.findings || [],
        warnings: report.warnings || []
      }).then(() => api.getReportDetail(report.id).then(({ report: updated }) => ({
        reportId: updated.id,
        metricKey: metric.metricKey,
        note: updated.note,
        abnormalCount: updated.abnormalCount,
        editedValue: nextValue,
        isManuallyEdited: (updated.metrics || []).some((item) => item.id === metric.id && item.isManuallyEdited)
      })));
    }).then((result) => api.getMetricHistory(profileId, result.metricKey).then(({ history }) => {
      const next = {
        ...result,
        historyHasEditedValue: history.some((item) => item.reportId === result.reportId && item.valueNumeric === result.editedValue)
      };
      wx.setStorageSync('lastEditSmokeReportId', next.reportId);
      return next;
    })));
  },
  openLastEditSmokeReportForTest() {
    const reportId = wx.getStorageSync('lastEditSmokeReportId');
    if (!reportId) return false;
    const url = `/pages/health/report-detail?id=${reportId}`;
    return new Promise((resolve) => {
      wx.navigateTo({
        url,
        success: () => resolve(true),
        fail: () => {
          wx.redirectTo({
            url,
            success: () => resolve(true),
            fail: (error) => resolve(error && error.errMsg ? error.errMsg : false)
          });
        }
      });
    });
  }
});
