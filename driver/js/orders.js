/* ══════════════════════════════════════════════════════════
   js/orders.js — إدارة الطلبات والتسليم
   ══════════════════════════════════════════════════════════ */

const DOrders = {
  _orders     : [],
  _currentOrder: null,
  _pinVerified : false,

  // ── تحميل طلبات اليوم ─────────────────────────────────
  async load() {
    const el = document.getElementById('ordersList');
    el.innerHTML = `<div style="text-align:center;padding:3rem;color:#64748b">
      <i class="fa-solid fa-spinner fa-spin" style="font-size:2rem;display:block;margin-bottom:.75rem"></i>
      جارٍ تحميل طلبات اليوم...
    </div>`;
    document.getElementById('ordersEmpty').classList.add('hidden');

    const res = await DAPI.getDriverOrders();
    if (!res?.ok) {
      el.innerHTML = `<div style="text-align:center;padding:3rem;color:#ef4444">
        <i class="fa-solid fa-triangle-exclamation" style="font-size:2rem;display:block;margin-bottom:.75rem"></i>
        ${res?.error || 'خطأ في تحميل الطلبات'}
      </div>`;
      return;
    }

    this._orders = res.orders || [];
    this.renderList();
    await this.loadSummaryBar();
  },

  // ── رسم قائمة الطلبات ──────────────────────────────────
  renderList() {
    const el    = document.getElementById('ordersList');
    const empty = document.getElementById('ordersEmpty');

    if (!this._orders.length) {
      el.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');

    el.innerHTML = this._orders.map(o => this.orderCard(o)).join('');
  },

  orderCard(o) {
    const st   = DCFG.STATUS_LABELS[o['حالة']] || { label: o['حالة'], cls: 'pending' };
    const items = o['_items'] || [];
    const del   = o['_delivery'] || {};
    const addr  = o['عنوان_التسليم'] || o['_delivery']?.['عنوان_التسليم'] || '—';
    const amount = numFmt(o['الإجمالي']);

    let btns = '';
    const num = o['رقم_طلب'];

    if (o['حالة'] === 'جاهز') {
      btns = `
        <div class="oc-btn-row">
          <button class="oc-btn start" onclick="DOrders.startDelivery('${num}')">
            <i class="fa-solid fa-truck-fast"></i> بدء التوصيل
          </button>
          <button class="oc-btn view" onclick="DOrders.viewOrder('${num}')">
            <i class="fa-solid fa-eye"></i> تفاصيل
          </button>
          ${addr !== '—' ? `<button class="oc-btn whatsapp" onclick="DOrders.openMaps('${esc(addr)}')" title="افتح الخرائط">
            <i class="fa-solid fa-map-location-dot"></i>
          </button>` : ''}
        </div>`;
    } else if (o['حالة'] === 'خرج_للتوزيع') {
      btns = `
        <div class="oc-btn-row">
          <button class="oc-btn deliver" onclick="DOrders.openDeliveryForm('${num}')">
            <i class="fa-solid fa-clipboard-check"></i> تسجيل التسليم
          </button>
          <button class="oc-btn view" onclick="DOrders.viewOrder('${num}')">
            <i class="fa-solid fa-eye"></i>
          </button>
          ${addr !== '—' ? `<button class="oc-btn whatsapp" onclick="DOrders.openMaps('${esc(addr)}')" title="خرائط">
            <i class="fa-solid fa-map-location-dot"></i>
          </button>` : ''}
        </div>`;
    } else if (o['حالة'] === 'مُسلَّم' || o['حالة'] === 'مشكلة_تسليم') {
      const collected = del['مبلغ_مستلم'] ? numFmt(del['مبلغ_مستلم']) + ' د.ع' : '—';
      btns = `
        <div class="oc-btn-row">
          <button class="oc-btn view" onclick="DOrders.viewOrder('${num}')">
            <i class="fa-solid fa-eye"></i> عرض التفاصيل
          </button>
          <span style="font-size:.78rem;color:${o['حالة']==='مُسلَّم'?'#10b981':'#ef4444'};
                       font-weight:800;padding:.6rem .5rem">
            محصّل: ${collected}
          </span>
        </div>`;
    }

    return `
      <div class="order-card" id="ocard_${num}">
        <div class="oc-top" onclick="DOrders.viewOrder('${num}')">
          <div>
            <div class="oc-num">${num}</div>
            <div class="oc-customer">${esc(o['اسم_عميل'] || '—')}</div>
            <div class="oc-address"><i class="fa-solid fa-location-dot"></i>${esc(addr)}</div>
          </div>
          <div class="oc-right">
            <div class="oc-amount">${amount} <small style="font-size:.7rem">د.ع</small></div>
            <div class="oc-items">${items.length} صنف</div>
          </div>
        </div>
        <div class="oc-status-bar ${st.cls}">
          <i class="fa-solid ${st.cls==='ready'?'fa-box-open':st.cls==='onway'?'fa-truck-fast':st.cls==='done'?'fa-check-circle':st.cls==='issue'?'fa-triangle-exclamation':'fa-ban'}"></i>
          ${st.label}
        </div>
        ${btns}
      </div>`;
  },

  // ── بدء التوصيل ────────────────────────────────────────
  async startDelivery(orderNum) {
    if (!confirm(`بدء توصيل الطلب ${orderNum}؟\nسيتم إشعار الزبون.`)) return;
    DUI.showLoader('جارٍ تحديث الحالة...');
    const res = await DAPI.startDelivery(orderNum);
    DUI.hideLoader();
    if (!res?.ok) { DUI.toast(res?.error || 'فشل التحديث', 'error'); return; }

    DUI.toast('بدأ التوصيل — الحالة: خرج للتوزيع', 'success');
    this._updateLocalStatus(orderNum, 'خرج_للتوزيع');
    this.renderList();

    // ✅ تشغيل تتبع GPS
    if (window.DGPS) DGPS.start(orderNum);

    // إشعار واتساب للزبون
    const order = this._orders.find(o => o['رقم_طلب'] === orderNum);
    if (order && DApp._settings.whatsapp) {
      const msg = encodeURIComponent(`🚚 طلبك ${orderNum} في الطريق إليك!\nالسائق: ${DAuth.getUser()?.name}`);
      window.open(`https://wa.me/${DApp._settings.whatsapp}?text=${msg}`, '_blank');
    }
  },

  // ── عرض تفاصيل الطلب ──────────────────────────────────
  viewOrder(orderNum) {
    const o = this._orders.find(x => x['رقم_طلب'] === orderNum);
    if (!o) return;
    this._currentOrder = o;
    this._pinVerified  = false;

    const st   = DCFG.STATUS_LABELS[o['حالة']] || { label:o['حالة'], cls:'ready' };
    const items = o['_items'] || [];
    const del   = o['_delivery'] || {};
    const addr  = o['عنوان_التسليم'] || del['عنوان_التسليم'] || '—';

    document.getElementById('deliveryOrderNum').textContent = orderNum;
    document.getElementById('deliveryStatus').textContent   = st.label;
    document.getElementById('deliveryStatus').className     = `d-status-tag ${st.cls}`;
    document.getElementById('deliveryForm').classList.add('hidden');

    // معلومات الطلب
    document.getElementById('orderInfoGrid').innerHTML = `
      <div class="info-item">
        <div class="label">الزبون</div>
        <div class="value">${esc(o['اسم_عميل']||'—')}</div>
      </div>
      <div class="info-item">
        <div class="label">المبلغ المطلوب</div>
        <div class="value amount">${numFmt(o['الإجمالي'])} د.ع</div>
      </div>
      <div class="info-item full">
        <div class="label">عنوان التسليم</div>
        <div class="value">${esc(addr)}</div>
      </div>
      ${del['مبلغ_مستلم'] ? `
      <div class="info-item">
        <div class="label">المبلغ المستلم</div>
        <div class="value" style="color:#10b981">${numFmt(del['مبلغ_مستلم'])} د.ع</div>
      </div>
      <div class="info-item">
        <div class="label">حالة التحصيل</div>
        <div class="value">${del['حالة_التحصيل']||'—'}</div>
      </div>` : ''}
      ${o['ملاحظات'] ? `
      <div class="info-item full">
        <div class="label">ملاحظات الطلب</div>
        <div class="value" style="color:#94a3b8;font-size:.82rem">${esc(o['ملاحظات'])}</div>
      </div>` : ''}`;

    // بنود الطلب
    document.getElementById('deliveryItems').innerHTML = items.map(it => {
      const ordered = Number(it['كمية']||it['كمية_مطلوبة']||0);
      return `<div class="del-item">
        <div class="del-item-name">${esc(it['وصف_منتج']||it['وصف']||it['وصف_بند']||'—')}</div>
        <div class="del-item-detail">نوع: ${it['نوع_منتج']||it['نوع']||'—'}</div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:.8rem;color:#94a3b8">الكمية المطلوبة</span>
          <span style="font-size:1.1rem;font-weight:900;color:#f1f5f9">${ordered} حبة</span>
        </div>
      </div>`;
    }).join('') || '<div style="text-align:center;padding:1rem;color:#64748b">لا توجد بنود</div>';

    // أزرار الإجراءات
    this.renderOrderActions(o);

    DApp.goTo('delivery');
  },

  renderOrderActions(o) {
    const el  = document.getElementById('orderActions');
    const num = o['رقم_طلب'];
    const addr = o['عنوان_التسليم'] || '';

    let html = '';
    if (o['حالة'] === 'جاهز') {
      html = `
        <button class="btn-start-delivery" onclick="DOrders.startDelivery('${num}')">
          <i class="fa-solid fa-truck-fast"></i> بدء التوصيل
        </button>`;
    } else if (o['حالة'] === 'خرج_للتوزيع') {
      html = `
        <button class="btn-open-delivery" onclick="DOrders.openDeliveryForm('${num}')">
          <i class="fa-solid fa-clipboard-check"></i> تسجيل التسليم
        </button>`;
    }

    if (addr) {
      html += `
        <button class="btn-maps" onclick="DOrders.openMaps('${esc(addr)}')">
          <i class="fa-solid fa-map-location-dot"></i> فتح في الخرائط
        </button>`;
    }
    el.innerHTML = html;
  },

  // ── فتح نموذج التسليم ──────────────────────────────────
  openDeliveryForm(orderNum) {
    const o = this._orders.find(x => x['رقم_طلب'] === orderNum);
    if (!o) { this.viewOrder(orderNum); return; }

    // إذا لم نكن في شاشة التسليم، افتحها أولاً
    if (!document.getElementById('view-delivery').classList.contains('active')) {
      this.viewOrder(orderNum);
    }

    this._currentOrder = o;
    this._pinVerified  = false;

    const items = o['_items'] || [];
    const form  = document.getElementById('deliveryForm');

    // بناء حقول الكميات لكل بند
    document.getElementById('deliveryItems').innerHTML = items.map((it, i) => {
      const ordered = Number(it['كمية']||it['كمية_مطلوبة']||0);
      return `
        <div class="del-item">
          <div class="del-item-name">${esc(it['وصف_منتج']||it['وصف']||it['وصف_بند']||'—')}</div>
          <div class="del-item-detail">مطلوب: ${ordered} حبة</div>
          <div class="del-item-inputs">
            <div class="del-input-group">
              <label>كمية مُسلَّمة</label>
              <input type="number" class="del-qty-input" id="del_${i}" min="0" max="${ordered}"
                     value="${ordered}" oninput="DDelivery.onQtyChange(${i},${ordered})">
            </div>
            <div class="del-input-group">
              <label>كمية مرتجعة</label>
              <input type="number" class="del-qty-input" id="ret_${i}" min="0" max="${ordered}"
                     value="0" readonly style="color:#94a3b8">
            </div>
          </div>
          <textarea class="del-reason hidden" id="reason_${i}"
                    placeholder="سبب النقص (اختياري)..."></textarea>
        </div>`;
    }).join('');

    // المبلغ المطلوب
    document.getElementById('amountExpected').textContent = numFmt(o['الإجمالي']) + ' د.ع';
    document.getElementById('amountReceived').value = '';
    document.getElementById('amountDiff').classList.add('hidden');
    document.getElementById('pinInput').value = '';
    document.getElementById('pinInput').className = 'pin-input';
    document.getElementById('pinStatus').classList.add('hidden');
    document.getElementById('pinVerifyBtn').disabled = true;
    document.getElementById('submitDeliveryBtn').disabled = true;
    document.getElementById('driverNotes').value = '';

    form.classList.remove('hidden');
    form.scrollIntoView({ behavior: 'smooth' });
  },

  openMaps(address) {
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    window.open(url, '_blank');
  },

  _updateLocalStatus(orderNum, status) {
    const o = this._orders.find(x => x['رقم_طلب'] === orderNum);
    if (o) o['حالة'] = status;
  },

  async loadSummaryBar() {
    const res = await DAPI.getDriverSummary();
    if (!res?.ok) return;
    const s = res.summary;
    document.getElementById('dsTotal').textContent     = s.total;
    document.getElementById('dsDelivered').textContent = s.delivered;
    document.getElementById('dsPending').textContent   = s.pending;
    document.getElementById('dsIssues').textContent    = s.issues;
    document.getElementById('dsCollected').textContent =
      s.collected > 0 ? (s.collected/1000).toFixed(0)+'K' : '0';
  }
};


/* ══════════════════════════════════════════════════════════
   js/delivery.js — منطق نموذج التسليم
   ══════════════════════════════════════════════════════════ */
const DDelivery = {

  onQtyChange(idx, max) {
    const delInput = document.getElementById('del_' + idx);
    const retInput = document.getElementById('ret_' + idx);
    const reasonEl = document.getElementById('reason_' + idx);

    const delivered = Math.min(Math.max(0, parseInt(delInput.value)||0), max);
    const returned  = max - delivered;
    delInput.value  = delivered;
    retInput.value  = returned;

    delInput.className = 'del-qty-input' + (returned > 0 ? ' shortage' : '');
    if (returned > 0) { reasonEl.classList.remove('hidden'); }
    else              { reasonEl.classList.add('hidden'); reasonEl.value = ''; }
  },

  checkAmountDiff() {
    const o        = DOrders._currentOrder;
    if (!o) return;
    const expected = Number(o['الإجمالي'])||0;
    const received = parseFloat(document.getElementById('amountReceived').value)||0;
    const diff     = expected - received;
    const diffEl   = document.getElementById('amountDiff');

    if (!received) { diffEl.classList.add('hidden'); return; }
    diffEl.classList.remove('hidden');
    if (Math.abs(diff) < 1) {
      diffEl.className = 'amount-diff exact';
      diffEl.textContent = '✓ المبلغ مطابق تماماً';
    } else if (diff > 0) {
      diffEl.className = 'amount-diff deficit';
      diffEl.textContent = `⚠ ناقص ${numFmt(diff)} د.ع`;
    } else {
      diffEl.className = 'amount-diff surplus';
      diffEl.textContent = `↑ زائد ${numFmt(Math.abs(diff))} د.ع`;
    }
  },

  onPINInput() {
    const val = document.getElementById('pinInput').value;
    document.getElementById('pinVerifyBtn').disabled = val.length !== 4;
  },

  async verifyPIN() {
    const o   = DOrders._currentOrder;
    const pin = document.getElementById('pinInput').value;
    if (!o || pin.length !== 4) return;

    DUI.showLoader('جارٍ التحقق من الـ PIN...');
    const res = await DAPI.validatePIN(o['رقم_طلب'], pin);
    DUI.hideLoader();

    const statusEl = document.getElementById('pinStatus');
    const pinInput = document.getElementById('pinInput');
    statusEl.classList.remove('hidden');

    if (res?.ok) {
      statusEl.className = 'pin-status ok';
      statusEl.innerHTML = '<i class="fa-solid fa-check-circle"></i> تم تأكيد الـ PIN بنجاح';
      pinInput.className = 'pin-input verified';
      pinInput.disabled  = true;
      document.getElementById('pinVerifyBtn').disabled = true;
      DOrders._pinVerified = true;
      document.getElementById('submitDeliveryBtn').disabled = false;
      DUI.toast('PIN صحيح ✓', 'success');
    } else {
      statusEl.className = 'pin-status err';
      statusEl.innerHTML = `<i class="fa-solid fa-xmark-circle"></i> ${res?.error || 'PIN غير صحيح'}`;
      pinInput.value = '';
      DUI.toast(res?.error || 'PIN غير صحيح', 'error');
    }
  },

  async submit() {
    const o = DOrders._currentOrder;
    if (!o) return;
    if (!DOrders._pinVerified) { DUI.toast('يجب تأكيد الـ PIN أولاً', 'error'); return; }

    const received = parseFloat(document.getElementById('amountReceived').value)||0;
    if (!received) { DUI.toast('أدخل المبلغ المستلم', 'error'); return; }

    // جمع بيانات بنود التسليم
    const orderItems = o['_items'] || [];
    const items = orderItems.map((it, i) => {
      const ordered   = Number(it['كمية']||it['كمية_مطلوبة']||0);
      const delivered = parseInt(document.getElementById('del_' + i)?.value)||0;
      const returned  = parseInt(document.getElementById('ret_' + i)?.value)||0;
      const reason    = document.getElementById('reason_' + i)?.value || '';
      return {
        itemId    : it['معرف'] || '',
        productId : it['معرف_منتج'] || '',
        type      : it['نوع_منتج'] || it['نوع'] || '',
        name      : it['وصف_منتج'] || it['وصف'] || it['وصف_بند'] || '',
        ordered, delivered, returned, reason
      };
    });

    const hasShortage = items.some(it => it.returned > 0);
    if (hasShortage) {
      if (!confirm('⚠ يوجد نقص في بعض الأصناف.\nهل تريد تأكيد التسليم مع ملاحظة النقص؟')) return;
    }

    const notes = document.getElementById('driverNotes').value;

    DUI.showLoader('جارٍ تسجيل التسليم...');
    const res = await DAPI.submitDelivery({
      orderNum       : o['رقم_طلب'],
      amountReceived : received,
      notes,
      pinConfirmed   : true,
      items
    });
    DUI.hideLoader();

    if (!res?.ok) { DUI.toast(res?.error || 'فشل التسجيل', 'error'); return; }

    DUI.toast(res.msg || 'تم التسليم بنجاح ✓', res.hasShortage ? 'warn' : 'success');

    // إرسال واتساب للزبون بتأكيد التسليم
    this.notifyCustomerWhatsapp(res.hasShortage);

    // تحديث القائمة المحلية
    DOrders._updateLocalStatus(o['رقم_طلب'], res.hasShortage ? 'مشكلة_تسليم' : 'مُسلَّم');
    await DOrders.loadSummaryBar();

    // العودة للقائمة
    setTimeout(() => { DApp.goTo('orders'); DOrders.renderList(); }, 1200);
  },

  notifyCustomerWhatsapp(hasIssue) {
    const o        = DOrders._currentOrder;
    const settings = DApp._settings;
    if (!o || !settings.whatsapp) return;

    const driver = DAuth.getUser()?.name || 'السائق';
    const msg = hasIssue
      ? `📦 تم تسليم جزء من طلبك ${o['رقم_طلب']}.\nيوجد نقص في بعض الأصناف — سيتواصل معك المتجر قريباً.\nالسائق: ${driver}`
      : `✅ تم تسليم طلبك ${o['رقم_طلب']} بنجاح.\nشكراً لثقتك بنا! 🙏\nالسائق: ${driver}`;

    window.open(`https://wa.me/${settings.whatsapp}?text=${encodeURIComponent(msg)}`, '_blank');
  }
};


/* ══════════════════════════════════════════════════════════
   الإشعارات
   ══════════════════════════════════════════════════════════ */
const DNotifs = {
  _list: [],

  async load() {
    const el  = document.getElementById('notifsList');
    el.innerHTML = `<div style="text-align:center;padding:2rem;color:#64748b">
      <i class="fa-solid fa-spinner fa-spin"></i>
    </div>`;

    const res = await DAPI.getNotifications(false);
    this._list = res?.notifications || [];
    this.render();
  },

  render() {
    const el = document.getElementById('notifsList');
    if (!this._list.length) {
      el.innerHTML = `<div class="notifs-empty">
        <i class="fa-solid fa-bell-slash"></i>
        <p>لا توجد إشعارات</p>
      </div>`;
      this.updateBadge(0);
      return;
    }

    const unread = this._list.filter(n => n['مقروء']!==true && n['مقروء']!=='TRUE').length;
    this.updateBadge(unread);

    el.innerHTML = this._list.map(n => {
      const isUnread = n['مقروء'] !== true && n['مقروء'] !== 'TRUE';
      const ico      = DCFG.NOTIF_ICONS[n['نوع']] || 'fa-bell';
      const type     = n['نوع'] || 'info';
      const date     = new Date(n['تاريخ']).toLocaleString('ar-IQ',{
        month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'
      });
      return `
        <div class="notif-card ${isUnread?'unread':''}" onclick="DNotifs.markRead('${n['معرف']}',this)">
          <div class="notif-icon ${type}"><i class="fa-solid ${ico}"></i></div>
          <div class="notif-body">
            <div class="notif-title">${esc(n['عنوان']||'')}</div>
            <div class="notif-msg">${esc(n['رسالة']||'')}</div>
            <div class="notif-time"><i class="fa-solid fa-clock"></i> ${date}</div>
          </div>
          ${isUnread ? '<div class="notif-unread-dot"></div>' : ''}
        </div>`;
    }).join('');
  },

  async markRead(id, cardEl) {
    await DAPI.markNotifRead(id);
    const n = this._list.find(x => x['معرف'] === id);
    if (n) n['مقروء'] = 'TRUE';
    if (cardEl) {
      cardEl.classList.remove('unread');
      const dot = cardEl.querySelector('.notif-unread-dot');
      if (dot) dot.remove();
    }
    const unread = this._list.filter(n => n['مقروء']!==true && n['مقروء']!=='TRUE').length;
    this.updateBadge(unread);
  },

  async markAllRead() {
    await DAPI.markAllNotifRead();
    this._list.forEach(n => n['مقروء'] = 'TRUE');
    this.render();
    DUI.toast('تم تحديد الكل كمقروء', 'success');
  },

  updateBadge(count) {
    const dot   = document.getElementById('notifDot');
    const badge = document.getElementById('dnavNotifBadge');
    dot?.classList.toggle('hidden', count === 0);
    if (badge) {
      badge.textContent = count;
      badge.classList.toggle('hidden', count === 0);
    }
  },

  // استطلاع دوري
  async poll() {
    const res = await DAPI.getNotifications(true);
    const count = res?.unreadCount || 0;
    this.updateBadge(count);
    if (count > 0) DUI.toast(`لديك ${count} إشعار جديد`, 'info');
  }
};


/* ══════════════════════════════════════════════════════════
   ملخص اليوم الكامل
   ══════════════════════════════════════════════════════════ */
const DSummary = {
  async load() {
    const el  = document.getElementById('summaryContent');
    el.innerHTML = '<div style="text-align:center;padding:2rem;color:#64748b"><i class="fa-solid fa-spinner fa-spin"></i></div>';

    const res = await DAPI.getDriverSummary();
    if (!res?.ok) { el.innerHTML = '<p style="padding:1.5rem;color:#ef4444">خطأ</p>'; return; }
    const s = res.summary;

    const f = n => Number(n||0).toLocaleString('ar-IQ',{maximumFractionDigits:0});

    el.innerHTML = `
      <div class="summary-stats">
        <div class="ss-card">
          <span class="ss-val">${s.total}</span>
          <div class="ss-label">إجمالي الطلبات</div>
        </div>
        <div class="ss-card green">
          <span class="ss-val">${s.delivered}</span>
          <div class="ss-label">تم التسليم</div>
        </div>
        <div class="ss-card" style="border-color:rgba(249,115,22,.3)">
          <span class="ss-val" style="color:#f97316">${s.pending}</span>
          <div class="ss-label">متبقٍ</div>
        </div>
        <div class="ss-card red">
          <span class="ss-val">${s.issues}</span>
          <div class="ss-label">مشاكل</div>
        </div>
        <div class="ss-card amber">
          <span class="ss-val" style="font-size:1.3rem">${f(s.collected)}</span>
          <div class="ss-label">محصّل (د.ع)</div>
        </div>
        <div class="ss-card blue">
          <span class="ss-val" style="font-size:1.3rem">${f(s.expected)}</span>
          <div class="ss-label">مطلوب (د.ع)</div>
        </div>
      </div>
      ${s.diff > 0 ? `
      <div style="margin:.5rem .75rem;padding:.75rem 1rem;background:var(--red-l);
                  border-radius:var(--radius-sm);color:var(--red);font-weight:800;font-size:.88rem">
        <i class="fa-solid fa-triangle-exclamation"></i>
        فرق التحصيل: ${f(s.diff)} د.ع — يرجى مراجعة المدير
      </div>` : s.diff === 0 && s.expected > 0 ? `
      <div style="margin:.5rem .75rem;padding:.75rem 1rem;background:var(--green-l);
                  border-radius:var(--radius-sm);color:var(--green);font-weight:800;font-size:.88rem">
        <i class="fa-solid fa-check-circle"></i> التحصيل مكتمل ✓
      </div>` : ''}

      <!-- تفاصيل الطلبات -->
      <div class="summary-table">
        <div class="st-header"><i class="fa-solid fa-list-check"></i> تفاصيل الطلبات</div>
        ${DOrders._orders.map(o=>{
          const st  = o['حالة']===('مُسلَّم')?'done':o['حالة']==='مشكلة_تسليم'?'issue':'pending';
          const stL = o['حالة']==='مُسلَّم'?'مُسلَّم':o['حالة']==='مشكلة_تسليم'?'مشكلة':DCFG.STATUS_LABELS[o['حالة']]?.label||o['حالة'];
          return `<div class="st-row">
            <span class="st-num">${o['رقم_طلب']}</span>
            <div class="st-info">
              <div class="st-customer">${esc(o['اسم_عميل']||'—')}</div>
            </div>
            <span class="st-amount">${f(o['الإجمالي'])} د.ع</span>
            <span class="st-status ${st}" style="margin-right:.5rem">${stL}</span>
          </div>`;
        }).join('') || '<div style="padding:1rem;text-align:center;color:#64748b">لا توجد طلبات</div>'}
      </div>`;
  }
};


// ─── دوال مساعدة ────────────────────────────────────────
function numFmt(n) {
  return Number(n||0).toLocaleString('ar-IQ', { maximumFractionDigits:0 });
}
function esc(s) {
  return String(s||'')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
