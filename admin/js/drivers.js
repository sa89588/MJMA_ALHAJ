/* ══════════════════════════════════════════════════════════
   drivers.js — إدارة السائقين، الإسناد، السجل، التقارير، الإشعارات
   ══════════════════════════════════════════════════════════ */

/* ══ إدارة السائقين (قائمة + إضافة/تعديل) ════════════════ */
const Drivers = {
  _all: [], _editId: null,

  async load() {
    const el = document.getElementById('driversTable');
    if (!el) return;
    el.innerHTML = '<div class="inline-loader"><i class="fa-solid fa-spinner fa-spin"></i></div>';
    const res = await API.call('getUsers', { role:'driver' });
    if (!res?.ok) { el.innerHTML = '<div class="table-empty"><p>خطأ في التحميل</p></div>'; return; }
    this._all = res.users || [];
    this.render(el);
  },

  render(el) {
    if (!this._all.length) {
      el.innerHTML = `<div class="table-empty"><i class="fa-solid fa-truck"></i><p>لا يوجد سائقون مُضافون</p></div>`;
      return;
    }
    const rows = this._all.map(d => `<tr>
      <td><strong>${d['اسم_مستخدم']}</strong></td>
      <td>${d['الاسم']||'—'}</td>
      <td>${d['الهاتف']||'—'}</td>
      <td><span class="status-badge ${d['نشط']==='TRUE'||d['نشط']===true?'done':'canceled'}">
        ${d['نشط']==='TRUE'||d['نشط']===true?'مفعّل':'معطّل'}
      </span></td>
      <td>
        <button class="btn-edit" onclick="Drivers.openModal('${d['معرف']}')">
          <i class="fa-solid fa-pen"></i> تعديل
        </button>
      </td>
    </tr>`).join('');

    el.innerHTML = `<table class="catalog-table"><thead><tr>
      <th>اسم المستخدم</th><th>الاسم</th><th>الهاتف</th><th>الحالة</th><th>إجراءات</th>
    </tr></thead><tbody>${rows}</tbody></table>
    <div class="catalog-count">إجمالي السائقين: <strong>${this._all.length}</strong></div>`;
  },

  openModal(id = null) {
    this._editId = id;
    const d = id ? this._all.find(x => x['معرف']===id) || {} : {};
    document.getElementById('driverModalTitle').textContent = id ? 'تعديل سائق' : 'إضافة سائق جديد';
    document.getElementById('driverModalBody').innerHTML = `
      <div class="modal-form-grid">
        <div class="form-field"><label>اسم المستخدم</label>
          <input id="df_user" value="${d['اسم_مستخدم']||''}" ${id?'readonly':''}></div>
        <div class="form-field"><label>الاسم الكامل</label>
          <input id="df_name" value="${d['الاسم']||''}"></div>
        <div class="form-field"><label>رقم الهاتف</label>
          <input id="df_phone" value="${d['الهاتف']||''}"></div>
        <div class="form-field"><label>${id?'كلمة مرور جديدة (فارغة=بدون تغيير)':'كلمة المرور'}</label>
          <input id="df_pass" type="password" placeholder="${id?'اتركها فارغة':'كلمة المرور'}"></div>
        <div class="form-field full"><label>الحالة</label>
          <select id="df_active">
            <option value="TRUE"  ${d['نشط']==='TRUE'||d['نشط']===true?'selected':''}>مفعّل</option>
            <option value="FALSE" ${d['نشط']==='FALSE'||d['نشط']===false?'selected':''}>معطّل</option>
          </select></div>
      </div>`;
    document.getElementById('driverModal').classList.remove('hidden');
  },

  async save() {
    const data = {
      'اسم_مستخدم': document.getElementById('df_user')?.value,
      'الاسم'      : document.getElementById('df_name')?.value,
      'الهاتف'     : document.getElementById('df_phone')?.value,
      'الدور'      : 'driver',
      'نشط'        : document.getElementById('df_active')?.value
    };
    const pass = document.getElementById('df_pass')?.value;
    if (pass) data[this._editId ? 'كلمة_مرور_جديدة' : 'كلمة_مرور'] = pass;
    if (this._editId) data['معرف'] = this._editId;

    UI.showLoader();
    const res = this._editId ? await API.updateUser(data) : await API.addUser(data);
    UI.hideLoader();
    if (!res?.ok) { UI.toast(res?.error || 'فشل الحفظ', 'error'); return; }
    UI.toast('تم الحفظ', 'success');
    Modal.close('driverModal');
    this.load();
  }
};


/* ══ نافذة إسناد طلب لسائق ════════════════════════════════ */
const AssignDriver = {
  _orderNum: null,

  async open(orderNum) {
    this._orderNum = orderNum;
    document.getElementById('assignModalTitle').textContent = `إسناد الطلب ${orderNum}`;
    document.getElementById('assignModalBody').innerHTML =
      '<div class="inline-loader"><i class="fa-solid fa-spinner fa-spin"></i></div>';
    document.getElementById('assignModal').classList.remove('hidden');

    const res = await API.call('getDriverList');
    const drivers = res?.drivers || [];
    const activeDrivers = drivers.filter(d => d['نشط']==='TRUE' || d['نشط']===true);

    if (!activeDrivers.length) {
      document.getElementById('assignModalBody').innerHTML = `
        <div style="text-align:center;padding:1.5rem;color:#8a9ab0">
          <i class="fa-solid fa-truck" style="font-size:2rem;display:block;margin-bottom:.5rem"></i>
          لا يوجد سائقون مفعّلون. أضف سائقاً أولاً من "إدارة السائقين".
        </div>`;
      return;
    }

    const opts = activeDrivers.map(d =>
      `<option value="${d['اسم_مستخدم']}">${d['الاسم']||d['اسم_مستخدم']} (${d['الهاتف']||'—'})</option>`
    ).join('');

    document.getElementById('assignModalBody').innerHTML = `
      <div class="modal-form-grid">
        <div class="form-field full">
          <label>السائق</label>
          <select id="ad_driver">${opts}</select>
        </div>
        <div class="form-field full">
          <label>عنوان التسليم</label>
          <input id="ad_address" placeholder="اكتب عنوان الزبون يدوياً...">
        </div>
      </div>
      <p style="font-size:.78rem;color:#8a9ab0;margin-top:.5rem">
        <i class="fa-solid fa-circle-info"></i>
        سيُولَّد رمز تأكيد (PIN) تلقائياً ويظهر على بطاقة الطلب لإعطائه للزبون.
      </p>`;
  },

  async confirm() {
    const driver  = document.getElementById('ad_driver')?.value;
    const address = document.getElementById('ad_address')?.value || '';
    if (!driver) { UI.toast('اختر سائقاً', 'error'); return; }

    UI.showLoader('جارٍ الإسناد...');
    const res = await API.call('assignDriver', { orderNum: this._orderNum, driverUsername: driver, address });
    UI.hideLoader();

    if (!res?.ok) { UI.toast(res?.error || 'فشل الإسناد', 'error'); return; }

    // إغلاق النافذة فوراً — الإسناد قرار إداري لا يحتاج تأكيداً من أحد
    Modal.close('assignModal');

    // حفظ الـ PIN محلياً لعرضه على البطاقة
    AssignDriver._lastPins[this._orderNum] = res.pin;

    UI.toast(`✅ أُسند إلى ${driver} — رمز التأكيد: ${res.pin}`, 'success');
    if (window.Sound) Sound.play('success');

    // تحديث الواجهة المفتوحة حالياً
    if (document.getElementById('view-kanban')?.classList.contains('active')) {
      await KanbanBoard.load();
    }
    if (document.getElementById('view-orders')?.classList.contains('active')) {
      await Orders.load();
    }
  },

  // ذاكرة مؤقتة لأرقام PIN المولّدة في هذه الجلسة
  _lastPins: {},

  sendPinWhatsapp(pin, phone, customerName, orderNum) {
    const storeName = App._settings.store_name || 'المتجر';
    const msg = encodeURIComponent(
      `🔐 *${storeName}*\n` +
      `مرحباً ${customerName || ''}\n` +
      (orderNum ? `طلبك: ${orderNum}\n` : '') +
      `رمز تأكيد الاستلام: *${pin}*\n` +
      `يرجى إعطاء هذا الرمز للسائق عند التسليم.`
    );
    // بدون رقم → يفتح واتساب لاختيار جهة الاتصال يدوياً
    const url = phone ? `https://wa.me/${phone}?text=${msg}`
                      : `https://wa.me/?text=${msg}`;
    window.open(url, '_blank');
  }
};


/* ══ سجل التسليمات ════════════════════════════════════════ */
const Deliveries = {
  _all: [],

  async load() {
    const el = document.getElementById('deliveriesTable');
    if (!el) return;
    el.innerHTML = '<div class="inline-loader"><i class="fa-solid fa-spinner fa-spin"></i></div>';

    const res = await API.call('getAllDeliveries');
    if (!res?.ok) { el.innerHTML = '<div class="table-empty"><p>خطأ</p></div>'; return; }
    this._all = res.deliveries || [];
    this.render(this._all);
  },

  render(list) {
    const el = document.getElementById('deliveriesTable');
    if (!list.length) {
      el.innerHTML = '<div class="table-empty"><i class="fa-solid fa-truck"></i><p>لا توجد تسليمات بعد</p></div>';
      return;
    }
    const rows = list.map(d => {
      const st = d['حالة']==='مُسلَّم' ? 'done' : d['حالة']==='مشكلة_تسليم' ? 'issue' : 'pending';
      const date = d['تاريخ_الإسناد'] ? new Date(d['تاريخ_الإسناد']).toLocaleDateString('ar-IQ',{day:'numeric',month:'short'}) : '—';
      const collected = Number(d['مبلغ_مستلم'])||0;
      const expected  = Number(d['مبلغ_مطلوب'])||0;
      const diff = expected - collected;
      return `<tr>
        <td><span class="order-num">${d['رقم_طلب']}</span></td>
        <td>${d['سائق']||'—'}</td>
        <td style="font-size:.8rem">${date}</td>
        <td style="font-size:.78rem;color:#8a9ab0">${d['عنوان_التسليم']||'—'}</td>
        <td>
          <div class="delivery-amounts">
            <span>مطلوب: ${nf(expected)}</span>
            ${collected ? `<span class="${diff===0?'collected':diff>0?'deficit':'surplus'}">مستلم: ${nf(collected)}</span>` : ''}
          </div>
        </td>
        <td><span class="status-badge ${st}">${(d['حالة']||'').replace(/_/g,' ')}</span></td>
        <td><button class="btn-edit" onclick="Deliveries.viewDetail('${d['رقم_طلب']}')"><i class="fa-solid fa-eye"></i></button></td>
      </tr>`;
    }).join('');

    el.innerHTML = `<table class="catalog-table"><thead><tr>
      <th>رقم الطلب</th><th>السائق</th><th>التاريخ</th><th>العنوان</th>
      <th>المبالغ</th><th>الحالة</th><th></th>
    </tr></thead><tbody>${rows}</tbody></table>
    <div class="catalog-count">إجمالي التسليمات: <strong>${list.length}</strong></div>`;
  },

  search() {
    const q = (document.getElementById('deliveriesSearch')?.value||'').toLowerCase();
    const driver = document.getElementById('deliveriesDriverFilter')?.value || '';
    this.render(this._all.filter(d => {
      if (driver && d['سائق']!==driver) return false;
      if (q) {
        const hay = [d['رقم_طلب'],d['سائق'],d['عنوان_التسليم']].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }));
  },

  viewDetail(orderNum) { Orders.view(orderNum); }
};


/* ══ تقارير السائقين ═══════════════════════════════════════ */
const DriverReports = {
  async load() {
    const driverSel = document.getElementById('reportDriverSelect');
    if (driverSel && !driverSel.dataset.loaded) {
      const res = await API.call('getDriverList');
      const drivers = res?.drivers || [];
      driverSel.innerHTML = '<option value="">كل السائقين</option>' +
        drivers.map(d=>`<option value="${d['اسم_مستخدم']}">${d['الاسم']||d['اسم_مستخدم']}</option>`).join('');
      driverSel.dataset.loaded = '1';
    }
    const dateInput = document.getElementById('reportDateInput');
    if (dateInput && !dateInput.value) {
      dateInput.value = new Date().toISOString().slice(0,10);
    }
    this.run();
  },

  async run() {
    const driverUsername = document.getElementById('reportDriverSelect')?.value || '';
    const date = document.getElementById('reportDateInput')?.value || new Date().toISOString().slice(0,10);

    const el = document.getElementById('reportContent');
    el.innerHTML = '<div class="inline-loader"><i class="fa-solid fa-spinner fa-spin"></i></div>';

    const res = await API.call('getDriverReport', { driverUsername, date });
    if (!res?.ok) { el.innerHTML = '<div class="table-empty"><p>خطأ</p></div>'; return; }
    const r = res.report;

    const recordsHtml = r.records.length ? r.records.map(rec => {
      const st = rec['حالة']==='مُسلَّم'?'done':rec['حالة']==='مشكلة_تسليم'?'issue':'pending';
      const items = rec['_items']||[];
      const shortageItems = items.filter(it=>Number(it['كمية_مرتجعة'])>0);
      return `
        <div class="catalog-table-wrap" style="margin-bottom:.75rem">
          <div style="padding:.75rem 1rem;display:flex;justify-content:space-between;align-items:center;background:var(--bg)">
            <div>
              <span class="order-num">${rec['رقم_طلب']}</span>
              <span style="font-size:.78rem;color:var(--text-3);margin-right:.5rem">${rec['سائق']}</span>
            </div>
            <span class="status-badge ${st}">${(rec['حالة']||'').replace(/_/g,' ')}</span>
          </div>
          <div style="padding:.65rem 1rem;font-size:.85rem;display:flex;gap:1.5rem;flex-wrap:wrap">
            <span>مطلوب: <strong>${nf(rec['مبلغ_مطلوب'])}</strong></span>
            <span>مستلم: <strong style="color:var(--green)">${nf(rec['مبلغ_مستلم'])}</strong></span>
            ${Number(rec['فرق_التحصيل'])!==0?`<span style="color:var(--red)">فرق: <strong>${nf(rec['فرق_التحصيل'])}</strong></span>`:''}
          </div>
          ${shortageItems.length ? `
          <div style="padding:0 1rem .75rem">
            ${shortageItems.map(it=>`
              <div style="font-size:.8rem;color:var(--red);padding:.3rem 0;border-top:1px dashed var(--border)">
                <i class="fa-solid fa-rotate-left"></i> ${it['وصف_بند']} — ناقص ${it['كمية_مرتجعة']}
                ${it['سبب_نقص']?` (${it['سبب_نقص']})`:''}
              </div>`).join('')}
          </div>` : ''}
          ${rec['ملاحظات_سائق'] ? `<div style="padding:0 1rem .75rem;font-size:.8rem;color:var(--text-2)">📝 ${rec['ملاحظات_سائق']}</div>` : ''}
        </div>`;
    }).join('') : '<div class="table-empty"><i class="fa-solid fa-inbox"></i><p>لا توجد تسليمات في هذا اليوم</p></div>';

    el.innerHTML = `
      <div class="driver-stat-grid">
        <div class="driver-stat-card"><div class="val">${r.total}</div><div class="lbl">إجمالي</div></div>
        <div class="driver-stat-card green"><div class="val">${r.delivered}</div><div class="lbl">تم التسليم</div></div>
        <div class="driver-stat-card amber"><div class="val">${r.pending}</div><div class="lbl">متبقٍ</div></div>
        <div class="driver-stat-card red"><div class="val">${r.issues}</div><div class="lbl">مشاكل</div></div>
      </div>
      <div class="driver-stat-grid" style="grid-template-columns:1fr 1fr">
        <div class="driver-stat-card"><div class="val">${nf(r.expected)}</div><div class="lbl">إجمالي المطلوب (د.ع)</div></div>
        <div class="driver-stat-card ${r.diff===0?'green':'red'}"><div class="val">${nf(r.collected)}</div><div class="lbl">إجمالي المحصّل (د.ع)</div></div>
      </div>
      ${r.diff!==0 ? `
      <div style="padding:.75rem 1rem;background:var(--danger-bg);color:var(--red);border-radius:var(--radius-sm);
                  font-weight:700;font-size:.88rem;margin-bottom:1rem">
        <i class="fa-solid fa-triangle-exclamation"></i> فرق التحصيل: ${nf(r.diff)} د.ع
      </div>` : ''}
      ${recordsHtml}`;
  }
};


/* ══ نظام الإشعارات (جرس الإدارة) ══════════════════════════ */
const AdminNotifs = {
  _list: [], _open: false,

  // إشعار منبثق (Banner) يظهر أعلى الشاشة عند وصول تحديث لحظي
  _showBannerNotif(title, msg, type='info') {
    const colors = {
      info   : { bg:'#e3f2fd', color:'#1565c0', icon:'fa-circle-info' },
      success: { bg:'#e8f5e9', color:'#2e7d32', icon:'fa-circle-check' },
      warn   : { bg:'#fff3cd', color:'#92400e', icon:'fa-triangle-exclamation' }
    };
    const c = colors[type] || colors.info;
    const el = document.createElement('div');
    el.style.cssText = `position:fixed;top:70px;left:50%;transform:translateX(-50%);
      background:${c.bg};color:${c.color};padding:.75rem 1.25rem;border-radius:10px;
      box-shadow:0 8px 32px rgba(0,0,0,.18);z-index:9999;font-family:'Cairo',sans-serif;
      font-weight:800;font-size:.9rem;display:flex;align-items:center;gap:.6rem;
      animation:bannerIn .3s ease;max-width:90%;`;
    el.innerHTML = `<i class="fa-solid ${c.icon}"></i>
      <div><div>${title}</div><div style="font-weight:500;font-size:.78rem;opacity:.85">${msg||''}</div></div>`;
    document.body.appendChild(el);
    setTimeout(()=>{ el.style.opacity='0'; el.style.transition='.4s'; setTimeout(()=>el.remove(),400); }, 4000);
    // تحديث الجرس
    this.poll();
  },

  async poll() {
    const res = await API.call('getNotifications', { unread:'true' });
    const count = res?.unreadCount || 0;
    const dot = document.getElementById('adminNotifDot');
    if (dot) dot.classList.toggle('hidden', count===0);
  },

  async toggle() {
    this._open = !this._open;
    const panel = document.getElementById('adminNotifPanel');
    if (!this._open) { panel.classList.add('hidden'); return; }
    panel.classList.remove('hidden');
    panel.innerHTML = `<div class="inline-loader"><i class="fa-solid fa-spinner fa-spin"></i></div>`;

    const res = await API.call('getNotifications', {});
    this._list = res?.notifications || [];
    this.render();
  },

  render() {
    const panel = document.getElementById('adminNotifPanel');
    const itemsHtml = this._list.length ? this._list.slice(0,20).map(n => {
      const isUnread = n['مقروء']!==true && n['مقروء']!=='TRUE';
      const ico = CONFIG.NOTIF_ICONS[n['نوع']]||'fa-bell';
      const date = new Date(n['تاريخ']).toLocaleString('ar-IQ',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
      return `<div class="notif-item ${isUnread?'unread':''}" onclick="AdminNotifs.markRead('${n['معرف']}')">
        <div class="notif-item-icon" style="background:var(--accent-light);color:var(--accent)">
          <i class="fa-solid ${ico}"></i>
        </div>
        <div style="flex:1">
          <div class="notif-item-title">${esc(n['عنوان']||'')}</div>
          <div class="notif-item-msg">${esc(n['رسالة']||'')}</div>
          <div class="notif-item-time">${date}</div>
        </div>
      </div>`;
    }).join('') : `<div class="notif-empty"><i class="fa-solid fa-bell-slash"></i><p>لا توجد إشعارات</p></div>`;

    panel.innerHTML = `
      <div class="notif-panel-header">
        <span>الإشعارات</span>
        <a onclick="AdminNotifs.markAllRead()">قراءة الكل</a>
      </div>
      ${itemsHtml}`;
  },

  async markRead(id) {
    await API.call('markNotifRead', { notifId:id });
    const n = this._list.find(x=>x['معرف']===id);
    if (n) n['مقروء']='TRUE';
    this.render();
    this.poll();
  },

  async markAllRead() {
    await API.call('markAllNotifRead');
    this._list.forEach(n=>n['مقروء']='TRUE');
    this.render();
    this.poll();
  }
};

// nf() defined in api-auth.js

// esc() defined in api-auth.js
