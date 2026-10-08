/* EGG RUN — procedural obstacle / egg / power-up spawner.
   Every generated row guarantees at least one lane passable without changing lanes
   (jump / slide / free), and rows are spaced by speed so there is reaction time.
   The obstacle mix depends on the zone: fire jets, lava pools and meteors in the
   hot zones, hanging ice in the frozen temple, and everything gets denser over time. */
(function (ER) {
  'use strict';
  const C = ER.CFG, U = ER.U, E = ER.Entities;
  const LANES = C.LANES;

  // Lane contents the player can get through by jumping, sliding or simply running.
  const PASS = new Set(['barrier', 'spikes', 'column', 'gap', 'lava', 'gate', 'hang', 'roller']);
  const passable = (t) => t === null || PASS.has(t);
  const JUMP = new Set(['barrier', 'spikes', 'column', 'gap', 'lava']);
  const SLIDE = new Set(['gate', 'hang']);

  const S = {
    nextWz: 0,
    nextPowerWz: 0,
    trailLane: 1,
    extraGap: 0,
    lastPattern: '',

    reset() {
      this.nextWz = 44;
      this.nextPowerWz = U.rand(150, 230);
      this.trailLane = 1;
      this.extraGap = 0;
      this.lastPattern = '';
      this.prevRowEnd = 34;
      // opening egg trail to greet the player
      for (let i = 0; i < 10; i++) E.addEgg('normal', 0, 0.35, 10 + i * 3);
    },

    difficulty(dist) {
      return U.clamp(dist / C.DIFFICULTY_RAMP, 0, 1);
    },

    update(game) {
      while (this.nextWz < game.dist + C.SPAWN_AHEAD) this.spawnRow(game);
    },

    eggType() {
      const vault = ER.Zones.idAt(this.nextWz) === 'vault';
      const r = Math.random();
      if (r < (vault ? 0.025 : 0.006)) return 'special';
      if (r < (vault ? 0.09 : 0.045)) return 'golden';
      return 'normal';
    },

    /** Straight trail of eggs on a lane between two world positions. */
    trail(lane, from, to, y) {
      const step = 2.6;
      for (let z = from; z <= to; z += step) E.addEgg(this.eggType(), LANES[lane], y === undefined ? 0.35 : y, z);
    },

    /** Arc of eggs following the jump curve over an obstacle. */
    arc(lane, center, speedEstimate, high) {
      const span = Math.max(7, speedEstimate * 0.62);
      const n = 5;
      for (let i = 0; i < n; i++) {
        const k = i / (n - 1);
        const z = center - span / 2 + k * span;
        const y = 0.35 + Math.sin(k * Math.PI) * (high ? 2.6 : 1.55);
        E.addEgg(i === 2 && U.chance(0.35) ? 'golden' : this.eggType(), LANES[lane], y, z);
      }
    },

    choosePattern(d, zone) {
      const hot = zone === 'lava' || zone === 'inferno';
      const ice = zone === 'frost';
      const inferno = zone === 'inferno';
      return U.weighted([
        { v: 'single', w: 3 - 2.3 * d },
        { v: 'double', w: d > 0.03 ? 1.2 + 2 * d : 0 },
        { v: 'triple', w: d > 0.18 ? 0.6 + 2.2 * d : 0 },
        { v: 'jumpRow', w: d > 0.06 ? 0.8 : 0 },
        { v: 'slideRow', w: d > 0.07 ? 0.8 * (ice ? 1.8 : 1) : 0 },
        { v: 'spikeField', w: d > 0.04 ? 0.9 + d : 0 },
        { v: 'column', w: d > 0.06 ? 0.8 : 0 },
        { v: 'fud', w: d > 0.1 ? 0.7 : 0 },
        { v: 'whale', w: d > 0.15 ? 0.6 + d : 0 },
        { v: 'roller', w: d > 0.18 ? (0.5 + d) * (hot ? 1.6 : 1) : 0 },
        { v: 'gaps', w: d > 0.08 ? (0.6 + d) * (hot ? 2 : 1) : 0 },
        { v: 'jets', w: d > 0.1 || hot ? (0.6 + d) * (hot ? 2.2 : 0.8) : 0 },
        { v: 'meteors', w: (hot && d > 0.12) || d > 0.5 ? (0.5 + d) * (inferno ? 2.4 : hot ? 1.6 : 0.5) : 0 },
        { v: 'eggRun', w: (this.lastPattern === 'eggRun' ? 0 : 0.6 - 0.4 * d) * (zone === 'vault' ? 1.3 : 1) }
      ]);
    },

    spawnRow(game) {
      const d = this.difficulty(this.nextWz);
      const zone = ER.Zones.idAt(this.nextWz);
      const hot = zone === 'lava' || zone === 'inferno';
      const ice = zone === 'frost';
      const speed = game.baseSpeedAt(this.nextWz);
      let pattern = this.choosePattern(d, zone);
      if (pattern === 'roller' && this.lastPattern === 'roller') pattern = 'single';
      if (pattern === this.lastPattern && pattern !== 'single' && pattern !== 'double' && U.chance(0.6)) pattern = 'double';
      if (pattern === 'roller') this.nextWz += 14; // room for the trap to roll into
      const R = this.nextWz;
      const prevTrailEnd = this.prevRowEnd === undefined ? R - 20 : this.prevRowEnd;

      const lanes = [null, null, null];
      const wide = []; // multi-lane obstacles: {type, from, to}
      const gapType = hot ? 'lava' : 'gap';
      const lowType = () => U.weighted([
        { v: 'barrier', w: 1.2 }, { v: 'spikes', w: d > 0.02 ? 1.4 : 0 }, { v: gapType, w: d > 0.08 ? 0.8 : 0 }
      ]);
      const highType = () => (ice || (d > 0.1 && U.chance(0.4)) ? 'hang' : 'gate');
      const blockType = () => U.weighted([
        { v: 'crate', w: 3 }, { v: 'whale', w: d > 0.15 ? 1 : 0 },
        { v: 'flamejet', w: d > 0.12 || hot ? (hot ? 1.6 : 0.7) : 0 },
        { v: 'meteor', w: hot && d > 0.15 ? 1 : 0 }
      ]);
      const passType = () => (U.chance(0.55) ? lowType() : highType());
      let rowLen = 1.6;

      switch (pattern) {
        case 'single': {
          const l = U.randInt(0, 2);
          lanes[l] = U.weighted([
            { v: 'crate', w: 2.6 }, { v: 'barrier', w: 1.4 }, { v: 'spikes', w: 1.4 },
            { v: 'gate', w: d > 0.04 ? 1.1 : 0 }, { v: 'hang', w: d > 0.06 ? (ice ? 2.4 : 0.9) : 0 },
            { v: gapType, w: d > 0.08 || hot ? 1.1 : 0 }, { v: 'whale', w: d > 0.15 ? 1 : 0 },
            { v: 'flamejet', w: d > 0.08 || hot ? (hot ? 1.8 : 0.9) : 0 },
            { v: 'meteor', w: hot && d > 0.12 ? 1.2 : 0 }
          ]);
          break;
        }
        case 'double': {
          const free = U.randInt(0, 2);
          for (let i = 0; i < 3; i++) if (i !== free) lanes[i] = U.chance(0.65) ? blockType() : passType();
          if (U.chance(d * 0.6)) lanes[free] = passType();
          break;
        }
        case 'triple': {
          const open = U.randInt(0, 2);
          for (let i = 0; i < 3; i++) lanes[i] = i === open ? passType() : (U.chance(0.7) ? blockType() : passType());
          break;
        }
        case 'jumpRow': {
          if (U.chance(0.3)) { wide.push({ type: 'column', from: 0, to: 2 }); break; }
          const t = hot && U.chance(0.6) ? 'lava' : U.pick(['barrier', 'spikes', 'spikes', gapType]);
          for (let i = 0; i < 3; i++) lanes[i] = t;
          break;
        }
        case 'slideRow': {
          const t = highType();
          for (let i = 0; i < 3; i++) lanes[i] = t;
          break;
        }
        case 'spikeField': {
          const n = d > 0.3 && U.chance(0.4) ? 3 : 2;
          const order = [0, 1, 2].sort(() => Math.random() - 0.5);
          for (let i = 0; i < n; i++) lanes[order[i]] = 'spikes';
          if (n === 2 && U.chance(0.35 + d * 0.4)) lanes[order[2]] = blockType();
          break;
        }
        case 'column': {
          const left = U.chance(0.5);
          wide.push({ type: 'column', from: left ? 0 : 1, to: left ? 1 : 2 });
          const other = left ? 2 : 0;
          if (U.chance(0.5 + d * 0.3)) lanes[other] = U.chance(0.6) ? blockType() : highType();
          break;
        }
        case 'fud': {
          const left = U.chance(0.5);
          wide.push({ type: 'fud', from: left ? 0 : 1, to: left ? 1 : 2 });
          const other = left ? 2 : 0;
          if (U.chance(d * 0.7)) lanes[other] = passType();
          break;
        }
        case 'whale': {
          const l = U.randInt(0, 2);
          lanes[l] = 'whale';
          const o = (l + U.randInt(1, 2)) % 3;
          if (U.chance(0.4 + d * 0.4)) lanes[o] = U.chance(0.5) ? 'crate' : lowType();
          rowLen = 2.2;
          break;
        }
        case 'roller': {
          const l = U.randInt(0, 2);
          lanes[l] = 'roller';
          if (d > 0.4 && U.chance(0.5)) lanes[(l + U.randInt(1, 2)) % 3] = 'roller';
          break;
        }
        case 'gaps': {
          const count = d > 0.3 && U.chance(0.35) ? 3 : U.randInt(1, 2);
          const order = [0, 1, 2].sort(() => Math.random() - 0.5);
          for (let i = 0; i < count; i++) lanes[order[i]] = gapType;
          if (count < 3 && d > 0.25 && U.chance(0.45)) lanes[order[2]] = blockType();
          rowLen = 4.4;
          break;
        }
        case 'jets': {
          const n = d > 0.25 && U.chance(0.55) ? 2 : 1;
          const order = [0, 1, 2].sort(() => Math.random() - 0.5);
          for (let i = 0; i < n; i++) lanes[order[i]] = 'flamejet';
          if (n === 1 && U.chance(0.5)) lanes[order[1]] = U.chance(0.5) ? 'spikes' : blockType();
          if (U.chance(d * 0.5)) lanes[order[2]] = passType();
          break;
        }
        case 'meteors': {
          const n = d > 0.3 && U.chance(0.5) ? 2 : 1;
          const order = [0, 1, 2].sort(() => Math.random() - 0.5);
          for (let i = 0; i < n; i++) lanes[order[i]] = 'meteor';
          if (n === 1 && U.chance(0.4)) lanes[order[1]] = lowType();
          rowLen = 1.8;
          break;
        }
        case 'eggRun':
        default:
          break;
      }

      for (const w of wide) for (let i = w.from; i <= w.to; i++) lanes[i] = w.type;
      // Fairness: at least one lane must be passable without changing lanes.
      if (!lanes.some(passable)) {
        const i = U.randInt(0, 2);
        for (let k = wide.length - 1; k >= 0; k--) if (i >= wide[k].from && i <= wide[k].to) wide.splice(k, 1);
        for (const w of wide) for (let j = w.from; j <= w.to; j++) lanes[j] = w.type;
        lanes[i] = null;
      }

      // Spawn obstacles
      for (const w of wide) {
        const ob = E.addObstacle(w.type, (LANES[w.from] + LANES[w.to]) / 2, R, w.to - w.from + 1);
        rowLen = Math.max(rowLen, ob.len);
      }
      for (let i = 0; i < 3; i++) {
        const t = lanes[i];
        if (!t || wide.some((w) => i >= w.from && i <= w.to)) continue;
        const ob = E.addObstacle(t, LANES[i], R);
        if (t === 'gap' || t === 'lava') ob.len = U.clamp(3.4 + speed * 0.06, 3.6, 5.6);
        rowLen = Math.max(rowLen, ob.len);
      }

      // Pick the lane the egg trail will guide the player through.
      const candidates = [];
      for (let i = 0; i < 3; i++) if (passable(lanes[i]) && lanes[i] !== 'roller') candidates.push(i);
      if (!candidates.length) for (let i = 0; i < 3; i++) if (passable(lanes[i])) candidates.push(i);
      let lane = candidates.indexOf(this.trailLane) >= 0 && U.chance(0.55) ? this.trailLane : U.pick(candidates);

      if (pattern === 'eggRun') {
        // zig-zag trail rewarding lane changes
        let l = this.trailLane;
        for (let z = prevTrailEnd + 4; z < R + 20; z += 2.6) {
          if (U.chance(0.12)) l = U.clamp(l + (U.chance(0.5) ? 1 : -1), 0, 2);
          E.addEgg(U.chance(0.06) ? 'golden' : this.eggType(), LANES[l], 0.35, z);
        }
        lane = l;
        rowLen = 20;
      } else if (U.chance(0.82)) {
        // lead-in trail in the chosen lane, then the action over the obstacle
        const half = (prevTrailEnd + R) / 2;
        if (lane !== this.trailLane && U.chance(0.6)) {
          this.trail(this.trailLane, prevTrailEnd + 4, half - 2);
          this.trail(lane, half + 1, R - 5);
        } else {
          this.trail(lane, Math.max(prevTrailEnd + 4, R - 22), R - 5);
        }
        const t = lanes[lane];
        if (JUMP.has(t)) this.arc(lane, R + (t === 'gap' || t === 'lava' ? rowLen / 2 : 0.4), speed, false);
        else if (SLIDE.has(t)) { for (let z = R - 2; z <= R + 2; z += 2) E.addEgg(this.eggType(), LANES[lane], 0.3, z); }
        else if (t === null) this.trail(lane, R - 2, R + 3);
      }
      this.trailLane = lane;

      // Power-ups between rows, placed on the safe lane before the obstacle.
      if (R > this.nextPowerWz && pattern !== 'roller') {
        const type = this.pickPower(game);
        const pz = R - Math.max(9, speed * 0.5);
        for (const e of E.list) if (e.cat === 'egg' && Math.abs(e.wz - pz) < 1.6 && Math.abs(e.x - LANES[lane]) < 0.5) e.dead = true;
        E.addPower(type, LANES[lane], pz);
        this.nextPowerWz = R + U.rand(240, 420);
      }

      const spacing = speed * U.lerp(1.08, 0.6, d) + 7;
      this.prevRowEnd = R + rowLen;
      this.nextWz = R + rowLen + spacing + this.extraGap + (pattern === 'roller' ? 10 : 0);
      this.extraGap = 0;
      this.lastPattern = pattern;
    },

    pickPower(game) {
      const pw = game.power;
      return U.weighted([
        { v: 'magnet', w: pw.active.magnet > 0 ? 0.3 : 1.3 },
        { v: 'shield', w: pw.active.shield > 0 ? 0.1 : 1.1 },
        { v: 'boost', w: 0.8 },
        { v: 'x2', w: pw.active.x2 > 0 ? 0.3 : 1 },
        { v: 'double', w: pw.active.double > 0 ? 0.2 : 0.9 }
      ]);
    }
  };

  ER.Spawner = S;
})(window.ER = window.ER || {});
