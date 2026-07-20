/* ══════════════════════════════════════════════════════════
   js/app.js (السائق) — المتحكم الرئيسي + GPS + تحديث تلقائي
   ملاحظة: DOrders / DDelivery / DNotifs / DSummary معرّفة في orders.js
   ══════════════════════════════════════════════════════════ */

const DApp = {
  _settings  : {},
  _view      : 'orders',
  _pollTimer : null,
  _refreshTimer: null,

  async boot() {
    if (DAuth.restore()) { await this.init(); }
    else { this.showLogin(); }
  },

  async init() {
    document.getElementById('loginPage').classList.add('hidden');
    document.getElementById('appRoot').classList.remove('hidden');

    const sRes = await DAPI.getSettings();
    this._settings = sRes?.settings || {};
    document.getElementById('loginTitle').textContent =
      this._settings.store_name || 'متجر الإطارات';

    const user = DAuth.getUser();
    if (user) {
      document.getElementById('dName').textContent   = user.name || user.username;
      document.getElementById('dAvatar').textContent = (user.name||'س').charAt(0);
    }
    document.getElementById('dDate').textContent =
      new Date().toLocaleDateString('ar-IQ',{weekday:'long',year:'numeric',month:'long',day:'numeric'});

    await DOrders.load();

    // استطلاع الإشعارات كل 30 ثانية
    DNotifs.poll();
    this._pollTimer = setInterval(()=>DNotifs.poll(), DCFG.POLL_INTERVAL_MS);

    // تحديث تلقائي للطلبات كل 10 ثواني
    this._refreshTimer = setInterval(async ()=>{
      if (this._view === 'orders') await DOrders.load();
    }, 10000);

    this.goTo('orders');
  },

  showLogin() {
    document.getElementById('appRoot').classList.add('hidden');
    document.getElementById('loginPage').classList.remove('hidden');
    document.getElementById('lu').focus();
  },

  goTo(view) {
    document.querySelectorAll('.dview').forEach(v=>v.classList.remove('active'));
    document.querySelectorAll('.dnav').forEach(b=>b.classList.remove('active'));
    const viewEl = document.getElementById('view-'+view);
    if (viewEl) viewEl.classList.add('active');
    const navEl = document.querySelector(`.dnav[data-view="${view}"]`);
    if (navEl) navEl.classList.add('active');
    this._view = view;

    switch (view) {
      case 'orders'  : DOrders.load();   break;
      case 'notifs'  : DNotifs.load();   break;
      case 'summary' : DSummary.load();  break;
      case 'delivery': break;
    }
  },

  stopAll() {
    if (this._pollTimer)    clearInterval(this._pollTimer);
    if (this._refreshTimer) clearInterval(this._refreshTimer);
    if (window.DGPS) DGPS.stop();
  }
};


const DUI = {
  toast(msg, type='success') {
    const el  = document.createElement('div');
    el.className = 'd-toast ' + type;
    const icons = { success:'fa-check-circle', error:'fa-triangle-exclamation',
                    info:'fa-circle-info', warn:'fa-triangle-exclamation' };
    el.innerHTML = `<i class="fa-solid ${icons[type]||icons.success}"></i> ${msg}`;
    document.getElementById('dToasts').appendChild(el);
    setTimeout(()=>el.remove(), 3500);
  },
  showLoader(text='جارٍ التحميل...') {
    document.getElementById('loaderMsg').textContent = text;
    document.getElementById('dLoader').classList.remove('hidden');
  },
  hideLoader() { document.getElementById('dLoader').classList.add('hidden'); }
};


document.addEventListener('DOMContentLoaded', ()=>DApp.boot());
