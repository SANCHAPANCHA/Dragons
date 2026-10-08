/* EGG RUN — pooled world-space particles and floating score text. */
(function (ER) {
  'use strict';
  const U = ER.U;

  const MAX = 900;
  const pool = [];
  for (let i = 0; i < MAX; i++) {
    pool.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 0.1, col: 0, g: 0, drag: 0, world: true, add: true, grow: 0, streak: false });
  }
  let cursor = 0;
  let activeCount = 0;

  const texts = [];
  for (let i = 0; i < 24; i++) texts.push({ on: false, text: '', x: 0, y: 0, z: 0, life: 0, max: 1, color: '#fff', size: 1 });

  const Particles = {
    get count() { return activeCount; },

    limit() { return ER.Settings.data.quality === 'low' ? 320 : MAX; },

    spawn(o) {
      const lim = this.limit();
      for (let n = 0; n < lim; n++) {
        cursor = (cursor + 1) % lim;
        const p = pool[cursor];
        if (!p.on) {
          p.on = true;
          p.x = o.x; p.y = o.y; p.z = o.z;
          p.vx = o.vx || 0; p.vy = o.vy || 0; p.vz = o.vz || 0;
          p.life = p.max = o.life || 1;
          p.size = o.size || 0.12;
          p.col = o.col || 0;
          p.g = o.g || 0;
          p.drag = o.drag || 0;
          p.world = o.world !== false;
          p.add = o.add !== false;
          p.grow = o.grow || 0;
          p.streak = !!o.streak;
          return p;
        }
      }
      return null;
    },

    burst(x, y, z, count, o) {
      o = o || {};
      const sp = o.speed || 4;
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const e = (Math.random() - 0.3) * Math.PI;
        const v = sp * (0.4 + Math.random() * 0.8);
        this.spawn({
          x, y, z,
          vx: Math.cos(a) * Math.cos(e) * v,
          vy: Math.sin(e) * v + (o.up || 0),
          vz: Math.sin(a) * Math.cos(e) * v,
          life: (o.life || 0.6) * (0.6 + Math.random() * 0.7),
          size: (o.size || 0.14) * (0.6 + Math.random() * 0.8),
          col: o.cols ? U.pick(o.cols) : (o.col || 0),
          g: o.g === undefined ? 6 : o.g,
          drag: o.drag || 1.5,
          world: o.world,
          add: o.add,
          streak: o.streak
        });
      }
    },

    text(str, x, y, z, color, size) {
      for (const t of texts) {
        if (!t.on) {
          t.on = true; t.text = str; t.x = x; t.y = y; t.z = z;
          t.life = t.max = 0.9; t.color = color || '#ffe39a'; t.size = size || 1;
          return;
        }
      }
    },

    clear() {
      for (const p of pool) p.on = false;
      for (const t of texts) t.on = false;
      activeCount = 0;
    },

    update(dt, scroll) {
      let n = 0;
      for (let i = 0; i < MAX; i++) {
        const p = pool[i];
        if (!p.on) continue;
        p.life -= dt;
        if (p.life <= 0) { p.on = false; continue; }
        n++;
        const dk = 1 / (1 + p.drag * dt);
        p.vx *= dk; p.vy *= dk; p.vz *= dk;
        p.vy -= p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt - (p.world ? scroll : 0);
        p.size += p.grow * dt;
        if (p.z < -5.5) p.on = false;
      }
      activeCount = n;
      for (const t of texts) {
        if (!t.on) continue;
        t.life -= dt;
        t.y += dt * 1.6;
        if (t.life <= 0) t.on = false;
      }
    },

    render(ctx) {
      const Cam = ER.Cam, P = ER.P, glow = ER.Sprites.glow;
      // additive pass
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < MAX; i++) {
        const p = pool[i];
        if (!p.on || !p.add || p.z < -3.5) continue;
        if (!Cam.proj(p.x, p.y, p.z)) continue;
        const a = p.life / p.max;
        const r = Math.min(60, Math.max(1.2, p.size * P.s * (p.streak ? 1 : 1.6)));
        ctx.globalAlpha = Math.min(1, a * 1.4);
        if (p.streak) {
          const sx = P.x, sy = P.y;
          if (Cam.proj(p.x - p.vx * 0.04, p.y - p.vy * 0.04, p.z - p.vz * 0.04)) {
            ctx.strokeStyle = U.rgb(ER.Sprites.PCOL[p.col]);
            ctx.lineWidth = Math.max(1, r * 0.35);
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(P.x, P.y);
            ctx.stroke();
          }
        } else {
          ctx.drawImage(glow[p.col], P.x - r, P.y - r, r * 2, r * 2);
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      // normal pass (dust/smoke)
      for (let i = 0; i < MAX; i++) {
        const p = pool[i];
        if (!p.on || p.add || p.z < -1.2) continue;
        if (!Cam.proj(p.x, p.y, p.z)) continue;
        const a = p.life / p.max;
        const r = Math.min(22, Math.max(1.5, p.size * P.s));
        ctx.globalAlpha = a * 0.32;
        ctx.fillStyle = U.rgb(ER.Sprites.PCOL[p.col], 0.7);
        ctx.beginPath();
        ctx.arc(P.x, P.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },

    renderTexts(ctx) {
      const Cam = ER.Cam, P = ER.P;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const t of texts) {
        if (!t.on || !Cam.proj(t.x, t.y, t.z)) continue;
        const k = t.life / t.max;
        const pop = k > 0.8 ? U.easeOutBack((1 - k) / 0.2) : 1;
        const size = Math.max(13, Math.min(38, P.s * 0.24 * t.size)) * pop;
        ctx.globalAlpha = Math.min(1, k * 2);
        ctx.font = '900 ' + size.toFixed(0) + 'px Cinzel, Georgia, serif';
        ctx.lineWidth = Math.max(3, size * 0.16);
        ctx.strokeStyle = 'rgba(40,18,4,0.9)';
        ctx.strokeText(t.text, P.x, P.y);
        ctx.fillStyle = t.color;
        ctx.fillText(t.text, P.x, P.y);
      }
      ctx.globalAlpha = 1;
    }
  };

  ER.Particles = Particles;
})(window.ER = window.ER || {});
