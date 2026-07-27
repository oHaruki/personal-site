# byharuki.dev

A tiny, no-framework personal site. Styled after a **YASB status bar** - a fixed
widget bar, panels built from the same grammar, and a real beatmap replaying
beside them. Palette is [Tokyo Night](https://github.com/folke/tokyonight.nvim)
(with a Tokyo Night Day light variant).

| File | What it's for |
|------|---------------|
| `index.html` | All the content. Edit the text here. |
| `styles.css` | All the styling. Colours live at the very top under **THEME TOKENS**. |
| `script.js`  | Theme toggle, clock, section pills, and the osu! playfield (tuning knobs in `CONFIG`). |
| `map.js`     | Baked beatmap data the playfield replays. |
| `assets/og.png` | Social preview card (1200×630). |

## Preview it locally

Double-click `index.html`, or `npx serve` / `python -m http.server` in this folder.

Add `?t=<seconds>` to jump the replay to a given point - handy when checking a
change without waiting: `index.html?t=95`.

---

## How the layout works

Two columns of panels. The playfield canvas is **fixed and full-bleed**, but it
only *paints* inside the reserved `#pf-zone` box in the left column - that's why
the replay never ends up underneath text. Move or resize `.pfzone` in
`styles.css` and the renderer follows it automatically.

A few things worth knowing before editing:

- **No gradients anywhere.** A near-black gradient bands badly on real displays
  (visible vertical stripes), so the wallpaper is dimmed with a flat `.scrim`
  instead. If you add a large dark gradient, expect stripes.
- **Mono is the UI face.** `Inter` is used for exactly one thing: the `about`
  paragraph, because a block of prose in monospace is hard to read.
- **Every number is derived.** Object count, slider count, CS and AR are all
  computed from `map.js` at runtime - CS/AR by inverting the formulas in
  `tools/convert.js`. Swap the map and the whole page updates itself.
- **Combo is an accumulator.** `map.js` stores the number printed *on* each
  circle, which resets at every new-combo marker; the counter tallies objects
  passed instead.

---

## Swapping the background beatmap

1. Find the beatmap's numeric id (the number after `#osu/` in its URL).
2. Download the raw file: `https://osu.ppy.sh/osu/<id>` (save as `map.osu`).
3. Run: `node tools/convert.js map.osu map.js`

The footer credit, the bar's map widget and the `fetch` panel all read from
`map.js`, so there's nothing else to update.

---

## Editing the content

Everything is marked with `<!-- comments -->` in `index.html`:

- **Name / tagline** - the `.who` block in the right column.
- **about / tools / links** - the `<section class="panel">` blocks.
- **Bar widgets** - the `.w` chips in `<header class="bar">`.
- **fetch panel** - the `.nf__kv` list; `renderer` and `theme` are static, the
  rest come from `map.js` or the browser.

To change the accent, edit `--red` under **THEME TOKENS** (there's a dark and a
light value). The canvas reads it at runtime, so the playfield follows.

---

## Deploying

See [DEPLOY.md](./DEPLOY.md). Short version: push to `main`, then
**GitHub → Actions → "Deploy to VPS" → Run workflow**. The runner SSHes in and
`git pull`s; nginx serves the files directly, so there's no build step.
