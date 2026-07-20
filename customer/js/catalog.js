/* ══════════════════════════════════════════
   js/catalog.js — كتالوج + بحث ذكي
   ══════════════════════════════════════════ */
const CCatalog = {
  _tires   : [],
  _batteries: [],
  _filter  : '',    // '' | 'PCR' | 'TBR' | 'بطاريات'
  _search  : '',
  _loaded  : false,

  // ── تحميل كل المنتجات ──────────────────────────────
  async load() {
    document.getElementById('catalogList').innerHTML =
      `<div style="text-align:center;padding:3rem;color:#94a3b8">
         <i class="fa-solid fa-spinner fa-spin" style="font-size:2rem;display:block;margin-bottom:.75rem"></i>
         جارٍ تحميل الكتالوج...
       </div>`;

    const [tRes, bRes] = await Promise.all([
      CAPI.getProducts({ type:'TIRES' }),
      CAPI.getProducts({ type:'BATTERIES' })
    ]);

    this._tires     = tRes?.products  || [];
    this._batteries = bRes?.products  || [];
    this._loaded    = true;
    this.render();
  },

  // ── بحث ذكي متعدد الرموز ───────────────────────────
  smartFilter(list) {
    const q = this._search.trim().toLowerCase();
    if (!q) return list;
    const tokens = q.split(/\s+/).filter(Boolean);
    return list.filter(p => {
      const hay = Object.values(p).join(' ').toLowerCase();
      return tokens.every(t => hay.includes(t));
    });
  },

  search() {
    const val = document.getElementById('searchInput').value;
    this._search = val;
    document.getElementById('clearSearch').classList.toggle('hidden', !val);
    this.render();
  },

  clearSearch() {
    document.getElementById('searchInput').value = '';
    this._search = '';
    document.getElementById('clearSearch').classList.add('hidden');
    this.render();
  },

  setType(btn, type) {
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    this._filter = type;
    this.render();
  },

  // ── رسم المنتجات ────────────────────────────────────
  render() {
    if (!this._loaded) return;
    const disc = CAuth.getDiscount();

    let tiresFiltered = this.smartFilter(this._tires);
    let batsFiltered  = this.smartFilter(this._batteries);

    // فلتر النوع
    if (this._filter === 'PCR')       tiresFiltered = tiresFiltered.filter(p => String(p['نوع']||'').startsWith('PCR'));
    else if (this._filter === 'TBR')  tiresFiltered = tiresFiltered.filter(p => String(p['نوع']||'').startsWith('TBR'));
    else if (this._filter === 'بطاريات') { tiresFiltered = []; }

    if (this._filter !== '' && this._filter !== 'بطاريات') batsFiltered = [];

    const total = tiresFiltered.length + batsFiltered.length;
    const list  = document.getElementById('catalogList');

    if (!total) {
      list.innerHTML = `
        <div class="no-results">
          <i class="fa-solid fa-magnifying-glass"></i>
          <p>لا توجد نتائج لـ "<strong>${this._search}</strong>"</p>
          <p style="margin-top:.35rem;font-size:.78rem">جرّب كلمات أخرى أو أقل تفصيلاً</p>
        </div>`;
      return;
    }

    let html = '';

    if (tiresFiltered.length) {
      const label = this._filter==='PCR' ? 'إطارات PCR' :
                    this._filter==='TBR' ? 'إطارات TBR' : 'الإطارات';
      html += `<div class="cat-section"><div class="cat-section-title">
        <i class="fa-solid fa-circle-dot" style="color:#1d4ed8"></i> ${label} — ${tiresFiltered.length} صنف
      </div></div>`;
      html += tiresFiltered.map(p => this.tirCard(p, disc)).join('');
    }

    if (batsFiltered.length) {
      html += `<div class="cat-section" style="margin-top:.75rem"><div class="cat-section-title">
        <i class="fa-solid fa-battery-full" style="color:#7c3aed"></i> بطاريات — ${batsFiltered.length} صنف
      </div></div>`;
      html += batsFiltered.map(p => this.batCard(p, disc)).join('');
    }

    if (this._search) {
      html = `<div class="search-results-count">
        <i class="fa-solid fa-list"></i> ${total} نتيجة لـ "${this._search}"
      </div>` + html;
    }

    list.innerHTML = html;
    this.restoreQty();
  },

  // ── بطاقة الإطار ─────────────────────────────────────
  tirCard(p, disc) {
    const id     = p['معرف'];
    const price  = Number(p['سعر_للعميل']) || 0;
    const stock  = Number(p['مخزون'])       || 0;
    const inCart = CCart.getQty(id);
    const {cls, label} = stockInfo(stock);
    return `
      <div class="product-card" id="card_${id}">
        <div>
          <div class="pc-size">${esc(p['قياس']||'')}</div>
          <div class="pc-brand">${esc(p['ماركة']||'')}</div>
          <div class="pc-meta">${esc(p['نوع']||'')} ${p['ملاحظات']?'· '+esc(p['ملاحظات']):''}</div>
        </div>
        <div class="pc-price-block">
          <div class="pc-price">${numFmt(price)}</div>
          <div class="pc-unit">د.ع / حبة</div>
        </div>
        <div class="pc-stock">
          <span class="stock-dot ${cls}"></span>
          <span class="stock-label ${cls}">${label}: ${stock}</span>
        </div>
        <div class="pc-actions">
          <div class="qty-ctrl" id="qctrl_${id}">
            <button class="qty-btn" onclick="CCatalog.decQty('${id}')" ${inCart<=0?'disabled':''}>−</button>
            <span class="qty-val" id="qval_${id}">${inCart}</span>
            <button class="qty-btn" onclick="CCatalog.incQty('${id}',${stock})">+</button>
          </div>
          <button class="btn-add-cart ${inCart>0?'in-cart':''}" id="addBtn_${id}"
                  onclick="CCatalog.addOne('${id}',${stock},'${esc(p['قياس']||'')}','${esc(p['ماركة']||'')}',${price},${Number(p['سعر_أساسي'])||price},${disc})">
            <i class="fa-solid ${inCart>0?'fa-check':'fa-plus'}"></i>
          </button>
        </div>
      </div>`;
  },

  // ── بطاقة البطارية ───────────────────────────────────
  batCard(p, disc) {
    const id     = p['معرف'];
    const price  = Number(p['سعر_للعميل']) || 0;
    const stock  = Number(p['مخزون'])       || 0;
    const inCart = CCart.getQty(id);
    const {cls, label} = stockInfo(stock);
    return `
      <div class="product-card bat-card" id="card_${id}">
        <div>
          <div class="pc-brand">
            ${esc(p['ماركة']||'')}
            <span class="bat-amp">${p['أمبير']} Ah</span>
            <span class="bat-pole">${p['قطب']||''}</span>
          </div>
          <div class="pc-meta">${p['ملاحظات']||''}</div>
        </div>
        <div class="pc-price-block">
          <div class="pc-price">${numFmt(price)}</div>
          <div class="pc-unit">د.ع / حبة</div>
        </div>
        <div class="pc-stock">
          <span class="stock-dot ${cls}"></span>
          <span class="stock-label ${cls}">${label}: ${stock}</span>
        </div>
        <div class="pc-actions">
          <div class="qty-ctrl" id="qctrl_${id}">
            <button class="qty-btn" onclick="CCatalog.decQty('${id}')" ${inCart<=0?'disabled':''}>−</button>
            <span class="qty-val" id="qval_${id}">${inCart}</span>
            <button class="qty-btn" onclick="CCatalog.incQty('${id}',${stock})">+</button>
          </div>
          <button class="btn-add-cart ${inCart>0?'in-cart':''}" id="addBtn_${id}"
                  onclick="CCatalog.addOne('${id}',${stock},'${esc(p['ماركة']||'')} ${p['أمبير']}Ah','BAT',${price},${Number(p['سعر_أساسي'])||price},${disc})">
            <i class="fa-solid ${inCart>0?'fa-check':'fa-plus'}"></i>
          </button>
        </div>
      </div>`;
  },

  // ── إجراءات الكمية ───────────────────────────────────
  addOne(id, stock, name, type, netPrice, basePrice, disc) {
    if (stock <= 0) { CUI.toast('هذا الصنف نفد من المخزون', 'error'); return; }
    CCart.add({ id, name, type, netPrice, basePrice, disc, qty:1, stock });
    this.updateCardUI(id, CCart.getQty(id));
    CUI.toast(`تمت إضافة ${name}`, 'success');
  },
  incQty(id, stock) {
    const cur = CCart.getQty(id);
    if (cur >= stock) { CUI.toast('وصلت للحد الأقصى المتوفر', 'error'); return; }
    CCart.setQty(id, cur + 1);
    this.updateCardUI(id, cur + 1);
  },
  decQty(id) {
    const cur = CCart.getQty(id);
    if (cur <= 0) return;
    CCart.setQty(id, cur - 1);
    this.updateCardUI(id, cur - 1);
  },
  updateCardUI(id, qty) {
    const qv  = document.getElementById('qval_' + id);
    const btn = document.getElementById('addBtn_' + id);
    const dBtn = document.querySelector(`#qctrl_${id} .qty-btn`);
    if (qv)  qv.textContent = qty;
    if (btn) {
      btn.className = 'btn-add-cart' + (qty > 0 ? ' in-cart' : '');
      btn.querySelector('i').className = 'fa-solid ' + (qty > 0 ? 'fa-check' : 'fa-plus');
    }
    if (dBtn) dBtn.disabled = qty <= 0;
  },
  // استعادة الكميات بعد إعادة الرسم
  restoreQty() {
    CCart._items.forEach(it => {
      const qv  = document.getElementById('qval_' + it.id);
      const btn = document.getElementById('addBtn_' + it.id);
      const dBtn = document.querySelector(`#qctrl_${it.id} .qty-btn`);
      if (qv)  qv.textContent = it.qty;
      if (btn) { btn.className='btn-add-cart in-cart'; btn.querySelector('i').className='fa-solid fa-check'; }
      if (dBtn) dBtn.disabled = false;
    });
  }
};

// دوال مساعدة
function stockInfo(n) {
  if (n <= 0)  return { cls:'out', label:'نفد' };
  if (n <= 10) return { cls:'low', label:'محدود' };
  return { cls:'in', label:'متوفر' };
}
function numFmt(n) {
  return Number(n||0).toLocaleString('ar-IQ', { maximumFractionDigits:0 });
}
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
