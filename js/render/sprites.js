/* EGG RUN — procedurally pre-rendered sprites. Everything is drawn once into
   offscreen canvases at start-up and blitted with drawImage during play. */
(function (ER) {
  'use strict';
  const U = ER.U;
  const mk = U.makeCanvas;

  // Particle / glow colour table (index referenced by particles & world).
  const PCOL = [
    [255, 200, 90],  // 0 gold
    [255, 250, 235], // 1 white
    [255, 128, 40],  // 2 orange
    [120, 190, 255], // 3 blue
    [190, 120, 255], // 4 purple
    [255, 70, 50],   // 5 red
    [190, 160, 125], // 6 dust
    [140, 255, 230]  // 7 cyan
  ];

  const S = { PCOL, glow: [], flames: [], eggs: {}, orbs: {}, icons: {}, ready: false };

  function radial(ctx, x, y, r0, r1, stops) {
    const g = ctx.createRadialGradient(x, y, r0, x, y, r1);
    for (const s of stops) g.addColorStop(s[0], s[1]);
    return g;
  }
  function linear(ctx, x0, y0, x1, y1, stops) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    for (const s of stops) g.addColorStop(s[0], s[1]);
    return g;
  }
  S.radial = radial;
  S.linear = linear;

  /* ---------------- glows ---------------- */
  function makeGlow(c) {
    const cv = mk(64, 64), x = cv.getContext('2d');
    x.fillStyle = radial(x, 32, 32, 0, 32, [
      [0, `rgba(${c[0]},${c[1]},${c[2]},1)`],
      [0.18, `rgba(${c[0]},${c[1]},${c[2]},0.75)`],
      [0.45, `rgba(${c[0]},${c[1]},${c[2]},0.22)`],
      [1, `rgba(${c[0]},${c[1]},${c[2]},0)`]
    ]);
    x.fillRect(0, 0, 64, 64);
    return cv;
  }
  S.glowFor = function (rgb) {
    return makeGlow(rgb.map((v) => v | 0));
  };

  /* ---------------- flames ---------------- */
  function flamePath(x, cx, by, w, h, lean) {
    x.beginPath();
    x.moveTo(cx + lean, by - h);
    x.bezierCurveTo(cx + w * 0.12 + lean * 0.6, by - h * 0.62, cx + w * 0.55, by - h * 0.46, cx + w * 0.46, by - h * 0.18);
    x.bezierCurveTo(cx + w * 0.38, by + h * 0.03, cx - w * 0.38, by + h * 0.03, cx - w * 0.46, by - h * 0.18);
    x.bezierCurveTo(cx - w * 0.55, by - h * 0.46, cx - w * 0.12 + lean * 0.6, by - h * 0.62, cx + lean, by - h);
    x.closePath();
  }
  S.flamePath = flamePath;

  const FLAME_SCHEMES = [
    [['#ff3d0a', '#ff7a12'], ['#ff9a1f', '#ffc84a'], ['#fff6c8', '#ffe27a']],
    [['#1f5fff', '#3aa0ff'], ['#58c4ff', '#a8e6ff'], ['#ffffff', '#d8f4ff']],
    [['#7a1fff', '#b04dff'], ['#d07cff', '#f0b8ff'], ['#ffffff', '#ffe6ff']]
  ];
  function makeFlame(scheme, frame) {
    const cv = mk(64, 96), x = cv.getContext('2d');
    const cols = FLAME_SCHEMES[scheme];
    const leans = [0, 4, -3, 2];
    const lean = leans[frame];
    const layers = [[1, 1], [0.7, 0.78], [0.42, 0.52]];
    layers.forEach((l, i) => {
      flamePath(x, 32, 92, 56 * l[0], 88 * l[1], lean * (1 - i * 0.3));
      x.fillStyle = linear(x, 0, 92 - 88 * l[1], 0, 92, [[0, cols[i][0]], [1, cols[i][1]]]);
      x.globalAlpha = i === 0 ? 0.85 : 1;
      x.fill();
    });
    return cv;
  }

  /* ---------------- eggs ---------------- */
  function eggPath(x, cx, cy, w, h) {
    // cy = vertical centre; the top half is taller than the bottom half.
    const c0 = cy + h * 0.08;
    x.beginPath();
    x.ellipse(cx, c0, w / 2, h * 0.58, 0, Math.PI, Math.PI * 2);
    x.ellipse(cx, c0, w / 2, h * 0.42, 0, 0, Math.PI);
    x.closePath();
  }
  S.eggPath = eggPath;

  function cracks(x, rnd, w, h, color, count, glow) {
    x.save();
    x.strokeStyle = color;
    x.lineCap = 'round';
    x.lineJoin = 'round';
    x.shadowColor = glow;
    x.shadowBlur = 8;
    for (let i = 0; i < count; i++) {
      let px = w * (0.2 + rnd() * 0.6), py = h * (0.15 + rnd() * 0.7);
      let ang = rnd() * Math.PI * 2;
      x.lineWidth = 2.6 + rnd() * 1.6;
      x.beginPath();
      x.moveTo(px, py);
      const segs = 4 + ((rnd() * 4) | 0);
      for (let s = 0; s < segs; s++) {
        ang += (rnd() - 0.5) * 1.6;
        const len = 8 + rnd() * 14;
        px += Math.cos(ang) * len;
        py += Math.sin(ang) * len;
        x.lineTo(px, py);
        if (rnd() < 0.35) {
          // small branch
          const bx = px + Math.cos(ang + 1.2) * 10, by = py + Math.sin(ang + 1.2) * 10;
          x.moveTo(px, py);
          x.lineTo(bx, by);
          x.moveTo(px, py);
        }
      }
      x.stroke();
    }
    x.restore();
  }

  function makeEgg(type) {
    const w = 120, h = 150;
    const cv = mk(w, h), x = cv.getContext('2d');
    const rnd = U.mulberry32(type === 'normal' ? 7 : type === 'golden' ? 11 : 23);
    const ew = 96, eh = 128, cx = w / 2, cy = h / 2;
    let body;
    if (type === 'normal') {
      body = [[0, '#ffffff'], [0.35, '#fbf1dc'], [0.75, '#e2c79a'], [1, '#9c7647']];
    } else if (type === 'golden') {
      body = [[0, '#fffbe0'], [0.3, '#ffd75e'], [0.7, '#e59a24'], [1, '#8a4a0e']];
    } else {
      body = [[0, '#e8f6ff'], [0.3, '#6fb4ff'], [0.7, '#2c5ed8'], [1, '#101e66']];
    }
    eggPath(x, cx, cy, ew, eh);
    x.fillStyle = radial(x, cx - 18, cy - 30, 4, 90, body);
    x.fill();
    x.save();
    eggPath(x, cx, cy, ew, eh);
    x.clip();
    x.translate(cx - ew / 2, cy - eh / 2);
    if (type === 'normal') cracks(x, rnd, ew, eh, '#f2b53a', 5, '#ffcf55');
    if (type === 'golden') cracks(x, rnd, ew, eh, '#fff6c0', 6, '#ffffff');
    if (type === 'special') {
      // starry speckles
      for (let i = 0; i < 26; i++) {
        const sx = rnd() * ew, sy = rnd() * eh, r = 0.8 + rnd() * 2.4;
        x.fillStyle = rnd() < 0.3 ? '#ffe9a8' : '#ffffff';
        x.globalAlpha = 0.6 + rnd() * 0.4;
        x.beginPath();
        x.arc(sx, sy, r, 0, Math.PI * 2);
        x.fill();
      }
      x.globalAlpha = 1;
      for (let i = 0; i < 4; i++) star(x, rnd() * ew, 20 + rnd() * (eh - 40), 5 + rnd() * 5, '#ffffff');
    }
    x.restore();
    // specular highlight
    x.save();
    x.globalAlpha = 0.55;
    x.fillStyle = radial(x, cx - 20, cy - 34, 0, 26, [[0, 'rgba(255,255,255,0.95)'], [1, 'rgba(255,255,255,0)']]);
    x.beginPath();
    x.ellipse(cx - 20, cy - 32, 14, 22, -0.4, 0, Math.PI * 2);
    x.fill();
    x.restore();
    // thin rim
    eggPath(x, cx, cy, ew, eh);
    x.lineWidth = 2;
    x.strokeStyle = type === 'special' ? 'rgba(170,220,255,0.7)' : 'rgba(255,220,140,0.6)';
    x.stroke();
    return cv;
  }

  function star(x, cx, cy, r, color) {
    x.save();
    x.fillStyle = color;
    x.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 === 0 ? r : r * 0.32;
      x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    x.closePath();
    x.fill();
    x.restore();
  }
  S.star = star;

  /* ---------------- power-up icons ---------------- */
  function iconMagnet(x, s) {
    x.save();
    x.translate(s / 2, s / 2);
    x.scale(s / 128, s / 128);
    x.lineCap = 'butt';
    x.beginPath();
    x.moveTo(-30, 40);
    x.lineTo(-30, -2);
    x.arc(0, -2, 30, Math.PI, 0);
    x.lineTo(30, 40);
    x.lineWidth = 30;
    x.strokeStyle = linear(x, -40, -40, 40, 40, [[0, '#ff6a5a'], [0.5, '#d4161c'], [1, '#7a0610']]);
    x.stroke();
    x.lineWidth = 6;
    x.strokeStyle = 'rgba(255,200,180,0.55)';
    x.beginPath();
    x.moveTo(-38, 26);
    x.lineTo(-38, -2);
    x.arc(0, -2, 38, Math.PI, Math.PI * 1.5);
    x.stroke();
    // silver tips
    x.fillStyle = linear(x, -45, 0, 45, 0, [[0, '#f4f4f8'], [0.5, '#a9aeb8'], [1, '#e8e8ee']]);
    x.fillRect(-45, 30, 30, 18);
    x.fillRect(15, 30, 30, 18);
    x.strokeStyle = 'rgba(40,10,10,0.6)';
    x.lineWidth = 2;
    x.strokeRect(-45, 30, 30, 18);
    x.strokeRect(15, 30, 30, 18);
    x.restore();
  }
  function shieldPath(x) {
    x.beginPath();
    x.moveTo(0, -48);
    x.bezierCurveTo(18, -36, 34, -38, 42, -40);
    x.bezierCurveTo(44, 0, 30, 30, 0, 50);
    x.bezierCurveTo(-30, 30, -44, 0, -42, -40);
    x.bezierCurveTo(-34, -38, -18, -36, 0, -48);
    x.closePath();
  }
  function iconShield(x, s) {
    x.save();
    x.translate(s / 2, s / 2);
    x.scale(s / 128, s / 128);
    shieldPath(x);
    x.fillStyle = linear(x, -40, -50, 40, 50, [[0, '#fff1b0'], [0.4, '#f2b531'], [1, '#8a4f0c']]);
    x.fill();
    x.lineWidth = 5;
    x.strokeStyle = '#6b3a08';
    x.stroke();
    x.scale(0.72, 0.72);
    shieldPath(x);
    x.lineWidth = 4;
    x.strokeStyle = 'rgba(255,248,210,0.8)';
    x.stroke();
    // central ridge
    x.beginPath();
    x.moveTo(0, -46);
    x.lineTo(0, 46);
    x.strokeStyle = 'rgba(120,60,10,0.6)';
    x.lineWidth = 5;
    x.stroke();
    x.restore();
  }
  function wing(x, color1, color2) {
    // feathered wing pointing up-right, origin at wing root
    const feathers = [[0, 62, 16], [12, 56, 15], [24, 48, 14], [36, 38, 12], [48, 28, 10]];
    feathers.forEach((f, i) => {
      x.save();
      x.rotate(-0.95 + i * 0.28);
      x.beginPath();
      x.ellipse(f[1] * 0.5, 0, f[1] * 0.55, f[2] * 0.5, 0, 0, Math.PI * 2);
      x.fillStyle = linear(x, 0, 0, f[1], 0, [[0, color2], [1, color1]]);
      x.fill();
      x.strokeStyle = 'rgba(255,255,255,0.55)';
      x.lineWidth = 1.5;
      x.stroke();
      x.restore();
    });
  }
  function iconBoost(x, s) {
    x.save();
    x.translate(s / 2, s / 2);
    x.scale(s / 128, s / 128);
    // speed streaks
    x.strokeStyle = 'rgba(255,200,90,0.85)';
    x.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      x.lineWidth = 6 - i;
      x.beginPath();
      x.moveTo(-54, 6 + i * 14);
      x.lineTo(-22, 6 + i * 14);
      x.stroke();
    }
    x.translate(-12, 30);
    wing(x, '#fff7d0', '#ff9a1a');
    x.restore();
  }
  function iconDouble(x, s) {
    x.save();
    x.translate(s / 2, s / 2);
    x.scale(s / 128, s / 128);
    x.save();
    x.translate(-20, 34);
    x.scale(0.85, 0.85);
    wing(x, '#e6f6ff', '#2f8cff');
    x.restore();
    // up chevrons
    x.strokeStyle = '#bfe6ff';
    x.lineWidth = 7;
    x.lineCap = 'round';
    x.lineJoin = 'round';
    for (let i = 0; i < 2; i++) {
      x.beginPath();
      x.moveTo(22, -6 + i * 22);
      x.lineTo(38, -22 + i * 22);
      x.lineTo(54, -6 + i * 22);
      x.stroke();
    }
    x.restore();
  }
  function iconX2(x, s) {
    x.save();
    x.translate(s / 2, s / 2);
    x.scale(s / 128, s / 128);
    x.font = '900 70px Cinzel, Georgia, serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.lineWidth = 8;
    x.strokeStyle = '#4a2604';
    x.strokeText('2x', 0, 4);
    x.fillStyle = linear(x, 0, -30, 0, 36, [[0, '#fff6c4'], [0.45, '#ffc93d'], [1, '#b8630e']]);
    x.fillText('2x', 0, 4);
    x.restore();
  }
  const ICON_FN = { magnet: iconMagnet, shield: iconShield, boost: iconBoost, double: iconDouble, x2: iconX2 };

  function makeIcon(type, size) {
    const cv = mk(size, size), x = cv.getContext('2d');
    x.shadowColor = 'rgba(0,0,0,0.5)';
    x.shadowBlur = size * 0.05;
    ICON_FN[type](x, size);
    return cv;
  }

  function makeOrb(type) {
    const s = 160, cv = mk(s, s), x = cv.getContext('2d');
    const c = s / 2;
    x.fillStyle = radial(x, c, c, 10, 70, [[0, 'rgba(60,34,14,0.92)'], [1, 'rgba(18,10,6,0.92)']]);
    x.beginPath();
    x.arc(c, c, 66, 0, Math.PI * 2);
    x.fill();
    x.lineWidth = 7;
    x.strokeStyle = linear(x, 0, 0, s, s, [[0, '#fff0b0'], [0.5, '#d89a2c'], [1, '#7a4510']]);
    x.stroke();
    x.lineWidth = 2;
    x.strokeStyle = 'rgba(255,230,160,0.7)';
    x.beginPath();
    x.arc(c, c, 56, 0, Math.PI * 2);
    x.stroke();
    // little rivets
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      x.fillStyle = '#ffe39a';
      x.beginPath();
      x.arc(c + Math.cos(a) * 66, c + Math.sin(a) * 66, 3.4, 0, Math.PI * 2);
      x.fill();
    }
    const ic = makeIcon(type, 104);
    x.drawImage(ic, c - 52, c - 52);
    return cv;
  }

  /* ---------------- obstacle textures ---------------- */
  function makeCrateFace() {
    const s = 128, cv = mk(s, s), x = cv.getContext('2d');
    x.fillStyle = '#16110d';
    x.fillRect(0, 0, s, s);
    x.fillStyle = linear(x, 0, 0, 0, s, [[0, '#3a2c20'], [1, '#221810']]);
    x.fillRect(10, 10, s - 20, s - 20);
    // planks
    x.strokeStyle = 'rgba(0,0,0,0.45)';
    x.lineWidth = 2;
    for (let i = 1; i < 4; i++) {
      x.beginPath();
      x.moveTo(10, 10 + i * 27);
      x.lineTo(s - 10, 10 + i * 27);
      x.stroke();
    }
    // inner fire glow window
    x.fillStyle = radial(x, 64, 64, 4, 40, [[0, 'rgba(255,220,120,1)'], [0.4, 'rgba(255,120,30,0.8)'], [1, 'rgba(120,30,0,0)']]);
    x.fillRect(24, 24, 80, 80);
    // gold X braces
    x.strokeStyle = linear(x, 0, 0, s, s, [[0, '#ffe7a0'], [0.5, '#c88a2a'], [1, '#7a4a12']]);
    x.lineWidth = 9;
    x.lineCap = 'square';
    x.beginPath();
    x.moveTo(16, 16); x.lineTo(s - 16, s - 16);
    x.moveTo(s - 16, 16); x.lineTo(16, s - 16);
    x.stroke();
    // emblem: flame diamond
    x.save();
    x.translate(64, 64);
    x.rotate(Math.PI / 4);
    x.fillStyle = '#1a120c';
    x.fillRect(-15, -15, 30, 30);
    x.strokeStyle = '#ffd36a';
    x.lineWidth = 3;
    x.strokeRect(-15, -15, 30, 30);
    x.restore();
    flamePath(x, 64, 76, 18, 26, 0);
    x.fillStyle = '#ffb03a';
    x.fill();
    // frame
    x.strokeStyle = '#a8712a';
    x.lineWidth = 6;
    x.strokeRect(5, 5, s - 10, s - 10);
    x.strokeStyle = 'rgba(255,230,160,0.5)';
    x.lineWidth = 1.5;
    x.strokeRect(10, 10, s - 20, s - 20);
    // rivets
    x.fillStyle = '#ffd77a';
    [[10, 10], [s - 10, 10], [10, s - 10], [s - 10, s - 10]].forEach((p) => {
      x.beginPath(); x.arc(p[0], p[1], 4, 0, Math.PI * 2); x.fill();
    });
    return cv;
  }

  function stoneBlocks(x, w, h, base, rnd, rows) {
    x.fillStyle = base;
    x.fillRect(0, 0, w, h);
    const rh = h / rows;
    for (let r = 0; r < rows; r++) {
      const off = r % 2 ? 0 : 22;
      for (let bx = -off; bx < w; bx += 44) {
        const k = 0.75 + rnd() * 0.4;
        x.fillStyle = `rgba(${(90 * k) | 0},${(72 * k) | 0},${(58 * k) | 0},1)`;
        x.fillRect(bx + 2, r * rh + 2, 40, rh - 4);
        x.fillStyle = 'rgba(255,220,170,0.08)';
        x.fillRect(bx + 2, r * rh + 2, 40, 3);
      }
    }
  }

  function makeBarrierFace() {
    const w = 256, h = 96, cv = mk(w, h), x = cv.getContext('2d');
    const rnd = U.mulberry32(3);
    stoneBlocks(x, w, h, '#1b130e', rnd, 2);
    // gold trims
    x.fillStyle = linear(x, 0, 0, 0, 10, [[0, '#ffe39a'], [1, '#9c6420']]);
    x.fillRect(0, 0, w, 9);
    x.fillRect(0, h - 9, w, 9);
    // glowing rune
    x.save();
    x.translate(w / 2, h / 2);
    x.shadowColor = '#ffb040';
    x.shadowBlur = 14;
    x.strokeStyle = '#ffd36a';
    x.lineWidth = 4;
    x.beginPath();
    x.moveTo(0, -24); x.lineTo(18, 0); x.lineTo(0, 24); x.lineTo(-18, 0); x.closePath();
    x.moveTo(0, -12); x.lineTo(0, 12);
    x.stroke();
    x.restore();
    return cv;
  }

  function makeFudFace() {
    const w = 192, h = 240, cv = mk(w, h), x = cv.getContext('2d');
    const rnd = U.mulberry32(9);
    stoneBlocks(x, w, h, '#120c09', rnd, 7);
    x.fillStyle = 'rgba(0,0,0,0.35)';
    x.fillRect(0, 0, w, h);
    // banner
    const bw = 104, bx = (w - bw) / 2;
    x.fillStyle = linear(x, bx, 0, bx + bw, 0, [[0, '#5e0b0b'], [0.5, '#b0171a'], [1, '#5e0b0b']]);
    x.beginPath();
    x.moveTo(bx, 18); x.lineTo(bx + bw, 18); x.lineTo(bx + bw, 196); x.lineTo(w / 2, 222); x.lineTo(bx, 196);
    x.closePath();
    x.fill();
    x.strokeStyle = '#e0a63c';
    x.lineWidth = 4;
    x.stroke();
    x.fillStyle = '#e0a63c';
    x.fillRect(bx - 10, 12, bw + 20, 8);
    // FUD letters
    x.save();
    x.font = '900 46px Cinzel, Georgia, serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.shadowColor = '#ff3a1a';
    x.shadowBlur = 18;
    x.fillStyle = '#ffd88a';
    x.fillText('F', w / 2, 62);
    x.fillText('U', w / 2, 112);
    x.fillText('D', w / 2, 162);
    x.restore();
    // frame
    x.strokeStyle = '#8a5a22';
    x.lineWidth = 8;
    x.strokeRect(4, 4, w - 8, h - 8);
    x.strokeStyle = 'rgba(255,220,150,0.4)';
    x.lineWidth = 2;
    x.strokeRect(11, 11, w - 22, h - 22);
    return cv;
  }

  function makeRuneStrip() {
    const w = 384, h = 96, cv = mk(w, h), x = cv.getContext('2d');
    const rnd = U.mulberry32(5);
    x.strokeStyle = '#ffffff';
    x.lineWidth = 4;
    x.lineCap = 'round';
    x.shadowColor = '#ffffff';
    x.shadowBlur = 10;
    for (let i = 0; i < 8; i++) {
      const cx = 24 + i * 48, cy = h / 2;
      x.beginPath();
      const n = 3 + ((rnd() * 3) | 0);
      let px = cx + (rnd() - 0.5) * 20, py = cy + (rnd() - 0.5) * 40;
      x.moveTo(px, py);
      for (let k = 0; k < n; k++) {
        px = cx + (rnd() - 0.5) * 26;
        py = cy + (rnd() - 0.5) * 50;
        x.lineTo(px, py);
      }
      x.stroke();
      if (rnd() < 0.5) {
        x.beginPath();
        x.arc(cx, cy, 6 + rnd() * 6, 0, Math.PI * 2);
        x.stroke();
      }
    }
    return cv;
  }

  function makeWhale() {
    const w = 256, h = 240, cv = mk(w, h), x = cv.getContext('2d');
    const cx = w / 2;
    // fins
    x.fillStyle = '#121a33';
    x.beginPath();
    x.ellipse(cx - 98, 168, 40, 18, 0.5, 0, Math.PI * 2);
    x.ellipse(cx + 98, 168, 40, 18, -0.5, 0, Math.PI * 2);
    x.fill();
    // body
    x.fillStyle = radial(x, cx - 30, 70, 10, 150, [[0, '#3a4f86'], [0.45, '#1a2548'], [1, '#070a18']]);
    x.beginPath();
    x.ellipse(cx, 130, 104, 104, 0, 0, Math.PI * 2);
    x.fill();
    // belly
    x.fillStyle = radial(x, cx, 210, 10, 90, [[0, '#8fa4cc'], [1, '#3b4a72']]);
    x.beginPath();
    x.ellipse(cx, 196, 70, 40, 0, Math.PI, Math.PI * 2);
    x.lineTo(cx + 70, 196);
    x.ellipse(cx, 196, 70, 30, 0, 0, Math.PI);
    x.fill();
    x.strokeStyle = 'rgba(20,28,60,0.6)';
    x.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      x.beginPath();
      x.moveTo(cx - 50 + i * 6, 178 + i * 9);
      x.quadraticCurveTo(cx, 186 + i * 9, cx + 50 - i * 6, 178 + i * 9);
      x.stroke();
    }
    // brow spikes
    x.fillStyle = '#0b1022';
    for (let i = -2; i <= 2; i++) {
      x.beginPath();
      x.moveTo(cx + i * 22 - 10, 40 + Math.abs(i) * 8);
      x.lineTo(cx + i * 22, 14 + Math.abs(i) * 10);
      x.lineTo(cx + i * 22 + 10, 40 + Math.abs(i) * 8);
      x.fill();
    }
    // eyes (glow added at runtime too)
    [-1, 1].forEach((sgn) => {
      const ex = cx + sgn * 40, ey = 112;
      x.fillStyle = radial(x, ex, ey, 1, 22, [[0, '#fffbd0'], [0.35, '#ffcf3a'], [1, 'rgba(255,140,0,0)']]);
      x.beginPath(); x.arc(ex, ey, 22, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#1a0d00';
      x.beginPath(); x.ellipse(ex + sgn * 2, ey + 1, 3.5, 8, 0, 0, Math.PI * 2); x.fill();
      // angry brow
      x.strokeStyle = '#05070f';
      x.lineWidth = 7;
      x.lineCap = 'round';
      x.beginPath();
      x.moveTo(ex - sgn * 18, ey - 26);
      x.lineTo(ex + sgn * 14, ey - 14);
      x.stroke();
    });
    // mouth with teeth
    x.fillStyle = '#05060c';
    x.beginPath();
    x.moveTo(cx - 52, 150);
    x.quadraticCurveTo(cx, 182, cx + 52, 150);
    x.quadraticCurveTo(cx, 166, cx - 52, 150);
    x.fill();
    x.fillStyle = '#f2ead4';
    for (let i = -3; i <= 3; i++) {
      const tx = cx + i * 13, ty = 157 + (9 - Math.abs(i) * 2.2);
      x.beginPath(); x.moveTo(tx - 4, ty - 4); x.lineTo(tx, ty + 6); x.lineTo(tx + 4, ty - 4); x.fill();
    }
    // warm rim light
    x.save();
    x.globalCompositeOperation = 'source-atop';
    x.fillStyle = linear(x, 0, 0, w, 0, [[0, 'rgba(255,150,60,0.35)'], [0.2, 'rgba(255,150,60,0)'], [0.8, 'rgba(255,150,60,0)'], [1, 'rgba(255,150,60,0.35)']]);
    x.fillRect(0, 0, w, h);
    x.restore();
    return cv;
  }

  function makeRoller() {
    const s = 160, cv = mk(s, s), x = cv.getContext('2d');
    const c = s / 2;
    // spikes
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      x.save();
      x.translate(c, c);
      x.rotate(a);
      x.fillStyle = linear(x, 0, -10, 0, 10, [[0, '#ffe7a0'], [1, '#8a5414']]);
      x.beginPath();
      x.moveTo(44, -11); x.lineTo(76, 0); x.lineTo(44, 11);
      x.fill();
      x.restore();
    }
    x.fillStyle = radial(x, c - 16, c - 18, 4, 60, [[0, '#6b5644'], [0.5, '#2e241c'], [1, '#0e0a07']]);
    x.beginPath(); x.arc(c, c, 50, 0, Math.PI * 2); x.fill();
    // magma cracks
    const rnd = U.mulberry32(13);
    x.save();
    x.beginPath(); x.arc(c, c, 50, 0, Math.PI * 2); x.clip();
    x.translate(c - 50, c - 50);
    cracks(x, rnd, 100, 100, '#ff8a1e', 5, '#ff5a00');
    x.restore();
    x.lineWidth = 3;
    x.strokeStyle = '#b0742a';
    x.beginPath(); x.arc(c, c, 50, 0, Math.PI * 2); x.stroke();
    return cv;
  }

  function makeStatue() {
    const w = 140, h = 220, cv = mk(w, h), x = cv.getContext('2d');
    const cx = w / 2;
    const stone = linear(x, 0, 0, w, 0, [[0, '#4a3a2e'], [0.35, '#231a14'], [1, '#0d0907']]);
    x.fillStyle = stone;
    // folded wings
    x.beginPath();
    x.moveTo(cx - 20, 80); x.lineTo(cx - 62, 20); x.lineTo(cx - 50, 120); x.closePath();
    x.moveTo(cx + 20, 80); x.lineTo(cx + 62, 20); x.lineTo(cx + 50, 120); x.closePath();
    x.fill();
    // body
    x.beginPath(); x.ellipse(cx, 150, 46, 62, 0, 0, Math.PI * 2); x.fill();
    // haunches
    x.beginPath(); x.ellipse(cx - 30, 190, 24, 28, 0, 0, Math.PI * 2); x.ellipse(cx + 30, 190, 24, 28, 0, 0, Math.PI * 2); x.fill();
    // head
    x.beginPath(); x.ellipse(cx, 70, 32, 28, 0, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.ellipse(cx, 88, 20, 16, 0, 0, Math.PI * 2); x.fill();
    // horns
    x.beginPath();
    x.moveTo(cx - 18, 52); x.quadraticCurveTo(cx - 34, 30, cx - 30, 12); x.lineTo(cx - 8, 46);
    x.moveTo(cx + 18, 52); x.quadraticCurveTo(cx + 34, 30, cx + 30, 12); x.lineTo(cx + 8, 46);
    x.fill();
    // ears
    x.beginPath();
    x.moveTo(cx - 28, 66); x.lineTo(cx - 52, 54); x.lineTo(cx - 30, 80);
    x.moveTo(cx + 28, 66); x.lineTo(cx + 52, 54); x.lineTo(cx + 30, 80);
    x.fill();
    // rim light (left side = towards the corridor centre; flip for the other wall)
    x.save();
    x.globalCompositeOperation = 'source-atop';
    x.fillStyle = linear(x, 0, 0, w * 0.45, 0, [[0, 'rgba(255,170,80,0.45)'], [1, 'rgba(255,170,80,0)']]);
    x.fillRect(0, 0, w, h);
    x.restore();
    // eyes
    [-1, 1].forEach((sg) => {
      x.fillStyle = radial(x, cx + sg * 12, 70, 0, 8, [[0, '#fff2b0'], [0.4, '#ff9a2a'], [1, 'rgba(255,90,0,0)']]);
      x.beginPath(); x.arc(cx + sg * 12, 70, 8, 0, Math.PI * 2); x.fill();
    });
    return cv;
  }

  function toURL(cv) {
    try { return cv.toDataURL('image/png'); } catch (e) { return ''; }
  }

  S.build = function () {
    S.glow = PCOL.map(makeGlow);
    S.flames = [0, 1, 2].map((sc) => [0, 1, 2, 3].map((f) => makeFlame(sc, f)));
    ['normal', 'golden', 'special'].forEach((t) => { S.eggs[t] = makeEgg(t); });
    ER.CFG.POWER_TYPES.forEach((t) => {
      S.orbs[t] = makeOrb(t);
      S.icons[t] = makeIcon(t, 96);
    });
    S.crate = makeCrateFace();
    S.barrier = makeBarrierFace();
    S.fud = makeFudFace();
    S.runes = makeRuneStrip();
    S.whale = makeWhale();
    S.roller = makeRoller();
    S.statue = makeStatue();
    S.urls = {
      icons: {},
      eggs: { normal: toURL(S.eggs.normal), golden: toURL(S.eggs.golden), special: toURL(S.eggs.special) },
      crate: toURL(S.crate), barrier: toURL(S.barrier), fud: toURL(S.fud), whale: toURL(S.whale), roller: toURL(S.roller)
    };
    ER.CFG.POWER_TYPES.forEach((t) => { S.urls.icons[t] = toURL(S.icons[t]); });
    S.ready = true;
  };

  ER.Sprites = S;
})(window.ER = window.ER || {});
