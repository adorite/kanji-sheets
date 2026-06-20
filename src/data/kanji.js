import JOYO from './joyo.json'

// The 2,136 Jōyō kanji, pre-sorted into a canonical learning order: by official
// MEXT school grade (1–6 elementary, then secondary), then by corpus frequency.
// Each entry: { c, g, s, f, j, m, on, kun, i }
//   c char · g grade (8 = secondary) · s strokes · f frequency rank · j JLPT (5–1)
//   m meanings[] · on/kun readings[] · i 1-based index in this order
export const KANJI = JOYO

const BY_CHAR = new Map(KANJI.map((k) => [k.c, k]))
const IS_KANJI = /[㐀-鿿豈-﫿]/

// Grades present, in order. 8 is the catch-all "taught in secondary school".
export const GRADES = [1, 2, 3, 4, 5, 6, 8]
export const JLPT_LEVELS = [5, 4, 3, 2, 1]

export const gradeName = (g) => (g === 8 ? 'Secondary' : `Grade ${g}`)
export const gradeNameLong = (g) =>
  g == null ? 'Other' : g === 8 ? 'Secondary school' : `Grade ${g} · 小学${g}年`

export function kanjiByGrade(grade) {
  return grade === 'all' ? KANJI : KANJI.filter((k) => k.g === grade)
}

export function kanjiByJlpt(level) {
  return KANJI.filter((k) => k.j === level)
}

// Parse a free-typed string into known Jōyō entries (deduped, original order).
export function kanjiFromText(str) {
  const seen = new Set()
  const out = []
  for (const ch of str || '') {
    if (!IS_KANJI.test(ch) || seen.has(ch)) continue
    seen.add(ch)
    out.push(BY_CHAR.get(ch) || { c: ch, g: null, m: [], on: [], kun: [] })
  }
  return out
}
