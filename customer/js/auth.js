/* ══════════════════════════════════════════
   js/auth.js
   ══════════════════════════════════════════ */
const CAuth = {
  _token: null,
  _user : null,

  async login(e) {
    e.preventDefault();
    const u = document.getElementById('lu').value.trim();
    const p = document.getElementById('lp').value;
    if (!u||!p) { this.showErr('أدخل اسم المستخدم وكلمة المرور'); return; }
    this.setLoading(true); this.clearErr();

    const res = await CAPI.login(u, p);
    this.setLoading(false);

    if (!res)      { this.showErr('تعذّر الاتصال — تحقق من رابط API'); return; }
    if (!res.ok)   { this.showErr(res.error || 'بيانات الدخول غير صحيحة'); return; }
    if (res.user?.role !== 'customer') {
      this.showErr('هذه البوابة للزبائن فقط — استخدم موقع الإدارة'); return;
    }

    this._token = res.token;
    this._user  = res.user;
    localStorage.setItem('cst_token', res.token);
    localStorage.setItem('cst_user',  JSON.stringify(res.user));
    await CApp.init();
  },

  async logout() {
    if (!confirm('هل تريد تسجيل الخروج؟')) return;
    await CAPI.logout();
    this.clearSession();
    CApp.showLogin();
  },

  restore() {
    const t = localStorage.getItem('cst_token');
    const u = localStorage.getItem('cst_user');
    if (t && u) { this._token = t; this._user = JSON.parse(u); return true; }
    return false;
  },
  clearSession() {
    this._token = null; this._user = null;
    localStorage.removeItem('cst_token');
    localStorage.removeItem('cst_user');
  },
  getToken()      { return this._token; },
  getUser()       { return this._user; },
  getDiscount()   { return Number(this._user?.unitDiscount) || 0; },

  showErr(msg) {
    const el = document.getElementById('loginErr');
    el.textContent = '⚠ ' + msg; el.classList.remove('hidden');
  },
  clearErr() { document.getElementById('loginErr').classList.add('hidden'); },
  setLoading(on) {
    document.getElementById('lBtnTxt').classList.toggle('hidden', on);
    document.getElementById('lBtnSpin').classList.toggle('hidden', !on);
    document.getElementById('lBtn').disabled = on;
  },
  toggleEye() {
    const i = document.getElementById('lp');
    const e = document.getElementById('eyeIcon');
    if (i.type==='password') { i.type='text'; e.className='fa-solid fa-eye-slash'; }
    else { i.type='password'; e.className='fa-solid fa-eye'; }
  }
};
