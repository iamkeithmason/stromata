/**
 * concept-pilot.mjs — validation pilot for bottom-up concept extraction.
 *
 * Question it answers: across ~20 deliberately diverse texts, does automated
 * extraction surface recurring ideas that the curated Themes do not already
 * give a reader? Nothing here touches the database's content, the public site,
 * or the Themes. Output is local files for an editor to read.
 *
 * METERS (CLAUDE.md "Supabase limits"):
 *   - Supabase egress: `select` reads metadata only (no bodies). `extract`
 *     reads the body of the ~20 sampled texts once, ~0.5-1 MB in total, and
 *     keeps them out of the output files (sections are re-cut from the body
 *     each run; only concepts + verbatim evidence are stored).
 *   - Anthropic tokens: `extract` makes one call per ~1,500-word section,
 *     ~20 texts x ~4 sections ~ 80 calls, ~150k input tokens in total.
 *   - Log Query: none.
 *
 * Usage:
 *   node scripts/concept-pilot.mjs select [--n=20]            # print the sample, write sample.json
 *   node scripts/concept-pilot.mjs extract [--slug=a,b] [--force]   # needs ANTHROPIC_API_KEY
 *   node scripts/concept-pilot.mjs report                     # analysis.json + REPORT.md from extractions
 *
 * Files live in data/concept-pilot/ (gitignored). Re-runs skip texts already
 * extracted unless --force.
 */
import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { selectSample, chunkSections, normaliseConcepts, analyse } from './lib/concept-pilot.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(root, '.env.local'), override: false })
const dir = path.join(root, 'data', 'concept-pilot')
const file = n => path.join(dir, n)
const read = n => (fs.existsSync(file(n)) ? JSON.parse(fs.readFileSync(file(n), 'utf8')) : null)
const write = (n, v) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file(n), JSON.stringify(v, null, 2)) }

const [cmd = 'select', ...rest] = process.argv.slice(2)
const flag = (k, d) => (rest.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1] ?? d
const has = k => rest.includes(`--${k}`)

const MODEL = process.env.CONCEPT_MODEL || 'claude-opus-4-7'
const SYSTEM = `You are reading one section of a public-domain Christian theological text for an editor
who is testing whether bottom-up concept extraction reveals useful recurring ideas.

Propose the GRANULAR concepts this section actually develops — specific enough to be a useful
"see also" route between texts (e.g. "tears of compunction", "the two ways", "spiritual friendship"),
not broad categories (not "prayer", "God", "love", "salvation"). Prefer the author's own idea over
a modern label. Propose between 0 and 6; return fewer, or none, rather than pad.

For each concept give:
  label    2-5 words, lower-case, noun phrase
  gloss    one sentence saying what the section says about it
  evidence a VERBATIM quotation of 6-40 words copied exactly from the section

Reply with JSON only: {"concepts":[{"label":"","gloss":"","evidence":""}]}`

async function selectCmd() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const { data, error } = await supabase
    .from('texts')
    .select('id, slug, title, word_count, genre:genres(name), author:authors(name, era:eras(slug), tradition:traditions(slug)), text_themes(theme:themes(slug))')
    .eq('published', true)
  if (error) throw new Error(error.message)
  const rows = data.map(t => ({
    id: t.id, slug: t.slug, title: t.title, word_count: t.word_count,
    genre: t.genre?.name ?? null, author: t.author?.name ?? null,
    era: t.author?.era?.slug ?? null, tradition: t.author?.tradition?.slug ?? null,
    themes: (t.text_themes ?? []).map(x => x.theme?.slug).filter(Boolean),
  }))
  const sample = selectSample(rows, { n: Number(flag('n', 20)) })
  write('sample.json', sample)
  console.log(`${rows.length} published texts → sample of ${sample.length} (written to data/concept-pilot/sample.json)\n`)
  for (const s of sample) console.log(`  ${s.slug.padEnd(48)} ${String(s.word_count).padStart(6)}w  ${[s.era, s.tradition, s.genre].join(' · ')}`)
  const count = k => new Set(sample.map(s => s[k])).size
  console.log(`\nspread: ${count('era')} eras, ${count('tradition')} traditions, ${count('genre')} genres, ${count('author')} authors`)
}

async function extractCmd() {
  const sample = read('sample.json')
  if (!sample) throw new Error('No sample.json — run `select` first.')
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set; extract calls the Claude API.')
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const only = flag('slug', '') ? flag('slug', '').split(',') : null
  const done = read('extractions.json') ?? []
  const bySlug = new Map(done.map(e => [e.slug, e]))

  for (const s of sample) {
    if (only && !only.includes(s.slug)) continue
    if (bySlug.has(s.slug) && !has('force')) { console.log(`skip  ${s.slug} (already extracted)`); continue }
    const { data, error } = await supabase.from('texts').select('body').eq('id', s.id).single()
    if (error) { console.error(`FAIL  ${s.slug}: ${error.message}`); continue }
    const sections = []
    let droppedTotal = 0
    for (const sec of chunkSections(data.body)) {
      const msg = await anthropic.messages.create({
        model: MODEL, max_tokens: 1500, system: SYSTEM,
        messages: [{ role: 'user', content: `Text: ${s.title} — ${s.author}\nSection ${sec.id}:\n\n${sec.text}` }],
      })
      const out = msg.content.filter(b => b.type === 'text').map(b => b.text).join('')
      let raw = null
      try { raw = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1)) } catch { /* counted as zero concepts below */ }
      const { kept, dropped } = normaliseConcepts(raw, sec.text)
      droppedTotal += dropped.length
      sections.push({ id: sec.id, words: sec.words, parsed: raw !== null, concepts: kept, dropped })
    }
    bySlug.set(s.slug, { slug: s.slug, title: s.title, author: s.author, themes: s.themes, model: MODEL, sections })
    write('extractions.json', [...bySlug.values()])
    console.log(`done  ${s.slug}: ${sections.length} sections, ${sections.reduce((n, x) => n + x.concepts.length, 0)} concepts (${droppedTotal} dropped)`)
  }
}

function reportCmd() {
  const ex = read('extractions.json')
  if (!ex?.length) throw new Error('No extractions.json — run `extract` first.')
  const themes = [...new Set(ex.flatMap(e => e.themes))]
  const a = analyse(ex, themes)
  write('analysis.json', a)
  const sections = ex.flatMap(e => e.sections)
  const kept = sections.reduce((n, s) => n + s.concepts.length, 0)
  const dropped = sections.reduce((n, s) => n + s.dropped.length, 0)
  const unparsed = sections.filter(s => !s.parsed).length
  const pct = (x, y) => (y ? `${Math.round((100 * x) / y)}%` : '–')
  const evidenceFor = key => {
    for (const t of ex) for (const s of t.sections) for (const c of s.concepts) if (c.label && key === a.concepts.find(x => x.labels.includes(c.label))?.key) return `${t.slug}/${s.id}: “${c.evidence}”`
    return ''
  }
  const lines = [
    '# Concept extraction pilot — report', '',
    `${ex.length} texts, ${sections.length} sections, model \`${ex[0].model}\`.`, '',
    '## Numbers to judge by', '',
    `- Concepts kept: ${kept}; dropped for unverifiable evidence or incompleteness: ${dropped} (${pct(dropped, kept + dropped)}); sections whose reply did not parse: ${unparsed}`,
    `- Distinct concepts: ${a.totalConcepts}; recurring across ≥2 texts: ${a.recurring} (${pct(a.recurring, a.totalConcepts)}); singletons: ${a.singleton} (${pct(a.singleton, a.totalConcepts)})`,
    `- Overlap with the curated Themes (label contains a theme's words): ${a.themeOverlap}; not covered by any Theme: ${a.novel}`,
    `- Near-duplicate label pairs (same idea, two names): ${a.duplicatePairs}`, '',
    '## Recurring concepts (the discovery routes, if any)', '',
    ...a.concepts.filter(c => c.textCount >= 2).map(c => `- **${c.labels[0]}** — ${c.textCount} texts (${c.texts.join(', ')})${c.themeOverlap ? ` · ≈ Theme \`${c.themeOverlap}\`` : ' · no Theme'}\n  - ${evidenceFor(c.key)}`),
    '', '## Near-duplicates', '',
    ...(a.duplicates.length ? a.duplicates.map(d => `- ${d.a} ≈ ${d.b} (${d.sim})`) : ['- none']),
    '', '## How to read this', '',
    'Continue only if the recurring list shows cross-text routes the Themes do not already give, with low duplicate and unverifiable-evidence rates. A long singleton tail is expected and is not itself a failure; a recurring list that is only the Themes under other names is.', '',
  ]
  fs.writeFileSync(file('REPORT.md'), lines.join('\n'))
  console.log(lines.slice(0, 11).join('\n'))
  console.log('\nfull report: data/concept-pilot/REPORT.md')
}

try {
  if (cmd === 'select') await selectCmd()
  else if (cmd === 'extract') await extractCmd()
  else if (cmd === 'report') reportCmd()
  else throw new Error(`unknown command "${cmd}" (select | extract | report)`)
} catch (e) { console.error(e.message); process.exit(1) }
