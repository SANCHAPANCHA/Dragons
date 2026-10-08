/* EGG RUN — keyboard, swipe and tap input. Emits abstract actions. */
(function (ER) {
  'use strict';

  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'jump', KeyW: 'jump', Space: 'jump',
    ArrowDown: 'slide', KeyS: 'slide',
    Escape: 'pause', KeyP: 'pause'
  };
  const SWIPE_MIN = 26;

  const Input = {
    handler: null,

    init(surface, handler) {
      this.handler = handler;
      window.addEventListener('keydown', (e) => {
        const tag = (e.target && e.target.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        const a = KEYMAP[e.code] || KEYMAP[e.key];
        if (!a) return;
        if (e.code === 'Space' || e.code.indexOf('Arrow') === 0) e.preventDefault();
        if (e.repeat && a !== 'pause') return;
        this.emit(a, 'key');
      });

      let sx = 0, sy = 0, st = 0, id = null, consumed = false;
      surface.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        // ignore presses on UI controls so buttons never double as game input
        if (e.target.closest && e.target.closest('button, input, a, label, .panel')) { id = null; return; }
        id = e.pointerId; sx = e.clientX; sy = e.clientY; st = performance.now(); consumed = false;
      });
      surface.addEventListener('pointermove', (e) => {
        if (e.pointerId !== id || consumed) return;
        const dx = e.clientX - sx, dy = e.clientY - sy;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) return;
        consumed = true;
        if (Math.abs(dx) > Math.abs(dy)) this.emit(dx < 0 ? 'left' : 'right', 'swipe');
        else this.emit(dy < 0 ? 'jump' : 'slide', 'swipe');
      });
      const end = (e) => {
        if (e.pointerId !== id) return;
        id = null;
        if (consumed) return;
        if (performance.now() - st > 350) return;
        // tap: left third / right third move, middle jumps
        const w = window.innerWidth;
        const x = e.clientX;
        this.emit(x < w / 3 ? 'left' : x > (w * 2) / 3 ? 'right' : 'jump', 'tap');
      };
      surface.addEventListener('pointerup', end);
      surface.addEventListener('pointercancel', () => { id = null; });
      surface.addEventListener('contextmenu', (e) => e.preventDefault());
    },

    emit(action, source) {
      if (this.handler) this.handler(action, source);
    }
  };

  ER.Input = Input;
})(window.ER = window.ER || {});
