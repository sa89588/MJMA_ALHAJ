/* ══════════════════════════════════════
   js/config.js
   ══════════════════════════════════════ */
const DCFG = {
  // 🔧 نفس رابط Web App المستخدم في admin/customer
  API_URL: 'https://script.google.com/macros/s/AKfycbyYkVK28zF3lny6YpiB_opQ60Ao8jtOBnR0cpCc5ov3j90_aZWF8RdUknsb-TlIM8XkDA/exec',

  NOTIF_ICONS: {
    shortage   : 'fa-triangle-exclamation',
    return     : 'fa-rotate-left',
    delivered  : 'fa-circle-check',
    new_order  : 'fa-truck-fast',
    diff_amount: 'fa-coins',
    pin_wrong  : 'fa-shield-exclamation',
    collected  : 'fa-money-bill-wave'
  },

  STATUS_LABELS: {
    'جاهز'            : { label:'جاهز للتسليم',   cls:'ready'    },
    'خرج_للتوزيع'     : { label:'خرج للتوزيع',    cls:'onway'    },
    'مُسلَّم'          : { label:'تم التسليم',     cls:'done'     },
    'مشكلة_تسليم'     : { label:'مشكلة في التسليم',cls:'issue'    },
    'ملغي'            : { label:'ملغي',            cls:'canceled' }
  },

  // استطلاع الإشعارات كل 30 ثانية
  POLL_INTERVAL_MS: 30000
};
