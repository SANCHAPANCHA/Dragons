/* EGG RUN — game state machine, main loop and render pipeline. */
(function (ER) {
  'use strict';
  const C = ER.CFG, U = ER.U, Cam = ER.Cam;

  const visible = [];
  const speedLines = [];
  for (let i = 0; i < 40; i++) speedLines.push({ a: Math.random() * Math.PI * 2, r: Math.random(), l: 0.1 + Math.random() * 0.2 });

  const Game = {
    state: 'menu',         // menu | playing | paused | dying | over
    time: 0,
    dist: 0,
    speed: 0,
    timeScale: 1,
    player: null,
    power: null,
    score: null,
    zoneIndex: 0,
    nextMilestone: 500,
    flash: 0,
    flashColor: '255,255,255',

    init(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.player = ER.Player;
      this.power = ER.PowerUps;
      this.score = ER.Scoring;
      this.player.reset();
      this.power.reset();
      this.score.reset();
      this.resize();
      window.addEventListener('resize', () => this.resize());
      window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 120));
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          if (this.state === 'playing') this.pause();
          ER.Audio.suspend();
        } else {
          ER.Audio.resume();
        }
      });
      this.last = performance.now();
      requestAnimationFrame((t) => this.frame(t));
    },

    resize() {
      const w = window.innerWidth, h = window.innerHeight;
      const dprMax = ER.Settings.data.quality === 'low' ? 1 : 2;
      const dpr = Math.min(window.devicePixelRatio || 1, dprMax);
      this.canvas.width = Math.floor(w * dpr);
      this.canvas.height = Math.floor(h * dpr);
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
      Cam.resize(w, h, dpr);
      this.buildVignette(w, h);
    },

    buildVignette(w, h) {
      const v = U.makeCanvas(Math.max(2, w / 2), Math.max(2, h / 2));
      const x = v.getContext('2d');
      const g = x.createRadialGradient(v.width / 2, v.height * 0.55, Math.min(v.width, v.height) * 0.25, v.width / 2, v.height * 0.5, Math.max(v.width, v.height) * 0.75);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.7, 'rgba(0,0,0,0.35)');
      g.addColorStop(1, 'rgba(0,0,0,0.78)');
      x.fillStyle = g;
      x.fillRect(0, 0, v.width, v.height);
      this.vignette = v;
    },

    /** Gradual speed-up: distance + zones entered + score so far. */
    baseSpeedAt(d) {
      d = Math.max(0, d);
      const score = this.score ? this.score.score : 0;
      const v = C.START_SPEED
        + C.MAX_SPEED_ADD * (1 - Math.exp(-d / C.SPEED_RAMP))
        + C.ZONE_SPEED * ER.Zones.stepsAt(d, C.ZONE_EASE)
        + Math.min(C.SCORE_SPEED_MAX, C.SCORE_SPEED * Math.log2(1 + score / C.SCORE_UNIT));
      return Math.min(C.MAX_SPEED, v);
    },

    /* ---------------- lifecycle ---------------- */
    start() {
      ER.Entities.clear();
      ER.Particles.clear();
      this.player.reset();
      this.power.reset();
      this.score.reset();
      this.dist = 0;
      this.speed = C.START_SPEED * 0.6;
      this.timeScale = 1;
      this.zoneIndex = 0;
      this.nextMilestone = 500;
      this.flash = 0;
      Cam.x = 0; Cam.zoom = 1.08; Cam.shake = 0;
      ER.Spawner.reset();
      this.state = 'playing';
      ER.UI.showHUD(true);
      ER.UI.zoneBanner(ER.Zones.list[0].name, 'ZONE 1');
    },

    pause() {
      if (this.state !== 'playing') return;
      this.state = 'paused';
      ER.UI.showPause(true);
    },

    resume() {
      if (this.state !== 'paused') return;
      ER.UI.showPause(false);
      this.state = 'playing';
      this.last = performance.now();
    },

    quitToMenu() {
      ER.Entities.clear();
      ER.Particles.clear();
      this.state = 'menu';
      this.timeScale = 1;
      Cam.zoom = 1;
      ER.UI.showHUD(false);
      ER.UI.showScreen('menu');
    },

    action(a) {
      if (a === 'pause') {
        if (this.state === 'playing') this.pause();
        else if (this.state === 'paused') this.resume();
        return;
      }
      if (this.state !== 'playing') return;
      const p = this.player;
      if (a === 'left') p.move(-1, this);
      else if (a === 'right') p.move(1, this);
      else if (a === 'jump') p.jump(this);
      else if (a === 'slide') p.slide(this);
    },

    /* ---------------- events ---------------- */
    collectEgg(e) {
      e.dead = true;
      const z = e.wz - this.dist;
      const r = this.score.addEgg(e.type, this.power.active.x2 > 0);
      const Pt = ER.Particles;
      if (e.type === 'normal') {
        Pt.burst(e.x, e.y + 0.4, z, 10, { cols: [0, 1], speed: 3.5, g: 3, life: 0.45, size: 0.1, world: false });
        Pt.text('+' + r.eggs, e.x, e.y + 1.1, Math.max(0.5, z), '#ffe39a', 0.9);
        ER.Audio.play('egg', this.score.comboCount);
      } else if (e.type === 'golden') {
        Pt.burst(e.x, e.y + 0.4, z, 22, { cols: [0, 0, 1, 2], speed: 5, g: 3, life: 0.7, size: 0.13, world: false });
        Pt.text('+' + r.eggs, e.x, e.y + 1.2, Math.max(0.5, z), '#ffd04a', 1.25);
        ER.Audio.play('golden');
        Cam.addShake(0.08);
      } else {
        Pt.burst(e.x, e.y + 0.4, z, 34, { cols: [3, 1, 4, 7], speed: 6, g: 2, life: 0.9, size: 0.15, world: false });
        Pt.text('+' + r.eggs, e.x, e.y + 1.3, Math.max(0.5, z), '#9fd8ff', 1.5);
        ER.Audio.play('special');
        this.flash = 0.25; this.flashColor = '140,200,255';
        Cam.addShake(0.15);
      }
      this.player.collectT = 0.22;
      if (r.levelUp) {
        ER.UI.comboPop(r.levelUp);
        ER.Audio.play('combo');
      }
    },

    collectPower(e) {
      e.dead = true;
      const z = e.wz - this.dist;
      this.power.activate(e.type, this);
      ER.Particles.burst(e.x, e.y + 0.3, z, 30, { cols: [0, 1, 0, 2], speed: 6, g: 1, life: 0.8, size: 0.16, world: false });
      ER.Particles.text(C.POWER[e.type].label, e.x, e.y + 1.4, Math.max(1, z), '#fff1b8', 1.1);
      this.flash = 0.22; this.flashColor = '255,214,120';
      ER.UI.toast(C.POWER[e.type].label + '!');
    },

    smash(e) {
      e.smashed = 1;
      const z = e.wz - this.dist;
      ER.Particles.burst(e.x, 1, Math.max(0.3, z), 28, { cols: [2, 0, 6, 5], speed: 8, g: 9, life: 0.8, size: 0.18, world: false });
      ER.Particles.burst(e.x, 0.8, Math.max(0.3, z), 10, { col: 6, add: false, speed: 4, g: 2, life: 0.8, size: 0.4 });
      Cam.addShake(0.35);
      ER.Audio.play('smash');
      this.score.score += 25;
    },

    onObstacleHit(e, z) {
      const p = this.player;
      if (this.power.active.boost > 0) { this.smash(e); return; }
      if (this.power.invulnerable || p.invuln > 0) return;
      // hit from the side while changing lanes: bounce back instead of dying
      if (p.laneChanging && z < -C.HIT_HALF_D + 0.15) {
        p.stumble();
        this.score.breakCombo();
        return;
      }
      if (this.power.active.shield > 0) {
        this.power.consumeShield();
        this.smash(e);
        p.invuln = 1.3;
        p.hitT = 0.3;
        this.flash = 0.3; this.flashColor = '255,220,130';
        ER.UI.toast('SHIELD BROKEN');
        return;
      }
      this.die('hit');
    },

    onFall() {
      const p = this.player;
      if (this.power.active.shield > 0) {
        this.power.consumeShield();
        p.y = 0;
        p.vy = C.JUMP_V * 1.3;
        p.grounded = false;
        p.jumps = 1;
        p.invuln = 1.2;
        this.flash = 0.3; this.flashColor = '255,220,130';
        ER.Particles.burst(p.x, 0.2, 0, 24, { cols: [0, 1], speed: 5, g: 2, life: 0.6, size: 0.14 });
        ER.UI.toast('SHIELD SAVED YOU');
        return;
      }
      this.die('fall');
    },

    die(kind) {
      if (this.state !== 'playing') return;
      this.player.kill(kind);
      this.state = 'dying';
      this.dyingT = 0;
      this.timeScale = 0.35;
      this.flash = 0.45; this.flashColor = '255,90,40';
      Cam.addShake(kind === 'fall' ? 0.4 : 0.9);
      ER.Audio.play('hit');
      if (kind === 'hit') {
        ER.Particles.burst(this.player.x, 0.9, 0.5, 30, { cols: [2, 5, 0], speed: 7, g: 8, life: 0.8, size: 0.16 });
      }
      this.score.breakCombo();
    },

    async gameOver() {
      this.state = 'over';
      ER.UI.showHUD(false);
      const S = this.score;
      const result = {
        score: Math.floor(S.score),
        eggs: S.eggs,
        distance: Math.floor(S.distance),
        combo: S.bestMult,
        zone: ER.Zones.list[ER.Zones.indexAt(this.dist)].name
      };
      const prevBest = ER.Profile.best;
      result.newBest = result.score > prevBest;
      if (result.newBest) ER.Profile.best = result.score;
      if (result.combo > ER.Profile.bestCombo) ER.Profile.bestCombo = result.combo;
      ER.Store.set('totalEggs', ER.Store.get('totalEggs', 0) + result.eggs);
      result.best = ER.Profile.best;
      ER.Audio.play(result.newBest ? 'newBest' : 'gameover');
      try {
        const entry = await ER.Leaderboard.submit({
          name: ER.Profile.name, score: result.score, distance: result.distance, eggs: result.eggs, combo: result.combo
        });
        result.entryId = entry.id;
        result.rank = await ER.Leaderboard.rankOf(result.score);
      } catch (e) {
        result.rank = null;
      }
      ER.UI.showGameOver(result);
    },

    /* ---------------- loop ---------------- */
    frame(now) {
      let dt = (now - this.last) / 1000;
      this.last = now;
      if (!(dt > 0)) dt = 0;
      dt = Math.min(dt, 0.05);
      try {
        this.update(dt);
        this.render();
      } catch (err) {
        console.error(err);
      }
      requestAnimationFrame((t) => this.frame(t));
    },

    update(rawDt) {
      ER.UI.tick(rawDt, this);
      if (this.state === 'paused') return;

      if (this.state === 'menu' || this.state === 'over') {
        // attract mode: slow cinematic fly-through
        this.time += rawDt;
        this.dist += rawDt * 7;
        Cam.zoom += (1 - Cam.zoom) * Math.min(1, rawDt * 2);
        Cam.bob = Math.sin(this.time * 0.8) * 0.15;
        Cam.update(rawDt, Math.sin(this.time * 0.25) * 0.6);
        ER.World.update(rawDt, this.dist);
        ER.Particles.update(rawDt, rawDt * 7);
        return;
      }

      if (this.state === 'dying') {
        this.dyingT += rawDt;
        this.timeScale = Math.min(1, this.timeScale + rawDt * 0.9);
      }
      const dt = rawDt * this.timeScale;
      this.time += dt;
      const p = this.player;

      // speed
      let target = this.baseSpeedAt(this.dist) * (this.power.active.boost > 0 ? C.BOOST_MULT : 1);
      if (this.state === 'dying') target = 0;
      this.speed += (target - this.speed) * Math.min(1, dt * (this.state === 'dying' ? 4 : 2.2));
      const step = this.speed * dt;
      this.dist += step;

      if (this.state === 'playing') {
        this.score.addDistance(step, ER.Zones.loopAt(this.dist));
        this.score.update(dt);
        this.power.update(dt, this);
        ER.Spawner.update(this);
      }
      p.update(dt, this);

      // moving / dying entities
      const list = ER.Entities.list;
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e.smashed > 0) {
          e.smashed -= dt * 2.2;
          if (e.smashed <= 0) e.dead = true;
        }
        if (e.type === 'roller') {
          const z = e.wz - this.dist;
          if (!e.rolling && z < 42) e.rolling = true;
          if (e.rolling) {
            e.wz -= 7 * dt;
            e.rot += dt * 9;
            if (Math.random() < dt * 20) ER.Particles.spawn({ x: e.x + U.rand(-0.4, 0.4), y: U.rand(0.1, 0.8), z: z + 1.2, vx: U.rand(-0.5, 0.5), vy: U.rand(0.5, 2), vz: 1, life: 0.5, size: 0.12, col: U.chance(0.5) ? 2 : 0, g: -1 });
          }
        } else if (e.type === 'flamejet') {
          e.t += dt;
          const c = e.t % C.JET_PERIOD, onAt = C.JET_PERIOD - C.JET_ON;
          e.active = c >= onAt && e.smashed <= 0;
          e.warn = e.active ? 1 : U.clamp((c - (onAt - C.JET_WARN)) / C.JET_WARN, 0, 1);
          e.jetK += ((e.active ? 1 : 0) - e.jetK) * Math.min(1, dt * (e.active ? 14 : 8));
          const z = e.wz - this.dist;
          if (z < 60 && z > -2) {
            if (e.active && Math.random() < dt * 26) ER.Particles.spawn({ x: e.x + U.rand(-0.4, 0.4), y: U.rand(0.5, 3), z: z + 0.5, vx: U.rand(-0.6, 0.6), vy: U.rand(2, 4), life: 0.6, size: U.rand(0.06, 0.12), col: 2, g: -0.5 });
            else if (e.warn > 0 && Math.random() < dt * 14 * e.warn) ER.Particles.spawn({ x: e.x + U.rand(-0.6, 0.6), y: 0.2, z: z + 0.5, vx: U.rand(-0.3, 0.3), vy: U.rand(1, 2.5), life: 0.5, size: 0.06, col: 0, g: -0.2 });
          }
        } else if (e.type === 'meteor' && !e.landed && e.smashed <= 0) {
          const z = e.wz - this.dist;
          // drop early enough to land well before the dragon, whatever the speed
          if (!e.falling && z < 14 + this.speed * 0.75) { e.falling = true; ER.Audio.play('whoosh'); }
          if (e.falling) {
            e.y -= 24 * dt;
            if (Math.random() < dt * 40) ER.Particles.spawn({ x: e.x + U.rand(-0.3, 0.3), y: e.y + 0.5, z: z + 0.7, vx: U.rand(-0.5, 0.5), vy: U.rand(0, 1.5), life: 0.5, size: 0.14, col: U.chance(0.5) ? 2 : 0, g: -0.3 });
            if (e.y <= 0.8) {
              e.y = 0.8; e.falling = false; e.landed = true;
              ER.Particles.burst(e.x, 0.3, z + 0.7, 26, { cols: [2, 0, 5, 6], speed: 7, g: 8, life: 0.7, size: 0.16, world: false });
              Cam.addShake(U.clamp(0.4 - z * 0.01, 0.08, 0.3));
              ER.Audio.play('smash');
            }
          }
        }
      }

      if (this.state === 'playing') ER.Collision.check(this);
      ER.Entities.sweep(this.dist);

      // zones & milestones
      if (this.state === 'playing') {
        const zi = ER.Zones.indexAt(this.dist);
        if (zi !== this.zoneIndex) {
          this.zoneIndex = zi;
          const loop = ER.Zones.loopAt(this.dist);
          ER.UI.zoneBanner(ER.Zones.list[zi].name, 'ZONE ' + (zi + 1) + (loop > 0 ? ' · LOOP ' + (loop + 1) : '') + ' · SPEED UP');
          ER.Audio.play('zone');
        }
        if (this.score.distance >= this.nextMilestone) {
          ER.UI.toast(U.fmt(this.nextMilestone) + ' m');
          this.nextMilestone += 500;
        }
      }

      // camera
      Cam.zoom += ((this.power.active.boost > 0 ? 0.9 : 1) - Cam.zoom) * Math.min(1, dt * 2.5);
      Cam.bob = p.grounded && !p.sliding ? Math.sin(p.phase * 2) * 0.025 : 0;
      Cam.update(rawDt, p.x);

      ER.World.update(dt, this.dist);
      ER.Particles.update(dt, step);
      this.flash = Math.max(0, this.flash - rawDt * 1.6);

      if (this.state === 'dying' && this.dyingT > 1.6) this.gameOver();
    },

    render() {
      const ctx = this.ctx, dpr = Cam.dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      const t = this.time, dist = this.dist;

      ER.World.render(ctx, dist, t);
      const list = ER.Entities.list;
      for (let i = 0; i < list.length; i++) if (list[i].kind === 'gap') ER.World.drawGap(ctx, list[i], dist, t);
      ER.World.renderStructures(ctx, dist, t);

      const inGame = this.state === 'playing' || this.state === 'dying' || this.state === 'paused';
      if (inGame) {
        visible.length = 0;
        for (let i = 0; i < list.length; i++) {
          const e = list[i];
          if (e.kind === 'gap' || e.dead) continue;
          const z = e.wz - dist;
          if (z > C.MAX_Z || z + e.len < -C.CAM_BACK) continue;
          visible.push(e);
        }
        visible.sort((a, b) => b.wz - a.wz);
        let i = 0;
        // obstacles whose front is still ahead of the dragon are drawn first
        for (; i < visible.length; i++) {
          const e = visible[i];
          if (e.wz - dist < (e.cat === 'obstacle' ? -0.2 : 0)) break;
          ER.Entities.draw(ctx, e, dist, t);
        }
        this.player.render(ctx, this);
        for (; i < visible.length; i++) ER.Entities.draw(ctx, visible[i], dist, t);
      }

      ER.Particles.render(ctx);
      ER.Particles.renderTexts(ctx);

      // post effects
      const W = Cam.W, H = Cam.H;
      if (inGame && this.power.active.boost > 0) this.drawSpeedLines(ctx, W, H);
      ctx.drawImage(this.vignette, 0, 0, W, H);
      if (this.flash > 0) {
        ctx.fillStyle = 'rgba(' + this.flashColor + ',' + (this.flash * 0.5).toFixed(3) + ')';
        ctx.fillRect(0, 0, W, H);
      }
    },

    drawSpeedLines(ctx, W, H) {
      const cx = Cam.cx, cy = Cam.horizon + (Cam.playerY - Cam.horizon) * 0.3;
      const R = Math.hypot(W, H) * 0.6;
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(255,220,150,0.28)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (const l of speedLines) {
        l.r += 0.06;
        if (l.r > 1) { l.r = 0.25 + Math.random() * 0.2; l.a = Math.random() * Math.PI * 2; }
        const r0 = R * l.r, r1 = R * (l.r + l.l);
        ctx.moveTo(cx + Math.cos(l.a) * r0, cy + Math.sin(l.a) * r0);
        ctx.lineTo(cx + Math.cos(l.a) * r1, cy + Math.sin(l.a) * r1);
      }
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
  };

  ER.Game = Game;
})(window.ER = window.ER || {});
