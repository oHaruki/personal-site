# Personal site

A tiny, no-framework personal website. Three files do everything:

| File | What it's for |
|------|---------------|
| `index.html` | All the content. Edit the text here. |
| `styles.css` | All the styling. Colours live at the very top under **THEME TOKENS**. |
| `script.js`  | Theme toggle, footer year, and the osu! playfield that replays a real beatmap (tuning knobs in `CONFIG`). |
| `map.js`     | Baked beatmap data the playfield replays (currently the AC4 GF tiebreaker). |

### Swapping the background beatmap

The playfield replays a real map. To use a different one:

1. Find the beatmap's numeric id (the number after `#osu/` in its URL).
2. Download the raw file: `https://osu.ppy.sh/osu/<id>` (save as `map.osu`).
3. Run: `node tools/convert.js map.osu map.js`
4. Update the credit link in the footer of `index.html`.

---

## Preview it locally

Just **double-click `index.html`** and it opens in your browser. That's it.

(Optional, for auto-reload while editing: with Node installed, run `npx serve` in
this folder, or use VS Code's "Live Server" extension.)

---

## Editing the content

Open `index.html` and change the text between the tags. Everything you'd want to
change is marked with `<!-- comments -->`:

- **Your name**: the `<h1 class="wordmark">` near the top.
- **The meta line** (`he/him · ...`): the `<p class="hero__meta">`.
- **Social icon links**: the `href="#"` values inside `<nav class="socials">`.
- **Sections**: the three `<section>` blocks (about / tools / links).

To change the accent colour, edit `--accent` at the top of `styles.css`
(there's a dark value and a light value).

---

## Using an AI-generated PNG for your name

The site ships with your name as styled **text**, which already looks clean and
stays crisp on every screen. If you'd rather have an AI-made image:

### 1. Generate it
Use a model that renders **real letters** (most AI image tools garble text):

- **Ideogram** (https://ideogram.ai): best at text, free tier is enough.
- **Bing Image Creator** (https://bing.com/create): 100% free.

Prompt to start from (swap in your name):

> `Minimalist wordmark logo of the text "haruki", lowercase, bold rounded
> sans-serif, single flat color, transparent or plain background, high
> contrast, vector style, centered, no extra text`

Generate a few, pick the one that's spelled right and looks sharp.

### 2. Clean it up (optional, free)
- Remove the background at https://remove.bg (or the built-in eraser in the tool).
- A wide, short PNG (roughly 800x260) works best.

### 3. Drop it in
1. Save the file as `assets/wordmark.png`.
2. In `index.html`, replace the wordmark line with:

   ```html
   <h1 class="wordmark"><img src="assets/wordmark.png" alt="haruki" /></h1>
   ```

Done. The CSS already sizes it correctly.

> Tip: if you want the image to recolour itself for dark/light mode, use an **SVG**
> instead of a PNG and give its shapes `fill="currentColor"`. Ask me and I'll set it up.

---

## Putting it online (free)

Your domain can point at any of these. All free, all fine for a static site:

- **Cloudflare Pages** (https://pages.cloudflare.com): great if your domain is on Cloudflare.
- **Netlify** (https://netlify.com): drag-and-drop this folder onto their dashboard.
- **GitHub Pages**: push this folder to a GitHub repo, then enable Pages in settings.

Once it's live, point your domain's DNS at the host (each has a short guide) and
you're done. Ask me and I'll walk you through whichever one you pick.
