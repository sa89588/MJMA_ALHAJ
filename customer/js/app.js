/* ══════════════════════════════════════════════════════════
   js/app.js v2 — المتحكم الرئيسي للسائق + GPS
   استبدل هذا الملف بـ driver/js/app.js
   ══════════════════════════════════════════════════════════ */

// ── عرض طلباتي ──────────────────────────────────────────────
const COrders = {
  async load() {
    const el = document.getElementById('myOrdersList');
    el.innerHTML = `<div style="text-align:center;padding:2.5rem;color:#64748b">
      <i class="fa-solid fa-spinner fa-spin" style="font-size:1.5rem;display:block;margin-bottom:.5rem"></i>
      جارٍ التحميل...
    </div>`;

    const res = await CAPI.getOrders();
    if (!res?.ok) { el.innerHTML = `<div class="no-results"><i class="fa-solid fa-triangle-exclamation"></i><p>تعذّر تحميل الطلبات</p></div>`; return; }
    const orders = res.orders || [];

    if (!orders.length) {
      el.innerHTML = `<div class="no-results"><i class="fa-solid fa-inbox"></i><p>لا توجد طلبات بعد</p><p style="font-size:.78rem;margin-top:.25rem">أنشئ قائمتك الأولى من الكتالوج</p></div>`;
      return;
    }

    el.innerHTML = orders.map(o => this.orderCard(o)).join('');
  },

  orderCard(o) {
    const track = this.trackingBar(o['حالة']);
    const date  = new Date(o['تاريخ']).toLocaleDateString('ar-IQ', { day:'numeric', month:'long', year:'numeric' });
    return `
      <div class="order-card" onclick="COrders.viewDetail('${o['رقم_طلب']}')">
        <div class="oc-top">
          <div>
            <div class="oc-num">${o['رقم_طلب']}</div>
            <div class="oc-date">${date}</div>
          </div>
          <div>
            <div class="oc-total">${numFmt(o['الإجمالي'])} د.ع</div>
            <div class="oc-note">${o['ملاحظات']||''}</div>
          </div>
        </div>
        <div class="tracking-bar">${track}</div>
      </div>`;
  },

  trackingBar(status) {
    const canceled = status === 'ملغي';
    const issue    = status === 'مشكلة_تسليم';
    const effectiveStatus = status === 'مكتمل' ? 'مُسلَّم' : status;
    const steps    = CCFG.ORDER_STEPS;
    const activeIdx= steps.findIndex(s => s.key === (issue ? 'مُسلَّم' : effectiveStatus));

    const stepsHtml = steps.map((s, i) => {
      let cls = '';
      if (canceled)      { cls = i===0 ? 'canceled' : ''; }
      else if (issue && i===steps.length-1) { cls = 'issue'; }
      else if (i < activeIdx)  cls = 'done';
      else if (i === activeIdx) cls = 'active';
      return `
        <div class="track-step ${cls}">
          <div class="track-icon"><i class="fa-solid ${issue&&i===steps.length-1?'fa-triangle-exclamation':s.icon}"></i></div>
          <span>${issue&&i===steps.length-1?'ملاحظة':s.label}</span>
        </div>`;
    }).join('');
    return `<div class="tracking-steps">${stepsHtml}</div>`;
  },

  async viewDetail(orderNum) {
    CApp.goTo('orderDetail');
    document.getElementById('orderDetailTitle').textContent = orderNum;
    document.getElementById('orderDetailContent').innerHTML =
      `<div style="text-align:center;padding:2.5rem;color:#94a3b8">
        <i class="fa-solid fa-spinner fa-spin" style="font-size:1.5rem;display:block;margin-bottom:.5rem"></i>
      </div>`;

    const res = await CAPI.getOrder(orderNum);
    if (!res?.ok) { document.getElementById('orderDetailContent').innerHTML = '<p style="padding:1.5rem;color:red">تعذّر تحميل الطلب</p>'; return; }

    const o = res.order, items = res.items;
    const delivery = res.delivery || null;
    const returns  = res.returns  || [];
    const date = new Date(o['تاريخ']).toLocaleDateString('ar-IQ', { day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' });

    const itemRows = items.map((it,i) => `
      <div class="order-item-row">
        <span class="oir-num">${i+1}</span>
        <div class="oir-info">
          <div class="oir-name">${esc(it['وصف']||'')}</div>
          ${Number(it['خصم_وحدة'])>0 ? `<div class="oir-detail" style="color:#059669">خصم ${numFmt(it['خصم_وحدة'])} × ${it['كمية']}</div>` : ''}
        </div>
        <div style="text-align:left">
          <div class="oir-total">${numFmt(it['إجمالي_بند'])} د.ع</div>
          <div class="oir-detail">× ${it['كمية']} حبة</div>
        </div>
      </div>`).join('');

    // قسم تفاصيل التسليم
    let deliverySection = '';
    if (delivery && (delivery['حالة']==='مُسلَّم'||delivery['حالة']==='مشكلة_تسليم'||delivery['وقت_البدء'])) {
      const collected = Number(delivery['مبلغ_مستلم'])||0;
      const expected  = Number(delivery['مبلغ_مطلوب'])||0;
      const returnsHtml = returns.map(r=>`
        <div class="order-meta-row" style="align-items:flex-start">
          <span style="color:#dc2626"><i class="fa-solid fa-rotate-left"></i> ${esc(r['وصف_بند']||'')}</span>
          <strong style="color:#dc2626">ناقص ${r['كمية_مرتجعة']}</strong>
        </div>`).join('');
      deliverySection = `
      <div class="order-detail-card" style="margin:.75rem">
        <div style="padding:.75rem 1rem .25rem;font-size:.8rem;font-weight:800;color:#0f2040">
          <i class="fa-solid fa-truck-fast" style="color:#1d4ed8"></i> تفاصيل التسليم
        </div>
        ${delivery['وقت_التسليم'] ? `
        <div class="order-meta-row">
          <span>المبلغ المستلم</span>
          <strong style="color:#059669">${numFmt(collected)} د.ع</strong>
        </div>` : `<div class="order-meta-row"><span>الحالة</span><strong style="color:#1d4ed8">في الطريق إليك</strong></div>`}
        ${returnsHtml}
        ${delivery['ملاحظات_سائق'] ? `<div class="order-meta-row"><span>ملاحظات</span><strong style="color:#475569;font-weight:600">${esc(delivery['ملاحظات_سائق'])}</strong></div>` : ''}
      </div>`;
    }

    document.getElementById('orderDetailContent').innerHTML = `
      <div class="order-detail-card" style="margin:.75rem">
        <div class="odc-header">
          <span class="odc-num">${o['رقم_طلب']}</span>
          <span class="odc-total">${numFmt(o['الإجمالي'])} د.ع</span>
        </div>
        <div style="padding:.75rem 1rem">${this.trackingBar(o['حالة'])}</div>
      </div>
      <div class="order-detail-card" style="margin:.75rem">
        <div class="order-meta-row"><span>التاريخ</span><strong>${date}</strong></div>
        <div class="order-meta-row"><span>الحالة</span><strong>${(o['حالة']||'').replace(/_/g,' ')}</strong></div>
        ${o['ملاحظات'] ? `<div class="order-meta-row"><span>ملاحظات</span><strong>${esc(o['ملاحظات'])}</strong></div>` : ''}
      </div>
      ${deliverySection}
      <div class="order-detail-card" style="margin:.75rem">
        ${itemRows}
        <div class="order-meta-row" style="border-top:2px solid #e2e8f0;margin-top:.25rem">
          <span style="font-weight:800;color:#0f2040">الإجمالي النهائي</span>
          <strong style="font-size:1.15rem;color:#1d4ed8">${numFmt(o['الإجمالي'])} د.ع</strong>
        </div>
      </div>
      <div style="padding:.75rem">
        <button onclick="COrders.reorder('${o['رقم_طلب']}')"
                style="width:100%;padding:.75rem;background:#f0f4ff;color:#1d4ed8;border-radius:10px;
                       font-size:.9rem;font-weight:700;font-family:'Cairo',sans-serif;border:1.5px solid #bfdbfe">
          <i class="fa-solid fa-rotate-right"></i> إعادة هذا الطلب
        </button>
      </div>`;
  },

  async reorder(orderNum) {
    const res = await CAPI.getOrder(orderNum);
    if (!res?.ok) return;
    if (!confirm('هل تريد نسخ هذا الطلب إلى قائمتك الحالية؟')) return;
    const disc = CAuth.getDiscount();
    res.items.forEach(it => {
      const net = Math.max(0, Number(it['سعر_صافي']||0));
      CCart.add({
        id:it['معرف_منتج']||(Math.random()+'').slice(2), name:it['وصف']||'',
        type:it['نوع']||'', netPrice:net, basePrice:Number(it['سعر_أساسي']||net),
        disc, qty:Number(it['كمية'])||1, stock:9999
      });
    });
    CApp.goTo('cart'); CCart.renderPanel();
    CUI.toast('تم تحميل الطلب في قائمتك', 'success');
  }
};


// ── المتحكم الرئيسي ──────────────────────────────────────
const CApp = {
  _settings: {},
  _view    : 'catalog',
  _pollTimer: null,

  async boot() {
    if (CAuth.restore()) { await this.init(); }
    else { this.showLogin(); }
  },

  async init() {
    document.getElementById('loginPage').classList.add('hidden');
    document.getElementById('appRoot').classList.remove('hidden');

    const sRes = await CAPI.getSettings();
    this._settings = sRes?.settings || {};
    const name = this._settings.store_name || 'متجر الإطارات';

    document.getElementById('loginStoreName').textContent = name;
    document.getElementById('headerName').textContent     = name;
    document.getElementById('headerEmoji').textContent    = this._settings.logo_emoji || '🚗';
    document.getElementById('cartCurrency').textContent   = this._settings.currency   || 'دينار عراقي';
    document.title = name;

    const user = CAuth.getUser();
    document.getElementById('headerUserName').textContent = user?.name || '';
    document.getElementById('headerUserDot').textContent  = (user?.name||'ز').charAt(0);

    CCart.load();
    CCart.updateUI();
    await CCatalog.load();
    this.goTo('catalog');
  },

  showLogin() {
    document.getElementById('appRoot').classList.add('hidden');
    document.getElementById('loginPage').classList.remove('hidden');
    document.getElementById('lu').focus();
  },

  goTo(view) {
    document.querySelectorAll('.cview').forEach(v=>v.classList.remove('active'));
    document.querySelectorAll('.bnav').forEach(b=>b.classList.remove('active'));
    const viewEl = document.getElementById('view-'+view);
    if (viewEl) viewEl.classList.add('active');
    const navEl = document.querySelector(`.bnav[data-view="${view}"]`);
    if (navEl) navEl.classList.add('active');
    const fc = document.getElementById('floatCart');
    if (view==='catalog') { CCart.updateUI(); }
    else { fc?.classList.add('hidden'); }
    this._view = view;
    if (view==='cart')       { CCart.renderPanel(); }
    if (view==='orders')     { COrders.load(); }
    if (view==='orderDetail'){ /* محمّل من viewDetail */ }
  }
};


// ── أدوات واجهة المستخدم ─────────────────────────────────
const CUI = {
  toast(msg, type='success') {
    const el  = document.createElement('div');
    el.className = `toast ${type}`;
    const ico = { success:'fa-check-circle', error:'fa-triangle-exclamation', info:'fa-circle-info' };
    el.innerHTML = `<i class="fa-solid ${ico[type]||ico.success}"></i> ${msg}`;
    document.getElementById('toasts').appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }
};

function numFmt(n) { return Number(n||0).toLocaleString('ar-IQ',{maximumFractionDigits:0}); }
function esc(s)    { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

document.addEventListener('DOMContentLoaded', ()=>CApp.boot());
