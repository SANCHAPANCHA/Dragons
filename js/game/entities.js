/* EGG RUN — pooled entities: eggs, power-ups and obstacles, plus their renderers.
   Entity z is stored in world metres (wz); relative depth is wz - distance. */
(function (ER) {
  'use strict';
  const C = ER.CFG, U = ER.U, Cam = ER.Cam, P = ER.P;

  /* Obstacle catalogue.
     kind: block = must change lane, low = jump (or slide is not enough), high = slide, gap = jump. */
  const TYPES = {
    crate:   { kind: 'block', halfW: 0.82, len: 1.6, yMin: 0, yMax: 1.9 },
    barrier: { kind: 'low',   halfW: 0.9,  len: 0.6, yMin: 0, yMax: 0.95 },
    roller:  { kind: 'low',   halfW: 0.7,  len: 1.2, yMin: 0, yMax: 1.15 },
    gate:    { kind: 'high',  halfW: 0.95, len: 0.5, yMin: 1.0, yMax: 3.2 },
    fud:     { kind: 'block', halfW: 0.9,  len: 0.9, yMin: 0, yMax: 2.8 },
    whale:   { kind: 'block', halfW: 0.95, len: 2.2, yMin: 0, yMax: 2.5 },
    gap:     { kind: 'gap',   halfW: 0.95, len: 4.4, yMin: -9, yMax: 0 },
    lava:    { kind: 'gap',   halfW: 0.95, len: 4.4, yMin: -9, yMax: 0 },
    spikes:  { kind: 'low',   halfW: 0.88, len: 1.3, yMin: 0, yMax: 0.78 },
    column:  { kind: 'low',   halfW: 0.92, len: 1.0, yMin: 0, yMax: 0.92 },
    hang:    { kind: 'high',  halfW: 0.95, len: 0.7, yMin: 1.0, yMax: 3.6 },
    // only dangerous while burning (e.active)
    flamejet:{ kind: 'block', halfW: 0.78, len: 1.0, yMin: 0, yMax: 3.3 },
    // falls from the ceiling when the dragon approaches; dangerous once landed
    meteor:  { kind: 'block', halfW: 0.82, len: 1.4, yMin: 0, yMax: 1.6 }
  };

  const pool = [];
  const active = [];

  function make() {
    return {
      cat: 'egg', type: 'normal', kind: '', x: 0, y: 0, wz: 0, len: 1, halfW: 0.8, yMin: 0, yMax: 1,
      span: 1, vz: 0, t: 0, rot: 0, magnet: false, dead: false, smashed: 0, seed: 0, rolling: false,
      active: false, warn: 0, jetK: 0, falling: false, landed: false
    };
  }

  const Entities = {
    TYPES,
    list: active,

    acquire() {
      const e = pool.pop() || make();
      e.dead = false; e.magnet = false; e.smashed = 0; e.vz = 0; e.t = Math.random() * 10; e.rot = 0;
      e.span = 1; e.y = 0; e.rolling = false; e.seed = Math.random();
      e.active = false; e.warn = 0; e.jetK = 0; e.falling = false; e.landed = false;
      active.push(e);
      return e;
    },

    addEgg(type, x, y, wz) {
      const e = this.acquire();
      e.cat = 'egg'; e.type = type; e.kind = 'egg';
      e.x = x; e.y = y; e.wz = wz; e.len = 0.6; e.halfW = 0.5;
      return e;
    },

    addPower(type, x, wz) {
      const e = this.acquire();
      e.cat = 'power'; e.type = type; e.kind = 'power';
      e.x = x; e.y = 1.0; e.wz = wz; e.len = 0.8; e.halfW = 0.6;
      return e;
    },

    addObstacle(type, x, wz, span) {
      const d = TYPES[type];
      const e = this.acquire();
      e.cat = 'obstacle'; e.type = type; e.kind = d.kind;
      e.x = x; e.wz = wz; e.len = d.len; e.yMin = d.yMin; e.yMax = d.yMax;
      e.span = span || 1;
      e.halfW = d.halfW + (e.span - 1);
      if (type === 'meteor') e.y = C.CEIL_Y;
      return e;
    },

    clear() {
      while (active.length) pool.push(active.pop());
    },

    /** Remove entities that are behind the camera or flagged dead. */
    sweep(dist) {
      for (let i = active.length - 1; i >= 0; i--) {
        const e = active[i];
        if (e.dead || e.wz + e.len - dist < -C.CAM_BACK + 0.3) {
          active[i] = active[active.length - 1];
          active.pop();
          pool.push(e);
        }
      }
    },

    gapsAt(x, dist) {
      for (const e of active) {
        if (e.kind !== 'gap' || e.dead) continue;
        const z = e.wz - dist;
        if (z < -0.15 && z + e.len > 0.15 && Math.abs(e.x - x) < 0.7) return e;
      }
      return null;
    }
  };

  /* ---------------- renderers ---------------- */
  function shadow(ctx, x, z, w, alpha) {
    if (!Cam.proj(x, 0, z)) return;
    const r = w * P.s;
    ctx.fillStyle = 'rgba(0,0,0,' + alpha.toFixed(3) + ')';
    ctx.beginPath();
    ctx.ellipse(P.x, P.y, r, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function fogAlpha(z) {
    return 1 - Math.pow(U.clamp((z - 55) / (C.MAX_Z - 55), 0, 1), 1.3);
  }

  function drawEgg(ctx, e, z, t) {
    const sp = ER.Sprites.eggs[e.type];
    const bob = e.magnet ? 0 : Math.sin(t * 3 + e.seed * 6) * 0.12;
    const y = e.y + bob;
    const a = fogAlpha(z);
    if (e.y < 1.3) shadow(ctx, e.x, z, 0.32, 0.28 * a);
    if (!Cam.proj(e.x, y + 0.42, z)) return;
    const h = (e.type === 'normal' ? 0.72 : 0.82) * P.s;
    const w = h * 0.8 * (0.86 + 0.14 * Math.cos(t * 2.4 + e.seed * 9));
    // glow
    ctx.globalCompositeOperation = 'lighter';
    const gi = e.type === 'special' ? 3 : 0;
    const gr = h * (e.type === 'normal' ? 0.85 : 1.25);
    ctx.globalAlpha = a * (e.type === 'normal' ? 0.35 : 0.6) * (0.85 + 0.15 * Math.sin(t * 5 + e.seed * 7));
    ctx.drawImage(ER.Sprites.glow[gi], P.x - gr, P.y - gr, gr * 2, gr * 2);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = a;
    ctx.drawImage(sp, P.x - w * 0.625, P.y - h * 0.586, w * 1.25, h * 1.17);
    ctx.globalAlpha = 1;
  }

  function drawPower(ctx, e, z, t) {
    const sp = ER.Sprites.orbs[e.type];
    const y = e.y + Math.sin(t * 2.6 + e.seed * 5) * 0.2;
    const a = fogAlpha(z);
    shadow(ctx, e.x, z, 0.45, 0.3 * a);
    if (!Cam.proj(e.x, y + 0.2, z)) return;
    const s = 1.1 * P.s;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a * (0.55 + 0.25 * Math.sin(t * 4));
    const gr = s * 1.3;
    ctx.drawImage(ER.Sprites.glow[0], P.x - gr, P.y - gr, gr * 2, gr * 2);
    // orbiting sparkle
    const oa = t * 3 + e.seed * 6;
    ctx.globalAlpha = a;
    const so = s * 0.18;
    ctx.drawImage(ER.Sprites.glow[1], P.x + Math.cos(oa) * s * 0.6 - so, P.y + Math.sin(oa) * s * 0.25 - so, so * 2, so * 2);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = a;
    const wob = 1 + Math.sin(t * 5 + e.seed) * 0.04;
    ctx.drawImage(sp, P.x - s / 2 * wob, P.y - s / 2 * wob, s * wob, s * wob);
    ctx.globalAlpha = 1;
  }

  function fogOverlay(ctx, pal, z) {
    const f = ER.D3.fogK(z);
    if (f < 0.02) return;
    const F = ER.D3.front;
    ctx.fillStyle = U.rgba(pal.fog, f);
    ctx.fillRect(F.x, F.y, F.w, F.h);
  }

  function smashOffset(e) {
    return e.smashed > 0 ? (1 - e.smashed) : 0;
  }

  function drawCrate(ctx, e, z, t, pal) {
    const D3 = ER.D3;
    const k = 0.75 + 0.25 * Math.sin(t * 6 + e.seed * 9);
    shadow(ctx, e.x, z + 0.8, 1.05, 0.45);
    const h = e.yMax;
    if (!D3.box(ctx, e.x - 0.82, e.x + 0.82, 0, h, z, z + e.len,
      null, D3.shade([58, 44, 34], 1, pal, z), D3.shade([30, 22, 16], 1, pal, z))) return;
    const F = D3.front;
    ctx.drawImage(ER.Sprites.crate, F.x, F.y, F.w, F.h);
    fogOverlay(ctx, pal, z);
    // flames licking out of the top
    if (Cam.proj(e.x, h, z + e.len * 0.5)) {
      const sc = P.s;
      ctx.globalCompositeOperation = 'lighter';
      const fa = 1 - D3.fogK(z);
      ctx.globalAlpha = 0.45 * fa;
      const gr = sc * 1.6;
      ctx.drawImage(ER.Sprites.glow[2], P.x - gr, P.y - gr * 0.8, gr * 2, gr * 2);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.95 * fa;
      for (let i = -1; i <= 1; i++) {
        const fr = ER.Sprites.flames[0][((t * 10 + i * 2 + e.seed * 8) | 0) & 3];
        const fh = sc * (0.75 + 0.18 * Math.sin(t * 11 + i * 2)) * (i === 0 ? 1.15 : 0.8) * k;
        ctx.drawImage(fr, P.x + i * sc * 0.45 - fh * 0.33, P.y - fh + sc * 0.08, fh * 0.66, fh);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  function drawBarrier(ctx, e, z, t, pal) {
    const D3 = ER.D3;
    shadow(ctx, e.x, z + 0.3, 1.05, 0.4);
    if (!D3.box(ctx, e.x - 0.9, e.x + 0.9, 0, 0.6, z, z + e.len,
      null, D3.shade([80, 62, 46], 1, pal, z), D3.shade([40, 30, 22], 1, pal, z))) return;
    const F = D3.front;
    ctx.drawImage(ER.Sprites.barrier, F.x, F.y, F.w, F.h);
    fogOverlay(ctx, pal, z);
    // spikes along the top edge
    const n = 6, sw = F.w / n;
    const g = ctx.createLinearGradient(0, F.y - F.s * 0.4, 0, F.y);
    g.addColorStop(0, D3.shade([255, 236, 170], 1, pal, z));
    g.addColorStop(1, D3.shade([150, 92, 30], 1, pal, z));
    ctx.fillStyle = g;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const bx = F.x + i * sw;
      ctx.moveTo(bx + sw * 0.12, F.y);
      ctx.lineTo(bx + sw * 0.5, F.y - F.s * 0.4);
      ctx.lineTo(bx + sw * 0.88, F.y);
    }
    ctx.fill();
  }

  function drawGate(ctx, e, z, t, pal) {
    const D3 = ER.D3;
    const hw = e.halfW + 0.05;
    const x0 = e.x - hw, x1 = e.x + hw;
    const post = D3.shade([70, 54, 40], 1, pal, z), postS = D3.shade([36, 28, 20], 1, pal, z);
    D3.box(ctx, x0, x0 + 0.24, 0, 3.4, z, z + 0.5, post, postS, postS);
    D3.box(ctx, x1 - 0.24, x1, 0, 3.4, z, z + 0.5, post, postS, postS);
    D3.box(ctx, x0, x1, 3.1, 3.5, z, z + 0.5, D3.shade([92, 70, 50], 1, pal, z), null, null);
    const Fl = D3.front;
    ctx.fillStyle = D3.shade(pal.accent, 0.8, pal, z);
    ctx.fillRect(Fl.x, Fl.y + Fl.h - Math.max(1, Fl.h * 0.18), Fl.w, Math.max(1, Fl.h * 0.18));
    // energy field
    if (!Cam.proj(x0 + 0.24, e.yMax - 0.1, z + 0.25)) return;
    const fx = P.x, fy = P.y;
    Cam.proj(x1 - 0.24, e.yMin, z + 0.25);
    const fw = P.x - fx, fh = P.y - fy;
    const fa = 1 - D3.fogK(z);
    const col = pal.ice > 0.5 ? [120, 210, 255] : pal.vault > 0.5 ? [200, 120, 255] : [255, 120, 60];
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(0, fy, 0, fy + fh);
    const pulse = 0.65 + 0.2 * Math.sin(t * 8 + e.seed * 6);
    g.addColorStop(0, U.rgba(col, 0.15 * fa));
    g.addColorStop(0.5, U.rgba(col, 0.45 * fa * pulse));
    g.addColorStop(1, U.rgba(col, 0.9 * fa));
    ctx.fillStyle = g;
    ctx.fillRect(fx, fy, fw, fh);
    ctx.globalAlpha = 0.8 * fa;
    const off = (t * 60) % (fw * 0.5 + 1);
    ctx.drawImage(ER.Sprites.runes, fx - off, fy + fh * 0.62, fw * 1.5, fh * 0.32);
    ctx.globalAlpha = fa;
    ctx.strokeStyle = U.rgba([255, 240, 200], 0.9);
    ctx.lineWidth = Math.max(1.5, P.s * 0.06);
    ctx.beginPath();
    ctx.moveTo(fx, fy + fh); ctx.lineTo(fx + fw, fy + fh);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawFud(ctx, e, z, t, pal) {
    const D3 = ER.D3;
    const hw = e.halfW;
    shadow(ctx, e.x, z + 0.5, hw + 0.3, 0.45);
    if (!D3.box(ctx, e.x - hw, e.x + hw, 0, e.yMax, z, z + e.len,
      null, D3.shade([60, 44, 34], 1, pal, z), D3.shade([30, 22, 16], 1, pal, z))) return;
    const F = D3.front;
    const tiles = e.span;
    const tw = F.w / tiles;
    for (let i = 0; i < tiles; i++) ctx.drawImage(ER.Sprites.fud, F.x + i * tw, F.y, tw, F.h);
    fogOverlay(ctx, pal, z);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = (0.25 + 0.15 * Math.sin(t * 4 + e.seed * 3)) * (1 - D3.fogK(z));
    for (let i = 0; i < tiles; i++) {
      const gr = tw * 0.6;
      ctx.drawImage(ER.Sprites.glow[5], F.x + tw * (i + 0.5) - gr, F.y + F.h * 0.45 - gr, gr * 2, gr * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawWhale(ctx, e, z, t) {
    const a = fogAlpha(z);
    shadow(ctx, e.x, z + 0.8, 1.2, 0.5 * a);
    const bob = Math.sin(t * 2 + e.seed * 6) * 0.08;
    if (!Cam.proj(e.x, bob, z)) return;
    const h = 2.55 * P.s, w = h * (256 / 240);
    ctx.globalAlpha = a;
    ctx.save();
    ctx.translate(P.x, P.y);
    ctx.rotate(Math.sin(t * 1.4 + e.seed * 4) * 0.04);
    ctx.drawImage(ER.Sprites.whale, -w / 2, -h, w, h);
    ctx.globalCompositeOperation = 'lighter';
    const er = h * 0.14;
    ctx.globalAlpha = a * (0.6 + 0.3 * Math.sin(t * 6));
    ctx.drawImage(ER.Sprites.glow[0], -w * 0.156 - er, -h * 0.53 - er, er * 2, er * 2);
    ctx.drawImage(ER.Sprites.glow[0], w * 0.156 - er, -h * 0.53 - er, er * 2, er * 2);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawRoller(ctx, e, z, t) {
    const a = fogAlpha(z);
    shadow(ctx, e.x, z + 0.6, 0.75, 0.45 * a);
    if (!Cam.proj(e.x, 0.68, z + 0.6)) return;
    const r = 0.95 * P.s;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a * 0.55;
    const gr = r * 1.8;
    ctx.drawImage(ER.Sprites.glow[2], P.x - gr, P.y - gr, gr * 2, gr * 2);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = a;
    ctx.save();
    ctx.translate(P.x, P.y);
    ctx.rotate(e.rot);
    ctx.drawImage(ER.Sprites.roller, -r, -r, r * 2, r * 2);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /* ---------- floor spike trap (jump) ---------- */
  function drawSpikes(ctx, e, z, t, pal) {
    const D3 = ER.D3, NEAR = D3.NEAR;
    const hw = e.halfW;
    shadow(ctx, e.x, z + 0.6, hw + 0.1, 0.35);
    if (!D3.box(ctx, e.x - hw, e.x + hw, 0, 0.1, z, z + e.len,
      D3.shade([46, 38, 32], 1, pal, z), D3.shade([84, 70, 58], 1, pal, z), D3.shade([36, 30, 24], 1, pal, z))) return;
    const metal = U.mix3([196, 182, 160], [200, 232, 255], pal.ice, []);
    const light = D3.shade(metal, 1.05, pal, z), dark = D3.shade(metal, 0.5, pal, z);
    const fa = 1 - D3.fogK(z);
    const rows = 3, n = 5;
    for (let r = rows - 1; r >= 0; r--) {
      const zr = z + 0.22 + r * (e.len - 0.44) / (rows - 1);
      if (zr < NEAR + 0.1) continue;
      for (let i = 0; i < n; i++) {
        const xs = e.x - hw + ((i + 0.5 + (r & 1) * 0.5) / (n + 0.5)) * hw * 2;
        const h = 0.64 + 0.1 * Math.sin(t * 5 + i * 1.7 + r * 2.3 + e.seed * 9);
        Cam.proj(xs - 0.14, 0.1, zr); const lx = P.x, ly = P.y;
        Cam.proj(xs + 0.14, 0.1, zr); const rx = P.x;
        Cam.proj(xs, 0.1 + h, zr); const tx = P.x, ty = P.y, ts = P.s;
        const mx = (lx + rx) / 2;
        ctx.fillStyle = light;
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(tx, ty); ctx.lineTo(mx, ly); ctx.closePath(); ctx.fill();
        ctx.fillStyle = dark;
        ctx.beginPath(); ctx.moveTo(mx, ly); ctx.lineTo(tx, ty); ctx.lineTo(rx, ly); ctx.closePath(); ctx.fill();
        if (pal.heat > 0.3 && fa > 0.1) {
          // red-hot tips in the fire zones
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = fa * pal.heat * 0.7;
          const gr = ts * 0.22;
          ctx.drawImage(ER.Sprites.glow[2], tx - gr, ty - gr, gr * 2, gr * 2);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
        }
      }
    }
  }

  /* ---------- fallen column (jump, may span lanes) ---------- */
  function drawColumn(ctx, e, z, t, pal) {
    const D3 = ER.D3;
    const hw = e.halfW, h = e.yMax;
    shadow(ctx, e.x, z + 0.5, hw + 0.2, 0.45);
    if (!D3.box(ctx, e.x - hw, e.x + hw, 0, h, z, z + e.len,
      null, D3.shade(pal.wall, 1.25, pal, z), D3.shade(pal.wall, 0.55, pal, z))) return;
    const F = D3.front;
    // cylinder shading on the visible face
    const g = ctx.createLinearGradient(0, F.y, 0, F.y + F.h);
    g.addColorStop(0, D3.shade(pal.wall, 0.85, pal, z));
    g.addColorStop(0.3, D3.shade(pal.wall, 1.45, pal, z));
    g.addColorStop(1, D3.shade(pal.wall, 0.45, pal, z));
    ctx.fillStyle = g;
    ctx.fillRect(F.x, F.y, F.w, F.h);
    // fluting
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let i = 1; i <= 3; i++) ctx.fillRect(F.x, F.y + F.h * (i / 4.2), F.w, Math.max(1, F.h * 0.05));
    // bronze bands near the ends and the broken middle crack
    ctx.fillStyle = D3.shade(pal.accent, 0.8, pal, z);
    const bw = Math.max(1, F.w * 0.035 / e.span);
    ctx.fillRect(F.x + F.w * 0.06, F.y, bw, F.h);
    ctx.fillRect(F.x + F.w * 0.94 - bw, F.y, bw, F.h);
    ctx.strokeStyle = pal.heat > 0.3 ? U.rgba([255, 120, 30], 0.9 * (1 - D3.fogK(z))) : 'rgba(0,0,0,0.45)';
    ctx.lineWidth = Math.max(1, F.s * 0.04);
    ctx.beginPath();
    const cx = F.x + F.w * (0.4 + e.seed * 0.2);
    ctx.moveTo(cx, F.y); ctx.lineTo(cx + F.w * 0.02, F.y + F.h * 0.35); ctx.lineTo(cx - F.w * 0.015, F.y + F.h * 0.6); ctx.lineTo(cx + F.w * 0.01, F.y + F.h);
    ctx.stroke();
    fogOverlay(ctx, pal, z);
  }

  /* ---------- hanging spikes / icicles (slide) ---------- */
  function drawHang(ctx, e, z, t, pal) {
    const D3 = ER.D3;
    const hw = e.halfW + 0.05;
    const top = 3.6;
    // lintel the spikes hang from
    if (!D3.box(ctx, e.x - hw - 0.1, e.x + hw + 0.1, top - 0.35, top + 0.1, z, z + e.len,
      D3.shade(pal.wall, 0.9, pal, z), null, D3.shade(pal.wall, 0.5, pal, z))) return;
    const L = D3.front;
    ctx.fillStyle = D3.shade(pal.accent, 0.7, pal, z);
    ctx.fillRect(L.x, L.y + L.h - Math.max(1, L.h * 0.15), L.w, Math.max(1, L.h * 0.15));
    const icy = pal.ice;
    const base = U.mix3([150, 120, 90], [190, 230, 255], icy, []);
    const tip = U.mix3([230, 210, 170], [250, 255, 255], icy, []);
    const zf = z + 0.2;
    if (!Cam.proj(e.x, top - 0.35, zf)) return;
    const yTop = P.y;
    Cam.proj(e.x, e.yMin, zf);
    const g = ctx.createLinearGradient(0, yTop, 0, P.y);
    g.addColorStop(0, D3.shade(base, 0.8, pal, z));
    g.addColorStop(1, D3.shade(tip, 1.1, pal, z));
    const fa = 1 - D3.fogK(z);
    const n = 7;
    // soft frost / ember glow behind the row so it reads from afar
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.25 * fa;
    Cam.proj(e.x, 1.9, zf);
    const gr = P.s * 1.6;
    ctx.drawImage(ER.Sprites.glow[icy > 0.5 ? 3 : 2], P.x - gr * 1.4, P.y - gr * 0.6, gr * 2.8, gr * 1.2);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = g;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const xs = e.x - hw + ((i + 0.5) / n) * hw * 2;
      const len = (top - 0.35) - (e.yMin + 0.05 + ((i * 37 + (e.seed * 100 | 0)) % 5) * 0.09);
      const w = 0.13 + ((i * 13) % 3) * 0.03;
      Cam.proj(xs - w, top - 0.35, zf); ctx.moveTo(P.x, P.y);
      Cam.proj(xs + w, top - 0.35, zf); ctx.lineTo(P.x, P.y);
      Cam.proj(xs, top - 0.35 - len, zf); ctx.lineTo(P.x, P.y);
      ctx.closePath();
    }
    ctx.fill();
    // sparkle line where the danger starts
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = U.rgba(icy > 0.5 ? [160, 220, 255] : [255, 150, 70], (0.35 + 0.2 * Math.sin(t * 6 + e.seed * 5)) * fa);
    ctx.lineWidth = Math.max(1, P.s * 0.04);
    ctx.beginPath();
    Cam.proj(e.x - hw, e.yMin + 0.1, zf); ctx.moveTo(P.x, P.y);
    Cam.proj(e.x + hw, e.yMin + 0.1, zf); ctx.lineTo(P.x, P.y);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ---------- floor flame jet (timed) ---------- */
  function drawFlameJet(ctx, e, z, t, pal) {
    const D3 = ER.D3;
    const hw = e.halfW;
    const fa = 1 - D3.fogK(z);
    if (!D3.box(ctx, e.x - hw, e.x + hw, 0, 0.14, z, z + e.len,
      D3.shade([40, 30, 26], 1, pal, z), D3.shade([70, 56, 46], 1, pal, z), D3.shade([30, 22, 18], 1, pal, z))) return;
    const fi = pal.ice > 0.5 ? 1 : pal.vault > 0.5 ? 2 : 0;
    const col = ER.Sprites.PCOL[[2, 3, 4][fi]];
    const heat = e.active ? 1 : e.warn;
    // glowing grate slits
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = U.rgba(col, (0.25 + 0.75 * heat) * fa);
    for (let i = 0; i < 4; i++) {
      const zz = z + 0.15 + i * (e.len - 0.3) / 3;
      if (zz < D3.NEAR) continue;
      D3.quad(ctx, e.x - hw * 0.8, 0.15, zz, e.x + hw * 0.8, 0.15, zz, e.x + hw * 0.8, 0.15, zz + 0.07, e.x - hw * 0.8, 0.15, zz + 0.07);
      ctx.fill();
    }
    const zc = z + e.len / 2;
    if (Cam.proj(e.x, 0.3, zc)) {
      const gr = P.s * (0.8 + heat * 1.6);
      ctx.globalAlpha = (0.2 + 0.6 * heat) * fa * (e.active ? 1 : 0.75 + 0.25 * Math.sin(t * 30));
      ctx.drawImage(ER.Sprites.glow[[2, 3, 4][fi]], P.x - gr, P.y - gr, gr * 2, gr * 2);
      ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = 'source-over';
    if (e.jetK <= 0.01) return;
    // erupting column of fire
    const top = 3.3 * e.jetK;
    const steps = 6;
    ctx.globalCompositeOperation = 'lighter';
    if (Cam.proj(e.x, top * 0.5, zc)) {
      const gr = P.s * 2.2;
      ctx.globalAlpha = 0.45 * fa * e.jetK;
      ctx.drawImage(ER.Sprites.glow[[2, 3, 4][fi]], P.x - gr * 0.7, P.y - gr, gr * 1.4, gr * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
    for (let j = steps - 1; j >= 0; j--) {
      const y = (j / steps) * top;
      if (!Cam.proj(e.x + Math.sin(t * 9 + j) * 0.06, y, zc)) continue;
      const fr = ER.Sprites.flames[fi][((t * 16 + j * 3 + e.seed * 8) | 0) & 3];
      const fh = P.s * (1.25 - j * 0.07) * (0.9 + 0.12 * Math.sin(t * 20 + j * 2)) * Math.max(0.4, e.jetK);
      const fw = fh * 0.85;
      ctx.globalAlpha = 0.95 * Math.max(0.35, fa);
      ctx.drawImage(fr, P.x - fw / 2, P.y - fh * 0.8, fw, fh);
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- meteor (falls from the ceiling) ---------- */
  function drawMeteor(ctx, e, z, t, pal) {
    const D3 = ER.D3;
    const fa = 1 - D3.fogK(z);
    const zc = z + 0.7;
    if (!e.landed) {
      // pulsing impact marker on the floor
      if (Cam.proj(e.x, 0.02, zc)) {
        const pulse = 0.6 + 0.4 * Math.sin(t * 14 + e.seed * 6);
        const r = P.s * 0.95;
        ctx.fillStyle = 'rgba(255,60,20,' + (0.22 * pulse * fa).toFixed(3) + ')';
        ctx.beginPath(); ctx.ellipse(P.x, P.y, r, r * 0.32, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,120,50,' + (0.85 * pulse * fa).toFixed(3) + ')';
        ctx.lineWidth = Math.max(1.5, P.s * 0.06);
        ctx.stroke();
        ctx.beginPath(); ctx.ellipse(P.x, P.y, r * 0.5, r * 0.16, 0, 0, Math.PI * 2); ctx.stroke();
      }
      if (!e.falling) return;
    } else {
      shadow(ctx, e.x, zc, 0.95, 0.5 * fa);
    }
    if (!Cam.proj(e.x, e.y, zc)) return;
    const r = P.s * 0.85, px = P.x, py = P.y;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = (e.landed ? 0.5 : 0.85) * fa;
    const gr = r * (e.landed ? 2 : 2.6);
    ctx.drawImage(ER.Sprites.glow[2], px - gr, py - gr, gr * 2, gr * 2);
    if (e.falling) {
      // fiery trail
      for (let i = 1; i <= 4; i++) {
        const tr = r * (1.3 - i * 0.2);
        ctx.globalAlpha = (0.6 - i * 0.12) * fa;
        ctx.drawImage(ER.Sprites.glow[i < 2 ? 0 : 2], px - tr, py - r * i * 0.9 - tr, tr * 2, tr * 2);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    // basalt rock with molten cracks
    const g = ctx.createRadialGradient(px - r * 0.35, py - r * 0.4, r * 0.1, px, py, r);
    g.addColorStop(0, '#6b4a3a');
    g.addColorStop(0.6, '#33221c');
    g.addColorStop(1, '#140b08');
    ctx.fillStyle = g;
    ctx.beginPath();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + e.seed;
      const rr = r * (0.86 + 0.14 * Math.sin(i * 2.7 + e.seed * 10));
      if (i === 0) ctx.moveTo(px + Math.cos(a) * rr, py + Math.sin(a) * rr);
      else ctx.lineTo(px + Math.cos(a) * rr, py + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,' + (140 + 60 * Math.sin(t * 6) | 0) + ',40,' + (0.9 * fa).toFixed(3) + ')';
    ctx.lineWidth = Math.max(1, r * 0.08);
    ctx.beginPath();
    ctx.moveTo(px - r * 0.5, py - r * 0.2); ctx.lineTo(px - r * 0.1, py + r * 0.05); ctx.lineTo(px + r * 0.25, py - r * 0.35);
    ctx.moveTo(px - r * 0.1, py + r * 0.05); ctx.lineTo(px + r * 0.05, py + r * 0.5);
    ctx.moveTo(px + r * 0.2, py + r * 0.15); ctx.lineTo(px + r * 0.55, py + r * 0.25);
    ctx.stroke();
    if (e.landed) {
      ctx.globalAlpha = 0.9 * Math.max(0.4, fa);
      for (let i = -1; i <= 1; i++) {
        const fr = ER.Sprites.flames[0][((t * 12 + i * 2 + e.seed * 8) | 0) & 3];
        const fh = r * (0.9 + 0.2 * Math.sin(t * 10 + i)) * (i === 0 ? 1.2 : 0.8);
        ctx.drawImage(fr, px + i * r * 0.45 - fh * 0.33, py - r * 0.6 - fh, fh * 0.66, fh);
      }
      ctx.globalAlpha = 1;
    }
  }

  Entities.draw = function (ctx, e, dist, t) {
    const z = e.wz - dist;
    if (z > C.MAX_Z || z + e.len < ER.D3.NEAR) return;
    if (e.cat === 'egg') return drawEgg(ctx, e, z, t);
    if (e.cat === 'power') return drawPower(ctx, e, z, t);
    const pal = ER.Zones.at(e.wz);
    ctx.save();
    if (e.smashed > 0) {
      // knocked away by boost / shield: fly up and fade
      const k = smashOffset(e);
      ctx.globalAlpha = Math.max(0, e.smashed);
      ctx.translate(0, -k * Cam.scale(z) * 3);
    }
    switch (e.type) {
      case 'crate': drawCrate(ctx, e, z, t, pal); break;
      case 'barrier': drawBarrier(ctx, e, z, t, pal); break;
      case 'gate': drawGate(ctx, e, z, t, pal); break;
      case 'fud': drawFud(ctx, e, z, t, pal); break;
      case 'whale': drawWhale(ctx, e, z, t); break;
      case 'roller': drawRoller(ctx, e, z, t); break;
      case 'spikes': drawSpikes(ctx, e, z, t, pal); break;
      case 'column': drawColumn(ctx, e, z, t, pal); break;
      case 'hang': drawHang(ctx, e, z, t, pal); break;
      case 'flamejet': drawFlameJet(ctx, e, z, t, pal); break;
      case 'meteor': drawMeteor(ctx, e, z, t, pal); break;
    }
    ctx.restore();
  };

  ER.Entities = Entities;
})(window.ER = window.ER || {});
