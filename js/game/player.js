/* EGG RUN — the dragon: input actions, physics, animation states and rendering. */
(function (ER) {
  'use strict';
  const C = ER.CFG, U = ER.U, Cam = ER.Cam, P = ER.P;

  const buf = document.createElement('canvas');
  const bctx = buf.getContext('2d');

  const Player = {
    reset() {
      this.lane = 1; this.prevLane = 1;
      this.x = 0; this.y = 0; this.vy = 0;
      this.grounded = true; this.jumps = 0;
      this.slideT = 0; this.fastFall = false; this.slideQueued = false;
      this.jumpBuf = 0;
      this.phase = 0; this.sy = 1; this.sv = 0; this.tilt = 0;
      this.flipT = 0; this.hitT = 0; this.collectT = 0; this.powerT = 0;
      this.invuln = 0; this.stumbleT = 0;
      this.dead = false; this.deathT = 0; this.deathKind = '';
      this.flap = 0; this.state = 'run';
    },

    get sliding() { return this.slideT > 0; },
    get height() { return this.sliding ? C.SLIDE_H : C.HIT_H; },
    get laneChanging() { return Math.abs(C.LANES[this.lane] - this.x) > 0.3; },

    move(dir, game) {
      if (this.dead) return;
      const nl = U.clamp(this.lane + dir, 0, 2);
      if (nl === this.lane) {
        Cam.addShake(0.12);
        ER.Audio.play('bump');
        return;
      }
      this.prevLane = this.lane;
      this.lane = nl;
      ER.Audio.play('whoosh');
      if (game && this.grounded) {
        ER.Particles.burst(this.x, 0.1, 0.2, 4, { col: 6, add: false, speed: 2, g: 2, life: 0.4, size: 0.18 });
      }
    },

    jump(game) {
      if (this.dead) return;
      const boosting = game.power.active.boost > 0;
      if (boosting) return;
      if (this.grounded) {
        this.doJump(false);
      } else if (game.power.active.double > 0 && this.jumps < 2) {
        this.doJump(true);
      } else {
        this.jumpBuf = C.JUMP_BUFFER;
      }
    },

    doJump(second) {
      this.vy = C.JUMP_V * (second ? 0.95 : 1);
      this.grounded = false;
      this.jumps = second ? 2 : 1;
      this.slideT = 0;
      this.fastFall = false;
      this.sy = 1.28; this.sv = 0;
      if (second) {
        this.flipT = 1;
        ER.Particles.burst(this.x, this.y + 0.6, 0, 18, { cols: [3, 1, 7], speed: 5, g: 2, life: 0.6, size: 0.12 });
        ER.Audio.play('double');
      } else {
        ER.Particles.burst(this.x, 0.05, 0.1, 6, { col: 6, add: false, speed: 2.4, g: 3, life: 0.45, size: 0.2 });
        ER.Audio.play('jump');
      }
    },

    slide(game) {
      if (this.dead) return;
      if (game.power.active.boost > 0) return;
      if (!this.grounded) {
        this.fastFall = true;
        this.slideQueued = true;
        return;
      }
      if (this.slideT <= 0) ER.Audio.play('slide');
      this.slideT = C.SLIDE_TIME;
      this.sy = 0.8; this.sv = 0;
    },

    land(game) {
      const hard = this.vy < -12;
      this.y = 0; this.vy = 0; this.grounded = true; this.jumps = 0; this.fastFall = false;
      this.sy = hard ? 0.66 : 0.76; this.sv = 0;
      ER.Particles.burst(this.x, 0.05, 0.1, hard ? 14 : 9, { col: 6, add: false, speed: hard ? 3.6 : 2.6, g: 2, life: 0.5, size: 0.22, up: 0.6 });
      ER.Audio.play('land');
      if (hard) Cam.addShake(0.18);
      if (this.slideQueued) {
        this.slideQueued = false;
        this.slideT = C.SLIDE_TIME;
        ER.Audio.play('slide');
      } else if (this.jumpBuf > 0) {
        this.jumpBuf = 0;
        this.doJump(false);
      }
    },

    stumble() {
      // knocked back into the previous lane
      const back = this.prevLane;
      this.prevLane = this.lane;
      this.lane = back;
      this.hitT = 0.35;
      this.stumbleT = 0.4;
      this.invuln = Math.max(this.invuln, 0.5);
      Cam.addShake(0.35);
      ER.Audio.play('bump');
    },

    kill(kind) {
      if (this.dead) return;
      this.dead = true;
      this.deathKind = kind || 'hit';
      this.deathT = 0;
      this.hitT = 0.5;
      this.slideT = 0;
      if (this.deathKind === 'hit') { this.vy = 7; this.grounded = false; }
    },

    update(dt, game) {
      const boost = game.power.active.boost > 0;
      this.jumpBuf = Math.max(0, this.jumpBuf - dt);
      this.hitT = Math.max(0, this.hitT - dt);
      this.collectT = Math.max(0, this.collectT - dt);
      this.powerT = Math.max(0, this.powerT - dt);
      this.invuln = Math.max(0, this.invuln - dt);
      this.stumbleT = Math.max(0, this.stumbleT - dt);
      this.flipT = Math.max(0, this.flipT - dt * 2.4);

      // squash / stretch spring
      this.sv += ((1 - this.sy) * 260 - this.sv * 14) * dt;
      this.sy += this.sv * dt;

      if (this.dead) {
        this.deathT += dt;
        if (this.deathKind === 'fall') {
          this.vy -= C.GRAVITY * dt;
          this.y += this.vy * dt;
        } else {
          this.vy -= C.GRAVITY * 0.8 * dt;
          this.y = Math.max(0, this.y + this.vy * dt);
        }
        return;
      }

      // lateral
      const tx = C.LANES[this.lane];
      const dx = tx - this.x;
      this.x += dx * Math.min(1, dt * C.LANE_LERP);
      if (Math.abs(dx) < 0.005) this.x = tx;
      this.tilt += (U.clamp(dx * 0.22, -0.3, 0.3) - this.tilt) * Math.min(1, dt * 14);

      if (boost) {
        // fly above everything
        this.slideT = 0;
        this.grounded = false;
        this.jumps = 0;
        this.y += (C.BOOST_FLY_Y + Math.sin(game.time * 6) * 0.12 - this.y) * Math.min(1, dt * 6);
        this.vy = 0;
      } else if (!this.grounded) {
        const g = C.GRAVITY * (this.fastFall ? C.FAST_FALL : 1) * (this.vy < 0 ? 1.15 : 1);
        this.vy -= g * dt;
        this.y += this.vy * dt;
        if (this.y <= 0) {
          if (game.power.graceAfterBoost <= 0 && ER.Entities.gapsAt(this.x, game.dist)) {
            if (this.y < -0.35) game.onFall();
          } else {
            this.land(game);
          }
        }
      } else {
        // running: did the floor disappear under us?
        if (game.power.graceAfterBoost <= 0 && ER.Entities.gapsAt(this.x, game.dist)) {
          this.grounded = false;
          this.vy = 0;
        }
        if (this.slideT > 0) {
          this.slideT -= dt;
          if (this.slideT <= 0) { this.sy = 1.12; this.sv = 0; }
        }
      }

      // animation
      const speed = game.speed;
      this.phase += dt * (5 + speed * 0.42);
      const targetFlap = boost ? 0.5 + Math.sin(game.time * 22) * 0.5 : !this.grounded ? (this.vy > 0 ? 0.9 : 0.55 + Math.sin(game.time * 16) * 0.3) : 0.08 + Math.sin(this.phase * 2) * 0.06;
      this.flap += (targetFlap - this.flap) * Math.min(1, dt * 18);

      this.state = this.sliding ? 'slide' : this.jumps === 2 ? 'double' : !this.grounded ? (boost ? 'boost' : 'jump') : this.hitT > 0 ? 'hit' : 'run';

      // trails
      if (boost) {
        for (let i = 0; i < 2; i++) {
          const side = U.chance(0.5) ? -1 : 1;
          ER.Particles.spawn({ x: this.x + side * U.rand(0.5, 0.8), y: this.y + U.rand(0.7, 1.2), z: 0.1, vx: side * U.rand(0.5, 1.5), vy: U.rand(-0.5, 0.3), vz: -U.rand(5, 8), life: 0.22, size: 0.08, col: U.chance(0.5) ? 2 : 0, g: 0, world: false, streak: true });
        }
      } else if (this.grounded && !this.sliding && Math.random() < dt * 8) {
        ER.Particles.spawn({ x: this.x + U.rand(-0.3, 0.3), y: 0.05, z: 0.1, vx: U.rand(-0.6, 0.6), vy: U.rand(0.3, 1), vz: -1, life: 0.35, size: 0.08, col: 6, add: false, g: 1, grow: 0.2 });
      }
      if (this.sliding && Math.random() < dt * 30) {
        ER.Particles.spawn({ x: this.x + U.rand(-0.4, 0.4), y: 0.05, z: 0.4, vx: U.rand(-1.5, 1.5), vy: U.rand(0.5, 1.6), vz: -3, life: 0.3, size: 0.06, col: 0, g: 6, streak: true });
      }
    },

    /* ---------------- rendering ---------------- */
    render(ctx, game) {
      const t = game.time;
      const pw = game.power.active;
      // shadow
      if (this.y > -0.2 && Cam.proj(this.x, 0, 0)) {
        const k = U.clamp(1 - this.y / 3.5, 0.35, 1);
        const r = 0.62 * P.s * k * (this.sliding ? 1.3 : 1);
        ctx.fillStyle = 'rgba(0,0,0,' + (0.42 * k).toFixed(3) + ')';
        ctx.beginPath();
        ctx.ellipse(P.x, P.y, r, r * 0.32, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!Cam.proj(this.x, this.y, 0)) return;
      const sx = P.x, sy = P.y, s = P.s;
      const hPx = C.DRAGON_H * s;
      let k = hPx / 210;
      let alpha = 1;
      if (this.dead && this.deathKind === 'fall') {
        const f = U.clamp(this.deathT / 1.1, 0, 1);
        k *= 1 - f * 0.55;
        alpha = 1 - f * 0.9;
      }

      // power aura (behind dragon)
      if (pw.boost > 0 || pw.x2 > 0 || this.powerT > 0) {
        ctx.globalCompositeOperation = 'lighter';
        const gi = pw.boost > 0 ? 2 : 0;
        const gr = hPx * (0.9 + Math.sin(t * 8) * 0.06);
        ctx.globalAlpha = pw.boost > 0 ? 0.32 : 0.22 + this.powerT * 0.5;
        ctx.drawImage(ER.Sprites.glow[gi], sx - gr, sy - hPx * 0.55 - gr, gr * 2, gr * 2);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }

      const size = Math.ceil(hPx * 2.1);
      if (buf.height !== buf.width || buf.width < size || buf.width > size * 2) { buf.width = size; buf.height = size; }
      const bs = buf.width;
      bctx.setTransform(1, 0, 0, 1, 0, 0);
      bctx.clearRect(0, 0, bs, bs);
      const ox = bs / 2, oy = bs * 0.74;

      let rot = this.tilt;
      let sqx = 1 + (1 - this.sy) * 0.7, sqy = this.sy;
      if (this.sliding) { sqx *= 1.08; sqy *= 0.74; }
      if (this.flipT > 0) rot += (1 - this.flipT) * Math.PI * 2;
      if (this.stumbleT > 0) rot += Math.sin(this.stumbleT * 40) * 0.12;
      if (this.dead && this.deathKind === 'hit') rot += Math.min(1, this.deathT * 1.8) * -1.2;

      bctx.translate(ox, oy);
      if (this.flipT > 0) bctx.translate(0, -105 * k);
      bctx.rotate(rot);
      if (this.flipT > 0) bctx.translate(0, 105 * k);
      bctx.scale(k * sqx, k * sqy);
      ER.Character.drawBack(bctx, {
        phase: this.phase,
        run: this.grounded && !this.sliding && !this.dead ? 1 : 0
      });
      bctx.setTransform(1, 0, 0, 1, 0, 0);

      // tinting: zone rim light, hit flash, power glow
      const pal = ER.Zones.at(game.dist);
      bctx.globalCompositeOperation = 'source-atop';
      bctx.fillStyle = U.rgba(pal.light, 0.1);
      bctx.fillRect(0, 0, bs, bs);
      if (this.hitT > 0) {
        bctx.fillStyle = 'rgba(255,255,255,' + Math.min(0.8, this.hitT * 2.4).toFixed(3) + ')';
        bctx.fillRect(0, 0, bs, bs);
      }
      if (this.collectT > 0) {
        bctx.fillStyle = 'rgba(255,230,140,' + (this.collectT * 0.16).toFixed(3) + ')';
        bctx.fillRect(0, 0, bs, bs);
      }
      bctx.globalCompositeOperation = 'source-over';

      if (this.invuln > 0 && pw.boost <= 0 && !this.dead) alpha *= (Math.sin(t * 40) > 0 ? 1 : 0.45);
      ctx.globalAlpha = alpha;
      ctx.drawImage(buf, sx - ox, sy - oy);
      ctx.globalAlpha = 1;

      // shield bubble
      if (pw.shield > 0) {
        const r = hPx * 0.68;
        const cy = sy - hPx * 0.48;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.25 + Math.sin(t * 5) * 0.06;
        ctx.drawImage(ER.Sprites.glow[0], sx - r * 1.3, cy - r * 1.3, r * 2.6, r * 2.6);
        ctx.globalAlpha = 0.75;
        ctx.strokeStyle = 'rgba(255,214,110,0.9)';
        ctx.lineWidth = Math.max(1.5, hPx * 0.018);
        ctx.beginPath();
        ctx.arc(sx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = Math.max(1, hPx * 0.008);
        for (let i = 0; i < 6; i++) {
          const a = t * 1.5 + (i / 6) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(sx, cy, r * 0.92, a, a + 0.5);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
      // magnet field
      if (pw.magnet > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(255,120,110,0.45)';
        ctx.lineWidth = Math.max(1, hPx * 0.012);
        for (let i = 0; i < 3; i++) {
          const ph = ((t * 1.4 + i / 3) % 1);
          ctx.globalAlpha = 1 - ph;
          ctx.beginPath();
          ctx.ellipse(sx, sy - hPx * 0.4, hPx * (0.4 + ph * 0.9), hPx * (0.15 + ph * 0.3), 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
      // dizzy stars on death / stumble
      if ((this.dead && this.deathKind === 'hit') || this.stumbleT > 0) {
        const cy = sy - hPx * 1.02;
        for (let i = 0; i < 4; i++) {
          const a = t * 5 + (i / 4) * Math.PI * 2;
          ER.Sprites.star(ctx, sx + Math.cos(a) * hPx * 0.32, cy + Math.sin(a) * hPx * 0.08, hPx * 0.06, '#ffe08a');
        }
      }
    }
  };

  ER.Player = Player;
})(window.ER = window.ER || {});
