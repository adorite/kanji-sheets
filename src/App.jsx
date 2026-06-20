import { useEffect, useMemo, useRef, useState } from 'react'
import { buildSheet, FONTS } from './lib/genkouyoushiPdf'
import {
  KANJI, GRADES, JLPT_LEVELS, gradeName, gradeNameLong,
  kanjiByGrade, kanjiByJlpt, kanjiFromText,
} from './data/kanji'
import './App.css'

const MAX_RUN = 500     // hard cap on kanji per sheet (keeps the PDF sane)
const DEFAULT_SHOW = 40 // how many kanji a fresh selection shows

const GUIDES = [
  { v: 'grid', label: 'Grid + cross' },
  { v: 'cross', label: 'Centre cross' },
  { v: 'none', label: 'Plain box' },
]
const PAGES = [
  { v: 'a4', label: 'A4' },
  { v: 'letter', label: 'Letter' },
  { v: 'scribe', label: 'Kindle Scribe' },
]

// Tiny seeded PRNG + shuffle so a "random" test is stable until you reshuffle.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function sampleKanji(arr, n, seed) {
  const r = mulberry32(seed || 1)
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1));[a[i], a[j]] = [a[j], a[i]] }
  return a.slice(0, Math.min(n, a.length))
}

export default function App() {
  const [mode, setMode] = useState('practice')   // 'practice' | 'blank'
  const [source, setSource] = useState('grade')  // 'grade' | 'jlpt' | 'custom'
  const [grade, setGrade] = useState(1)          // number | 'all'
  const [jlpt, setJlpt] = useState(5)
  const [custom, setCustom] = useState('')

  const [from, setFrom] = useState(1)
  const [to, setTo] = useState(DEFAULT_SHOW)

  const [boxes, setBoxes] = useState(8)
  const [traceCount, setTraceCount] = useState(1)
  const [font, setFont] = useState('handwriting')
  const [boxMm, setBoxMm] = useState(25)
  const [guides, setGuides] = useState('grid')
  const [diagonals, setDiagonals] = useState(false)
  const [showMeaning, setShowMeaning] = useState(true)
  const [markGrade, setMarkGrade] = useState(true)
  const [pageFormat, setPageFormat] = useState('a4')
  const [blankPages, setBlankPages] = useState(2)
  // Test mode
  const [count, setCount] = useState(20)
  const [answerKey, setAnswerKey] = useState(true)
  const [seed, setSeed] = useState(() => (Math.random() * 1e9) | 0)

  const [url, setUrl] = useState(null)
  const [busy, setBusy] = useState(false)
  const urlRef = useRef(null)

  const selected = useMemo(() => {
    if (mode === 'blank') return []
    if (source === 'grade') return kanjiByGrade(grade)
    if (source === 'jlpt') return kanjiByJlpt(jlpt)
    return kanjiFromText(custom)
  }, [mode, source, grade, jlpt, custom])

  // Reset the visible window whenever the selection changes.
  useEffect(() => {
    setFrom(1)
    setTo(Math.min(selected.length || DEFAULT_SHOW, DEFAULT_SHOW))
  }, [selected])

  // Coerce the (possibly empty / partial) field values into safe numbers for the
  // generator, independent of what's shown in the inputs while the user types.
  const int = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d }
  const vBoxes = Math.max(1, int(boxes, 8))
  const vTrace = Math.max(0, Math.min(int(traceCount, 0), vBoxes - 1))
  const vFrom = Math.max(1, int(from, 1))
  const vTo = Math.max(vFrom, int(to, vFrom))
  const vCount = Math.max(1, int(count, 20))
  const vPages = Math.max(1, int(blankPages, 2))

  const sliced = selected.slice(vFrom - 1, vTo).slice(0, MAX_RUN)
  const testSample = useMemo(
    () => (mode === 'test' ? sampleKanji(selected, vCount, seed) : []),
    [mode, selected, vCount, seed])

  const runs = mode === 'test'
    ? testSample.map((k, idx) => ({ k: k.c, label: `${idx + 1}.  ${k.m?.[0] || ''}`, group: null }))
    : sliced.map((k) => ({
        k: k.c,
        label: showMeaning ? (k.m?.[0] || '') : '',
        group: markGrade && k.g != null ? gradeName(k.g) : null,
      }))

  const setName = source === 'grade' ? (grade === 'all' ? 'all grades' : gradeName(grade))
    : source === 'jlpt' ? `JLPT N${jlpt}` : 'custom set'
  const opts = (onePage) => ({
    mode, runs, boxes: vBoxes, traceCount: vTrace, boxMm, font, guides, diagonals,
    showLabel: mode === 'test' ? true : showMeaning,
    markGroups: mode === 'test' ? false : markGrade,
    answerKey, pageFormat, blankPages: vPages, onePage,
    title: mode === 'blank' ? 'Kanji practice — genkouyoushi'
      : `${mode === 'test' ? 'Kanji test' : 'Jōyō kanji'} — ${setName}`,
  })

  // Debounced live preview (full document — all pages are scrollable in the frame).
  useEffect(() => {
    if (mode !== 'blank' && runs.length === 0) { setUrl(null); return }
    let cancelled = false
    setBusy(true)
    const t = setTimeout(async () => {
      try {
        const doc = await buildSheet(opts(false))
        if (cancelled) return
        const next = doc.output('bloburl')
        if (urlRef.current) URL.revokeObjectURL(urlRef.current)
        urlRef.current = next
        setUrl(next)
      } catch (e) { console.warn('preview failed', e) }
      finally { if (!cancelled) setBusy(false) }
    }, 350)
    return () => { cancelled = true; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, source, grade, jlpt, custom, from, to, count, seed, answerKey, boxes, traceCount, font, boxMm, guides, diagonals, showMeaning, markGrade, pageFormat, blankPages, selected.length])

  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current) }, [])

  const download = async () => {
    const doc = await buildSheet(opts(false))
    const tag = mode === 'blank' ? 'blank'
      : `${mode === 'test' ? 'test' : ''}${source === 'grade' ? `grade-${grade}` : source === 'jlpt' ? `jlpt-n${jlpt}` : 'custom'}`
    doc.save(`kanji-sheet-${tag}.pdf`)
  }

  // Number-field handler. Crucially it does NOT enforce the minimum while typing
  // (otherwise "16" snaps to "26" as you pass through "1"); it only caps the max
  // and allows an empty field, then snaps into [min, max] on blur. Consumers use
  // the coerced v* values above so a transient empty/partial value never breaks
  // generation.
  const num = (set, { min = 0, max = 99 } = {}) => ({
    onChange: (e) => {
      const v = e.target.value
      if (v === '') return set('')
      const n = parseInt(v, 10)
      if (Number.isFinite(n)) set(Math.min(max, n))
    },
    onBlur: (e) => {
      const n = parseInt(e.target.value, 10)
      set(Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min)
    },
  })

  const canDownload = mode === 'blank' || runs.length > 0

  return (
    <div className="page">
      <header className="masthead">
        <div className="brand">
          <span className="brand-mark">字</span>
          <div>
            <h1>Kanji Sheets</h1>
            <p>Printable genkōyōshi practice grids for the <strong>2,136 Jōyō kanji</strong></p>
          </div>
        </div>
        <a className="ghlink" href="https://github.com/" target="_blank" rel="noreferrer">Source ↗</a>
      </header>

      <main className="layout">
        {/* ── Controls ── */}
        <section className="panel">
          <div className="seg">
            <button className={mode === 'practice' ? 'on' : ''} onClick={() => setMode('practice')}>Practice</button>
            <button className={mode === 'test' ? 'on' : ''} onClick={() => setMode('test')}>Test</button>
            <button className={mode === 'blank' ? 'on' : ''} onClick={() => setMode('blank')}>Blank</button>
          </div>

          {mode !== 'blank' && (
            <>
              <div className="seg seg-sub">
                <button className={source === 'grade' ? 'on' : ''} onClick={() => setSource('grade')}>By grade</button>
                <button className={source === 'jlpt' ? 'on' : ''} onClick={() => setSource('jlpt')}>By JLPT</button>
                <button className={source === 'custom' ? 'on' : ''} onClick={() => setSource('custom')}>Custom</button>
              </div>

              {source === 'grade' && (
                <div className="chips">
                  <button className={grade === 'all' ? 'on' : ''} onClick={() => setGrade('all')}>All</button>
                  {GRADES.map((g) => (
                    <button key={g} className={grade === g ? 'on' : ''} onClick={() => setGrade(g)} title={gradeNameLong(g)}>
                      {g === 8 ? 'Sec.' : g}
                    </button>
                  ))}
                </div>
              )}
              {source === 'jlpt' && (
                <div className="chips">
                  {JLPT_LEVELS.map((n) => (
                    <button key={n} className={jlpt === n ? 'on' : ''} onClick={() => setJlpt(n)}>N{n}</button>
                  ))}
                </div>
              )}
              {source === 'custom' && (
                <textarea className="field area" value={custom} rows={2}
                  onChange={(e) => setCustom(e.target.value)} placeholder="Type or paste kanji, e.g. 日本語学校" />
              )}

              {mode === 'practice' ? (
                <>
                  <div className="setinfo">
                    <strong>{selected.length.toLocaleString()}</strong> kanji in set
                    {selected.length > 0 && <> · showing {vFrom}–{Math.min(vTo, selected.length)}</>}
                  </div>
                  {selected.length > 1 && (
                    <div className="row">
                      <label className="field-l"><span>From</span>
                        <input type="number" min="1" max={selected.length} value={from} {...num(setFrom, { min: 1, max: selected.length })} />
                      </label>
                      <label className="field-l"><span>To</span>
                        <input type="number" min="1" max={selected.length} value={to} {...num(setTo, { min: 1, max: selected.length })} />
                      </label>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="setinfo">
                    <strong>{selected.length.toLocaleString()}</strong> kanji in set · testing <strong>{runs.length}</strong> at random
                  </div>
                  <div className="row">
                    <label className="field-l"><span>Questions</span>
                      <input type="number" min="1" max={Math.min(selected.length || 500, MAX_RUN)} value={count} {...num(setCount, { min: 1, max: MAX_RUN })} />
                    </label>
                    <button className="shuffle" type="button" onClick={() => setSeed((Math.random() * 1e9) | 0)}>🎲 Shuffle</button>
                  </div>
                </>
              )}

              <hr className="rule" />

              {mode === 'practice' ? (
                <div className="row">
                  <label className="field-l"><span>Boxes / kanji</span>
                    <input type="number" min="2" max="30" value={boxes} {...num(setBoxes, { min: 2, max: 30 })} />
                  </label>
                  <label className="field-l"><span>Tracing guides</span>
                    <input type="number" min="0" max={vBoxes - 1} value={traceCount} {...num(setTraceCount, { min: 0, max: 30 })} />
                  </label>
                </div>
              ) : (
                <label className="field-l"><span>Boxes to write each answer</span>
                  <input type="number" min="1" max="20" value={boxes} {...num(setBoxes, { min: 1, max: 20 })} />
                </label>
              )}

              <label className="field-l"><span>{mode === 'test' ? 'Answer-key font' : 'Model font'}</span>
                <select value={font} onChange={(e) => setFont(e.target.value)}>
                  {FONTS.map((f) => <option key={f.v} value={f.v}>{f.label}</option>)}
                </select>
              </label>

              {mode === 'practice' ? (
                <>
                  <label className="check"><input type="checkbox" checked={showMeaning} onChange={(e) => setShowMeaning(e.target.checked)} /> Show meaning above each kanji</label>
                  <label className="check"><input type="checkbox" checked={markGrade} onChange={(e) => setMarkGrade(e.target.checked)} /> Mark where a new grade starts</label>
                </>
              ) : (
                <label className="check"><input type="checkbox" checked={answerKey} onChange={(e) => setAnswerKey(e.target.checked)} /> Include answer key (last page)</label>
              )}
            </>
          )}

          {mode === 'blank' && (
            <label className="field-l"><span>Pages</span>
              <input type="number" min="1" max="50" value={blankPages} {...num(setBlankPages, { min: 1, max: 50 })} />
            </label>
          )}

          <hr className="rule" />

          <label className="field-l"><span>Square size — {boxMm} mm</span>
            <input type="range" min="12" max="40" value={boxMm} onChange={(e) => setBoxMm(Number(e.target.value))} />
          </label>
          <div className="row">
            <label className="field-l"><span>Guide lines</span>
              <select value={guides} onChange={(e) => setGuides(e.target.value)}>
                {GUIDES.map((g) => <option key={g.v} value={g.v}>{g.label}</option>)}
              </select>
            </label>
            <label className="field-l"><span>Page size</span>
              <select value={pageFormat} onChange={(e) => setPageFormat(e.target.value)}>
                {PAGES.map((p) => <option key={p.v} value={p.v}>{p.label}</option>)}
              </select>
            </label>
          </div>
          <label className="check"><input type="checkbox" checked={diagonals} onChange={(e) => setDiagonals(e.target.checked)} /> Diagonal guides</label>

          <button className="download" onClick={download} disabled={!canDownload}>↓ Download PDF</button>
        </section>

        {/* ── Preview ── */}
        <section className="previewcol">
          <div className="preview-head">Preview <span className={`dot${busy ? ' busy' : ''}`} /></div>
          <div className="preview">
            {url
              ? <iframe title="PDF preview" src={`${url}#toolbar=0&navpanes=0&view=FitH`} />
              : <div className="preview-empty">{mode === 'practice' ? 'Pick a grade, JLPT level, or type kanji.' : 'Your blank sheet will appear here.'}</div>}
          </div>
        </section>
      </main>

      <footer className="foot">
        <span>{KANJI.length.toLocaleString()} Jōyō kanji · ordered by MEXT school grade, then frequency.</span>
        <span>Kanji data: <a href="https://www.edrdg.org/wiki/index.php/KANJIDIC_Project" target="_blank" rel="noreferrer">KANJIDIC</a> (EDRDG, CC BY-SA). Fonts: Klee One, Yuji Syuku, Zen Kaku Gothic (OFL).</span>
      </footer>
    </div>
  )
}
