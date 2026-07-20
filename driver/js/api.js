/* ══════════════════════════════════════════
   js/api.js — اتصال بـ Google Apps Script
   يُحمَّل بعد config.js وبعد auth.js
   ══════════════════════════════════════════ */
const DAPI = {
  async call(action, params = {}) {
    const body  = { action, ...params };
    const token = DAuth.getToken();
    if (token) body.token = token;
    try {
      const res  = await fetch(DCFG.API_URL, {
        method : 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body   : JSON.stringify(body)
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (data.error === 'انتهت الجلسة') {
        DAuth.clearSession();
        DApp.showLogin();
      }
      return data;
    } catch(e) {
      DUI.toast('خطأ في الاتصال بالخادم', 'error');
      return null;
    }
  },
  login           : (u,p)          => DAPI.call('login',            { username:u, password:p }),
  logout          : ()             => DAPI.call('logout'),
  getSettings     : ()             => DAPI.call('getSettings'),
  getDriverOrders : ()             => DAPI.call('getDriverOrders'),
  startDelivery   : (orderNum)     => DAPI.call('startDelivery',    { orderNum }),
  validatePIN     : (orderNum,pin) => DAPI.call('validatePIN',      { orderNum, pin }),
  submitDelivery  : (data)         => DAPI.call('submitDelivery',   {
    ...data, items: JSON.stringify(data.items)
  }),
  getDriverSummary: ()             => DAPI.call('getDriverSummary'),
  getNotifications: (unread)       => DAPI.call('getNotifications', { unread }),
  markNotifRead   : (notifId)      => DAPI.call('markNotifRead',    { notifId }),
  markAllNotifRead: ()             => DAPI.call('markAllNotifRead')
};
