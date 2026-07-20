/* ══════════════════════════════════════════
   js/api.js
   ══════════════════════════════════════════ */
const CAPI = {
  async call(action, params = {}) {
    const token = CAuth.getToken();
    const body  = { action, ...params };
    if (token) body.token = token;
    try {
      const res  = await fetch(CCFG.API_URL, {
        method : 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body   : JSON.stringify(body)
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (data.error === 'انتهت الجلسة') { CAuth.clearSession(); CApp.showLogin(); }
      return data;
    } catch(e) {
      CUI.toast('خطأ في الاتصال بالخادم', 'error');
      return null;
    }
  },
  login  : (u,p)   => CAPI.call('login',    { username:u, password:p }),
  logout :  ()      => CAPI.call('logout'),
  getSettings: ()   => CAPI.call('getSettings'),
  getProducts: (p)  => CAPI.call('getProducts', p),
  createOrder: (p)  => CAPI.call('createOrder', p),
  getOrders  : ()   => CAPI.call('getOrders'),
  getOrder   : (num)=> CAPI.call('getOrder', { orderNum: num }),
  getDashboard: ()  => CAPI.call('getDashboard')
};
