function isOfflineNetworkType(networkType) {
  return networkType === 'none' || networkType === 'unknown';
}

function setPageNetworkStatus(page, offline) {
  if (!page || !page.setData) return;
  page.setData({ networkOffline: !!offline });
}

function refreshNetworkStatus(page, wxApi = wx) {
  if (!wxApi || !wxApi.getNetworkType) return Promise.resolve(false);
  return new Promise((resolve) => {
    wxApi.getNetworkType({
      success(res) {
        const offline = isOfflineNetworkType(res && res.networkType);
        setPageNetworkStatus(page, offline);
        resolve(offline);
      },
      fail() {
        setPageNetworkStatus(page, false);
        resolve(false);
      }
    });
  });
}

function bindNetworkStatus(page, wxApi = wx) {
  refreshNetworkStatus(page, wxApi);
  if (!page || page.__networkStatusBound || !wxApi || !wxApi.onNetworkStatusChange) return;
  wxApi.onNetworkStatusChange((res) => {
    setPageNetworkStatus(page, !(res && res.isConnected));
  });
  page.__networkStatusBound = true;
}

module.exports = {
  bindNetworkStatus,
  isOfflineNetworkType,
  refreshNetworkStatus
};
