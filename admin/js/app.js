/* ══════════════════════════════════════════════════════════
   admin/js/app.js v3 — مع Kanban + GPS + صوت + تحديث تلقائي
   استبدل admin/js/app.js بهذا الملف الكامل
   ══════════════════════════════════════════════════════════ */
const App = {
  _settings  : {},
  _view      : 'dashboard',
  _notifTimer: null,

  async boot() {
    if (Auth.restore()) { await this.init(); }
    else { this.showLogin(); }
  },

  async init() {
    document.getElementById('loginPage').classList.add('hidden');
    document.getElementById('appShell').classList.remove('hidden');

    const sRes = await API.getSettings();
    this._settings = sRes?.settings || {};
    const name = this._settings.store_name || 'متجر الإطارات';
    ['sidebarStoreName','loginStoreName'].forEach(id=>{
      const el=document.getElementById(id); if(el) el.textContent=name;
    });
    document.getElementById('sidebarEmoji').textContent = this._settings.logo_emoji||'🚗';
    document.title = name;

    const user = Auth.getUser();
    document.getElementById('userName').textContent       = user?.name||'';
    document.getElementById('headerUserName').textContent = user?.name||'';
    document.getElementById('userAvatar').textContent     = (user?.name||'م').charAt(0);
    document.getElementById('userLevelBadge').textContent = CONFIG.LEVELS[user?.role]||'';

    if (Auth.isAdmin()) {
      document.querySelectorAll('.admin-only').forEach(el=>el.classList.remove('hidden'));
    }
    this.applyPermissionVisibility();
    this.initNav();

    // تشغيل الصوت والتحديث اللحظي
    Sound.init();
    Realtime.start();

    // استطلاع الإشعارات كل 30 ثانية
    AdminNotifs.poll();
    this._notifTimer = setInterval(()=>AdminNotifs.poll(), CONFIG.POLL_INTERVAL_MS);

    // إغلاق لوحة الإشعارات عند الضغط خارجها
    document.addEventListener('click', e=>{
      const wrap = document.querySelector('.notif-bell-wrap');
      if (wrap && !wrap.contains(e.target) && AdminNotifs._open) AdminNotifs.toggle();
    });

    this.goTo('dashboard');
  },

  applyPermissionVisibility() {
    [
      ['manage_products','perm-products'],
      ['view_orders',    'perm-orders'],
      ['view_customers', 'perm-users'],
      ['view_reports',   'perm-reports'],
      ['view_deliveries','perm-deliveries'],
      ['assign_drivers', 'perm-deliveries']
    ].forEach(([perm,cls])=>{
      if (Auth.hasPerm(perm)) {
        document.querySelectorAll('.'+cls).forEach(el=>el.classList.remove('hidden'));
      }
    });
  },

  showLogin() {
    document.getElementById('appShell')?.classList.add('hidden');
    document.getElementById('loginPage')?.classList.remove('hidden');
  },

  initNav() {
    document.querySelectorAll('.nav-item[data-view]').forEach(el=>{
      el.addEventListener('click', ()=>{
        this.goTo(el.dataset.view);
        if(window.innerWidth<=768) this.closeSidebar();
      });
    });
  },

  goTo(view) {
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
    const vEl=document.getElementById('view-'+view);
    if(vEl) vEl.classList.add('active');
    const nEl=document.querySelector(`.nav-item[data-view="${view}"]`);
    if(nEl) nEl.classList.add('active');

    const titles = {
      dashboard:'لوحة التحكم', kanban:'حالة الطلبات — Kanban',
      tires:'الإطارات', batteries:'البطاريات', builder:'قائمة الطلب',
      orders:'سجل الطلبات', deliveries:'سجل التسليمات',
      driverReports:'تقارير السائقين', drivers:'السائقون',
      users:'الزبائن', adminUsers:'الموظفون',
      adminProducts:'إدارة المنتجات', adminSettings:'الإعدادات'
    };
    const hEl=document.getElementById('headerTitle');
    if(hEl) hEl.textContent=titles[view]||'';
    this._view = view;
    this.loadView(view);
  },

  async loadView(view) {
    switch(view) {
      case 'dashboard'    : await this.loadDash(); break;
      case 'kanban'       : await KanbanBoard.load(); break;
      case 'tires'        : await Catalog.load('TIRES'); break;
      case 'batteries'    : await Catalog.load('BATTERIES'); break;
      case 'orders'       : await Orders.load(); break;
      case 'deliveries'   : await this._loadDeliveriesFilters(); await Deliveries.load(); break;
      case 'driverReports': await DriverReports.load(); break;
      case 'users'        : await Users.load('customer'); break;
      case 'adminUsers'   : await Users.load('accountant'); break;
      case 'drivers'      : await Drivers.load(); break;
      case 'adminSettings': await AdminSettings.load(); break;
    }
  },

  async _loadDeliveriesFilters() {
    const sel = document.getElementById('deliveriesDriverFilter');
    if (sel && !sel.dataset.loaded) {
      const res = await API.call('getDriverList');
      const drivers = res?.drivers||[];
      sel.innerHTML = '<option value="">كل السائقين</option>' +
        drivers.map(d=>`<option value="${d['اسم_مستخدم']}">${d['الاسم']||d['اسم_مستخدم']}</option>`).join('');
      sel.dataset.loaded='1';
    }
  },

  async loadDash() {
    const res = await API.getDashboard();
    if (!res?.ok) return;
    const s=res.stats;
    document.getElementById('statOrders').textContent  =s.total||0;
    document.getElementById('statPending').textContent =s.pending||0;
    document.getElementById('statToday').textContent   =s.today||0;
    document.getElementById('statRevenue').textContent =Number(s.revenue||0).toLocaleString('ar-IQ',{maximumFractionDigits:0});
    document.getElementById('qTires').textContent      =`${s.tires||0} صنف`;
    document.getElementById('qBats').textContent       =`${s.batteries||0} صنف`;

    const el=document.getElementById('recentOrders');
    if(!res.recent?.length){el.innerHTML='<div class="empty-state"><i class="fa-solid fa-inbox"></i><p>لا توجد طلبات</p></div>';return;}
    el.innerHTML=`<table class="catalog-table"><thead><tr>
      <th>رقم الطلب</th><th>الزبون</th><th>التاريخ</th><th>الإجمالي</th><th>الحالة</th><th></th>
    </tr></thead><tbody>${res.recent.map(o=>this.orderRow(o)).join('')}</tbody></table>`;
  },

  orderRow(o) {
    const st=CONFIG.STATUS_STYLE[o['حالة']]||{cls:'pending',icon:'fa-clock'};
    const date=new Date(o['تاريخ']).toLocaleDateString('ar-IQ',{day:'numeric',month:'short'});
    return `<tr>
      <td><span class="order-num">${o['رقم_طلب']}</span></td>
      <td>${o['اسم_عميل']||o['مستخدم']||'—'}</td>
      <td>${date}</td>
      <td class="price-cell">${Number(o['الإجمالي']||0).toLocaleString('ar-IQ',{maximumFractionDigits:0})}</td>
      <td><span class="status-badge ${st.cls}"><i class="fa-solid ${st.icon}"></i> ${o['حالة'].replace(/_/g,' ')}</span></td>
      <td><button class="btn-edit" onclick="Orders.view('${o['رقم_طلب']}')">عرض</button></td>
    </tr>`;
  },

  toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); },
  closeSidebar()  { document.getElementById('sidebar').classList.remove('open'); }
};


/* ══ إدارة الطلبات ═══════════════════════════════════════ */
const Orders = {
  _all:[],

  async load() {
    const el=document.getElementById('ordersTable');
    el.innerHTML='<div class="inline-loader"><i class="fa-solid fa-spinner fa-spin"></i></div>';
    const res=await API.getOrders();
    if(!res?.ok){el.innerHTML='<div class="table-empty"><i class="fa-solid fa-triangle-exclamation"></i><p>خطأ</p></div>';return;}
    this._all=res.orders||[];
    this.render(this._all);
  },

  render(orders) {
    const el=document.getElementById('ordersTable');
    if(!orders.length){el.innerHTML='<div class="table-empty"><i class="fa-solid fa-inbox"></i><p>لا توجد طلبات</p></div>';return;}
    el.innerHTML=`<table class="catalog-table"><thead><tr>
      <th>رقم الطلب</th><th>الزبون</th><th>التاريخ</th><th>الإجمالي</th>
      <th>الحالة</th><th>إجراءات</th><th></th>
    </tr></thead><tbody>${orders.map(o=>this.row(o)).join('')}</tbody></table>
    <div class="catalog-count">إجمالي: <strong>${orders.length}</strong></div>`;
  },

  row(o) {
    const st=CONFIG.STATUS_STYLE[o['حالة']]||{cls:'pending',icon:'fa-clock'};
    const date=new Date(o['تاريخ']).toLocaleDateString('ar-IQ',{day:'numeric',month:'short',year:'numeric'});
    const canUpdate=Auth.isAdmin()||Auth.hasPerm('update_order_status');
    const canAssign=Auth.isAdmin()||Auth.hasPerm('assign_drivers');
    const opts=CONFIG.ORDER_STATUSES.map(s=>`<option value="${s}" ${o['حالة']===s?'selected':''}>${s.replace(/_/g,' ')}</option>`).join('');
    const driverTag=o['سائق']?`<div class="driver-badge"><i class="fa-solid fa-truck"></i> ${o['سائق']}</div>`:'';
    const assignBtn=(canAssign&&o['حالة']==='جاهز')
      ?`<button class="btn-assign-driver" onclick="AssignDriver.open('${o['رقم_طلب']}')"><i class="fa-solid fa-truck-fast"></i> إسناد</button>`
      :'';
    return `<tr>
      <td><span class="order-num">${o['رقم_طلب']}</span>${driverTag}</td>
      <td>${o['اسم_عميل']||'—'}<br><small style="color:#8a9ab0">${o['مستخدم']||''}</small></td>
      <td style="font-size:.82rem">${date}</td>
      <td class="price-cell">${Number(o['الإجمالي']||0).toLocaleString('ar-IQ',{maximumFractionDigits:0})}</td>
      <td><span class="status-badge ${st.cls}"><i class="fa-solid ${st.icon}"></i> ${o['حالة'].replace(/_/g,' ')}</span></td>
      <td>${canUpdate?`<select class="filter-select" style="padding:.28rem .5rem;font-size:.78rem"
            onchange="Orders.changeStatus('${o['رقم_طلب']}',this.value)">${opts}</select>`:''} ${assignBtn}</td>
      <td><button class="btn-edit" onclick="Orders.view('${o['رقم_طلب']}')"><i class="fa-solid fa-eye"></i></button></td>
    </tr>`;
  },

  async changeStatus(num,st) {
    const res=await API.updateOrderStatus(num,st);
    if(!res?.ok){UI.toast(res?.error||'فشل','error');return;}
    UI.toast(`تم التحديث → ${st.replace(/_/g,' ')}`, 'success');
    const idx=this._all.findIndex(o=>o['رقم_طلب']===num);
    if(idx!==-1) this._all[idx]['حالة']=st;
    this.render(this._all);
  },

  search() {
    const q=(document.getElementById('ordersSearch')?.value||'').toLowerCase();
    const st=document.getElementById('ordersStatus')?.value||'';
    this.render(this._all.filter(o=>{
      if(st&&o['حالة']!==st) return false;
      if(q){const hay=[o['رقم_طلب'],o['اسم_عميل'],o['مستخدم']].join(' ').toLowerCase();if(!hay.includes(q)) return false;}
      return true;
    }));
  },

  async view(num) {
    UI.showLoader();
    const res=await API.getOrder(num);
    UI.hideLoader();
    if(!res?.ok){UI.toast(res?.error||'خطأ','error');return;}
    const o=res.order,its=res.items,delivery=res.delivery,returns=res.returns||[];
    const date=new Date(o['تاريخ']).toLocaleDateString('ar-IQ',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'});

    let deliverySection='';
    if(delivery){
      const collected=Number(delivery['مبلغ_مستلم'])||0;
      const expected=Number(delivery['مبلغ_مطلوب'])||0;
      const diff=expected-collected;
      const pinOk=delivery['تم_تأكيد_PIN']===true||delivery['تم_تأكيد_PIN']==='TRUE';
      const retHtml=returns.map(r=>`<div style="font-size:.82rem;color:var(--red);padding:.3rem 0;border-top:1px dashed var(--border)">
        <i class="fa-solid fa-rotate-left"></i> ${r['وصف_بند']} — ناقص ${r['كمية_مرتجعة']} ${r['سبب']?`(${r['سبب']})`:''}
      </div>`).join('');
      deliverySection=`<div style="padding:.75rem;background:#f0f9ff;border-radius:8px;margin-bottom:1rem;border:1px solid #bae6fd">
        <div style="font-weight:800;color:var(--navy);font-size:.88rem;margin-bottom:.5rem">
          <i class="fa-solid fa-truck-fast" style="color:var(--blue)"></i> تفاصيل التسليم — السائق: ${delivery['سائق']||'—'}
        </div>
        <div style="display:flex;gap:1.5rem;flex-wrap:wrap;font-size:.85rem;margin-bottom:.4rem">
          <span>العنوان: <strong>${delivery['عنوان_التسليم']||'—'}</strong></span>
          <span>PIN: ${pinOk?'<strong style="color:var(--green)">✓ مؤكَّد</strong>':'<strong style="color:var(--orange)">غير مؤكَّد</strong>'}</span>
        </div>
        ${delivery['وقت_التسليم']?`<div style="font-size:.85rem;display:flex;gap:1.5rem;flex-wrap:wrap">
          <span>مطلوب: <strong>${nf(expected)}</strong></span>
          <span>مستلم: <strong style="color:var(--green)">${nf(collected)}</strong></span>
          ${diff!==0?`<span style="color:var(--red)">فرق: <strong>${nf(diff)}</strong></span>`:''}
        </div>`:`<div style="font-size:.85rem;color:var(--text-3)">لم يتم التسليم بعد</div>`}
        ${retHtml}
        ${delivery['ملاحظات_سائق']?`<div style="font-size:.82rem;margin-top:.4rem">📝 ${delivery['ملاحظات_سائق']}</div>`:''}
      </div>`;
    }

    document.getElementById('orderModalTitle').textContent=`الطلب ${num}`;
    document.getElementById('orderModalBody').innerHTML=`
      <div style="display:flex;gap:1.5rem;flex-wrap:wrap;margin-bottom:1rem;padding:.75rem;background:#f5f7fa;border-radius:8px">
        <div><strong>الزبون:</strong> ${o['اسم_عميل']||'—'}</div>
        <div><strong>التاريخ:</strong> ${date}</div>
        <div><strong>الحالة:</strong> ${o['حالة']?.replace(/_/g,' ')}</div>
        <div><strong>المستخدم:</strong> ${o['مستخدم']}</div>
        ${o['ملاحظات']?`<div><strong>ملاحظات:</strong> ${o['ملاحظات']}</div>`:''}
      </div>
      ${deliverySection}
      <table class="catalog-table" style="margin-bottom:1rem">
        <thead><tr><th>ت</th><th>المادة</th><th>سعر</th><th>خصم</th><th>صافي</th><th>كمية</th><th>إجمالي</th></tr></thead>
        <tbody>${its.map((it,i)=>`<tr>
          <td style="text-align:center">${i+1}</td>
          <td>${it['وصف']||''}</td>
          <td>${nf(it['سعر_أساسي']||0)}</td>
          <td style="color:#059669">${nf(it['خصم_وحدة']||0)}</td>
          <td class="price-cell">${nf(it['سعر_صافي']||0)}</td>
          <td style="text-align:center">${it['كمية']}</td>
          <td class="price-cell">${nf(it['إجمالي_بند']||0)}</td>
        </tr>`).join('')}</tbody>
      </table>
      <div style="text-align:left;padding:.5rem">
        ${Number(o['إجمالي_خصم'])>0?`<div style="color:#059669">خصم: <strong>− ${nf(o['إجمالي_خصم'])}</strong></div>`:''}
        <div style="font-size:1.1rem">الإجمالي: <strong>${nf(o['الإجمالي'])} ${App._settings.currency||'د.ع'}</strong></div>
      </div>`;
    document.getElementById('orderModal').classList.remove('hidden');
  }
};


/* ══ إدارة المستخدمين والزبائن ═══════════════════════════ */
const Users = {
  _all:[], _role:'customer', _editId:null,

  async load(role='customer') {
    this._role=role;
    const tableId=role==='customer'?'usersTable':'adminUsersTable';
    const el=document.getElementById(tableId); if(!el) return;
    el.innerHTML='<div class="inline-loader"><i class="fa-solid fa-spinner fa-spin"></i></div>';
    const res=await API.getUsers({role}); if(!res?.ok){el.innerHTML='<div class="table-empty"><p>خطأ</p></div>';return;}
    this._all=res.users||[]; this.render(el);
  },

  render(el) {
    if(!this._all.length){el.innerHTML=`<div class="table-empty"><i class="fa-solid fa-users"></i><p>لا يوجد</p></div>`;return;}
    const isCust=this._role==='customer';
    const rows=this._all.map(u=>`<tr>
      <td><strong>${u['اسم_مستخدم']}</strong></td><td>${u['الاسم']||'—'}</td><td>${u['الهاتف']||'—'}</td>
      ${isCust?`<td>${u['مستوى_السعر']==='2'?'سعر 2':'سعر 1'}</td>
        <td style="color:#059669;font-weight:700">${nf(u['خصم_وحدة']||0)} د.ع</td>`
        :`<td>${CONFIG.LEVELS[u['الدور']]||''}</td>`}
      <td><span class="status-badge ${u['نشط']==='TRUE'||u['نشط']===true?'done':'canceled'}">${u['نشط']==='TRUE'||u['نشط']===true?'مفعّل':'معطّل'}</span></td>
      <td style="white-space:nowrap">
        <button class="btn-edit" onclick="Users.openModal('${u['معرف']}')"><i class="fa-solid fa-pen"></i> تعديل</button>
        ${this._role==='accountant'?`<button class="btn-edit" style="background:#e3f2fd;color:#1565c0"
          onclick="Permissions.open('${u['معرف']}','${u['الاسم']||u['اسم_مستخدم']}')">
          <i class="fa-solid fa-shield-halved"></i> صلاحيات</button>`:''}
      </td>
    </tr>`).join('');
    const isCustHead=isCust?'<th>مستوى السعر</th><th>خصم/وحدة</th>':'<th>الدور</th>';
    el.innerHTML=`<table class="catalog-table"><thead><tr>
      <th>اسم المستخدم</th><th>الاسم</th><th>الهاتف</th>${isCustHead}<th>الحالة</th><th>إجراءات</th>
    </tr></thead><tbody>${rows}</tbody></table>
    <div class="catalog-count">إجمالي: <strong>${this._all.length}</strong></div>`;
  },

  openModal(id=null) {
    this._editId=id;
    const u=id?this._all.find(x=>x['معرف']===id)||{}:{};
    const isEdit=!!id; const isCust=this._role==='customer';
    document.getElementById('userModalTitle').textContent=isEdit?'تعديل مستخدم':'إضافة مستخدم';
    document.getElementById('userModalBody').innerHTML=`
      <div class="modal-form-grid">
        <div class="form-field"><label>اسم المستخدم</label><input id="uf_user" value="${u['اسم_مستخدم']||''}" ${isEdit?'readonly':''}></div>
        <div class="form-field"><label>الاسم الكامل</label><input id="uf_name" value="${u['الاسم']||''}"></div>
        <div class="form-field"><label>رقم الهاتف</label><input id="uf_phone" value="${u['الهاتف']||''}"></div>
        <div class="form-field"><label>${isEdit?'كلمة مرور جديدة':'كلمة المرور'}</label>
          <input id="uf_pass" type="password" placeholder="${isEdit?'اتركها فارغة':'كلمة المرور'}"></div>
        ${isCust?`
        <div class="form-field"><label>مستوى السعر</label><select id="uf_price">
          <option value="1" ${u['مستوى_السعر']==='1'?'selected':''}>سعر 1 (جملة)</option>
          <option value="2" ${u['مستوى_السعر']==='2'?'selected':''}>سعر 2 (موزع)</option>
        </select></div>
        <div class="form-field"><label>خصم لكل وحدة (دينار)</label>
          <input id="uf_disc" type="number" min="0" value="${u['خصم_وحدة']||0}"></div>`
        :`<div class="form-field"><label>الدور</label><select id="uf_role">
          <option value="accountant" ${u['الدور']==='accountant'?'selected':''}>محاسب</option>
        </select></div>`}
        <div class="form-field"><label>الحالة</label><select id="uf_active">
          <option value="TRUE"  ${u['نشط']==='TRUE'||u['نشط']===true?'selected':''}>مفعّل</option>
          <option value="FALSE" ${u['نشط']==='FALSE'||u['نشط']===false?'selected':''}>معطّل</option>
        </select></div>
      </div>`;
    document.getElementById('userModal').classList.remove('hidden');
  },

  async save() {
    const isCust=this._role==='customer';
    const data={
      'اسم_مستخدم':document.getElementById('uf_user')?.value,
      'الاسم':document.getElementById('uf_name')?.value,
      'الهاتف':document.getElementById('uf_phone')?.value,
      'الدور':isCust?'customer':(document.getElementById('uf_role')?.value||'accountant'),
      'نشط':document.getElementById('uf_active')?.value
    };
    if(isCust){data['مستوى_السعر']=document.getElementById('uf_price')?.value||'1';
               data['خصم_وحدة']=document.getElementById('uf_disc')?.value||'0';}
    const pass=document.getElementById('uf_pass')?.value;
    if(pass) data[this._editId?'كلمة_مرور_جديدة':'كلمة_مرور']=pass;
    if(this._editId) data['معرف']=this._editId;
    UI.showLoader();
    const res=this._editId?await API.updateUser(data):await API.addUser(data);
    UI.hideLoader();
    if(!res?.ok){UI.toast(res?.error||'فشل','error');return;}
    UI.toast('تم الحفظ','success'); Modal.close('userModal'); this.load(this._role);
  }
};


/* ══ الصلاحيات ════════════════════════════════════════════ */
const Permissions = {
  _userId:null,
  async open(userId,name) {
    this._userId=userId;
    document.getElementById('permModalTitle').textContent=`صلاحيات: ${name}`;
    document.getElementById('permModalBody').innerHTML='<div class="inline-loader"><i class="fa-solid fa-spinner fa-spin"></i></div>';
    document.getElementById('permModal').classList.remove('hidden');
    const res=await API.getPermissions(userId); if(!res?.ok){document.getElementById('permModalBody').innerHTML='<p>خطأ</p>';return;}
    const perms=res.permissions||{}; const all=res.allPerms||Object.keys(CONFIG.PERM_LABELS);
    document.getElementById('permModalBody').innerHTML=`
      <p style="font-size:.82rem;color:#8a9ab0;margin-bottom:1rem"><i class="fa-solid fa-circle-info"></i> فعّل أو أوقف كل صلاحية بشكل مستقل</p>
      <div class="perm-grid">${all.map(perm=>`
        <label class="perm-row">
          <div class="perm-info"><strong>${CONFIG.PERM_LABELS[perm]||perm}</strong><small>${perm}</small></div>
          <div class="toggle-wrap">
            <input type="checkbox" class="toggle-cb" id="perm_${perm}" ${perms[perm]===true?'checked':''}>
            <span class="toggle-sw"></span>
          </div>
        </label>`).join('')}</div>`;
  },
  async save() {
    const newPerms={};
    document.querySelectorAll('.toggle-cb').forEach(cb=>{newPerms[cb.id.replace('perm_','')]=cb.checked;});
    UI.showLoader();
    const res=await API.setPermissions(this._userId,newPerms);
    UI.hideLoader();
    if(!res?.ok){UI.toast(res?.error||'فشل','error');return;}
    UI.toast('تم حفظ الصلاحيات','success'); Modal.close('permModal');
  }
};


/* ══ الإعدادات ════════════════════════════════════════════ */
const AdminSettings = {
  _labels:{store_name:'اسم المتجر',store_phone:'هاتف',store_address:'العنوان',
           currency:'العملة',whatsapp:'واتساب (بدون +)',logo_emoji:'إيموجي'},
  async load() {
    const res=await API.getSettings(); if(!res?.ok) return;
    App._settings=res.settings;
    document.getElementById('settingsGrid').innerHTML=Object.entries(res.settings).map(([k,v])=>`
      <div class="setting-item"><label>${this._labels[k]||k}</label><input id="stg_${k}" value="${v||''}"></div>`).join('');
  },
  async save() {
    const data={};
    document.querySelectorAll('#settingsGrid [id^="stg_"]').forEach(el=>{data[el.id.replace('stg_','')]=el.value;});
    UI.showLoader(); const res=await API.updateSettings(data); UI.hideLoader();
    if(!res?.ok){UI.toast(res?.error||'فشل','error');return;}
    App._settings={...App._settings,...data};
    UI.toast('تم حفظ الإعدادات','success');
    document.getElementById('sidebarStoreName').textContent=data.store_name||'';
    document.getElementById('sidebarEmoji').textContent=data.logo_emoji||'🚗';
    document.title=data.store_name||'';
  }
};


/* ══ منشئ القائمة ═════════════════════════════════════════ */
const Builder = {
  _rows:[], _id:0,
  init() {
    document.getElementById('orderDate').value=new Date().toLocaleDateString('ar-IQ',{year:'numeric',month:'long',day:'numeric'});
    this.render();
  },
  addRow(data={}) {
    this._rows.push({_id:++this._id,name:data.name||'',notes:'',qty:data.qty||1,price:data.price||0});
    this.render();
    setTimeout(()=>document.querySelector(`[data-row="${this._id}"][data-col="name"]`)?.focus(),50);
  },
  updateCell(id,col,val) {
    const r=this._rows.find(r=>r._id===id); if(!r) return;
    r[col]=col==='qty'||col==='price'?Number(val)||0:val; this.calcTotals();
  },
  deleteRow(id) { this._rows=this._rows.filter(r=>r._id!==id); this.render(); },
  newOrder() {
    if(this._rows.length&&!confirm('مسح القائمة الحالية؟')) return;
    this._rows=[]; this._id=0;
    ['orderCustomer','orderNotes'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
    document.getElementById('orderNumber').value='—';
    document.getElementById('discountPct').value='0';
    document.getElementById('discountAmt').value='0';
    this.render();
  },
  render() {
    const tbody=document.getElementById('builderBody');
    const badge=document.getElementById('orderCountBadge');
    if(badge){badge.textContent=this._rows.length;badge.classList.toggle('zero',!this._rows.length);}
    if(!this._rows.length){
      tbody.innerHTML=`<tr><td colspan="7" style="text-align:center;padding:2.5rem;color:#94a3b8">
        <i class="fa-solid fa-file-circle-plus" style="font-size:2rem;display:block;margin-bottom:.5rem;color:#dee4ec"></i>
        اضغط "إضافة صنف" أو اختر من الكتالوج</td></tr>`;
      this.calcTotals(); return;
    }
    tbody.innerHTML=this._rows.map((r,i)=>`<tr data-id="${r._id}">
      <td class="row-num">${i+1}</td>
      <td><input class="cell-input product-input" data-row="${r._id}" data-col="name"
            value="${esc(r.name)}" placeholder="اسم المنتج / القياس"
            oninput="Builder.updateCell(${r._id},'name',this.value)"></td>
      <td><input class="cell-input" data-row="${r._id}" data-col="notes"
            value="${esc(r.notes)}" placeholder="ملاحظات..."
            oninput="Builder.updateCell(${r._id},'notes',this.value)"></td>
      <td><input class="cell-input qty-input" type="number" min="0" data-row="${r._id}" data-col="qty"
            value="${r.qty}" oninput="Builder.updateCell(${r._id},'qty',this.value)"></td>
      <td><input class="cell-input price-input" type="number" min="0" data-row="${r._id}" data-col="price"
            value="${r.price}" oninput="Builder.updateCell(${r._id},'price',this.value)"></td>
      <td><span class="cell-total" id="rt_${r._id}">${nf(r.qty*r.price)}</span></td>
      <td><button class="btn-del-row" onclick="Builder.deleteRow(${r._id})"><i class="fa-solid fa-xmark"></i></button></td>
    </tr>`).join('');
    this.calcTotals();
  },
  calcTotals() {
    let sub=0;
    this._rows.forEach(r=>{const t=r.qty*r.price;sub+=t;const el=document.getElementById('rt_'+r._id);if(el)el.textContent=nf(t);});
    const pct=parseFloat(document.getElementById('discountPct')?.value)||0;
    const amt=parseFloat(document.getElementById('discountAmt')?.value)||0;
    const disc=amt>0?amt:sub*pct/100; const grand=sub-disc;
    const f=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=nf(v);};
    f('totSubtotal',sub); f('totDiscount',disc); f('totGrand',grand);
  },
  async saveOrder() {
    if(!this._rows.length){UI.toast('القائمة فارغة!','error');return;}
    UI.showLoader('جارٍ حفظ الطلب...');
    const pct=parseFloat(document.getElementById('discountPct')?.value)||0;
    const amt=parseFloat(document.getElementById('discountAmt')?.value)||0;
    let sub=this._rows.reduce((s,r)=>s+r.qty*r.price,0);
    const disc=amt>0?amt:sub*pct/100;
    const res=await API.createOrder({
      customerName:document.getElementById('orderCustomer')?.value||'',
      notes:document.getElementById('orderNotes')?.value||'',
      discountPct:pct,discountAmt:disc,
      items:this._rows.map(r=>({type:'TIRES',productId:'',name:r.name,basePrice:r.price,discPerUnit:0,qty:r.qty}))
    });
    UI.hideLoader();
    if(!res?.ok){UI.toast(res?.error||'فشل','error');return;}
    document.getElementById('orderNumber').value=res.orderNum;
    Sound.play('success');
    UI.toast(`✅ تم حفظ الطلب ${res.orderNum}`,'success');
  },
  printOrder() {
    if(!this._rows.length){UI.toast('القائمة فارغة!','error');return;}
    const s=App._settings; let sub=this._rows.reduce((t,r)=>t+r.qty*r.price,0);
    const pct=parseFloat(document.getElementById('discountPct')?.value)||0;
    const amt=parseFloat(document.getElementById('discountAmt')?.value)||0;
    const disc=amt>0?amt:sub*pct/100;
    document.getElementById('printContent').innerHTML=`<div class="print-invoice">
      <div class="inv-header">
        <div><div class="inv-store-name">${s.store_name||'المتجر'}</div>
          <div class="inv-meta"><p>📞 ${s.store_phone||''}</p><p>📍 ${s.store_address||''}</p></div></div>
        <div style="text-align:left">
          <p>رقم القائمة: ${document.getElementById('orderNumber')?.value||'—'}</p>
          <p>التاريخ: ${document.getElementById('orderDate')?.value||''}</p>
          <p>العميل: ${document.getElementById('orderCustomer')?.value||'—'}</p></div>
      </div>
      <table><thead><tr><th>ت</th><th>المادة</th><th>ملاحظات</th><th>العدد</th><th>السعر</th><th>المجموع</th></tr></thead>
      <tbody>${this._rows.map((r,i)=>`<tr><td style="text-align:center">${i+1}</td><td>${r.name}</td><td>${r.notes}</td>
        <td style="text-align:center">${r.qty}</td><td style="text-align:center">${nf(r.price)}</td>
        <td style="text-align:center;font-weight:700">${nf(r.qty*r.price)}</td></tr>`).join('')}</tbody></table>
      <div class="totals">
        <p>المجموع: <strong>${nf(sub)}</strong></p>
        ${disc>0?`<p>الخصم: <strong style="color:red">− ${nf(disc)}</strong></p>`:''}
        <p class="grand-total">الإجمالي: <strong>${nf(sub-disc)} ${s.currency||'دينار عراقي'}</strong></p>
      </div></div>`;
    document.getElementById('printPage').classList.remove('hidden');
    setTimeout(()=>{window.print();document.getElementById('printPage').classList.add('hidden');},200);
  },
  sendWhatsapp() {
    if(!this._rows.length){UI.toast('القائمة فارغة!','error');return;}
    const s=App._settings; let sub=this._rows.reduce((t,r)=>t+r.qty*r.price,0);
    const pct=parseFloat(document.getElementById('discountPct')?.value)||0;
    const amt=parseFloat(document.getElementById('discountAmt')?.value)||0;
    const disc=amt>0?amt:sub*pct/100;
    const lines=this._rows.map((r,i)=>`${i+1}. ${r.name} × ${r.qty} = ${nf(r.qty*r.price)}`).join('\n');
    const msg=encodeURIComponent(`🚗 *${s.store_name||'المتجر'}*\n━━━━━━━━━━━━━━━━\n${lines}\n━━━━━━━━━━━━━━━━\n${disc>0?`الخصم: − ${nf(disc)}\n`:''}✅ *الإجمالي: ${nf(sub-disc)} ${s.currency||'دينار عراقي'}*`);
    window.open(`https://wa.me/${s.whatsapp||''}?text=${msg}`,'_blank');
  }
};


/* ══ أدوات واجهة المستخدم ════════════════════════════════ */
const UI = {
  toast(msg,type='success') {
    const el=document.createElement('div'); el.className='toast '+type;
    const ico={success:'fa-check-circle',error:'fa-triangle-exclamation',info:'fa-circle-info'};
    el.innerHTML=`<i class="fa-solid ${ico[type]||ico.success}"></i> ${msg}`;
    document.getElementById('toastContainer').appendChild(el); setTimeout(()=>el.remove(),3500);
  },
  showLoader(t='جارٍ التحميل...') {
    document.getElementById('loaderText').textContent=t;
    document.getElementById('globalLoader').classList.remove('hidden');
  },
  hideLoader() { document.getElementById('globalLoader').classList.add('hidden'); }
};
const Modal  = { close(id){document.getElementById(id)?.classList.add('hidden');} };
// esc() و nf() معرّفتان في api-auth.js

document.addEventListener('DOMContentLoaded',()=>{App.boot(); Builder.init();});
