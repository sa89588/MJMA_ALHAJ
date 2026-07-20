/* ══════════════════════════════════════════
   js/config.js
   ══════════════════════════════════════════ */
const WCFG = {
  API_URL      : 'https://script.google.com/macros/s/AKfycbyYkVK28zF3lny6YpiB_opQ60Ao8jtOBnR0cpCc5ov3j90_aZWF8RdUknsb-TlIM8XkDA/exec',
  POLL_MS      : 10000,   // كل 10 ثواني
  URGENT_MIN   : 30,      // تنبيه عند تأخر أكثر من 30 دقيقة
  SHORTAGE_REASONS: [
    'نفد من المخزون',
    'جودة غير مقبولة',
    'غير متوفر حالياً',
    'خطأ في الطلب',
    'سبب آخر'
  ]
};


/* ══════════════════════════════════════════
   js/auth.js
   ══════════════════════════════════════════ */
const WAuth = {
  _token:null, _user:null,

  async login(e) {
    e.preventDefault();
    const u = document.getElementById('lu').value.trim();
    const p = document.getElementById('lp').value;
    if (!u||!p) { this.showErr('أدخل بيانات الدخول'); return; }
    this.setBusy(true); this.clearErr();

    const res = await WAPI.login(u, p);
    this.setBusy(false);
    if (!res)              { this.showErr('تعذّر الاتصال — تحقق من API_URL'); return; }
    if (!res.ok)           { this.showErr(res.error || 'بيانات الدخول غير صحيحة'); return; }
    if (!['warehouse','admin'].includes(res.user?.role)) {
      this.showErr('هذه البوابة لموظفي التجهيز فقط'); return;
    }

    this._token = res.token;
    this._user  = res.user;
    localStorage.setItem('wh_token', res.token);
    localStorage.setItem('wh_user',  JSON.stringify(res.user));
    await WApp.init();
  },

  async logout() {
    if (!confirm('تسجيل خروج؟')) return;
    await WAPI.call('logout');
    this.clearSession();
    WApp.showLogin();
  },

  restore() {
    const t = localStorage.getItem('wh_token');
    const u = localStorage.getItem('wh_user');
    if (t && u) { this._token=t; this._user=JSON.parse(u); return true; }
    return false;
  },

  clearSession() {
    this._token=null; this._user=null;
    localStorage.removeItem('wh_token');
    localStorage.removeItem('wh_user');
  },

  getToken() { return this._token; },
  getUser()  { return this._user; },
  showErr(m) {
    const el = document.getElementById('loginErr');
    el.textContent='⚠ '+m; el.classList.remove('hidden');
    document.getElementById('lp').value='';
  },
  clearErr() { document.getElementById('loginErr').classList.add('hidden'); },
  setBusy(on) {
    document.getElementById('lTxt').classList.toggle('hidden',on);
    document.getElementById('lSpin').classList.toggle('hidden',!on);
    document.getElementById('lBtn').disabled=on;
  },
  toggleEye() {
    const i=document.getElementById('lp');
    const e=document.getElementById('eyeIco');
    if(i.type==='password'){i.type='text';e.className='fa-solid fa-eye-slash';}
    else{i.type='password';e.className='fa-solid fa-eye';}
  }
};


/* ══════════════════════════════════════════
   js/api.js
   ══════════════════════════════════════════ */
const WAPI = {
  async call(action, params={}) {
    const body = { action, ...params };
    const tok  = WAuth.getToken();
    if (tok) body.token = tok;
    try {
      const res  = await fetch(WCFG.API_URL,{
        method:'POST',
        headers:{'Content-Type':'text/plain;charset=utf-8'},
        body:JSON.stringify(body)
      });
      if (!res.ok) throw new Error('HTTP '+res.status);
      const data = await res.json();
      if (data.error==='انتهت الجلسة') { WAuth.clearSession(); WApp.showLogin(); }
      return data;
    } catch(e) {
      WUI.toast('خطأ في الاتصال','error');
      return null;
    }
  },
  login           : (u,p) => WAPI.call('login',{username:u,password:p}),
  getSettings     : ()    => WAPI.call('getSettings'),
  getWarehouseOrders: ()  => WAPI.call('getWarehouseOrders'),
  startPrep       : (num) => WAPI.call('startPrep',{orderNum:num}),
  updatePrepItem  : (d)   => WAPI.call('updatePrepItem',d),
  completePrep    : (d)   => WAPI.call('completePrep',d),
  getChanges      : (since)=>WAPI.call('getChanges',{since})
};


/* ══════════════════════════════════════════
   js/app.js — المتحكم الرئيسي + نظام التجهيز
   ══════════════════════════════════════════ */

// ─── الصوت ──────────────────────────────────────────────
const WSound = {
  _ctx: null,
  init() {
    document.addEventListener('click', ()=>{
      if (!this._ctx) this._ctx = new (window.AudioContext||window.webkitAudioContext)();
    }, {once:true});
  },
  play(type='new') {
    if (!this._ctx) return;
    const freqs = { new:[880,660,880], warn:[440,330], done:[523,659,784] };
    const seq   = freqs[type] || freqs.new;
    seq.forEach((f,i)=>{
      const osc  = this._ctx.createOscillator();
      const gain = this._ctx.createGain();
      osc.connect(gain); gain.connect(this._ctx.destination);
      osc.frequency.value = f;
      osc.type = 'sine';
      const t = this._ctx.currentTime + i*0.15;
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t+0.2);
      osc.start(t); osc.stop(t+0.2);
    });
  }
};

// ─── التحديث التلقائي ────────────────────────────────────
const WPoller = {
  _timer    : null,
  _lastTs   : new Date().toISOString(),
  _prevCount: 0,

  start() {
    this._timer = setInterval(()=>this.poll(), WCFG.POLL_MS);
  },
  stop() { clearInterval(this._timer); this._timer=null; },

  async poll() {
    const ind = document.getElementById('refreshInd');
    if (ind) { ind.textContent='⟳ جارٍ التحديث...'; ind.className='refresh-indicator active'; }

    const res = await WAPI.getChanges(this._lastTs);
    if (!res?.ok) return;
    this._lastTs = res.serverTime || new Date().toISOString();

    if (res.hasChanges) {
      // تحقق إذا كانت هناك طلبات جديدة للتجهيز
      const prepChanges = res.changes.filter(c=>
        c.table==='الطلبات' && ['تأكيد_طلب','اكتمال_تجهيز'].includes(c.action)
      );
      if (prepChanges.length) {
        WSound.play('new');
        WUI.toast('📦 طلب جديد وصل للتجهيز!', 'info');
        await WOrders.load();
      }
    }

    if (ind) { ind.textContent='آخر تحديث: '+new Date().toLocaleTimeString('ar-IQ');
               ind.className='refresh-indicator'; }
  }
};

// ─── إدارة الطلبات ───────────────────────────────────────
const WOrders = {
  _orders: [],

  async load() {
    const el    = document.getElementById('ordersList');
    const empty = document.getElementById('listEmpty');
    el.innerHTML = '<div style="text-align:center;padding:2.5rem;color:#9ca3af"><i class="fa-solid fa-spinner fa-spin" style="font-size:1.5rem"></i></div>';
    empty.classList.add('hidden');

    const res = await WAPI.getWarehouseOrders();
    if (!res?.ok) {
      el.innerHTML='<div style="padding:1.5rem;text-align:center;color:var(--red)">خطأ في التحميل</div>';
      return;
    }
    this._orders = res.orders || [];

    // تحديث شريط الإحصائيات
    const newC = this._orders.filter(o=>o['حالة']==='مؤكد').length;
    const inC  = this._orders.filter(o=>o['حالة']==='قيد_التجهيز').length;
    document.getElementById('wsNew').textContent       = newC;
    document.getElementById('wsInProgress').textContent= inC;

    if (!this._orders.length) {
      el.innerHTML=''; empty.classList.remove('hidden'); return;
    }

    el.innerHTML = this._orders.map(o=>this.orderCard(o)).join('');
  },

  orderCard(o) {
    const isNew      = o['حالة'] === 'مؤكد';
    const inProgress = o['حالة'] === 'قيد_التجهيز';
    const prep       = o['_prep'];
    const age        = o['_ageMin'] || 0;
    const urgent     = age >= WCFG.URGENT_MIN;
    const items      = o['_items'] || [];

    // حساب تقدم التجهيز
    let doneCount=0, totalCount=items.length;
    if (prep && items.length) {
      // استخدام عدد بنود الطلب كمرجع
      doneCount = items.filter((_,i)=>i < (prep['_doneCount']||0)).length;
    }
    const pct = totalCount > 0 ? Math.round(doneCount/totalCount*100) : 0;

    let progressHtml = '';
    if (inProgress) {
      progressHtml = `
        <div class="oc-progress">
          <div class="progress-label">
            <span>التقدم</span>
            <span>${doneCount} / ${totalCount}</span>
          </div>
          <div class="progress-bar-wrap">
            <div class="progress-bar" style="width:${pct}%"></div>
          </div>
        </div>`;
    }

    const btnHtml = isNew
      ? `<button class="btn-start-prep" onclick="WOrders.startPrep('${o['رقم_طلب']}')">
           <i class="fa-solid fa-play"></i> بدء التجهيز
         </button>`
      : `<button class="btn-continue-prep" onclick="WOrders.openPrep('${o['رقم_طلب']}')">
           <i class="fa-solid fa-boxes-packing"></i> متابعة التجهيز
         </button>`;

    return `
      <div class="order-card ${urgent?'urgent':''} ${inProgress?'in-progress':''}">
        <div class="oc-top" onclick="WOrders.openPrep('${o['رقم_طلب']}')">
          <div>
            <div class="oc-num">${o['رقم_طلب']}</div>
            <div class="oc-customer">${esc(o['اسم_عميل']||'—')}</div>
            <div class="oc-items-count">${totalCount} صنف</div>
          </div>
          <div class="oc-right">
            <div class="oc-amount">${nf(o['الإجمالي'])} د.ع</div>
            <div class="oc-age ${urgent?'urgent':''}">${age < 60 ? age+'د' : Math.round(age/60)+'س'} منذ الوصول</div>
          </div>
        </div>
        <div class="oc-status-bar ${isNew?'new':'in-prog'}">
          <i class="fa-solid ${isNew?'fa-inbox':'fa-boxes-packing'}"></i>
          ${isNew ? 'جديد — في انتظار التجهيز' : 'قيد التجهيز'}
        </div>
        ${progressHtml}
        <div class="oc-btn-row">${btnHtml}</div>
      </div>`;
  },

  async startPrep(orderNum) {
    WUI.showLoader('جارٍ بدء التجهيز...');
    const res = await WAPI.startPrep(orderNum);
    WUI.hideLoader();
    if (!res?.ok) { WUI.toast(res?.error||'فشل','error'); return; }
    WUI.toast('بدأ التجهيز', 'success');
    WSound.play('done');
    await this.load();
    // فتح شاشة التجهيز مباشرة
    setTimeout(()=>this.openPrep(orderNum), 300);
  },

  openPrep(orderNum) {
    const o = this._orders.find(x=>x['رقم_طلب']===orderNum);
    if (!o) return;
    WPrep.open(o);
  }
};

// ─── شاشة التجهيز ────────────────────────────────────────
const WPrep = {
  _order   : null,
  _items   : [],    // { itemId, needed, prepared, shortage, reason, status }
  _saving  : false,

  open(order) {
    this._order = order;
    const items = order['_items'] || [];

    // تهيئة حالة البنود
    this._items = items.map(it=>({
      itemId   : it['معرف']||'',
      productId: it['معرف_منتج']||'',
      type     : it['نوع']||it['نوع_منتج']||'',
      desc     : it['وصف']||it['وصف_منتج']||'',
      detail   : it['ماركة_قياس']||'',
      needed   : Number(it['كمية'])||0,
      prepared : Number(it['كمية'])||0,   // افتراضي: كل الكمية جاهزة
      shortage : 0,
      reason   : '',
      status   : 'pending'
    }));

    document.getElementById('prepOrderNum').textContent = order['رقم_طلب'];
    document.getElementById('prepCustomer').textContent = order['اسم_عميل']||'—';
    document.getElementById('prepNotes').value = '';

    this.renderItems();
    this.updateSummary();
    WApp.goTo('prep');
  },

  renderItems() {
    const el = document.getElementById('prepItemsList');
    el.innerHTML = this._items.map((it,i)=>this.itemCard(it,i)).join('');
  },

  itemCard(it, idx) {
    const isDone    = it.shortage === 0 && it.status !== 'pending';
    const isShort   = it.shortage > 0;
    const cls       = isDone ? 'completed' : isShort ? 'shortage' : '';
    const chkCls    = isDone ? 'done' : isShort ? 'short' : '';
    const chkIco    = isDone ? 'fa-check' : isShort ? 'fa-xmark' : 'fa-circle';

    const reasonOpts = WCFG.SHORTAGE_REASONS.map(r=>
      `<option value="${r}" ${it.reason===r?'selected':''}>${r}</option>`
    ).join('');

    return `
      <div class="prep-item-card ${cls}" id="pic_${idx}">
        <div class="pic-top">
          <div class="pic-check ${chkCls}" onclick="WPrep.toggleDone(${idx})">
            <i class="fa-solid ${chkIco}"></i>
          </div>
          <div class="pic-info">
            <div class="pic-name">${esc(it.desc)}</div>
            ${it.detail ? `<div class="pic-detail">${esc(it.detail)}</div>` : ''}
          </div>
          <div class="pic-needed">
            ${it.needed}
            <small>مطلوب</small>
          </div>
        </div>
        <div class="pic-qty-section">
          <div class="qty-row">
            <label>كمية جُهِّزت</label>
            <div class="qty-ctrl">
              <button class="qty-btn minus" onclick="WPrep.changeQty(${idx},-1)">−</button>
              <span class="qty-val ${isShort?'shortage':''}" id="qv_${idx}">${it.prepared}</span>
              <button class="qty-btn" onclick="WPrep.changeQty(${idx},1)">+</button>
            </div>
            ${isShort ? `<span class="shortage-badge">ناقص ${it.shortage}</span>` : ''}
          </div>
          ${isShort ? `
          <div class="qty-row">
            <label>سبب النقص</label>
            <select class="shortage-reason" style="flex:1;padding:.4rem .6rem;border:1.5px solid #fca5a5;border-radius:6px;font-family:var(--font);font-size:.82rem"
                    onchange="WPrep.setReason(${idx},this.value)">
              <option value="">اختر السبب...</option>
              ${reasonOpts}
            </select>
          </div>
          ` : ''}
        </div>
      </div>`;
  },

  toggleDone(idx) {
    const it = this._items[idx];
    if (it.status === 'done' || it.shortage > 0) {
      // إعادة تعيين
      it.status = 'pending';
    } else {
      it.status = 'done';
      it.prepared = it.needed;
      it.shortage = 0;
    }
    this._refreshItem(idx);
    this.updateSummary();
    this._autoSaveItem(idx);
  },

  changeQty(idx, delta) {
    const it = this._items[idx];
    const nq = Math.max(0, Math.min(it.needed, it.prepared + delta));
    it.prepared = nq;
    it.shortage = Math.max(0, it.needed - nq);
    it.status   = nq >= it.needed ? 'done' : nq > 0 ? 'partial' : 'pending';
    this._refreshItem(idx);
    this.updateSummary();
    this._autoSaveItem(idx);
  },

  setReason(idx, reason) {
    this._items[idx].reason = reason;
  },

  _refreshItem(idx) {
    const it = this._items[idx];
    const card = document.getElementById(`pic_${idx}`);
    if (!card) return;
    const isDone  = it.status==='done';
    const isShort = it.shortage > 0;
    card.className = `prep-item-card ${isDone?'completed':isShort?'shortage':''}`;

    const chk = card.querySelector('.pic-check');
    chk.className = `pic-check ${isDone?'done':isShort?'short':''}`;
    chk.innerHTML = `<i class="fa-solid ${isDone?'fa-check':isShort?'fa-xmark':'fa-circle'}"></i>`;

    const qv = document.getElementById(`qv_${idx}`);
    if (qv) { qv.textContent=it.prepared; qv.className=`qty-val ${isShort?'shortage':''}`; }

    // إعادة رسم القسم السفلي إذا تغيرت حالة النقص
    const section = card.querySelector('.pic-qty-section');
    if (section) {
      const reasonOpts = WCFG.SHORTAGE_REASONS.map(r=>
        `<option value="${r}" ${it.reason===r?'selected':''}>${r}</option>`
      ).join('');
      section.innerHTML = `
        <div class="qty-row">
          <label>كمية جُهِّزت</label>
          <div class="qty-ctrl">
            <button class="qty-btn minus" onclick="WPrep.changeQty(${idx},-1)">−</button>
            <span class="qty-val ${isShort?'shortage':''}" id="qv_${idx}">${it.prepared}</span>
            <button class="qty-btn" onclick="WPrep.changeQty(${idx},1)">+</button>
          </div>
          ${isShort ? `<span class="shortage-badge">ناقص ${it.shortage}</span>` : ''}
        </div>
        ${isShort ? `
        <div class="qty-row">
          <label>سبب النقص</label>
          <select class="shortage-reason" style="flex:1;padding:.4rem .6rem;border:1.5px solid #fca5a5;border-radius:6px;font-family:var(--font);font-size:.82rem"
                  onchange="WPrep.setReason(${idx},this.value)">
            <option value="">اختر السبب...</option>${reasonOpts}
          </select>
        </div>` : ''}`;
    }
  },

  updateSummary() {
    const total   = this._items.length;
    const done    = this._items.filter(it=>it.status==='done').length;
    const short   = this._items.filter(it=>it.shortage>0).length;
    const pending = total - done - short;

    document.getElementById('psTotal').textContent   = total;
    document.getElementById('psDone').textContent    = done;
    document.getElementById('psPending').textContent = pending;
    document.getElementById('psShortage').textContent= short;

    document.getElementById('wsDone').textContent = done;

    // تفعيل زر الإتمام فقط عند معالجة كل البنود
    const allHandled = this._items.every(it=>it.status==='done'||it.shortage>0);
    const btn = document.getElementById('completePrepBtn');
    if (btn) btn.disabled = !allHandled;
  },

  // حفظ تلقائي لكل بند
  async _autoSaveItem(idx) {
    const it    = this._items[idx];
    const order = this._order;
    if (!order || !it.itemId) return;
    await WAPI.updatePrepItem({
      orderNum   : order['رقم_طلب'],
      itemId     : it.itemId,
      qtyPrepared: it.prepared,
      reason     : it.reason || ''
    });
  },

  async complete() {
    const order = this._order;
    if (!order) return;

    const allHandled = this._items.every(it=>it.status==='done'||it.shortage>0);
    if (!allHandled) { WUI.toast('جهّز جميع البنود أولاً أو سجّل النقص', 'error'); return; }

    const hasShortage = this._items.some(it=>it.shortage>0);
    if (hasShortage) {
      const shortItems = this._items.filter(it=>it.shortage>0).map(it=>it.desc).join('، ');
      if (!confirm(`⚠ يوجد نقص في:\n${shortItems}\n\nهل تريد إنهاء التجهيز مع ملاحظة النقص؟`)) return;
    }

    const notes = document.getElementById('prepNotes').value;
    WUI.showLoader('جارٍ إتمام التجهيز...');
    const res = await WAPI.completePrep({
      orderNum: order['رقم_طلب'],
      notes
    });
    WUI.hideLoader();

    if (!res?.ok) { WUI.toast(res?.error||'فشل','error'); return; }

    WSound.play(hasShortage ? 'warn' : 'done');
    WUI.toast(res.msg || 'تم التجهيز ✓', hasShortage ? 'warn' : 'success');

    // العودة للقائمة وتحديثها
    WApp.goTo('list');
    await WOrders.load();
  }
};

// ─── المتحكم الرئيسي ─────────────────────────────────────
const WApp = {
  _view    : 'list',
  _settings: {},

  async boot() {
    WSound.init();
    if (WAuth.restore()) { await this.init(); }
    else { this.showLogin(); }
  },

  async init() {
    document.getElementById('loginPage').classList.add('hidden');
    document.getElementById('appRoot').classList.remove('hidden');

    const sRes = await WAPI.getSettings();
    this._settings = sRes?.settings || {};
    document.getElementById('loginTitle').textContent =
      (this._settings.store_name || 'المتجر') + ' — التجهيز';

    const user = WAuth.getUser();
    if (user) {
      document.getElementById('wName').textContent   = user.name || user.username;
      document.getElementById('wAvatar').textContent = (user.name||'م').charAt(0);
    }

    await WOrders.load();
    WPoller.start();
    this.goTo('list');
  },

  showLogin() {
    document.getElementById('appRoot').classList.add('hidden');
    document.getElementById('loginPage').classList.remove('hidden');
    document.getElementById('lu').focus();
  },

  goTo(view) {
    document.querySelectorAll('.wview').forEach(v=>v.classList.remove('active'));
    const el = document.getElementById('view-'+view);
    if (el) el.classList.add('active');
    this._view = view;
    if (view==='list') WOrders.load();
  },

  printPrepSheet() {
    const order = WPrep._order;
    if (!order) return;
    const items = WPrep._items;
    document.body.insertAdjacentHTML('beforeend',`
      <div class="print-prep" style="display:none" id="printPrepSheet">
        <h2>ورقة التجهيز — ${order['رقم_طلب']}</h2>
        <p>العميل: ${order['اسم_عميل']||'—'} &nbsp;&nbsp; التاريخ: ${new Date().toLocaleDateString('ar-IQ')}</p>
        <table>
          <thead><tr><th>✓</th><th>الصنف</th><th>مطلوب</th><th>جُهِّز</th><th>ملاحظات</th></tr></thead>
          <tbody>${items.map(it=>`<tr>
            <td><span class="check-box"></span></td>
            <td>${esc(it.desc)}</td>
            <td style="text-align:center">${it.needed}</td>
            <td style="text-align:center">${it.prepared}</td>
            <td>${it.shortage>0?'ناقص '+it.shortage:''}</td>
          </tr>`).join('')}</tbody>
        </table>
        <p style="margin-top:1rem">توقيع موظف التجهيز: _______________</p>
      </div>`);
    window.print();
    setTimeout(()=>document.getElementById('printPrepSheet')?.remove(), 1000);
  }
};

// ─── أدوات واجهة المستخدم ───────────────────────────────
const WUI = {
  toast(msg, type='success') {
    const el = document.createElement('div');
    el.className = 'w-toast '+type;
    const ico={success:'fa-check-circle',error:'fa-triangle-exclamation',
               info:'fa-circle-info',warn:'fa-triangle-exclamation'};
    el.innerHTML = `<i class="fa-solid ${ico[type]||ico.success}"></i> ${msg}`;
    document.getElementById('wToasts').appendChild(el);
    setTimeout(()=>el.remove(), 3500);
  },
  showLoader(t='جارٍ التحميل...') {
    document.getElementById('loaderMsg').textContent = t;
    document.getElementById('wLoader').classList.remove('hidden');
  },
  hideLoader() { document.getElementById('wLoader').classList.add('hidden'); }
};

const nf  = n => Number(n||0).toLocaleString('ar-IQ',{maximumFractionDigits:0});
const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

document.addEventListener('DOMContentLoaded', ()=>WApp.boot());
