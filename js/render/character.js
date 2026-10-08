/* EGG RUN — the dragon character.
   The views are cut straight from the official character sheet (assets/character,
   produced by tools/extract_character.py) so the design is never re-drawn.
   Colour skins are recoloured at load time from one shared image + region mask
   (R = body/horns/wings, G = belly, B = untouched, e.g. eyes), so every skin uses
   exactly the same silhouette, face and proportions. */
(function (ER) {
  'use strict';
  const U = ER.U;

  // Each ramp is [shadow, base, highlight]; GOLDEN keeps the original pixels.
  const SKINS = [
    { id: 'golden', name: 'GOLDEN' },
    { id: 'fire', name: 'FIRE', body: [[112, 10, 8], [214, 34, 26], [255, 128, 96]], belly: [[196, 92, 8], [255, 162, 30], [255, 230, 120]] },
    { id: 'ocean', name: 'OCEAN', body: [[8, 34, 120], [26, 96, 226], [120, 186, 255]], belly: [[8, 116, 116], [36, 196, 186], [150, 250, 236]] },
    { id: 'sky', name: 'SKY', body: [[52, 120, 182], [104, 186, 242], [206, 240, 255]], belly: [[72, 164, 164], [144, 226, 218], [222, 255, 250]] },
    { id: 'forest', name: 'FOREST', body: [[14, 78, 24], [36, 150, 46], [128, 218, 106]], belly: [[104, 164, 54], [168, 224, 106], [226, 252, 180]] },
    { id: 'purple', name: 'PURPLE', body: [[54, 16, 104], [124, 56, 198], [204, 156, 255]], belly: [[132, 104, 176], [186, 162, 234], [240, 226, 255]] },
    { id: 'pink', name: 'PINK', body: [[140, 14, 72], [226, 56, 128], [255, 166, 206]], belly: [[206, 126, 156], [255, 184, 210], [255, 232, 242]] },
    { id: 'ice', name: 'ICE', body: [[132, 164, 198], [212, 232, 248], [255, 255, 255]], belly: [[84, 164, 206], [146, 212, 244], [214, 244, 255]] },
    { id: 'shadow', name: 'SHADOW', body: [[16, 16, 22], [52, 54, 64], [124, 126, 142]], belly: [[64, 50, 84], [112, 98, 138], [176, 162, 202]] },
    { id: 'royal', name: 'ROYAL', body: [[8, 16, 74], [24, 48, 156], [96, 136, 240]], belly: [[164, 104, 16], [238, 178, 46], [255, 236, 140]] }
  ];

  // Unit heights match the old procedural dragon (~210 units = CFG.DRAGON_H).
  const VIEW_H = { back: 214, front: 236 };
  const BODY_HUE = 42; // average hue of the original skin (degrees)

  const src = {};
  const cache = {};
  let stats = null;
  let canRecolor = true;

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('Failed to load ' + url));
      im.src = url;
    });
  }

  function pixels(im) {
    const cv = U.makeCanvas(im.width, im.height);
    const x = cv.getContext('2d');
    x.drawImage(im, 0, 0);
    return { cv, x, data: x.getImageData(0, 0, im.width, im.height) };
  }

  const lum = (r, g, b) => (0.3 * r + 0.59 * g + 0.11 * b) / 255;

  function hueOf(r, g, b) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (d < 1) return BODY_HUE;
    let h;
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return (h * 60 + 360) % 360;
  }

  /** Luminance range of each region on the front view, shared by every view so skins match. */
  function measure(img, mask) {
    const a = img.data.data, m = mask.data.data;
    const body = [], belly = [];
    for (let i = 0; i < a.length; i += 4) {
      if (a[i + 3] < 200) continue;
      const L = lum(a[i], a[i + 1], a[i + 2]);
      if (m[i] > 200) body.push(L);
      else if (m[i + 1] > 200) belly.push(L);
    }
    const pct = (arr, p) => { arr.sort((x, y) => x - y); return arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] || 0.5; };
    return {
      body: [pct(body, 0.03), pct(body, 0.97)],
      belly: [pct(belly, 0.03), pct(belly, 0.97)]
    };
  }

  function ramp(stops, t, out) {
    let a, b, k;
    if (t < 0.55) { a = stops[0]; b = stops[1]; k = t / 0.55; } else { a = stops[1]; b = stops[2]; k = (t - 0.55) / 0.45; }
    const ck = U.clamp(k, 0, 1);
    for (let j = 0; j < 3; j++) out[j] = a[j] + (b[j] - a[j]) * ck;
    // extrapolate deep shadows / speculars instead of clipping them
    if (t < 0) { const f = Math.max(0, 1 + t * 1.6); for (let j = 0; j < 3; j++) out[j] *= f; }
    if (t > 1) { const f = Math.min(1, (t - 1) * 2.2); for (let j = 0; j < 3; j++) out[j] += (255 - out[j]) * f; }
    return out;
  }

  function hueRotate(c, deg) {
    if (Math.abs(deg) < 0.5) return c;
    const a = deg * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a);
    const r = c[0], g = c[1], b = c[2];
    c[0] = r * (0.213 + cs * 0.787 - sn * 0.213) + g * (0.715 - cs * 0.715 - sn * 0.715) + b * (0.072 - cs * 0.072 + sn * 0.928);
    c[1] = r * (0.213 - cs * 0.213 + sn * 0.143) + g * (0.715 + cs * 0.285 + sn * 0.140) + b * (0.072 - cs * 0.072 - sn * 0.283);
    c[2] = r * (0.213 - cs * 0.213 - sn * 0.787) + g * (0.715 - cs * 0.715 + sn * 0.715) + b * (0.072 + cs * 0.928 + sn * 0.072);
    return c;
  }

  function recolor(view, skin) {
    const img = src[view], mask = src[view + '_mask'];
    const cv = U.makeCanvas(img.cv.width, img.cv.height);
    const x = cv.getContext('2d');
    if (!skin.body || !canRecolor) { x.drawImage(img.cv, 0, 0); return cv; }
    const out = x.createImageData(cv.width, cv.height);
    const a = img.data.data, m = mask.data.data, o = out.data;
    const [blo, bhi] = stats.body, [glo, ghi] = stats.belly;
    const cb = [0, 0, 0], cg = [0, 0, 0];
    for (let i = 0; i < a.length; i += 4) {
      const al = a[i + 3];
      o[i + 3] = al;
      if (!al) continue;
      const r = a[i], g = a[i + 1], b = a[i + 2];
      let wb = m[i], wg = m[i + 1], wk = m[i + 2];
      const ws = wb + wg + wk;
      if (ws < 8) { wb = 1; wg = 0; wk = 0; } else { wb /= ws; wg /= ws; wk /= ws; }
      const L = lum(r, g, b);
      if (wb > 0.001) {
        ramp(skin.body, (L - blo) / (bhi - blo), cb);
        // keep the slight hue differences of wings / freckles / horns
        hueRotate(cb, U.clamp(hueOf(r, g, b) - BODY_HUE, -22, 22) * 0.6);
      }
      if (wg > 0.001) ramp(skin.belly, (L - glo) / (ghi - glo), cg);
      o[i] = U.clamp(cb[0] * wb + cg[0] * wg + r * wk, 0, 255);
      o[i + 1] = U.clamp(cb[1] * wb + cg[1] * wg + g * wk, 0, 255);
      o[i + 2] = U.clamp(cb[2] * wb + cg[2] * wg + b * wk, 0, 255);
    }
    x.putImageData(out, 0, 0);
    return cv;
  }

  const Character = {
    SKINS,
    ready: false,

    load() {
      const names = ['back', 'front', 'back_mask', 'front_mask'];
      const data = ER.CHARACTER_DATA || {};
      return Promise.all(names.map((n) => loadImage(data[n] || 'assets/character/' + n + '.png'))).then((ims) => {
        names.forEach((n, i) => {
          try {
            src[n] = pixels(ims[i]);
          } catch (e) {
            // tainted canvas (should not happen with embedded data); keep original colours
            canRecolor = false;
            const cv = U.makeCanvas(ims[i].width, ims[i].height);
            cv.getContext('2d').drawImage(ims[i], 0, 0);
            src[n] = { cv };
          }
        });
        if (canRecolor) stats = measure(src.front, src.front_mask);
        this.ready = true;
      });
    },

    skin(id) {
      return SKINS.find((s) => s.id === id) || SKINS[0];
    },

    get current() {
      return this.skin(ER.Settings.data.skin).id;
    },

    /** Recoloured views for a skin, built once and cached. */
    views(id) {
      const skin = this.skin(id || this.current);
      if (!cache[skin.id]) cache[skin.id] = { back: recolor('back', skin), front: recolor('front', skin) };
      return cache[skin.id];
    },

    thumbnail(id) {
      const v = this.views(id);
      if (!v.url) { try { v.url = v.front.toDataURL('image/png'); } catch (e) { v.url = ''; } }
      return v.url;
    },

    /** In-game back view. Origin at the feet, y up negative. o: {phase, run} */
    drawBack(x, o) {
      const img = this.views().back;
      const ph = o.phase || 0;
      const run = o.run === undefined ? 1 : o.run;
      const h = VIEW_H.back, w = h * img.width / img.height;
      const bob = -Math.abs(Math.cos(ph)) * 7 * run;
      x.save();
      x.translate(0, bob);
      // waddle: weight shifts from foot to foot
      x.rotate(Math.sin(ph) * 0.07 * run);
      const sq = 1 + Math.cos(ph * 2) * 0.025 * run;
      x.scale(1 / sq, sq);
      x.imageSmoothingQuality = 'high';
      x.drawImage(img, -w / 2, -h, w, h);
      x.restore();
    },

    /** Front view for menus and the share card. o: {t, mood, holdEgg} */
    drawFront(x, o) {
      const img = this.views(o.skin).front;
      const t = o.t || 0;
      const h = VIEW_H.front, w = h * img.width / img.height;
      x.save();
      if (o.holdEgg && ER.Sprites.eggs.golden) {
        x.drawImage(ER.Sprites.eggs.golden, w * 0.22, -78, 60, 75);
      }
      const breathe = 1 + Math.sin(t * 2.2) * 0.012;
      x.rotate(Math.sin(t * 1.1) * 0.02);
      x.scale(1 / breathe, breathe);
      x.imageSmoothingQuality = 'high';
      x.drawImage(img, -w / 2, -h, w, h);
      x.restore();
    }
  };

  ER.Character = Character;
})(window.ER = window.ER || {});
