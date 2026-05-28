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
  buildPhotoBatches,
  buildRecognitionReports,
  getReportCount
};
