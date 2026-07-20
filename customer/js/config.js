/* ══════════════════════════════════════════
   js/config.js
   ══════════════════════════════════════════ */
const CCFG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbyYkVK28zF3lny6YpiB_opQ60Ao8jtOBnR0cpCc5ov3j90_aZWF8RdUknsb-TlIM8XkDA/exec',

  ORDER_STEPS: [
    { key:'معلق',          label:'استُلم',     icon:'fa-inbox' },
    { key:'مؤكد',          label:'مؤكد',       icon:'fa-check' },
    { key:'قيد_التجهيز',   label:'يُجهَّز',   icon:'fa-gear' },
    { key:'جاهز',          label:'جاهز',       icon:'fa-box-open' },
    { key:'خرج_للتوزيع',   label:'في الطريق', icon:'fa-truck-fast' },
    { key:'مُسلَّم',        label:'سُلِّم',     icon:'fa-flag-checkered' }
  ]
};
