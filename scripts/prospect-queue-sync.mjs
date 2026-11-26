#!/usr/bin/env node
/**
 * prospect-queue-sync.mjs — move the prospect queue between the file and the table.
 *
 *   node scripts/prospect-queue-sync.mjs --to-db            # dry run: what the backfill would write
 *   node scripts/prospect-queue-sync.mjs --to-db --write    # one-off backfill after migration 041
 *   node scripts/prospect-queue-sync.mjs --to-file --write  # export the table to prospect-queue.json
 *
 * --to-db upserts every prospect in scripts/ingestion/prospect-queue.json into
 * public.prospects. It never deletes a row. Run it once, right after applying
 * migration 041; from then on the table is the queue and the file is an export.
 *
 * --to-file writes the table back over the file, for a snapshot in git (the run
 * log PR is the natural place) or to read the queue offline.
 *
 * Without --write either direction prints the differences and changes nothing.
 *
 * Meters: Supabase egress, the whole table once (~380 KB); the backfill also
 * sends ~380 KB in. No text bodies are read.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import {
  QUEUE_FILE, TABLE, COLUMNS, readQueueFile, writeQueueFile, changedProspects, fromRow, toRow, isMissingTable, sortProspects,
} from './lib/prospect-store.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const args = new Set(process.argv.slice(2));
const toDb = args.has('--to-db');
const toFile = args.has('--to-file');
const write = args.has('--write');
if (toDb === toFile) {
  console.error('Pass exactly one of --to-db or --to-file (and --write to apply).');
  process.exit(2);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (.env.local or the environment).');
  process.exit(2);
}
const supabase = createClient(url, key);

const { data, error } = await supabase.from(TABLE).select('*').limit(5000);
if (error) {
  if (isMissingTable(error)) {
    console.error('The prospects table does not exist yet. Apply supabase/migrations/041_prospects.sql first.');
  } else {
    console.error(`Reading prospects failed: ${error.message}`);
  }
  process.exit(1);
}
const inDb = data.map(fromRow);
const inFile = readQueueFile();

const fileIds = new Set(inFile.map((p) => p.id));
const dbIds = new Set(inDb.map((p) => p.id));

if (toDb) {
  const changed = changedProspects(inDb, inFile);
  const onlyInDb = inDb.filter((p) => !fileIds.has(p.id));
  console.log(`File: ${inFile.length} prospects. Table: ${inDb.length} rows.`);
  console.log(`To write: ${changed.length} (${changed.filter((p) => !dbIds.has(p.id)).length} new, ${changed.filter((p) => dbIds.has(p.id)).length} changed).`);
  if (onlyInDb.length) {
    console.log(`In the table but not the file (left alone): ${onlyInDb.map((p) => p.id).join(', ')}`);
  }
  if (!write) {
    console.log('\nDry run. Re-run with --write to apply.');
    process.exit(0);
  }
  for (let i = 0; i < changed.length; i += 100) {
    const rows = changed.slice(i, i + 100).map(toRow);
    const { error: e } = await supabase.from(TABLE).upsert(rows, { onConflict: 'id' });
    if (e) {
      console.error(`Upsert failed at row ${i}: ${e.message}`);
      process.exit(1);
    }
  }
  const { count } = await supabase.from(TABLE).select('id', { count: 'exact', head: true });
  console.log(`Wrote ${changed.length}. The table now holds ${count} prospects.`);
} else {
  const changed = changedProspects(inFile, inDb);
  const onlyInFile = inFile.filter((p) => !dbIds.has(p.id));
  console.log(`Table: ${inDb.length} rows. File: ${inFile.length} prospects. ${changed.length} differ or are new to the file.`);
  if (onlyInFile.length) {
    console.log(`In the file but not the table (dropped by the export): ${onlyInFile.map((p) => p.id).join(', ')}`);
  }
  if (!write) {
    console.log('\nDry run. Re-run with --write to apply.');
    process.exit(0);
  }
  // Keep the file's own order so a snapshot's diff shows only what changed; rows
  // new to the file go at the end, in date order.
  const byId = new Map(inDb.map((p) => [p.id, p]));
  // A field the table holds empty comes back absent (fromRow drops nulls); write it
  // as null where the file already had the key, so null-vs-absent is not churn.
  const kept = inFile.filter((p) => byId.has(p.id)).map((p) => {
    const db = byId.get(p.id);
    const merged = { ...p, ...db };
    for (const k of Object.keys(p)) if (COLUMNS.includes(k) && !(k in db)) merged[k] = null;
    return merged;
  });
  const added = sortProspects(inDb.filter((p) => !fileIds.has(p.id)));
  writeQueueFile([...kept, ...added], QUEUE_FILE);
  console.log(`Wrote ${inDb.length} prospects to ${path.relative(process.cwd(), QUEUE_FILE)}.`);
}
