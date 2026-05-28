const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_UPLOAD_MIME_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/heif'];

function normalizeMimeType(mimeType) {
  const value = String(mimeType || '').trim().toLowerCase();
  if (value === 'image/jpg') return 'image/jpeg';
  return value;
}

function inferMimeType(filePath, explicitType) {
  const normalized = normalizeMimeType(explicitType);
  if (normalized) return normalized;

  const lower = String(filePath || '').toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.heic')) return 'image/heic';
  if (lower.endsWith('.heif')) return 'image/heif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  return 'image/jpeg';
}

function inferUploadFileMimeType(file) {
  const explicitType = file.mimeType || file.type;
  if (explicitType) return inferMimeType('', explicitType);

  const candidates = [file.tempFilePath, file.path, file.fileName, file.name].filter(Boolean);
  for (const candidate of candidates) {
    const inferred = inferMimeType(candidate);
    if (inferred !== 'image/jpeg' || /\.(jpe?g)$/i.test(candidate)) {
      return inferred;
    }
  }
  return 'image/jpeg';
}

function getUploadValidationMessage(summary) {
  if (summary.unsupportedCount > 0 && summary.tooLargeCount > 0) {
    return '\u4ec5\u652f\u6301 JPG/PNG/HEIC\uff0c\u5355\u5f20\u4e0d\u8d85\u8fc7 10MB';
  }
  if (summary.unsupportedCount > 0) {
    return '\u4ec5\u652f\u6301 JPG/PNG/HEIC';
  }
  if (summary.tooLargeCount > 0) {
    return '\u5355\u5f20\u56fe\u7247\u4e0d\u8d85\u8fc7 10MB';
  }
  return '';
}

function validateUploadFiles(files, options = {}) {
  const maxBytes = Number(options.maxBytes) || MAX_UPLOAD_BYTES;
  const allowedTypes = new Set(options.allowedTypes || ALLOWED_UPLOAD_MIME_TYPES);
  const accepted = [];
  const rejected = [];
  let unsupportedCount = 0;
  let tooLargeCount = 0;

  (files || []).forEach((file) => {
    const filePath = file.tempFilePath || file.path || file.fileName || file.name || '';
    const mimeType = inferUploadFileMimeType(file);
    const size = Number(file.size) || 0;
    const reasons = [];

    if (!allowedTypes.has(mimeType)) {
      unsupportedCount += 1;
      reasons.push('unsupported_type');
    }
    if (size > maxBytes) {
      tooLargeCount += 1;
      reasons.push('too_large');
    }

    const normalizedFile = {
      ...file,
      mimeType,
      size
    };
    if (reasons.length > 0) {
      rejected.push({
        ...normalizedFile,
        reasons
      });
      return;
    }
    accepted.push(normalizedFile);
  });

  return {
    accepted,
    rejected,
    rejectedCount: rejected.length,
    unsupportedCount,
    tooLargeCount,
    message: getUploadValidationMessage({ unsupportedCount, tooLargeCount })
  };
}

function normalizePhotos(photos) {
  const seen = new Set();
  return (photos || []).reduce((acc, photo, index) => {
    const id = photo.id || index + 1;
    if (seen.has(id)) return acc;
    seen.add(id);
    acc.push({
      ...photo,
      id,
      group: Number(photo.group) || 0
    });
    return acc;
  }, []);
}

function buildPhotoBatches(photos) {
  const normalized = normalizePhotos(photos);
  const grouped = {};
  const batches = [];

  normalized.forEach((photo) => {
    if (photo.group > 0) {
      if (!grouped[photo.group]) {
        grouped[photo.group] = {
          key: `group-${photo.group}`,
          group: photo.group,
          photos: []
        };
        batches.push(grouped[photo.group]);
      }
      grouped[photo.group].photos.push(photo);
      return;
    }

    batches.push({
      key: `photo-${photo.id}`,
      group: 0,
      photos: [photo]
    });
  });

  return batches.map((batch) => ({
    ...batch,
    photoIds: batch.photos.map((photo) => photo.id),
    pageCount: batch.photos.length,
    isMerged: batch.photos.length > 1
  }));
}

function getReportCount(photos) {
  return buildPhotoBatches(photos).length;
}

const mockTypes = ['血常规', '综合生化', 'CT 胸部', '肿瘤标志物'];
const mockMeta = ['协和医院 · 4月28日', '协和医院 · 4月28日', '肿瘤医院 · 4月5日', '社区医院 · 3月22日'];
const mockCounts = ['12 项指标', '18 项指标', '影像学描述', '6 项指标'];
const mockAbnormal = ['2 项异常', '3 项异常', '', '1 项异常'];

function buildRecognitionReports(photos) {
  return buildPhotoBatches(photos).map((batch, index) => ({
    id: batch.key,
    title: batch.isMerged ? `报告 ${index + 1} · 已合并 ${batch.pageCount} 页` : `报告 ${index + 1}`,
    type: mockTypes[index] || '检查报告',
    meta: mockMeta[index] || '待确认医院 · 待确认日期',
    count: mockCounts[index] || '待确认指标',
    abnormal: mockAbnormal[index] || '',
    conflict: index === 1,
    pageCount: batch.pageCount,
    photoIds: batch.photoIds,
    isMerged: batch.isMerged
  }));
}

module.exports = {
  ALLOWED_UPLOAD_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  buildPhotoBatches,
  buildRecognitionReports,
  getReportCount,
  inferMimeType,
  validateUploadFiles
};
