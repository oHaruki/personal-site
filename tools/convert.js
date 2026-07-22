// Converts a .osu beatmap into compact JSON for the personal-site playfield.
// Usage: node convert.js <map.osu> <out.js>
'use strict';
const fs = require('fs');

const [, , inPath, outPath] = process.argv;
const raw = fs.readFileSync(inPath, 'utf8');

// ---------- parse sections ----------
const sections = {};
let cur = null;
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^\[(\w+)\]$/);
  if (m) { cur = m[1]; sections[cur] = []; continue; }
  if (cur && line.trim() !== '') sections[cur].push(line);
}

function kv(section) {
  const out = {};
  for (const l of sections[section] || []) {
    const i = l.indexOf(':');
    if (i > 0) out[l.slice(0, i).trim()] = l.slice(i + 1).trim();
  }
  return out;
}

const meta = kv('Metadata');
const diff = kv('Difficulty');

const CS = parseFloat(diff.CircleSize);
const AR = parseFloat(diff.ApproachRate);
const SM = parseFloat(diff.SliderMultiplier);

const radius = 54.4 - 4.48 * CS;
const preempt = AR < 5 ? 1200 + 600 * (5 - AR) / 5 : 1200 - 750 * (AR - 5) / 5;

// ---------- timing points (for slider durations) ----------
const timing = (sections.TimingPoints || []).map(l => {
  const p = l.split(',').map(Number);
  return { time: p[0], beatLength: p[1], uninherited: p[6] !== 0 };
}).filter(t => !isNaN(t.time));

function sliderDuration(t, pixelLength, slides) {
  let baseBeat = 500, sv = 1;
  for (const tp of timing) {
    if (tp.time > t + 1e-6) break;
    if (tp.uninherited) { baseBeat = tp.beatLength; sv = 1; }
    else if (tp.beatLength < 0) sv = -100 / tp.beatLength;
  }
  return pixelLength / (SM * 100 * sv) * baseBeat * slides;
}

// ---------- slider path sampling ----------
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function sampleBezier(pts) {
  // de Casteljau, sampled uniformly in t
  const n = Math.max(24, pts.length * 12);
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    let tmp = pts.map(p => [...p]);
    for (let k = tmp.length - 1; k > 0; k--)
      for (let j = 0; j < k; j++) {
        tmp[j][0] += (tmp[j + 1][0] - tmp[j][0]) * t;
        tmp[j][1] += (tmp[j + 1][1] - tmp[j][1]) * t;
      }
    out.push(tmp[0]);
  }
  return out;
}

function sampleArc(a, b, c) {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  if (Math.abs(d) < 1e-6) return [a, b, c];   // collinear -> treat as line
  const aa = a[0] * a[0] + a[1] * a[1], bb = b[0] * b[0] + b[1] * b[1], cc = c[0] * c[0] + c[1] * c[1];
  const ux = (aa * (b[1] - c[1]) + bb * (c[1] - a[1]) + cc * (a[1] - b[1])) / d;
  const uy = (aa * (c[0] - b[0]) + bb * (a[0] - c[0]) + cc * (b[0] - a[0])) / d;
  const r = Math.hypot(a[0] - ux, a[1] - uy);
  const a0 = Math.atan2(a[1] - uy, a[0] - ux);
  const a1 = Math.atan2(b[1] - uy, b[0] - ux);
  const a2 = Math.atan2(c[1] - uy, c[0] - ux);
  const TAU = Math.PI * 2;
  const ccw = ((a2 - a0) % TAU + TAU) % TAU;          // sweep going ccw
  const mid = ((a1 - a0) % TAU + TAU) % TAU;
  const sweep = mid <= ccw ? ccw : ccw - TAU;          // pick the side that passes through b
  const steps = Math.max(8, Math.ceil(Math.abs(sweep) * r / 5));
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const ang = a0 + sweep * (i / steps);
    out.push([ux + r * Math.cos(ang), uy + r * Math.sin(ang)]);
  }
  return out;
}

function samplePath(type, anchors) {
  if (type === 'L' || anchors.length < 3) {
    return anchors;
  }
  if (type === 'P' && anchors.length === 3) {
    return sampleArc(anchors[0], anchors[1], anchors[2]);
  }
  // B (and C, approximated): split into segments at duplicated anchors
  const out = [];
  let seg = [anchors[0]];
  for (let i = 1; i < anchors.length; i++) {
    if (anchors[i][0] === anchors[i - 1][0] && anchors[i][1] === anchors[i - 1][1]) {
      out.push(...sampleBezier(seg)); seg = [anchors[i]];
    } else seg.push(anchors[i]);
  }
  out.push(...sampleBezier(seg));
  return out;
}

// walk a polyline: trim (or extend) to pixelLength, then thin to ~spacing px
function normalizePath(pts, pixelLength) {
  // cumulative lengths
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
  const total = cum[cum.length - 1];

  if (total > pixelLength) {
    // cut at pixelLength
    const cut = [];
    for (let i = 0; i < pts.length; i++) {
      if (cum[i] <= pixelLength) cut.push(pts[i]);
      else {
        const prev = pts[i - 1], f = (pixelLength - cum[i - 1]) / (cum[i] - cum[i - 1]);
        cut.push([prev[0] + (pts[i][0] - prev[0]) * f, prev[1] + (pts[i][1] - prev[1]) * f]);
        break;
      }
    }
    pts = cut;
  } else if (total < pixelLength && pts.length >= 2) {
    // extend along the last direction
    const a = pts[pts.length - 2], b = pts[pts.length - 1];
    const d = dist(a, b) || 1, ext = pixelLength - total;
    pts = [...pts, [b[0] + (b[0] - a[0]) / d * ext, b[1] + (b[1] - a[1]) / d * ext]];
  }

  // thin to roughly one point per 8px, always keeping the endpoints
  const thin = [pts[0]];
  let acc = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    acc += dist(pts[i - 1], pts[i]);
    if (acc >= 8) { thin.push(pts[i]); acc = 0; }
  }
  thin.push(pts[pts.length - 1]);
  return thin.map(p => [Math.round(p[0]), Math.round(p[1])]);
}

// ---------- hit objects ----------
const objects = [];
let combo = 0;
for (const line of sections.HitObjects || []) {
  const parts = line.split(',');
  if (parts.length < 4) continue;
  const x = parseFloat(parts[0]), y = parseFloat(parts[1]);
  const t = Math.round(parseFloat(parts[2]));
  const type = parseInt(parts[3], 10);

  combo = (type & 4) ? 1 : combo + 1;

  if (type & 8) continue;               // spinner: skip (cursor just flies on)

  if (type & 2) {
    // slider
    const curve = parts[5].split('|');
    const curveType = curve[0];
    const anchors = [[x, y], ...curve.slice(1).map(s => s.split(':').map(Number))];
    const slides = parseInt(parts[6], 10) || 1;
    const pixelLength = parseFloat(parts[7]) || 0;
    const dur = Math.round(sliderDuration(t, pixelLength, slides));
    const path = normalizePath(samplePath(curveType, anchors), pixelLength);
    objects.push({ t, x, y, n: combo, dur, slides, path });
  } else if (type & 1) {
    objects.push({ t, x, y, n: combo, dur: 0 });
  }
}

objects.sort((a, b) => a.t - b.t);

// ---------- compress the intro and breaks ----------
let shift = objects.length ? objects[0].t - 1000 : 0;
let prevEnd = null;
for (const o of objects) {
  o.t -= shift;
  if (prevEnd !== null && o.t - prevEnd > 3000) {
    const extra = o.t - prevEnd - 1500;
    shift += extra;
    o.t -= extra;
  }
  prevEnd = Math.max(prevEnd ?? 0, o.t + o.dur);
}

const total = prevEnd + 2000;

// ---------- emit ----------
const enc = objects.map(o =>
  o.dur > 0
    ? [o.t, Math.round(o.x), Math.round(o.y), o.n, o.dur, o.slides, o.path.flat()]
    : [o.t, Math.round(o.x), Math.round(o.y), o.n]
);

const header =
  `// Auto-generated from "${meta.Artist} - ${meta.Title} [${meta.Version}]" ` +
  `mapped by ${meta.Creator} (https://osu.ppy.sh/b/${meta.BeatmapID})\n` +
  `// Regenerate with scratchpad convert.js if you ever swap the map.\n`;

const payload = {
  artist: meta.Artist, title: meta.Title, version: meta.Version, creator: meta.Creator,
  id: Number(meta.BeatmapID),
  r: Math.round(radius * 100) / 100,
  preempt: Math.round(preempt),
  total: Math.round(total),
  objects: enc,
};

fs.writeFileSync(outPath, header + 'window.MAP = ' + JSON.stringify(payload) + ';\n');
console.log(`objects: ${enc.length} (sliders: ${enc.filter(o => o.length > 4).length})`);
console.log(`radius: ${payload.r}px  preempt: ${payload.preempt}ms  loop: ${(total / 1000).toFixed(1)}s`);
console.log(`size: ${(fs.statSync(outPath).size / 1024).toFixed(1)} KB`);
