/**
 * generate-passage-reads.ts — a factual read of each published text, from its body alone.
 *
 * Writes one row per text to `passage_reads` (migration 045). The prompt, the reply schema and the
 * checks live in scripts/lib/passage-reads.mjs. Rules (Keith, 28 Nov 2026):
 *   - Haiku (PASSAGE_READ_MODEL), ONE text per call.
 *   - The body only: the call sees title, recorded author, genre and current themes, then the body.
 *     Never `editorial_introduction`, `note_draft` or `summary`; they are not even selected.
 *   - Any Scripture reference not printed in the text is dropped automatically (checkRead), and so
 *     is any quotation or name the body cannot back. What was dropped is stored beside the read.
 *
 * Nothing here touches `texts`, publishes anything, or changes how any public page chooses what to
 * show. The table is editorial data; no public route reads it.
 *
 * Meters (CLAUDE.md, "Supabase limits"):
 *   - Egress: each text's body is read once, one at a time. The full library is ~30 MB of bodies,
 *     about 0.6% of the shared 5 GB cycle. Choosing what to read uses passage_read_candidates(),
 *     which hashes bodies inside the database, so a re-run downloads only new or changed texts.
 *   - Storage: ~3-4 KB of JSON per text, about 2 MB for the library.
 *   - Anthropic: the library is ~5.6M words, ~7.5M input tokens. On Haiku 5.5 list prices that is
 *     roughly $1-2 for the whole library; the script prints the measured figure as it goes.
 *
 * Usage:
 *   npx tsx scripts/generate-passage-reads.ts --dry-run              # what would be read, and the estimate
 *   npx tsx scripts/generate-passage-reads.ts --limit=10             # read the next 10 unread texts
 *   npx tsx scripts/generate-passage-reads.ts --slug=a,b,c           # read these texts
 *   npx tsx scripts/generate-passage-reads.ts                        # every unread or changed text
 *   npx tsx scripts/generate-passage-reads.ts --force                # re-read even when unchanged
 *   npx tsx scripts/generate-passage-reads.ts --report=out.md        # also write the reads as markdown
 *
 * Texts over SECTION_THRESHOLD_WORDS (10,000) also get one call per ~5,000-word section: a summary,
 * one to three themes, up to three free topics (for theme_proposals, never `themes`) and checked
 * Scripture, stored in passage_reads.section_reads (migration 046) and rolled up as read.theme_rollup.
 *
 * Without an API key (a cloud session), split the call out and have any Haiku answer it:
 *   --export=<dir>    write <slug>.prompt.json (system, user, schema) for each chosen text; no call
 *   --answers=<dir>   read <slug>.reply.json (the model's JSON) for each chosen text, check, write
 *   --sections        section reads only, for long texts already read whole (no whole-text re-read)
 *   --recheck         re-apply the Scripture check to stored drops (no API call); with --dry-run, report only
 * The same checks run either way.
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (.env.local or the environment), and
 * ANTHROPIC_API_KEY for a direct run. In a cloud session add NODE_USE_ENV_PROXY=1.
 */

import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

import { parseReferences } from '../lib/scripture'
import { ALL_THEMES } from '../lib/pipeline/vocab'
import {
  PASSAGE_READ_MODEL,
  SECTION_THRESHOLD_WORDS,
  checkRead,
  checkSection,
  rollUpThemes,
  sectionPromptFor,
  sectionSchema,
  sectionSystemPrompt,
  splitSections,
  costOf,
  parseReply,
  promptFor,
  readSchema,
  systemPrompt,
} from './lib/passage-reads.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(here, '..', '.env.local') })

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=')
const flag = (name: string) => process.argv.includes(`--${name}`)

const dryRun = flag('dry-run')
const force = flag('force')
const limit = arg('limit') ? Number(arg('limit')) : Infinity
const slugs = arg('slug')?.split(',').map((s) => s.trim()).filter(Boolean)
const exportDir = arg('export')
const answersDir = arg('answers')
const reportPath = arg('report')
const recheck = flag('recheck')
const sectionsOnly = flag('sections')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}
const db = createClient(url, key)

const themes = [...ALL_THEMES].sort()
const system = systemPrompt(themes)
const schema = readSchema(themes)
const sectionSystem = sectionSystemPrompt(themes)
const secSchema = sectionSchema(themes)
const wordCount = (s: string) => (s.match(/\S+/g) ?? []).length

interface Candidate { id: string; slug: string; body_md5: string }
interface TextRow {
  id: string
  slug: string
  title: string
  body: string
  authors: { name: string } | null
  genres: { name: string } | null
  text_themes: { themes: { slug: string } | null }[]
}

async function candidates(): Promise<Candidate[]> {
  const { data, error } = await db.rpc('passage_read_candidates')
  if (error) throw new Error(`passage_read_candidates: ${error.message}`)
  const all = data as Candidate[]
  const { data: existing, error: e2 } = await db.from('passage_reads').select('text_id, body_md5')
  if (e2) throw new Error(`passage_reads: ${e2.message}`)
  const done = new Map((existing ?? []).map((r) => [r.text_id as string, r.body_md5 as string]))
  let list = all
  if (slugs) {
    const want = new Set(slugs)
    list = all.filter((c) => want.has(c.slug))
    const missing = slugs.filter((s) => !list.some((c) => c.slug === s))
    if (missing.length) console.warn(`Not published or not found: ${missing.join(', ')}`)
  }
  if (!force && !answersDir) list = list.filter((c) => done.get(c.id) !== c.body_md5)
  return list.slice(0, limit)
}

async function loadText(id: string): Promise<TextRow> {
  // Body and catalogue fields only: never editorial_introduction, note_draft or summary.
  const { data, error } = await db
    .from('texts')
    .select('id, slug, title, body, authors(name), genres(name), text_themes(themes(slug))')
    .eq('id', id)
    .single()
  if (error) throw new Error(`text ${id}: ${error.message}`)
  return data as unknown as TextRow
}

function promptText(t: TextRow) {
  return promptFor({
    title: t.title,
    author: t.authors?.name ?? null,
    genre: t.genres?.name ?? null,
    themes: t.text_themes.map((x) => x.themes?.slug).filter(Boolean),
    body: t.body ?? '',
  })
}

let anthropic: Anthropic | null = null
async function callHaiku(user: string, sys = system, sch: object = schema, maxTokens = 16000) {
  anthropic ??= new Anthropic()
  const stream = anthropic.messages.stream({
    model: PASSAGE_READ_MODEL,
    max_tokens: maxTokens,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: sch } },
    system: sys,
    messages: [{ role: 'user', content: user }],
  } as Anthropic.MessageStreamParams)
  const msg = await stream.finalMessage()
  if (msg.stop_reason === 'refusal') throw new Error('refused')
  if (msg.stop_reason === 'max_tokens') throw new Error('reply cut off at max_tokens')
  const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
  return { reply: parseReply(text), inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens }
}

/**
 * Section reads for one long text: one call per section, each checked against its own words.
 * With --export it writes <slug>.s<N>.prompt.json and returns null; with --answers it reads
 * <slug>.s<N>.reply.json. A section that fails is reported and left out; the rest still count.
 */
async function readSections(t: TextRow) {
  const parts = splitSections(t.body ?? '')
  const out: any[] = []
  const dropped: any[] = []
  let inTok = 0
  let outTok = 0
  let failed = 0
  for (let i = 0; i < parts.length; i++) {
    const user = sectionPromptFor({ title: t.title, author: t.authors?.name ?? null }, parts[i], i, parts.length)
    const tag = `${t.slug}.s${i + 1}`
    if (exportDir) {
      fs.writeFileSync(path.join(exportDir, `${tag}.prompt.json`), JSON.stringify({ model: PASSAGE_READ_MODEL, system: sectionSystem, user, schema: secSchema }, null, 2))
      continue
    }
    let reply: unknown
    try {
      if (answersDir) {
        const file = path.join(answersDir, `${tag}.reply.json`)
        if (!fs.existsSync(file)) { console.warn(`    ${tag}: no reply file, skipped`); failed++; continue }
        reply = parseReply(fs.readFileSync(file, 'utf8'))
      } else {
        const r = await callHaiku(user, sectionSystem, secSchema, 4000)
        reply = r.reply
        inTok += r.inputTokens
        outTok += r.outputTokens
      }
    } catch (e) {
      failed++
      console.error(`    ${tag}: ${(e as Error).message}`)
      continue
    }
    const r = checkSection(reply, { section: parts[i], bodyRefs: parseReferences(parts[i].body), parseRefs: parseReferences, themes })
    if (!r.section) { failed++; console.error(`    ${tag}: unusable reply`); continue }
    out.push(r.section)
    dropped.push(...r.dropped)
  }
  if (exportDir) { console.log(`    exported ${parts.length} section prompt(s)`); return null }
  return { sections: out, dropped, inTok, outTok, failed, count: parts.length }
}

function reportFor(t: TextRow, read: any, dropped: any[], sections?: any[] | null) {
  const list = (xs: string[]) => (xs.length ? xs.join('; ') : 'none')
  const lines = [
    `### ${t.title} (${t.authors?.name ?? 'no author'}) · \`${t.slug}\``,
    '',
    `- **Form:** ${read.form || 'none'} · **Period:** ${read.period || 'none'}`,
    `- **Summary:** ${read.summary || 'none'}`,
    `- **Argument:** ${read.argument}`,
    `- **People:** ${list((read.people ?? []).map((p: any) => `${p.name} (${p.role}, ${p.basis})`))}`,
    `- **Works:** ${list((read.works ?? []).map((w: any) => `${w.title} (${w.relation})`))}`,
    `- **Themes (the text's centre):** ${list(read.themes ?? [])}`,
    `- **Questions:** ${list(read.questions)}`,
    `- **Moves:** ${list(read.moves)}`,
    `- **Named:** ${list(read.named)}`,
    `- **Scripture cited:** ${list(read.scripture_cited.map((s: any) => s.ref))}`,
    `- **Scripture uncited:** ${list(read.scripture_uncited.map((s: any) => `${s.ref} ("${s.quote}")`))}`,
    `- **Key terms:** ${list(read.key_terms)}`,
    `- **Quotable:** ${list(read.quotable.map((q: string) => `"${q}"`))}`,
    `- **Flags:** ${list(read.flags.map((f: any) => `${f.kind}: ${f.note}`))}`,
    `- **Theme check:** fits ${list(read.theme_check.fits)} · weak ${list(read.theme_check.weak)} · suggested ${list(read.theme_check.suggested)} · gaps ${list(read.theme_check.gaps)}`,
    `- **Dropped by the check (${dropped.length}):** ${list(dropped.map((d) => `${d.field} ${d.value} (${d.reason})`))}`,
    '',
  ]
  if (sections?.length) {
    lines.push(`**Sections (${sections.length}).** Rolled up: ${list((read.theme_rollup ?? []).map((r: any) => `${r.theme} ${Math.round(r.share * 100)}%`))}`, '')
    for (const sec of sections) {
      lines.push(`- *${sec.label}* (${sec.words.toLocaleString()} words): ${sec.summary} Themes: ${list(sec.themes)}. Topics: ${list(sec.topics)}. Scripture: ${list(sec.scripture_cited.map((x: any) => x.ref))}.`)
    }
    lines.push('')
  }
  return lines.join('\n')
}


/**
 * --recheck: re-apply the Scripture check to references an earlier version dropped, with no API
 * call. Added for the Vulgate Psalm numbers ("Psalm 77:34") the parser rejects. Reads the body only
 * of texts that have dropped Scripture. With --dry-run it reports and writes nothing.
 */
async function recheckStored() {
  const { data, error } = await db.from('passage_reads').select('text_id, read, dropped, texts(slug)')
  if (error) throw new Error(error.message)
  const rows = (data ?? []).filter((r: any) => (r.dropped as any[]).some((d) => String(d.field).startsWith('scripture'))
    && (!slugs || slugs.includes(r.texts?.slug)))
  let readmitted = 0
  let touched = 0
  for (const row of rows as any[]) {
    const t = await loadText(row.text_id)
    // Whole-text drops only; a section's drops carry `section` and are re-read with that section.
    const scripture = (row.dropped as any[]).filter((d) => String(d.field).startsWith('scripture') && !d.section)
    const others = (row.dropped as any[]).filter((d) => !String(d.field).startsWith('scripture') || d.section)
    const cited = scripture.filter((d) => d.field === 'scripture_cited').map((d) => ({ ref: d.value }))
    const uncited = scripture.filter((d) => d.field === 'scripture_uncited').map((d) => {
      const m = String(d.value).match(/^(.*?): "([\s\S]*)"$/)
      return m ? { ref: m[1], quote: m[2] } : { ref: d.value, quote: '' }
    })
    const { read: again, dropped: still } = checkRead(
      { argument: 'recheck', scripture_cited: cited, scripture_uncited: uncited },
      { body: t.body ?? '', bodyRefs: parseReferences(t.body ?? ''), parseRefs: parseReferences, themes },
    )
    const back = again!.scripture_cited.length + again!.scripture_uncited.length
    if (!back) continue
    touched++
    readmitted += back
    console.log(`  ${t.slug}: ${back} re-admitted (${[...again!.scripture_cited, ...again!.scripture_uncited].map((x: any) => x.ref).join(', ')})`)
    if (dryRun) continue
    const read = { ...row.read }
    read.scripture_cited = [...read.scripture_cited, ...again!.scripture_cited]
    read.scripture_uncited = [...read.scripture_uncited, ...again!.scripture_uncited]
    const { error: e } = await db.from('passage_reads')
      .update({ read, dropped: [...others, ...still], updated_at: new Date().toISOString() })
      .eq('text_id', row.text_id)
    if (e) console.error(`  ${t.slug}: write failed: ${e.message}`)
  }
  console.log(`\n${readmitted} reference(s) re-admitted across ${touched} text(s)${dryRun ? ' (dry run, nothing written)' : ''}.`)
}

/**
 * --sections: add section reads to long texts that already have a whole-text read, without reading
 * them whole again. Skips texts that already have section reads unless --force.
 */
async function sectionsForStored() {
  const { data, error } = await db.from('passage_reads').select('text_id, read, dropped, section_reads, input_tokens, output_tokens, texts!inner(slug, word_count, published)')
    .gt('texts.word_count', SECTION_THRESHOLD_WORDS)
  if (error) throw new Error(error.message)
  let rows = (data ?? []) as any[]
  if (slugs) rows = rows.filter((r) => slugs.includes(r.texts.slug))
  if (!force) rows = rows.filter((r) => !r.section_reads)
  rows = rows.slice(0, limit)
  console.log(`${rows.length} long text(s) to read by section.`)
  if (exportDir) fs.mkdirSync(exportDir, { recursive: true })
  const report: string[] = []
  let spentIn = 0
  let spentOut = 0
  for (const row of rows) {
    const t = await loadText(row.text_id)
    console.log(`  ${t.slug}`)
    const sr = await readSections(t)
    if (!sr) continue
    spentIn += sr.inTok
    spentOut += sr.outTok
    const read = { ...row.read, theme_rollup: rollUpThemes(sr.sections) }
    const kept = (row.dropped as any[]).filter((d) => !d.section)
    const { error: e } = await db.from('passage_reads').update({
      read,
      dropped: [...kept, ...sr.dropped],
      section_reads: sr.sections,
      input_tokens: (row.input_tokens ?? 0) + sr.inTok || null,
      output_tokens: (row.output_tokens ?? 0) + sr.outTok || null,
      updated_at: new Date().toISOString(),
    }).eq('text_id', row.text_id)
    if (e) { console.error(`    write failed: ${e.message}`); continue }
    report.push(reportFor(t, read, [...kept, ...sr.dropped], sr.sections))
    console.log(`    ${sr.sections.length} of ${sr.count} sections read${sr.inTok ? ` · $${costOf(sr.inTok, sr.outTok).toFixed(4)}` : ''}`)
  }
  if (reportPath && report.length) fs.writeFileSync(reportPath, report.join('\n'))
  if (spentIn) console.log(`\nTokens: ${spentIn.toLocaleString()} in, ${spentOut.toLocaleString()} out · $${costOf(spentIn, spentOut).toFixed(2)} on ${PASSAGE_READ_MODEL}.`)
}

async function main() {
  if (recheck) return recheckStored()
  if (sectionsOnly && !dryRun) return sectionsForStored()
  const todo = await candidates()
  console.log(`${todo.length} text(s) to read${force ? ' (forced)' : ''}.`)

  if (dryRun) {
    const ids = todo.map((c) => c.id)
    let words = 0
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await db.from('texts').select('word_count').in('id', ids.slice(i, i + 200))
      words += (data ?? []).reduce((n, r) => n + (r.word_count ?? 0), 0)
    }
    let longWords = 0
    let sectionCount = 0
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await db.from('texts').select('word_count').in('id', ids.slice(i, i + 200)).gt('word_count', SECTION_THRESHOLD_WORDS)
      for (const r of data ?? []) { longWords += r.word_count ?? 0; sectionCount += Math.ceil((r.word_count ?? 0) / 5000) }
    }
    if (sectionsOnly) words = 0
    const inTok = Math.round(words * 1.35 + (sectionsOnly ? 0 : todo.length * 1200) + longWords * 1.35 + sectionCount * 900)
    const outTok = (sectionsOnly ? 0 : todo.length * 1500) + sectionCount * 500
    console.log(`${sectionCount} section read(s) across the long texts (${longWords.toLocaleString()} words over ${SECTION_THRESHOLD_WORDS.toLocaleString()}-word texts).`)
    console.log(`About ${words.toLocaleString()} words, ~${inTok.toLocaleString()} input and ~${outTok.toLocaleString()} output tokens.`)
    console.log(`Estimated cost on ${PASSAGE_READ_MODEL}: $${costOf(inTok, outTok).toFixed(2)} (list prices; thinking tokens add to output).`)
    for (const c of todo.slice(0, 20)) console.log(`  ${c.slug}`)
    if (todo.length > 20) console.log(`  … and ${todo.length - 20} more`)
    return
  }

  if (exportDir) fs.mkdirSync(exportDir, { recursive: true })
  const report: string[] = []
  let spentIn = 0
  let spentOut = 0
  let written = 0
  let failed = 0

  for (const c of todo) {
    const t = await loadText(c.id)
    const user = promptText(t)

    if (exportDir) {
      fs.writeFileSync(path.join(exportDir, `${t.slug}.prompt.json`), JSON.stringify({ model: PASSAGE_READ_MODEL, system, user, schema }, null, 2))
      console.log(`  exported ${t.slug}`)
      if (wordCount(t.body ?? '') > SECTION_THRESHOLD_WORDS) await readSections(t)
      continue
    }

    let reply: unknown
    let inputTokens: number | null = null
    let outputTokens: number | null = null
    try {
      if (answersDir) {
        const file = path.join(answersDir, `${t.slug}.reply.json`)
        if (!fs.existsSync(file)) { console.warn(`  ${t.slug}: no reply file, skipped`); continue }
        reply = parseReply(fs.readFileSync(file, 'utf8'))
      } else {
        const r = await callHaiku(user)
        reply = r.reply
        inputTokens = r.inputTokens
        outputTokens = r.outputTokens
        spentIn += inputTokens
        spentOut += outputTokens
      }
    } catch (e) {
      failed++
      console.error(`  ${t.slug}: ${(e as Error).message}`)
      continue
    }

    const { read, dropped, problems } = checkRead(reply, {
      body: t.body ?? '',
      bodyRefs: parseReferences(t.body ?? ''),
      parseRefs: parseReferences,
      themes,
    })
    if (problems.length || !read) {
      failed++
      console.error(`  ${t.slug}: unusable reply (${problems.join(' ')})`)
      continue
    }

    let sectionReads: any[] | null = null
    if (wordCount(t.body ?? '') > SECTION_THRESHOLD_WORDS) {
      const sr = await readSections(t)
      if (sr) {
        sectionReads = sr.sections
        dropped.push(...sr.dropped)
        ;(read as any).theme_rollup = rollUpThemes(sr.sections)
        spentIn += sr.inTok
        spentOut += sr.outTok
        if (inputTokens != null) { inputTokens += sr.inTok; outputTokens = (outputTokens ?? 0) + sr.outTok }
        if (sr.failed) console.warn(`    ${t.slug}: ${sr.failed} of ${sr.count} section(s) failed`)
      }
    }

    const { error } = await db.from('passage_reads').upsert({
      text_id: t.id,
      read,
      dropped,
      section_reads: sectionReads,
      model: PASSAGE_READ_MODEL,
      body_md5: c.body_md5,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      updated_at: new Date().toISOString(),
    })
    if (error) { failed++; console.error(`  ${t.slug}: write failed: ${error.message}`); continue }
    written++
    report.push(reportFor(t, read, dropped, sectionReads))
    const cost = inputTokens != null ? ` · $${costOf(inputTokens, outputTokens ?? 0).toFixed(4)}` : ''
    console.log(`  read ${t.slug}${sectionReads ? ` (+${sectionReads.length} sections)` : ''} · ${read.scripture_cited.length} cited, ${read.scripture_uncited.length} uncited, ${read.flags.length} flags, ${dropped.length} dropped${cost}`)
  }

  if (reportPath && report.length) fs.writeFileSync(reportPath, report.join('\n'))
  if (!exportDir) {
    console.log(`\nWrote ${written}, failed ${failed}.`)
    if (spentIn) console.log(`Tokens: ${spentIn.toLocaleString()} in, ${spentOut.toLocaleString()} out · $${costOf(spentIn, spentOut).toFixed(2)} on ${PASSAGE_READ_MODEL}.`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
