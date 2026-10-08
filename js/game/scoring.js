/* EGG RUN — score, eggs, distance and combo bookkeeping. */
(function (ER) {
  'use strict';
  const C = ER.CFG;

  const Scoring = {
    reset() {
      this.score = 0;
      this.eggs = 0;
      this.distance = 0;
      this.comboCount = 0;
      this.comboTimer = 0;
      this.bestMult = 1;
      this.eggsByType = { normal: 0, golden: 0, special: 0 };
    },

    get mult() {
      return Math.min(C.COMBO_MAX, 1 + Math.floor(this.comboCount / C.COMBO_STEP));
    },

    addDistance(meters, zoneLoop) {
      this.distance += meters;
      this.score += meters * (1 + zoneLoop * 0.5);
    },

    /** Returns {eggs, points, levelUp} for UI feedback. */
    addEgg(type, doubled) {
      const before = this.mult;
      const base = C.EGG[type].eggs;
      const eggs = base * (doubled ? 2 : 1);
      this.eggs += eggs;
      this.eggsByType[type]++;
      this.comboCount += type === 'normal' ? 1 : type === 'golden' ? 3 : 5;
      this.comboTimer = C.COMBO_TIME;
      const m = this.mult;
      if (m > this.bestMult) this.bestMult = m;
      const points = eggs * C.EGG_POINTS * m + (type === 'special' ? 50 : 0);
      this.score += points;
      return { eggs, points, levelUp: m > before ? m : 0 };
    },

    breakCombo() {
      this.comboCount = 0;
      this.comboTimer = 0;
    },

    update(dt) {
      if (this.comboTimer > 0) {
        this.comboTimer -= dt;
        if (this.comboTimer <= 0) this.breakCombo();
      }
    }
  };

  ER.Scoring = Scoring;
})(window.ER = window.ER || {});
