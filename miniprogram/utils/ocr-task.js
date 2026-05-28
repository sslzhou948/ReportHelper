const RECOGNIZING_TASK_STATUSES = ['queued', 'processing', 'recognizing'];

function isRecognizingTaskStatus(status) {
  return RECOGNIZING_TASK_STATUSES.includes(status);
}

function shouldShowRecognitionSlow(startedAt, now, thresholdMs) {
  if (!startedAt || !now || !thresholdMs) return false;
  return now - startedAt >= thresholdMs;
}

module.exports = {
  RECOGNIZING_TASK_STATUSES,
  isRecognizingTaskStatus,
  shouldShowRecognitionSlow
};
