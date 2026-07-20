/* ══════════════════════════════════════════════════════════
   realtime.js — Kanban + GPS + صوت + تحديث تلقائي
   يُضاف لموقع الإدارة: admin/js/realtime.js
   ══════════════════════════════════════════════════════════ */

// ═══════════════════════════════════════════════════════════
//  🔊 نظام الصوت
// ═══════════════════════════════════════════════════════════
const Sound = {
  _ctx: null,
  _muted: false,

  init() {
    // تفعيل AudioContext عند أول تفاعل من المستخدم
    document.addEventListener('click', ()=>{
      if (!this._ctx) this._ctx = new (window.AudioContext||window.webkitAudioContext)();
    }, {once:true});

    // استعادة حالة الصوت
    this._muted = localStorage.getItem('sound_muted') === '1';
    this._updateBtn();
  },

  play(type='new_order') {
    if (this._muted || !this._ctx) return;

    const patterns = {
      new_order  : { freqs:[523,659,784,1047],  dur:0.12, vol:0.3 },
      warning    : { freqs:[440,330,440],        dur:0.15, vol:0.35 },
      success    : { freqs:[523,659,784],        dur:0.1,  vol:0.25 },
      prep_ready : { freqs:[784,987,1175],       dur:0.12, vol:0.3 },
      delivery   : { freqs:[659,784,987,1175],   dur:0.1,  vol:0.25 }
    };

    const p = patterns[type] || patterns.new_order;
    p.freqs.forEach((f,i)=>{
      const osc  = this._ctx.createOscillator();
      const gain = this._ctx.createGain();
      osc.connect(gain); gain.connect(this._ctx.destination);
      osc.type = 'sine'; osc.frequency.value = f;
      const t = this._ctx.currentTime + i * (p.dur + 0.03);
      gain.gain.setValueAtTime(p.vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + p.dur);
      osc.start(t); osc.stop(t + p.dur + 0.05);
    });
  },

  toggle() {
    this._muted = !this._muted;
    localStorage.setItem('sound_muted', this._muted?'1':'0');
    this._updateBtn();
  },

  _updateBtn() {
    const btn = document.getElementById('soundToggleBtn');
    if (!btn) return;
    btn.innerHTML = this._muted
      ? '<i class="fa-solid fa-volume-xmark"></i>'
      : '<i class="fa-solid fa-volume-high"></i>';
    btn.title = this._muted ? 'تفعيل الصوت' : 'كتم الصوت';
    btn.style.color = this._muted ? '#94a3b8' : 'var(--accent)';
  }
};


// ═══════════════════════════════════════════════════════════
//  ⟳ التحديث التلقائي كل 10 ثواني
// ═══════════════════════════════════════════════════════════
const Realtime = {
  _timer  : null,
  _lastTs : new Date().toISOString(),
  _running: false,

  start() {
    if (this._running) return;
    this._running = true;
    this._timer = setInterval(()=>this.poll(), 10000);
    this._updateIndicator('نشط', true);
  },

  stop() {
    this._running = false;
    clearInterval(this._timer);
    this._timer = null;
    this._updateIndicator('متوقف', false);
  },

  async poll() {
    this._updateIndicator('⟳ جارٍ...', true);
    try {
      const res = await API.call('getChanges', { since: this._lastTs });
      if (!res?.ok) return;
      this._lastTs = res.serverTime || new Date().toISOString();
      this._processChanges(res);
    } catch(_) {}
    this._updateIndicator('🟢 محدَّث', true);
  },

  _processChanges(res) {
    if (!res.hasChanges) {
      this._updateCounters(res.stats);
      return;
    }

    const changes = res.changes || [];
    let playedSound = false;

    changes.forEach(c => {
      // طلب جديد
      if (c.action === 'create_order' && !playedSound) {
        Sound.play('new_order');
        AdminNotifs._showBannerNotif('🛒 طلب جديد!', c.summary, 'info');
        playedSound = true;
      }
      // اكتمال تجهيز
      if (c.action === 'اكتمال_تجهيز' && !playedSound) {
        Sound.play('prep_ready');
        AdminNotifs._showBannerNotif('📦 جاهز للتسليم', c.summary, 'success');
        playedSound = true;
      }
      // مشكلة تسليم
      if (['shortage','مشكلة_تسليم','diff_amount'].includes(c.action) && !playedSound) {
        Sound.play('warning');
        AdminNotifs._showBannerNotif('⚠ تنبيه', c.summary, 'warn');
        playedSound = true;
      }
      // تسليم مكتمل
      if (c.action === 'submit_delivery' && !playedSound) {
        Sound.play('delivery');
        playedSound = true;
      }
    });

    // تحديث الواجهة إذا كانت مفتوحة
    this._updateCounters(res.stats);
    if (document.getElementById('view-dashboard')?.classList.contains('active')) {
      App.loadDash();
    }
    if (document.getElementById('view-kanban')?.classList.contains('active')) {
      KanbanBoard.load();
    }
    if (document.getElementById('view-orders')?.classList.contains('active')) {
      Orders.load();
    }
    // تحديث جرس الإشعارات
    AdminNotifs.poll();
  },

  _updateCounters(stats) {
    if (!stats) return;
    const el = document.getElementById('realtimePendingBadge');
    const cnt = stats['معلق']||0;
    if (el) { el.textContent=cnt; el.classList.toggle('hidden',cnt===0); }
  },

  _updateIndicator(text, active) {
    const el = document.getElementById('realtimeIndicator');
    if (!el) return;
    el.textContent  = text;
    el.className    = 'rt-indicator' + (active?' active':'');
  }
};


// ═══════════════════════════════════════════════════════════
//  📋 لوحة Kanban
// ═══════════════════════════════════════════════════════════
const KanbanBoard = {
  _data: null,

  async load() {
    const wrap = document.getElementById('kanbanWrap');
    if (!wrap) return;
    wrap.innerHTML = '<div style="padding:3rem;text-align:center;color:var(--text-3)"><i class="fa-solid fa-spinner fa-spin" style="font-size:1.5rem"></i></div>';

    const res = await API.call('getKanbanData');
    if (!res?.ok) { wrap.innerHTML='<div class="table-empty"><p>خطأ</p></div>'; return; }
    this._data = res;
    this.render(res);
  },

  render(data) {
    const wrap = document.getElementById('kanbanWrap');
    const cols = [
      { key:'معلق',          label:'طلبات جديدة',   icon:'fa-inbox',         color:'#1565c0', action:'confirm'   },
      { key:'مؤكد',          label:'للتجهيز',        icon:'fa-check-circle',  color:'#7b1fa2', action:'send_prep'  },
      { key:'قيد_التجهيز',   label:'يُجهَّز الآن',  icon:'fa-boxes-packing', color:'#e65100', action:null         },
      { key:'جاهز',          label:'جاهز للإسناد',  icon:'fa-box-open',      color:'#2e7d32', action:'assign'     },
      { key:'خرج_للتوزيع',   label:'في الطريق',     icon:'fa-truck-fast',    color:'#00838f', action:null         },
      { key:'مُسلَّم',        label:'تم التسليم',    icon:'fa-flag-checkered',color:'#388e3c', action:null         },
      { key:'مشكلة_تسليم',   label:'تنبيهات',       icon:'fa-triangle-exclamation',color:'#c62828', action:null   }
    ];

    const isAdmin = Auth.isAdmin();

    wrap.innerHTML = `
      <div class="kanban-board" id="kanbanBoard">
        ${cols.map(col=>{
          const cards = data.columns[col.key] || [];
          return `
            <div class="kb-column">
              <div class="kb-col-header" style="border-top:3px solid ${col.color}">
                <div class="kb-col-title">
                  <i class="fa-solid ${col.icon}" style="color:${col.color}"></i>
                  ${col.label}
                </div>
                <span class="kb-col-count" style="background:${col.color}">${cards.length}</span>
              </div>
              <div class="kb-col-body" id="kbc_${col.key.replace(/[^a-z]/gi,'_')}">
                ${cards.length === 0
                  ? `<div class="kb-empty"><i class="fa-solid fa-inbox"></i></div>`
                  : cards.map(c=>this.cardHtml(c, col, isAdmin)).join('')
                }
              </div>
            </div>`;
        }).join('')}
      </div>`;

    // تحديث إحصائيات السريعة
    if (data.summary) {
      const s = data.summary;
      const el = id => document.getElementById(id);
      if(el('statOrders'))  el('statOrders').textContent  = s.total||0;
      if(el('statPending')) el('statPending').textContent = s.pending||0;
      if(el('statToday'))   el('statToday').textContent   = s.todayOrders||0;
      if(el('statRevenue')) el('statRevenue').textContent = nf(s.todayRevenue||0);
    }
  },

  cardHtml(c, col, isAdmin) {
    const age     = c.ageMin||0;
    const ageText = age<60 ? age+'د' : Math.round(age/60)+'س';
    const urgent  = age>=30 && ['معلق','مؤكد','قيد_التجهيز'].includes(c.status);
    const amtK    = c.total>=1000 ? (c.total/1000).toFixed(0)+'K' : c.total;

    let actionBtn = '';
    if (isAdmin) {
      if (col.action === 'confirm') {
        actionBtn = `<button class="kb-action-btn blue" onclick="KanbanBoard.confirmOrder('${c.orderNum}')">
          <i class="fa-solid fa-check"></i> تأكيد
        </button>`;
      } else if (col.action === 'send_prep') {
        actionBtn = `<button class="kb-action-btn purple" onclick="KanbanBoard.sendToPrep('${c.orderNum}')">
          <i class="fa-solid fa-boxes-packing"></i> للتجهيز
        </button>`;
      } else if (col.action === 'assign') {
        actionBtn = `<button class="kb-action-btn green" onclick="AssignDriver.open('${c.orderNum}')">
          <i class="fa-solid fa-truck-fast"></i> إسناد سائق
        </button>`;
      }
    }

    return `
      <div class="kb-card ${urgent?'urgent':''}" onclick="event.target.closest('.kb-action-btn')||Orders.view('${c.orderNum}')">
        <div class="kb-card-top">
          <span class="kb-card-num">${c.orderNum}</span>
          <span class="kb-card-age ${urgent?'urgent':''}">${ageText}</span>
        </div>
        <div class="kb-card-customer">${esc(c.customer)}</div>
        <div class="kb-card-meta">
          <span class="kb-card-amount">${amtK} د.ع</span>
          <span class="kb-card-items">${c.itemCount} صنف</span>
        </div>
        ${c.driver ? `<div class="kb-card-driver"><i class="fa-solid fa-truck"></i> ${c.driver}</div>` : ''}
        ${c.prepWorker ? `<div class="kb-card-prep"><i class="fa-solid fa-person-digging"></i> ${c.prepWorker}</div>` : ''}
        ${actionBtn ? `<div class="kb-card-actions">${actionBtn}</div>` : ''}
      </div>`;
  },

  async confirmOrder(orderNum) {
    if (!confirm(`تأكيد الطلب ${orderNum}؟`)) return;
    const res = await API.updateOrderStatus(orderNum, 'مؤكد');
    if (!res?.ok) { UI.toast(res?.error||'فشل','error'); return; }
    UI.toast('تم التأكيد', 'success');
    Sound.play('success');
    this.load();
  },

  async sendToPrep(orderNum) {
    if (!confirm(`إرسال الطلب ${orderNum} للتجهيز؟`)) return;
    const res = await API.updateOrderStatus(orderNum, 'قيد_التجهيز');
    if (!res?.ok) { UI.toast(res?.error||'فشل','error'); return; }
    UI.toast('تم إرسال للتجهيز', 'success');
    this.load();
  }
};


// ═══════════════════════════════════════════════════════════
//  🗺️ خريطة GPS للسائقين (Leaflet + OpenStreetMap)
// ═══════════════════════════════════════════════════════════
const GPSMap = {
  _map        : null,
  _markers    : {},
  _routes     : {},
  _loaded     : false,
  _refreshTimer: null,

  async open() {
    document.getElementById('gpsMapModal').classList.remove('hidden');
    if (!this._loaded) {
      await this._initMap();
      this._loaded = true;
    }
    await this.refresh();
    this._refreshTimer = setInterval(()=>this.refresh(), 15000);
  },

  close() {
    document.getElementById('gpsMapModal').classList.add('hidden');
    clearInterval(this._refreshTimer);
  },

  async _initMap() {
    // تحميل Leaflet ديناميكياً
    if (!window.L) {
      await new Promise(res=>{
        const link = document.createElement('link');
        link.rel='stylesheet';
        link.href='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
        document.head.appendChild(link);
        const script = document.createElement('script');
        script.src='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
        script.onload = res;
        document.head.appendChild(script);
      });
    }

    // مركز الخريطة: النجف الأشرف
    this._map = L.map('leafletMap').setView([31.9900, 44.3300], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:'© OpenStreetMap',
      maxZoom:18
    }).addTo(this._map);
  },

  async refresh() {
    const res = await API.call('getDriversGPS');
    if (!res?.ok) return;

    const drivers = res.drivers || [];
    const orders  = res.orders  || [];

    // تحديث مؤشر عدد السائقين
    const el = document.getElementById('gpsActiveCount');
    if (el) el.textContent = `${drivers.length} سائق نشط`;

    // أيقونات الألوان
    const driverIcon = L.divIcon({
      html     : `<div class="gps-driver-marker"><i class="fa-solid fa-truck-fast"></i></div>`,
      className: '',
      iconSize : [40,40], iconAnchor:[20,20]
    });

    // تحديث مواقع السائقين
    drivers.forEach(d=>{
      const lat  = parseFloat(d.lat);
      const lng  = parseFloat(d.lng);
      if (!lat||!lng) return;

      const popup = `
        <div style="direction:rtl;text-align:right;min-width:160px">
          <strong>${esc(d._name||d.سائق)}</strong><br>
          <small style="color:#666">آخر تحديث: ${new Date(d.timestamp).toLocaleTimeString('ar-IQ')}</small>
          ${d.رقم_طلب?`<br><small>الطلب: ${d.رقم_طلب}</small>`:''}
        </div>`;

      if (this._markers[d.سائق]) {
        this._markers[d.سائق].setLatLng([lat,lng]).setPopupContent(popup);
      } else {
        this._markers[d.سائق] = L.marker([lat,lng], {icon:driverIcon})
          .addTo(this._map).bindPopup(popup);
      }
    });

    // مواقع الزبائن (إن كانت المواقع متوفرة)
    // نستخدم geocoding خفيف أو نعرض فقط اسم الزبون
    orders.forEach(o=>{
      const key = 'order_'+o.orderNum;
      if (this._markers[key]) return; // لا نكررها
      // نعرض بطاقة الزبون في لوحة المعلومات الجانبية بدلاً من الخريطة
    });

    // تحديث القائمة الجانبية
    this._renderSidePanel(drivers, orders);
  },

  _renderSidePanel(drivers, orders) {
    const el = document.getElementById('gpsSidePanel');
    if (!el) return;

    if (!drivers.length) {
      el.innerHTML = `<div style="padding:1.5rem;text-align:center;color:#94a3b8">
        <i class="fa-solid fa-truck-slash" style="font-size:2rem;display:block;margin-bottom:.5rem"></i>
        لا يوجد سائقون نشطون حالياً
      </div>`;
      return;
    }

    el.innerHTML = drivers.map(d=>{
      const driverOrders = orders.filter(o=>o.driver===d.سائق);
      const lastSeen = new Date(d.timestamp);
      const minAgo   = Math.round((Date.now()-lastSeen.getTime())/60000);
      return `
        <div class="gps-driver-card" onclick="GPSMap.centerDriver('${d.سائق}')">
          <div class="gdc-top">
            <div class="gdc-avatar">${(d._name||d.سائق).charAt(0)}</div>
            <div>
              <div class="gdc-name">${esc(d._name||d.سائق)}</div>
              <div class="gdc-time">${minAgo===0?'الآن':minAgo+'د منذ'}</div>
            </div>
            <span class="gdc-badge">${driverOrders.length} طلب</span>
          </div>
          ${driverOrders.map(o=>`
            <div class="gdc-order">
              <span class="gdc-order-num">${o.orderNum}</span>
              <span>${esc(o.customer)}</span>
              <span class="gdc-order-status ${o.status==='مُسلَّم'?'done':'onway'}">${o.status.replace(/_/g,' ')}</span>
            </div>`).join('')}
        </div>`;
    }).join('');
  },

  centerDriver(username) {
    const m = this._markers[username];
    if (m && this._map) {
      this._map.setView(m.getLatLng(), 15);
      m.openPopup();
    }
  }
};


// ═══════════════════════════════════════════════════════════
//  CSS للـ Kanban والـ GPS (يُحقن في الصفحة)
// ═══════════════════════════════════════════════════════════
(function injectStyles(){
  const s = document.createElement('style');
  s.textContent = `
/* ─── Kanban Board ─────────────────────────────────────── */
.kanban-board{
  display:flex;gap:.85rem;overflow-x:auto;
  padding:.5rem .25rem 1rem;min-height:calc(100vh - 220px);
}
.kanban-board::-webkit-scrollbar{height:5px;}
.kanban-board::-webkit-scrollbar-thumb{background:var(--border);border-radius:99px;}

.kb-column{
  min-width:230px;max-width:230px;flex-shrink:0;
  display:flex;flex-direction:column;gap:.5rem;
}
.kb-col-header{
  background:var(--surface);border-radius:var(--radius-sm);
  padding:.7rem .9rem;display:flex;align-items:center;
  justify-content:space-between;box-shadow:var(--shadow-sm);
  border:1px solid var(--border-light);
}
.kb-col-title{
  font-size:.82rem;font-weight:800;color:var(--text);
  display:flex;align-items:center;gap:.35rem;
}
.kb-col-title i{font-size:.85rem;}
.kb-col-count{
  font-size:.7rem;font-weight:900;color:#fff;
  padding:.15rem .5rem;border-radius:99px;min-width:1.4rem;text-align:center;
}
.kb-col-body{
  display:flex;flex-direction:column;gap:.5rem;
  overflow-y:auto;max-height:calc(100vh - 260px);
  padding-bottom:.5rem;
}
.kb-col-body::-webkit-scrollbar{width:3px;}
.kb-col-body::-webkit-scrollbar-thumb{background:var(--border);border-radius:99px;}

.kb-card{
  background:var(--surface);border-radius:var(--radius-sm);
  border:1.5px solid var(--border-light);padding:.75rem;
  box-shadow:var(--shadow-sm);cursor:pointer;transition:.15s;
}
.kb-card:hover{box-shadow:var(--shadow);transform:translateY(-1px);}
.kb-card.urgent{border-color:#fbbf24;background:#fffbeb;}
.kb-card-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:.3rem;}
.kb-card-num{font-size:.8rem;font-weight:900;color:var(--navy);font-family:monospace;}
.kb-card-age{font-size:.68rem;color:var(--text-3);font-weight:600;}
.kb-card-age.urgent{color:var(--orange);font-weight:800;}
.kb-card-customer{font-size:.82rem;font-weight:700;color:var(--text);margin-bottom:.3rem;}
.kb-card-meta{display:flex;justify-content:space-between;align-items:center;margin-bottom:.35rem;}
.kb-card-amount{font-size:.82rem;font-weight:900;color:var(--blue);}
.kb-card-items{font-size:.7rem;color:var(--text-3);}
.kb-card-driver,.kb-card-prep{font-size:.72rem;color:var(--text-3);
  display:flex;align-items:center;gap:.3rem;margin-top:.2rem;}
.kb-card-driver i{color:var(--orange);}
.kb-card-prep   i{color:var(--purple);}
.kb-card-actions{margin-top:.5rem;border-top:1px solid var(--border-light);padding-top:.5rem;}
.kb-action-btn{
  width:100%;padding:.4rem;border-radius:4px;font-size:.78rem;
  font-weight:800;font-family:var(--font);transition:.15s;
  display:flex;align-items:center;justify-content:center;gap:.3rem;
}
.kb-action-btn.blue  {background:#e3f2fd;color:#1565c0;}
.kb-action-btn.blue:hover{background:#bbdefb;}
.kb-action-btn.purple{background:#f3e5f5;color:#6a1b9a;}
.kb-action-btn.purple:hover{background:#e1bee7;}
.kb-action-btn.green {background:#e8f5e9;color:#2e7d32;}
.kb-action-btn.green:hover{background:#c8e6c9;}
.kb-empty{text-align:center;padding:1.5rem;color:var(--text-3);}
.kb-empty i{font-size:1.5rem;}

/* ─── GPS Map Modal ─────────────────────────────────────── */
#gpsMapModal{
  position:fixed;inset:0;z-index:2000;
  display:flex;flex-direction:column;background:#fff;
}
#gpsMapModal.hidden{display:none!important;}
.gps-modal-header{
  display:flex;align-items:center;justify-content:space-between;
  padding:.85rem 1.25rem;background:var(--navy);color:#fff;
  flex-shrink:0;
}
.gps-modal-header h3{font-size:1rem;font-weight:800;}
.gps-close-btn{
  background:rgba(255,255,255,.12);color:#fff;width:36px;height:36px;
  border-radius:50%;display:flex;align-items:center;justify-content:center;
  font-size:.9rem;transition:.2s;cursor:pointer;border:none;
}
.gps-close-btn:hover{background:var(--red);}
.gps-modal-body{display:flex;flex:1;overflow:hidden;}
#leafletMap{flex:1;z-index:1;}
#gpsSidePanel{
  width:280px;overflow-y:auto;border-right:1px solid var(--border);
  background:var(--bg);flex-shrink:0;
}
#gpsSidePanel::-webkit-scrollbar{width:4px;}
#gpsSidePanel::-webkit-scrollbar-thumb{background:var(--border);}
.gps-active-bar{
  padding:.6rem 1.25rem;background:var(--navy-mid);color:#fff;
  font-size:.78rem;font-weight:700;
  display:flex;align-items:center;gap:.5rem;flex-shrink:0;
}
.gps-refresh-btn{
  margin-right:auto;background:rgba(255,255,255,.12);color:#fff;
  border:none;border-radius:4px;padding:.3rem .65rem;
  font-size:.75rem;font-weight:700;font-family:var(--font);cursor:pointer;
}
.gps-refresh-btn:hover{background:rgba(255,255,255,.2);}

/* ─── GPS Driver Icon ───────────────────────────────────── */
.gps-driver-marker{
  width:40px;height:40px;background:var(--accent);border-radius:50%;
  display:flex;align-items:center;justify-content:center;color:#fff;
  font-size:.9rem;border:3px solid #fff;
  box-shadow:0 2px 8px rgba(0,0,0,.3);
}

/* ─── GPS Side Panel ────────────────────────────────────── */
.gps-driver-card{
  padding:.85rem 1rem;border-bottom:1px solid var(--border);
  cursor:pointer;transition:.15s;
}
.gps-driver-card:hover{background:#fff;}
.gdc-top{display:flex;align-items:center;gap:.65rem;margin-bottom:.5rem;}
.gdc-avatar{
  width:36px;height:36px;background:var(--accent);border-radius:50%;
  display:flex;align-items:center;justify-content:center;
  color:#fff;font-size:.85rem;font-weight:800;flex-shrink:0;
}
.gdc-name{font-size:.88rem;font-weight:800;color:var(--text);}
.gdc-time{font-size:.7rem;color:var(--text-3);}
.gdc-badge{
  margin-right:auto;background:var(--navy);color:#fff;
  font-size:.7rem;font-weight:800;padding:.15rem .5rem;border-radius:99px;
}
.gdc-order{
  display:flex;align-items:center;gap:.4rem;padding:.3rem 0;
  border-top:1px dashed var(--border);font-size:.75rem;
}
.gdc-order-num{font-weight:800;font-family:monospace;color:var(--navy);}
.gdc-order-status{margin-right:auto;font-size:.68rem;font-weight:800;
  padding:.1rem .4rem;border-radius:99px;}
.gdc-order-status.done {background:var(--success-bg);color:var(--green);}
.gdc-order-status.onway{background:var(--warn-bg);color:var(--orange);}

/* ─── مؤشر الاتصال + زر الصوت ─────────────────────────── */
.rt-indicator{
  font-size:.72rem;font-weight:700;color:var(--text-3);
  padding:.2rem .55rem;border-radius:99px;background:var(--bg);
}
.rt-indicator.active{color:var(--green);}
#soundToggleBtn{
  background:none;border:none;cursor:pointer;padding:.35rem;
  border-radius:var(--radius-sm);font-size:1rem;transition:.2s;
}
#soundToggleBtn:hover{background:var(--bg);}

/* ─── الـ Kanban في الصفحة ───────────────────────────────── */
#view-kanban .page-header{margin-bottom:1rem;}
.kanban-bar{
  display:flex;align-items:center;gap:.75rem;
  margin-bottom:.75rem;flex-wrap:wrap;
}
.kanban-summary-pills{display:flex;gap:.5rem;flex-wrap:wrap;}
.ks-pill{
  padding:.3rem .85rem;border-radius:99px;font-size:.78rem;font-weight:700;
  border:1.5px solid transparent;cursor:default;
}
.ks-pill.blue  {background:#e3f2fd;color:#1565c0;border-color:#90caf9;}
.ks-pill.orange{background:var(--warn-bg);color:var(--orange);}
.ks-pill.green {background:var(--success-bg);color:var(--green);}
.ks-pill.red   {background:var(--danger-bg);color:var(--red);}

/* ─── Mobile Kanban ────────────────────────────────────── */
@media(max-width:768px){
  .kanban-board{flex-direction:column;}
  .kb-column{min-width:auto;max-width:none;}
  .kb-col-body{max-height:none;}
  #gpsSidePanel{display:none;}
}
`;
  document.head.appendChild(s);
})();
