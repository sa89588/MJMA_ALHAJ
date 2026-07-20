/* ══════════════════════════════════════════
   js/auth.js — مصادقة السائق
   ══════════════════════════════════════════ */
const DAuth = {
  _token: null,
  _user : null,

  async login(e) {
    e.preventDefault();
    const u = document.getElementById('lu').value.trim();
    const p = document.getElementById('lp').value;
    if (!u||!p) { this.showErr('أدخل بيانات الدخول'); return; }
    this.setBusy(true); this.clearErr();

    const res = await DAPI.login(u, p);
    this.setBusy(false);

    if (!res)    { this.showErr('تعذّر الاتصال — تحقق من API_URL'); return; }
    if (!res.ok) { this.showErr(res.error || 'بيانات الدخول غير صحيحة'); return; }
    if (res.user?.role !== 'driver' && res.user?.role !== 'admin') {
      this.showErr('هذا التطبيق للسائقين فقط'); return;
    }

    this._token = res.token;
    this._user  = res.user;
    localStorage.setItem('drv_token', res.token);
    localStorage.setItem('drv_user',  JSON.stringify(res.user));
    await DApp.init();
  },

  async logout() {
    if (!confirm('تسجيل خروج؟')) return;
    await DAPI.logout();
    this.clearSession();
    DApp.showLogin();
  },

  restore() {
    const t = localStorage.getItem('drv_token');
    const u = localStorage.getItem('drv_user');
    if (t && u) { this._token = t; this._user = JSON.parse(u); return true; }
    return false;
  },

  clearSession() {
    this._token = null; this._user = null;
    localStorage.removeItem('drv_token');
    localStorage.removeItem('drv_user');
  },

  getToken() { return this._token; },
  getUser()  { return this._user; },

  showErr(msg) {
    const el = document.getElementById('loginErr');
    el.textContent = '⚠ ' + msg;
    el.classList.remove('hidden');
    document.getElementById('lp').value = '';
  },
  clearErr() { document.getElementById('loginErr').classList.add('hidden'); },
  setBusy(on) {
    document.getElementById('lTxt').classList.toggle('hidden', on);
    document.getElementById('lSpin').classList.toggle('hidden', !on);
    document.getElementById('lBtn').disabled = on;
  },
  toggleEye() {
    const i = document.getElementById('lp');
    const e = document.getElementById('eyeIco');
    if (i.type === 'password') { i.type='text';     e.className='fa-solid fa-eye-slash'; }
    else                       { i.type='password'; e.className='fa-solid fa-eye'; }
  }
};
