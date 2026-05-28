function requestWxLoginCode(wxApi = wx) {
  return new Promise((resolve, reject) => {
    wxApi.login({
      success(res) {
        if (res && res.code) {
          resolve(res.code);
          return;
        }
        const error = new Error('WX_LOGIN_NO_CODE');
        error.code = 'WX_LOGIN_NO_CODE';
        reject(error);
      },
      fail(error) {
        const nextError = new Error('WX_LOGIN_FAILED');
        nextError.code = 'WX_LOGIN_FAILED';
        nextError.details = error || {};
        reject(nextError);
      }
    });
  });
}

module.exports = {
  requestWxLoginCode
};
