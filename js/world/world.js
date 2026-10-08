/* EGG RUN — endless temple environment renderer + shared 3D drawing helpers. */
(function (ER) {
  'use strict';
  const C = ER.CFG, U = ER.U, Cam = ER.Cam, P = ER.P;

  const NEAR = -C.CAM_BACK + 0.6;
  const rndTable = new Float32Array(1024);
  { const r = U.mulberry32(42); for (let i = 0; i < 1024; i++) rndTable[i] = r(); }
  const rnd = (i) => rndTable[((i % 1024) + 1024) % 1024];

  /* ---------------- shared helpers ---------------- */
  const D3 = {
    NEAR,
    fogK(z) {
      const t = U.clamp((z - 4) / (C.MAX_Z - 4), 0, 1);
      return Math.pow(t, 0.7);
    },
    /** Colour c scaled by k then blended into the fog of palette pal at depth z. */
    shade(c, k, pal, z) {
      const f = this.fogK(z), fo = pal.fog, g = 1 - f;
      const r = Math.min(255, c[0] * k * g + fo[0] * f) | 0;
      const gg = Math.min(255, c[1] * k * g + fo[1] * f) | 0;
      const b = Math.min(255, c[2] * k * g + fo[2] * f) | 0;
      return 'rgb(' + r + ',' + gg + ',' + b + ')';
    },
    /** Floor-plane / generic quad from 4 world points (y per point). */
    quad(ctx, x0, y0, z0, x1, y1, z1, x2, y2, z2, x3, y3, z3) {
      ctx.beginPath();
      Cam.proj(x0, y0, z0); ctx.moveTo(P.x, P.y);
      Cam.proj(x1, y1, z1); ctx.lineTo(P.x, P.y);
      Cam.proj(x2, y2, z2); ctx.lineTo(P.x, P.y);
      Cam.proj(x3, y3, z3); ctx.lineTo(P.x, P.y);
      ctx.closePath();
    },
    front: { x: 0, y: 0, w: 0, h: 0, s: 0 },
    /** Axis-aligned box. Colours are css strings. Fills D3.front with the front face rect. */
    box(ctx, x0, x1, y0, y1, z0, z1, cFront, cTop, cSide) {
      if (z1 < NEAR) return false;
      if (z0 < NEAR) z0 = NEAR;
      // side faces
      if (cSide) {
        ctx.fillStyle = cSide;
        if (x1 < Cam.x) { this.quad(ctx, x1, y0, z0, x1, y1, z0, x1, y1, z1, x1, y0, z1); ctx.fill(); }
        if (x0 > Cam.x) { this.quad(ctx, x0, y0, z0, x0, y1, z0, x0, y1, z1, x0, y0, z1); ctx.fill(); }
      }
      if (cTop && y1 < Cam.camH + Cam.bob) {
        ctx.fillStyle = cTop;
        this.quad(ctx, x0, y1, z0, x1, y1, z0, x1, y1, z1, x0, y1, z1);
        ctx.fill();
      }
      Cam.proj(x0, y1, z0);
      const fx = P.x, fy = P.y, s = P.s;
      Cam.proj(x1, y0, z0);
      const F = this.front;
      F.x = fx; F.y = fy; F.w = P.x - fx; F.h = P.y - fy; F.s = s;
      if (cFront) {
        ctx.fillStyle = cFront;
        ctx.fillRect(F.x, F.y, F.w, F.h);
      }
      return true;
    },
    glowAt(ctx, idxOrSprite, x, y, z, radius, alpha) {
      if (!Cam.proj(x, y, z)) return;
      const r = radius * P.s;
      const sp = typeof idxOrSprite === 'number' ? ER.Sprites.glow[idxOrSprite] : idxOrSprite;
      ctx.globalAlpha = alpha;
      ctx.drawImage(sp, P.x - r, P.y - r, r * 2, r * 2);
      ctx.globalAlpha = 1;
    }
  };
  ER.D3 = D3;

  function torchLight(wz) {
    const sp = C.ARCH_SPACING;
    const m = ((wz % sp) + sp) % sp;
    const d = Math.min(m, sp - m);
    return Math.exp(-(d * d) / 16);
  }

  // Dynamic glow sprites tinted with the current zone light (rebuilt when the colour drifts).
  const lightGlow = { key: '', sprite: null };
  function zoneGlow(pal) {
    const key = ((pal.light[0] / 16) | 0) + ',' + ((pal.light[1] / 16) | 0) + ',' + ((pal.light[2] / 16) | 0);
    if (key !== lightGlow.key) {
      lightGlow.key = key;
      lightGlow.sprite = ER.Sprites.glowFor(pal.light);
    }
    return lightGlow.sprite;
  }
  const doorGlow = { key: '', sprite: null };
  function doorSprite(pal) {
    const key = ((pal.door[0] / 16) | 0) + ',' + ((pal.door[1] / 16) | 0) + ',' + ((pal.door[2] / 16) | 0);
    if (key !== doorGlow.key) {
      doorGlow.key = key;
      doorGlow.sprite = ER.Sprites.glowFor(pal.door);
    }
    return doorGlow.sprite;
  }

  const World = { time: 0 };

  /* ---------------- backdrop ---------------- */
  function drawBackdrop(ctx, dist) {
    const pal = ER.Zones.at(dist + C.MAX_Z);
    const W = Cam.W, H = Cam.H;
    ctx.fillStyle = U.rgb(pal.fog);
    ctx.fillRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, 0, Cam.horizon + 40);
    g.addColorStop(0, U.rgb(pal.sky));
    g.addColorStop(1, U.rgb(pal.fog));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, Cam.horizon + 40);

    // distant doorway
    const z = C.MAX_Z;
    if (!Cam.proj(0, 0, z)) return;
    const s = P.s, bx = P.x, by = P.y;
    const dw = 2.4 * s, dh = 4.2 * s;
    ctx.save();
    const dg = ctx.createLinearGradient(0, by - dh, 0, by);
    dg.addColorStop(0, U.rgba(pal.door, 0.55));
    dg.addColorStop(1, U.rgba(pal.door, 1, 1.1));
    ctx.fillStyle = dg;
    ctx.beginPath();
    ctx.moveTo(bx - dw / 2, by);
    ctx.lineTo(bx - dw / 2, by - dh + dw / 2);
    ctx.arc(bx, by - dh + dw / 2, dw / 2, Math.PI, 0);
    ctx.lineTo(bx + dw / 2, by);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    const r = 14 * s;
    ctx.globalAlpha = 0.55;
    ctx.drawImage(doorSprite(pal), bx - r, by - dh * 0.5 - r, r * 2, r * 2);
    ctx.globalAlpha = 0.9;
    const r2 = 4 * s;
    ctx.drawImage(doorSprite(pal), bx - r2, by - dh * 0.45 - r2, r2 * 2, r2 * 2);
    ctx.restore();
  }

  /* ---------------- floor ---------------- */
  function drawFloor(ctx, dist, t) {
    const L = C.ROW_LEN, E = C.LANE_EDGE, CW = C.CURB_W, WX = C.WALL_X;
    const first = Math.floor((dist + NEAR) / L);
    const last = Math.ceil((dist + C.MAX_Z) / L);
    const low = ER.Settings.data.quality === 'low';
    for (let k = last; k >= first; k--) {
      const wz0 = k * L;
      let z0 = wz0 - dist;
      const z1 = z0 + L;
      if (z1 <= NEAR) continue;
      if (z0 < NEAR) z0 = NEAR;
      const zm = (z0 + z1) * 0.5;
      const pal = ER.Zones.at(wz0);
      const lit = 0.72 + 0.5 * torchLight(wz0 + 1);
      const y0 = Cam.sy(0, z0), y1 = Cam.sy(0, z1);
      const s0 = Cam.scale(z0), s1 = Cam.scale(z1);
      const ox = Cam.cx + Cam.shakeX;
      const X0 = (x) => ox + (x - Cam.x) * s0;
      const X1 = (x) => ox + (x - Cam.x) * s1;
      const quad = (xa, xb) => {
        ctx.beginPath();
        ctx.moveTo(X0(xa), y0); ctx.lineTo(X0(xb), y0);
        ctx.lineTo(X1(xb), y1); ctx.lineTo(X1(xa), y1);
        ctx.closePath();
      };

      // side walkway / lava / ice channel (wall to wall)
      let sideK = lit * 0.9;
      if (pal.lava > 0.01) sideK = U.lerp(sideK, (0.7 + 0.35 * rnd(k * 5)) * (0.85 + 0.2 * Math.sin(t * 2.4 + wz0 * 0.45)), pal.lava);
      ctx.fillStyle = D3.shade(pal.side, sideK, pal, zm);
      quad(-WX, WX);
      ctx.fill();
      if (pal.lava > 0.01 || pal.ice > 0.01 || pal.vault > 0.01) {
        const glowAmt = pal.lava * 0.55 + pal.ice * 0.18 + pal.vault * 0.25;
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = U.rgba(pal.sideGlow, glowAmt * (1 - D3.fogK(zm)) * (0.7 + 0.3 * Math.sin(t * 3 + wz0)));
        quad(-WX, -E - CW); ctx.fill();
        quad(E + CW, WX); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
      // curbs
      ctx.fillStyle = D3.shade(pal.curb, lit * 0.55, pal, zm);
      quad(-E - CW, E + CW);
      ctx.fill();
      // grout
      ctx.fillStyle = D3.shade(pal.grout, 1, pal, zm);
      quad(-E, E);
      ctx.fill();
      // slabs
      const inset = 0.06;
      for (let i = 0; i < 3; i++) {
        const xa = -E + i * 2 + inset, xb = -E + i * 2 + 2 - inset;
        const v = 0.86 + rnd(k * 3 + i) * 0.24;
        const base = ((k + i) & 1) ? pal.floor : pal.floor2;
        const center = i === 1 ? 1.06 : 1;
        ctx.fillStyle = D3.shade(base, lit * v * center, pal, zm);
        ctx.beginPath();
        const za = z0 === NEAR ? z0 : z0 + inset;
        const ya = Cam.sy(0, za), sa = Cam.scale(za);
        const yb = Cam.sy(0, z1 - inset), sb = Cam.scale(z1 - inset);
        ctx.moveTo(ox + (xa - Cam.x) * sa, ya); ctx.lineTo(ox + (xb - Cam.x) * sa, ya);
        ctx.lineTo(ox + (xb - Cam.x) * sb, yb); ctx.lineTo(ox + (xa - Cam.x) * sb, yb);
        ctx.closePath();
        ctx.fill();
        if (!low && zm < 40) {
          // bevel highlight on the near edge of the slab
          ctx.fillStyle = D3.shade(pal.light, 0.16 * lit, pal, zm);
          ctx.fillRect(ox + (xa - Cam.x) * sa, ya - Math.max(1, sa * 0.03), (xb - xa) * sa, Math.max(1, sa * 0.03));
        }
      }
      // bronze lane separators
      const lc = D3.shade(pal.curb, lit * 1.1, pal, zm);
      ctx.fillStyle = lc;
      quad(-1.04, -0.96); ctx.fill();
      quad(0.96, 1.04); ctx.fill();
      quad(-E - 0.04, -E + 0.03); ctx.fill();
      quad(E - 0.03, E + 0.04); ctx.fill();
    }
  }

  function drawFloorLights(ctx, dist, t) {
    const SP = C.ARCH_SPACING;
    const first = Math.floor((dist + NEAR) / SP), last = Math.floor((dist + C.MAX_Z) / SP);
    ctx.globalCompositeOperation = 'lighter';
    for (let k = last; k >= first; k--) {
      const aw = k * SP, z = aw - dist;
      if (z < NEAR) continue;
      const pal = ER.Zones.at(aw);
      const sp = zoneGlow(pal);
      const fk = 1 - D3.fogK(z);
      const flick = 0.85 + 0.15 * Math.sin(t * 9 + k * 1.7);
      for (let s = -1; s <= 1; s += 2) {
        if (!Cam.proj(s * 3.6, 0, z)) continue;
        const w = 6 * P.s, h = w * 0.42 * Math.min(1, Cam.camH / (z + C.CAM_BACK) * 2.2);
        ctx.globalAlpha = 0.33 * fk * flick;
        ctx.drawImage(sp, P.x - w / 2, P.y - h / 2, w, h);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ---------------- gaps in the floor ---------------- */
  World.drawGap = function (ctx, e, dist, t) {
    let z0 = e.wz - dist;
    const z1 = z0 + e.len;
    if (z1 < NEAR || z0 > C.MAX_Z) return;
    if (z0 < NEAR) z0 = NEAR;
    const pal = ER.Zones.at(e.wz);
    const x0 = e.x - 1, x1 = e.x + 1, depth = -2.4;
    if (e.type === 'lava') return drawLavaPool(ctx, e, z0, z1, x0, x1, pal, t);
    ctx.save();
    D3.quad(ctx, x0, 0, z0, x1, 0, z0, x1, 0, z1, x0, 0, z1);
    ctx.fillStyle = '#050201';
    ctx.fill();
    ctx.clip();
    // glowing abyss floor
    const glowC = pal.lava > 0.3 || pal.ice < 0.3 ? [255, 90, 20] : pal.sideGlow;
    ctx.fillStyle = U.rgba(glowC, 0.85 * (1 - D3.fogK(z0)), 0.75 + 0.25 * Math.sin(t * 3));
    D3.quad(ctx, x0, depth, z0, x1, depth, z0, x1, depth, z1, x0, depth, z1);
    ctx.fill();
    // inner side walls
    ctx.fillStyle = D3.shade(pal.wall, 0.35, pal, z0);
    if (x0 > Cam.x - 1) { D3.quad(ctx, x0, 0, z0, x0, 0, z1, x0, depth, z1, x0, depth, z0); ctx.fill(); }
    if (x1 < Cam.x + 1) { D3.quad(ctx, x1, 0, z0, x1, 0, z1, x1, depth, z1, x1, depth, z0); ctx.fill(); }
    // far inner wall with upward glow
    Cam.proj(x0, 0, z1);
    const ax = P.x, ay = P.y;
    Cam.proj(x1, depth, z1);
    const g = ctx.createLinearGradient(0, ay, 0, P.y);
    g.addColorStop(0, D3.shade(pal.wall, 0.4, pal, z1));
    g.addColorStop(1, U.rgba(glowC, 0.9, 0.9));
    ctx.fillStyle = g;
    ctx.fillRect(ax, ay, P.x - ax, P.y - ay);
    ctx.restore();
    // rim glow
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = U.rgba(glowC, 0.6 * (1 - D3.fogK(z0)));
    ctx.lineWidth = Math.max(1, Cam.scale(z0) * 0.05);
    D3.quad(ctx, x0, 0, z0, x1, 0, z0, x1, 0, z1, x0, 0, z1);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  };

  /** Molten pool sunk slightly into the floor (behaves like a gap). */
  function drawLavaPool(ctx, e, z0, z1, x0, x1, pal, t) {
    const fa = 1 - D3.fogK(z0);
    const sink = -0.18;
    ctx.save();
    D3.quad(ctx, x0, 0, z0, x1, 0, z0, x1, 0, z1, x0, 0, z1);
    ctx.fillStyle = '#2a0700';
    ctx.fill();
    ctx.clip();
    Cam.proj(0, sink, z1); const yFar = P.y;
    Cam.proj(0, sink, z0); const yNear = P.y;
    const g = ctx.createLinearGradient(0, yFar, 0, yNear);
    const pulse = 0.85 + 0.15 * Math.sin(t * 3 + e.seed * 5);
    g.addColorStop(0, U.rgba([255, 120, 20], fa * 0.9 + 0.1));
    g.addColorStop(0.5, U.rgba([255, 170, 40], pulse));
    g.addColorStop(1, U.rgba([255, 90, 10], 1));
    ctx.fillStyle = g;
    D3.quad(ctx, x0, sink, z0, x1, sink, z0, x1, sink, z1, x0, sink, z1);
    ctx.fill();
    // drifting crust plates and bubbles
    const len = z1 - z0;
    for (let i = 0; i < 6; i++) {
      const zz = z0 + ((i * 0.37 + e.seed + t * 0.05) % 1) * len;
      const xx = x0 + 0.2 + ((i * 0.61 + e.seed * 3) % 1) * 1.6;
      if (!Cam.proj(xx, sink, zz)) continue;
      const r = P.s * (0.18 + (i % 3) * 0.06);
      ctx.fillStyle = 'rgba(70,14,0,0.55)';
      ctx.beginPath(); ctx.ellipse(P.x, P.y, r, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
      const bk = (t * 1.3 + i * 0.4 + e.seed) % 1;
      ctx.strokeStyle = 'rgba(255,230,140,' + ((1 - bk) * 0.8).toFixed(3) + ')';
      ctx.lineWidth = Math.max(1, P.s * 0.03);
      ctx.beginPath(); ctx.ellipse(P.x + r * 1.5, P.y, r * bk, r * bk * 0.35, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
    ctx.globalCompositeOperation = 'lighter';
    if (Cam.proj(e.x, 0.3, (z0 + z1) / 2)) {
      const gr = P.s * 2.4;
      ctx.globalAlpha = 0.45 * fa * pulse;
      ctx.drawImage(ER.Sprites.glow[2], P.x - gr, P.y - gr * 0.6, gr * 2, gr * 1.2);
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = U.rgba([255, 200, 90], 0.8 * fa);
    ctx.lineWidth = Math.max(1, Cam.scale(z0) * 0.06);
    D3.quad(ctx, x0, 0, z0, x1, 0, z0, x1, 0, z1, x0, 0, z1);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ---------------- walls & ceiling ---------------- */
  function drawWalls(ctx, dist, t) {
    const L = C.ROW_LEN, WX = C.WALL_X, TOP = C.CEIL_Y;
    const first = Math.floor((dist + NEAR) / L);
    const last = Math.ceil((dist + C.MAX_Z) / L);
    for (let k = last; k >= first; k--) {
      const wz0 = k * L;
      let z0 = wz0 - dist;
      const z1 = z0 + L;
      if (z1 <= NEAR) continue;
      if (z0 < NEAR) z0 = NEAR;
      const zm = (z0 + z1) * 0.5;
      const pal = ER.Zones.at(wz0);
      const lit = 0.62 + 0.55 * torchLight(wz0 + 1);
      // ceiling
      ctx.fillStyle = D3.shade(pal.wall, 0.22, pal, zm);
      D3.quad(ctx, -WX, TOP, z0, WX, TOP, z0, WX, TOP, z1, -WX, TOP, z1);
      ctx.fill();
      for (let s = -1; s <= 1; s += 2) {
        const v = 0.85 + rnd(k * 7 + (s + 1)) * 0.25;
        ctx.fillStyle = D3.shade(pal.wall, lit * v, pal, zm);
        D3.quad(ctx, s * WX, 0, z0, s * WX, TOP, z0, s * WX, TOP, z1, s * WX, 0, z1);
        ctx.fill();
        if (pal.lava > 0.02) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = U.rgba(pal.sideGlow, 0.32 * pal.lava * (1 - D3.fogK(zm)));
          D3.quad(ctx, s * WX, 0, z0, s * WX, 1.6, z0, s * WX, 1.6, z1, s * WX, 0, z1);
          ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
        }
      }
    }
    // mortar courses: horizontal lines are straight in projection
    ctx.strokeStyle = 'rgba(0,0,0,0.38)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let s = -1; s <= 1; s += 2) {
      for (let y = 0.85; y < TOP; y += 0.85) {
        Cam.proj(s * WX, y, NEAR); ctx.moveTo(P.x, P.y);
        Cam.proj(s * WX, y, C.MAX_Z); ctx.lineTo(P.x, P.y);
      }
    }
    ctx.stroke();
    // vertical joints (staggered), only for the nearer half
    ctx.beginPath();
    for (let k = Math.floor((dist + NEAR) / L); k * L - dist < 46; k++) {
      const zA = k * L - dist;
      for (let s = -1; s <= 1; s += 2) {
        let row = 0;
        for (let y = 0; y < 6; y += 0.85, row++) {
          const zj = zA + ((row + k) & 1);
          if (zj < NEAR) continue;
          Cam.proj(s * WX, y, zj); ctx.moveTo(P.x, P.y);
          Cam.proj(s * WX, y + 0.85, zj); ctx.lineTo(P.x, P.y);
        }
      }
    }
    ctx.stroke();
  }

  /* ---------------- arches, pillars, torches, banners, statues ---------------- */
  function drawBanner(ctx, s, zc, pal, t, k) {
    const z0 = zc - 0.75, z1 = zc + 0.75;
    if (z0 < NEAR) return;
    const x = s * (C.WALL_X - 0.03);
    const sway = Math.sin(t * 1.3 + k) * 0.05;
    ctx.fillStyle = D3.shade(pal.banner, 0.9, pal, zc);
    ctx.beginPath();
    Cam.proj(x, 4.3, z0); ctx.moveTo(P.x, P.y);
    Cam.proj(x, 4.3, z1); ctx.lineTo(P.x, P.y);
    Cam.proj(x, 1.95, z1 + sway); ctx.lineTo(P.x, P.y);
    Cam.proj(x, 1.45, zc + sway); ctx.lineTo(P.x, P.y);
    Cam.proj(x, 1.95, z0 + sway); ctx.lineTo(P.x, P.y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = D3.shade(pal.accent, 0.75, pal, zc);
    ctx.lineWidth = Math.max(1, Cam.scale(zc) * 0.05);
    ctx.stroke();
    // rod
    ctx.lineWidth = Math.max(1.5, Cam.scale(zc) * 0.1);
    ctx.beginPath();
    Cam.proj(x, 4.42, z0 - 0.15); ctx.moveTo(P.x, P.y);
    Cam.proj(x, 4.42, z1 + 0.15); ctx.lineTo(P.x, P.y);
    ctx.stroke();
    // emblem
    if (Cam.proj(x, 3.05, zc)) {
      const sc = P.s;
      ctx.save();
      ctx.translate(P.x, P.y);
      const squeeze = Math.min(1, Math.abs(x - Cam.x) / (zc + C.CAM_BACK) * 1.6) * 0.5 + 0.12;
      ctx.scale(squeeze, 1);
      ER.Sprites.flamePath(ctx, 0, sc * 0.45, sc * 0.55, sc * 0.9, 0);
      ctx.fillStyle = D3.shade(pal.accent, 1, pal, zc);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawStatue(ctx, s, zc, pal) {
    const z0 = zc - 0.45;
    if (z0 < NEAR) return;
    const x = s * 4.3;
    const f = D3.fogK(zc);
    D3.box(ctx, x - 0.45, x + 0.45, 0, 0.75, z0, zc + 0.45,
      D3.shade(pal.wall, 0.9, pal, zc), D3.shade(pal.wall, 1.15, pal, zc), D3.shade(pal.wall, 0.55, pal, zc));
    // gold trim on pedestal
    const F = D3.front;
    ctx.fillStyle = D3.shade(pal.accent, 0.6, pal, zc);
    ctx.fillRect(F.x, F.y, F.w, Math.max(1, F.h * 0.12));
    if (!Cam.proj(x, 0.75, z0)) return;
    const h = 2.5 * P.s, w = h * (140 / 220);
    ctx.save();
    ctx.globalAlpha = 1 - f * 0.85;
    ctx.translate(P.x, P.y);
    if (s < 0) ctx.scale(-1, 1);
    ctx.drawImage(ER.Sprites.statue, -w / 2, -h, w, h);
    ctx.restore();
  }

  function drawTorch(ctx, s, az, pal, t, k) {
    const x = s * (C.WALL_X - C.PILLAR_D / 2);
    const z = az - 0.12;
    if (!Cam.proj(x, 2.55, z)) return;
    const sc = P.s, bx = P.x, by = P.y;
    const fk = 1 - D3.fogK(az);
    // bracket + bowl
    ctx.fillStyle = D3.shade([150, 98, 44], 1, pal, az);
    ctx.fillRect(bx - sc * 0.05, by, sc * 0.1, sc * 0.5);
    ctx.beginPath();
    ctx.ellipse(bx, by, sc * 0.32, sc * 0.16, 0, 0, Math.PI);
    ctx.fill();
    ctx.fillStyle = D3.shade([255, 205, 120], 1, pal, az);
    ctx.fillRect(bx - sc * 0.32, by - sc * 0.03, sc * 0.64, Math.max(1, sc * 0.05));
    // flame
    const frame = ((t * 11 + k * 3 + (s > 0 ? 2 : 0)) | 0) & 3;
    const fl = ER.Sprites.flames[pal.flame][frame];
    const fh = sc * 0.95 * (0.9 + 0.12 * Math.sin(t * 13 + k * 2.1 + s));
    const fw = fh * 0.66;
    ctx.globalCompositeOperation = 'lighter';
    const gr = sc * 2.4;
    ctx.globalAlpha = 0.5 * fk;
    ctx.drawImage(zoneGlow(pal), bx - gr, by - fh * 0.35 - gr, gr * 2, gr * 2);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.55 + 0.45 * fk;
    ctx.drawImage(fl, bx - fw / 2, by - fh + sc * 0.04, fw, fh);
    ctx.globalAlpha = 1;
  }

  function drawArch(ctx, az, pal, t, k) {
    const WX = C.WALL_X, PD = C.PILLAR_D, SY = C.SPRING_Y, TOP = C.CEIL_Y;
    const lit = 1.05;
    // pillars
    for (let s = -1; s <= 1; s += 2) {
      const xi = s * (WX - PD), xo = s * WX;
      const z0 = Math.max(az, NEAR), z1 = az + PD;
      if (z1 <= NEAR) continue;
      ctx.fillStyle = D3.shade(pal.wall, 0.62, pal, az);
      D3.quad(ctx, xi, 0, z0, xi, TOP, z0, xi, TOP, z1, xi, 0, z1);
      ctx.fill();
      if (az >= NEAR) {
        Cam.proj(Math.min(xi, xo), TOP, az);
        const x0 = P.x, y0 = P.y, sc = P.s;
        Cam.proj(Math.max(xi, xo), 0, az);
        const w = P.x - x0, h = P.y - y0;
        ctx.fillStyle = D3.shade(pal.wall, lit * 1.12, pal, az);
        ctx.fillRect(x0, y0, w, h);
        // base plinth + capital trims
        ctx.fillStyle = D3.shade(pal.wall, 0.7, pal, az);
        ctx.fillRect(x0, P.y - sc * 0.5, w, sc * 0.5);
        ctx.fillStyle = D3.shade(pal.accent, 0.8, pal, az);
        ctx.fillRect(x0, P.y - sc * 0.55, w, Math.max(1, sc * 0.06));
        ctx.fillRect(x0, Cam.sy(SY, az) - sc * 0.05, w, Math.max(1, sc * 0.1));
        // fluting
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(x0 + w * 0.3, Cam.sy(SY - 0.3, az), Math.max(1, w * 0.08), sc * (SY - 1.1));
        ctx.fillRect(x0 + w * 0.62, Cam.sy(SY - 0.3, az), Math.max(1, w * 0.08), sc * (SY - 1.1));
      }
    }
    if (az < NEAR) return;
    // arch faces (back face first, darker)
    const R = WX - PD;
    for (let pass = 0; pass < 2; pass++) {
      const z = pass === 0 ? az + PD : az;
      Cam.proj(-WX, TOP, z);
      const lx = P.x, ty = P.y;
      Cam.proj(WX, SY, z);
      const rx = P.x, sy = P.y, sc = P.s;
      const cx = (lx + rx) / 2;
      ctx.beginPath();
      ctx.rect(lx, ty, rx - lx, sy - ty);
      ctx.moveTo(cx + R * sc, sy);
      ctx.arc(cx, sy, R * sc, 0, Math.PI, true);
      ctx.closePath();
      ctx.fillStyle = D3.shade(pal.wall, pass === 0 ? 0.45 : 0.95, pal, z);
      ctx.fill('evenodd');
      if (pass === 1) {
        // voussoir joints
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = Math.max(1, sc * 0.03);
        ctx.beginPath();
        for (let i = 1; i < 9; i++) {
          const a = Math.PI + (i / 9) * Math.PI;
          ctx.moveTo(cx + Math.cos(a) * R * sc, sy + Math.sin(a) * R * sc);
          ctx.lineTo(cx + Math.cos(a) * (R + 0.9) * sc, sy + Math.sin(a) * (R + 0.9) * sc);
        }
        ctx.stroke();
        // gold trim
        ctx.strokeStyle = D3.shade(pal.accent, 0.85, pal, z);
        ctx.lineWidth = Math.max(1, sc * 0.08);
        ctx.beginPath();
        ctx.arc(cx, sy, R * sc, Math.PI, 0);
        ctx.stroke();
        ctx.lineWidth = Math.max(1, sc * 0.04);
        ctx.beginPath();
        ctx.arc(cx, sy, (R + 0.9) * sc, Math.PI, 0);
        ctx.stroke();
        // keystone rune
        const ky = sy - (R + 0.45) * sc;
        ctx.fillStyle = D3.shade(pal.wall, 1.2, pal, z);
        ctx.fillRect(cx - sc * 0.4, ky - sc * 0.5, sc * 0.8, sc * 1);
        ctx.globalCompositeOperation = 'lighter';
        const fk = 1 - D3.fogK(z);
        ctx.globalAlpha = (0.55 + 0.25 * Math.sin(t * 2 + k)) * fk;
        const gr = sc * 1.1;
        ctx.drawImage(zoneGlow(pal), cx - gr, ky - gr, gr * 2, gr * 2);
        ctx.globalAlpha = fk;
        ctx.strokeStyle = U.rgb(pal.accent);
        ctx.lineWidth = Math.max(1, sc * 0.06);
        ctx.beginPath();
        ctx.moveTo(cx, ky - sc * 0.3); ctx.lineTo(cx + sc * 0.2, ky); ctx.lineTo(cx, ky + sc * 0.3); ctx.lineTo(cx - sc * 0.2, ky);
        ctx.closePath();
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    drawTorch(ctx, -1, az, pal, t, k);
    drawTorch(ctx, 1, az, pal, t, k);
  }

  /* ---------------- escalating wall hazards (decor) ----------------
     The deeper the run and the hotter the zone, the more wall flame-throwers
     and spike racks line the corridor. Purely visual: they never reach the lanes. */
  function hazardLevel(wz, pal) {
    return U.clamp(wz / 2400, 0, 1) * 0.7 + pal.heat * 0.6 + Math.min(0.3, ER.Zones.loopAt(wz) * 0.15);
  }

  function drawWallJet(ctx, s, zc, pal, t, k) {
    if (zc < NEAR + 0.5) return;
    const xw = s * C.WALL_X, y = 1.25;
    const fa = 1 - D3.fogK(zc);
    // bronze dragon-head nozzle
    D3.box(ctx, Math.min(xw, xw - s * 0.5), Math.max(xw, xw - s * 0.5), y - 0.28, y + 0.28, zc - 0.3, zc + 0.3,
      D3.shade([150, 96, 40], 1, pal, zc), D3.shade([200, 140, 70], 1, pal, zc), D3.shade([90, 56, 24], 1, pal, zc));
    const period = 2.6, c = (t + k * 0.77 + (s > 0 ? 1.3 : 0)) % period;
    const on = c > period - 1.0;
    const warmup = U.clamp((c - (period - 1.5)) / 0.5, 0, 1);
    const nozX = xw - s * 0.5;
    ctx.globalCompositeOperation = 'lighter';
    if (Cam.proj(nozX, y, zc)) {
      const gr = P.s * (0.4 + warmup * 0.6);
      ctx.globalAlpha = (0.3 + 0.6 * warmup) * fa;
      ctx.drawImage(ER.Sprites.glow[2], P.x - gr, P.y - gr, gr * 2, gr * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
    if (!on) { ctx.globalAlpha = 1; return; }
    const k2 = U.clamp((c - (period - 1.0)) / 0.15, 0, 1) * U.clamp((period - c) / 0.15, 0, 1);
    const reach = 1.5 * k2; // stops before the curb at |x| = 3.35
    const fi = pal.flame;
    for (let j = 5; j >= 0; j--) {
      const fx = nozX - s * (j / 5) * reach;
      if (!Cam.proj(fx, y - 0.25 + j * 0.03, zc)) continue;
      const fh = P.s * (0.5 + j * 0.12) * (0.9 + 0.15 * Math.sin(t * 22 + j));
      ctx.globalAlpha = 0.9 * Math.max(0.3, fa);
      ctx.drawImage(ER.Sprites.flames[fi][((t * 16 + j + k) | 0) & 3], P.x - fh * 0.4, P.y - fh * 0.75, fh * 0.8, fh);
    }
    ctx.globalAlpha = 1;
  }

  function drawWallSpikes(ctx, s, z0, z1, pal, t) {
    if (z1 < NEAR + 0.5) return;
    z0 = Math.max(z0, NEAR + 0.5);
    const xw = s * C.WALL_X, out = s * 0.55;
    const light = D3.shade([190, 176, 156], 1, pal, (z0 + z1) / 2), dark = D3.shade([90, 80, 70], 1, pal, (z0 + z1) / 2);
    for (const y of [0.45, 1.15, 1.85]) {
      for (let z = z1 - 0.3; z >= z0; z -= 0.6) {
        Cam.proj(xw, y - 0.16, z); const ax = P.x, ay = P.y;
        Cam.proj(xw, y + 0.16, z); const bx = P.x, by = P.y;
        Cam.proj(xw - out, y, z); const tx = P.x, ty = P.y;
        ctx.fillStyle = light;
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(tx, ty); ctx.lineTo((ax + bx) / 2, (ay + by) / 2); ctx.fill();
        ctx.fillStyle = dark;
        ctx.beginPath(); ctx.moveTo((ax + bx) / 2, (ay + by) / 2); ctx.lineTo(tx, ty); ctx.lineTo(ax, ay); ctx.fill();
      }
    }
    if (pal.heat > 0.3) {
      // glowing rail the spikes are mounted on
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = U.rgba([255, 110, 30], 0.5 * pal.heat * (1 - D3.fogK(z0)));
      ctx.lineWidth = Math.max(1, Cam.scale(z0) * 0.05);
      ctx.beginPath();
      Cam.proj(xw, 0.12, z0); ctx.moveTo(P.x, P.y);
      Cam.proj(xw, 0.12, z1); ctx.lineTo(P.x, P.y);
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  function drawStructures(ctx, dist, t) {
    const SP = C.ARCH_SPACING;
    const first = Math.floor((dist + NEAR - SP) / SP), last = Math.floor((dist + C.MAX_Z) / SP);
    for (let k = last; k >= first; k--) {
      const aw = k * SP, az = aw - dist;
      const zc = az + SP / 2;
      if (zc < C.MAX_Z) {
        const palm = ER.Zones.at(aw + SP / 2);
        drawBanner(ctx, -1, zc, palm, t, k);
        drawBanner(ctx, 1, zc, palm, t, k + 5);
        if (k % 3 === 0) { drawStatue(ctx, -1, zc, palm); drawStatue(ctx, 1, zc, palm); }
        const hz = hazardLevel(aw, palm);
        for (let s = -1; s <= 1; s += 2) {
          const r = rnd(k * 11 + s + 7);
          if (r < hz * 0.55) drawWallJet(ctx, s, az + 3, palm, t, k);
          else if (r < hz * 0.95) drawWallSpikes(ctx, s, az + 8, az + 11, palm, t);
        }
      }
      if (az < C.MAX_Z - 2) drawArch(ctx, az, ER.Zones.at(aw), t, k);
    }
  }

  /* ---------------- ambient particles ---------------- */
  let ambientAcc = 0, torchAcc = 0;
  World.update = function (dt, dist) {
    World.time += dt;
    const Pt = ER.Particles;
    const low = ER.Settings.data.quality === 'low';
    const pal = ER.Zones.at(dist + 20);
    const rate = (low ? 0.4 : 1) * (pal.particle === 'snow' ? 46 : pal.particle === 'fire' ? 40 : 24);
    ambientAcc += dt * rate;
    while (ambientAcc > 1) {
      ambientAcc -= 1;
      const z = U.rand(2, 55);
      switch (pal.particle) {
        case 'snow':
          Pt.spawn({ x: U.rand(-6, 6), y: U.rand(3, 8), z, vx: U.rand(-0.4, 0.4), vy: U.rand(-1.6, -0.7), life: 3.5, size: U.rand(0.04, 0.08), col: U.chance(0.6) ? 1 : 3, g: 0 });
          break;
        case 'ash':
          if (U.chance(0.5)) Pt.spawn({ x: U.rand(-5, 5), y: U.rand(4, 8), z, vx: U.rand(-0.3, 0.3), vy: U.rand(-0.9, -0.3), life: 4, size: 0.05, col: 6, add: false, g: 0 });
          else Pt.spawn({ x: U.chance(0.5) ? U.rand(-5.2, -3.5) : U.rand(3.5, 5.2), y: 0.1, z, vx: U.rand(-0.3, 0.3), vy: U.rand(1.2, 3), life: 2.2, size: U.rand(0.05, 0.1), col: U.chance(0.7) ? 2 : 0, g: -0.3 });
          break;
        case 'fire':
          if (U.chance(0.55)) Pt.spawn({ x: U.chance(0.5) ? U.rand(-5.2, -3.4) : U.rand(3.4, 5.2), y: 0.1, z, vx: U.rand(-0.4, 0.4), vy: U.rand(2, 4.5), life: 1.6, size: U.rand(0.06, 0.13), col: U.chance(0.6) ? 2 : 5, g: -0.6 });
          else Pt.spawn({ x: U.rand(-5, 5), y: U.rand(5, 9), z, vx: U.rand(-0.4, 0.4), vy: U.rand(-1.4, -0.5), life: 3.5, size: U.rand(0.04, 0.08), col: U.chance(0.5) ? 0 : 2, g: 0 });
          break;
        case 'arcane':
          Pt.spawn({ x: U.rand(-5, 5), y: U.rand(0.3, 6), z, vx: U.rand(-0.3, 0.3), vy: U.rand(-0.2, 0.5), life: 3, size: U.rand(0.04, 0.09), col: U.chance(0.6) ? 4 : 0, g: 0 });
          break;
        default:
          Pt.spawn({ x: U.rand(-5, 5), y: U.rand(0, 2), z, vx: U.rand(-0.3, 0.3), vy: U.rand(0.6, 1.8), life: 2.6, size: U.rand(0.04, 0.08), col: U.chance(0.6) ? 2 : 0, g: -0.15 });
      }
    }
    // embers from the nearest torches
    torchAcc += dt * (low ? 6 : 14);
    while (torchAcc > 1) {
      torchAcc -= 1;
      const SP = C.ARCH_SPACING;
      const k = Math.floor(dist / SP) + U.randInt(1, 4);
      const z = k * SP - dist - 0.12;
      const s = U.chance(0.5) ? -1 : 1;
      const p2 = ER.Zones.at(k * SP);
      Pt.spawn({ x: s * (C.WALL_X - C.PILLAR_D / 2) + U.rand(-0.1, 0.1), y: 3.1, z, vx: U.rand(-0.3, 0.3), vy: U.rand(1, 2.4), life: U.rand(0.6, 1.3), size: U.rand(0.04, 0.07), col: [2, 3, 4][p2.flame], g: -0.4 });
    }
  };

  World.render = function (ctx, dist, t) {
    drawBackdrop(ctx, dist);
    drawFloor(ctx, dist, t);
    drawFloorLights(ctx, dist, t);
  };
  World.renderStructures = function (ctx, dist, t) {
    drawWalls(ctx, dist, t);
    drawStructures(ctx, dist, t);
  };
  World.zoneGlow = zoneGlow;

  ER.World = World;
})(window.ER = window.ER || {});
