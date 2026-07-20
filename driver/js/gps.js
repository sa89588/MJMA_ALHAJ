/* ══════════════════════════════════════════════════════════
   js/gps.js — تتبع موقع السائق وإرساله للخادم
   ══════════════════════════════════════════════════════════ */
const DGPS = {
  _watchId    : null,
  _sendTimer  : null,
  _lastPos    : null,
  _active     : false,
  _currentOrder: '',
  _statusEl   : null,
  SEND_INTERVAL: 30000,   // كل 30 ثانية

  // ─── بدء الإرسال ──────────────────────────────────────
  start(orderNum = '') {
    if (this._active) { this._currentOrder = orderNum; return; }
    if (!navigator.geolocation) {
      this._setStatus('GPS غير مدعوم في هذا الجهاز', 'off');
      return;
    }
    this._active       = true;
    this._currentOrder = orderNum;
    this._setStatus('جارٍ تحديد الموقع...', 'loading');

    // مراقبة مستمرة للموقع
    this._watchId = navigator.geolocation.watchPosition(
      pos  => this._onPosition(pos),
      err  => this._onError(err),
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
    );

    // إرسال دوري كل 30 ثانية
    this._sendTimer = setInterval(() => {
      if (this._lastPos) this._send();
    }, this.SEND_INTERVAL);

    // إرسال فوري أول مرة عند الحصول على الموقع
  },

  // ─── إيقاف الإرسال ────────────────────────────────────
  stop() {
    if (!this._active) return;
    this._active = false;
    if (this._watchId !== null) {
      navigator.geolocation.clearWatch(this._watchId);
      this._watchId = null;
    }
    clearInterval(this._sendTimer);
    this._sendTimer = null;
    this._lastPos   = null;
    this._setStatus('GPS متوقف', 'off');
  },

  // ─── عند الحصول على الموقع ───────────────────────────
  _onPosition(pos) {
    this._lastPos = pos;
    this._setStatus('📍 الموقع محدَّد', 'on');
    this._send();
  },

  // ─── إرسال الموقع للخادم ──────────────────────────────
  async _send() {
    if (!this._lastPos || !this._active) return;
    try {
      await DAPI.call('updateGPS', {
        lat      : this._lastPos.coords.latitude,
        lng      : this._lastPos.coords.longitude,
        accuracy : Math.round(this._lastPos.coords.accuracy || 0),
        orderNum : this._currentOrder
      });
      const time = new Date().toLocaleTimeString('ar-IQ');
      this._setStatus(`📍 أُرسل ${time}`, 'on');
    } catch(_) {}
  },

  // ─── عند خطأ في GPS ───────────────────────────────────
  _onError(err) {
    const msgs = {
      1: 'تم رفض صلاحية الموقع — يرجى السماح من إعدادات المتصفح',
      2: 'تعذّر تحديد الموقع',
      3: 'انتهت مهلة تحديد الموقع'
    };
    this._setStatus(msgs[err.code] || 'خطأ في GPS', 'error');
    console.warn('GPS Error:', err.message);
  },

  // ─── تحديث مؤشر الحالة في الواجهة ────────────────────
  _setStatus(text, state) {
    const el = document.getElementById('gpsStatusBar');
    if (!el) return;
    const colors = {
      on     : { bg:'#dcfce7', color:'#15803d', icon:'fa-location-dot' },
      off    : { bg:'#f1f5f9', color:'#64748b', icon:'fa-location-crosshairs' },
      loading: { bg:'#fef9c3', color:'#92400e', icon:'fa-spinner fa-spin' },
      error  : { bg:'#fee2e2', color:'#dc2626', icon:'fa-triangle-exclamation' }
    };
    const s = colors[state] || colors.off;
    el.style.background = s.bg;
    el.style.color      = s.color;
    el.innerHTML = `<i class="fa-solid ${s.icon}"></i> ${text}`;
    el.classList.remove('hidden');
  }
};
