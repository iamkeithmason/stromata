/**
 * prospect-store.mjs — where the content pipeline's prospect queue lives.
 *
 * The queue is the `prospects` table (migration 041). Until that migration has
 * been applied, every caller falls back to the old file,
 * scripts/ingestion/prospect-queue.json, so this code can merge first and the
 * migration can follow without a broken window. The fallback is announced, never
 * silent: `source` says which store answered.
 *
 * One module for every caller (lib/pipeline/queue.ts for the admin app,
 * scripts/pipeline-import.mjs, scripts/sourcer/stage-to-output.mjs,
 * scripts/prospect-queue-sync.mjs), so the row mapping exists once.
 *
 * Pure halves (toRow / fromRow / changedProspects / isMissingTable) are
 * unit-tested in prospect-store.test.mjs.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const QUEUE_FILE = path.join(__dirname, '..', 'ingestion', 'prospect-queue.json');
export const TABLE = 'prospects';

// Columns of public.prospects that map 1:1 to a queue field.
export const COLUMNS = [
  'id', 'status', 'added', 'author', 'death_year', 'tradition', 'era', 'title', 'genre',
  'source_type', 'source_url', 'collection_slug', 'translation_copyright_clear',
  'translator', 'translator_death_year', 'license', 'docx_path', 'stage_1_notes',
  'stage_2_output', 'stage_3_themes', 'rejection_reason', 'notes',
];
const COLUMN_SET = new Set(COLUMNS);
const DB_ONLY = new Set(['extra', 'created_at', 'updated_at']);

const INT_COLUMNS = new Set(['death_year', 'translator_death_year']);

/** A queue prospect → a table row. Unknown keys go to `extra`; UI-only `_` keys are dropped. */
export function toRow(prospect) {
  const row = { extra: {} };
  for (const [k, v] of Object.entries(prospect)) {
    if (k.startsWith('_')) continue;
    if (COLUMN_SET.has(k)) row[k] = v;
    else if (!DB_ONLY.has(k)) row.extra[k] = v;
  }
  if (!Array.isArray(row.stage_3_themes)) row.stage_3_themes = [];
  // A date column refuses '' — treat it as absent.
  if (row.added === '') row.added = null;
  for (const k of INT_COLUMNS) {
    if (row[k] === '' || row[k] === undefined) continue;
    if (row[k] !== null && !Number.isInteger(row[k])) {
      const n = Number(row[k]);
      row[k] = Number.isInteger(n) ? n : null;
    }
  }
  return row;
}

/**
 * A table row → a queue prospect. `extra` is spread back; null columns are
 * omitted so a row reads like the file entry it came from.
 */
export function fromRow(row) {
  const p = {};
  for (const k of COLUMNS) {
    if (row[k] === null || row[k] === undefined) continue;
    p[k] = row[k];
  }
  if (row.extra && typeof row.extra === 'object') {
    for (const [k, v] of Object.entries(row.extra)) if (!(k in p)) p[k] = v;
  }
  if (!Array.isArray(p.stage_3_themes)) p.stage_3_themes = [];
  return p;
}

/** True when a Supabase error means the table does not exist yet (migration 041 not applied). */
export function isMissingTable(error) {
  if (!error) return false;
  const code = error.code || '';
  const msg = String(error.message || '');
  return code === 'PGRST205' || code === '42P01' || /could not find the table|relation .*prospects.* does not exist/i.test(msg);
}

// A row's content for comparison: null and absent mean the same thing (the file
// writes some empty fields as null; a row read back from the table omits them).
function canonical(p) {
  const row = toRow(p);
  for (const k of Object.keys(row)) if (row[k] === null || row[k] === undefined) delete row[k];
  return JSON.stringify(row, Object.keys(row).sort());
}

/** Prospects in `after` that differ from their counterpart in `before` (or are new). */
export function changedProspects(before, after) {
  const prev = new Map(before.map((p) => [p.id, canonical(p)]));
  return after.filter((p) => prev.get(p.id) !== canonical(p));
}

/** Stable display order: by date added, then id (the file's order was append order). */
export function sortProspects(list) {
  return [...list].sort((a, b) => String(a.added || '').localeCompare(String(b.added || '')) || a.id.localeCompare(b.id));
}

// ── I/O ─────────────────────────────────────────────────────────────────────

export function readQueueFile(file = QUEUE_FILE) {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!parsed || !Array.isArray(parsed.prospects)) {
    throw new Error(`${path.basename(file)} is malformed: missing prospects array`);
  }
  return parsed.prospects;
}

export function writeQueueFile(prospects, file = QUEUE_FILE) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ prospects }, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}

/**
 * Read the whole queue. Returns { source: 'db' | 'file', prospects }.
 * `supabase` may be null (no credentials), which means the file.
 */
export async function loadProspects(supabase, { file = QUEUE_FILE } = {}) {
  if (supabase) {
    const { data, error } = await supabase.from(TABLE).select('*').limit(5000);
    if (!error) return { source: 'db', prospects: sortProspects(data.map(fromRow)) };
    if (!isMissingTable(error)) throw new Error(`Reading prospects failed: ${error.message}`);
  }
  return { source: 'file', prospects: readQueueFile(file) };
}

/**
 * Write prospects back to whichever store `source` names. For the database only
 * the given rows are upserted (pass the changed ones); for the file the whole
 * list is written, so pass the full queue there.
 */
export async function saveProspects(supabase, source, prospects, { file = QUEUE_FILE } = {}) {
  if (source === 'db') {
    for (let i = 0; i < prospects.length; i += 100) {
      const rows = prospects.slice(i, i + 100).map(toRow);
      const { error } = await supabase.from(TABLE).upsert(rows, { onConflict: 'id' });
      if (error) throw new Error(`Writing prospects failed: ${error.message}`);
    }
    return;
  }
  writeQueueFile(prospects, file);
}
