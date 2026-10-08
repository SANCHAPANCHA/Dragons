/* EGG RUN — Web Audio synthesised sound effects and a subtle ambient score. */
(function (ER) {
  'use strict';

  let ac = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null, verb = null;
  let musicTimer = null, droneNodes = null;
  const PENTA = [0, 3, 5, 7, 10, 12, 15, 17];

  function ensure() {
    if (ac) return ac;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    ac = new Ctx();
    master = ac.createGain();
    master.gain.value = 0.8;
    master.connect(ac.destination);
    sfxBus = ac.createGain();
    sfxBus.gain.value = ER.Settings.data.sfx ? 0.9 : 0;
    sfxBus.connect(master);
    musicBus = ac.createGain();
    musicBus.gain.value = ER.Settings.data.music ? 0.55 : 0;
    musicBus.connect(master);
    // short feedback-delay "reverb" for a temple feel
    verb = ac.createDelay(1);
    verb.delayTime.value = 0.21;
    const fb = ac.createGain();
    fb.gain.value = 0.32;
    const vlp = ac.createBiquadFilter();
    vlp.type = 'lowpass';
    vlp.frequency.value = 2400;
    verb.connect(vlp); vlp.connect(fb); fb.connect(verb);
    const wet = ac.createGain();
    wet.gain.value = 0.35;
    vlp.connect(wet); wet.connect(master);
    // noise buffer
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ac;
  }

  function tone(freq, dur, o) {
    o = o || {};
    if (!ac) return;
    const t0 = ac.currentTime + (o.delay || 0);
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + dur);
    const vol = o.vol === undefined ? 0.2 : o.vol;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + (o.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(o.bus || sfxBus);
    if (o.verb) g.connect(verb);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noise(dur, o) {
    o = o || {};
    if (!ac) return;
    const t0 = ac.currentTime + (o.delay || 0);
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = o.filter || 'lowpass';
    f.frequency.setValueAtTime(o.freq || 1000, t0);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t0 + dur);
    f.Q.value = o.q || 1;
    const g = ac.createGain();
    g.gain.setValueAtTime(o.vol || 0.2, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(sfxBus);
    if (o.verb) g.connect(verb);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.05);
  }

  const SFX = {
    egg(combo) {
      const f = 880 * Math.pow(2, Math.min(combo || 0, 14) / 24);
      tone(f, 0.11, { type: 'sine', vol: 0.14 });
      tone(f * 1.5, 0.09, { type: 'triangle', vol: 0.06, delay: 0.03, verb: true });
    },
    golden() {
      [660, 880, 1320, 1760].forEach((f, i) => tone(f, 0.25, { type: 'triangle', vol: 0.11, delay: i * 0.045, verb: true }));
    },
    special() {
      [523, 784, 1047, 1568, 2093].forEach((f, i) => tone(f, 0.5, { type: 'sine', vol: 0.12, delay: i * 0.06, verb: true }));
      noise(0.5, { filter: 'highpass', freq: 6000, vol: 0.05 });
    },
    jump() {
      tone(320, 0.16, { type: 'triangle', to: 720, vol: 0.09 });
      noise(0.14, { filter: 'bandpass', freq: 900, to: 2400, vol: 0.06, q: 2 });
    },
    double() {
      tone(520, 0.2, { type: 'triangle', to: 1240, vol: 0.09, verb: true });
      tone(1040, 0.14, { type: 'sine', vol: 0.05, delay: 0.05 });
    },
    land() {
      tone(110, 0.12, { type: 'sine', to: 50, vol: 0.18 });
      noise(0.09, { freq: 380, vol: 0.12 });
    },
    slide() { noise(0.32, { filter: 'bandpass', freq: 600, to: 2200, vol: 0.09, q: 1.5 }); },
    whoosh() { noise(0.12, { filter: 'bandpass', freq: 1400, to: 700, vol: 0.06, q: 1.2 }); },
    bump() { tone(140, 0.12, { type: 'square', to: 70, vol: 0.06 }); noise(0.08, { freq: 600, vol: 0.08 }); },
    power() {
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.22, { type: 'triangle', vol: 0.1, delay: i * 0.05, verb: true }));
    },
    magnet() {
      tone(300, 0.18, { type: 'sine', to: 620, vol: 0.12 });
      tone(620, 0.22, { type: 'sine', to: 300, vol: 0.1, delay: 0.16, verb: true });
      SFX.power();
    },
    shield() {
      tone(1200, 0.4, { type: 'sine', vol: 0.1, verb: true });
      tone(600, 0.6, { type: 'triangle', vol: 0.1, verb: true });
      tone(1800, 0.3, { type: 'sine', vol: 0.04, delay: 0.05 });
    },
    shieldBreak() {
      noise(0.4, { filter: 'highpass', freq: 3000, to: 800, vol: 0.18 });
      tone(900, 0.4, { type: 'triangle', to: 200, vol: 0.12, verb: true });
    },
    boost() {
      noise(0.8, { filter: 'bandpass', freq: 400, to: 3000, vol: 0.12, q: 0.8 });
      tone(180, 0.6, { type: 'sawtooth', to: 520, vol: 0.05 });
    },
    smash() {
      noise(0.3, { freq: 1600, to: 200, vol: 0.22 });
      tone(90, 0.25, { type: 'sine', to: 40, vol: 0.2 });
    },
    powerEnd() { tone(660, 0.2, { type: 'triangle', to: 330, vol: 0.06 }); },
    hit() {
      noise(0.45, { freq: 900, to: 120, vol: 0.32 });
      tone(160, 0.45, { type: 'sawtooth', to: 40, vol: 0.12 });
    },
    gameover() {
      [523, 440, 349, 262].forEach((f, i) => tone(f, 0.55, { type: 'triangle', vol: 0.11, delay: 0.15 + i * 0.22, verb: true }));
    },
    combo() {
      tone(784, 0.14, { type: 'triangle', vol: 0.08 });
      tone(1175, 0.2, { type: 'triangle', vol: 0.08, delay: 0.07, verb: true });
    },
    zone() {
      tone(98, 2.2, { type: 'sine', vol: 0.18, attack: 0.05, verb: true });
      tone(147, 2.0, { type: 'sine', vol: 0.1, attack: 0.05, verb: true });
      tone(392, 1.2, { type: 'triangle', vol: 0.05, delay: 0.1, verb: true });
    },
    click() { tone(1250, 0.05, { type: 'sine', vol: 0.08 }); tone(620, 0.06, { type: 'triangle', vol: 0.04, delay: 0.01 }); },
    newBest() {
      [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, 0.3, { type: 'triangle', vol: 0.1, delay: i * 0.09, verb: true }));
    }
  };

  function startDrone() {
    if (!ac || droneNodes) return;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 340;
    const g = ac.createGain();
    g.gain.value = 0.0001;
    g.gain.exponentialRampToValueAtTime(0.06, ac.currentTime + 2);
    lp.connect(g); g.connect(musicBus);
    const oscs = [55, 55.4, 82.4].map((f) => {
      const o = ac.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(lp);
      o.start();
      return o;
    });
    const lfo = ac.createOscillator();
    const lg = ac.createGain();
    lfo.frequency.value = 0.08;
    lg.gain.value = 120;
    lfo.connect(lg); lg.connect(lp.frequency);
    lfo.start();
    droneNodes = { oscs, lfo, g };
  }

  function stopDrone() {
    if (!droneNodes) return;
    const n = droneNodes;
    droneNodes = null;
    n.g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.6);
    setTimeout(() => { n.oscs.forEach((o) => o.stop()); n.lfo.stop(); }, 700);
  }

  let step = 0;
  function musicTick() {
    if (!ac || ac.state !== 'running') return;
    step++;
    const root = 220;
    if (Math.random() < 0.7) {
      const n = PENTA[(Math.random() * PENTA.length) | 0];
      tone(root * Math.pow(2, n / 12), 1.6, { type: 'sine', vol: 0.05, attack: 0.02, bus: musicBus, verb: true });
    }
    if (step % 4 === 0) tone(root / 2 * Math.pow(2, [0, 5, 7, 3][(step / 4) % 4] / 12), 2.6, { type: 'triangle', vol: 0.045, attack: 0.3, bus: musicBus });
  }

  ER.Audio = {
    unlock() {
      const c = ensure();
      if (c && c.state === 'suspended') c.resume();
      this.applySettings();
    },
    play(name, arg) {
      if (!ac || ac.state !== 'running' || !ER.Settings.data.sfx) return;
      const fn = SFX[name];
      if (fn) {
        try { fn(arg); } catch (e) { /* never let audio break the game */ }
      }
    },
    applySettings() {
      if (!ac) return;
      sfxBus.gain.value = ER.Settings.data.sfx ? 0.9 : 0;
      musicBus.gain.value = ER.Settings.data.music ? 0.55 : 0;
      if (ER.Settings.data.music) this.startMusic(); else this.stopMusic();
    },
    startMusic() {
      if (!ac || !ER.Settings.data.music) return;
      startDrone();
      if (!musicTimer) musicTimer = setInterval(musicTick, 1200);
    },
    stopMusic() {
      stopDrone();
      if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
    },
    suspend() { if (ac && ac.state === 'running') ac.suspend(); },
    resume() { if (ac && ac.state === 'suspended') ac.resume(); }
  };
})(window.ER = window.ER || {});
