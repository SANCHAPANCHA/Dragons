/* EGG RUN — leaderboard service.
   The UI only talks to ER.Leaderboard; swap the adapter for a real backend:

     ER.Leaderboard.useAdapter(new ER.RemoteLeaderboardAdapter('https://api.example.com'));

   Adapters implement:  fetch(scope) -> Promise<Entry[]>  and  submit(entry) -> Promise<Entry>
   Entry: { id, name, score, distance, eggs, combo, date (ms), you? } */
(function (ER) {
  'use strict';
  const U = ER.U;

  const NAMES = ['EggMaster', 'DragonHodl', 'BlinkyFan', 'CryptoCub', 'EggHunter', 'Scalewing', 'EmberTail', 'GoldClaw',
    'NestKeeper', 'ShellShock', 'Wyrmling', 'FlameHatch', 'YolkRider', 'TempleRunr', 'RuneSeeker', 'DrakoDash',
    'Hatchling42', 'CinderPaw', 'AurumWing', 'MoonEgg', 'LavaLeap', 'FrostFang', 'VaultViper', 'SirScramble',
    'Omelette', 'EggcellentOne', 'SmolDrake', 'Pyra', 'Ignis', 'KindleKid', 'BronzeBeak', 'Gildra'];

  const DAY = 86400000;

  function weekId(ts) {
    // ISO-ish week number since epoch (weeks start Monday)
    return Math.floor((ts / DAY + 3) / 7);
  }

  /** Deterministic "community" rows so the board feels alive offline. */
  function seededRows(seed, count, top, decay, maxAgeDays) {
    const r = U.mulberry32(seed);
    const names = NAMES.slice().sort(() => r() - 0.5);
    const rows = [];
    let score = top;
    const now = Date.now();
    for (let i = 0; i < count; i++) {
      score = Math.floor(score * (decay - r() * 0.06));
      const distance = Math.floor(score / 23 + r() * 400);
      rows.push({
        id: 'seed-' + seed + '-' + i,
        name: names[i % names.length] + (i >= names.length ? (i % 9) : ''),
        score,
        distance,
        eggs: Math.floor(score / 460 + r() * 60),
        combo: 6 + Math.floor(r() * 22),
        date: now - Math.floor(r() * maxAgeDays * DAY)
      });
    }
    return rows;
  }

  class LocalLeaderboardAdapter {
    constructor() {
      this.key = 'runs';
    }
    runs() { return ER.Store.get(this.key, []); }
    async fetch(scope) {
      const runs = this.runs().map((r) => Object.assign({}, r, { you: true }));
      if (scope === 'me') {
        return runs.sort((a, b) => b.score - a.score).slice(0, 20);
      }
      let rows;
      if (scope === 'weekly') {
        const wk = weekId(Date.now());
        rows = seededRows(1000 + wk, 24, 135000, 0.93, 6);
        const mine = runs.filter((r) => weekId(r.date) === wk);
        rows = rows.concat(bestPerName(mine));
      } else {
        rows = seededRows(77, 40, 302000, 0.95, 120).concat(bestPerName(runs));
      }
      return rows.sort((a, b) => b.score - a.score).slice(0, 50);
    }
    async submit(entry) {
      const runs = this.runs();
      const e = Object.assign({ id: 'run-' + Date.now() + '-' + Math.floor(Math.random() * 1e4), date: Date.now() }, entry);
      runs.push(e);
      runs.sort((a, b) => b.score - a.score);
      ER.Store.set(this.key, runs.slice(0, 50));
      return e;
    }
    async rename(id, name) {
      // every locally stored run belongs to this device's player
      const runs = this.runs();
      runs.forEach((r) => { r.name = name; });
      ER.Store.set(this.key, runs);
    }
  }

  function bestPerName(runs) {
    const best = {};
    runs.forEach((r) => { if (!best[r.name] || best[r.name].score < r.score) best[r.name] = r; });
    return Object.keys(best).map((k) => best[k]);
  }

  /** Example remote adapter (not enabled by default). */
  class RemoteLeaderboardAdapter {
    constructor(baseUrl) { this.baseUrl = baseUrl.replace(/\/$/, ''); }
    async fetch(scope) {
      const res = await fetch(this.baseUrl + '/leaderboard?scope=' + encodeURIComponent(scope));
      if (!res.ok) throw new Error('Leaderboard request failed: ' + res.status);
      return res.json();
    }
    async submit(entry) {
      const res = await fetch(this.baseUrl + '/scores', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry)
      });
      if (!res.ok) throw new Error('Score submit failed: ' + res.status);
      return res.json();
    }
    async rename() { /* server-side profile update would go here */ }
  }

  ER.LocalLeaderboardAdapter = LocalLeaderboardAdapter;
  ER.RemoteLeaderboardAdapter = RemoteLeaderboardAdapter;

  ER.Leaderboard = {
    adapter: new LocalLeaderboardAdapter(),
    useAdapter(a) { this.adapter = a; },
    fetch(scope) { return this.adapter.fetch(scope); },
    submit(entry) { return this.adapter.submit(entry); },
    rename(id, name) { return this.adapter.rename(id, name); },
    /** Rank a score would have on the global board (1-based). */
    async rankOf(score) {
      const rows = await this.adapter.fetch('global');
      return rows.filter((r) => r.score > score).length + 1;
    }
  };
})(window.ER = window.ER || {});
