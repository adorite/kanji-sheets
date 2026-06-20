// Genkouyoushi (原稿用紙) kanji-practice-sheet generator.
//
// Draws the traditional practice grid — outer square, dashed N×N sub-grid with a
// solid darker centre cross, generous row gutters — onto a jsPDF document, then
// (in practice mode) places a dark "model" glyph in the first box of each kanji
// followed by a chosen number of practice boxes, optionally seeded with faint
// tracing glyphs. The model font is embedded (and subset by jsPDF) so the kanji
// render anywhere. buildSheet() returns the doc *without saving* so the caller
// can preview it (doc.output('bloburl') → <iframe>) and download it.

const IN = 25.4 // mm per inch

// Page sizes (mm). "scribe" matches the Kindle Scribe screen at 300 ppi.
const FORMATS = {
  a4: 'a4',
  letter: 'letter',
  scribe: [7.4 * IN, 9.9 * IN],
}
const MARGIN_TOP = 0.55 * IN
const MARGIN_X = 0.45 * IN
const MARGIN_BOTTOM = 0.45 * IN
const GUTTER_ROW = 0.14 * IN

const PT = 0.352778 // mm per point
const GRID = [38, 38, 38]
const GUIDE = [184, 184, 184]
const DIAG = [209, 209, 209]
const CENTRE = [140, 140, 140]
const HEADER = [89, 89, 89]

// Model-glyph fonts (all OFL, subset to the Jōyō kanji + kana + ASCII).
export const FONTS = [
  { v: 'handwriting', label: 'Handwriting (Klee)', file: 'KleeOne-Regular.ttf' },
  { v: 'brush', label: 'Brush (Yuji Syuku)', file: 'YujiSyuku-Regular.ttf' },
  { v: 'gothic', label: 'Gothic (Zen Kaku)', file: 'ZenKakuGothicNew-Regular.ttf' },
]
const FONT_FILE = Object.fromEntries(FONTS.map((f) => [f.v, f.file]))

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

// One genkouyoushi cell. guides: 'grid' | 'cross' | 'none'
function drawBox(doc, x, y, size, { guides, subgridN = 4, diagonals }) {
  doc.setDrawColor(...GRID); doc.setLineWidth(0.9 * PT); doc.setLineDashPattern([], 0)
  doc.rect(x, y, size, size)

  if (diagonals) {
    doc.setDrawColor(...DIAG); doc.setLineWidth(0.5 * PT); doc.setLineDashPattern([2 * PT, 2 * PT], 0)
    doc.line(x, y, x + size, y + size)
    doc.line(x + size, y, x, y + size)
    doc.setLineDashPattern([], 0)
  }
  if (guides === 'none') return

  const n = guides === 'cross' ? 2 : subgridN
  const step = size / n
  for (let i = 1; i < n; i++) {
    const isCentre = n % 2 === 0 && i === n / 2
    if (isCentre) { doc.setDrawColor(...CENTRE); doc.setLineWidth(0.7 * PT); doc.setLineDashPattern([], 0) }
    else { doc.setDrawColor(...GUIDE); doc.setLineWidth(0.5 * PT); doc.setLineDashPattern([2 * PT, 2 * PT], 0) }
    doc.line(x + i * step, y, x + i * step, y + size)
    doc.line(x, y + i * step, x + size, y + i * step)
  }
  doc.setLineDashPattern([], 0)
}

function drawGlyph(doc, ch, x, y, size, shade) {
  doc.setTextColor(shade, shade, shade)
  doc.setFontSize(size * 2.5)
  doc.text(ch, x + size / 2, y + size / 2, { align: 'center', baseline: 'middle' })
}

// opts:
//   mode 'practice'|'blank'; runs [{ k, label?, group? }]; boxes; traceCount;
//   boxMm; font; guides; diagonals; showLabel; markGroups; pageFormat; title;
//   blankPages; onePage
export async function buildSheet(opts) {
  const {
    mode = 'practice', runs = [], boxes = 8, traceCount = 1, boxMm = 25,
    font = 'handwriting', guides = 'grid', diagonals = false,
    showLabel = true, markGroups = true, pageFormat = 'a4',
    title = 'Kanji practice', blankPages = 2, onePage = false,
    answerKey = true,
  } = opts
  const repeats = Math.max(0, boxes - 1)
  // Test mode: a recall quiz — the meaning is the prompt, the boxes are left empty
  // (no model glyph) for the learner to write the kanji from memory.
  const test = mode === 'test'

  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: FORMATS[pageFormat] || 'a4' })

  const file = FONT_FILE[font] || FONT_FILE.handwriting
  doc.addFileToVFS(file, await loadFont(file))
  doc.addFont(file, 'Model', 'normal')
  doc.setFont('Model', 'normal')

  const W = doc.internal.pageSize.width
  const H = doc.internal.pageSize.height
  const top = MARGIN_TOP
  const bottom = H - MARGIN_BOTTOM
  const cols = Math.max(1, Math.floor((W - MARGIN_X * 2) / boxMm))
  const startX = (W - cols * boxMm) / 2

  let pageNum = 0
  const header = () => {
    pageNum += 1
    const ruleY = MARGIN_TOP - 0.18 * IN
    doc.setDrawColor(...HEADER); doc.setLineWidth(0.7 * PT); doc.setLineDashPattern([], 0)
    doc.line(MARGIN_X, ruleY, W - MARGIN_X, ruleY)
    doc.setFontSize(9); doc.setTextColor(...HEADER)
    doc.text(title, MARGIN_X, ruleY - 0.06 * IN)
    doc.text(`${pageNum}`, W - MARGIN_X, ruleY - 0.06 * IN, { align: 'right' })
  }

  if (mode === 'blank') {
    const rowsPerPage = Math.max(1, Math.floor((bottom - top + GUTTER_ROW) / (boxMm + GUTTER_ROW)))
    const pages = onePage ? 1 : Math.max(1, blankPages)
    for (let p = 0; p < pages; p++) {
      if (p > 0) doc.addPage()
      header()
      for (let r = 0; r < rowsPerPage; r++) {
        const y = top + r * (boxMm + GUTTER_ROW)
        for (let c = 0; c < cols; c++) drawBox(doc, startX + c * boxMm, y, boxMm, { guides, diagonals })
      }
    }
    return doc
  }

  // ── practice ──
  header()
  const labelH = showLabel ? 4.5 : 0
  const GROUP_H = 7
  let y = top
  let prevGroup
  for (const run of runs) {
    const groupText = markGroups && run.group != null && run.group !== prevGroup ? run.group : null
    const cells = 1 + repeats
    const rowsForRun = Math.ceil(cells / cols)
    const runH = (groupText ? GROUP_H : 0) + (run.label && showLabel ? labelH : 0)
      + rowsForRun * boxMm + (rowsForRun - 1) * GUTTER_ROW
    if (y + runH > bottom) { if (onePage) break; doc.addPage(); header(); y = top }
    prevGroup = run.group

    if (groupText) {
      doc.setFontSize(9.5); doc.setTextColor(70)
      doc.text(groupText, startX, y + 4.4)
      const tw = doc.getTextWidth(groupText)
      doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.2); doc.setLineDashPattern([], 0)
      doc.line(startX + tw + 3, y + 3.2, startX + cols * boxMm, y + 3.2)
      y += GROUP_H
    }

    let gy = y
    if (showLabel && run.label) {
      doc.setFontSize(8); doc.setTextColor(120)
      doc.text(run.label, startX, y + labelH - 1)
      gy = y + labelH
    }
    for (let i = 0; i < cells; i++) {
      const bx = startX + (i % cols) * boxMm
      const by = gy + Math.floor(i / cols) * (boxMm + GUTTER_ROW)
      drawBox(doc, bx, by, boxMm, { guides, diagonals })
      if (test) continue                                       // empty boxes — write from memory
      if (i === 0) drawGlyph(doc, run.k, bx, by, boxMm, 20)
      else if (i - 1 < traceCount) drawGlyph(doc, run.k, bx, by, boxMm, 198)
    }
    y = gy + rowsForRun * boxMm + (rowsForRun - 1) * GUTTER_ROW + GUTTER_ROW
  }

  // ── Answer key (test mode) ──
  if (test && answerKey && runs.length) {
    doc.addPage(); header()
    let ay = top
    doc.setFontSize(11); doc.setTextColor(70)
    doc.text('Answer key', MARGIN_X, ay + 4); ay += 9
    const keyCols = 4
    const colW = (W - MARGIN_X * 2) / keyCols
    const lineH = 7
    runs.forEach((run, idx) => {
      const col = idx % keyCols
      if (col === 0 && ay + lineH > bottom) { doc.addPage(); header(); ay = top }
      const x = MARGIN_X + col * colW
      doc.setFontSize(8); doc.setTextColor(150)
      doc.text(`${idx + 1}.`, x, ay + 4)
      doc.setFontSize(13); doc.setTextColor(20)
      doc.text(run.k, x + 7, ay + 5)
      if (col === keyCols - 1) ay += lineH
    })
  }
  return doc
}
