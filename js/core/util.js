/* EGG RUN — small math / colour helpers. */
(function (ER) {
  'use strict';

  const U = {
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    smooth: (t) => t * t * (3 - 2 * t),
    rand: (a, b) => a + Math.random() * (b - a),
    randInt: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
    pick: (arr) => arr[(Math.random() * arr.length) | 0],
    chance: (p) => Math.random() < p,

    /** Pick from [{w, v}] by weight; entries with w <= 0 are skipped. */
    weighted(items) {
      let total = 0;
      for (const it of items) if (it.w > 0) total += it.w;
      let r = Math.random() * total;
      for (const it of items) {
        if (it.w <= 0) continue;
        r -= it.w;
        if (r <= 0) return it.v;
      }
      return items[items.length - 1].v;
    },

    mix3(a, b, t, out) {
      out = out || [0, 0, 0];
      out[0] = a[0] + (b[0] - a[0]) * t;
      out[1] = a[1] + (b[1] - a[1]) * t;
      out[2] = a[2] + (b[2] - a[2]) * t;
      return out;
    },

    rgb(c, k) {
      k = k === undefined ? 1 : k;
      const r = Math.min(255, c[0] * k) | 0, g = Math.min(255, c[1] * k) | 0, b = Math.min(255, c[2] * k) | 0;
      return 'rgb(' + r + ',' + g + ',' + b + ')';
    },

    rgba(c, a, k) {
      k = k === undefined ? 1 : k;
      const r = Math.min(255, c[0] * k) | 0, g = Math.min(255, c[1] * k) | 0, b = Math.min(255, c[2] * k) | 0;
      return 'rgba(' + r + ',' + g + ',' + b + ',' + a.toFixed(3) + ')';
    },

    fmt: (n) => Math.floor(n).toLocaleString('en-US'),

    /** Deterministic PRNG (used for seeded leaderboards). */
    mulberry32(seed) {
      let a = seed >>> 0;
      return function () {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },

    hash(str) {
      let h = 2166136261;
      for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return h >>> 0;
    },

    easeOutBack(t) {
      const c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },

    makeCanvas(w, h) {
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.ceil(w));
      c.height = Math.max(1, Math.ceil(h));
      return c;
    }
  };

  ER.U = U;
})(window.ER = window.ER || {});
