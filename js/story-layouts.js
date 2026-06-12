function drawLayout(canvas, act, selected, sc, layout) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.letterSpacing = '0px';
  const S = W / 1080; // scale factor — works for both 1080px canvas and 216px thumbnails
  const P = Math.round(88 * S);
  const polyline = act.map && act.map.summary_polyline ? decodePolyline(act.map.summary_polyline) : null;
  const skipBg = !!(storyBgImage && canvas.id === 'storyCanvas');

  // Solid page background derived from the active scheme (used when there is no
  // photo). Guarantees the chosen theme is always visible across every layout.
  // baseBg follows the scheme (incl. light schemes); baseBgDark stays dark for
  // photo-style layouts that render light text and need a legible backdrop.
  const isLightCard = sc.card !== 'transparent' && /255,\s*255,\s*255/.test(sc.card);
  const baseBg = (sc.card === 'transparent' || sc.card.startsWith('linear-gradient')) ? '#0e0e10' : sc.card;
  const baseBgDark = isLightCard ? '#101012' : baseBg;

  // background
  if (storyBgImage && canvas.id === 'storyCanvas') {
    // draw image with cover behaviour (maintain proportion, crop to fill)
    const iw = storyBgImage.naturalWidth, ih = storyBgImage.naturalHeight;
    const scale = Math.max(W / iw, H / ih);
    const sw = W / scale, sh = H / scale;
    const sx = (iw - sw) / 2, sy = (ih - sh) / 2;
    ctx.drawImage(storyBgImage, sx, sy, sw, sh, 0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, W, H);
  } else if (sc.bg && sc.bg !== 'transparent') {
    if (sc.bg.startsWith('linear-gradient')) {
      const m = sc.bg.match(/linear-gradient\([^,]+,\s*([^,]+),\s*([^)]+)\)/);
      if (m) { const g = ctx.createLinearGradient(0, 0, W * 0.6, H); g.addColorStop(0, m[1].trim()); g.addColorStop(1, m[2].trim()); ctx.fillStyle = g; }
      else { ctx.fillStyle = '#111'; } ctx.fillRect(0, 0, W, H);
    } else { ctx.fillStyle = sc.bg; ctx.fillRect(0, 0, W, H); }
  }

  // helpers
  const F = (sz, wt) => `${wt || 400} ${Math.round(sz * S)}px -apple-system,sans-serif`;
  const fitText = (text, maxW, baseSz, wt) => {
    let sz = Math.round(baseSz * S);
    ctx.font = `${wt || 400} ${sz}px -apple-system,sans-serif`;
    while (sz > Math.round(14 * S) && ctx.measureText(text).width > maxW) { sz--; ctx.font = `${wt || 700} ${sz}px -apple-system,sans-serif`; }
    return sz;
  };
  // returns color with given alpha (0-255), accepts hex (#rgb / #rrggbb / #rrggbbaa) or rgb()/rgba()
  const withAlpha = (c, a) => {
    if (!c || c === 'transparent') return `rgba(255,255,255,${(a / 255).toFixed(3)})`;
    const aFrac = (a / 255).toFixed(3);
    if (c.startsWith('rgba')) return c.replace(/,\s*[\d.]+\)\s*$/, `,${aFrac})`);
    if (c.startsWith('rgb(')) return c.replace('rgb(', 'rgba(').replace(/\)\s*$/, `,${aFrac})`);
    if (c.startsWith('#')) {
      let h = c;
      if (h.length === 4) h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
      if (h.length === 9) h = h.slice(0, 7);
      return h + a.toString(16).padStart(2, '0');
    }
    return c;
  };

  // title block: name + date · type
  function title(x, y, maxW, sz) {
    let n = act.name || 'Activity';
    const fs = fitText(n, maxW, sz, 700);
    if (!hideTitle) {
      ctx.fillStyle = sc.text; ctx.textAlign = 'left'; ctx.letterSpacing = '-0.5px'; ctx.fillText(n, x, y);
    }
    if (!hideDate) {
      ctx.fillStyle = sc.muted; ctx.font = F(26, 400); ctx.letterSpacing = '0';
      const dateY = hideTitle ? y : y + Math.round(40 * S);
      ctx.fillText((act.start_date ? fmtDt(act.start_date) : '') + ' · ' + (act.type || ''), x, dateY);
    }
    return fs;
  }

  // stat grid: 2-col max, icon + label + big value, fully scaled
  function grid(stats, x, y, w, h, cols) {
    if (!stats.length) return;
    const COLS = Math.min(stats.length, cols || 2), ROWS = Math.ceil(stats.length / COLS);
    const cW = w / COLS, cH = h / ROWS;
    stats.forEach((s, i) => {
      const col = i % COLS, row = Math.floor(i / COLS);
      const cx = x + col * cW + cW / 2, cy = y + row * cH;
      const { num, unit } = statVal(s, act);
      const iconS = Math.round(42 * S), lfs = Math.round(17 * S);
      let vfs = Math.round(58 * S);
      ctx.font = `800 ${vfs}px -apple-system,sans-serif`;
      while (vfs > Math.round(20 * S) && ctx.measureText(num + (unit ? ' ' + unit : '')).width > cW * 0.8) { vfs -= Math.max(1, Math.round(2 * S)); ctx.font = `800 ${vfs}px -apple-system,sans-serif`; }
      drawIcon(ctx, STAT_ICONS[s.key] || 'time', cx, cy + cH * 0.22, iconS, sc.icon);
      ctx.fillStyle = sc.accent; ctx.font = `600 ${lfs}px -apple-system,sans-serif`; ctx.textAlign = 'center'; ctx.letterSpacing = '0.04em';
      ctx.fillText(s.label.toUpperCase(), cx, cy + cH * 0.45);
      ctx.fillStyle = sc.text; ctx.font = `800 ${vfs}px -apple-system,sans-serif`; ctx.letterSpacing = '-1px';
      ctx.fillText(num, cx, cy + cH * 0.78);
      if (unit) { ctx.fillStyle = sc.muted; ctx.font = F(vfs * 0.44 / S, 500); ctx.letterSpacing = '0'; ctx.fillText(unit, cx, cy + cH * 0.92); }
    });
  }

  // stat rows: label left, value right — both on same baseline
  function rows(stats, x, y, w, h) {
    if (!stats.length) return;
    const rH = Math.min(Math.round(210 * S), h / stats.length);
    stats.forEach((s, i) => {
      const { num, unit } = statVal(s, act), ry = y + i * rH;
      const baseY = ry + rH * 0.64;
      let vfs = Math.round(64 * S);
      ctx.font = `800 ${vfs}px -apple-system,sans-serif`;
      while (vfs > Math.round(22 * S) && ctx.measureText(num + (unit ? ' ' + unit : '')).width > w * 0.55) { vfs -= Math.max(1, Math.round(2 * S)); ctx.font = `800 ${vfs}px -apple-system,sans-serif`; }
      ctx.fillStyle = sc.muted; ctx.font = F(20, 600); ctx.letterSpacing = '0.05em'; ctx.textAlign = 'left';
      ctx.fillText(s.label.toUpperCase(), x, baseY);
      ctx.fillStyle = sc.text; ctx.font = `800 ${vfs}px -apple-system,sans-serif`; ctx.letterSpacing = '-1px'; ctx.textAlign = 'right';
      ctx.fillText(num + (unit ? ' ' + unit : ''), x + w, baseY);
      ctx.letterSpacing = '0px';
    });
  }

  // ── SHARED 6-COL THEME HELPER ──
  function themed6(o) {
    // background
    if (!skipBg && o.bg) { ctx.fillStyle = o.bg; ctx.fillRect(0, 0, W, H); }
    if (!skipBg && o.overlay) o.overlay();
    // title
    const titleH = Math.round((hideDate ? 108 : 152) * S);
    const nm = act.name || 'Activity';
    fitText(nm, W - P * 2, 44, 700);
    ctx.fillStyle = o.headText || sc.text; ctx.textAlign = 'left'; ctx.letterSpacing = '-0.5px';
    ctx.fillText(nm, P, Math.round(96 * S));
    if (!hideDate) {
      ctx.fillStyle = o.headMuted || sc.muted; ctx.font = F(22, 400); ctx.letterSpacing = '0';
      ctx.fillText((act.start_date ? fmtDt(act.start_date) : '') + ' · ' + (act.type || ''), P, Math.round(130 * S));
    }
    // spatial layout: route fills everything except tiles
    const COLS = 6, gap = Math.round(10 * S), ROWS = Math.ceil(selected.length / COLS);
    const minTile = Math.round(130 * S);
    const tilesMinH = ROWS * (minTile + gap) + Math.round(20 * S);
    const routeH = Math.max(H - titleH - tilesMinH - Math.round(10 * S), Math.round(280 * S));
    const tilesY = titleH + routeH + Math.round(8 * S);
    const tilesAvail = H - tilesY - Math.round(18 * S);
    const tH = Math.min(Math.round(240 * S), Math.floor((tilesAvail - gap * (ROWS - 1)) / Math.max(ROWS, 1)));
    const tW = (W - P * 2 - gap * (COLS - 1)) / COLS;
    const r = Math.round((o.tileR !== undefined ? o.tileR : 10) * S);
    // route
    if (polyline && polyline.length > 1) {
      if (o.routeGlow) { ctx.shadowColor = o.routeCol; ctx.shadowBlur = Math.round(o.routeGlow * S); }
      if (o.routeAlpha !== undefined) ctx.globalAlpha = o.routeAlpha;
      drawRoute(ctx, polyline, P, titleH, W - P * 2, routeH, o.routeCol || sc.accent, Math.round(6 * S));
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    }
    // tiles
    selected.forEach((s, i) => {
      const col = i % COLS, row = Math.floor(i / COLS);
      const tx = P + col * (tW + gap), ty = tilesY + row * (tH + gap), cx = tx + tW / 2;
      // bg
      ctx.beginPath(); ctx.roundRect(tx, ty, tW, tH, r);
      ctx.fillStyle = typeof o.tileBg === 'function' ? o.tileBg(i) : (o.tileBg || 'rgba(255,255,255,0.06)');
      ctx.fill();
      // border
      if (o.tileBorder) {
        const bc = typeof o.tileBorder === 'function' ? o.tileBorder(i) : o.tileBorder;
        if (bc) { ctx.beginPath(); ctx.roundRect(tx, ty, tW, tH, r); ctx.strokeStyle = bc; ctx.lineWidth = Math.round(1.5 * S); ctx.stroke(); }
      }
      // left accent bar
      if (o.tileBar) {
        const bc = typeof o.tileBar === 'function' ? o.tileBar(i) : o.tileBar;
        if (bc) { ctx.fillStyle = bc; ctx.fillRect(tx, ty, Math.round(3 * S), tH); }
      }
      const { num, unit } = statVal(s, act), disp = num + (unit ? ' ' + unit : '');
      const iS = Math.round(Math.min(26, tH * 0.155) * S);
      const iCol = typeof o.iconCol === 'function' ? o.iconCol(i) : (o.iconCol || sc.accent);
      const lCol = typeof o.lblCol === 'function' ? o.lblCol(i) : (o.lblCol || sc.muted);
      const vCol = typeof o.valCol === 'function' ? o.valCol(i) : (o.valCol || sc.text);
      drawIcon(ctx, STAT_ICONS[s.key] || 'time', cx, ty + tH * 0.26, iS, iCol);
      let lfs = Math.round(11 * S); ctx.font = `700 ${lfs}px -apple-system,sans-serif`;
      const lbl = s.label.toUpperCase();
      while (lfs > 6 && ctx.measureText(lbl).width > tW * 0.9) { lfs--; ctx.font = `700 ${lfs}px -apple-system,sans-serif`; }
      ctx.fillStyle = lCol; ctx.textAlign = 'center'; ctx.letterSpacing = '0.03em'; ctx.fillText(lbl, cx, ty + tH * 0.53);
      let vfs = Math.round(30 * S); ctx.font = `800 ${vfs}px -apple-system,sans-serif`;
      while (vfs > 10 && ctx.measureText(disp).width > tW * 0.9) { vfs--; ctx.font = `800 ${vfs}px -apple-system,sans-serif`; }
      ctx.fillStyle = vCol; ctx.letterSpacing = '-0.5px'; ctx.fillText(disp, cx, ty + tH * 0.87);
      ctx.letterSpacing = '0px';
    });
  }

  switch (layout) {

    /* 0. STRAVA — official-style share card: white card, map, 3-col stat row */
    case 'strava': {
      const useLightCard = sc.card === 'transparent' || /rgba?\(255,\s*255,\s*255/.test(sc.card);
      const cardBg = useLightCard ? '#ffffff' : sc.card;
      const tCol = useLightCard ? '#0f0f0f' : sc.text;
      const mCol = useLightCard ? '#888888' : sc.muted;
      const dCol = useLightCard ? '#e8e8e8' : sc.div;
      const aCol = sc.accent;
      const mapTint = useLightCard ? '#f3f3f3' : 'rgba(255,255,255,0.04)';

      // floating card sits on a neutral near-black frame so it always pops
      if (!skipBg) {
        ctx.fillStyle = '#070708';
        ctx.fillRect(0, 0, W, H);
      }

      // card with shadow
      const cardR = Math.round(28 * S);
      const cardX = Math.round(36 * S), cardY = Math.round(72 * S);
      const cardW = W - cardX * 2, cardH = H - cardY * 2;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = Math.round(40 * S);
      ctx.shadowOffsetY = Math.round(8 * S);
      let cardFill = cardBg;
      if (typeof cardBg === 'string' && cardBg.startsWith('linear-gradient')) {
        const m = cardBg.match(/linear-gradient\([^,]+,\s*([^,]+),\s*([^)]+)\)/);
        if (m) {
          const g = ctx.createLinearGradient(cardX, cardY, cardX + cardW * 0.6, cardY + cardH);
          g.addColorStop(0, m[1].trim()); g.addColorStop(1, m[2].trim());
          cardFill = g;
        } else cardFill = '#1a1a1a';
      }
      ctx.fillStyle = cardFill;
      ctx.beginPath(); ctx.roundRect(cardX, cardY, cardW, cardH, cardR); ctx.fill();
      ctx.restore();

      const innerX = cardX + Math.round(48 * S);
      const innerW = cardW - Math.round(96 * S);
      let yc = cardY + Math.round(56 * S);

      // top meta line: TYPE · DATE
      if (!hideDate) {
        ctx.fillStyle = aCol;
        ctx.font = `700 ${Math.round(18 * S)}px -apple-system,sans-serif`;
        ctx.textAlign = 'left'; ctx.letterSpacing = '0.10em';
        ctx.fillText((act.type || 'ACTIVITY').toUpperCase() + '   ·   ' + (act.start_date ? fmtDt(act.start_date).toUpperCase() : ''), innerX, yc);
        yc += Math.round(34 * S);
      }

      // activity name
      if (!hideTitle) {
        const nm = act.name || 'Activity';
        let nfs = Math.round(58 * S);
        ctx.font = `800 ${nfs}px -apple-system,sans-serif`;
        while (nfs > Math.round(22 * S) && ctx.measureText(nm).width > innerW) {
          nfs -= Math.max(1, Math.round(2 * S));
          ctx.font = `800 ${nfs}px -apple-system,sans-serif`;
        }
        ctx.fillStyle = tCol; ctx.textAlign = 'left'; ctx.letterSpacing = '-1px';
        ctx.fillText(nm, innerX, yc + nfs);
        yc += nfs + Math.round(10 * S);
      }

      // location subline
      const locParts = [act.location_city, act.location_state, act.location_country].filter(Boolean);
      if (locParts.length && !hideDate) {
        const locStr = locParts.join(', ');
        ctx.fillStyle = mCol;
        ctx.font = `400 ${Math.round(22 * S)}px -apple-system,sans-serif`;
        ctx.letterSpacing = '0';
        ctx.fillText(locStr, innerX, yc + Math.round(22 * S));
        yc += Math.round(38 * S);
      }
      yc += Math.round(20 * S);

      // map area
      const statsBlockH = Math.round(180 * S);
      const logoBlockH = Math.round(60 * S);
      const mapAvailH = (cardY + cardH) - yc - statsBlockH - logoBlockH - Math.round(40 * S);
      const mapH = Math.max(Math.round(220 * S), mapAvailH);
      ctx.fillStyle = mapTint;
      ctx.beginPath(); ctx.roundRect(innerX, yc, innerW, mapH, Math.round(16 * S)); ctx.fill();
      if (polyline && polyline.length > 1 && !hideRoute) {
        drawRoute(ctx, polyline,
          innerX + Math.round(28 * S), yc + Math.round(28 * S),
          innerW - Math.round(56 * S), mapH - Math.round(56 * S),
          aCol, Math.round(7 * S));
      } else if (hideRoute) {
        // empty
      } else {
        ctx.fillStyle = mCol;
        ctx.font = `500 ${Math.round(22 * S)}px -apple-system,sans-serif`;
        ctx.textAlign = 'center'; ctx.letterSpacing = '0';
        ctx.fillText('No route data', innerX + innerW / 2, yc + mapH / 2);
      }
      yc += mapH + Math.round(34 * S);

      // 3-cell stat row (use first 3 selected, with sensible default)
      let cellStats = selected.slice(0, 3);
      if (cellStats.length < 3) {
        const fallback = STAT_DEFS.filter(s => ['distance', 'moving_time', 'total_elevation_gain'].includes(s.key));
        for (const f of fallback) {
          if (cellStats.length >= 3) break;
          if (!cellStats.find(c => c.key === f.key)) cellStats.push(f);
        }
      }
      const cellW = innerW / cellStats.length;
      cellStats.forEach((s, i) => {
        const cxc = innerX + i * cellW + cellW / 2;
        if (i > 0) {
          ctx.fillStyle = dCol;
          ctx.fillRect(innerX + i * cellW, yc + Math.round(14 * S), Math.max(1, Math.round(1 * S)), Math.round(108 * S));
        }
        const { num, unit } = statVal(s, act);
        const disp = num + (unit ? ' ' + unit : '');
        ctx.fillStyle = mCol;
        ctx.font = `600 ${Math.round(17 * S)}px -apple-system,sans-serif`;
        ctx.textAlign = 'center'; ctx.letterSpacing = '0.06em';
        ctx.fillText(s.label.toUpperCase(), cxc, yc + Math.round(34 * S));
        let vfs = Math.round(54 * S);
        ctx.font = `800 ${vfs}px -apple-system,sans-serif`;
        while (vfs > Math.round(20 * S) && ctx.measureText(disp).width > cellW * 0.86) {
          vfs -= Math.max(1, Math.round(2 * S));
          ctx.font = `800 ${vfs}px -apple-system,sans-serif`;
        }
        ctx.fillStyle = tCol; ctx.letterSpacing = '-1px';
        ctx.fillText(disp, cxc, yc + Math.round(102 * S));
      });

      // strava wordmark bottom-right
      if (!hideLogo) {
        ctx.fillStyle = aCol;
        ctx.font = `900 ${Math.round(24 * S)}px -apple-system,sans-serif`;
        ctx.textAlign = 'right'; ctx.letterSpacing = '0.04em';
        ctx.fillText('STRAVA', cardX + cardW - Math.round(48 * S), cardY + cardH - Math.round(40 * S));
        ctx.letterSpacing = '0';
      }
      break;
    }

    /* 1. STRIP — centered card, 2-col stat grid */
    case 'strip': {
      const COLS = Math.min(selected.length, 2), ROWS = Math.ceil(selected.length / COLS);
      const cW = W - P * 2, rH = Math.round(240 * S);
      const hH = Math.round(180 * S), cardH = hH + ROWS * rH;
      const cY = Math.round((H - cardH) / 2);
      if (sc.card !== 'transparent') { ctx.fillStyle = sc.card; ctx.fillRect(P, cY, cW, cardH); }
      title(P + Math.round(52 * S), cY + Math.round(82 * S), cW - Math.round(104 * S), 52);
      grid(selected, P, cY + hH, cW, ROWS * rH, COLS);
      break;
    }

    /* 2. GRID — full card, 2-col */
    case 'grid': {
      if (sc.card !== 'transparent') { ctx.fillStyle = sc.card; ctx.fillRect(0, 0, W, H); }
      title(P, Math.round(100 * S), W - P * 2, 62);
      grid(selected, 0, Math.round(195 * S), W, H - Math.round(210 * S), 2);
      break;
    }

    /* 3. HERO — giant first stat, 2-col rest */
    case 'hero': {
      if (sc.card !== 'transparent') { ctx.fillStyle = sc.card; ctx.fillRect(P, P, W - P * 2, H - P * 2); }
      title(P + Math.round(52 * S), P + Math.round(78 * S), W - P * 2 - Math.round(104 * S), 50);
      if (selected.length > 0) {
        const s = selected[0]; const { num, unit } = statVal(s, act);
        ctx.fillStyle = sc.accent; ctx.font = F(32, 700); ctx.textAlign = 'center'; ctx.letterSpacing = '0.12em';
        ctx.fillText(s.label.toUpperCase(), W / 2, P + Math.round(240 * S));
        drawIcon(ctx, STAT_ICONS[s.key] || 'time', W / 2, P + Math.round(315 * S), Math.round(72 * S), sc.accent);
        const hfs = fitText(num, W - P * 4, 172, 900);
        ctx.fillStyle = sc.text; ctx.letterSpacing = '-0.04em'; ctx.textAlign = 'center';
        ctx.fillText(num, W / 2, P + Math.round(540 * S));
        if (unit) { ctx.fillStyle = sc.muted; ctx.font = F(44, 400); ctx.letterSpacing = '0'; ctx.fillText(unit, W / 2, P + Math.round(598 * S)); }
        if (selected.length > 1) {
          grid(selected.slice(1), P, P + Math.round(650 * S), W - P * 2, H - P * 2 - Math.round(660 * S), 2);
        }
      }
      break;
    }

    /* 4. MAP — route top, stats bottom */
    case 'map': {
      const mapH = Math.round(H * 0.46);
      if (sc.card !== 'transparent') { ctx.fillStyle = sc.card; ctx.fillRect(0, 0, W, H); }
      const routeBg = sc.card !== 'transparent' ? sc.card : 'rgba(255,255,255,0.06)';
      if (!skipBg) { ctx.fillStyle = routeBg; ctx.fillRect(0, 0, W, mapH); }
      if (polyline && polyline.length > 1) {
        drawRoute(ctx, polyline, P, Math.round(P * 0.7), W - P * 2, mapH - P * 1.3, sc.accent, Math.round(6 * S));
      } else {
        ctx.fillStyle = sc.muted; ctx.font = F(34, 400); ctx.textAlign = 'center'; ctx.fillText('No route data', W / 2, mapH / 2);
      }
      const bY = mapH + Math.round(16 * S);
      title(P, bY + Math.round(72 * S), W - P * 2, 50);
      grid(selected, 0, bY + Math.round(165 * S), W, H - bY - Math.round(170 * S), 2);
      break;
    }

    /* 5. MINIMAL — clean typography, no icons */
    case 'minimal': {
      if (sc.card !== 'transparent') { ctx.fillStyle = sc.card; ctx.fillRect(0, 0, W, H); }
      title(P, Math.round(130 * S), W - P * 2, 58);
      const lY = Math.round(230 * S);
      rows(selected, P, lY, W - P * 2, H - lY - P);
      break;
    }

    /* 6. SPLIT — left accent panel, right stats list */
    case 'split': {
      const sX = Math.round(W * 0.41);
      if (!skipBg) { ctx.globalAlpha = 0.72; ctx.fillStyle = sc.accent; ctx.fillRect(0, 0, sX, H); ctx.globalAlpha = 1; }
      if (sc.card !== 'transparent') { ctx.fillStyle = sc.card; ctx.fillRect(sX, 0, W - sX, H); }
      ctx.save(); ctx.translate(sX / 2, H / 2); ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.font = `900 ${Math.round(88 * S)}px -apple-system,sans-serif`; ctx.textAlign = 'center'; ctx.letterSpacing = '-2px';
      ctx.fillText((act.type || 'ACTIVITY').toUpperCase(), 0, Math.round(32 * S)); ctx.restore();
      if (polyline && polyline.length > 1) {
        drawRoute(ctx, polyline, Math.round(20 * S), Math.round(H * 0.28), sX - Math.round(40 * S), Math.round(H * 0.4), 'rgba(255,255,255,0.7)', Math.round(4 * S));
      }
      if (!hideDate) {
        ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = F(25, 500); ctx.textAlign = 'center'; ctx.letterSpacing = '0';
        ctx.fillText(act.start_date ? fmtDt(act.start_date) : '', sX / 2, Math.round(H * 0.88));
      }
      const rx = sX + Math.round(50 * S), rw = W - rx - Math.round(36 * S);
      let nm = act.name || 'Activity';
      const nfs = fitText(nm, rw, 40, 700);
      if (!hideTitle) {
        ctx.fillStyle = sc.text; ctx.textAlign = 'left'; ctx.letterSpacing = '-0.5px'; ctx.fillText(nm, rx, Math.round(96 * S));
      }
      if (!hideDate) {
        ctx.fillStyle = sc.muted; ctx.font = F(24, 400); ctx.letterSpacing = '0'; ctx.fillText(act.type || '', rx, Math.round(132 * S));
      }
      rows(selected, rx, Math.round(162 * S), rw, H - Math.round(174 * S));
      break;
    }

    /* 7. STACKED — full-width rows with icon */
    case 'stacked': {
      if (sc.card !== 'transparent') { ctx.fillStyle = sc.card; ctx.fillRect(P, P, W - P * 2, H - P * 2); }
      title(P + Math.round(50 * S), P + Math.round(74 * S), W - P * 2 - Math.round(100 * S), 50);
      const lY = P + Math.round(164 * S);
      const available = H - P * 2 - Math.round(164 * S);
      const rH = Math.min(Math.round(188 * S), available / Math.max(selected.length, 1));
      selected.forEach((s, i) => {
        const { num, unit } = statVal(s, act), ry = lY + i * rH;
        const iconS = Math.round(36 * S);
        drawIcon(ctx, STAT_ICONS[s.key] || 'time', P + iconS * 1.4, ry + rH / 2, iconS, sc.icon);
        ctx.fillStyle = sc.muted; ctx.font = F(20, 600); ctx.letterSpacing = '0.05em'; ctx.textAlign = 'left';
        ctx.fillText(s.label.toUpperCase(), P + iconS * 2.8, ry + rH / 2 - Math.round(8 * S));
        let vfs = Math.round(56 * S);
        const maxVW = (W - P * 2) * 0.36;
        ctx.font = `800 ${vfs}px -apple-system,sans-serif`;
        while (vfs > Math.round(20 * S) && ctx.measureText(num).width > maxVW) { vfs -= Math.max(1, Math.round(2 * S)); ctx.font = `800 ${vfs}px -apple-system,sans-serif`; }
        ctx.fillStyle = sc.accent; ctx.letterSpacing = '-1px'; ctx.textAlign = 'right';
        ctx.fillText(num, W - P - Math.round(80 * S), ry + rH / 2 + Math.round(22 * S));
        if (unit) { ctx.fillStyle = sc.muted; ctx.font = F(22, 500); ctx.letterSpacing = '0'; ctx.fillText(unit, W - P - Math.round(38 * S), ry + rH / 2 + Math.round(20 * S)); }
      });
      break;
    }

    /* 8. CINEMA — dark borders top/bottom, center card */
    case 'cinema': {
      if (sc.card !== 'transparent') { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); }
      const cY = Math.round(H * 0.19), cH = Math.round(H * 0.62);
      if (sc.card !== 'transparent') { ctx.fillStyle = sc.card; ctx.fillRect(0, cY, W, cH); }
      title(P, cY + Math.round(72 * S), W - P * 2, 50);
      grid(selected, 0, cY + Math.round(160 * S), W, cH - Math.round(168 * S), 2);
      if (!hideLogo) {
        ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.font = F(26, 400); ctx.textAlign = 'center'; ctx.letterSpacing = '0.12em';
        ctx.fillText('STRAVA · ' + new Date().getFullYear(), W / 2, cY - Math.round(32 * S)); ctx.letterSpacing = '0px';
      }
      if (polyline && polyline.length > 1) {
        drawRoute(ctx, polyline, P, cY + cH + Math.round(32 * S), W - P * 2, H - (cY + cH) - Math.round(48 * S), sc.accent, Math.round(4 * S));
      }
      break;
    }

    /* 9. NEON — dark glow */
    case 'neon': {
      if (sc.card !== 'transparent') { ctx.fillStyle = sc.card === 'rgba(18,18,18,0.97)' || sc.card === 'rgba(5,5,5,0.97)' || sc.card === 'rgba(10,12,28,0.97)' ? sc.card : '#050510'; ctx.fillRect(0, 0, W, H); }
      const grd = ctx.createLinearGradient(0, 0, W, H);
      grd.addColorStop(0, sc.accent + '22'); grd.addColorStop(.5, sc.accent + '30'); grd.addColorStop(1, sc.accent + '08');
      if (!skipBg) { ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H); }
      let nm2 = act.name || 'Activity';
      const nfs2 = fitText(nm2, W - P * 2, 48, 700);
      if (!hideTitle) {
        ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.textAlign = 'left'; ctx.letterSpacing = '-0.5px'; ctx.fillText(nm2, P, Math.round(96 * S));
      }
      if (!hideDate) {
        ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.font = F(28, 400); ctx.letterSpacing = '0';
        ctx.fillText((act.start_date ? fmtDt(act.start_date) : '') + ' · ' + (act.type || ''), P, Math.round(138 * S));
      }
      let statsY = Math.round(185 * S);
      if (polyline && polyline.length > 1) {
        ctx.shadowColor = sc.accent; ctx.shadowBlur = Math.round(14 * S);
        const routeH = Math.round(480 * S);
        drawRoute(ctx, polyline, P, statsY, W - P * 2, routeH, sc.accent, Math.round(5 * S));
        ctx.shadowBlur = 0; statsY += routeH + Math.round(40 * S);
      }
      const COLS = Math.min(selected.length, 2), ROWS = Math.ceil(selected.length / COLS);
      const cW = (W - P * 2) / COLS, cH = (H - statsY - Math.round(30 * S)) / ROWS;
      selected.forEach((s, i) => {
        const col = i % COLS, row = Math.floor(i / COLS);
        const cx = P + col * cW + cW / 2, cy = statsY + row * cH;
        const { num, unit } = statVal(s, act);
        const iconS = Math.round(44 * S);
        ctx.shadowColor = sc.accent; ctx.shadowBlur = Math.round(7 * S);
        drawIcon(ctx, STAT_ICONS[s.key] || 'time', cx, cy + cH * 0.24, iconS, sc.accent);
        ctx.shadowBlur = 0;
        ctx.fillStyle = sc.accent; ctx.font = F(18, 600); ctx.textAlign = 'center'; ctx.letterSpacing = '0.06em';
        ctx.fillText(s.label.toUpperCase(), cx, cy + cH * 0.52);
        let vfs = Math.round(Math.min(66, cH * 0.32) * S);
        ctx.font = `800 ${vfs}px -apple-system,sans-serif`;
        while (vfs > Math.round(18 * S) && ctx.measureText(num + (unit ? ' ' + unit : '')).width > cW * 0.8) { vfs -= Math.max(1, Math.round(2 * S)); ctx.font = `800 ${vfs}px -apple-system,sans-serif`; }
        ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.letterSpacing = '-1px';
        ctx.fillText(num + (unit ? ' ' + unit : ''), cx, cy + cH * 0.86); ctx.letterSpacing = '0px';
      });
      break;
    }

    /* 10. SPORT — diagonal accent, right stats list */
    case 'sport': {
      if (sc.card !== 'transparent') { ctx.fillStyle = sc.card; ctx.fillRect(0, 0, W, H); }
      ctx.save(); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W * 0.55, 0); ctx.lineTo(W * 0.38, H); ctx.lineTo(0, H); ctx.closePath();
      ctx.globalAlpha = 0.72; ctx.fillStyle = sc.accent; ctx.fill(); ctx.globalAlpha = 1; ctx.restore();
      ctx.save(); ctx.translate(W * 0.18, H / 2); ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = 'rgba(255,255,255,0.13)'; ctx.font = `900 ${Math.round(115 * S)}px -apple-system,sans-serif`; ctx.textAlign = 'center'; ctx.letterSpacing = '-2px';
      ctx.fillText((act.type || 'SPORT').toUpperCase(), 0, Math.round(42 * S)); ctx.restore();
      if (polyline && polyline.length > 1) {
        ctx.globalAlpha = 0.25; drawRoute(ctx, polyline, Math.round(18 * S), Math.round(H * 0.1), W * 0.37 - Math.round(36 * S), Math.round(H * 0.8), '#fff', Math.round(4 * S)); ctx.globalAlpha = 1;
      }
      const rx = W * 0.42, rw = W - rx - P;
      let nm3 = act.name || 'Activity';
      const nfs3 = fitText(nm3, rw, 42, 700);
      if (!hideTitle) {
        ctx.fillStyle = sc.text; ctx.textAlign = 'left'; ctx.letterSpacing = '-0.5px'; ctx.fillText(nm3, rx, Math.round(106 * S));
      }
      if (!hideDate) {
        ctx.fillStyle = sc.muted; ctx.font = F(24, 400); ctx.letterSpacing = '0';
        ctx.fillText(act.start_date ? fmtDt(act.start_date) : '', rx, Math.round(142 * S));
      }
      rows(selected, rx, Math.round(165 * S), rw, H - Math.round(180 * S));
      break;
    }

    /* 11. GRADIENT — vertical gradient BG, stat grid centered */
    case 'gradient': {
      if (!skipBg) {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        if (sc.card !== 'transparent') { g.addColorStop(0, sc.card); g.addColorStop(1, sc.accent + 'cc'); }
        else { g.addColorStop(0, sc.accent + '44'); g.addColorStop(1, sc.accent + 'cc'); }
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        const lineY = Math.round(H * 0.65);
        ctx.globalAlpha = 0.15; ctx.fillStyle = sc.accent; ctx.fillRect(0, lineY, W, H - lineY); ctx.globalAlpha = 1;
      }
      title(P, Math.round(110 * S), W - P * 2, 56);
      const sY = Math.round(220 * S), sH = H - Math.round(240 * S);
      if (polyline && polyline.length > 1) {
        drawRoute(ctx, polyline, P, sY, W - P * 2, Math.round(380 * S), sc.text === '#111' ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.4)', Math.round(5 * S));
        grid(selected, 0, sY + Math.round(410 * S), W, H - sY - Math.round(420 * S), 2);
      } else {
        grid(selected, 0, sY, W, sH, 2);
      }
      break;
    }

    /* 12. BADGE — stats as rounded pill badges */
    case 'badge': {
      if (sc.card !== 'transparent') { ctx.fillStyle = sc.card; ctx.fillRect(0, 0, W, H); }
      title(P, Math.round(120 * S), W - P * 2, 56);
      const bpad = Math.round(28 * S), bh = Math.round(130 * S), bgap = Math.round(22 * S);
      const bw = (W - P * 2 - bgap) / 2;
      selected.forEach((s, i) => {
        const col = i % 2, row = Math.floor(i / 2);
        const bx = P + col * (bw + bgap), by = Math.round(240 * S) + row * (bh + bgap);
        const r = Math.round(18 * S);
        ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, r);
        ctx.fillStyle = i % 3 === 0 ? sc.accent + '22' : sc.card === 'transparent' ? 'rgba(255,255,255,0.08)' : sc.div;
        ctx.fill();
        ctx.strokeStyle = i % 3 === 0 ? sc.accent + '66' : sc.div; ctx.lineWidth = Math.round(1.5 * S); ctx.stroke();
        const { num, unit } = statVal(s, act);
        const iconS2 = Math.round(28 * S);
        drawIcon(ctx, STAT_ICONS[s.key] || 'time', bx + bpad, by + bh / 2, iconS2, i % 3 === 0 ? sc.accent : sc.icon);
        ctx.fillStyle = sc.muted; ctx.font = F(17, 600); ctx.letterSpacing = '0.04em'; ctx.textAlign = 'left';
        ctx.fillText(s.label.toUpperCase(), bx + bpad * 2.2, by + bh * 0.38);
        let vfs2 = Math.round(46 * S); ctx.font = `800 ${vfs2}px -apple-system,sans-serif`;
        while (vfs2 > Math.round(18 * S) && ctx.measureText(num + (unit ? ' ' + unit : '')).width > bw - bpad * 2.5) { vfs2 -= Math.max(1, Math.round(2 * S)); ctx.font = `800 ${vfs2}px -apple-system,sans-serif`; }
        ctx.fillStyle = sc.text; ctx.letterSpacing = '-0.5px';
        ctx.fillText(num + (unit ? ' ' + unit : ''), bx + bpad * 2.2, by + bh * 0.76);
      });
      break;
    }

    /* 13. TILES — 5 or 6 compact stat tiles per row */
    case 'tiles': {
      if (sc.card !== 'transparent') { ctx.fillStyle = sc.card; ctx.fillRect(0, 0, W, H); }
      title(P, Math.round(118 * S), W - P * 2, 52);

      const COLS = selected.length > 5 ? 6 : 5;
      const gap = Math.round(10 * S);
      const tW = (W - P * 2 - gap * (COLS - 1)) / COLS;

      // optional route strip at bottom
      const hasRoute = polyline && polyline.length > 1;
      const routeH = hasRoute ? Math.round(340 * S) : 0;
      const routeY = H - routeH - Math.round(30 * S);

      // distribute tiles in available height
      const tilesAreaH = routeH > 0 ? routeY - Math.round(230 * S) - Math.round(20 * S) : H - Math.round(230 * S) - Math.round(30 * S);
      const ROWS = Math.ceil(selected.length / COLS);
      const tH = Math.min(Math.round(260 * S), Math.floor((tilesAreaH - gap * (ROWS - 1)) / ROWS));
      const startY = Math.round(220 * S);

      selected.forEach((s, i) => {
        const col = i % COLS, row = Math.floor(i / COLS);
        const tx = P + col * (tW + gap), ty = startY + row * (tH + gap);
        const cx = tx + tW / 2;
        const r = Math.round(14 * S);

        // tile background
        ctx.beginPath(); ctx.roundRect(tx, ty, tW, tH, r);
        const isAccent = i % 5 === 0;
        ctx.fillStyle = isAccent ? (sc.accent + '28') : (sc.card === 'transparent' ? 'rgba(255,255,255,0.07)' : sc.div);
        ctx.fill();
        if (isAccent) { ctx.strokeStyle = sc.accent + '55'; ctx.lineWidth = Math.round(1.5 * S); ctx.stroke(); }

        const { num, unit } = statVal(s, act);

        // icon — top portion of tile
        const iconS = Math.round(Math.min(26, tH * 0.15) * S);
        drawIcon(ctx, STAT_ICONS[s.key] || 'time', cx, ty + tH * 0.26, iconS, isAccent ? sc.accent : sc.icon);

        // label — middle
        let lfs = Math.round(13 * S);
        ctx.font = `700 ${lfs}px -apple-system,sans-serif`;
        const lbl = s.label.toUpperCase();
        while (lfs > Math.round(7 * S) && ctx.measureText(lbl).width > tW * 0.9) { lfs--; ctx.font = `700 ${lfs}px -apple-system,sans-serif`; }
        ctx.fillStyle = isAccent ? sc.accent : sc.muted; ctx.textAlign = 'center'; ctx.letterSpacing = '0.03em';
        ctx.fillText(lbl, cx, ty + tH * 0.54);

        // value — bottom
        const disp = num + (unit ? ' ' + unit : '');
        let vfs = Math.round(32 * S);
        ctx.font = `800 ${vfs}px -apple-system,sans-serif`;
        while (vfs > Math.round(12 * S) && ctx.measureText(disp).width > tW * 0.92) { vfs--; ctx.font = `800 ${vfs}px -apple-system,sans-serif`; }
        ctx.fillStyle = sc.text; ctx.letterSpacing = '-0.5px';
        ctx.fillText(disp, cx, ty + tH * 0.86);
        ctx.letterSpacing = '0px';
      });

      // route strip at bottom
      if (hasRoute) {
        ctx.globalAlpha = 0.35;
        drawRoute(ctx, polyline, P, routeY, W - P * 2, routeH - Math.round(10 * S), sc.accent, Math.round(4 * S));
        ctx.globalAlpha = 1;
      }
      break;
    }

    /* 14. INK — high contrast B&W with bold type */
    case 'ink': {
      const bg = sc.card === 'transparent' ? 'transparent' : (sc.card.includes('255,255,255') ? '#fff' : '#0a0a0a');
      const fg = bg === '#fff' ? '#0a0a0a' : bg === 'transparent' ? sc.text : '#f0f0f0';
      const mg = bg === '#fff' ? '#888' : bg === 'transparent' ? sc.muted : '#444';
      if (bg !== 'transparent') { ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); }
      // big type name
      let nm = act.name || 'Activity';
      ctx.fillStyle = fg; ctx.textAlign = 'left'; ctx.letterSpacing = '-2px';
      const nfs = fitText(nm, W - P * 2, 80, 900);
      if (!hideTitle) { ctx.fillText(nm, P, Math.round(120 * S)); }
      if (!hideDate) {
        ctx.fillStyle = mg; ctx.font = F(26, 400); ctx.letterSpacing = '2px';
        ctx.fillText((act.start_date ? fmtDt(act.start_date) : '').toUpperCase(), P, Math.round(162 * S));
      }
      // thick divider line
      ctx.fillStyle = sc.accent; ctx.fillRect(P, Math.round(182 * S), Math.round(88 * S), Math.round(5 * S));
      // stats as large numbers — dynamic row height so all fit
      const inkStartY = Math.round(215 * S);
      const inkAvail = H - inkStartY - Math.round(30 * S);
      const inkRH = Math.min(Math.round(200 * S), Math.floor(inkAvail / Math.max(selected.length, 1)));
      selected.forEach((s, i) => {
        const { num, unit } = statVal(s, act), ry = inkStartY + i * inkRH;
        ctx.fillStyle = mg; ctx.font = F(18, 700); ctx.letterSpacing = '0.08em'; ctx.textAlign = 'left';
        ctx.fillText(s.label.toUpperCase(), P, ry + Math.round(26 * S));
        // fit value font
        const maxNumW = W - P * 2 - (unit ? Math.round(120 * S) : 0);
        let vfs = Math.round(Math.min(80, inkRH * 0.55) * S);
        ctx.font = `900 ${vfs}px -apple-system,sans-serif`;
        while (vfs > Math.round(20 * S) && ctx.measureText(num).width > maxNumW) { vfs -= Math.max(1, Math.round(2 * S)); ctx.font = `900 ${vfs}px -apple-system,sans-serif`; }
        ctx.fillStyle = fg; ctx.letterSpacing = '-2px'; ctx.textAlign = 'left';
        ctx.fillText(num, P, ry + inkRH - Math.round(18 * S));
        if (unit) {
          // measure num width with current font BEFORE switching to unit font
          const numW = ctx.measureText(num).width;
          ctx.fillStyle = sc.accent; ctx.font = F(Math.min(28, vfs * 0.38 / S), 700); ctx.letterSpacing = '0';
          ctx.fillText(unit, P + numW + Math.round(10 * S), ry + inkRH - Math.round(20 * S));
        }
      });
      break;
    }



    /* 15. NIGHT RUN — frosted glass card, waveform charts, bar splits */
    case 'nightrun': {
      // ── background — scheme-derived ──
      if (!skipBg) { ctx.fillStyle = baseBg; ctx.fillRect(0, 0, W, H); }

      // seeded waveform helper
      function wave(wx, wy, ww, wh, seed, col, lw) {
        const pts = 90, amp = wh * 0.42;
        ctx.beginPath();
        for (let i = 0; i <= pts; i++) {
          const t = i / pts;
          const nx = wx + ww * t;
          const ny = wy + wh / 2
            + Math.sin(t * 6.3 + seed) * amp * 0.38
            + Math.sin(t * 14 + seed * 1.7) * amp * 0.26
            + Math.sin(t * 28 + seed * 3.1) * amp * 0.14
            + Math.sin(t * 52 + seed * 5.3) * amp * 0.08;
          i === 0 ? ctx.moveTo(nx, ny) : ctx.lineTo(nx, ny);
        }
        ctx.strokeStyle = col;
        ctx.lineWidth = lw * S;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      }

      // bar chart helper (simulated splits)
      function bars(bx, by, bw, bh, count, seed, col) {
        const gap = Math.round(6 * S), bW = (bw - gap * (count - 1)) / count;
        for (let i = 0; i < count; i++) {
          const h2 = bh * (0.4 + 0.5 * Math.abs(Math.sin(i * 1.9 + seed) + (Math.cos(i * 2.7 + seed * 0.8)) * 0.3));
          const rx = bx + i * (bW + gap), ry = by + bh - h2;
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.roundRect(rx, ry, bW, h2, Math.round(3 * S)); ctx.fill();
        }
      }

      const seed = (act.id || 12345) % 100;

      // frosted card bounds
      const cardX = Math.round(52 * S), cardW = W - cardX * 2;
      const cardY = Math.round(90 * S), cardH = H - cardY * 2;
      const cx = cardX + Math.round(28 * S), cInnerW = cardW - Math.round(56 * S);
      let cy3 = cardY + Math.round(36 * S);

      // top row — logo
      if (!hideLogo) {
        const lx = cardX + cardW - Math.round(32 * S), ly = cy3 + Math.round(13 * S);
        ctx.fillStyle = sc.accent;
        ctx.font = `900 ${Math.round(16 * S)}px -apple-system,sans-serif`;
        ctx.textAlign = 'right';
        ctx.letterSpacing = '-1px';
        ctx.fillText('S', lx, ly);
      }
      cy3 += Math.round(44 * S);

      // activity name
      const nm2 = act.name || 'Activity';
      let nfs = Math.round(46 * S);
      ctx.font = `900 ${nfs}px -apple-system,sans-serif`;
      while (nfs > Math.round(22 * S) && ctx.measureText(nm2).width > cInnerW) {
        nfs -= Math.max(1, Math.round(2 * S));
        ctx.font = `900 ${nfs}px -apple-system,sans-serif`;
      }
      if (!hideTitle) {
        ctx.fillStyle = sc.text;
        ctx.textAlign = 'left';
        ctx.letterSpacing = '-1px';
        ctx.fillText(nm2, cx, cy3);
        cy3 += nfs + Math.round(6 * S);
      }

      // location / date line
      if (!hideDate) {
        const loc2 = [act.location_city, act.location_state, act.location_country].filter(Boolean).join(', ')
          || (act.start_latlng && act.start_latlng.length ? `${act.start_latlng[0].toFixed(2)}, ${act.start_latlng[1].toFixed(2)}` : '');
        const locStr = loc2 || (act.start_date ? fmtDt(act.start_date) : '');
        if (locStr) {
          ctx.fillStyle = sc.muted;
          ctx.font = `400 ${Math.round(20 * S)}px -apple-system,sans-serif`;
          ctx.letterSpacing = '0';
          ctx.textAlign = 'left';
          ctx.fillText(locStr, cx, cy3 + Math.round(22 * S));
          cy3 += Math.round(36 * S);
        }
      }
      cy3 += Math.round(16 * S);

      // stat rows
      const nrStats = selected.length > 0 ? selected : [];
      const STAT_STREAM_MAP = {
        average_speed: 'velocity_smooth',
        max_speed: 'velocity_smooth',
        average_heartrate: 'heartrate',
        max_heartrate: 'heartrate',
        average_cadence: 'cadence',
        total_elevation_gain: 'altitude',
      };

      // 🔹 CONSISTENT DIVIDER CONFIG
      const dividerHeight = Math.round(1.5 * S); // thickness
      const dividerGap = Math.round(14 * S);     // spacing after each stat

      nrStats.forEach((s, i) => {
        const { num, unit } = statVal(s, act);
        const streamKey = STAT_STREAM_MAP[s.key];
        const streamData = streamKey && currentStreams && currentStreams[streamKey] && currentStreams[streamKey].data;
        const hasChart = !!(streamData && streamData.length > 1);

        // label
        ctx.fillStyle = sc.muted;
        ctx.font = `700 ${Math.round(11 * S)}px -apple-system,sans-serif`;
        ctx.textAlign = 'left';
        ctx.letterSpacing = '0.06em';
        ctx.fillText(s.label.toUpperCase(), cx, cy3 + Math.round(14 * S));
        cy3 += Math.round(20 * S);

        // value
        let vfs2 = Math.round(44 * S);
        ctx.font = `900 ${vfs2}px -apple-system,sans-serif`;
        const disp = num + (unit ? ' ' + unit : '');
        while (vfs2 > Math.round(18 * S) && ctx.measureText(disp).width > cInnerW * 0.9) {
          vfs2 -= Math.max(1, Math.round(2 * S));
          ctx.font = `900 ${vfs2}px -apple-system,sans-serif`;
        }
        ctx.fillStyle = sc.text;
        ctx.textAlign = 'left';
        ctx.letterSpacing = '-1px';
        ctx.fillText(disp, cx, cy3 + vfs2);
        cy3 += vfs2 + Math.round(8 * S);

        // inline chart
        if (hasChart) {
          const miniH = Math.round(40 * S);
          drawAreaChart(ctx, streamData, cx, cy3, cInnerW, miniH, sc.accent, Math.round(2 * S));
          const dmin = Math.min(...streamData), dmax = Math.max(...streamData);
          ctx.fillStyle = sc.muted;
          ctx.font = `600 ${Math.round(10 * S)}px -apple-system,sans-serif`;
          ctx.letterSpacing = '0';
          if (streamKey === 'altitude') {
            ctx.textAlign = 'left'; ctx.fillText(Math.round(dmin) + 'm', cx, cy3 + miniH + Math.round(13 * S));
            ctx.textAlign = 'right'; ctx.fillText(Math.round(dmax) + 'm', cx + cInnerW, cy3 + miniH + Math.round(13 * S));
          } else if (streamKey === 'velocity_smooth') {
            ctx.textAlign = 'right'; ctx.fillText((dmax * 3.6).toFixed(1) + ' km/h max', cx + cInnerW, cy3 + miniH + Math.round(13 * S));
          } else if (streamKey === 'heartrate') {
            ctx.textAlign = 'left'; ctx.fillText(Math.round(dmin) + ' bpm', cx, cy3 + miniH + Math.round(13 * S));
            ctx.textAlign = 'right'; ctx.fillText(Math.round(dmax) + ' bpm max', cx + cInnerW, cy3 + miniH + Math.round(13 * S));
          } else if (streamKey === 'cadence') {
            ctx.textAlign = 'right'; ctx.fillText(Math.round(dmax) + ' rpm peak', cx + cInnerW, cy3 + miniH + Math.round(13 * S));
          }
          cy3 += miniH + Math.round(18 * S);
        }

        // ── divider: bottom border for EVERY stat ──
        ctx.fillStyle = sc.div;
        ctx.fillRect(cx, Math.round(cy3), cInnerW, dividerHeight);
        cy3 += dividerGap;
      });

      break;
    }

    /* 16. EXPLORER — full-bleed photo, route trace, top stat bar */
    case 'explorer': {
      // ── background ──
      if (!skipBg) {
        ctx.fillStyle = baseBgDark; ctx.fillRect(0, 0, W, H);
        // subtle texture dots
        ctx.fillStyle = 'rgba(255,255,255,0.015)';
        for (let i = 0; i < 200; i++) {
          const tx = (Math.sin(i * 1.7) * 0.5 + 0.5) * W, ty = (Math.sin(i * 2.3 + 1) * 0.5 + 0.5) * H;
          ctx.beginPath(); ctx.arc(tx, ty, Math.random() * 2 + 0.5, 0, Math.PI * 2); ctx.fill();
        }
      }
      // photo BG: main drawLayout already applied the image + 0.45 overlay

      // ── route — drawn large across full canvas ──
      if (polyline && polyline.length > 1) {
        const routeCol = sc.accent;
        ctx.shadowColor = routeCol; ctx.shadowBlur = Math.round(18 * S);
        ctx.globalAlpha = 0.18;
        drawRoute(ctx, polyline, Math.round(60 * S), Math.round(180 * S), W - Math.round(120 * S), H - Math.round(320 * S), routeCol, Math.round(10 * S));
        ctx.globalAlpha = 1; ctx.shadowBlur = 0;
        ctx.shadowColor = routeCol; ctx.shadowBlur = Math.round(12 * S);
        drawRoute(ctx, polyline, Math.round(60 * S), Math.round(180 * S), W - Math.round(120 * S), H - Math.round(320 * S), routeCol, Math.round(5 * S));
        ctx.shadowBlur = 0;
      }

      // ── top stat pill row ──
      const isCycE = isRide(act);
      const topStats = [
        { lbl: 'D+', val: Math.round(act.total_elevation_gain || 0) + 'm' },
        { lbl: 'Distance', val: fmtD(act.distance || 0) },
        isCycE
          ? { lbl: 'Avg Speed', val: act.average_speed ? kmh(act.average_speed) + ' km/h' : '—' }
          : { lbl: 'Avg HR', val: act.average_heartrate ? Math.round(act.average_heartrate) + 'bpm' : '—' },
        { lbl: 'Time', val: fmtT(act.moving_time || 0) },
      ];
      const pillH = Math.round(72 * S), pillY = Math.round(64 * S);
      // pill background
      ctx.fillStyle = 'rgba(0,0,0,0.62)';
      ctx.beginPath(); ctx.roundRect(Math.round(44 * S), pillY, W - Math.round(88 * S), pillH, Math.round(16 * S)); ctx.fill();

      const pW = (W - Math.round(88 * S)) / topStats.length;
      topStats.forEach((st, i) => {
        const px = Math.round(44 * S) + i * pW + pW / 2;
        if (i > 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.15)';
          ctx.fillRect(Math.round(44 * S) + i * pW, pillY + Math.round(12 * S), Math.round(1 * S), pillH - Math.round(24 * S));
        }
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = `600 ${Math.round(12 * S)}px -apple-system,sans-serif`;
        ctx.textAlign = 'center'; ctx.letterSpacing = '0.06em';
        ctx.fillText(st.lbl.toUpperCase(), px, pillY + Math.round(24 * S));
        ctx.fillStyle = '#fff'; ctx.font = `800 ${Math.round(22 * S)}px -apple-system,sans-serif`; ctx.letterSpacing = '-0.5px';
        ctx.fillText(st.val, px, pillY + Math.round(52 * S));
      });

      // ── bottom name band ──
      const bandH = Math.round(130 * S), bandY = H - bandH;
      const bandGrad = ctx.createLinearGradient(0, bandY - Math.round(40 * S), 0, H);
      bandGrad.addColorStop(0, 'transparent'); bandGrad.addColorStop(1, 'rgba(0,0,0,0.88)');
      ctx.fillStyle = bandGrad; ctx.fillRect(0, bandY - Math.round(40 * S), W, bandH + Math.round(40 * S));

      const nm3 = act.name || 'Activity';
      let nfs3 = Math.round(52 * S);
      ctx.font = `900 ${nfs3}px -apple-system,sans-serif`;
      while (nfs3 > Math.round(22 * S) && ctx.measureText(nm3).width > W - Math.round(120 * S)) { nfs3 -= Math.max(1, Math.round(2 * S)); ctx.font = `900 ${nfs3}px -apple-system,sans-serif`; }
      if (!hideTitle) {
        ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.letterSpacing = '-1px';
        ctx.fillText(nm3, Math.round(52 * S), bandY + Math.round(58 * S));
      }

      if (!hideDate) {
        ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = `400 ${Math.round(20 * S)}px -apple-system,sans-serif`; ctx.letterSpacing = '0';
        ctx.fillText((act.start_date ? fmtDt(act.start_date) : '') + ' · ' + (act.type || ''), Math.round(52 * S), bandY + Math.round(90 * S));
      }

      // Strava logo mark bottom-right
      if (!hideLogo) {
        // ctx.fillStyle = sc.accent; ctx.font = `900 ${Math.round(28 * S)}px -apple-system,sans-serif`; ctx.letterSpacing = '-1px'; ctx.textAlign = 'right';
        // ctx.fillText('STRAVA', W - Math.round(52 * S), bandY + Math.round(90 * S));
      }

      break;
    }

    /* 17. TOPO — true topographic map: marching-squares contours + route overlay */
    case 'topo': {
      // background — scheme-derived
      if (!skipBg) { ctx.fillStyle = baseBg; ctx.fillRect(0, 0, W, H); }

      // ── topographic height field ──
      // deterministic peaks per activity (so each ride has a unique terrain)
      const seedI = (act.id || 12345) % 9973;
      const rand = (n) => {
        const x = Math.sin(seedI * 0.0137 + n * 12.9898) * 43758.5453;
        return x - Math.floor(x);
      };
      const PEAK_COUNT = 3 + Math.floor(rand(1) * 3); // 3–5 peaks
      const peaks = [];
      for (let p = 0; p < PEAK_COUNT; p++) {
        peaks.push({
          x: W * (0.15 + rand(p * 7 + 3) * 0.70),
          y: H * (0.12 + rand(p * 11 + 5) * 0.76),
          h: 70 + rand(p * 13 + 9) * 70,
          r: W * (0.18 + rand(p * 17 + 2) * 0.16),
          sign: rand(p * 19 + 1) > 0.25 ? 1 : -0.55, // mostly peaks, occasional basin
        });
      }
      const noisePhase = rand(99) * 6.28;
      function heightAt(x, y) {
        let h = 0;
        for (const pk of peaks) {
          const dx = (x - pk.x) / pk.r, dy = (y - pk.y) / pk.r;
          h += pk.h * pk.sign * Math.exp(-(dx * dx + dy * dy) * 0.7);
        }
        // ridge noise
        h += Math.sin(x * 0.0095 + noisePhase) * Math.cos(y * 0.0088 + noisePhase * 1.7) * 7;
        h += Math.sin(x * 0.024 + noisePhase * 2.1) * Math.cos(y * 0.021 + noisePhase * 3.3) * 3;
        return h;
      }

      // sample grid
      const RES = 28;
      const cellGW = W / RES, cellGH = H / RES;
      const grid = new Array(RES + 1);
      for (let gy = 0; gy <= RES; gy++) {
        grid[gy] = new Array(RES + 1);
        for (let gx = 0; gx <= RES; gx++) {
          grid[gy][gx] = heightAt(gx * cellGW, gy * cellGH);
        }
      }

      // marching squares — draw each contour level
      const LEVELS = 18;
      const lo = -25, hi = 110;
      for (let l = 0; l < LEVELS; l++) {
        const level = lo + (hi - lo) * l / (LEVELS - 1);
        const isIdx = (l % 4 === 0);
        ctx.strokeStyle = sc.accent + (isIdx ? '78' : '22');
        ctx.lineWidth = (isIdx ? 1.7 : 0.9) * S;
        ctx.beginPath();
        for (let gy = 0; gy < RES; gy++) {
          for (let gx = 0; gx < RES; gx++) {
            const h0 = grid[gy][gx];
            const h1 = grid[gy][gx + 1];
            const h2 = grid[gy + 1][gx + 1];
            const h3 = grid[gy + 1][gx];
            let mIdx = 0;
            if (h0 > level) mIdx |= 1;
            if (h1 > level) mIdx |= 2;
            if (h2 > level) mIdx |= 4;
            if (h3 > level) mIdx |= 8;
            if (mIdx === 0 || mIdx === 15) continue;
            const x0 = gx * cellGW, y0 = gy * cellGH;
            const eTop = (level - h0) / (h1 - h0);
            const eRight = (level - h1) / (h2 - h1);
            const eBot = (level - h3) / (h2 - h3);
            const eLeft = (level - h0) / (h3 - h0);
            const tX = x0 + eTop * cellGW, tY = y0;
            const rX = x0 + cellGW, rY = y0 + eRight * cellGH;
            const bX = x0 + eBot * cellGW, bY = y0 + cellGH;
            const lX = x0, lY = y0 + eLeft * cellGH;
            switch (mIdx) {
              case 1: case 14: ctx.moveTo(tX, tY); ctx.lineTo(lX, lY); break;
              case 2: case 13: ctx.moveTo(tX, tY); ctx.lineTo(rX, rY); break;
              case 3: case 12: ctx.moveTo(lX, lY); ctx.lineTo(rX, rY); break;
              case 4: case 11: ctx.moveTo(bX, bY); ctx.lineTo(rX, rY); break;
              case 5:          ctx.moveTo(tX, tY); ctx.lineTo(rX, rY); ctx.moveTo(bX, bY); ctx.lineTo(lX, lY); break;
              case 6: case 9:  ctx.moveTo(tX, tY); ctx.lineTo(bX, bY); break;
              case 7: case 8:  ctx.moveTo(lX, lY); ctx.lineTo(bX, bY); break;
              case 10:         ctx.moveTo(tX, tY); ctx.lineTo(lX, lY); ctx.moveTo(bX, bY); ctx.lineTo(rX, rY); break;
            }
          }
        }
        ctx.stroke();
      }

      // corner survey ticks
      ctx.strokeStyle = sc.accent + '66';
      ctx.lineWidth = Math.max(1, Math.round(1.4 * S));
      const tickL = Math.round(20 * S);
      const cps = [[P, P, 1, 1], [W - P, P, -1, 1], [P, H - P, 1, -1], [W - P, H - P, -1, -1]];
      cps.forEach(([cx_, cy_, dx, dy]) => {
        ctx.beginPath();
        ctx.moveTo(cx_, cy_); ctx.lineTo(cx_ + tickL * dx, cy_);
        ctx.moveTo(cx_, cy_); ctx.lineTo(cx_, cy_ + tickL * dy);
        ctx.stroke();
      });

      // coordinate labels (start lat/lng) at top corners
      if (act.start_latlng && act.start_latlng.length === 2) {
        ctx.fillStyle = sc.accent + 'aa';
        ctx.font = `700 ${Math.round(13 * S)}px -apple-system,sans-serif`;
        ctx.letterSpacing = '0.08em';
        ctx.textAlign = 'left';
        ctx.fillText(act.start_latlng[0].toFixed(3) + '° N', P + Math.round(28 * S), P + Math.round(14 * S));
        ctx.textAlign = 'right';
        ctx.fillText(act.start_latlng[1].toFixed(3) + '° E', W - P - Math.round(28 * S), P + Math.round(14 * S));
        ctx.letterSpacing = '0';
      }

      // route on top of contours
      if (polyline && polyline.length > 1 && !hideRoute) {
        ctx.shadowColor = sc.accent; ctx.shadowBlur = Math.round(20 * S);
        drawRoute(ctx, polyline, P, Math.round(P * 1.2), W - P * 2, Math.round(H * 0.50), sc.accent, Math.round(6 * S));
        ctx.shadowBlur = 0;
      }

      // title block
      let cyT = Math.round(H * 0.60);
      if (!hideTitle) {
        const nm = act.name || 'Activity';
        let nfs = Math.round(46 * S);
        ctx.font = `800 ${nfs}px -apple-system,sans-serif`;
        while (nfs > Math.round(18 * S) && ctx.measureText(nm).width > W - P * 2) {
          nfs -= Math.max(1, Math.round(2 * S));
          ctx.font = `800 ${nfs}px -apple-system,sans-serif`;
        }
        ctx.fillStyle = sc.text; ctx.textAlign = 'left'; ctx.letterSpacing = '-0.5px';
        ctx.fillText(nm, P, cyT);
        cyT += Math.round(36 * S);
      }
      if (!hideDate) {
        ctx.fillStyle = sc.muted; ctx.font = `400 ${Math.round(22 * S)}px -apple-system,sans-serif`; ctx.letterSpacing = '0'; ctx.textAlign = 'left';
        ctx.fillText((act.start_date ? fmtDt(act.start_date) : '') + ' · ' + (act.type || ''), P, cyT);
      }

      // stat tiles (2-col)
      const statY = Math.round(H * 0.68);
      const COLS2 = 2, gap2 = Math.round(10 * S);
      const ROWS2 = Math.ceil(selected.length / COLS2);
      const tW2 = (W - P * 2 - gap2) / COLS2;
      const tH2 = Math.min(Math.round(170 * S), Math.floor((H - statY - P - gap2 * (ROWS2 - 1)) / Math.max(ROWS2, 1)));
      selected.forEach((s, i) => {
        const col = i % COLS2, row = Math.floor(i / COLS2);
        const tx = P + col * (tW2 + gap2), ty = statY + row * (tH2 + gap2);
        ctx.fillStyle = sc.card !== 'transparent' ? sc.card : 'rgba(0,0,0,0.55)';
        ctx.beginPath(); ctx.roundRect(tx, ty, tW2, tH2, Math.round(10 * S)); ctx.fill();
        ctx.strokeStyle = sc.accent + '44'; ctx.lineWidth = Math.round(1 * S);
        ctx.beginPath(); ctx.roundRect(tx, ty, tW2, tH2, Math.round(10 * S)); ctx.stroke();
        ctx.fillStyle = sc.accent; ctx.fillRect(tx, ty, tW2, Math.round(3 * S));
        const { num, unit } = statVal(s, act);
        drawIcon(ctx, STAT_ICONS[s.key] || 'time', tx + tW2 / 2, ty + tH2 * 0.26, Math.round(22 * S), sc.accent + 'cc');
        ctx.fillStyle = sc.muted; ctx.font = `700 ${Math.round(11 * S)}px -apple-system,sans-serif`; ctx.textAlign = 'center'; ctx.letterSpacing = '0.05em';
        ctx.fillText(s.label.toUpperCase(), tx + tW2 / 2, ty + tH2 * 0.55);
        let vfs = Math.round(32 * S); ctx.font = `900 ${vfs}px -apple-system,sans-serif`;
        const disp = num + (unit ? ' ' + unit : '');
        while (vfs > 10 && ctx.measureText(disp).width > tW2 * 0.88) { vfs--; ctx.font = `900 ${vfs}px -apple-system,sans-serif`; }
        ctx.fillStyle = sc.text; ctx.letterSpacing = '-0.5px';
        ctx.fillText(disp, tx + tW2 / 2, ty + tH2 * 0.86);
      });
      ctx.letterSpacing = '0';

      // bottom logo
      if (!hideLogo) {
        ctx.fillStyle = sc.accent + 'aa';
        ctx.font = `900 ${Math.round(13 * S)}px -apple-system,sans-serif`;
        ctx.textAlign = 'right'; ctx.letterSpacing = '0.18em';
        ctx.fillText('TOPO · STRAVA', W - P, H - Math.round(28 * S));
        ctx.letterSpacing = '0';
      }
      break;
    }

    /* 18. GRAPHIC — visual stat circles + bars, designed for transparent bg */
    case 'graphic': {
      if (!skipBg) { ctx.fillStyle = baseBg; ctx.fillRect(0, 0, W, H); }

      const isCycG = isRide(act);
      const gStats = selected.slice(0, 6);
      const numS = gStats.length;

      // top: big donut for first stat
      const donutR = Math.round(150 * S);
      const donutCx = W / 2, donutCy = Math.round(80 * S) + donutR + Math.round(20 * S);
      if (numS > 0) {
        const s0 = gStats[0]; const { num: n0, unit: u0 } = statVal(s0, act);
        // track
        ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = Math.round(22 * S); ctx.lineCap = 'butt';
        ctx.beginPath(); ctx.arc(donutCx, donutCy, donutR, 0, Math.PI * 2); ctx.stroke();
        // fill arc — use distance % of some max, or just 0.72 of circle
        const arcFrac = 0.72;
        ctx.strokeStyle = sc.accent; ctx.lineWidth = Math.round(22 * S); ctx.lineCap = 'round';
        ctx.shadowColor = sc.accent + '88'; ctx.shadowBlur = Math.round(20 * S);
        ctx.beginPath(); ctx.arc(donutCx, donutCy, donutR, -Math.PI / 2, -Math.PI / 2 + arcFrac * Math.PI * 2); ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = sc.muted; ctx.font = `700 ${Math.round(16 * S)}px -apple-system,sans-serif`; ctx.textAlign = 'center'; ctx.letterSpacing = '0.08em';
        // ctx.fillText(s0.label.toUpperCase(), donutCx, donutCy - Math.round(28 * S));
        ctx.fillText(
          s0.label.toUpperCase(),
          donutCx,
          donutCy - donutR * 0.35
        );

        let dfs = Math.round(80 * S); ctx.font = `900 ${dfs}px -apple-system,sans-serif`;
        while (dfs > 20 && ctx.measureText(n0).width > donutR * 1.4) { dfs -= 2; ctx.font = `900 ${dfs}px -apple-system,sans-serif`; }
        ctx.fillStyle = sc.text; ctx.letterSpacing = '-2px';
        // ctx.fillText(n0, donutCx, donutCy + Math.round(28 * S)); ctx.letterSpacing = '0';
        // value (tetap di tengah tapi sedikit turun)
        ctx.fillText(
          n0,
          donutCx,
          donutCy + donutR * 0.15
        ); ctx.letterSpacing = '0';
        // if (u0) { ctx.fillStyle = sc.muted; ctx.font = `500 ${Math.round(22 * S)}px -apple-system,sans-serif`; ctx.fillText(u0, donutCx, donutCy + Math.round(64 * S)); }
        if (u0) {
          ctx.fillText(
            u0,
            donutCx,
            donutCy + donutR * 0.40
          );
        }
      }

      const donutBottom = donutCy + donutR + Math.round(32 * S);
      let gContentY = donutBottom + Math.round(28 * S);
      if (!hideTitle) {
        const nm = act.name || 'Activity';
        let nfs = Math.round(38 * S); ctx.font = `700 ${nfs}px -apple-system,sans-serif`;
        while (nfs > 16 && ctx.measureText(nm).width > W - P * 2) { nfs -= 2; ctx.font = `700 ${nfs}px -apple-system,sans-serif`; }
        ctx.fillStyle = sc.text; ctx.textAlign = 'center'; ctx.letterSpacing = '-0.5px';
        ctx.fillText(nm, W / 2, gContentY);
        gContentY += nfs + Math.round(6 * S);
      }
      if (!hideDate) {
        ctx.fillStyle = sc.muted; ctx.font = `400 ${Math.round(20 * S)}px -apple-system,sans-serif`; ctx.letterSpacing = '0'; ctx.textAlign = 'center';
        ctx.fillText((act.start_date ? fmtDt(act.start_date) : '') + ' · ' + (act.type || ''), W / 2, gContentY + Math.round(22 * S));
        gContentY += Math.round(44 * S);
      }
      gContentY += Math.round(16 * S);

      const barStats = gStats.slice(1);
      const bBaseY = gContentY;
      const bH = Math.round(92 * S), bGap = Math.round(10 * S);
      const bW = W - P * 2;
      barStats.forEach((s, i) => {
        const { num, unit } = statVal(s, act);
        const by = bBaseY + i * (bH + bGap);
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.beginPath(); ctx.roundRect(P, by, bW, bH, Math.round(8 * S)); ctx.fill();
        ctx.fillStyle = sc.accent + '33';
        ctx.beginPath(); ctx.roundRect(P, by, bW * 0.65, bH, Math.round(8 * S)); ctx.fill();
        ctx.fillStyle = sc.accent; ctx.beginPath(); ctx.roundRect(P, by, Math.round(4 * S), bH, Math.round(2 * S)); ctx.fill();
        drawIcon(ctx, STAT_ICONS[s.key] || 'time', P + Math.round(40 * S), by + bH / 2, Math.round(22 * S), sc.icon);
        ctx.fillStyle = sc.muted; ctx.font = `600 ${Math.round(13 * S)}px -apple-system,sans-serif`; ctx.textAlign = 'left'; ctx.letterSpacing = '0.05em';
        ctx.fillText(s.label.toUpperCase(), P + Math.round(66 * S), by + bH * 0.47);
        const disp = num + (unit ? ' ' + unit : '');
        let vfs = Math.round(34 * S); ctx.font = `800 ${vfs}px -apple-system,sans-serif`;
        while (vfs > 14 && ctx.measureText(disp).width > bW * 0.38) { vfs -= 2; ctx.font = `800 ${vfs}px -apple-system,sans-serif`; }
        ctx.fillStyle = sc.text; ctx.textAlign = 'right'; ctx.letterSpacing = '-0.5px';
        ctx.fillText(disp, P + bW - Math.round(20 * S), by + bH * 0.66); ctx.letterSpacing = '0';
      });

      if (polyline && polyline.length > 1 && !hideRoute) {
        const rX = W - Math.round(240 * S), rY = H - Math.round(240 * S), rS = Math.round(200 * S);
        ctx.globalAlpha = 0.25;
        drawRoute(ctx, polyline, rX, rY, rS, rS, sc.accent, Math.round(4 * S));
        ctx.globalAlpha = 1;
      }

      if (false) {
        ctx.fillText('STRAVA', W - P, H - Math.round(44 * S));
      }
      break;
    }

    /* 19. FIELD — photo-overlay style, route dominant right side, stats scattered */
    case 'field': {
      // solid theme background when no photo
      if (!skipBg) {
        ctx.fillStyle = baseBgDark; ctx.fillRect(0, 0, W, H);
        // vignette
        const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.85);
        vig.addColorStop(0, 'transparent'); vig.addColorStop(1, 'rgba(0,0,0,0.35)');
        ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);
      }

      // helper: draw a stat block at position (label above, value below)
      function statBlock(lbl, val, x, y, align) {
        ctx.save();
        ctx.textAlign = align || 'left';
        ctx.fillStyle = 'rgba(255,255,255,0.58)'; ctx.font = `600 ${Math.round(17 * S)}px -apple-system,sans-serif`; ctx.letterSpacing = '0.08em';
        ctx.fillText(lbl.toUpperCase(), x, y);
        ctx.fillStyle = '#ffffff'; ctx.font = `800 ${Math.round(42 * S)}px -apple-system,sans-serif`; ctx.letterSpacing = '-1px';
        ctx.fillText(val, x, y + Math.round(54 * S));
        ctx.restore();
      }

      const isCycF = isRide(act);
      const dist = fmtD(act.distance || 0);
      const elev = '+' + Math.round(act.total_elevation_gain || 0) + 'm';
      const time = fmtT(act.moving_time || 0);
      const avgSpd = act.average_speed ? kmh(act.average_speed) + ' km/h' : '—';
      const maxSpd = act.max_speed ? kmh(act.max_speed) + ' km/h' : '—';
      const pwr = act.average_watts ? Math.round(act.average_watts) + ' W' : '—';
      const cad = act.average_cadence ? Math.round(act.average_cadence) + ' rpm' : '—';
      const hr = act.average_heartrate ? Math.round(act.average_heartrate) + ' bpm' : '—';

      // route — large, right half, slightly offset up
      if (polyline && polyline.length > 1 && !hideRoute) {
        const rX = Math.round(W * 0.30), rY = Math.round(H * 0.14), rW = Math.round(W * 0.64), rH = Math.round(H * 0.56);
        ctx.shadowColor = withAlpha(sc.accent, 0x59); ctx.shadowBlur = Math.round(16 * S);
        ctx.globalAlpha = 0.95;
        drawRoute(ctx, polyline, rX, rY, rW, rH, sc.accent, Math.round(5 * S));
        ctx.globalAlpha = 1; ctx.shadowBlur = 0;
      }

      // TOP: distance (left) + elevation (right)
      statBlock(isCycF ? 'Distance' : 'Distance', dist, P, Math.round(H * 0.12));
      statBlock('Elevation', elev, W - P, Math.round(H * 0.12), 'right');

      // MIDDLE-LEFT: speed (cycling) or pace (running)
      if (isCycF) {
        statBlock('Avg Speed', avgSpd, P, Math.round(H * 0.50));
      } else {
        const pace = act.moving_time && act.distance ? (() => { const s = Math.round(act.moving_time / (act.distance / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}/km`; })() : '—';
        statBlock('Avg Pace', pace, P, Math.round(H * 0.50));
      }

      // BOTTOM ROW: 3 stats spread across
      const b1x = P, b2x = W / 2, b3x = W - P;
      const bY = Math.round(H * 0.76);
      if (isCycF) {
        statBlock('Avg Power', pwr, b1x, bY);
        statBlock('Cadence', cad, b2x, bY, 'center');
        statBlock('Ride Time', time, b3x, bY, 'right');
      } else {
        statBlock('Avg HR', hr, b1x, bY);
        statBlock('Cadence', cad, b2x, bY, 'center');
        statBlock('Run Time', time, b3x, bY, 'right');
      }

      // activity name + date — very bottom
      if (!hideTitle) {
        const nm = act.name || 'Activity';
        let nfs = Math.round(30 * S); ctx.font = `700 ${nfs}px -apple-system,sans-serif`;
        while (nfs > 14 && ctx.measureText(nm).width > W - P * 2) { nfs--; ctx.font = `700 ${nfs}px -apple-system,sans-serif`; }
        ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.textAlign = 'left'; ctx.letterSpacing = '-0.3px';
        ctx.fillText(nm, P, H - Math.round(80 * S));
      }
      if (!hideDate) {
        ctx.fillStyle = 'rgba(255,255,255,0.38)'; ctx.font = `400 ${Math.round(20 * S)}px -apple-system,sans-serif`; ctx.letterSpacing = '0'; ctx.textAlign = 'left';
        ctx.fillText((act.start_date ? fmtDt(act.start_date) : '') + ' · ' + (act.type || ''), P, H - Math.round(48 * S));
      }
      if (!hideLogo) {
        // ctx.fillStyle = 'rgba(252,76,2,0.7)'; ctx.font = `900 ${Math.round(22 * S)}px -apple-system,sans-serif`; ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = Math.round(6 * S); ctx.letterSpacing = '0.08em'; ctx.textAlign = 'right';
        // ctx.fillText('STRAVA', W - P, H - Math.round(48 * S)); ctx.shadowBlur = 0;
      }
      break;
    }


    /* 20. BADGE WAVE — pill badges with inline waveform charts */
    case 'badgewave': {
      // ── background — scheme-derived ──
      if (!skipBg) { ctx.fillStyle = baseBg; ctx.fillRect(0, 0, W, H); }

      // ── header/title ──
      title(P, Math.round(120 * S), W - P * 2, 56);

      // ── badge grid ──
      const bpad = Math.round(28 * S),
        bh = Math.round(155 * S),
        bgap = Math.round(22 * S);
      const bw = (W - P * 2 - bgap) / 2;
      const seed = (act.id || 12345) % 100;

      const STAT_STREAM_MAP = {
        average_speed: 'velocity_smooth',
        max_speed: 'velocity_smooth',
        average_heartrate: 'heartrate',
        max_heartrate: 'heartrate',
        average_cadence: 'cadence',
        total_elevation_gain: 'altitude',
        distance: 'distance',
        elapsed_time: 'time',
      };

      selected.forEach((s, i) => {
        const col = i % 2, row = Math.floor(i / 2);
        const bx = P + col * (bw + bgap),
          by = Math.round(240 * S) + row * (bh + bgap);
        const r = Math.round(20 * S);

        // badge container
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, r);
        const badgeBg = i % 3 === 0
          ? (sc.card === 'transparent' ? 'rgba(255,255,255,0.06)' : withAlpha(sc.accent, 0x22))
          : (sc.card === 'transparent' ? 'rgba(255,255,255,0.08)' : withAlpha(sc.div, 0xCC));
        ctx.fillStyle = badgeBg;
        ctx.fill();
        ctx.strokeStyle = i % 3 === 0 ? withAlpha(sc.accent, 0x77) : (sc.card === 'transparent' ? 'rgba(255,255,255,0.15)' : sc.div);
        ctx.lineWidth = Math.round(1.5 * S);
        ctx.stroke();

        // icon
        const iconS2 = Math.round(26 * S);
        drawIcon(ctx, STAT_ICONS[s.key] || 'time', bx + bpad, by + bh * 0.28, iconS2, i % 3 === 0 ? sc.accent : sc.icon);

        // label
        ctx.fillStyle = sc.muted;
        ctx.font = `700 ${Math.round(13 * S)}px -apple-system,sans-serif`;
        ctx.letterSpacing = '0.05em';
        ctx.textAlign = 'left';
        ctx.fillText(s.label.toUpperCase(), bx + bpad * 2.1, by + bh * 0.32);

        // value
        const { num, unit } = statVal(s, act);
        let vfs2 = Math.round(42 * S);
        ctx.font = `900 ${vfs2}px -apple-system,sans-serif`;
        const disp = num + (unit ? ' ' + unit : '');
        while (vfs2 > Math.round(20 * S) && ctx.measureText(disp).width > bw - bpad * 2.8) {
          vfs2 -= Math.max(1, Math.round(2 * S));
          ctx.font = `900 ${vfs2}px -apple-system,sans-serif`;
        }
        ctx.fillStyle = sc.text;
        ctx.letterSpacing = '-0.5px';
        ctx.fillText(disp, bx + bpad * 2.1, by + bh * 0.62);

        // inline waveform or fallback bar
        const streamKey = STAT_STREAM_MAP[s.key];
        const streamData = streamKey && currentStreams && currentStreams[streamKey]?.data;
        const hasWave = !!(streamData && streamData.length > 8);

        if (hasWave) {
          const samples = streamData.length > 80
            ? streamData.filter((_, idx) => idx % Math.ceil(streamData.length / 80) === 0)
            : streamData;
          const waveY = by + bh - Math.round(48 * S);
          const waveH = Math.round(32 * S);
          const waveW = bw - bpad * 2.2;
          const waveCol = i % 3 === 0
            ? sc.accent
            : (sc.card === 'transparent' ? 'rgba(255,255,255,0.7)' : (sc.accent || sc.icon));
          drawAreaChart(ctx, samples, bx + bpad * 2.1, waveY, waveW, waveH, waveCol, Math.round(2 * S));
          // optional max label
          const dmax = Math.max(...samples);
          if (streamKey === 'altitude' || streamKey === 'heartrate') {
            ctx.fillStyle = sc.muted;
            ctx.font = `600 ${Math.round(9 * S)}px -apple-system,sans-serif`;
            ctx.textAlign = 'right';
            ctx.fillText((streamKey === 'altitude' ? '▲' : '♥') + ' ' + Math.round(dmax),
              bx + bw - bpad * 0.8, waveY + waveH + Math.round(12 * S));
          }
        } else {
          // fallback decorative bar
          const barY = by + bh - Math.round(42 * S);
          const barH = Math.round(24 * S);
          const barW = bw - bpad * 2.2;
          const fillW = barW * (0.45 + 0.4 * Math.abs(Math.sin(i * 2.1 + seed)));
          ctx.fillStyle = withAlpha(sc.div, 0x66);
          ctx.beginPath();
          ctx.roundRect(bx + bpad * 2.1, barY, barW, barH, Math.round(4 * S));
          ctx.fill();
          ctx.fillStyle = i % 3 === 0 ? withAlpha(sc.accent, 0x99) : (sc.card === 'transparent' ? 'rgba(255,255,255,0.5)' : withAlpha(sc.icon, 0xCC));
          ctx.beginPath();
          ctx.roundRect(bx + bpad * 2.1, barY, fillW, barH, Math.round(4 * S));
          ctx.fill();
        }
      });
      break;
    }


  }
}
