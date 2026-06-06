function photoPreviewUrl(photo) {
  if (!photo || typeof photo !== 'object') return '';
  return photo.tempFilePath || photo.path || photo.url || photo.localPath || '';
}

function photoIdCandidates(photo) {
  if (!photo || typeof photo !== 'object') return [];
  const candidates = [
    photo.uploadedPhotoId,
    photo.photoId,
    photo.id,
    photo.id !== undefined && photo.id !== null ? `photo_${photo.id}` : ''
  ];
  return candidates
    .map((item) => (item === undefined || item === null ? '' : String(item).trim()))
    .filter(Boolean);
}

function buildSourcePreviewUrls(sourcePhotoIds, uploadPhotos = []) {
  const orderedIds = (sourcePhotoIds || [])
    .map((item) => (item === undefined || item === null ? '' : String(item).trim()))
    .filter(Boolean);
  if (!orderedIds.length || !Array.isArray(uploadPhotos)) return [];

  const urlById = new Map();
  uploadPhotos.forEach((photo) => {
    const url = photoPreviewUrl(photo);
    if (!url) return;
    photoIdCandidates(photo).forEach((id) => {
      if (!urlById.has(id)) urlById.set(id, url);
    });
  });

  const seenUrls = new Set();
  return orderedIds
    .map((id) => urlById.get(id))
    .filter((url) => {
      if (!url || seenUrls.has(url)) return false;
      seenUrls.add(url);
      return true;
    });
}

function getStoredUploadPhotos(storageKey = 'uploadPhotos') {
  try {
    if (typeof wx === 'undefined' || !wx || typeof wx.getStorageSync !== 'function') return [];
    const photos = wx.getStorageSync(storageKey);
    return Array.isArray(photos) ? photos : [];
  } catch (error) {
    return [];
  }
}

module.exports = {
  buildSourcePreviewUrls,
  getStoredUploadPhotos
};
