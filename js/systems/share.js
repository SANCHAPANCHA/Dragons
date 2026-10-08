/* EGG RUN — shareable score card (canvas image + Web Share / clipboard). */
(function (ER) {
  'use strict';
  const U = ER.U;

  function frame(x, X, Y, W, H, r) {
    x.beginPath();
    x.moveTo(X + r, Y);
    x.lineTo(X + W - r, Y);
    x.quadraticCurveTo(X + W, Y, X + W, Y + r);
    x.lineTo(X + W, Y + H - r);
    x.quadraticCurveTo(X + W, Y + H, X + W - r, Y + H);
    x.lineTo(X + r, Y + H);
    x.quadraticCurveTo(X, Y + H, X, Y + H - r);
    x.lineTo(X, Y + r);
    x.quadraticCurveTo(X, Y, X + r, Y);
    x.closePath();
  }

  function goldText(x, text, cx, cy, size, weight) {
    x.font = (weight || 700) + ' ' + size + 'px Cinzel, Georgia, serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.lineWidth = size * 0.12;
    x.strokeStyle = 'rgba(40,18,4,0.95)';
    x.strokeText(text, cx, cy);
    const g = x.createLinearGradient(0, cy - size / 2, 0, cy + size / 2);
    g.addColorStop(0, '#fff3c4');
    g.addColorStop(0.5, '#f2c25a');
    g.addColorStop(1, '#a8661c');
    x.fillStyle = g;
    x.fillText(text, cx, cy);
  }

  const X_HANDLE = 'Pocket_Dragons_';
  const W = 1200, H = 675; // 16:9, the ratio X shows uncropped in the timeline

  function xLogo(x, cx, cy, s, color) {
    // simplified X mark (two crossing strokes)
    x.save();
    x.translate(cx, cy);
    x.fillStyle = color;
    x.beginPath();
    x.moveTo(-s * 0.5, -s * 0.5); x.lineTo(-s * 0.18, -s * 0.5); x.lineTo(s * 0.5, s * 0.5); x.lineTo(s * 0.18, s * 0.5);
    x.closePath();
    x.fill();
    x.lineWidth = s * 0.11;
    x.strokeStyle = color;
    x.beginPath();
    x.moveTo(s * 0.44, -s * 0.5); x.lineTo(-s * 0.44, s * 0.5);
    x.stroke();
    x.restore();
  }

  function fitFont(x, text, maxW, size, weight) {
    let sz = size;
    do {
      x.font = weight + ' ' + sz + 'px Cinzel, Georgia, serif';
      if (x.measureText(text).width <= maxW) break;
      sz -= 2;
    } while (sz > 16);
    return sz;
  }

  const Share = {
    HANDLE: X_HANDLE,

    gameUrl() {
      return location.protocol.indexOf('http') === 0 ? location.origin + location.pathname : '';
    },

    text(r) {
      return 'I scored ' + U.fmt(r.score) + ' in EGG RUN as ' + (r.name || ER.Profile.name) + ' 🐉🥚\n' +
        U.fmt(r.distance) + ' m · ' + U.fmt(r.eggs) + ' eggs · x' + r.combo + ' combo\n' +
        'Can you beat me? @' + X_HANDLE;
    },

    xIntentUrl(r) {
      const q = new URLSearchParams({ text: this.text(r) });
      const url = this.gameUrl();
      if (url) q.set('url', url);
      return 'https://x.com/intent/post?' + q.toString();
    },

    card(r) {
      const cv = U.makeCanvas(W, H), x = cv.getContext('2d');
      const name = r.name || ER.Profile.name;
      const skin = ER.Character.skin(r.skin || ER.Character.current);

      // temple backdrop
      const bg = x.createRadialGradient(330, 360, 30, 520, 340, 900);
      bg.addColorStop(0, '#6a3a16');
      bg.addColorStop(0.4, '#26140a');
      bg.addColorStop(1, '#070403');
      x.fillStyle = bg;
      x.fillRect(0, 0, W, H);
      x.strokeStyle = 'rgba(255,190,100,0.13)';
      for (let i = 0; i < 6; i++) {
        x.lineWidth = 16 - i * 2;
        x.beginPath();
        x.arc(330, 640, 150 + i * 70, Math.PI, 0);
        x.stroke();
      }
      [[70, 210], [590, 210]].forEach((p) => {
        x.globalCompositeOperation = 'lighter';
        x.drawImage(ER.Sprites.glow[2], p[0] - 100, p[1] - 100, 200, 200);
        x.drawImage(ER.Sprites.flames[0][1], p[0] - 24, p[1] - 66, 48, 72);
        x.globalCompositeOperation = 'source-over';
      });
      // floor glow + dragon in the skin that was played
      x.save();
      x.globalCompositeOperation = 'lighter';
      x.globalAlpha = 0.65;
      x.drawImage(ER.Sprites.glow[0], 70, 120, 520, 520);
      x.restore();
      x.fillStyle = 'rgba(0,0,0,0.45)';
      x.beginPath(); x.ellipse(330, 622, 150, 26, 0, 0, Math.PI * 2); x.fill();
      x.save();
      x.translate(330, 628);
      x.scale(2.15, 2.15);
      ER.Character.drawFront(x, { t: 0, skin: skin.id });
      x.restore();

      // frame
      frame(x, 16, 16, W - 32, H - 32, 18);
      x.lineWidth = 3;
      x.strokeStyle = '#d8a548';
      x.stroke();
      frame(x, 26, 26, W - 52, H - 52, 14);
      x.lineWidth = 1;
      x.strokeStyle = 'rgba(255,220,150,0.45)';
      x.stroke();

      // right-hand info panel
      const PX = 650, PW = 500;
      frame(x, PX, 60, PW, 555, 18);
      x.fillStyle = 'rgba(12,7,4,0.8)';
      x.fill();
      x.lineWidth = 2;
      x.strokeStyle = '#c99a45';
      x.stroke();
      const cx = PX + PW / 2;
      goldText(x, 'EGG RUN', cx, 118, 58, 900);

      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.font = '700 18px Cinzel, Georgia, serif';
      x.fillStyle = '#b89a6a';
      x.fillText('PLAYER', cx, 186);
      const nsz = fitFont(x, name, PW - 60, 44, 900);
      goldText(x, name, cx, 228, nsz, 900);
      x.font = '700 15px Cinzel, Georgia, serif';
      x.fillStyle = '#9c8460';
      x.fillText(skin.name + ' DRAGON', cx, 268);

      x.strokeStyle = 'rgba(216,165,72,0.45)';
      x.lineWidth = 1;
      x.beginPath(); x.moveTo(PX + 50, 296); x.lineTo(PX + PW - 50, 296); x.stroke();

      x.font = '700 18px Cinzel, Georgia, serif';
      x.fillStyle = '#b89a6a';
      x.fillText('SCORE', cx, 328);
      const score = U.fmt(r.score);
      goldText(x, score, cx, 384, fitFont(x, score, PW - 60, 76, 900), 900);

      // secondary stats
      const stats = [[U.fmt(r.distance) + ' m', 'DISTANCE'], [U.fmt(r.eggs), 'EGGS'], ['x' + r.combo, 'COMBO']];
      stats.forEach((st, i) => {
        const sx = PX + PW * (i + 0.5) / 3;
        x.font = '700 26px Cinzel, Georgia, serif';
        x.fillStyle = '#ffe2a0';
        x.fillText(st[0], sx, 458);
        x.font = '700 13px Cinzel, Georgia, serif';
        x.fillStyle = '#9c8460';
        x.fillText(st[1], sx, 488);
      });
      x.drawImage(ER.Sprites.eggs.golden, PX + PW / 2 - 46, 446, 18, 23);

      x.font = '700 26px Cinzel, Georgia, serif';
      x.fillStyle = '#ffd27a';
      x.fillText('Can you beat me?', cx, 538);
      // account tag
      x.font = '700 22px Georgia, serif';
      const tag = '@' + X_HANDLE;
      const tw = x.measureText(tag).width;
      xLogo(x, cx - tw / 2 - 16, 584, 18, '#f3e2bd');
      x.fillStyle = '#f3e2bd';
      x.textAlign = 'left';
      x.fillText(tag, cx - tw / 2 + 4, 585);
      x.textAlign = 'center';
      return cv;
    },

    /** PNG file for the card; built ahead of the click so sharing can start synchronously. */
    async file(canvas) {
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
      return blob ? new File([blob], 'egg-run-score.png', { type: 'image/png' }) : null;
    },

    /**
     * Share to X. Must be called directly from the click handler (user activation).
     * Mobile: the system share sheet with the image + text (pick X).
     * Desktop: X can't receive an image through a link, so the card goes to the
     * clipboard and the X composer opens with the text and @mention pre-filled.
     */
    shareX(r, file) {
      const text = this.text(r);
      const url = this.gameUrl();
      if (file && navigator.canShare && navigator.share && navigator.canShare({ files: [file] }) && matchMedia('(pointer: coarse)').matches) {
        return navigator.share({ files: [file], text: url ? text + '\n' + url : text })
          .then(() => 'shared', (e) => (e && e.name === 'AbortError' ? 'cancelled' : this.openIntent(r, null)));
      }
      let copied = Promise.resolve(false);
      if (file && navigator.clipboard && window.ClipboardItem) {
        try {
          copied = navigator.clipboard.write([new ClipboardItem({ 'image/png': file })]).then(() => true, () => false);
        } catch (e) { copied = Promise.resolve(false); }
      }
      return this.openIntent(r, copied);
    },

    openIntent(r, copied) {
      window.open(this.xIntentUrl(r), '_blank', 'noopener,noreferrer');
      return Promise.resolve(copied).then((ok) => (ok ? 'x-copied' : 'x-opened'));
    }
  };

  ER.Share = Share;
})(window.ER = window.ER || {});
