/* EGG RUN — collision detection between the dragon and entities. */
(function (ER) {
  'use strict';
  const C = ER.CFG;

  const Collision = {
    check(game) {
      const p = game.player;
      if (p.dead) return;
      const dist = game.dist;
      const px = p.x, py = p.y, ph = p.height;
      const list = ER.Entities.list;

      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e.dead || e.smashed > 0) continue;
        const z = e.wz - dist;
        if (z > 2.5 || z + e.len < -2) continue;

        if (e.cat === 'egg') {
          if (e.magnet && Math.abs(z) < 1.5 && Math.abs(e.x - px) < 1.3) { game.collectEgg(e); continue; }
          if (Math.abs(z) < 0.95 && Math.abs(e.x - px) < 0.9 && Math.abs((e.y + 0.4) - (py + ph * 0.5)) < 1.25) game.collectEgg(e);
          continue;
        }
        if (e.cat === 'power') {
          if (Math.abs(z) < 1.1 && Math.abs(e.x - px) < 1.0 && Math.abs((e.y + 0.2) - (py + ph * 0.5)) < 1.4) game.collectPower(e);
          continue;
        }
        if (e.kind === 'gap') continue; // handled by the player's ground check
        if ((e.type === 'flamejet' && !e.active) || (e.type === 'meteor' && !e.landed)) continue;

        // depth overlap (dragon occupies roughly -halfD..+halfD)
        if (z > C.HIT_HALF_D || z + e.len < -C.HIT_HALF_D) continue;
        // lateral overlap (slightly forgiving)
        if (Math.abs(e.x - px) > e.halfW + C.HIT_HALF_W - 0.12) continue;
        // vertical overlap with tolerance
        if (py >= e.yMax - 0.12 || py + ph <= e.yMin + 0.1) continue;

        game.onObstacleHit(e, z);
        if (p.dead) return;
      }
    }
  };

  ER.Collision = Collision;
})(window.ER = window.ER || {});
