/**
 * propose-edition-metadata.mjs — read-only audit that PROPOSES structured edition
 * fields (translator, series, volume, year, publisher, place) for every text,
 * from the three free-text provenance columns on `texts`.
 *
 * Step 1 of the edition-metadata work: detection only. It writes nothing to the
 * database, holds no write credentials, and runs no migration. Step 2 (a schema
 * migration plus a separate apply script that writes editor-approved rows) will
 * consume the CSV this writes, with its `editor_decision` column filled in.
 * AI proposes, editor approves.
 *
 * Usage:
 *   node scripts/propose-edition-metadata.mjs                       # all published texts
 *   node scripts/propose-edition-metadata.mjs --slug=dialogue-with-trypho
 *   node scripts/propose-edition-metadata.mjs --collection=confessions
 *   node scripts/propose-edition-metadata.mjs --include-drafts      # needs a read role past RLS
 *   node scripts/propose-edition-metadata.mjs --llm                 # Pass 2 for unresolved rows (API key)
 *   node scripts/propose-edition-metadata.mjs --llm-export=req.json # Pass 2 requests, for any model to answer
 *   node scripts/propose-edition-metadata.mjs --llm-answers=ans.json  # apply those answers through the same guard
 *   node scripts/propose-edition-metadata.mjs --input=rows.json     # offline: rows from a file
 *   node scripts/propose-edition-metadata.mjs --out=<dir>           # default outputs/edition-audit/<today>/
 *
 * Credentials (read-only, in order): EDITION_AUDIT_SUPABASE_URL/KEY →
 * SOURCER_SUPABASE_URL/KEY → NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY.
 * A service-role or secret key is REFUSED: this script must not be able to write.
 * The anon key sees published rows only (RLS, migration 023), so
 * `--include-drafts` needs a SELECT-only role that reads past RLS.
 *
 * Meter: Supabase Egress. One run selects metadata columns only (never `body`):
 * ~0.5 MB for the ~560-row corpus, about 0.01% of the 5 GB cycle allowance.
 * `--llm` also spends Anthropic tokens: one short call per unresolved row
 * (~40 rows, ~600 input tokens each), printed at the end.
 *
 * Output: outputs/edition-audit/YYYY-MM-DD/{proposals.json, proposals.csv, summary.md}.
 * Pass 1 is deterministic: rows are sorted by slug and nothing time-dependent
 * enters the files except the run date, so the same input gives the same output.
 */

import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import {
  proposeEdition, reconcileCollections, isResolved, acceptLlmFields, SERIES, REASONS,
  PD_PUBLICATION_CUTOFF, nameKey, clean, readNames, compactInitials, checkSourcedEntry, canonicaliseTranslators, displayTranslators,
} from './lib/edition-parse.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env.local'), override: false, quiet: true });

const args = process.argv.slice(2);
const flag = (k) => {
  const i = args.findIndex(a => a === `--${k}` || a.startsWith(`--${k}=`));
  if (i < 0) return undefined;
  const a = args[i];
  if (a.includes('=')) return a.slice(a.indexOf('=') + 1);
  const next = args[i + 1];
  return next && !next.startsWith('--') ? next : true;
};
const opts = {
  slug: flag('slug'),
  collection: flag('collection'),
  includeDrafts: Boolean(flag('include-drafts')),
  llm: Boolean(flag('llm')),
  llmExport: flag('llm-export'),
  llmAnswers: flag('llm-answers'),
  input: flag('input'),
  out: flag('out'),
  sourced: flag('sourced'),
};
const today = new Date().toISOString().slice(0, 10);

// ── Read-only credentials ─────────────────────────────────────────────────────

/** Refuse any key that can write. Returns the key's role for the log. */
export function assertReadOnlyKey(key) {
  if (!key) throw new Error('No Supabase read key. Set EDITION_AUDIT_SUPABASE_KEY, SOURCER_SUPABASE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  if (/^sb_secret_/.test(key)) throw new Error('Refusing a secret (sb_secret_…) key: this audit must run read-only.');
  if (/^sb_publishable_/.test(key)) return 'anon (publishable)';
  const parts = key.split('.');
  if (parts.length === 3) {
    try {
      const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      if (claims.role === 'service_role') throw new Error('Refusing the service_role key: this audit must run read-only. Use the anon key or a SELECT-only role.');
      return claims.role || 'unknown';
    } catch (e) {
      if (/Refusing/.test(e.message)) throw e;
    }
  }
  return 'unknown (not a JWT; assumed read-only role)';
}

function readCredentials() {
  const pairs = [
    ['EDITION_AUDIT_SUPABASE_URL', 'EDITION_AUDIT_SUPABASE_KEY'],
    ['SOURCER_SUPABASE_URL', 'SOURCER_SUPABASE_KEY'],
    ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'],
  ];
  for (const [u, k] of pairs) {
    if (process.env[u] && process.env[k]) return { url: process.env[u], key: process.env[k], source: k };
  }
  return { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: null, source: null };
}

// ── Load rows ─────────────────────────────────────────────────────────────────

const COLUMNS = 'id, slug, title, published, collection_id, collection_order, source_attribution, translation_notes, provenance_notes, source_url, collection:collections(slug, title), author:authors(name, death_year)';

async function loadRows() {
  if (opts.input) {
    const rows = JSON.parse(fs.readFileSync(path.resolve(opts.input), 'utf8'));
    console.log(`Read ${rows.length} rows from ${opts.input} (offline; no database call).`);
    return rows;
  }
  const { url, key, source } = readCredentials();
  const role = assertReadOnlyKey(key);
  console.log(`Supabase read key: ${source} (role: ${role}).`);
  if (opts.includeDrafts && /anon/.test(role)) {
    console.warn('⚠ --include-drafts with the anon key: RLS hides drafts, so only published rows will come back.');
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const rows = [];
  const page = 500;
  for (let from = 0; ; from += page) {
    let q = supabase.from('texts').select(COLUMNS).order('slug').range(from, from + page - 1);
    if (!opts.includeDrafts) q = q.eq('published', true);
    if (opts.slug) q = q.eq('slug', opts.slug);
    const { data, error } = await q;
    if (error) throw new Error(`texts query failed: ${error.message}`);
    rows.push(...data);
    if (data.length < page) break;
  }
  return rows;
}

// ── Pass 2: LLM (opt-in) ──────────────────────────────────────────────────────

const LLM_MODEL = process.env.EDITION_AUDIT_MODEL || 'claude-sonnet-5';
const LLM_SYSTEM = `You read the provenance notes of one text in a library of public-domain Christian texts and extract the edition it was taken from.
Return JSON only, of the form {"<field>": {"value": ..., "evidence": "..."}} for any of these fields you can support:
  is_translation (true/false), translator_display (the translator name(s) as written), series_raw (the series or collection title),
  volume (integer), publication_year (integer, the year of the cited edition, not a birth/death year), publisher, place.
"evidence" MUST be copied character-for-character from the notes. Omit any field the notes do not state. Never use outside knowledge:
if the notes do not name a translator, do not supply one.`;

/** Rows Pass 2 may look at: unresolved after Pass 1, with some provenance text to read. */
function llmTargets(items) {
  return items.filter(it => !isResolved(it.proposal) && (it.row.source_attribution || it.row.translation_notes || it.row.provenance_notes));
}

/** The user message for one row: title, author and the three notes, cleaned exactly as the guard cleans them. */
function llmPrompt(it) {
  const notes = ['source_attribution', 'translation_notes', 'provenance_notes']
    .map(f => `${f}: ${clean(it.row[f]) || '(blank)'}`).join('\n');
  return `Title: ${it.row.title}\nAuthor: ${it.row.author?.name ?? ''}\n\n${notes}`;
}

/** Apply one model answer through the verbatim-evidence guard. Fields Pass 1 already filled are never overwritten. */
function applyLlmAnswer(it, parsed) {
  const { accepted, rejected } = acceptLlmFields(it.row, parsed);
  const p = it.proposal;
  const applied = [];
  p.llm = { accepted, rejected, applied };
  for (const [field, { value }] of Object.entries(accepted)) {
    if (field === 'translator_display') {
      if (p.translators.length) continue;
      applied.push(field);
      p.translator_display = value;
      p.translators = value.split(/\s*(?:&| and |,|\/)\s*/).filter(Boolean);
      p.method.translator_display = p.method.translators = 'llm';
      p.reasons = p.reasons.filter(r => r !== 'translator_missing');
      if (p.is_translation === 'unknown') { p.is_translation = true; p.method.is_translation = 'llm'; }
    } else if (p[field] === null || p[field] === undefined || p[field] === 'unknown') {
      applied.push(field);
      p[field] = value;
      p.method[field] = 'llm';
      if (field === 'volume') p.reasons = p.reasons.filter(r => r !== 'volume_missing');
      if (field === 'is_translation' && value === false) p.reasons = p.reasons.filter(r => r !== 'translator_missing' && r !== 'modern_translation_check');
    }
  }
  if (applied.length) p.confidence = 'low';
}

/** Pass 2 through the Anthropic API (`--llm`, needs ANTHROPIC_API_KEY). */
async function runLlmPass(items) {
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let inTok = 0, outTok = 0;
  const targets = llmTargets(items);
  console.log(`\nPass 2 (--llm, ${LLM_MODEL}): ${targets.length} unresolved rows with provenance text.`);
  for (const it of targets) {
    const res = await anthropic.messages.create({
      model: LLM_MODEL,
      max_tokens: 600,
      system: LLM_SYSTEM,
      messages: [{ role: 'user', content: llmPrompt(it) }],
    });
    inTok += res.usage?.input_tokens || 0;
    outTok += res.usage?.output_tokens || 0;
    const textOut = res.content.map(c => c.text || '').join('');
    let parsed = null;
    try { parsed = JSON.parse(textOut.slice(textOut.indexOf('{'), textOut.lastIndexOf('}') + 1)); } catch { /* rejected by the guard */ }
    applyLlmAnswer(it, parsed);
    process.stdout.write('.');
  }
  console.log(`\nPass 2 tokens: ${inTok} in, ${outTok} out.`);
}

/**
 * Pass 2 without an API key: `--llm-export=<file>` writes the system prompt and one
 * request per target row; any model (a subagent, a chat) answers them into
 * {"<slug>": {<field>: {value, evidence}}}; `--llm-answers=<file>` applies those
 * answers through the same guard as `--llm`. The guard, not the answerer, decides.
 */
function exportLlmRequests(items, file) {
  const requests = llmTargets(items).map(it => ({ slug: it.slug, prompt: llmPrompt(it) }));
  fs.writeFileSync(path.resolve(file), JSON.stringify({ system: LLM_SYSTEM, requests }, null, 2) + '\n');
  console.log(`Wrote ${requests.length} Pass 2 requests to ${file}.`);
}

function applyLlmAnswersFile(items, file) {
  const answers = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  const targets = llmTargets(items);
  let applied = 0;
  for (const it of targets) {
    if (!(it.slug in answers)) continue;
    applyLlmAnswer(it, answers[it.slug]);
    applied++;
  }
  console.log(`Pass 2 (--llm-answers): applied ${applied} of ${targets.length} target rows from ${file}.`);
}

// ── Sourced and editor-confirmed fields ───────────────────────────────────────

const DEFAULT_SOURCED = path.join(root, 'outputs', 'edition-audit', 'sourced-fields.json');

/**
 * Apply the curated file of fields looked up in an outside source or confirmed by
 * the editor (default outputs/edition-audit/sourced-fields.json; `--sourced=<file>`
 * for another, `--sourced=none` to skip). Unlike Pass 2 these OVERRIDE Pass 1,
 * because they were checked against the edition itself; any value they replace is
 * kept in `superseded` and noted, so the disagreement stays visible for review.
 */
function applySourcedFile(items) {
  if (opts.sourced === 'none') return;
  const file = typeof opts.sourced === 'string' ? path.resolve(opts.sourced) : DEFAULT_SOURCED;
  if (!fs.existsSync(file)) return;
  const entries = JSON.parse(fs.readFileSync(file, 'utf8'));
  let applied = 0;
  for (const it of items) {
    const entry = entries[it.slug];
    if (!entry) continue;
    const { ok, refused } = checkSourcedEntry(entry);
    const p = it.proposal;
    const method = entry.basis === 'editor' ? 'editor' : 'sourced';
    p.sourced = { basis: entry.basis, source_url: entry.source_url ?? null, citation: entry.citation ?? null, note: entry.note ?? null, refused, superseded: {} };
    if (entry.note) p.notes.push(`${method}: ${entry.note}`);
    if (/^FINDING:/.test(entry.note || '') && p.is_translation === true && !p.reasons.includes('modern_translation_check')) p.reasons.push('modern_translation_check');
    for (const [field, value] of Object.entries(ok)) {
      if (field === 'translator_display') {
        const names = canonicaliseTranslators(value.split(/\s*(?:&| and |,)\s*/).filter(Boolean)).names;
        const display = displayTranslators(names);
        if (p.translator_display && p.translator_display !== display) {
          p.sourced.superseded.translator_display = p.translator_display;
          p.notes.push(`translator from notes ("${p.translator_display}") replaced by the cited edition's ("${display}")`);
          if (!p.reasons.includes('translator_is_editor')) p.reasons.push('translator_is_editor');
        }
        p.translators = names;
        p.translator_display = display;
        p.method.translators = p.method.translator_display = method;
        p.reasons = p.reasons.filter(r => r !== 'translator_missing');
        if (p.is_translation !== false) { p.is_translation = true; p.method.is_translation ??= method; }
        continue;
      }
      if (p[field] !== null && p[field] !== undefined && p[field] !== 'unknown' && p[field] !== value) {
        p.sourced.superseded[field] = p[field];
        p.notes.push(`${field} ${JSON.stringify(p[field])} replaced by ${JSON.stringify(value)} (${method})`);
      }
      p[field] = value;
      p.method[field] = method;
      if (field === 'volume') p.reasons = p.reasons.filter(r => r !== 'volume_missing');
      if (field === 'is_translation' && value === false) p.reasons = p.reasons.filter(r => r !== 'translator_missing' && r !== 'modern_translation_check');
      if (field === 'publication_year' && p.is_translation === true && value <= PD_PUBLICATION_CUTOFF) p.reasons = p.reasons.filter(r => r !== 'modern_translation_check');
    }
    if (/^FINDING:/.test(entry.note || '')) {
      // A finding that disproves the notes' translator credit withdraws it, so the row cannot count as resolved on it.
      if (p.translator_display && !ok.translator_display) {
        p.sourced.superseded.translator_display = p.translator_display;
        p.translator_display = null;
        p.translators = [];
        p.method.translators = p.method.translator_display = method;
        if (!p.reasons.includes('translator_missing')) p.reasons.push('translator_missing');
      }
      p.confidence = 'low';
      applied++;
      continue;
    }
    p.confidence = method === 'sourced' && !refused.length ? (p.reasons.some(r => ['year_suspect', 'series_false_positive_suspect', 'ambiguous_series', 'url_only'].includes(r)) ? 'medium' : 'high') : 'medium';
    applied++;
  }
  console.log(`Applied ${applied} sourced/editor entries from ${path.relative(root, file)}.`);
}

// ── Output ────────────────────────────────────────────────────────────────────

const CSV_COLUMNS = [
  'slug', 'title', 'author', 'author_death_year', 'collection_slug', 'collection_order',
  'is_translation', 'translator_display', 'translators', 'series_key', 'series_raw', 'volume',
  'publication_year', 'publisher', 'place', 'confidence', 'resolved', 'reasons', 'methods', 'notes',
  'source_attribution', 'translation_notes', 'provenance_notes', 'source_url', 'editor_decision',
];

function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = Array.isArray(v) ? v.join('; ') : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toRecord(it) {
  const { row, proposal: p } = it;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    author: row.author?.name ?? null,
    author_death_year: row.author?.death_year ?? null,
    collection_slug: row.collection?.slug ?? null,
    collection_order: row.collection_order ?? null,
    published: row.published ?? null,
    is_translation: p.is_translation,
    translator_display: p.translator_display,
    translators: p.translators,
    translator_raw: p.translator_raw ?? null,
    series_key: p.series_key,
    series_raw: p.series_raw,
    volume: p.volume,
    publication_year: p.publication_year,
    publisher: p.publisher,
    place: p.place,
    method: p.method,
    source_field: p.source_field,
    confidence: p.confidence,
    resolved: isResolved(p),
    reasons: p.reasons,
    notes: p.notes,
    ...(p.llm ? { llm: p.llm } : {}),
    ...(p.sourced ? { sourced: p.sourced } : {}),
    raw: {
      source_attribution: row.source_attribution ?? null,
      translation_notes: row.translation_notes ?? null,
      provenance_notes: row.provenance_notes ?? null,
      source_url: row.source_url ?? null,
    },
  };
}

function toCsv(records) {
  const lines = [CSV_COLUMNS.join(',')];
  for (const r of records) {
    const flat = {
      ...r,
      methods: Object.entries(r.method).map(([k, v]) => `${k}=${v}`).join('; '),
      source_attribution: r.raw.source_attribution,
      translation_notes: r.raw.translation_notes,
      provenance_notes: r.raw.provenance_notes,
      source_url: r.raw.source_url,
      editor_decision: '',
    };
    lines.push(CSV_COLUMNS.map(c => csvCell(flat[c])).join(','));
  }
  return lines.join('\n') + '\n';
}

const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(1)}%` : '–');
const countBy = (xs, f) => xs.reduce((m, x) => { const k = f(x); m.set(k, (m.get(k) || 0) + 1); return m; }, new Map());

/** Surname-or-initials collisions among distinct translator strings: "W.H. Fremantle" ~ "W. H. Fremantle". */
export function suspectedAliasPairs(names) {
  const pairs = [];
  const list = [...names].sort();
  const surname = n => n.split(/\s+/).pop().toLowerCase();
  const initials = n => n.split(/[\s.]+/).filter(Boolean).slice(0, -1).map(w => w[0].toLowerCase()).join('');
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (nameKey(a) === nameKey(b)) { pairs.push([a, b, 'same name, different spacing/punctuation']); continue; }
      if (surname(a) !== surname(b)) continue;
      const ia = initials(a), ib = initials(b);
      if (!ia || !ib || ia.startsWith(ib) || ib.startsWith(ia)) pairs.push([a, b, 'same surname, compatible initials']);
    }
  }
  return pairs;
}

function summarise(records, collectionReport) {
  const n = records.length;
  const resolved = records.filter(r => r.resolved).length;
  const translations = records.filter(r => r.is_translation === true);
  const lines = [];
  lines.push(`# Edition metadata audit — ${today}`, '');
  lines.push(`Read-only proposal run over ${n} texts (${opts.includeDrafts ? 'published and draft' : 'published only'}${opts.slug ? `, slug ${opts.slug}` : ''}${opts.collection ? `, collection ${opts.collection}` : ''}). Pass 1 (deterministic)${(opts.llm || opts.llmAnswers) ? ' + Pass 2 (LLM, verbatim-evidence only)' : ' only'}. Nothing was written to the database.`, '');
  lines.push('A row is **resolved** when it is an original-language/English work (`is_translation: false`), or a translation with a translator and, for a multi-volume series, a volume.', '');

  lines.push('## Resolution', '');
  lines.push('| | Rows | Share |', '|---|---:|---:|');
  lines.push(`| Resolved overall | ${resolved} | ${pct(resolved, n)} |`);
  lines.push(`| \`is_translation\` decided (true/false) | ${records.filter(r => r.is_translation !== 'unknown').length} | ${pct(records.filter(r => r.is_translation !== 'unknown').length, n)} |`);
  lines.push(`| …of which original language / English (\`false\`) | ${records.filter(r => r.is_translation === false).length} | ${pct(records.filter(r => r.is_translation === false).length, n)} |`);
  lines.push(`| …of which translations (\`true\`) | ${translations.length} | ${pct(translations.length, n)} |`);
  lines.push(`| Translations with a translator | ${translations.filter(r => r.translators.length).length} | ${pct(translations.filter(r => r.translators.length).length, translations.length)} of translations |`);
  lines.push(`| Translations with a series | ${translations.filter(r => r.series_key).length} | ${pct(translations.filter(r => r.series_key).length, translations.length)} of translations |`);
  const multi = records.filter(r => r.series_key && SERIES[r.series_key]?.multiVolume);
  lines.push(`| Multi-volume series rows with a volume | ${multi.filter(r => r.volume).length} | ${pct(multi.filter(r => r.volume).length, multi.length)} of ${multi.length} |`);
  lines.push(`| Rows with a publication year | ${records.filter(r => r.publication_year).length} | ${pct(records.filter(r => r.publication_year).length, n)} |`);
  lines.push(`| Rows with a publisher | ${records.filter(r => r.publisher).length} | ${pct(records.filter(r => r.publisher).length, n)} |`);
  const ser = records.filter(r => r.series_key && r.series_key !== 'OTHER' && r.volume && r.translators.length).length;
  lines.push(`| Series + volume + translator (the SQL audit's measure) | ${ser} | ${pct(ser, n)} |`, '');
  lines.push('Confidence: ' + ['high', 'medium', 'low'].map(c => `${c} ${records.filter(r => r.confidence === c).length}`).join(' · '), '');
  const asked = records.filter(r => r.llm);
  if (asked.length) {
    const n = k => asked.reduce((t, r) => t + (Array.isArray(r.llm[k]) ? r.llm[k].length : Object.keys(r.llm[k]).length), 0);
    lines.push(`Pass 2 (LLM): ${asked.length} unresolved rows asked; ${n('accepted')} fields passed the verbatim-evidence guard, ${n('rejected')} were rejected, and ${n('applied')} filled a field Pass 1 had left blank (the rest restated what Pass 1 already had). ${asked.filter(r => r.resolved).length} of the asked rows are now resolved.`, '');
  }
  const src = records.filter(r => r.sourced);
  if (src.length) {
    const sup = src.filter(r => Object.keys(r.sourced.superseded).length);
    lines.push(`Sourced and editor-confirmed fields (\`outputs/edition-audit/sourced-fields.json\`): ${src.filter(r => r.sourced.basis === 'source').length} rows checked against an outside citation, ${src.filter(r => r.sourced.basis === 'editor').length} confirmed by the editor. ${sup.length} of them corrected a value the notes gave${sup.length ? ` (${sup.map(r => `\`${r.slug}\``).join(', ')})` : ''}.`, '');
  }
  const methodCounts = countBy(records.flatMap(r => Object.values(r.method)), x => x);
  lines.push('Field values by method: ' + [...methodCounts].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · '), '');

  lines.push('## What we hold, by series and volume', '');
  lines.push('| Series | Rows | Volumes (rows) |', '|---|---:|---|');
  const bySeries = countBy(records.filter(r => r.series_key), r => r.series_key);
  for (const [key, c] of [...bySeries].sort((a, b) => b[1] - a[1])) {
    const vols = countBy(records.filter(r => r.series_key === key), r => r.volume ?? '?');
    const volStr = [...vols].sort((a, b) => (a[0] === '?' ? 1 : b[0] === '?' ? -1 : a[0] - b[0])).map(([v, k]) => `${v} (${k})`).join(', ');
    lines.push(`| ${key} — ${SERIES[key].label} | ${c} | ${volStr} |`);
  }
  lines.push('');

  lines.push('## Unresolved rows, by reason', '');
  const unresolved = records.filter(r => !r.resolved);
  lines.push(`${unresolved.length} unresolved rows. Every one carries at least one reason code${unresolved.every(r => r.reasons.length) ? ' (checked)' : ' — **NOT ALL DO; see below**'}.`, '');
  for (const code of REASONS) {
    const hit = records.filter(r => r.reasons.includes(code));
    if (!hit.length) continue;
    const un = hit.filter(r => !r.resolved).length;
    lines.push(`### \`${code}\` — ${hit.length} rows${un !== hit.length ? ` (${un} unresolved)` : ''}`, '');
    const shown = hit.slice(0, 40);
    for (const r of shown) {
      const what = [r.series_key && `${r.series_key}${r.volume ? ` ${r.volume}` : ''}`, r.translator_display, r.publication_year].filter(Boolean).join(' · ');
      lines.push(`- \`${r.slug}\`${r.author ? ` (${r.author})` : ''}${what ? ` — ${what}` : ''}${r.notes.length ? ` — _${r.notes.join('; ')}_` : ''}`);
    }
    if (hit.length > shown.length) lines.push(`- …and ${hit.length - shown.length} more (see proposals.csv)`);
    lines.push('');
  }
  const noReason = unresolved.filter(r => !r.reasons.length);
  if (noReason.length) {
    lines.push('### Unresolved with no reason code (a parser gap)', '');
    for (const r of noReason) lines.push(`- \`${r.slug}\``);
    lines.push('');
  }

  lines.push('## Collections whose parts disagree', '');
  const mixed = collectionReport.filter(c => c.mixed.length);
  if (!mixed.length) lines.push('None.', '');
  for (const c of mixed) {
    lines.push(`- **${c.collection_slug}** (${c.parts} parts): ${c.mixed.map(m => `${m.field} ∈ {${m.values.join(' | ')}}${m.majority !== null && m.majority !== undefined ? ` (majority: ${m.majority}; only dissenting parts flagged)` : ' (no majority; every part flagged)'}`).join('; ')}`);
  }
  lines.push('');
  const inh = collectionReport.filter(c => Object.keys(c.inherited).length);
  if (inh.length) {
    lines.push('Values offered from sibling parts (`inherited_from_collection`):', '');
    for (const c of inh) lines.push(`- **${c.collection_slug}**: ${Object.entries(c.inherited).map(([f, s]) => `${f} → ${s.length} part${s.length > 1 ? 's' : ''}`).join(', ')}`);
    lines.push('');
  }

  lines.push('## Translators', '');
  const trCounts = countBy(records.flatMap(r => r.translators), x => x);
  lines.push(`${trCounts.size} distinct translator names.`, '');
  lines.push('| Translator | Rows |', '|---|---:|');
  for (const [name, c] of [...trCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) lines.push(`| ${name} | ${c} |`);
  lines.push('');
  const pairs = suspectedAliasPairs(trCounts.keys());
  lines.push('### Suspected alias pairs (proposed additions to the alias map)', '');
  if (!pairs.length) lines.push('None found.');
  for (const [a, b, why] of pairs) lines.push(`- "${a}" ~ "${b}" — ${why}`);
  lines.push('');

  lines.push('## Proposed seed for a `source_editions` table', '');
  lines.push('A starting point for the Step 2 migration, built only from what the notes say. Editors are the names the notes give for the series; check before using.', '');
  lines.push('| key | title | editors (from notes) | publisher | place | years cited | volumes held | rows |', '|---|---|---|---|---|---|---|---:|');
  for (const [key] of [...bySeries].sort((a, b) => b[1] - a[1])) {
    if (key === 'OTHER') continue;
    const rs = records.filter(r => r.series_key === key);
    const eds = new Set();
    for (const r of rs) {
      const t = clean([r.raw.source_attribution, r.raw.translation_notes].filter(Boolean).join(' '));
      for (const m of t.matchAll(/\b(?:[Ee]dited by|ed\.|series ed\.)\s+/g)) {
        const { names } = readNames(t.slice(m.index + m[0].length));
        for (const n of names) if (!/Society|Press|University|Edition|Fathers/.test(n)) eds.add(compactInitials(n));
      }
    }
    const pubs = [...countBy(rs.filter(r => r.publisher), r => r.publisher)].sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0]);
    const places = [...new Set(rs.map(r => r.place).filter(Boolean))].slice(0, 3);
    const years = rs.map(r => r.publication_year).filter(Boolean);
    const vols = [...new Set(rs.map(r => r.volume).filter(Boolean))].sort((a, b) => a - b);
    lines.push(`| ${key} | ${SERIES[key].label} | ${[...eds].slice(0, 4).join('; ') || '—'} | ${pubs.join('; ') || '—'} | ${places.join('; ') || '—'} | ${years.length ? `${Math.min(...years)}–${Math.max(...years)}` : '—'} | ${vols.join(', ') || '—'} | ${rs.length} |`);
  }
  const other = records.filter(r => r.series_key === 'OTHER');
  if (other.length) {
    lines.push('', `\`OTHER\` (${other.length} rows) groups named single editions with an imprint but no series; each becomes its own \`source_editions\` row in Step 2 if wanted:`, '');
    const byPub = countBy(other, r => [r.publisher, r.place, r.publication_year].filter(Boolean).join(', ') || '(no imprint)');
    for (const [k, c] of [...byPub].sort((a, b) => b[1] - a[1])) lines.push(`- ${k} — ${c} row${c > 1 ? 's' : ''}`);
  }
  lines.push('');

  lines.push('## Copyright review', '');
  lines.push(`Translations dated after ${PD_PUBLICATION_CUTOFF}, or undated outside a known public-domain series (\`modern_translation_check\`), and translated works with no provenance text at all. This is a routing list, not a verdict.`, '');
  const cr = records.filter(r => r.reasons.includes('modern_translation_check') || (r.reasons.includes('no_provenance_text')));
  for (const r of cr) {
    lines.push(`- \`${r.slug}\`${r.author ? ` (${r.author})` : ''} — ${r.reasons.filter(x => ['modern_translation_check', 'no_provenance_text', 'url_only'].includes(x)).join(', ')}${r.publication_year ? ` · ${r.publication_year}` : ''}${r.translator_display ? ` · ${r.translator_display}` : ''}`);
  }
  if (!cr.length) lines.push('None.');
  lines.push('');
  return lines.join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  let rows = await loadRows();
  if (opts.input && !opts.includeDrafts) rows = rows.filter(r => r.published !== false);
  if (opts.input && opts.slug) rows = rows.filter(r => r.slug === opts.slug);
  if (opts.collection) {
    const all = rows;
    rows = all.filter(r => r.collection?.slug === opts.collection);
    if (!rows.length) console.warn(`⚠ No rows in collection "${opts.collection}".`);
  }
  rows.sort((a, b) => a.slug.localeCompare(b.slug));

  const items = rows.map(row => ({ slug: row.slug, row, collection_slug: row.collection?.slug ?? null, proposal: proposeEdition(row) }));
  const collectionReport = reconcileCollections(items);
  applySourcedFile(items);
  if (typeof opts.llmExport === 'string') exportLlmRequests(items, opts.llmExport);
  if (opts.llm) await runLlmPass(items);
  else if (typeof opts.llmAnswers === 'string') applyLlmAnswersFile(items, opts.llmAnswers);

  const records = items.map(toRecord);
  const outDir = path.resolve(typeof opts.out === 'string' ? opts.out : path.join(root, 'outputs', 'edition-audit', today));
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'proposals.json'), JSON.stringify({ generated: today, pass: (opts.llm || opts.llmAnswers) ? 'deterministic+llm' : 'deterministic', count: records.length, proposals: records }, null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, 'proposals.csv'), toCsv(records));
  fs.writeFileSync(path.join(outDir, 'summary.md'), summarise(records, collectionReport));

  const resolved = records.filter(r => r.resolved).length;
  console.log(`\n${records.length} texts · ${resolved} resolved (${pct(resolved, records.length)}) · ${records.length - resolved} unresolved`);
  console.log(`Wrote ${path.relative(root, outDir)}/{proposals.json, proposals.csv, summary.md}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch(err => { console.error(`✗ ${err.message}`); process.exit(1); });
}

