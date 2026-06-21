// Прописи / handwriting-practice-sheet generator (Russian Cyrillic + English Latin).
//
// Unlike the kanji genkouyoushi grid, Western handwriting practice uses *ruled
// lines*: a four-line band (ascender, x-height top, baseline, descender) with an
// optional slanted (наклонная) guide. In practice mode each item (a letter or a
// word) gets one model line — a dark exemplar followed by faint trace copies —
// then a number of empty ruled lines to write on. buildPropisi() returns the
// jsPDF doc without saving so the caller can preview and download it, mirroring
// genkouyoushiPdf's contract.

const IN = 25.4 // mm per inch
const PT = 0.352778 // mm per point

const FORMATS = {
  a4: 'a4',
  letter: 'letter',
  scribe: [7.4 * IN, 9.9 * IN],
}
const MARGIN_TOP = 0.55 * IN
const MARGIN_X = 0.45 * IN
const MARGIN_BOTTOM = 0.45 * IN

const BASELINE = [38, 38, 38]   // solid baseline
const MIDLINE = [150, 150, 150] // dashed x-height line
const FAINT = [196, 196, 196]   // ascender/descender + slant guides
const HEADER = [89, 89, 89]
const MODEL_DARK = 20           // first exemplar glyph
const MODEL_FAINT = 198         // trace copies

// Letter styles (all OFL/Apache, free). `langs` marks which languages a font
// can render: the calligraphic/print set covers Latin *and* Cyrillic, while the
// extra English scripts are Latin-only, so they're offered for English alone.
export const PROPISI_FONTS = [
  { v: 'calligraphy', label: 'Каллиграфия · Calligraphy (Pacifico)', file: 'Pacifico-Regular.ttf', langs: ['ru', 'en'] },
  { v: 'handwritten', label: 'Рукописный · Handwritten (Bad Script)', file: 'BadScript-Regular.ttf', langs: ['ru', 'en'] },
  { v: 'cursive', label: 'Курсив · Cursive (Marck Script)', file: 'MarckScript-Regular.ttf', langs: ['ru', 'en'] },
  { v: 'bold', label: 'Жирный курсив · Bold script (Lobster)', file: 'Lobster-Regular.ttf', langs: ['ru', 'en'] },
  { v: 'print', label: 'Печатные · Print (Pangolin)', file: 'Pangolin-Regular.ttf', langs: ['ru', 'en'] },
  { v: 'casual', label: 'Casual (Caveat)', file: 'Caveat-Regular.ttf', langs: ['ru', 'en'] },
  { v: 'dancing', label: 'Cursive (Dancing Script)', file: 'DancingScript-Regular.ttf', langs: ['en'] },
  { v: 'copperplate', label: 'Calligraphy (Great Vibes)', file: 'GreatVibes-Regular.ttf', langs: ['en'] },
  { v: 'monoline', label: 'Monoline script (Sacramento)', file: 'Sacramento-Regular.ttf', langs: ['en'] },
  { v: 'realhand', label: 'Real handwriting (Homemade Apple)', file: 'HomemadeApple-Regular.ttf', langs: ['en'] },
]

// The styles available for a given прописи language.
export const propisiFontsFor = (lang) => PROPISI_FONTS.filter((f) => f.langs.includes(lang))
const FONT_FILE = Object.fromEntries(PROPISI_FONTS.map((f) => [f.v, f.file]))

async function fetchFontBase64(url) {
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer())
  let binary = ''
  const chunk = 8192
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return btoa(binary)
}
const _fontCache = new Map() // file → Promise<base64>
const loadFont = (file) => {
  if (!_fontCache.has(file)) _fontCache.set(file, fetchFontBase64(import.meta.env.BASE_URL + 'fonts/' + file))
  return _fontCache.get(file)
}

// One four-line writing band, top-left at (x, y0), spanning [x, x+width].
//   xH = x-height (the body the lowercase letters fill).
// Returns the baseline y so the caller can place glyphs on it.
function drawBand(doc, x, y0, width, xH, { slant, slantAngle }) {
  const ascH = xH            // ascender space above the x-height line
  const descH = xH * 0.6     // descender space below the baseline
  const midY = y0 + ascH
  const baseY = midY + xH
  const descY = baseY + descH

  doc.setLineDashPattern([], 0)

  // ascender + descender — faint, dashed
  doc.setDrawColor(...FAINT); doc.setLineWidth(0.4 * PT); doc.setLineDashPattern([1.6 * PT, 1.6 * PT], 0)
  doc.line(x, y0, x + width, y0)
  doc.line(x, descY, x + width, descY)
  // x-height line — medium, dashed
  doc.setDrawColor(...MIDLINE); doc.setLineWidth(0.5 * PT)
  doc.line(x, midY, x + width, midY)
  // baseline — solid, dark
  doc.setDrawColor(...BASELINE); doc.setLineWidth(0.9 * PT); doc.setLineDashPattern([], 0)
  doc.line(x, baseY, x + width, baseY)

  // slanted guides spanning the full band height
  if (slant) {
    const h = descY - y0
    const dx = h / Math.tan((slantAngle * Math.PI) / 180) // horizontal run over the band
    const step = xH * 1.25
    doc.setDrawColor(...FAINT); doc.setLineWidth(0.35 * PT); doc.setLineDashPattern([], 0)
    for (let sx = x; sx <= x + width; sx += step) {
      const xb = sx          // at baseline-ish bottom
      doc.line(xb, descY, xb + dx, y0)
    }
    doc.setLineDashPattern([], 0)
  }
  return { baseY, bandH: descY - y0 }
}

// opts:
//   mode 'practice'|'blank'; items [string]; xHeightMm; practiceLines; traceCount;
//   slant; slantAngle; font; pageFormat; title; blankPages; onePage; showModel
export async function buildPropisi(opts) {
  const {
    mode = 'practice', items = [], xHeightMm = 8, practiceLines = 2, traceCount = 3,
    slant = true, slantAngle = 78, font = 'cursive', pageFormat = 'a4',
    title = 'Handwriting practice', blankPages = 2, onePage = false, showModel = true,
  } = opts

  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: FORMATS[pageFormat] || 'a4' })

  const file = FONT_FILE[font] || FONT_FILE.cursive
  doc.addFileToVFS(file, await loadFont(file))
  doc.addFont(file, 'Hand', 'normal')
  doc.setFont('Hand', 'normal')

  const W = doc.internal.pageSize.width
  const H = doc.internal.pageSize.height
  const top = MARGIN_TOP
  const bottom = H - MARGIN_BOTTOM
  const width = W - MARGIN_X * 2
  const xH = xHeightMm
  const ROW_GAP = xH * 0.7
  const bandStride = xH * 2.6 + ROW_GAP // full band height (asc + x + desc) + gap

  // Font size chosen so the lowercase body roughly fills the x-height. These
  // handwriting fonts sit around 0.5 x-height-to-em, so em ≈ 2·xH.
  const glyphPt = (xH * 2.0) / PT

  let pageNum = 0
  const header = () => {
    pageNum += 1
    const ruleY = MARGIN_TOP - 0.18 * IN
    doc.setDrawColor(...HEADER); doc.setLineWidth(0.7 * PT); doc.setLineDashPattern([], 0)
    doc.line(MARGIN_X, ruleY, W - MARGIN_X, ruleY)
    doc.setFontSize(9); doc.setTextColor(...HEADER); doc.setFont('helvetica', 'normal')
    doc.text(title, MARGIN_X, ruleY - 0.06 * IN)
    doc.text(`${pageNum}`, W - MARGIN_X, ruleY - 0.06 * IN, { align: 'right' })
    doc.setFont('Hand', 'normal')
  }

  const drawGlyph = (ch, x, baseY, shade) => {
    doc.setTextColor(shade, shade, shade)
    doc.setFontSize(glyphPt)
    doc.text(ch, x, baseY, { baseline: 'alphabetic' })
  }

  // ── blank ──
  if (mode === 'blank') {
    const rowsPerPage = Math.max(1, Math.floor((bottom - top) / bandStride))
    const pages = onePage ? 1 : Math.max(1, blankPages)
    for (let p = 0; p < pages; p++) {
      if (p > 0) doc.addPage()
      header()
      for (let r = 0; r < rowsPerPage; r++) {
        drawBand(doc, MARGIN_X, top + r * bandStride, width, xH, { slant, slantAngle })
      }
    }
    return doc
  }

  // ── practice ──
  header()
  let y = top
  const list = items.length ? items : ['']
  for (const item of list) {
    const linesForItem = 1 + Math.max(0, practiceLines)
    const blockH = linesForItem * bandStride
    if (y + bandStride > bottom) { if (onePage) break; doc.addPage(); header(); y = top }

    // model line: dark exemplar, then faint trace copies, rest left blank
    {
      const { baseY } = drawBand(doc, MARGIN_X, y, width, xH, { slant, slantAngle })
      doc.setFontSize(glyphPt)
      const gw = doc.getTextWidth(item) || xH * 0.6
      const gap = xH * 0.8
      const advance = gw + gap
      const copies = 1 + Math.max(0, traceCount)
      let gx = MARGIN_X + xH * 0.15
      for (let i = 0; i < copies; i++) {
        if (gx + gw > MARGIN_X + width) break
        const shade = i === 0 ? (showModel ? MODEL_DARK : MODEL_FAINT) : MODEL_FAINT
        drawGlyph(item, gx, baseY, shade)
        gx += advance
      }
      y += bandStride
    }
    // blank practice lines
    for (let i = 0; i < practiceLines; i++) {
      if (y + bandStride > bottom) { if (onePage) break; doc.addPage(); header(); y = top }
      drawBand(doc, MARGIN_X, y, width, xH, { slant, slantAngle })
      y += bandStride
    }
    y += ROW_GAP * 0.6 // small breather between items
    void blockH
  }
  return doc
}
