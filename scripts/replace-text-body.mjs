#!/usr/bin/env node
/**
 * replace-text-body.mjs — put a cleared translation into an EXISTING texts row.
 *
 * pipeline-import.mjs only inserts, and skips any slug that already exists, so
 * it cannot replace a held text's body in place. This does, keeping the row's
 * id, slug, accession number, author, genre, themes and URL, which is the point:
 * an accession number is permanent and the old URL should come back to life.
 *
 * Input: staged files in scripts/ingestion/output/replacements/<slug>.md, flat
 * frontmatter (scripts/lib/frontmatter.mjs) plus the new body:
 *
 *   target_slug, expected_id, expected_accession   — guards: all three must match
 *   source_url, source_attribution, translation_notes, provenance_notes, review_note
 *   license        — blank for public domain, or a slug in lib/licenses.ts
 *   clear_summary  — true only if the old summary quotes the old translation
 *   summary        — optional replacement summary (≤ 160 characters, the house limit)
 *
 * What it writes: body, the four provenance fields, license, sections → null
 * (editorial sections point into the old body), review_state → 'pending',
 * review_note, and summary → null when clear_summary is true. It refuses a
 * published row and never touches published, editorial_introduction or
 * note_draft (HARD CONSTRAINTS 1–2). word_count is a generated column and
 * follows the body by itself. Stale text_scripture_references rows for the
 * text are deleted and rebuilt from the new body.
 *
 * It does not revalidate: the rows stay unpublished, so no public page shows them.
 *
 * Usage (run under tsx so the scripture parser in lib/scripture can load):
 *   npx tsx scripts/replace-text-body.mjs                 # dry run, every staged file
 *   npx tsx scripts/replace-text-body.mjs --slug=confession
 *   npx tsx scripts/replace-text-body.mjs --apply         # write (needs SUPABASE_SERVICE_ROLE_KEY)
 *   npx tsx scripts/replace-text-body.mjs --sql=out.sql   # write the same change as one guarded
 *                                                         # SQL transaction, for a session with
 *                                                         # only the Supabase MCP connector
 *
 * Meter: reads three rows' bodies at most (old word count) and writes three bodies,
 * well under 1 MB of egress. No log reads.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { parseFrontmatter } from './lib/frontmatter.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
export const STAGING_DIR = path.join(__dirname, 'ingestion', 'output', 'replacements');

const REQUIRED = [
  'target_slug', 'expected_id', 'expected_accession', 'source_url',
  'source_attribution', 'translation_notes', 'provenance_notes', 'review_note',
];

/** Same count as the generated texts.word_count column: whitespace-separated tokens. */
export function wordCount(body) {
  const t = (body ?? '').trim();
  return t ? t.split(/\s+/).length : 0;
}

/** Words in the running text alone, leaving out markdown footnote definitions. */
export function proseWordCount(body) {
  return wordCount((body ?? '').split('\n').filter(l => !/^\[\^[^\]]+\]:/.test(l)).join('\n'));
}

/** Every [^id] marker has one definition and every definition a marker. */
export function checkFootnotes(body) {
  const defs = [...body.matchAll(/^\[\^([^\]]+)\]:/gm)].map(m => m[1]);
  const marks = [...body.matchAll(/\[\^([^\]]+)\](?!:)/g)].map(m => m[1]);
  const problems = [];
  for (const d of new Set(defs)) if (!marks.includes(d)) problems.push(`definition [^${d}] has no marker`);
  for (const m of new Set(marks)) if (!defs.includes(m)) problems.push(`marker [^${m}] has no definition`);
  const dup = defs.filter((d, i) => defs.indexOf(d) !== i);
  for (const d of new Set(dup)) problems.push(`definition [^${d}] appears twice`);
  return { notes: defs.length, problems };
}

/** Parse and validate one staged file into the update it describes. */
export function readStaged(raw, label = 'staged file') {
  const { data, body } = parseFrontmatter(raw);
  for (const k of REQUIRED) {
    if (data[k] === null || data[k] === undefined || data[k] === '') {
      throw new Error(`${label}: frontmatter is missing ${k}`);
    }
  }
  if (!body || body.length < 500) throw new Error(`${label}: body is missing or implausibly short`);
  if (data.summary && data.summary.length > 160) throw new Error(`${label}: summary is over 160 characters`);
  if (data.summary && data.clear_summary === true) throw new Error(`${label}: give summary or clear_summary, not both`);
  const fn = checkFootnotes(body);
  if (fn.problems.length) throw new Error(`${label}: ${fn.problems.join('; ')}`);
  return {
    slug: data.target_slug,
    expectedId: data.expected_id,
    expectedAccession: data.expected_accession,
    clearSummary: data.clear_summary === true,
    summary: data.summary || null,
    fields: {
      body,
      source_url: data.source_url,
      source_attribution: data.source_attribution,
      translation_notes: data.translation_notes,
      provenance_notes: data.provenance_notes,
      license: data.license || null,
      sections: null,
      review_state: 'pending',
      review_note: data.review_note,
    },
    notes: fn.notes,
  };
}

/** A Postgres literal for a string, null or number. Dollar quoting cannot collide. */
export function sqlLiteral(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return String(v);
  let tag = 'q';
  while (String(v).includes(`$${tag}$`)) tag += 'q';
  return `$${tag}$${v}$${tag}$`;
}

/**
 * One transaction per text. The UPDATE's WHERE carries every guard, and the DO
 * block aborts the whole transaction unless exactly one unpublished row matched.
 */
export function buildSql(item, refs = null) {
  const sets = Object.entries(item.fields).map(([k, v]) => `  ${k} = ${sqlLiteral(v)}`);
  if (item.clearSummary) sets.push('  summary = null');
  if (item.summary) sets.push(`  summary = ${sqlLiteral(item.summary)}`);
  const guard = `id = ${sqlLiteral(item.expectedId)} and slug = ${sqlLiteral(item.slug)} ` +
    `and accession_number = ${item.expectedAccession} and published = false`;
  const lines = [
    'begin;',
    'do $guard$ begin',
    `  if (select count(*) from texts where ${guard}) <> 1 then`,
    `    raise exception 'replace-text-body: guard failed for ${item.slug}';`,
    '  end if;',
    'end $guard$;',
    `update texts set\n${sets.join(',\n')}\nwhere ${guard};`,
  ];
  if (refs) {
    lines.push(`delete from text_scripture_references where text_id = ${sqlLiteral(item.expectedId)};`);
    if (refs.length) {
      const values = refs.map(r => `(${[item.expectedId, r.osis, r.book, r.chapter, r.verse_start, r.verse_end, r.raw]
        .map(sqlLiteral).join(', ')})`);
      lines.push('insert into text_scripture_references (text_id, osis, book, chapter, verse_start, verse_end, raw) values\n' +
        values.join(',\n') + '\non conflict (text_id, osis) do nothing;');
    }
  }
  lines.push('commit;');
  return lines.join('\n');
}

/** Scripture rows as backfill-scripture-refs.ts makes them; null when not run under tsx. */
async function loadRefParser() {
  try {
    const mod = await import(pathToFileURL(path.join(ROOT, 'lib', 'scripture', 'index.ts')).href);
    return (body) => {
      const seen = new Map();
      for (const r of mod.parseReferences(body)) {
        if (seen.has(r.osis)) continue;
        seen.set(r.osis, {
          osis: r.osis, book: r.book, chapter: r.chapter,
          verse_start: r.verse, verse_end: r.verseEnd, raw: r.raw.trim().slice(0, 200),
        });
      }
      return [...seen.values()];
    };
  } catch {
    return null;
  }
}

function preview(item, oldRow, refs) {
  const b = item.fields.body;
  const oldWords = oldRow ? wordCount(oldRow.body) : null;
  console.log(`\n=== ${item.slug} (accession ${item.expectedAccession}) ===`);
  console.log(`words: old ${oldWords ?? 'unknown (no database read)'} → new ${wordCount(b)}` +
    (item.notes ? ` (${proseWordCount(b)} without the ${item.notes} footnote definitions)` : ''));
  console.log(`scripture references in new body: ${refs ? refs.length : 'not computed (run under tsx)'}`);
  console.log(`summary: ${item.summary ? `replaced: ${item.summary}` : item.clearSummary ? 'cleared' : 'kept'} · license: ${item.fields.license ?? 'null'} · review_state → pending`);
  console.log('--- first 300 characters ---');
  console.log(b.slice(0, 300));
  console.log('--- last 300 characters ---');
  console.log(b.slice(-300));
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const sqlOut = args.find(a => a.startsWith('--sql='))?.split('=')[1];
  const only = args.find(a => a.startsWith('--slug='))?.split('=')[1];
  if (apply && sqlOut) throw new Error('Choose --apply or --sql, not both.');

  const files = fs.readdirSync(STAGING_DIR).filter(f => f.endsWith('.md')).sort();
  const items = files
    .map(f => readStaged(fs.readFileSync(path.join(STAGING_DIR, f), 'utf8'), f))
    .filter(it => !only || it.slug === only);
  if (!items.length) throw new Error(`No staged replacements${only ? ` for ${only}` : ''} in ${STAGING_DIR}`);

  const licenses = fs.readFileSync(path.join(ROOT, 'lib', 'licenses.ts'), 'utf8');
  for (const it of items) {
    const l = it.fields.license;
    if (l && !licenses.includes(`'${l}':`)) throw new Error(`${it.slug}: license '${l}' is not defined in lib/licenses.ts`);
    if (l && !(it.fields.source_attribution && it.fields.source_url)) throw new Error(`${it.slug}: a licensed text needs source_attribution and source_url`);
  }

  const parseRefs = await loadRefParser();

  let supabase = null;
  const dotenv = await import('dotenv');
  dotenv.config({ path: path.join(ROOT, '.env.local'), override: true });
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { createClient } = await import('@supabase/supabase-js');
    supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  } else if (apply) {
    throw new Error('--apply needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local (or use --sql).');
  }

  const sql = [];
  for (const item of items) {
    let oldRow = null;
    if (supabase) {
      const { data, error } = await supabase.from('texts')
        .select('id, slug, accession_number, published, body').eq('slug', item.slug).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error(`${item.slug}: no such row`);
      if (data.id !== item.expectedId || data.accession_number !== item.expectedAccession) {
        throw new Error(`${item.slug}: id or accession number does not match the staged file`);
      }
      if (data.published) throw new Error(`${item.slug}: row is published; refusing to replace its body`);
      oldRow = data;
    }
    const refs = parseRefs ? parseRefs(item.fields.body) : null;
    preview(item, oldRow, refs);

    if (sqlOut) sql.push(buildSql(item, refs));

    if (apply) {
      const update = { ...item.fields };
      if (item.clearSummary) update.summary = null;
      if (item.summary) update.summary = item.summary;
      const { data, error } = await supabase.from('texts').update(update)
        .eq('id', item.expectedId).eq('slug', item.slug)
        .eq('accession_number', item.expectedAccession).eq('published', false).select('id');
      if (error) throw error;
      if (data?.length !== 1) throw new Error(`${item.slug}: update matched ${data?.length ?? 0} rows`);
      const del = await supabase.from('text_scripture_references').delete().eq('text_id', item.expectedId);
      if (del.error) throw del.error;
      if (refs?.length) {
        const ins = await supabase.from('text_scripture_references')
          .upsert(refs.map(r => ({ text_id: item.expectedId, ...r })), { onConflict: 'text_id,osis', ignoreDuplicates: true });
        if (ins.error) throw ins.error;
      } else if (!refs) {
        console.log(`  scripture references cleared; rebuild with: npx tsx scripts/backfill-scripture-refs.ts --slug=${item.slug}`);
      }
      console.log(`  ✓ ${item.slug} updated (published:false, review_state:pending)`);
    }
  }

  if (sqlOut) {
    fs.writeFileSync(sqlOut, sql.join('\n\n') + '\n');
    console.log(`\nSQL for ${items.length} text(s) written to ${sqlOut}`);
  }
  if (!apply && !sqlOut) console.log('\nDry run: nothing written. Re-run with --apply (or --sql=<file>) to write.');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(err => { console.error(err.message); process.exit(1); });
}
