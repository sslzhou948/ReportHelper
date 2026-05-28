const DEFAULT_SLOW_LOADING_MS = 10000;

function beginSlowLoading(page, options = {}) {
  const delay = options.delay || DEFAULT_SLOW_LOADING_MS;
  const slowKey = options.slowKey || 'loadingSlow';
  const seqKey = options.seqKey || '__loadingSeq';
  const timerKey = options.timerKey || '__loadingSlowTimer';
  const seq = (page[seqKey] || 0) + 1;
  page[seqKey] = seq;
  if (page[timerKey]) clearTimeout(page[timerKey]);
  page.setData({ loading: true, [slowKey]: false });
  page[timerKey] = setTimeout(() => {
    if (page[seqKey] === seq) page.setData({ [slowKey]: true });
  }, delay);
  return seq;
}

function finishSlowLoading(page, seq, options = {}) {
  const slowKey = options.slowKey || 'loadingSlow';
  const seqKey = options.seqKey || '__loadingSeq';
  const timerKey = options.timerKey || '__loadingSlowTimer';
  if (page[seqKey] !== seq) return false;
  if (page[timerKey]) clearTimeout(page[timerKey]);
  page[timerKey] = null;
  page.setData({ loading: false, [slowKey]: false });
  return true;
}

function cancelSlowLoading(page, options = {}) {
  const slowKey = options.slowKey || 'loadingSlow';
  const seqKey = options.seqKey || '__loadingSeq';
  const timerKey = options.timerKey || '__loadingSlowTimer';
  page[seqKey] = (page[seqKey] || 0) + 1;
  if (page[timerKey]) clearTimeout(page[timerKey]);
  page[timerKey] = null;
  page.setData({ loading: false, [slowKey]: false });
}

module.exports = {
  DEFAULT_SLOW_LOADING_MS,
  beginSlowLoading,
  cancelSlowLoading,
  finishSlowLoading
};
