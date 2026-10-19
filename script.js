/* =========================================================
   Shared helpers + facts derived from map.js.
   Nothing about the map is hardcoded - swap map.js and every
   number on the page follows.
   ========================================================= */
const SET = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
const FMT = ms => Math.floor(ms / 60000) + ':' + String(Math.floor(ms / 1000) % 60).padStart(2, '0');

/* ---------------------------------------------------------
   Theme toggle
   --------------------------------------------------------- */
(function () {
  const root = document.documentElement;
  const toggle = document.getElementById('theme-toggle');
  if (!toggle) return;

  const label = () => SET('nf-theme', root.getAttribute('data-theme') === 'light'
    ? 'tokyo night day' : 'tokyo night');

  toggle.addEventListener('click', () => {
    const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    root.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    label();
  });
  label();

  const y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();
})();

/* ---------------------------------------------------------
   Clock widget - real local time
   --------------------------------------------------------- */
(function () {
  const el = document.getElementById('k-clock');
  if (!el) return;
  const tick = () => {
    const d = new Date();
    let h = d.getHours();
    const ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    el.textContent = h + ':' + String(d.getMinutes()).padStart(2, '0') + ' ' + ap;
  };
  tick();
  setInterval(tick, 10000);
})();

/* ---------------------------------------------------------
   Workspace pills track the visible section.
   NB: filter to hrefs longer than "#". A bare "#" satisfies
   [href^="#"] but querySelector("#") throws a SyntaxError,
   which would abort every script that follows.
   --------------------------------------------------------- */
(function () {
  const pills = [...document.querySelectorAll('.ws a[href^="#"]')]
    .filter(p => (p.getAttribute('href') || '').length > 1);
  const map = new Map();
  for (const p of pills) {
    const sec = document.querySelector(p.getAttribute('href'));
    if (sec) map.set(sec, p);
  }
  if (!map.size) return;
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      pills.forEach(p => p.classList.remove('on'));
      map.get(e.target)?.classList.add('on');
    });
  }, { rootMargin: '-40% 0px -50% 0px' });
  map.forEach((_, sec) => io.observe(sec));
})();

/* ---------------------------------------------------------
   Copy the Discord username, with a toast as confirmation
   --------------------------------------------------------- */
(function () {
  const toast = document.getElementById('toast');
  let hide;
  const say = msg => {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(hide);
    hide = setTimeout(() => toast.classList.remove('show'), 2200);
  };
  document.querySelectorAll('[data-copy]').forEach(btn => {
    const label = btn.querySelector('.btn__copy, .dc__copy');
    btn.addEventListener('click', async () => {
      const text = btn.dataset.copy;
      try {
        await navigator.clipboard.writeText(text);
        say('Copied "' + text + '". Add me on Discord.');
        btn.classList.add('is-copied');
        if (label) label.textContent = 'copied';
        setTimeout(() => {
          btn.classList.remove('is-copied');
          if (label) label.textContent = 'copy';
        }, 2200);
      } catch {
        say('Discord username: ' + text);
      }
    });
  });
})();

/* ---------------------------------------------------------
   Screenshots: thumbs swap a project's main shot, any main
   shot opens the lightbox
   --------------------------------------------------------- */
(function () {
  const lb = document.getElementById('lb');
  const lbImg = document.getElementById('lb-img');
  const lbCap = document.getElementById('lb-cap');

  document.querySelectorAll('.gal').forEach(gal => {
    const main = gal.querySelector('.gal__main');
    const img = main.querySelector('img');
    const thumbs = gal.querySelectorAll('.gal__thumbs button');
    thumbs.forEach(t => t.addEventListener('click', () => {
      if (t.classList.contains('on')) return;
      thumbs.forEach(x => x.classList.remove('on'));
      t.classList.add('on');
      main.classList.add('is-swap');
      setTimeout(() => {
        img.src = t.dataset.src;
        img.alt = t.dataset.alt;
        img.width = +t.dataset.w;
        img.height = +t.dataset.h;
        img.decode().catch(() => {}).finally(() => main.classList.remove('is-swap'));
      }, 160);
    }));
  });

  if (!lb || typeof lb.showModal !== 'function') return;
  document.querySelectorAll('.gal__main, .shot').forEach(btn => {
    btn.addEventListener('click', () => {
      const img = btn.querySelector('img');
      lbImg.src = img.currentSrc || img.src;
      lbImg.alt = img.alt;
      lbCap.textContent = img.alt;
      lb.showModal();
    });
  });
  // clicking anywhere (image or backdrop) closes it
  lb.addEventListener('click', () => lb.close());
})();

/* ---------------------------------------------------------
   Panels fade in as they scroll into view
   --------------------------------------------------------- */
(function () {
  const items = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    items.forEach(el => el.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.classList.add('in');
      io.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -8% 0px' });
  items.forEach(el => io.observe(el));
})();

/* ---------------------------------------------------------
   Fetch panel: time on page
   --------------------------------------------------------- */
(function () {
  const t0 = Date.now();
  const upd = () => {
    const s = Math.floor((Date.now() - t0) / 1000);
    SET('nf-up', s < 60 ? s + 's' : Math.floor(s / 60) + 'm ' + (s % 60) + 's');
  };
  upd();
  setInterval(upd, 1000);
})();

/* =========================================================
   osu! playfield: replays a real beatmap (see map.js) on loop.

   Every circle, slider path, combo number and timing comes
   straight from the .osu file. The canvas is fixed and
   full-bleed, but it only paints inside #pf-zone, so the
   replay never sits underneath text.
   ========================================================= */
(function () {
  const canvas = document.getElementById('playfield');
  const zone = document.getElementById('pf-zone');
  if (!canvas || !zone || !window.MAP) return;

  const ctx = canvas.getContext('2d');
  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const CONFIG = {
    zoom: 0.92,      // how much of #pf-zone the map fills
    alpha: 0.98,     // master opacity
    pop: 260,        // ms for hit bursts / fade-outs
    trailLife: 180,  // ms cursor trail dots live
  };

  let speed = 1, paused = false;

  // ---- decode the compact map data --------------------------
  // circle: [t, x, y, combo]   slider: [t, x, y, combo, dur, slides, [x0,y0,...]]
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

  // ---- facts derived from the baked data --------------------
  // CS and AR are recovered by inverting the formulas in tools/convert.js
  const SLIDERS = MAP.objects.filter(o => o.length > 4).length;
  const CS = (54.4 - MAP.r) / 4.48;
  const AR = MAP.preempt < 1200
    ? 5 + 5 * (1200 - MAP.preempt) / 750
    : 5 - 5 * (MAP.preempt - 1200) / 600;
  const MAPURL = 'https://osu.ppy.sh/b/' + MAP.id;

  SET('k-obj', MAP.objects.length.toLocaleString());
  SET('k-now', MAP.title);
  SET('nf-map', MAP.title + ' [' + MAP.version + ']');
  SET('nf-mapper', MAP.creator);
  SET('nf-obj', MAP.objects.length.toLocaleString() + ' (' + SLIDERS.toLocaleString() + ' sliders)');
  SET('nf-diff', CS.toFixed(1) + ' / ' + AR.toFixed(1));
  SET('nf-loop', FMT(MAP.total));

  const nowLink = document.getElementById('k-nowlink');
  if (nowLink) nowLink.href = MAPURL;
  const footMap = document.getElementById('foot-map');
  if (footMap) {
    footMap.href = MAPURL;
    footMap.textContent = MAP.artist + ' - ' + MAP.title + ' [' + MAP.version + '] by ' + MAP.creator;
  }

  // ---- measure what the map actually draws ------------------
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

  let W = 0, H = 0, scale = 1, ox = 0, oy = 0, r = 12;
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // fit into the reserved box, wherever it currently sits
    const z = zone.getBoundingClientRect();
    scale = Math.min(z.width / boundsW, z.height / boundsH) * CONFIG.zoom;
    ox = z.left + (z.width - boundsW * scale) / 2 - minX * scale;
    oy = z.top + (z.height - boundsH * scale) / 2 - minY * scale;
    r = MAP.r * scale;
  }
  window.addEventListener('resize', resize);
  window.addEventListener('scroll', resize, { passive: true });
  new ResizeObserver(resize).observe(zone);
  resize();

  const TX = x => ox + x * scale;
  const TY = y => oy + y * scale;

  // ---- colours follow the current theme ---------------------
  let accent = '#f7768e', dim = '#565f89';
  function readColors() {
    const s = getComputedStyle(document.documentElement);
    accent = s.getPropertyValue('--red').trim() || accent;
    dim = s.getPropertyValue('--dim').trim() || dim;
  }
  readColors();
  new MutationObserver(readColors)
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // ---- slider geometry --------------------------------------
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
    ctx.font = `500 ${Math.round(r * 0.85)}px 'JetBrains Mono', monospace`;
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
  // ?t=<seconds> seeds the replay position (handy for debugging)
  const seed = parseFloat(new URLSearchParams(location.search).get('t'));
  let mapTime = Number.isFinite(seed) ? seed * 1000 : 0;
  let last = performance.now();
  let curCycle = -1, wp = 0, combo = 0;
  let lastHit = { x: 256, y: 192, absT: 0 };
  const trail = [];
  const bar = document.getElementById('p-bar');

  // With reduced motion, park on a populated moment and draw one frame.
  if (REDUCED) { mapTime = 30000; paused = true; }

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

  let hudTick = -1e9;
  function frame(now) {
    if (!REDUCED) requestAnimationFrame(frame);

    const dt = now - last;
    last = now;
    if (!paused) mapTime += dt * speed;

    const absTime = mapTime;
    const cycle = Math.floor(absTime / MAP.total);
    const mt = absTime - cycle * MAP.total;

    if (cycle !== curCycle) {   // loop restart
      curCycle = cycle;
      wp = 0;
      combo = 0;
      trail.length = 0;
      lastHit = { x: 256, y: 192, absT: cycle * MAP.total };
    }

    ctx.clearRect(0, 0, W, H);

    // Advance past finished objects, then find how far ahead is visible.
    // combo is an accumulator, NOT o.n - o.n is the number printed on the
    // circle, which resets at every new-combo marker. The hitCycle guard
    // stops the two passes from double-counting.
    while (wp < objs.length && objs[wp].t + objs[wp].dur + CONFIG.pop < mt) {
      const o = objs[wp];
      if (o.hitCycle !== cycle) {
        o.hitCycle = cycle;
        combo++;
        lastHit = { x: o.end[0], y: o.end[1], absT: cycle * MAP.total + o.t + o.dur };
      }
      wp++;
    }
    let q = wp;
    while (q < objs.length && objs[q].t - PREEMPT <= mt) {
      const o = objs[q];
      if (o.t + o.dur <= mt && o.hitCycle !== cycle) {
        o.hitCycle = cycle;
        combo++;
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

    // HUD throttled to ~10fps - no need to touch the DOM every frame
    if (now - hudTick > 100) {
      hudTick = now;
      SET('k-combo', combo.toLocaleString());
      SET('k-time', FMT(mt));
      if (bar) bar.style.width = (mt / MAP.total * 100) + '%';
    }
  }
  requestAnimationFrame(frame);

  // ---- media controls drive the replay ----------------------
  const PLAY_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4l13 8-13 8z"/></svg>';
  const PAUSE_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>';

  const play = document.getElementById('b-play');
  if (play) {
    if (REDUCED) { play.innerHTML = PLAY_ICON; play.classList.remove('on'); }
    play.addEventListener('click', () => {
      paused = !paused;
      play.classList.toggle('on', !paused);
      play.innerHTML = paused ? PLAY_ICON : PAUSE_ICON;
      play.setAttribute('aria-label', paused ? 'Play replay' : 'Pause replay');
      if (!paused && REDUCED) { last = performance.now(); requestAnimationFrame(frame); }
    });
  }
  const prev = document.getElementById('b-prev');
  if (prev) prev.addEventListener('click', () => {
    mapTime = 0; curCycle = -1; speed = 1;
    if (REDUCED && paused) { last = performance.now(); requestAnimationFrame(frame); }
  });
  const next = document.getElementById('b-next');
  if (next) next.addEventListener('click', () => {
    speed = speed >= 4 ? 1 : speed * 2;
    next.title = speed + 'x';
  });
})();
