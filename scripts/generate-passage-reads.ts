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
 * Without an API key (a cloud session), split the call out and have any Haiku answer it:
 *   --export=<dir>    write <slug>.prompt.json (system, user, schema) for each chosen text; no call
 *   --answers=<dir>   read <slug>.reply.json (the model's JSON) for each chosen text, check, write
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
  checkRead,
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
async function callHaiku(user: string) {
  anthropic ??= new Anthropic()
  const stream = anthropic.messages.stream({
    model: PASSAGE_READ_MODEL,
    max_tokens: 16000,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
    system,
    messages: [{ role: 'user', content: user }],
  } as Anthropic.MessageStreamParams)
  const msg = await stream.finalMessage()
  if (msg.stop_reason === 'refusal') throw new Error('refused')
  if (msg.stop_reason === 'max_tokens') throw new Error('reply cut off at max_tokens')
  const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
  return { reply: parseReply(text), inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens }
}

function reportFor(t: TextRow, read: any, dropped: any[]) {
  const list = (xs: string[]) => (xs.length ? xs.join('; ') : 'none')
  const lines = [
    `### ${t.title} (${t.authors?.name ?? 'no author'}) · \`${t.slug}\``,
    '',
    `- **Argument:** ${read.argument}`,
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
  return lines.join('\n')
}

async function main() {
  const todo = await candidates()
  console.log(`${todo.length} text(s) to read${force ? ' (forced)' : ''}.`)

  if (dryRun) {
    const ids = todo.map((c) => c.id)
    let words = 0
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await db.from('texts').select('word_count').in('id', ids.slice(i, i + 200))
      words += (data ?? []).reduce((n, r) => n + (r.word_count ?? 0), 0)
    }
    const inTok = Math.round(words * 1.35 + todo.length * 1200)
    const outTok = todo.length * 1500
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

    const { error } = await db.from('passage_reads').upsert({
      text_id: t.id,
      read,
      dropped,
      model: PASSAGE_READ_MODEL,
      body_md5: c.body_md5,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      updated_at: new Date().toISOString(),
    })
    if (error) { failed++; console.error(`  ${t.slug}: write failed: ${error.message}`); continue }
    written++
    report.push(reportFor(t, read, dropped))
    const cost = inputTokens != null ? ` · $${costOf(inputTokens, outputTokens ?? 0).toFixed(4)}` : ''
    console.log(`  read ${t.slug} · ${read.scripture_cited.length} cited, ${read.scripture_uncited.length} uncited, ${read.flags.length} flags, ${dropped.length} dropped${cost}`)
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
