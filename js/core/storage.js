/* EGG RUN — localStorage wrapper (fails soft in private mode / file://). */
(function (ER) {
  'use strict';

  const PREFIX = 'eggrun.';
  const memory = {};

  function available() {
    try {
      const k = PREFIX + '__probe';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  }
  const hasLS = available();

  ER.Store = {
    get(key, fallback) {
      try {
        const raw = hasLS ? window.localStorage.getItem(PREFIX + key) : memory[key];
        if (raw === null || raw === undefined) return fallback;
        return JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      const raw = JSON.stringify(value);
      if (hasLS) {
        try { window.localStorage.setItem(PREFIX + key, raw); return; } catch (e) { /* quota */ }
      }
      memory[key] = raw;
    },
    remove(key) {
      if (hasLS) { try { window.localStorage.removeItem(PREFIX + key); } catch (e) { /* ignore */ } }
      delete memory[key];
    },
    clearAll() {
      if (hasLS) {
        const keys = [];
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (k && k.indexOf(PREFIX) === 0) keys.push(k);
        }
        keys.forEach((k) => window.localStorage.removeItem(k));
      }
      Object.keys(memory).forEach((k) => delete memory[k]);
    }
  };

  const DEFAULT_SETTINGS = { music: true, sfx: true, shake: true, quality: 'high', skin: 'golden' };

  ER.Settings = {
    data: Object.assign({}, DEFAULT_SETTINGS, ER.Store.get('settings', {})),
    save() { ER.Store.set('settings', this.data); },
    reset() { this.data = Object.assign({}, DEFAULT_SETTINGS); this.save(); }
  };

  ER.Profile = {
    get best() { return ER.Store.get('best', 0); },
    set best(v) { ER.Store.set('best', v); },
    get bestCombo() { return ER.Store.get('bestCombo', 0); },
    set bestCombo(v) { ER.Store.set('bestCombo', v); },
    get name() {
      let n = ER.Store.get('name', null);
      if (!n) {
        n = 'Dragonling' + (1000 + Math.floor(Math.random() * 9000));
        ER.Store.set('name', n);
      }
      return n;
    },
    set name(v) {
      const clean = String(v || '').replace(/[^\w .\-]/g, '').trim().slice(0, 16);
      if (clean) ER.Store.set('name', clean);
    }
  };
})(window.ER = window.ER || {});
