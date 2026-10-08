/* EGG RUN — power-up timers and effects. */
(function (ER) {
  'use strict';
  const C = ER.CFG;

  const PowerUps = {
    active: { magnet: 0, shield: 0, boost: 0, x2: 0, double: 0 },
    graceAfterBoost: 0,

    reset() {
      for (const k in this.active) this.active[k] = 0;
      this.graceAfterBoost = 0;
    },

    activate(type, game) {
      const def = C.POWER[type];
      this.active[type] = def.dur;
      ER.Audio.play(type === 'magnet' ? 'magnet' : type === 'shield' ? 'shield' : 'power');
      if (type === 'boost') {
        ER.Audio.play('boost');
        ER.Cam.addShake(0.25);
      }
      game.player.powerT = 0.6;
    },

    consumeShield() {
      this.active.shield = 0;
      ER.Audio.play('shieldBreak');
    },

    /** Is the dragon currently immune to obstacles? */
    get invulnerable() {
      return this.active.boost > 0 || this.graceAfterBoost > 0;
    },

    update(dt, game) {
      for (const k in this.active) {
        if (this.active[k] <= 0) continue;
        this.active[k] = Math.max(0, this.active[k] - dt);
        if (this.active[k] === 0) {
          if (k === 'boost') {
            this.graceAfterBoost = 1.2;
            game.player.invuln = 1.2;
            game.player.grounded = false; // drop back to the floor
          }
          ER.Audio.play('powerEnd');
        }
      }
      this.graceAfterBoost = Math.max(0, this.graceAfterBoost - dt);

      // magnet / boost pull eggs toward the dragon
      const pull = this.active.magnet > 0 || this.active.boost > 0;
      if (pull) {
        const p = game.player;
        const list = ER.Entities.list;
        for (let i = 0; i < list.length; i++) {
          const e = list[i];
          if (e.cat !== 'egg' || e.dead) continue;
          const z = e.wz - game.dist;
          if (z > 22 || z < -1.5) continue;
          if (!e.magnet && Math.abs(e.x - p.x) < 7.5) e.magnet = true;
          if (e.magnet) {
            const k = Math.min(1, dt * 9);
            e.x += (p.x - e.x) * k;
            e.y += (p.y + 0.5 - e.y) * k;
            e.wz += (game.dist - e.wz) * Math.min(1, dt * 8);
          }
        }
      }
    }
  };

  ER.PowerUps = PowerUps;
})(window.ER = window.ER || {});
