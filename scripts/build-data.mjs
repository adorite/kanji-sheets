// Regenerates src/data/joyo.json from the KANJIDIC-derived Jōyō dataset.
//
//   node scripts/build-data.mjs
//
// Output: every one of the 2,136 Jōyō kanji as a lean record, sorted into the
// app's canonical order — by official MEXT school grade (1–6 elementary, then
// grade 8 = secondary school), then by corpus frequency, then stroke count.
// Source: https://github.com/davidluzgouveia/kanji-data (aggregates KANJIDIC,
// EDRDG, CC BY-SA). Requires Node 18+ (global fetch).

import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const SRC = 'https://raw.githubusercontent.com/davidluzgouveia/kanji-data/master/kanji-jouyou.json'
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'joyo.json')

const cleanMeanings = (ms = []) =>
  ms.filter((m) => !/radical/i.test(m)).slice(0, 3).map((m) => m.trim().toLowerCase())

const raw = await (await fetch(SRC)).json()

const rows = Object.entries(raw).map(([c, v]) => ({
  c,
  g: v.grade ?? null,
  s: v.strokes ?? null,
  f: v.freq ?? null,
  j: v.jlpt_new ?? null,
  m: cleanMeanings(v.meanings),
  on: (v.readings_on || []).slice(0, 3),
  kun: (v.readings_kun || []).filter((r) => !r.startsWith('!')).slice(0, 3),
}))

rows.sort((a, b) =>
  (a.g ?? 99) - (b.g ?? 99) ||
  (a.f ?? 1e9) - (b.f ?? 1e9) ||
  (a.s ?? 99) - (b.s ?? 99))
rows.forEach((r, i) => { r.i = i + 1 })

await writeFile(OUT, JSON.stringify(rows))
console.log(`Wrote ${rows.length} kanji → ${OUT}`)
