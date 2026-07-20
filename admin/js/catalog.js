/* ══════════════════════════════════════════════════════════
   catalog.js v2 — إطارات موحدة + بطاريات + بحث ذكي
   ══════════════════════════════════════════════════════════ */
const Catalog = {
  _cache  : { TIRES:null, BATTERIES:null },
  _type   : 'TIRES',
  _search : '',
  _subType: '',

  async load(type='TIRES') {
    this._type = type;
    const tableId = type==='BATTERIES' ? 'batTable' : 'tirTable';
    const tableEl = document.getElementById(tableId);
    tableEl.innerHTML = `<div class="inline-loader"><i class="fa-solid fa-spinner fa-spin"></i> جارٍ التحميل...</div>`;

    this._cache[type] = null;
    const res = await API.getProducts(type);
    if (!res?.ok) { tableEl.innerHTML = `<div class="table-empty"><i class="fa-solid fa-triangle-exclamation"></i><p>خطأ</p></div>`; return; }
    this._cache[type] = res;

    this.renderFilters(type, res);
    this.render(type);
  },

  // ── بناء شريط الفلاتر ─────────────────────────────────
  renderFilters(type, data) {
    const fId = type==='BATTERIES' ? 'batFilters' : 'tirFilters';
    const fEl = document.getElementById(fId);
    const brands = (data.brands||[]).map(b=>`<option value="${b}">${b}</option>`).join('');

    let extra = '';
    if (type==='TIRES') {
      const types = (data.types||[]).map(t=>`<option value="${t}">${t}</option>`).join('');
      extra = `<select class="filter-select" id="fSubType" onchange="Catalog.applyFilter()">
        <option value="">PCR + TBR</option>
        <option value="PCR">PCR فقط</option>
        <option value="TBR">TBR فقط</option>
      </select>`;
    }

    fEl.innerHTML = `
      <input class="filter-input" id="fSearch_${type}" placeholder="بحث ذكي: 205 16 ميشلان ..."
             oninput="Catalog.onSearch('${type}')">
      <select class="filter-select" id="fBrand_${type}" onchange="Catalog.applyFilter()">
        <option value="">كل الماركات</option>${brands}
      </select>
      ${extra}
      <button class="filter-toggle" id="fAvail_${type}" onclick="Catalog.toggleAvail()">متوفر فقط</button>
      <button class="btn-filter-clear" onclick="Catalog.clearFilter()">
        <i class="fa-solid fa-xmark"></i> مسح
      </button>`;
  },

  onSearch(type) {
    this._search = document.getElementById(`fSearch_${type}`)?.value || '';
    this.applyFilter();
  },

  applyFilter() {
    if (this._cache[this._type]) this.render(this._type);
  },

  toggleAvail() {
    const btn = document.getElementById(`fAvail_${this._type}`);
    if (btn) btn.classList.toggle('on');
    this.applyFilter();
  },

  clearFilter() {
    this._search = '';
    const t = this._type;
    ['fSearch_'+t,'fBrand_'+t,'fSubType'].forEach(id=>{
      const el=document.getElementById(id); if(el) el.value='';
    });
    document.getElementById(`fAvail_${t}`)?.classList.remove('on');
    this.render(t);
  },

  // ── رسم الجدول ────────────────────────────────────────
  render(type) {
    const data    = this._cache[type];
    if (!data) return;
    const tableId = type==='BATTERIES' ? 'batTable' : 'tirTable';
    const tableEl = document.getElementById(tableId);
    const isAdmin = Auth.isAdmin();
    const canEdit = Auth.hasPerm('manage_products');

    // فلترة
    const search  = this._search.trim().toLowerCase();
    const brand   = document.getElementById(`fBrand_${type}`)?.value   || '';
    const subType = document.getElementById('fSubType')?.value          || '';
    const availOn = document.getElementById(`fAvail_${type}`)?.classList.contains('on');

    const tokens = search.split(/\s+/).filter(Boolean);

    const filtered = data.products.filter(p => {
      if (tokens.length) {
        const hay = Object.values(p).join(' ').toLowerCase();
        if (!tokens.every(t => hay.includes(t))) return false;
      }
      if (brand   && p['ماركة'] !== brand) return false;
      if (subType && !String(p['نوع']||'').startsWith(subType)) return false;
      if (availOn && (Number(p['مخزون'])||0) <= 0) return false;
      return true;
    });

    if (!filtered.length) {
      tableEl.innerHTML = `<div class="table-empty"><i class="fa-solid fa-magnifying-glass"></i><p>لا توجد نتائج</p></div>`;
      return;
    }

    let thead='', rows='';
    if (type==='TIRES') {
      thead=`<tr>
        <th>القياس</th><th>الماركة</th><th>النوع</th>
        ${isAdmin?'<th>سعر 1</th><th>سعر 2</th>':'<th>السعر</th>'}
        <th>مخزون</th><th>ملاحظات</th>
        ${canEdit?'<th>إجراءات</th>':''}
      </tr>`;
      rows = filtered.map(p=>`
        <tr>
          <td><span class="size-badge">${p['قياس']||''}</span></td>
          <td><strong>${p['ماركة']||''}</strong></td>
          <td><span class="type-tag">${p['نوع']||''}</span></td>
          ${isAdmin
            ?`<td class="price-cell">${nf(p['سعر_1_عرض'])}</td><td class="price-cell" style="color:#1565c0">${nf(p['سعر_2_عرض'])}</td>`
            :`<td class="price-cell">${nf(p['سعر_للعميل'])}</td>`}
          <td>${stockBadge(p['مخزون'])}</td>
          <td style="font-size:.78rem;color:#8a9ab0">${p['ملاحظات']||''}</td>
          ${canEdit?`<td style="white-space:nowrap">
            <button class="btn-edit" onclick="AdminProducts.openModal('TIRES','${p['معرف']}')">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn-delete" onclick="AdminProducts.del('TIRES','${p['معرف']}')">
              <i class="fa-solid fa-trash"></i>
            </button>
          </td>`:''}
        </tr>`).join('');

    } else {
      thead=`<tr>
        <th>الماركة</th><th>أمبير</th><th>قطب</th>
        ${isAdmin?'<th>سعر 1</th><th>سعر 2</th>':'<th>السعر</th>'}
        <th>مخزون</th><th>ملاحظات</th>
        ${canEdit?'<th>إجراءات</th>':''}
      </tr>`;
      rows = filtered.map(p=>`
        <tr>
          <td><strong>${p['ماركة']||''}</strong></td>
          <td><span class="size-badge">${p['أمبير']||''} Ah</span></td>
          <td><span class="type-tag">${p['قطب']||''}</span></td>
          ${isAdmin
            ?`<td class="price-cell">${nf(p['سعر_1_عرض'])}</td><td class="price-cell" style="color:#1565c0">${nf(p['سعر_2_عرض'])}</td>`
            :`<td class="price-cell">${nf(p['سعر_للعميل'])}</td>`}
          <td>${stockBadge(p['مخزون'])}</td>
          <td style="font-size:.78rem;color:#8a9ab0">${p['ملاحظات']||''}</td>
          ${canEdit?`<td style="white-space:nowrap">
            <button class="btn-edit" onclick="AdminProducts.openModal('BATTERIES','${p['معرف']}')">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn-delete" onclick="AdminProducts.del('BATTERIES','${p['معرف']}')">
              <i class="fa-solid fa-trash"></i>
            </button>
          </td>`:''}
        </tr>`).join('');
    }

    tableEl.innerHTML = `
      <table class="catalog-table">
        <thead>${thead}</thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="catalog-count">
        عرض <strong>${filtered.length}</strong> من أصل <strong>${data.products.length}</strong>
      </div>`;
  }
};

// nf() defined in api-auth.js
const stockBadge = s => {
  const n=Number(s)||0;
  if (n<=0)  return `<span class="stock-badge out">نفد</span>`;
  if (n<=10) return `<span class="stock-badge low">${n} محدود</span>`;
  return `<span class="stock-badge in">${n}</span>`;
};

/* ══ إدارة المنتجات ══════════════════════════════════════ */
const AdminProducts = {
  _editId:null, _type:'TIRES',

  openModal(type='TIRES', id=null) {
    this._type=type; this._editId=id;
    let prod={};
    if(id && Catalog._cache[type])
      prod=Catalog._cache[type].products.find(p=>p['معرف']===id)||{};

    const isTire = type==='TIRES';
    document.getElementById('productModalTitle').textContent = id?'تعديل منتج':'إضافة منتج';
    document.getElementById('productModalBody').innerHTML = isTire ? `
      <div class="modal-form-grid">
        <div class="form-field full">
          <label>القياس (كما في الإكسل)</label>
          <input id="pf_قياس" value="${prod['قياس']||''}" placeholder="مثال: 16 / 205 / 55">
        </div>
        <div class="form-field"><label>الماركة</label><input id="pf_ماركة" value="${prod['ماركة']||''}"></div>
        <div class="form-field">
          <label>النوع</label>
          <select id="pf_نوع">
            ${['PCR','TBR','TBR خفيف'].map(o=>`<option ${prod['نوع']===o?'selected':''} value="${o}">${o}</option>`).join('')}
          </select>
        </div>
        <div class="form-field"><label>سعر 1 (جملة كبيرة)</label><input id="pf_سعر_1" type="number" value="${prod['سعر_1_عرض']||''}"></div>
        <div class="form-field"><label>سعر 2 (موزع / تجزئة)</label><input id="pf_سعر_2" type="number" value="${prod['سعر_2_عرض']||''}"></div>
        <div class="form-field"><label>المخزون</label><input id="pf_مخزون" type="number" value="${prod['مخزون']||''}"></div>
        <div class="form-field full"><label>ملاحظات</label><input id="pf_ملاحظات" value="${prod['ملاحظات']||''}"></div>
      </div>` : `
      <div class="modal-form-grid">
        <div class="form-field"><label>الماركة</label><input id="pf_ماركة" value="${prod['ماركة']||''}"></div>
        <div class="form-field"><label>الأمبير (Ah)</label><input id="pf_أمبير" type="number" value="${prod['أمبير']||''}"></div>
        <div class="form-field">
          <label>موضع القطب</label>
          <select id="pf_قطب">
            <option value="L" ${prod['قطب']==='L'?'selected':''}>L (يسار)</option>
            <option value="R" ${prod['قطب']==='R'?'selected':''}>R (يمين)</option>
          </select>
        </div>
        <div class="form-field"><label>سعر 1</label><input id="pf_سعر_1" type="number" value="${prod['سعر_1_عرض']||''}"></div>
        <div class="form-field"><label>سعر 2</label><input id="pf_سعر_2" type="number" value="${prod['سعر_2_عرض']||''}"></div>
        <div class="form-field"><label>المخزون</label><input id="pf_مخزون" type="number" value="${prod['مخزون']||''}"></div>
        <div class="form-field full"><label>ملاحظات</label><input id="pf_ملاحظات" value="${prod['ملاحظات']||''}"></div>
      </div>`;
    document.getElementById('productModal').classList.remove('hidden');
  },

  async save() {
    const keys = this._type==='TIRES'
      ? ['قياس','ماركة','نوع','سعر_1','سعر_2','مخزون','ملاحظات']
      : ['ماركة','أمبير','قطب','سعر_1','سعر_2','مخزون','ملاحظات'];

    const data={};
    keys.forEach(k=>{
      const el=document.getElementById('pf_'+k); if(el) data[k]=el.value;
    });
    if(this._editId) data['معرف']=this._editId;

    UI.showLoader('جارٍ الحفظ...');
    const res = this._editId
      ? await API.updateProduct(this._type, data)
      : await API.addProduct(this._type, data);
    UI.hideLoader();
    if(!res?.ok){UI.toast(res?.error||'فشل الحفظ','error');return;}
    UI.toast('تم الحفظ','success');
    Modal.close('productModal');
    Catalog.load(this._type);
  },

  async del(type,id){
    if(!confirm('حذف هذا المنتج؟')) return;
    UI.showLoader();
    const res=await API.deleteProduct(type,id);
    UI.hideLoader();
    if(!res?.ok){UI.toast(res?.error||'فشل','error');return;}
    UI.toast('تم الحذف','success');
    Catalog.load(type);
  }
};
