const { api } = require('../../utils/api');
const { showApiErrorToast } = require('../../utils/error');
const { getReportCount, inferMimeType, validateUploadFiles } = require('../../utils/upload');

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
const UPLOAD_DRAFT_KEY = 'uploadDraft';
const MAX_UPLOAD_PHOTOS = 9;
const MIN_OCR_PHOTO_MEGAPIXELS = 3;
const MIN_OCR_PHOTO_SHORT_EDGE = 1600;
const MAX_OCR_PHOTO_ASPECT_RATIO = 2.2;
const OCR_RESULT_TABLE_GUIDANCE = '拍纸质报告时让结果表格居中、拍正、减少折痕反光；解释/建议区占画面太多时，建议裁到结果表后再识别。';

function photoDimension(value) {
  const number = Number(value) || 0;
  return number > 0 ? Math.round(number) : 0;
}

function buildPhotoQualityWarning(photo) {
  const width = photoDimension(photo.width);
  const height = photoDimension(photo.height);
  if (!width || !height) return '';
  const megapixels = (width * height) / 1000000;
  const shortEdge = Math.min(width, height);
  if (megapixels < MIN_OCR_PHOTO_MEGAPIXELS || shortEdge < MIN_OCR_PHOTO_SHORT_EDGE) {
    return `图片约 ${width}×${height}，小字表格可能漏行或串列；${OCR_RESULT_TABLE_GUIDANCE}`;
  }
  const ratio = width / height;
  if (ratio > MAX_OCR_PHOTO_ASPECT_RATIO || ratio < (1 / MAX_OCR_PHOTO_ASPECT_RATIO)) {
    return `图片比例较极端，请确认没有裁切到报告边缘；${OCR_RESULT_TABLE_GUIDANCE}`;
  }
  return '';
}

function normalizePhotoQuality(photo) {
  const width = photoDimension(photo.width);
  const height = photoDimension(photo.height);
  const next = {
    ...photo,
    width,
    height
  };
  return {
    ...next,
    qualityWarning: buildPhotoQualityWarning(next)
  };
}

function qualityWarningCount(photos) {
  return (photos || []).filter((photo) => photo.qualityWarning).length;
}

function readUploadDraft() {
  try {
    const draft = wx.getStorageSync(UPLOAD_DRAFT_KEY);
    if (!draft || !Array.isArray(draft.photos)) return [];
    return draft.photos
      .filter((photo) => photo && photo.id)
      .slice(0, MAX_UPLOAD_PHOTOS)
      .map((photo, index) => ({
        id: Number(photo.id) || index + 1,
        group: Number(photo.group) || 0,
        tempFilePath: photo.tempFilePath || '',
        fileName: photo.fileName || `report-${index + 1}`,
        mimeType: photo.mimeType || '',
        size: Number(photo.size) || 0,
        width: photoDimension(photo.width),
        height: photoDimension(photo.height)
      })).map(normalizePhotoQuality);
  } catch (error) {
    return [];
  }
}

function persistUploadDraft(photos) {
  const safePhotos = (photos || []).map((photo) => ({
    id: photo.id,
    group: Number(photo.group) || 0,
    tempFilePath: photo.tempFilePath || '',
    fileName: photo.fileName || `report-${photo.id}`,
    mimeType: photo.mimeType || '',
    size: Number(photo.size) || 0,
    width: photoDimension(photo.width),
    height: photoDimension(photo.height)
  }));
  if (safePhotos.length === 0) {
    wx.removeStorageSync(UPLOAD_DRAFT_KEY);
    return;
  }
  wx.setStorageSync(UPLOAD_DRAFT_KEY, {
    photos: safePhotos,
    updatedAt: Date.now()
  });
}

function clearUploadDraft() {
  wx.removeStorageSync(UPLOAD_DRAFT_KEY);
}

function getPathName(filePath) {
  if (!filePath) return '';
  const parts = filePath.split(/[\\/]/);
  return parts[parts.length - 1] || '';
}

function normalizeChosenFiles(files, existingPhotos) {
  const startId = (existingPhotos || []).reduce((max, photo) => Math.max(max, Number(photo.id) || 0), 0) + 1;
  return (files || []).map((file, index) => {
    const filePath = file.tempFilePath || file.path || '';
    return {
      id: startId + index,
      group: 0,
      tempFilePath: filePath,
      fileName: file.name || getPathName(filePath) || `report-${startId + index}`,
      mimeType: file.mimeType || inferMimeType(filePath, file.type),
      size: Number(file.size) || 0,
      width: photoDimension(file.width),
      height: photoDimension(file.height)
    };
  });
}

function normalizeChooseImageFiles(result) {
  const paths = result.tempFilePaths || [];
  const files = result.tempFiles || [];
  return paths.map((path, index) => ({
    tempFilePath: path,
    size: files[index] && files[index].size,
    width: files[index] && files[index].width,
    height: files[index] && files[index].height
  }));
}

function enrichFileWithImageInfo(file) {
  if (photoDimension(file.width) && photoDimension(file.height)) return Promise.resolve(file);
  if (!wx.getImageInfo) return Promise.resolve(file);
  const src = file.tempFilePath || file.path || '';
  if (!src) return Promise.resolve(file);
  return new Promise((resolve) => {
    wx.getImageInfo({
      src,
      success: (info) => resolve({
        ...file,
        width: photoDimension(info.width),
        height: photoDimension(info.height)
      }),
      fail: () => resolve(file)
    });
  });
}

function enrichFilesWithImageInfo(files) {
  return Promise.all((files || []).map(enrichFileWithImageInfo));
}

function decoratePhotos(photos, selected) {
  const groupCounts = {};
  (photos || []).forEach((photo) => {
    const group = Number(photo.group) || 0;
    if (group) groupCounts[group] = (groupCounts[group] || 0) + 1;
  });
  const groupReportNumbers = {};
  let reportNumber = 0;
  (photos || []).forEach((photo) => {
    const group = Number(photo.group) || 0;
    if (group && groupCounts[group] > 1) {
      if (!groupReportNumbers[group]) groupReportNumbers[group] = ++reportNumber;
      return;
    }
    reportNumber += 1;
  });
  const groupSeen = {};
  return photos.map((photo) => {
    const selectedIndex = selected.indexOf(photo.id);
    const normalized = normalizePhotoQuality(photo);
    const group = Number(normalized.group) || 0;
    const isGrouped = !!(group && groupCounts[group] > 1);
    const groupPageIndex = isGrouped ? ((groupSeen[group] || 0) + 1) : 0;
    if (isGrouped) groupSeen[group] = groupPageIndex;
    const groupPageCount = isGrouped ? groupCounts[group] : 0;
    const groupReportNo = isGrouped ? groupReportNumbers[group] : 0;
    const groupTone = groupReportNo ? ((groupReportNo - 1) % 4) + 1 : 0;
    return {
      ...normalized,
      group: isGrouped ? group : 0,
      groupReportNo,
      groupPageIndex,
      groupPageCount,
      groupToneClass: groupTone ? `group-tone-${groupTone}` : '',
      groupPositionClass: !isGrouped
        ? ''
        : (groupPageIndex === 1 ? 'group-start' : (groupPageIndex === groupPageCount ? 'group-end' : 'group-middle')),
      isSelected: selectedIndex >= 0,
      selectedOrder: selectedIndex + 1
    };
  });
}

function compactPhotos(photos) {
  const groupCounts = photos.reduce((counts, photo) => {
    const group = Number(photo.group) || 0;
    if (group) counts[group] = (counts[group] || 0) + 1;
    return counts;
  }, {});
  return photos.map((photo, index) => {
    const group = Number(photo.group) || 0;
    return {
      ...photo,
      id: index + 1,
      group: group && groupCounts[group] > 1 ? group : 0
    };
  });
}

function confirmQualityWarnings(photos) {
  const count = qualityWarningCount(photos);
  if (!count || !wx.showModal) return Promise.resolve(true);
  return new Promise((resolve) => {
    wx.showModal({
      title: '图片质量可能影响识别',
      content: `有 ${count} 张图片的清晰度、比例或裁切可能影响 AI识别。${OCR_RESULT_TABLE_GUIDANCE} 也可以继续识别后重点核对。`,
      confirmText: '继续识别',
      cancelText: '返回调整',
      success: (res) => resolve(!!res.confirm),
      fail: () => resolve(false)
    });
  });
}

function toTaskPhotos(photos) {
  return photos.map((photo) => ({
    photoId: photo.uploadedPhotoId || `photo_${photo.id}`,
    groupId: photo.group ? `group_${photo.group}` : `photo_${photo.id}`,
    sortOrder: photo.id
  }));
}

function toUploadFiles(photos) {
  return photos.map((photo) => ({
    clientFileId: `local_${photo.id}`,
    fileName: photo.fileName || `report-${photo.id}.jpg`,
    mimeType: photo.mimeType || inferMimeType(photo.fileName || photo.tempFilePath),
    size: Number(photo.size) || 1
  }));
}

function uploadSignedFile(photo, signedUpload) {
  const uploadUrl = signedUpload && signedUpload.uploadUrl;
  if (!uploadUrl || uploadUrl.startsWith('mock-upload://') || uploadUrl.startsWith('local-upload://')) {
    return Promise.resolve();
  }
  if (!photo.tempFilePath || !wx.uploadFile) {
    return Promise.reject(new Error('upload file is unavailable'));
  }
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: uploadUrl,
      filePath: photo.tempFilePath,
      name: 'file',
      header: signedUpload.headers || {},
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(res);
        else reject(new Error(`upload failed: ${res.statusCode}`));
      },
      fail: reject
    });
  });
}

function preparePhotosForOcr(profileId, photos) {
  const files = toUploadFiles(photos);
  return api.signUploads({ profileId, files }, {
    idempotencyKey: `sign_${profileId}_${Date.now()}`
  }).then((result) => {
    const uploads = result.uploads || [];
    if (uploads.length !== photos.length) {
      throw new Error('upload sign result does not match selected photos');
    }
    const uploadByClientId = uploads.reduce((acc, upload) => {
      acc[upload.clientFileId] = upload;
      return acc;
    }, {});
    const uploadedPhotos = photos.map((photo) => {
      const signedUpload = uploadByClientId[`local_${photo.id}`];
      if (!signedUpload || !signedUpload.photoId) {
        throw new Error('missing signed upload');
      }
      return {
        ...photo,
        uploadedPhotoId: signedUpload.photoId
      };
    });

    return Promise.all(uploadedPhotos.map((photo) => uploadSignedFile(photo, uploadByClientId[`local_${photo.id}`])))
      .then(() => api.completeUploads({
        profileId,
        uploads: uploadedPhotos.map((photo) => ({
          photoId: photo.uploadedPhotoId
        }))
      }))
      .then(() => uploadedPhotos);
  });
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

function navigateToTask(url, task) {
  return new Promise((resolve) => {
    wx.navigateTo({
      url,
      success: () => resolve(task),
      fail: () => wx.redirectTo({
        url,
        success: () => resolve(task),
        fail: () => resolve(task)
      })
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
    showFixtureEntry: false,
    uploadError: '',
    hasDraft: false,
    maxUploadPhotos: MAX_UPLOAD_PHOTOS,
    qualityWarningCount: 0
  },
  onLoad(query = {}) {
    const draftPhotos = readUploadDraft();
    this.setData({
      showFixtureEntry: query.fixture === 'realcase',
      photos: decoratePhotos(draftPhotos, []),
      reportCount: getReportCount(draftPhotos),
      hasDraft: draftPhotos.length > 0,
      qualityWarningCount: qualityWarningCount(draftPhotos)
    });
  },
  updatePhotos(photos, selected = this.data.selected) {
    const normalizedPhotos = (photos || []).map(normalizePhotoQuality);
    persistUploadDraft(normalizedPhotos);
    this.setData({
      selected,
      photos: decoratePhotos(normalizedPhotos, selected),
      reportCount: getReportCount(normalizedPhotos),
      hasDraft: normalizedPhotos.length > 0,
      qualityWarningCount: qualityWarningCount(normalizedPhotos),
      uploadError: ''
    });
  },
  setSelected(selected) {
    this.setData({
      selected,
      photos: decoratePhotos(this.data.photos, selected)
    });
  },
  goBack() {
    if (this.data.photos.length > 0 && !this.data.loading) {
      wx.showModal({
        title: '\u9000\u51fa\u4e0a\u4f20\uff1f',
        content: '\u5df2\u9009\u56fe\u7247\u4f1a\u4fdd\u7559\u4e3a\u8349\u7a3f\uff0c\u4e0b\u6b21\u8fdb\u5165\u53ef\u7ee7\u7eed\u8bc6\u522b\u3002',
        confirmText: '\u9000\u51fa',
        cancelText: '\u7ee7\u7eed',
        success: (res) => {
          if (res.confirm) wx.navigateBack();
        }
      });
      return;
    }
    wx.navigateBack();
  },
  chooseReportImages(sourceType) {
    if (this.data.loading) return;
    const remain = MAX_UPLOAD_PHOTOS - this.data.photos.length;
    if (remain <= 0) {
      wx.showToast({ title: `\u6700\u591a\u9009\u62e9 ${MAX_UPLOAD_PHOTOS} \u5f20`, icon: 'none' });
      return;
    }
    const onFiles = (files) => {
      const validation = validateUploadFiles(files);
      if (validation.rejectedCount > 0) {
        wx.showToast({ title: validation.message || '\u5df2\u8fc7\u6ee4\u4e0d\u652f\u6301\u7684\u56fe\u7247', icon: 'none' });
      }

      const chosen = normalizeChosenFiles(validation.accepted, this.data.photos);
      if (chosen.length === 0) {
        this.setData({
          uploadError: validation.message || '\u8bf7\u91cd\u65b0\u9009\u62e9\u6709\u6548\u56fe\u7247'
        });
        return;
      }

      const nextPhotos = this.data.photos
        .concat(chosen)
        .slice(0, MAX_UPLOAD_PHOTOS)
        .map((photo) => ({
          id: photo.id,
          group: photo.group || 0,
          tempFilePath: photo.tempFilePath || '',
          fileName: photo.fileName || `report-${photo.id}`,
          mimeType: photo.mimeType || '',
          size: photo.size || 0,
          width: photo.width || 0,
          height: photo.height || 0
        }));
      this.updatePhotos(nextPhotos, []);
      if (chosen.length > remain) {
        wx.showToast({ title: `\u5df2\u4fdd\u7559\u524d ${MAX_UPLOAD_PHOTOS} \u5f20`, icon: 'none' });
      }
    };
    if (wx.chooseMedia) {
      wx.chooseMedia({
        count: remain,
        mediaType: ['image'],
        sourceType: [sourceType],
        success: (res) => enrichFilesWithImageInfo(res.tempFiles || []).then(onFiles),
        fail: (error) => {
          if (!error || !/cancel/i.test(error.errMsg || '')) {
            wx.showToast({ title: '\u9009\u62e9\u56fe\u7247\u5931\u8d25', icon: 'none' });
          }
        }
      });
      return;
    }
    wx.chooseImage({
      count: remain,
      sourceType: [sourceType],
      success: (res) => enrichFilesWithImageInfo(normalizeChooseImageFiles(res)).then(onFiles),
      fail: (error) => {
        if (!error || !/cancel/i.test(error.errMsg || '')) {
          wx.showToast({ title: '\u9009\u62e9\u56fe\u7247\u5931\u8d25', icon: 'none' });
        }
      }
    });
  },
  chooseCamera() {
    this.chooseReportImages('camera');
  },
  chooseAlbum() {
    this.chooseReportImages('album');
  },
  preview(event) {
    const id = Number(event.currentTarget.dataset.id);
    const current = this.data.photos.find((photo) => photo.id === id);
    const urls = this.data.photos.map((photo) => photo.tempFilePath).filter(Boolean);
    if (current && current.tempFilePath && urls.length > 0) {
      wx.previewImage({
        current: current.tempFilePath,
        urls
      });
      return;
    }
    wx.showToast({ title: '\u6682\u65e0\u53ef\u9884\u89c8\u56fe\u7247', icon: 'none' });
  },
  removePhoto(event) {
    if (this.data.loading) return;
    const id = Number(event.currentTarget.dataset.id);
    const photos = compactPhotos(this.data.photos.filter((photo) => Number(photo.id) !== id));
    this.updatePhotos(photos, []);
    if (photos.length === 0) this.setData({ grouping: false });
    wx.showToast({ title: '\u5df2\u79fb\u9664', icon: 'none' });
  },
  startGrouping(event) {
    if (this.data.photos.length === 0) {
      wx.showToast({ title: '\u8bf7\u5148\u9009\u62e9\u62a5\u544a\u56fe\u7247', icon: 'none' });
      return;
    }
    const initialId = event && event.currentTarget && event.currentTarget.dataset.id
      ? Number(event.currentTarget.dataset.id)
      : this.data.photos[0].id;
    const current = this.data.photos.find((photo) => photo.id === initialId);
    const selected = current && current.group
      ? this.data.photos.filter((photo) => photo.group === current.group).map((photo) => photo.id)
      : [initialId];
    this.setData({
      grouping: true,
      selected,
      photos: decoratePhotos(this.data.photos, selected)
    });
  },
  openGroupActions(event) {
    const group = Number(event.currentTarget.dataset.group) || 0;
    const initialId = Number(event.currentTarget.dataset.id) || 0;
    if (!group) return;
    wx.showActionSheet({
      itemList: ['调整合并', '取消合并'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.startGrouping({ currentTarget: { dataset: { id: initialId } } });
          return;
        }
        if (res.tapIndex === 1) {
          this.splitGroup({ currentTarget: { dataset: { group } } });
        }
      }
    });
  },
  toggleSelect(event) {
    const id = Number(event.currentTarget.dataset.id);
    const selected = this.data.selected.slice();
    const index = selected.indexOf(id);
    if (index >= 0) selected.splice(index, 1);
    else selected.push(id);
    this.setSelected(selected);
  },
  finishGrouping() {
    if (this.data.selected.length < 2) {
      wx.showToast({ title: '\u8bf7\u81f3\u5c11\u9009\u62e9 2 \u5f20', icon: 'none' });
      return;
    }
    const nextGroup = this.data.photos.reduce((max, photo) => Math.max(max, Number(photo.group) || 0), 0) + 1;
    const photos = this.data.photos.map((photo) => ({
      ...photo,
      group: this.data.selected.includes(photo.id) ? nextGroup : photo.group
    }));
    this.updatePhotos(photos, []);
    this.setData({ grouping: false });
  },
  cancelGrouping() {
    this.setData({ grouping: false });
  },
  splitGroup(event) {
    const group = Number(event.currentTarget.dataset.group) || 0;
    if (!group) return;
    const photos = this.data.photos.map((photo) => (
      Number(photo.group) === group ? { ...photo, group: 0 } : photo
    ));
    this.updatePhotos(photos, []);
    wx.showToast({ title: '\u5df2\u53d6\u6d88\u5408\u5e76', icon: 'none' });
  },
  startOcr() {
    if (this.data.loading) return Promise.resolve(null);
    if (this.data.photos.length === 0) {
      wx.showToast({ title: '\u8bf7\u5148\u9009\u62e9\u62a5\u544a\u56fe\u7247', icon: 'none' });
      return Promise.resolve(null);
    }
    const photos = this.data.photos.map((photo) => ({
      id: photo.id,
      group: photo.group || 0,
      tempFilePath: photo.tempFilePath || '',
      fileName: photo.fileName || `report-${photo.id}`,
      mimeType: photo.mimeType || '',
      size: photo.size || 0,
      width: photo.width || 0,
      height: photo.height || 0,
      qualityWarning: photo.qualityWarning || ''
    }));

    return confirmQualityWarnings(photos).then((confirmed) => {
      if (!confirmed) return null;
      const app = getApp();
      const profileId = app.getCurrentProfileId();
      wx.setStorageSync('uploadPhotos', photos);
      this.setData({ loading: true, uploadError: '' });

      return preparePhotosForOcr(profileId, photos).then((uploadedPhotos) => api.createOcrTask({
        profileId,
        photos: toTaskPhotos(uploadedPhotos)
      }, {
        idempotencyKey: `ocr_${profileId}_${Date.now()}`
      })).then((task) => {
        const pending = wx.getStorageSync('pendingOcrTasks') || [];
        const url = `/pages/upload/confirm?taskId=${task.id}&recognizing=1`;
        wx.setStorageSync('pendingOcrTasks', [{
          taskId: task.id,
          profileId,
          status: task.status,
          photoCount: task.photoCount,
          reportCount: task.reportCount,
          createdAt: Date.now()
        }].concat(pending.filter((item) => item.taskId !== task.id)));
        clearUploadDraft();
        return navigateToTask(url, task);
      });
    }).catch((error) => {
      persistUploadDraft(photos);
      this.setData({
        loading: false,
        hasDraft: true,
        uploadError: '\u4e0a\u4f20\u6216\u8bc6\u522b\u4efb\u52a1\u521b\u5efa\u5931\u8d25\uff0c\u5df2\u4fdd\u7559\u8349\u7a3f\uff0c\u53ef\u7a0d\u540e\u91cd\u8bd5\u3002'
      });
      showApiErrorToast(error, '\u4e0a\u4f20\u5931\u8d25\uff0c\u5df2\u4fdd\u7559\u8349\u7a3f');
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
        source: 'realcase-fixture',
        createdAt: Date.now()
      }].concat(pending.filter((item) => item.taskId !== task.id)));
      if (options.skipNavigate) return task;
      return navigateToTask(url, task);
    }).catch((error) => {
      this.setData({ loading: false });
      showApiErrorToast(error, '加载真实样例失败');
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
  runRealUploadSmokeForTest(options = {}) {
    const files = Array.isArray(options.files) && options.files.length
      ? options.files
      : [{
        base64: options.base64,
        fileName: options.fileName,
        mimeType: options.mimeType,
        size: options.size
      }];
    if (!files.every((file) => file && file.base64)) return Promise.reject(new Error('missing base64 image'));
    if (!wx.getFileSystemManager || !wx.env || !wx.env.USER_DATA_PATH) {
      return Promise.reject(new Error('file system is unavailable'));
    }
    const now = Date.now();
    const photos = files.slice(0, MAX_UPLOAD_PHOTOS).map((file, index) => {
      const fileName = file.fileName || `real-upload-${now}-${index + 1}.jpg`;
      const safeFileName = fileName.replace(/[^\w.\-]/g, '_');
      const localPath = `${wx.env.USER_DATA_PATH}/${now}-${index + 1}-${safeFileName}`;
      wx.getFileSystemManager().writeFileSync(localPath, file.base64, 'base64');
      return {
        id: index + 1,
        group: 0,
        tempFilePath: localPath,
        fileName,
        mimeType: file.mimeType || inferMimeType(fileName),
        size: Number(file.size) || Math.ceil(file.base64.length * 0.75),
        width: file.width || 0,
        height: file.height || 0
      };
    });
    this.updatePhotos(photos, []);
    return this.startOcr();
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
