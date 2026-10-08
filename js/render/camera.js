/* EGG RUN — pseudo-3D camera. World: x = lateral, y = up, z = forward
   distance from the dragon. Results are written into ER.P to avoid allocations. */
(function (ER) {
  'use strict';
  const C = ER.CFG, U = ER.U;

  const P = { x: 0, y: 0, s: 0 };
  ER.P = P;

  const Cam = {
    W: 1, H: 1, dpr: 1, f: 600, camH: 3.2, horizon: 300, cx: 0, playerY: 0,
    x: 0, bob: 0, shake: 0, shakeX: 0, shakeY: 0, roll: 0, zoom: 1, portrait: false,

    resize(w, h, dpr) {
      this.W = w; this.H = h; this.dpr = dpr;
      this.portrait = h > w * 1.05;
      this.cx = w / 2;
      this.playerY = h * (this.portrait ? 0.8 : 0.83);
      this.baseF = Math.min(w * 0.94, h * 0.92);
      this.baseHorizon = h * (this.portrait ? 0.37 : 0.34);
      this.update(0, 0);
    },

    update(dt, targetX) {
      this.x += (targetX * 0.55 - this.x) * Math.min(1, dt * 6);
      this.f = this.baseF * this.zoom;
      this.horizon = this.baseHorizon;
      this.camH = U.clamp((this.playerY - this.horizon) * C.CAM_BACK / this.f, 2.4, 7.5);
      if (this.shake > 0) {
        const k = ER.Settings.data.shake ? this.shake : 0;
        this.shakeX = (Math.random() * 2 - 1) * k * 14;
        this.shakeY = (Math.random() * 2 - 1) * k * 10;
        this.shake = Math.max(0, this.shake - dt * 2.6);
      } else {
        this.shakeX = this.shakeY = 0;
      }
    },

    addShake(v) { this.shake = Math.min(1.2, Math.max(this.shake, v)); },

    /** Project world point; returns false when behind the near plane. */
    proj(x, y, z) {
      const d = z + C.CAM_BACK;
      if (d < 0.15) return false;
      const s = this.f / d;
      P.s = s;
      P.x = this.cx + (x - this.x) * s + this.shakeX;
      P.y = this.horizon + (this.camH + this.bob - y) * s + this.shakeY;
      return true;
    },

    scale(z) { return this.f / Math.max(0.15, z + C.CAM_BACK); },
    sx(x, z) { return this.cx + (x - this.x) * this.f / Math.max(0.15, z + C.CAM_BACK) + this.shakeX; },
    sy(y, z) { return this.horizon + (this.camH + this.bob - y) * this.f / Math.max(0.15, z + C.CAM_BACK) + this.shakeY; }
  };

  ER.Cam = Cam;
})(window.ER = window.ER || {});
