/* EGG RUN — bootstrap. */
(function (ER) {
  'use strict';

  function boot() {
    ER.Sprites.build();
    ER.Character.load().catch((e) => console.error(e)).then(start);
  }

  function start() {
    const canvas = document.getElementById('game');
    ER.UI.init();
    ER.Game.init(canvas);
    ER.Input.init(document.getElementById('app'), (action) => {
      ER.Audio.unlock();
      if (ER.UI.modalOpen()) {
        if (action === 'pause') ER.UI.back();
        return;
      }
      ER.Game.action(action);
    });
    // unlock audio on first interaction (autoplay policies)
    const unlock = () => { ER.Audio.unlock(); window.removeEventListener('pointerdown', unlock); };
    window.addEventListener('pointerdown', unlock);
    document.body.classList.add('ready');
  }

  // Fonts are used inside pre-rendered sprites, so wait for them (with a timeout fallback).
  const fontsReady = document.fonts && document.fonts.load
    ? Promise.race([
      Promise.all([document.fonts.load('900 40px Cinzel'), document.fonts.load('700 20px Cinzel')]),
      new Promise((r) => setTimeout(r, 1500))
    ])
    : Promise.resolve();
  fontsReady.catch(() => {}).then(boot);
})(window.ER = window.ER || {});
