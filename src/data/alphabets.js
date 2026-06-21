// Alphabet presets for прописи (handwriting) mode.
const RU_UPPER = [...'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ']
const RU_LOWER = [...'абвгдеёжзийклмнопрстуфхцчшщъыьэюя']
const EN_UPPER = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ']
const EN_LOWER = [...'abcdefghijklmnopqrstuvwxyz']

export const ALPHABETS = {
  ru: { upper: RU_UPPER, lower: RU_LOWER },
  en: { upper: EN_UPPER, lower: EN_LOWER },
}

// Build the list of practice items from a preset choice.
//   preset: 'lower' | 'upper' | 'both'
export function alphabetItems(lang, preset) {
  const a = ALPHABETS[lang]
  if (!a) return []
  if (preset === 'upper') return a.upper
  if (preset === 'both') return a.upper.flatMap((u, i) => [u, a.lower[i]])
  return a.lower
}

// Split free text into practice items: each non-empty line, or whitespace-split
// words if the whole thing is one line.
export function textItems(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length > 1) return lines
  return (lines[0] || '').split(/\s+/).filter(Boolean)
}
