/* EGG RUN — zone palettes. The palette is sampled per world position so the
   corridor ahead changes colour before the dragon reaches it. */
(function (ER) {
  'use strict';
  const U = ER.U;

  const ZONES = [
    {
      id: 'temple', name: 'Ancient Temple', start: 0, particle: 'ember',
      floor: [70, 54, 42], floor2: [54, 41, 32], grout: [24, 17, 12], curb: [150, 104, 52],
      wall: [80, 58, 42], fog: [20, 12, 7], sky: [10, 6, 4], light: [255, 160, 60],
      accent: [255, 196, 96], banner: [140, 26, 22], side: [44, 33, 26], sideGlow: [0, 0, 0],
      door: [255, 176, 96], flame: 0, lava: 0, ice: 0, vault: 0, heat: 0
    },
    {
      id: 'frost', name: 'Frozen Temple', start: 600, particle: 'snow',
      floor: [74, 88, 110], floor2: [57, 69, 90], grout: [18, 24, 36], curb: [150, 196, 236],
      wall: [66, 80, 104], fog: [10, 18, 36], sky: [5, 9, 20], light: [120, 196, 255],
      accent: [176, 226, 255], banner: [28, 58, 140], side: [130, 172, 214], sideGlow: [40, 100, 190],
      door: [160, 214, 255], flame: 1, lava: 0, ice: 1, vault: 0, heat: 0
    },
    {
      id: 'lava', name: 'Lava Temple', start: 1250, particle: 'ash',
      floor: [68, 40, 30], floor2: [52, 30, 23], grout: [30, 10, 5], curb: [210, 96, 40],
      wall: [74, 40, 30], fog: [44, 12, 4], sky: [18, 5, 2], light: [255, 104, 34],
      accent: [255, 150, 60], banner: [170, 40, 10], side: [255, 96, 22], sideGlow: [255, 84, 12],
      door: [255, 130, 50], flame: 0, lava: 1, ice: 0, vault: 0, heat: 0.6
    },
    {
      id: 'vault', name: 'Ancient Vault', start: 1950, particle: 'arcane',
      floor: [48, 38, 62], floor2: [36, 29, 48], grout: [14, 8, 22], curb: [200, 158, 92],
      wall: [50, 38, 66], fog: [14, 7, 24], sky: [7, 3, 13], light: [196, 128, 255],
      accent: [255, 206, 120], banner: [92, 30, 134], side: [34, 18, 54], sideGlow: [140, 60, 255],
      door: [214, 156, 255], flame: 2, lava: 0, ice: 0, vault: 1, heat: 0.2
    },
    {
      // basalt forge: fire channels, flame jets and falling meteors everywhere
      id: 'inferno', name: 'Inferno Depths', start: 2700, particle: 'fire',
      floor: [46, 32, 30], floor2: [34, 23, 22], grout: [60, 12, 2], curb: [190, 64, 26],
      wall: [50, 30, 27], fog: [40, 7, 2], sky: [16, 2, 0], light: [255, 84, 28],
      accent: [255, 128, 48], banner: [110, 8, 4], side: [255, 72, 10], sideGlow: [255, 60, 0],
      door: [255, 96, 30], flame: 0, lava: 1, ice: 0, vault: 0, heat: 1
    }
  ];
  const CYCLE = 3500;   // after the last zone the cycle repeats (difficulty keeps climbing)
  const BLEND = 140;    // metres of colour transition between zones
  const STEP = 2;

  const ARRAY_KEYS = ['floor', 'floor2', 'grout', 'curb', 'wall', 'fog', 'sky', 'light', 'accent', 'banner', 'side', 'sideGlow', 'door'];

  function zoneIndexLocal(local) {
    let i = 0;
    for (let k = 0; k < ZONES.length; k++) if (local >= ZONES[k].start) i = k;
    return i;
  }

  function build(local) {
    const i = zoneIndexLocal(local);
    const a = ZONES[i];
    const nextStart = i + 1 < ZONES.length ? ZONES[i + 1].start : CYCLE;
    const b = ZONES[(i + 1) % ZONES.length];
    const t = U.smooth(U.clamp((local - (nextStart - BLEND)) / BLEND, 0, 1));
    const p = { index: t < 0.5 ? i : (i + 1) % ZONES.length, t };
    for (const k of ARRAY_KEYS) p[k] = U.mix3(a[k], b[k], t, []);
    p.lava = U.lerp(a.lava, b.lava, t);
    p.ice = U.lerp(a.ice, b.ice, t);
    p.vault = U.lerp(a.vault, b.vault, t);
    p.heat = U.lerp(a.heat, b.heat, t);
    p.id = t < 0.5 ? a.id : b.id;
    p.flame = t < 0.5 ? a.flame : b.flame;
    p.particle = t < 0.5 ? a.particle : b.particle;
    return p;
  }

  const table = [];
  for (let d = 0; d < CYCLE; d += STEP) table.push(build(d));

  function local(dist) {
    return ((dist % CYCLE) + CYCLE) % CYCLE;
  }

  ER.Zones = {
    list: ZONES,
    CYCLE,
    at(dist) {
      return table[Math.min(table.length - 1, (local(dist) / STEP) | 0)];
    },
    indexAt(dist) {
      return zoneIndexLocal(local(dist));
    },
    idAt(dist) {
      return ZONES[zoneIndexLocal(local(dist))].id;
    },
    /** Zones entered so far (fractional while a new zone eases in). */
    stepsAt(dist, ease) {
      const loop = Math.floor(Math.max(0, dist) / CYCLE);
      const l = local(Math.max(0, dist));
      const i = zoneIndexLocal(l);
      const frac = U.clamp((l - ZONES[i].start) / ease, 0, 1);
      return Math.max(0, loop * ZONES.length + i - 1 + frac);
    },
    loopAt(dist) {
      return Math.floor(Math.max(0, dist) / CYCLE);
    }
  };
})(window.ER = window.ER || {});
