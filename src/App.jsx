import { useEffect, useMemo, useRef, useState } from 'react'
import { buildSheet, FONTS } from './lib/genkouyoushiPdf'
import { buildPropisi, PROPISI_FONTS } from './lib/propisiPdf'
import { alphabetItems, textItems } from './data/alphabets'
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

const LANGS = [
  { v: 'jp', label: '日本語 Kanji' },
  { v: 'ru', label: 'Русский' },
  { v: 'en', label: 'English' },
]
const PRESETS = [
  { v: 'lower', label: 'lowercase' },
  { v: 'upper', label: 'UPPERCASE' },
  { v: 'both', label: 'Both' },
]
// Maps a model-font value to the @font-face family used by the on-screen strip.
const FONT_FAMILY = {
  handwriting: 'KanjiKlee', brush: 'KanjiYuji', gothic: 'KanjiZen',
  mincho: 'KanjiShippori', maru: 'KanjiMaru',
}
const ANSWER_STYLES = [
  { v: 'fadedRevealed', label: 'Faded → revealed (two pages)' },
  { v: 'faded', label: 'Faded only (faint trace)' },
  { v: 'revealed', label: 'Revealed only (full kanji)' },
  { v: 'list', label: 'Compact numbered list' },
  { v: 'none', label: 'No answer key' },
]

export default function App() {
  const [lang, setLang] = useState('jp')          // 'jp' | 'ru' | 'en'
  const [mode, setMode] = useState('practice')   // 'practice' | 'test' | 'blank'
  const [source, setSource] = useState('grade')  // 'grade' | 'jlpt' | 'custom'
  const [grade, setGrade] = useState(1)          // number | 'all'
  const [jlpt, setJlpt] = useState(5)
  const [custom, setCustom] = useState('')

  const [from, setFrom] = useState(1)
  const [to, setTo] = useState(DEFAULT_SHOW)

  const [boxes, setBoxes] = useState(8)
  const [traceCount, setTraceCount] = useState(1)
  const [font, setFont] = useState('handwriting')
  const [compareFonts, setCompareFonts] = useState(false)
  const [boxMm, setBoxMm] = useState(25)
  const [guides, setGuides] = useState('grid')
  const [diagonals, setDiagonals] = useState(false)
  const [showMeaning, setShowMeaning] = useState(true)
  const [markGrade, setMarkGrade] = useState(true)
  const [pageFormat, setPageFormat] = useState('a4')
  const [blankPages, setBlankPages] = useState(2)
  // Test mode
  const [count, setCount] = useState(20)
  const [answerStyle, setAnswerStyle] = useState('fadedRevealed')
  const [seed, setSeed] = useState(() => (Math.random() * 1e9) | 0)

  // Прописи (RU/EN handwriting) state
  const [pSource, setPSource] = useState('alphabet') // 'alphabet' | 'custom'
  const [pPreset, setPPreset] = useState('lower')    // 'lower' | 'upper' | 'both'
  const [pCustom, setPCustom] = useState('')
  const [xHeight, setXHeight] = useState(9)          // mm
  const [practiceLines, setPracticeLines] = useState(2)
  const [pTrace, setPTrace] = useState(3)
  const [slant, setSlant] = useState(true)
  const [pFont, setPFont] = useState('cursive')
  const [showModel, setShowModel] = useState(true)

  const isJp = lang === 'jp'

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

  // Прописи has no Test mode — fall back to Practice when leaving kanji.
  useEffect(() => { if (!isJp && mode === 'test') setMode('practice') }, [isJp, mode])

  // Keep the browser tab title in sync with the chosen language.
  useEffect(() => {
    document.title = isJp
      ? 'Kanji Sheets · printable Jōyō practice grids'
      : lang === 'ru'
        ? 'Прописи · Russian handwriting practice sheets'
        : 'Handwriting Sheets · English practice lines'
  }, [isJp, lang])

  // Practice items for прописи: alphabet preset or the user's own text.
  const propisiItems = useMemo(() => {
    if (isJp) return []
    return pSource === 'alphabet' ? alphabetItems(lang, pPreset) : textItems(pCustom)
  }, [isJp, lang, pSource, pPreset, pCustom])

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
    ? testSample.map((k) => ({ k: k.c, label: k.m?.[0] || '', group: null }))
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
    answerStyle, pageFormat, blankPages: vPages, onePage,
    title: mode === 'blank' ? 'Kanji practice — genkouyoushi'
      : `${mode === 'test' ? 'Kanji test' : 'Jōyō kanji'} — ${setName}`,
  })

  // Прописи coerced values + options.
  const vPLines = Math.max(0, int(practiceLines, 2))
  const vPTrace = Math.max(0, int(pTrace, 3))
  // Header is drawn in Helvetica (a standard PDF font with no Cyrillic), so the
  // title stays ASCII to avoid mojibake.
  const propisiOpts = (onePage) => ({
    mode: mode === 'blank' ? 'blank' : 'practice',
    items: propisiItems, xHeightMm: xHeight, practiceLines: vPLines, traceCount: vPTrace,
    slant, font: pFont, pageFormat, blankPages: vPages, onePage, showModel,
    title: lang === 'ru'
      ? `Propisi / handwriting practice — Russian`
      : `Handwriting practice — English`,
  })

  // Unified document builder + "is there anything to render" guard.
  const hasContent = isJp
    ? (mode === 'blank' || runs.length > 0)
    : (mode === 'blank' || propisiItems.length > 0)
  const buildDoc = (onePage) =>
    isJp ? buildSheet(opts(onePage)) : buildPropisi(propisiOpts(onePage))

  // Debounced live preview (full document — all pages are scrollable in the frame).
  useEffect(() => {
    if (!hasContent) { setUrl(null); return }
    let cancelled = false
    setBusy(true)
    const t = setTimeout(async () => {
      try {
        const doc = await buildDoc(false)
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
  }, [lang, mode, source, grade, jlpt, custom, from, to, count, seed, answerStyle, boxes, traceCount, font, boxMm, guides, diagonals, showMeaning, markGrade, pageFormat, blankPages, selected.length,
      pSource, pPreset, pCustom, xHeight, practiceLines, pTrace, slant, pFont, showModel, propisiItems.length])

  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current) }, [])

  const download = async () => {
    const doc = await buildDoc(false)
    if (!isJp) {
      const tag = mode === 'blank' ? 'blank' : (pSource === 'alphabet' ? pPreset : 'custom')
      doc.save(`propisi-${lang}-${tag}.pdf`)
      return
    }
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

  const canDownload = hasContent
  // First kanji of the current set, for the on-screen font comparison strip.
  const previewKanji = isJp && mode !== 'blank'
    ? ((mode === 'test' ? testSample[0]?.c : sliced[0]?.c) || selected[0]?.c || null)
    : null

  return (
    <div className="page">
      <header className="masthead">
        <div className="brand">
          <span className="brand-mark">{isJp ? '字' : 'Aa'}</span>
          <div>
            <h1>{isJp ? 'Kanji Sheets' : 'Practice Sheets'}</h1>
            <p>{isJp
              ? <>Printable genkōyōshi practice grids for the <strong>2,136 Jōyō kanji</strong></>
              : lang === 'ru'
                ? <>Printable <strong>прописи</strong> — Russian cursive &amp; print handwriting lines</>
                : <>Printable <strong>handwriting</strong> practice lines — English cursive &amp; print</>}</p>
          </div>
        </div>
      </header>

      <main className="layout">
        {/* ── Controls ── */}
        <section className="panel">
          <div className="seg seg-lang">
            {LANGS.map((l) => (
              <button key={l.v} className={lang === l.v ? 'on' : ''} onClick={() => setLang(l.v)}>{l.label}</button>
            ))}
          </div>

          <div className="seg">
            <button className={mode === 'practice' ? 'on' : ''} onClick={() => setMode('practice')}>Practice</button>
            {isJp && <button className={mode === 'test' ? 'on' : ''} onClick={() => setMode('test')}>Test</button>}
            <button className={mode === 'blank' ? 'on' : ''} onClick={() => setMode('blank')}>Blank</button>
          </div>

          {/* ── Прописи controls (RU/EN) ── */}
          {!isJp && mode !== 'blank' && (
            <>
              <div className="seg seg-sub">
                <button className={pSource === 'alphabet' ? 'on' : ''} onClick={() => setPSource('alphabet')}>Alphabet</button>
                <button className={pSource === 'custom' ? 'on' : ''} onClick={() => setPSource('custom')}>Custom text</button>
              </div>

              {pSource === 'alphabet' && (
                <div className="chips">
                  {PRESETS.map((p) => (
                    <button key={p.v} className={pPreset === p.v ? 'on' : ''} onClick={() => setPPreset(p.v)}>{p.label}</button>
                  ))}
                </div>
              )}
              {pSource === 'custom' && (
                <textarea className="field area" value={pCustom} rows={3}
                  onChange={(e) => setPCustom(e.target.value)}
                  placeholder={lang === 'ru' ? 'Слова или строки, напр.\nмама\nРодина' : 'Words or lines, e.g.\napple\nThe quick brown fox'} />
              )}

              <div className="setinfo">
                <strong>{propisiItems.length.toLocaleString()}</strong> {propisiItems.length === 1 ? 'item' : 'items'} · each gets a model line + {vPLines} blank {vPLines === 1 ? 'line' : 'lines'}
              </div>

              <hr className="rule" />

              <div className="row">
                <label className="field-l"><span>Trace copies</span>
                  <input type="number" min="0" max="20" value={pTrace} {...num(setPTrace, { min: 0, max: 20 })} />
                </label>
                <label className="field-l"><span>Blank lines / item</span>
                  <input type="number" min="0" max="20" value={practiceLines} {...num(setPracticeLines, { min: 0, max: 20 })} />
                </label>
              </div>

              <label className="field-l"><span>Letter style</span>
                <select value={pFont} onChange={(e) => setPFont(e.target.value)}>
                  {PROPISI_FONTS.map((f) => <option key={f.v} value={f.v}>{f.label}</option>)}
                </select>
              </label>

              <label className="check"><input type="checkbox" checked={showModel} onChange={(e) => setShowModel(e.target.checked)} /> Bold first model (lighter to trace if off)</label>
            </>
          )}

          {/* ── Kanji controls (JP) ── */}
          {isJp && mode !== 'blank' && (
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
              ) : null}

              <label className="field-l"><span>{mode === 'test' ? 'Answer-key font' : 'Model font'}</span>
                <select value={font} onChange={(e) => setFont(e.target.value)}>
                  {FONTS.map((f) => <option key={f.v} value={f.v}>{f.label}</option>)}
                </select>
              </label>
              {isJp && (
                <label className="check"><input type="checkbox" checked={compareFonts} onChange={(e) => setCompareFonts(e.target.checked)} /> Compare this kanji across all fonts (on-screen)</label>
              )}

              {mode === 'practice' ? (
                <>
                  <label className="check"><input type="checkbox" checked={showMeaning} onChange={(e) => setShowMeaning(e.target.checked)} /> Show meaning above each kanji</label>
                  <label className="check"><input type="checkbox" checked={markGrade} onChange={(e) => setMarkGrade(e.target.checked)} /> Mark where a new grade starts</label>
                </>
              ) : (
                <label className="field-l"><span>Answer key</span>
                  <select value={answerStyle} onChange={(e) => setAnswerStyle(e.target.value)}>
                    {ANSWER_STYLES.map((a) => <option key={a.v} value={a.v}>{a.label}</option>)}
                  </select>
                </label>
              )}
            </>
          )}

          {mode === 'blank' && (
            <label className="field-l"><span>Pages</span>
              <input type="number" min="1" max="50" value={blankPages} {...num(setBlankPages, { min: 1, max: 50 })} />
            </label>
          )}

          <hr className="rule" />

          {isJp ? (
            <>
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
            </>
          ) : (
            <>
              <label className="field-l"><span>Line height — {xHeight} mm</span>
                <input type="range" min="5" max="16" value={xHeight} onChange={(e) => setXHeight(Number(e.target.value))} />
              </label>
              <label className="field-l"><span>Page size</span>
                <select value={pageFormat} onChange={(e) => setPageFormat(e.target.value)}>
                  {PAGES.map((p) => <option key={p.v} value={p.v}>{p.label}</option>)}
                </select>
              </label>
              <label className="check"><input type="checkbox" checked={slant} onChange={(e) => setSlant(e.target.checked)} /> Slant guides (наклонная)</label>
            </>
          )}

          <button className="download" onClick={download} disabled={!canDownload}>↓ Download PDF</button>
        </section>

        {/* ── Preview ── */}
        <section className="previewcol">
          {compareFonts && previewKanji && (
            <div className="fontcompare">
              {FONTS.map((f) => (
                <div className="fc-cell" key={f.v}>
                  <span className="fc-glyph" style={{ fontFamily: FONT_FAMILY[f.v] }}>{previewKanji}</span>
                  <span className="fc-name">{f.label.replace(/\s*\(.*\)/, '')}</span>
                </div>
              ))}
            </div>
          )}
          <div className="preview-head">Preview <span className={`dot${busy ? ' busy' : ''}`} /></div>
          <div className="preview">
            {url
              ? <iframe title="PDF preview" src={`${url}#toolbar=0&navpanes=0&view=FitH`} />
              : <div className="preview-empty">{mode === 'blank' ? 'Your blank sheet will appear here.'
                  : isJp ? 'Pick a grade, JLPT level, or type kanji.'
                  : 'Pick an alphabet or type words to practise.'}</div>}
          </div>
        </section>
      </main>

      <footer className="foot">
        {isJp ? (
          <>
            <span>{KANJI.length.toLocaleString()} Jōyō kanji · ordered by MEXT school grade, then corpus frequency, then stroke count.</span>
            <span>
              Free &amp; open data: the official <a href="https://en.wikipedia.org/wiki/J%C5%8Dy%C5%8D_kanji" target="_blank" rel="noreferrer">Jōyō kanji</a> list,
              with grades/strokes/readings/meanings from <a href="https://www.edrdg.org/wiki/index.php/KANJIDIC_Project" target="_blank" rel="noreferrer">KANJIDIC</a> (EDRDG),
              aggregated by <a href="https://github.com/davidluzgouveia/kanji-data" target="_blank" rel="noreferrer">davidluzgouveia/kanji-data</a> — licensed <strong>CC BY-SA 4.0</strong>.
              Built locally via <code>scripts/build-data.mjs</code>. Fonts (all OFL): Klee One, Yuji Syuku, Zen Kaku Gothic, Shippori Mincho, Zen Maru Gothic.
            </span>
          </>
        ) : (
          <>
            <span>
              {lang === 'ru' ? 'Прописи' : 'Handwriting'} · four-line ruling (ascender / x-height / baseline / descender)
              with an optional slant guide{lang === 'ru' ? ' (наклонная)' : ''} for {lang === 'ru' ? 'Cyrillic' : 'Latin'} cursive &amp; print.
            </span>
            <span>Fonts (all OFL): Marck Script (курсив), Pangolin (печатные), Caveat.</span>
          </>
        )}
      </footer>
    </div>
  )
}
