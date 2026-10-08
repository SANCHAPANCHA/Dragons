/* EGG RUN — DOM UI: HUD, menus, modals, leaderboard, settings, share.
   DOM nodes are created once; per-frame updates only touch text when values change. */
(function (ER) {
  'use strict';
  const U = ER.U, C = ER.CFG;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.prototype.slice.call(document.querySelectorAll(s));

  const MODALS = ['leaderboard', 'howto', 'settings', 'share', 'skins'];

  const UI = {
    stack: [],
    hudTimer: 0,
    last: {},
    lbTab: 'global',
    lastResult: null,
    portraits: [],

    init() {
      this.el = {
        hud: $('#hud'), score: $('#hud-score'), dist: $('#hud-dist'), eggs: $('#hud-eggs'), best: $('#hud-best'),
        combo: $('#hud-combo'), comboX: $('#hud-combo-x'), comboRing: $('#hud-combo-ring'), powers: $('#hud-powers'),
        zone: $('#zone-banner'), zoneName: $('#zone-name'), zoneSub: $('#zone-sub'), toast: $('#toast'), comboPop: $('#combo-pop'),
        menuBest: $('#menu-best'), lbList: $('#lb-list'), hint: $('#touch-hint')
      };
      // ornate corners
      $$('.ornate').forEach((p) => {
        ['tl', 'tr', 'bl', 'br'].forEach((c) => {
          const i = document.createElement('i');
          i.className = 'corner ' + c;
          p.appendChild(i);
        });
      });
      // egg icons
      $$('.egg-ico').forEach((img) => { img.src = ER.Sprites.urls.eggs.golden; });
      // power-up slots
      this.powerSlots = {};
      C.POWER_TYPES.forEach((t) => {
        const d = document.createElement('div');
        d.className = 'power-chip';
        d.innerHTML = '<img alt=""><div class="pc-text"><span class="pc-name"></span><span class="pc-time"></span></div><div class="pc-bar"><i></i></div>';
        d.querySelector('img').src = ER.Sprites.urls.icons[t];
        d.querySelector('.pc-name').textContent = C.POWER[t].label;
        this.el.powers.appendChild(d);
        this.powerSlots[t] = { el: d, time: d.querySelector('.pc-time'), bar: d.querySelector('.pc-bar i'), shown: false, last: -1 };
      });
      this.buildHowTo();
      this.bindSettings();
      this.bindLeaderboard();

      document.addEventListener('click', (e) => {
        const b = e.target.closest('[data-action]');
        if (!b) return;
        e.preventDefault();
        ER.Audio.unlock();
        ER.Audio.play('click');
        this.onAction(b.getAttribute('data-action'), b);
      });

      $('#over-name').addEventListener('change', (e) => {
        ER.Profile.name = e.target.value;
        e.target.value = ER.Profile.name;
        ER.Leaderboard.rename(null, ER.Profile.name);
      });

      this.portraits = [
        { canvas: $('#menu-dragon'), screen: 'menu', opts: { mood: 'happy', holdEgg: true } },
        { canvas: $('#over-dragon'), screen: 'over', opts: { mood: 'happy', holdEgg: false } }
      ];
      this.refreshMenu();
      this.showScreen('menu');
    },

    /* ---------------- screens ---------------- */
    showScreen(name) {
      ['menu', 'over'].forEach((s) => $('#screen-' + s).classList.toggle('active', s === name));
      this.closeAllModals();
      if (name === 'menu') this.refreshMenu();
      this.current = name;
    },

    hideScreens() {
      ['menu', 'over', 'pause'].forEach((s) => $('#screen-' + s).classList.remove('active'));
      this.closeAllModals();
      this.current = null;
    },

    openModal(name) {
      if (this.stack[this.stack.length - 1] === name) return;
      this.stack.push(name);
      $('#screen-' + name).classList.add('active');
      if (name === 'leaderboard') this.renderLeaderboard();
      if (name === 'settings') this.syncSettings();
      if (name === 'share') this.renderShare();
      if (name === 'skins') this.renderSkins();
    },

    back() {
      const top = this.stack.pop();
      if (top) $('#screen-' + top).classList.remove('active');
      return !!top;
    },

    closeAllModals() {
      MODALS.forEach((m) => $('#screen-' + m).classList.remove('active'));
      this.stack.length = 0;
    },

    modalOpen() { return this.stack.length > 0; },

    showHUD(on) {
      this.el.hud.classList.toggle('active', on);
      if (on) {
        this.last = {};
        this.hideScreens();
        if (('ontouchstart' in window) && !ER.Store.get('hintShown', false)) {
          this.el.hint.classList.add('show');
          ER.Store.set('hintShown', true);
          setTimeout(() => this.el.hint.classList.remove('show'), 4200);
        }
      }
    },

    showPause(on) {
      $('#screen-pause').classList.toggle('active', on);
      if (!on) this.closeAllModals();
    },

    refreshMenu() {
      this.el.menuBest.textContent = U.fmt(ER.Profile.best);
    },

    onAction(a, btn) {
      const G = ER.Game;
      switch (a) {
        case 'play':
        case 'restart':
          $('#screen-pause').classList.remove('active');
          G.start();
          break;
        case 'resume': G.resume(); break;
        case 'pause-btn': G.pause(); break;
        case 'quit':
        case 'menu':
          $('#screen-pause').classList.remove('active');
          G.quitToMenu();
          break;
        case 'leaderboard': this.openModal('leaderboard'); break;
        case 'howto': this.openModal('howto'); break;
        case 'skins': this.openModal('skins'); break;
        case 'skin': this.selectSkin(btn.getAttribute('data-skin')); break;
        case 'settings': this.openModal('settings'); break;
        case 'share': this.openModal('share'); break;
        case 'back': this.back(); break;
        case 'share-x': this.doShareX(); break;
        case 'share-download': this.doDownload(); break;
        case 'reset-data':
          if (window.confirm('Reset best score, run history and settings?')) {
            ER.Store.clearAll();
            ER.Settings.reset();
            ER.Audio.applySettings();
            this.syncSettings();
            this.refreshMenu();
            this.toast('PROGRESS RESET');
          }
          break;
      }
    },

    /* ---------------- HUD ---------------- */
    tick(dt, game) {
      this.drawPortraits(dt);
      if (!this.el.hud.classList.contains('active')) return;
      this.hudTimer -= dt;
      if (this.hudTimer > 0) return;
      this.hudTimer = 0.066;
      const S = game.score;
      this.setText('score', this.el.score, U.fmt(S.score));
      this.setText('dist', this.el.dist, U.fmt(S.distance) + ' m');
      this.setText('eggs', this.el.eggs, U.fmt(S.eggs));
      this.setText('best', this.el.best, U.fmt(Math.max(ER.Profile.best, S.score)));
      const m = S.mult;
      this.setText('combo', this.el.comboX, 'x' + m);
      const ring = S.comboTimer > 0 ? S.comboTimer / C.COMBO_TIME : 0;
      const off = (283 * (1 - ring)).toFixed(1);
      if (this.last.ring !== off) { this.el.comboRing.style.strokeDashoffset = off; this.last.ring = off; }
      const hot = m > 1;
      if (this.last.hot !== hot) { this.el.combo.classList.toggle('hot', hot); this.last.hot = hot; }

      const act = game.power.active;
      C.POWER_TYPES.forEach((t) => {
        const slot = this.powerSlots[t];
        const v = act[t];
        const on = v > 0;
        if (slot.shown !== on) { slot.el.classList.toggle('on', on); slot.shown = on; }
        if (on) {
          const secs = Math.ceil(v);
          if (slot.last !== secs) { slot.time.textContent = secs + 's'; slot.last = secs; }
          slot.bar.style.transform = 'scaleX(' + (v / C.POWER[t].dur).toFixed(3) + ')';
          slot.el.classList.toggle('ending', v < 2.5);
        }
      });
    },

    setText(key, el, txt) {
      if (this.last[key] !== txt) { el.textContent = txt; this.last[key] = txt; }
    },

    zoneBanner(name, sub) {
      const z = this.el.zone;
      this.el.zoneName.textContent = name;
      this.el.zoneSub.textContent = sub;
      z.classList.remove('show');
      void z.offsetWidth;
      z.classList.add('show');
    },

    toast(text) {
      const t = this.el.toast;
      t.textContent = text;
      t.classList.remove('show');
      void t.offsetWidth;
      t.classList.add('show');
    },

    comboPop(m) {
      const c = this.el.comboPop;
      c.textContent = 'x' + m + ' COMBO!';
      c.classList.remove('show');
      void c.offsetWidth;
      c.classList.add('show');
      this.el.combo.classList.remove('bump');
      void this.el.combo.offsetWidth;
      this.el.combo.classList.add('bump');
    },

    /* ---------------- dragon portraits ---------------- */
    drawPortraits(dt) {
      this.pt = (this.pt || 0) + dt;
      for (const p of this.portraits) {
        const visibleNow = p.screen === 'menu' ? $('#screen-menu').classList.contains('active') : $('#screen-over').classList.contains('active');
        if (!visibleNow) continue;
        const cv = p.canvas;
        const rect = cv.getBoundingClientRect();
        if (rect.width < 2) continue;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.round(rect.width * dpr), h = Math.round(rect.height * dpr);
        if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
        const x = cv.getContext('2d');
        x.setTransform(1, 0, 0, 1, 0, 0);
        x.clearRect(0, 0, w, h);
        // warm glow behind
        x.globalCompositeOperation = 'lighter';
        x.globalAlpha = 0.55 + Math.sin(this.pt * 2) * 0.08;
        x.drawImage(ER.Sprites.glow[0], w * 0.1, h * 0.12, w * 0.8, h * 0.8);
        x.globalAlpha = 1;
        x.globalCompositeOperation = 'source-over';
        const k = Math.min(w / 230, h / 250);
        const hover = Math.sin(this.pt * 1.8) * 4 * k;
        x.translate(w / 2, h * 0.96 + hover);
        x.scale(k, k);
        ER.Character.drawFront(x, Object.assign({ t: this.pt }, p.opts));
      }
    },

    /* ---------------- game over ---------------- */
    showGameOver(r) {
      this.lastResult = r;
      $('#over-score').textContent = U.fmt(r.score);
      $('#over-eggs').textContent = U.fmt(r.eggs);
      $('#over-dist').textContent = U.fmt(r.distance) + ' m';
      $('#over-combo').textContent = 'x' + r.combo;
      $('#over-best').textContent = U.fmt(r.best);
      $('#over-rank').textContent = r.rank ? '#' + r.rank : '—';
      $('#over-zone').textContent = r.zone;
      $('#over-newbest').classList.toggle('show', !!r.newBest);
      $('#over-name').value = ER.Profile.name;
      this.portraits[1].opts.mood = r.newBest ? 'wow' : 'happy';
      this.showScreen('over');
    },

    /* ---------------- leaderboard ---------------- */
    bindLeaderboard() {
      $$('#screen-leaderboard .tab').forEach((t) => {
        t.addEventListener('click', () => {
          ER.Audio.play('click');
          this.lbTab = t.getAttribute('data-tab');
          $$('#screen-leaderboard .tab').forEach((o) => o.classList.toggle('active', o === t));
          this.renderLeaderboard();
        });
      });
    },

    async renderLeaderboard() {
      const list = this.el.lbList;
      list.innerHTML = '<li class="lb-empty">Loading…</li>';
      let rows = [];
      try {
        rows = await ER.Leaderboard.fetch(this.lbTab);
      } catch (e) {
        list.innerHTML = '<li class="lb-empty">Leaderboard unavailable.</li>';
        return;
      }
      if (!rows.length) {
        list.innerHTML = '<li class="lb-empty">No runs yet — go set a record!</li>';
        return;
      }
      const frag = document.createDocumentFragment();
      const lastId = this.lastResult && this.lastResult.entryId;
      rows.forEach((r, i) => {
        const li = document.createElement('li');
        li.className = 'lb-row' + (i < 3 ? ' top top' + (i + 1) : '') + (r.you ? ' you' : '') + (r.id === lastId ? ' latest' : '');
        const hue = U.hash(r.name) % 360;
        const sub = this.lbTab === 'me' ? new Date(r.date).toLocaleDateString() : (r.you ? 'You' : '');
        li.innerHTML =
          '<span class="rank">' + (i + 1) + '</span>' +
          '<span class="player"><i class="avatar" style="--h:' + hue + '">' + escapeHtml(r.name.charAt(0).toUpperCase()) + '</i>' +
          '<span class="pname">' + escapeHtml(r.name) + (sub ? '<small>' + escapeHtml(sub) + '</small>' : '') + '</span></span>' +
          '<span class="pscore">' + U.fmt(r.score) + '</span>' +
          '<span class="pdist">' + U.fmt(r.distance) + ' m</span>';
        frag.appendChild(li);
      });
      list.innerHTML = '';
      list.appendChild(frag);
      const mine = list.querySelector('.latest') || list.querySelector('.you');
      if (mine && this.lbTab !== 'me') mine.scrollIntoView({ block: 'nearest' });
    },

    /* ---------------- settings ---------------- */
    bindSettings() {
      $$('#screen-settings [data-setting]').forEach((b) => {
        b.addEventListener('click', () => {
          const key = b.getAttribute('data-setting');
          const S = ER.Settings.data;
          if (key === 'quality') S.quality = S.quality === 'high' ? 'low' : 'high';
          else S[key] = !S[key];
          ER.Settings.save();
          ER.Audio.unlock();
          ER.Audio.applySettings();
          if (key === 'quality') ER.Game.resize();
          ER.Audio.play('click');
          this.syncSettings();
        });
      });
      const name = $('#set-name');
      name.addEventListener('change', () => {
        ER.Profile.name = name.value;
        name.value = ER.Profile.name;
        ER.Leaderboard.rename(null, ER.Profile.name);
      });
    },

    syncSettings() {
      const S = ER.Settings.data;
      $$('#screen-settings [data-setting]').forEach((b) => {
        const key = b.getAttribute('data-setting');
        const v = key === 'quality' ? S.quality === 'high' : !!S[key];
        b.classList.toggle('on', v);
        b.textContent = key === 'quality' ? (S.quality === 'high' ? 'High' : 'Low') : (v ? 'On' : 'Off');
      });
      $('#set-name').value = ER.Profile.name;
    },

    /* ---------------- skins ---------------- */
    renderSkins() {
      const cur = ER.Character.current;
      $('#skins-grid').innerHTML = ER.Character.SKINS.map((s) =>
        '<button class="skin-card' + (s.id === cur ? ' selected' : '') + '" data-action="skin" data-skin="' + s.id + '" aria-pressed="' + (s.id === cur) + '">' +
        '<img src="' + ER.Character.thumbnail(s.id) + '" alt="' + s.name + ' dragon"><b>' + s.name + '</b></button>').join('');
    },
    selectSkin(id) {
      ER.Settings.data.skin = ER.Character.skin(id).id;
      ER.Settings.save();
      this.renderSkins();
    },

    /* ---------------- how to play ---------------- */
    buildHowTo() {
      const icons = ER.Sprites.urls;
      const items = [
        ['eggs.normal', 'Egg', '+1 egg'], ['eggs.golden', 'Golden Egg', '+10 eggs'], ['eggs.special', 'Special Egg', '+50 eggs, rare'],
        ['icons.magnet', 'Magnet', 'Attracts eggs'], ['icons.shield', 'Shield', 'Survive one hit'], ['icons.boost', 'Boost', 'Fly fast, smash all'],
        ['icons.x2', '2X Eggs', 'Eggs count double'], ['icons.double', 'Double Jump', 'Jump again mid-air']
      ];
      const get = (path) => path.split('.').reduce((o, k) => o[k], icons);
      $('#howto-items').innerHTML = items.map((it) =>
        '<div class="ht-item"><img src="' + get(it[0]) + '" alt=""><b>' + it[1] + '</b><small>' + it[2] + '</small></div>').join('');
      const obs = [
        [icons.crate, 'Burning Crate', 'Change lane'], [icons.fud, 'FUD Wall', 'Change lane'], [icons.whale, 'Dark Whale', 'Change lane'],
        [icons.barrier, 'Spike Barrier', 'Jump'], [icons.roller, 'Rolling Trap', 'Jump or dodge'], ['', 'Floor Gap', 'Jump'], ['', 'Magic Gate', 'Slide under'],
        ['', 'Spike Trap', 'Jump'], ['', 'Fallen Column', 'Jump'], ['', 'Hanging Spikes', 'Slide under'], ['', 'Lava Pool', 'Jump'],
        ['', 'Flame Jet', 'Time it or dodge'], ['', 'Meteor', 'Watch the marker, dodge']
      ];
      const glyph = { 'Floor Gap': '⇡', 'Spike Trap': '⇡', 'Fallen Column': '⇡', 'Lava Pool': '⇡', 'Magic Gate': '⇣', 'Hanging Spikes': '⇣', 'Flame Jet': '⏱', 'Meteor': '⇄' };
      $('#howto-obstacles').innerHTML = obs.map((o) =>
        '<div class="ht-item obs">' + (o[0] ? '<img src="' + o[0] + '" alt="">' : '<span class="ht-glyph">' + glyph[o[1]] + '</span>') +
        '<b>' + o[1] + '</b><small>' + o[2] + '</small></div>').join('');
    },

    /* ---------------- share ---------------- */
    renderShare() {
      const r = this.lastResult || { score: ER.Profile.best, eggs: 0, distance: 0, combo: ER.Profile.bestCombo || 1 };
      r.name = ER.Profile.name;
      r.skin = ER.Character.current;
      this.shareResult = r;
      this.shareCanvas = ER.Share.card(r);
      this.shareFile = null;
      ER.Share.file(this.shareCanvas).then((f) => { this.shareFile = f; }, () => {});
      const img = $('#share-img'), wrap = $('#share-canvas-wrap');
      let url = '';
      try { url = this.shareCanvas.toDataURL('image/png'); } catch (e) { url = ''; }
      // if the canvas can't be exported, show it directly so the card is still visible
      img.hidden = !url;
      wrap.hidden = !!url;
      if (url) img.src = url;
      else { wrap.innerHTML = ''; wrap.appendChild(this.shareCanvas); }
      $('#share-status').textContent = '';
    },
    doShareX() {
      const r = this.shareResult;
      if (!r) return;
      // synchronous call keeps the click's user activation for share / clipboard / popup
      ER.Share.shareX(r, this.shareFile).then((res) => {
        $('#share-status').textContent = {
          shared: 'Shared!',
          cancelled: '',
          'x-copied': 'Image copied — paste it into your X post (Ctrl/⌘ + V).',
          'x-opened': 'X opened — attach the saved image to your post.'
        }[res] || '';
        if (res === 'x-opened') this.doDownload();
      });
    },
    doDownload() {
      if (!this.shareCanvas) return;
      const a = document.createElement('a');
      a.download = 'egg-run-score.png';
      try { a.href = this.shareCanvas.toDataURL('image/png'); } catch (e) {
        $('#share-status').textContent = 'Saving is blocked here — run the game via npm start.';
        return;
      }
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  ER.UI = UI;
})(window.ER = window.ER || {});
