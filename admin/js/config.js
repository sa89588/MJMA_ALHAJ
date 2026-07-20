const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec',
  LEVELS: { admin:'مدير عام', accountant:'محاسب', customer:'زبون', driver:'سائق' },
  PERM_LABELS: {
    view_orders        : 'عرض الطلبات',
    update_order_status: 'تحديث حالة الطلبات',
    manage_products    : 'إضافة / تعديل / حذف المنتجات',
    manage_prices      : 'تعديل الأسعار',
    view_customers     : 'عرض قائمة الزبائن',
    manage_customers   : 'إضافة / تعديل الزبائن',
    export_data        : 'تصدير البيانات',
    view_reports       : 'عرض التقارير والإحصائيات',
    assign_drivers      : 'إسناد الطلبات للسائقين',
    view_deliveries    : 'عرض سجل التسليمات وتقارير السائقين'
  },
  ORDER_STATUSES: [
    'معلق','مؤكد','قيد_التجهيز','جاهز',
    'خرج_للتوزيع','مُسلَّم','مشكلة_تسليم',
    'مكتمل','ملغي'
  ],
  STATUS_STYLE: {
    'معلق':         { cls:'pending',  icon:'fa-clock' },
    'مؤكد':         { cls:'done',     icon:'fa-check-circle' },
    'قيد_التجهيز':  { cls:'pending',  icon:'fa-gear fa-spin-pulse' },
    'جاهز':         { cls:'done',     icon:'fa-box-open' },
    'خرج_للتوزيع':  { cls:'pending',  icon:'fa-truck-fast' },
    'مُسلَّم':       { cls:'done',     icon:'fa-flag-checkered' },
    'مشكلة_تسليم':  { cls:'issue',    icon:'fa-triangle-exclamation' },
    'مكتمل':        { cls:'done',     icon:'fa-flag-checkered' },
    'ملغي':         { cls:'canceled', icon:'fa-ban' }
  },
  NOTIF_ICONS: {
    shortage   : 'fa-triangle-exclamation',
    return     : 'fa-rotate-left',
    delivered  : 'fa-circle-check',
    new_order  : 'fa-truck-fast',
    diff_amount: 'fa-coins',
    pin_wrong  : 'fa-shield-exclamation'
  },
  POLL_INTERVAL_MS: 30000
};
