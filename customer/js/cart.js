/* ══════════════════════════════════════════
   js/cart.js — سلة التسوق وإرسال الطلب
   ══════════════════════════════════════════ */
const CCart = {
  _items: [],   // { id, name, type, netPrice, basePrice, disc, qty, stock }

  // ── إدارة العناصر ──────────────────────────────────
  add(item) {
    const ex = this._items.find(i => i.id === item.id);
    if (ex) { ex.qty = Math.min(ex.qty + item.qty, ex.stock); }
    else     { this._items.push({ ...item }); }
    this.save();
    this.updateUI();
  },

  setQty(id, qty) {
    const it = this._items.find(i => i.id === id);
    if (!it) return;
    if (qty <= 0) this.remove(id);
    else { it.qty = Math.min(qty, it.stock); this.save(); this.updateUI(); }
  },

  remove(id) {
    this._items = this._items.filter(i => i.id !== id);
    // تحديث بطاقة الكتالوج
    CCatalog.updateCardUI(id, 0);
    this.save();
    this.updateUI();
    if (document.getElementById('view-cart').classList.contains('active')) this.renderPanel();
  },

  getQty(id) {
    return this._items.find(i => i.id === id)?.qty || 0;
  },

  clear() {
    if (!this._items.length) return;
    if (!confirm('هل تريد مسح القائمة كاملاً؟')) return;
    const ids = this._items.map(i => i.id);
    this._items = [];
    ids.forEach(id => CCatalog.updateCardUI(id, 0));
    this.save();
    this.updateUI();
    this.renderPanel();
  },

  // ── حساب الإجماليات ────────────────────────────────
  totals() {
    let subtotal=0, discTotal=0;
    this._items.forEach(it => {
      subtotal  += it.netPrice  * it.qty;
      discTotal += it.disc      * it.qty;
    });
    return { subtotal, discTotal, grand: subtotal, count: this._items.length };
  },

  // ── تحديث الواجهة ────────────────────────────────────
  updateUI() {
    const { count, grand } = this.totals();
    const hasItems = count > 0;

    // شارة الهيدر
    const badge = document.getElementById('cartBadge');
    badge.textContent = count;
    badge.classList.toggle('hidden', !hasItems);

    // شريط bottom nav
    const bnBadge = document.getElementById('bnavBadge');
    bnBadge.textContent = count;
    bnBadge.classList.toggle('hidden', !hasItems);

    // الشريط العائم
    const fc = document.getElementById('floatCart');
    if (hasItems && document.getElementById('view-catalog').classList.contains('active')) {
      fc.classList.remove('hidden');
      document.getElementById('fcCount').textContent = count;
      document.getElementById('fcTotal').textContent = numFmt(grand) + ' د.ع';
    } else {
      fc.classList.add('hidden');
    }

    // زر سلة الهيدر
    document.getElementById('cartBtn').style.background = hasItems
      ? 'rgba(29,78,216,.35)' : 'rgba(255,255,255,.12)';
  },

  // ── رسم لوحة السلة ───────────────────────────────────
  renderPanel() {
    const cartItems = document.getElementById('cartItems');
    const cartEmpty = document.getElementById('cartEmpty');
    const cartTotals = document.getElementById('cartTotals');
    const cartActions = document.querySelector('.cart-actions');

    if (!this._items.length) {
      cartItems.innerHTML = '';
      cartEmpty.classList.remove('hidden');
      cartTotals.classList.add('hidden');
      if (cartActions) cartActions.style.display = 'none';
      return;
    }

    cartEmpty.classList.add('hidden');
    cartTotals.classList.remove('hidden');
    if (cartActions) cartActions.style.display = 'flex';

    cartItems.innerHTML = this._items.map((it, idx) => `
      <div class="cart-item">
        <div class="ci-info">
          <div class="ci-name">${esc(it.name)}</div>
          ${it.disc > 0
            ? `<div class="ci-disc"><i class="fa-solid fa-tag"></i> خصم ${numFmt(it.disc)} د.ع / حبة</div>`
            : ''}
          <div class="ci-price">سعر الوحدة: <strong>${numFmt(it.netPrice)}</strong> د.ع</div>
        </div>
        <div class="ci-right">
          <span class="ci-total">${numFmt(it.netPrice * it.qty)}</span>
          <div class="ci-qty-ctrl">
            <button class="qty-btn" onclick="CCart.changeQtyPanel('${it.id}',-1)">−</button>
            <span class="qty-val">${it.qty}</span>
            <button class="qty-btn" onclick="CCart.changeQtyPanel('${it.id}',1)">+</button>
          </div>
          <button class="ci-del" onclick="CCart.remove('${it.id}')">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </div>`).join('');

    const { subtotal, discTotal, grand, count } = this.totals();
    document.getElementById('ctCount').textContent    = count + ' صنف';
    document.getElementById('ctSubtotal').textContent = numFmt(subtotal + discTotal) + ' د.ع';
    document.getElementById('ctGrand').textContent    = numFmt(grand) + ' د.ع';

    const discRow = document.getElementById('ctDiscRow');
    if (discTotal > 0) {
      discRow.classList.remove('hidden');
      document.getElementById('ctDisc').textContent = '− ' + numFmt(discTotal) + ' د.ع';
    } else {
      discRow.classList.add('hidden');
    }
  },

  changeQtyPanel(id, delta) {
    const it = this._items.find(i => i.id === id);
    if (!it) return;
    const nq = it.qty + delta;
    if (nq <= 0) this.remove(id);
    else { this.setQty(id, nq); this.renderPanel(); }
  },

  openPanel() { CApp.goTo('cart'); },

  // ── إرسال الطلب ──────────────────────────────────────
  async submit() {
    if (!this._items.length) { CUI.toast('القائمة فارغة!', 'error'); return; }

    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جارٍ الإرسال...';

    const user  = CAuth.getUser();
    const notes = document.getElementById('cartNotes')?.value || '';

    const res = await CAPI.createOrder({
      customerName: user.name,
      notes,
      items: JSON.stringify(this._items.map(it => ({
        type      : it.type    || 'TIRES',
        productId : it.id,
        name      : it.name,
        basePrice : it.basePrice,
        discPerUnit: it.disc,
        qty       : it.qty
      })))
    });

    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> إرسال الطلب';

    if (!res?.ok) { CUI.toast(res?.error || 'فشل الإرسال، حاول مجدداً', 'error'); return; }

    // إرسال واتساب تلقائي
    this.notifyWhatsapp(res, notes, user);

    CUI.toast(`✅ تم إرسال الطلب ${res.orderNum} بنجاح`, 'success');
    this._items = [];
    this.save();
    this.updateUI();
    document.getElementById('cartNotes').value = '';

    // انتقل لصفحة الطلبات
    setTimeout(() => { CApp.goTo('orders'); COrders.load(); }, 1000);
  },

  // ── واتساب ──────────────────────────────────────────
  async sendWhatsapp() {
    if (!this._items.length) { CUI.toast('القائمة فارغة!', 'error'); return; }
    const settings = CApp._settings;
    const user = CAuth.getUser();
    const { grand } = this.totals();
    const notes = document.getElementById('cartNotes')?.value || '';
    const lines = this._items.map((it,i) =>
      `${i+1}. ${it.name} × ${it.qty} = ${numFmt(it.netPrice * it.qty)} د.ع`
    ).join('\n');

    const msg = encodeURIComponent(
`🛒 *طلب جديد — ${settings.store_name||'المتجر'}*
👤 الزبون: ${user.name}
📅 التاريخ: ${new Date().toLocaleDateString('ar-IQ')}
──────────────────
${lines}
──────────────────
✅ *الإجمالي: ${numFmt(grand)} د.ع*
${notes ? '📝 ملاحظات: ' + notes : ''}`);

    window.open(`https://wa.me/${settings.whatsapp||''}?text=${msg}`, '_blank');
  },

  notifyWhatsapp(orderRes, notes, user) {
    const settings = CApp._settings;
    if (!settings.whatsapp) return;
    const { grand } = this.totals();
    const lines = this._items.map((it,i) =>
      `${i+1}. ${it.name} × ${it.qty} = ${numFmt(it.netPrice * it.qty)}`
    ).join('\n');

    const msg = encodeURIComponent(
`🔔 *طلب جديد ${orderRes.orderNum}*
👤 الزبون: ${user.name}
──────────────────
${lines}
──────────────────
💰 الإجمالي: ${numFmt(grand)} د.ع
${notes ? '📝 ' + notes : ''}
🔗 راجع النظام لتأكيد الطلب`);

    // فتح نافذة واتساب (للإشعار الفوري للمتجر)
    setTimeout(() => window.open(`https://wa.me/${settings.whatsapp}?text=${msg}`, '_blank'), 300);
  },

  // ── LocalStorage ─────────────────────────────────────
  save() {
    try { localStorage.setItem('cst_cart', JSON.stringify(this._items)); } catch(_){}
  },
  load() {
    try {
      const r = localStorage.getItem('cst_cart');
      if (r) this._items = JSON.parse(r);
    } catch(_){}
  }
};
