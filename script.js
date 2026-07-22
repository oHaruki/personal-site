// Theme toggle: remembers your choice in localStorage.
(function () {
  const root = document.documentElement;
  const toggle = document.getElementById('theme-toggle');

  toggle.addEventListener('click', () => {
    const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    root.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  });

  // Footer year
  document.getElementById('year').textContent = new Date().getFullYear();
})();

/* =========================================================
   osu! playfield: replays a real beatmap (see map.js) on loop.

   Every circle, slider path, combo number and timing comes
   straight from the .osu file, scaled into the left side of
   the screen. A cursor with a fading trail plays it: clicking
   circles, riding slider balls, following repeats.
   ========================================================= */
(function () {
  const canvas = document.getElementById('playfield');
  if (!canvas || !window.MAP) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const ctx = canvas.getContext('2d');

  const CONFIG = {
    zone: 0.42,        // playfield lives in the left 42% of the screen
    zoom: 0.88,        // extra zoom-out so the field breathes (1 = fill the zone)
    alpha: 0.5,        // master opacity
    pop: 260,          // ms for hit bursts / fade-outs
    trailLife: 180,    // ms cursor trail dots live
    timeScale: 1,      // 1 = the map's real speed
  };

  // ---- decode the compact map data --------------------------
  // circle: [t, x, y, combo]   slider: [t, x, y, combo, dur, slides, [x0,y0,x1,y1,...]]
  const objs = MAP.objects.map(a => {
    const o = {
      t: a[0], x: a[1], y: a[2], n: a[3],
      dur: 0, slides: 1, path: null, cum: null, len: 1,
      end: [a[1], a[2]], hitCycle: -1,
    };
    if (a.length > 4) {
      o.dur = Math.max(1, a[4]);
      o.slides = a[5];
      const flat = a[6], path = [];
      for (let i = 0; i < flat.length; i += 2) path.push([flat[i], flat[i + 1]]);
      const cum = [0];
      for (let i = 1; i < path.length; i++)
        cum.push(cum[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
      o.path = path;
      o.cum = cum;
      o.len = cum[cum.length - 1] || 1;
      o.end = o.slides % 2 ? path[path.length - 1] : path[0];
    }
    return o;
  });

  const PREEMPT = MAP.preempt;
  const FADEIN = Math.min(300, PREEMPT * 0.66);

  // ---- fit the playfield into the left zone -----------------
  // Measure what the map ACTUALLY draws (some slider art leaves the
  // standard 512x384 field), pad for circle bodies + approach rings,
  // and fit that box uniformly (1:1, never stretched), centred.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const o of objs) {
    for (const p of (o.path || [[o.x, o.y]])) {
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    }
  }
  const inflate = MAP.r * 1.7;
  minX -= inflate; maxX += inflate; minY -= inflate; maxY += inflate;
  const boundsW = maxX - minX, boundsH = maxY - minY;

  let W = 0, H = 0, scale = 1, ox = 0, oy = 0, r = 12, enabled = true;
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const zoneW = W * CONFIG.zone, pad = 16;
    scale = Math.min((zoneW - pad * 2) / boundsW, (H - pad * 2) / boundsH) * CONFIG.zoom;
    ox = (zoneW - boundsW * scale) / 2 - minX * scale;   // centre the box in the zone
    oy = (H - boundsH * scale) / 2 - minY * scale;
    r = MAP.r * scale;                       // constant circle size, from the map's CS
    enabled = W > 760;
  }
  window.addEventListener('resize', resize);
  resize();

  const TX = x => ox + x * scale;
  const TY = y => oy + y * scale;

  // ---- colours follow the current theme ---------------------
  let accent = '#ff5c8a', dim = '#8b8b97';
  function readColors() {
    const s = getComputedStyle(document.documentElement);
    accent = s.getPropertyValue('--accent').trim() || accent;
    dim = s.getPropertyValue('--text-dim').trim() || dim;
  }
  readColors();
  new MutationObserver(readColors)
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // ---- slider geometry --------------------------------------
  // point at fraction tt (0..1) along the path, by arc length
  function pathAt(o, tt) {
    const target = tt * o.len;
    let lo = 0, hi = o.cum.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (o.cum[mid] < target) lo = mid + 1; else hi = mid; }
    const i = Math.max(1, lo);
    const f = (target - o.cum[i - 1]) / ((o.cum[i] - o.cum[i - 1]) || 1);
    return [
      o.path[i - 1][0] + (o.path[i][0] - o.path[i - 1][0]) * f,
      o.path[i - 1][1] + (o.path[i][1] - o.path[i - 1][1]) * f,
    ];
  }

  // ball position at map time mt, handling repeats (back and forth)
  function ballAt(o, mt) {
    const p = Math.min(o.slides - 1e-6, Math.max(0, (mt - o.t) / o.dur * o.slides));
    const idx = Math.floor(p);
    let tt = p - idx;
    if (idx % 2) tt = 1 - tt;
    return pathAt(o, tt);
  }

  const easeInOut = p => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

  // ---- drawing ----------------------------------------------
  function tracePath(o) {
    ctx.beginPath();
    ctx.moveTo(TX(o.path[0][0]), TY(o.path[0][1]));
    for (let i = 1; i < o.path.length; i++) ctx.lineTo(TX(o.path[i][0]), TY(o.path[i][1]));
  }

  function drawTrack(o, f) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = accent;

    ctx.globalAlpha = 0.32 * f * CONFIG.alpha;
    ctx.lineWidth = r * 2;
    tracePath(o); ctx.stroke();

    // punch out the middle so only a thin border remains
    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = 1;
    ctx.lineWidth = Math.max(1, r * 2 - 4);
    tracePath(o); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';

    ctx.globalAlpha = 0.06 * f * CONFIG.alpha;
    ctx.lineWidth = Math.max(1, r * 2 - 4);
    tracePath(o); ctx.stroke();
  }

  function drawHead(o, mt, a) {
    const x = TX(o.x), y = TY(o.y);

    ctx.globalAlpha = 0.10 * a * CONFIG.alpha;
    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();

    ctx.globalAlpha = 0.55 * a * CONFIG.alpha;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke();

    ctx.globalAlpha = 0.5 * a * CONFIG.alpha;
    ctx.fillStyle = dim;
    ctx.font = `600 ${Math.round(r * 0.85)}px 'Space Grotesk', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(o.n, x, y + 1);

    // approach circle
    const p = Math.min(1, (mt - (o.t - PREEMPT)) / PREEMPT);
    ctx.globalAlpha = 0.4 * a * CONFIG.alpha;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, r * (2.6 - 1.6 * p), 0, 7); ctx.stroke();
  }

  function drawBurst(px, py, q) {
    ctx.globalAlpha = 0.5 * (1 - q) * CONFIG.alpha;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2 * (1 - q);
    ctx.beginPath(); ctx.arc(TX(px), TY(py), r * (1 + 0.6 * q), 0, 7); ctx.stroke();
  }

  // small chevron at a slider end that still has repeats to go
  function drawRepeatArrow(o, atHead, f) {
    const P = o.path, iA = atHead ? 0 : P.length - 1, iB = atHead ? 1 : P.length - 2;
    const x = TX(P[iA][0]), y = TY(P[iA][1]);
    let dx = TX(P[iB][0]) - x, dy = TY(P[iB][1]) - y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;
    const s = r * 0.45;
    ctx.globalAlpha = 0.6 * f * CONFIG.alpha;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - dx * s * 0.4 - dy * s, y - dy * s * 0.4 + dx * s);
    ctx.lineTo(x + dx * s * 0.9, y + dy * s * 0.9);
    ctx.lineTo(x - dx * s * 0.4 + dy * s, y - dy * s * 0.4 - dx * s);
    ctx.stroke();
  }

  function drawObject(o, mt) {
    const t = mt - (o.t - PREEMPT);
    if (t < 0) return;
    const aIn = Math.min(1, t / FADEIN);

    if (!o.path) {
      // ---- circle
      if (mt < o.t) drawHead(o, mt, aIn);
      else {
        const q = Math.min(1, (mt - o.t) / CONFIG.pop);
        ctx.globalAlpha = 0.10 * (1 - q) * CONFIG.alpha;
        ctx.fillStyle = accent;
        ctx.beginPath(); ctx.arc(TX(o.x), TY(o.y), r * (1 + 0.35 * q), 0, 7); ctx.fill();
        drawBurst(o.x, o.y, q);
      }
      return;
    }

    // ---- slider
    const endT = o.t + o.dur;
    const fadeOut = mt > endT ? Math.max(0, 1 - (mt - endT) / CONFIG.pop) : 1;
    const f = aIn * fadeOut;
    if (f <= 0) return;

    drawTrack(o, f);

    if (mt < o.t) {
      if (o.slides > 1) drawRepeatArrow(o, false, aIn);
      drawHead(o, mt, aIn);
    } else if (mt < endT) {
      const slideIdx = Math.floor((mt - o.t) / o.dur * o.slides);
      if (o.slides - 1 - slideIdx > 0) drawRepeatArrow(o, slideIdx % 2 === 0, 1);

      const b = ballAt(o, mt);
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.5 * CONFIG.alpha;
      ctx.beginPath(); ctx.arc(TX(b[0]), TY(b[1]), r * 0.6, 0, 7); ctx.fill();
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.3 * CONFIG.alpha;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(TX(b[0]), TY(b[1]), r * 1.5, 0, 7); ctx.stroke();
    } else {
      drawBurst(o.end[0], o.end[1], Math.min(1, (mt - endT) / CONFIG.pop));
    }
  }

  // ---- playback ---------------------------------------------
  const start = performance.now();
  let curCycle = -1, wp = 0;
  let lastHit = { x: 256, y: 192, absT: 0 };
  const trail = [];

  function cursorPos(absTime, cycle, mt, from, to) {
    // riding an active slider takes priority
    for (let i = from; i < to; i++) {
      const o = objs[i];
      if (o.path && mt >= o.t && mt <= o.t + o.dur) {
        const b = ballAt(o, mt);
        return { x: TX(b[0]), y: TY(b[1]) };
      }
    }
    // otherwise fly toward the next object's head, arriving on time
    let target = null, targetAbsT = 0;
    for (let i = from; i < objs.length; i++) {
      if (objs[i].t > mt) { target = objs[i]; targetAbsT = cycle * MAP.total + objs[i].t; break; }
    }
    if (!target) { target = objs[0]; targetAbsT = (cycle + 1) * MAP.total + objs[0].t; }
    const span = targetAbsT - lastHit.absT;
    const p = span > 0 ? Math.min(1, Math.max(0, (absTime - lastHit.absT) / span)) : 1;
    const e = easeInOut(p);
    return {
      x: TX(lastHit.x + (target.x - lastHit.x) * e),
      y: TY(lastHit.y + (target.y - lastHit.y) * e),
    };
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!enabled) return;

    const absTime = (now - start) * CONFIG.timeScale;
    const cycle = Math.floor(absTime / MAP.total);
    const mt = absTime - cycle * MAP.total;

    if (cycle !== curCycle) {   // loop restart
      curCycle = cycle;
      wp = 0;
      trail.length = 0;
      lastHit = { x: 256, y: 192, absT: cycle * MAP.total };
    }

    ctx.clearRect(0, 0, W, H);

    // advance past finished objects, then find how far ahead is visible
    while (wp < objs.length && objs[wp].t + objs[wp].dur + CONFIG.pop < mt) {
      // record where the cursor "was" when this object finished
      const o = objs[wp];
      if (o.hitCycle !== cycle) {
        o.hitCycle = cycle;
        lastHit = { x: o.end[0], y: o.end[1], absT: cycle * MAP.total + o.t + o.dur };
      }
      wp++;
    }
    let q = wp;
    while (q < objs.length && objs[q].t - PREEMPT <= mt) {
      const o = objs[q];
      if (o.t + o.dur <= mt && o.hitCycle !== cycle) {
        o.hitCycle = cycle;
        lastHit = { x: o.end[0], y: o.end[1], absT: cycle * MAP.total + o.t + o.dur };
      }
      q++;
    }

    // draw upcoming objects underneath the current one (osu! stacking)
    for (let i = q - 1; i >= wp; i--) drawObject(objs[i], mt);

    // ---- cursor + trail
    const pos = cursorPos(absTime, cycle, mt, wp, q);
    trail.push({ x: pos.x, y: pos.y, t: now });
    while (trail.length && now - trail[0].t > CONFIG.trailLife) trail.shift();
    ctx.fillStyle = accent;
    for (const dot of trail) {
      const life = 1 - (now - dot.t) / CONFIG.trailLife;
      ctx.globalAlpha = 0.25 * life * CONFIG.alpha;
      ctx.beginPath(); ctx.arc(dot.x, dot.y, 4.5 * life + 1.5, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 0.28 * CONFIG.alpha;
    ctx.beginPath(); ctx.arc(pos.x, pos.y, 9, 0, 7); ctx.fill();
    ctx.globalAlpha = 0.9 * CONFIG.alpha;
    ctx.beginPath(); ctx.arc(pos.x, pos.y, 5, 0, 7); ctx.fill();

    ctx.globalAlpha = 1;
  }

  requestAnimationFrame(frame);
})();
