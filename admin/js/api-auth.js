/* ══ api.js ══════════════════════════════════════════════ */
const API = {
  async call(action, params={}) {
    const body = { action, ...params };
    const tok  = Auth.getToken();
    if (tok) body.token = tok;
    try {
      const res  = await fetch(CONFIG.API_URL, {
        method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'},
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error('HTTP '+res.status);
      const data = await res.json();
      if (data.error==='انتهت الجلسة') { Auth.clearSession(); App.showLogin(); }
      return data;
    } catch(e) { UI.toast('خطأ في الاتصال بالخادم','error'); return null; }
  },
  login          :(u,p)    => API.call('login',     {username:u,password:p}),
  logout         :()       => API.call('logout'),
  getSettings    :()       => API.call('getSettings'),
  updateSettings :(d)      => API.call('updateSettings', d),
  getProducts    :(type,p) => API.call('getProducts', {type,...(p||{})}),
  addProduct     :(t,d)    => API.call('addProduct',  {prodType:t,...d}),
  updateProduct  :(t,d)    => API.call('updateProduct',{prodType:t,...d}),
  deleteProduct  :(t,id)   => API.call('deleteProduct',{prodType:t,معرف:id}),
  createOrder    :(d)      => API.call('createOrder', {...d,items:JSON.stringify(d.items)}),
  getOrders      :(p)      => API.call('getOrders',   p||{}),
  getOrder       :(num)    => API.call('getOrder',    {orderNum:num}),
  updateOrderStatus:(num,st)=>API.call('updateOrderStatus',{orderNum:num,status:st}),
  getUsers       :(p)      => API.call('getUsers',    p||{}),
  addUser        :(d)      => API.call('addUser',     d),
  updateUser     :(d)      => API.call('updateUser',  d),
  getPermissions :(id)     => API.call('getPermissions',{معرف:id}),
  setPermissions :(uid,p)  => API.call('setPermissions',{userId:uid,permissions:JSON.stringify(p)}),
  getDashboard   :()       => API.call('getDashboard')
};

/* ══ auth.js ══════════════════════════════════════════════ */
const Auth = {
  _token:null, _user:null,

  async login(e) {
    e.preventDefault();
    const u = document.getElementById('loginUsername').value.trim();
    const p = document.getElementById('loginPassword').value;
    if (!u||!p) { this.showErr('أدخل بيانات الدخول'); return; }
    this.setBusy(true); this.clearErr();
    const res = await API.login(u,p);
    this.setBusy(false);
    if (!res)        { this.showErr('تعذّر الاتصال — تحقق من API_URL'); return; }
    if (!res.ok)     { this.showErr(res.error||'بيانات غير صحيحة'); return; }
    if (res.user?.role==='customer') { this.showErr('هذا الموقع للموظفين فقط'); return; }
    this._token=res.token; this._user=res.user;
    localStorage.setItem('adm_token',res.token);
    localStorage.setItem('adm_user', JSON.stringify(res.user));
    await App.init();
  },
  async logout() {
    if (!confirm('تسجيل خروج؟')) return;
    await API.logout(); this.clearSession();
    if (App._notifTimer) { clearInterval(App._notifTimer); App._notifTimer=null; }
    App.showLogin();
  },
  restore() {
    const t=localStorage.getItem('adm_token'), u=localStorage.getItem('adm_user');
    if(t&&u){this._token=t;this._user=JSON.parse(u);return true;} return false;
  },
  clearSession() {
    this._token=null;this._user=null;
    localStorage.removeItem('adm_token');localStorage.removeItem('adm_user');
  },
  getToken()    { return this._token; },
  getUser()     { return this._user; },
  isAdmin()     { return this._user?.role==='admin'; },
  isAccountant(){ return this._user?.role==='accountant'; },
  hasPerm(p)    {
    if (this.isAdmin()) return true;
    try { return JSON.parse(this._user?.permissions||'{}')[p]===true; } catch{return false;}
  },
  showErr(m) {
    const el=document.getElementById('loginError');
    el.textContent='⚠ '+m; el.classList.remove('hidden');
    document.getElementById('loginPassword').value='';
  },
  clearErr()  { document.getElementById('loginError')?.classList.add('hidden'); },
  setBusy(on) {
    document.getElementById('loginBtnText')?.classList.toggle('hidden',on);
    document.getElementById('loginBtnSpin')?.classList.toggle('hidden',!on);
    const b=document.getElementById('loginBtn'); if(b) b.disabled=on;
  },
  togglePass() {
    const i=document.getElementById('loginPassword');
    const e=document.getElementById('passEye');
    if(i.type==='password'){i.type='text';e.className='fa-solid fa-eye-slash';}
    else{i.type='password';e.className='fa-solid fa-eye';}
  }
};

/* ══ دوال مشتركة (مُتاحة لجميع الملفات) ══ */
const nf  = n => Number(n||0).toLocaleString('ar-IQ', { maximumFractionDigits:0 });
const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
