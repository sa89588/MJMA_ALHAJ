/**
 * ═══════════════════════════════════════════════════════════
 *  meta-pixel.js — تكامل Meta Pixel الكامل
 *  متجر الإطارات والبطاريات
 * ═══════════════════════════════════════════════════════════
 *
 *  ✅ يحل مشكلة "Fix invalid value & currency parameters"
 *  ✅ value  → رقم صحيح > 0 (بدون فواصل أو رموز)
 *  ✅ currency → 'IQD'  (كود ISO 4217 للدينار العراقي)
 *
 *  طريقة الإضافة:
 *  1. ضع PIXEL_ID أدناه
 *  2. أضف <script src="js/meta-pixel.js"></script>
 *     في <head> لكل موقع (admin / customer / driver / warehouse)
 * ═══════════════════════════════════════════════════════════
 */

const MetaPixel = {

  // ─── ضع معرّف الـ Pixel هنا ─────────────────────────────
  PIXEL_ID : '2514076832364278',
  CURRENCY  : 'IQD',   // دينار عراقي — ISO 4217
  // ────────────────────────────────────────────────────────

  _ready: false,

  // ─── تهيئة الـ Pixel (يُستدعى مرة واحدة) ───────────────
  init() {
    if (this._ready) return;

    !function(f,b,e,v,n,t,s){
      if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};
      if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
      n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t,s)
    }(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');

    fbq('init', this.PIXEL_ID);
    fbq('track', 'PageView');
    this._ready = true;

    // noscript fallback
    const ns = document.createElement('noscript');
    ns.innerHTML = `<img height="1" width="1" style="display:none"
      src="https://www.facebook.com/tr?id=${this.PIXEL_ID}&ev=PageView&noscript=1"/>`;
    document.body.appendChild(ns);
  },

  // ─── دوال التتبع ─────────────────────────────────────────

  /**
   * شراء / إنشاء طلب
   * @param {number} total   - إجمالي الطلب (رقم صحيح)
   * @param {Array}  items   - بنود الطلب
   * @param {string} orderId - رقم الطلب
   */
  trackPurchase(total, items, orderId) {
    if (!this._ready) return;

    // ✅ value يجب أن يكون رقماً صحيحاً > 0
    const value = this._sanitizeValue(total);
    if (value <= 0) {
      console.warn('MetaPixel: تم تجاهل حدث الشراء — القيمة يجب أن تكون > 0');
      return;
    }

    // ✅ contents: قائمة المنتجات بالتنسيق الصحيح
    const contents = (items || []).map(it => ({
      id       : it.productId || it.id || 'unknown',
      quantity : Number(it.qty) || 1,
      item_price: this._sanitizeValue(it.netPrice || it.price || 0)
    }));

    fbq('track', 'Purchase', {
      value        : value,           // ✅ رقم صحيح بدون رموز
      currency     : this.CURRENCY,   // ✅ 'IQD'
      content_type : 'product',
      contents     : contents,
      num_items    : contents.reduce((s,c)=>s+c.quantity, 0),
      order_id     : orderId || ''
    });

    console.log(`MetaPixel: Purchase tracked — ${value} ${this.CURRENCY}`);
  },

  /**
   * إضافة للسلة
   */
  trackAddToCart(product, qty) {
    if (!this._ready) return;
    const value = this._sanitizeValue(product.netPrice || product.price || 0);
    if (value <= 0) return;

    fbq('track', 'AddToCart', {
      value       : value * (Number(qty)||1),
      currency    : this.CURRENCY,
      content_type: 'product',
      content_ids : [product.id || product.productId || ''],
      content_name: product.name || ''
    });
  },

  /**
   * بدء عملية الدفع (فتح صفحة القائمة)
   */
  trackInitiateCheckout(total, itemCount) {
    if (!this._ready) return;
    const value = this._sanitizeValue(total);
    if (value <= 0) return;

    fbq('track', 'InitiateCheckout', {
      value     : value,
      currency  : this.CURRENCY,
      num_items : Number(itemCount) || 0
    });
  },

  /**
   * تسجيل الدخول (Lead)
   */
  trackLogin(role) {
    if (!this._ready) return;
    fbq('track', 'Lead', {
      content_name    : 'Login',
      content_category: role || 'customer'
    });
  },

  /**
   * عرض محتوى (منتج أو صفحة)
   */
  trackViewContent(name, category, value) {
    if (!this._ready) return;
    const v = this._sanitizeValue(value);
    fbq('track', 'ViewContent', {
      content_name    : name     || '',
      content_category: category || '',
      ...(v > 0 ? { value:v, currency:this.CURRENCY } : {})
    });
  },

  /**
   * بحث عن منتج
   */
  trackSearch(query) {
    if (!this._ready) return;
    fbq('track', 'Search', {
      search_string: query || ''
    });
  },

  /**
   * حدث مخصص
   */
  trackCustom(eventName, params) {
    if (!this._ready) return;
    fbq('trackCustom', eventName, params || {});
  },

  // ─── دالة مساعدة: تنظيف القيمة المالية ──────────────────
  /**
   * تحويل أي قيمة إلى رقم صحيح آمن
   * ✅ يزيل الفواصل والرموز
   * ✅ يضمن أن النتيجة رقم > 0
   */
  _sanitizeValue(val) {
    if (val === null || val === undefined) return 0;
    // إزالة كل ما ليس رقماً أو نقطة عشرية
    const clean = String(val).replace(/[^0-9.]/g, '');
    const num   = parseFloat(clean);
    return isNaN(num) ? 0 : Math.max(0, num);
  }
};


// ═══════════════════════════════════════════════════════════
//  دمج تلقائي مع نظام الزبون (customer site)
// ═══════════════════════════════════════════════════════════

/**
 * عند تحميل موقع الزبون، يتم تجاوز دالة submit()
 * لإضافة تتبع الـ Pixel تلقائياً بدون تعديل cart.js
 */
document.addEventListener('DOMContentLoaded', () => {
  MetaPixel.init();

  // تتبع تسجيل الدخول
  const originalLogin = window.CAuth?.login?.bind(window.CAuth);
  if (originalLogin && window.CAuth) {
    window.CAuth.login = async function(e) {
      await originalLogin(e);
      if (CAuth.getUser()) {
        MetaPixel.trackLogin(CAuth.getUser().role);
      }
    };
  }

  // تتبع الشراء عند إرسال الطلب
  const originalSubmit = window.CCart?.submit?.bind(window.CCart);
  if (originalSubmit && window.CCart) {
    window.CCart.submit = async function() {
      // تسجيل بيانات القائمة قبل الإرسال
      const { grand } = CCart.totals();
      const items     = [...CCart._items];
      const orderNum  = 'pending';

      await originalSubmit();

      // تتبع الشراء بعد النجاح
      MetaPixel.trackPurchase(grand, items, orderNum);
    };
  }

  // تتبع إضافة للسلة
  const originalAdd = window.CCart?.add?.bind(window.CCart);
  if (originalAdd && window.CCart) {
    window.CCart.add = function(item) {
      originalAdd(item);
      MetaPixel.trackAddToCart(item, item.qty||1);
    };
  }

  // تتبع فتح القائمة (checkout)
  const originalGoTo = window.CApp?.goTo?.bind(window.CApp);
  if (originalGoTo && window.CApp) {
    window.CApp.goTo = function(view) {
      if (view === 'cart' && CCart._items.length > 0) {
        const { grand } = CCart.totals();
        MetaPixel.trackInitiateCheckout(grand, CCart._items.length);
      }
      originalGoTo(view);
    };
  }

  // تتبع البحث
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    let searchTimer;
    searchInput.addEventListener('input', ()=>{
      clearTimeout(searchTimer);
      searchTimer = setTimeout(()=>{
        if (searchInput.value.trim().length >= 2) {
          MetaPixel.trackSearch(searchInput.value.trim());
        }
      }, 1500);
    });
  }
});


// ═══════════════════════════════════════════════════════════
//  دمج مع موقع الإدارة (admin site)
// ═══════════════════════════════════════════════════════════

/**
 * للمدير: تتبع إنشاء الطلبات (من لوحة الإدارة)
 */
if (typeof Builder !== 'undefined') {
  const origSave = Builder.saveOrder?.bind(Builder);
  if (origSave) {
    Builder.saveOrder = async function() {
      let grand = 0;
      Builder._rows.forEach(r => grand += r.qty * r.price);
      await origSave();
      MetaPixel.trackCustom('AdminOrderCreated', {
        value   : MetaPixel._sanitizeValue(grand),
        currency: MetaPixel.CURRENCY
      });
    };
  }
}
