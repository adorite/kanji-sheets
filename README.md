<div align="center">

# 字 Kanji Sheets

**Generate print-ready Japanese kanji practice sheets — _genkōyōshi_ grids for all 2,136 Jōyō kanji — entirely in the browser.**

Pick a school grade or JLPT level, choose a handwritten model font, set how many times to write each character, and download a clean PDF. No backend, no sign-up, no tracking.

[**Live demo →**](#) &nbsp;·&nbsp; [Features](#features) &nbsp;·&nbsp; [How it works](#how-it-works) &nbsp;·&nbsp; [Run locally](#run-locally)

</div>

---

## Overview

[Genkōyōshi (原稿用紙)](https://en.wikipedia.org/wiki/Genk%C5%8D_y%C5%8Dshi) are the gridded sheets Japanese students use to practise handwriting. **Kanji Sheets** turns any slice of the official Jōyō kanji into one of these sheets: each character is printed once as a model — sized to fill its square calligraphically — followed by as many blank practice boxes as you want, with optional faint tracing guides.

It’s a single-page React app with **no server**. The PDF is generated client-side and rendered into a live preview as you tweak the options, so what you see is exactly what prints.

## Features

- 📚 **All 2,136 Jōyō kanji**, in a sensible learning order — by official MEXT school grade (1–6, then secondary), then by corpus frequency.
- 🎚️ **Select by grade, JLPT level, or just type the kanji you want.** Slice any range out of a set.
- 🎲 **Random test mode** — quiz yourself: a random sample of the set with the English meaning as the prompt and empty boxes to write the kanji from memory, plus an answer key on the last page. Reshuffle for a fresh test.
- ✍️ **Model fonts that actually look handwritten** — Klee (kaisho handwriting, the default), Yuji Syuku (brush), and a clean gothic — so the character you copy looks like good handwriting, not a screen font.
- 🔢 **Tune everything**: boxes per kanji, number of faint tracing guides, square size, guide lines (full sub-grid, centre cross, or plain), and page size (A4 / US Letter / Kindle Scribe).
- 🏷️ **Context on the page**: each kanji’s English meaning above its row, and a divider marking where a new grade begins.
- 👀 **Live PDF preview** of the whole document — scroll every page before you download.
- 🖨️ **Print-perfect output** with embedded, subset fonts — renders identically on any device or printer.

## How it works

A few details worth calling out, since they’re where the interesting engineering is:

- **Client-side PDF generation.** Sheets are drawn with [jsPDF](https://github.com/parallax/jsPDF) — boxes, sub-grids and glyphs are placed in millimetres so the geometry is exact. The document is produced as a Blob and shown in an `<iframe>` (`#toolbar=0&view=FitH`) for a chrome-free live preview; the same document is what `Download` saves.
- **Real Japanese fonts, kept small.** Full CJK fonts are several megabytes. Each model font is **subset with `pyftsubset` to only the ~2,500 glyphs this app can render** (every Jōyō kanji + kana + ASCII), cutting them from ~8 MB to 1–2 MB. Fonts are also **lazy-loaded** — only the one you pick is fetched — and jsPDF subsets again on embed, so a typical sheet PDF is well under 300 KB.
- **A canonical kanji order.** The dataset is pre-sorted once at build time (see [`scripts/build-data.mjs`](scripts/build-data.mjs)) so the app just slices an array — no sorting in the hot path.
- **Frequency-aware ranges.** Within any grade or JLPT level, kanji come out most-common-first, so a “first 40” sheet covers the characters you’ll actually see soonest.

## Tech stack

| | |
|---|---|
| **Framework** | React 18 + Vite |
| **PDF** | jsPDF (drawn in mm, fonts embedded) |
| **Data** | KANJIDIC → a 271 KB pre-sorted JSON, bundled |
| **Fonts** | Klee One · Yuji Syuku · Zen Kaku Gothic New (OFL), subset |
| **Hosting** | Static SPA — deploys to Vercel / Netlify / GitHub Pages |

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build → dist/
npm run preview    # serve the build locally
```

### Deploy

It’s a static site — point any host at the repo:

- **Vercel**: import the repo; framework preset **Vite**, build `npm run build`, output `dist`. Done.
- **Netlify / GitHub Pages / Cloudflare Pages**: same build command and `dist` output directory.

## Project structure

```
kanji-sheets/
├─ public/fonts/            # OFL fonts, subset to the Jōyō glyph set
├─ scripts/build-data.mjs   # regenerates the kanji dataset (Node 18+)
└─ src/
   ├─ data/
   │  ├─ joyo.json          # 2,136 kanji, pre-sorted (grade → frequency)
   │  └─ kanji.js           # selection helpers (by grade / JLPT / typed)
   ├─ lib/genkouyoushiPdf.js # the grid + glyph drawing engine
   ├─ App.jsx               # UI + live preview
   └─ App.css / index.css
```

### Regenerating the dataset

```bash
npm run build:data         # re-fetches the source and rewrites src/data/joyo.json
```

## Credits & licence

- **Kanji data** derives from the **[KANJIDIC project](https://www.edrdg.org/wiki/index.php/KANJIDIC_Project)** (EDRDG, Monash University), CC BY-SA 4.0, via the [kanji-data](https://github.com/davidluzgouveia/kanji-data) aggregation.
- **Fonts**: [Klee One](https://fonts.google.com/specimen/Klee+One), [Yuji Syuku](https://fonts.google.com/specimen/Yuji+Syuku), [Zen Kaku Gothic New](https://fonts.google.com/specimen/Zen+Kaku+Gothic+New) — SIL Open Font License 1.1.
- **Code**: MIT — see [LICENSE](LICENSE).

<div align="center"><sub>Built with care for fellow kanji learners. 🖌️</sub></div>
