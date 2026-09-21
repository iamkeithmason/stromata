/**
 * repair-summaries.mjs — Re-generate truncated text summaries
 *
 * Finds published texts whose summary is non-null but truncated (ends with
 * '…' / '...' or doesn't end with sentence-ending punctuation), then
 * re-generates each using the improved prompt that instructs the model to
 * stay within 160 characters and end at a natural sentence boundary.
 *
 * Usage:
 *   node scripts/repair-summaries.mjs --dry-run   # preview without writing
 *   node scripts/repair-summaries.mjs             # write to DB
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { generateSummary, isTruncated } from './lib/summary-prompt.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// override: true ensures our local file wins even if the shell pre-loaded
// a garbled/empty value via the dotenvx hook.
dotenv.config({ path: path.join(__dirname, '..', '.env.local'), override: true });

const dryRun = process.argv.includes('--dry-run');
const sampleArg = process.argv.find(a => a.startsWith('--sample='));
const sampleLimit = sampleArg ? parseInt(sampleArg.split('=')[1], 10) : Infinity;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(dryRun ? '🔍 Dry-run mode — no writes\n' : '✏️  Write mode\n');

  // Fetch all published texts with an existing summary
  const { data: texts, error } = await supabase
    .from('texts')
    .select('id, title, summary, body, author:authors(name)')
    .eq('published', true)
    .not('summary', 'is', null)
    .order('title');

  if (error) {
    console.error('Failed to fetch texts:', error.message);
    process.exit(1);
  }

  const affected = texts.filter(t => isTruncated(t.summary));
  const total = affected.length;

  console.log(`${texts.length} texts have summaries. ${total} are truncated.\n`);

  if (total === 0) {
    console.log('Nothing to repair.');
    return;
  }

  let repaired = 0;
  let failed = 0;

  const batch = sampleLimit < Infinity ? affected.slice(0, sampleLimit) : affected;

  for (let i = 0; i < batch.length; i++) {
    const text = batch[i];
    const authorName = text.author?.name ?? 'Unknown';

    console.log(`[${i + 1}/${total}] ${text.title} — ${authorName}`);
    console.log(`  OLD (${text.summary.length} chars): ${text.summary}`);

    // Rate limit: 100ms minimum between requests
    if (i > 0) await new Promise(r => setTimeout(r, 100));

    let newSummary;
    try {
      ({ summary: newSummary } = await generateSummary({
        anthropic, title: text.title, author: authorName, source: text.body ?? '',
      }));
    } catch (err) {
      console.error(`  ✗ API error: ${err.message}`);
      failed++;
      continue;
    }

    const stillTruncated = isTruncated(newSummary);
    const marker = stillTruncated ? '⚠ ' : '✓ ';
    console.log(`  NEW (${newSummary.length} chars): ${newSummary}  ${marker}`);

    if (dryRun) {
      console.log('');
      continue;
    }

    const { error: writeError } = await supabase
      .from('texts')
      .update({ summary: newSummary })
      .eq('id', text.id);

    if (writeError) {
      console.error(`  ✗ Write error: ${writeError.message}`);
      failed++;
    } else {
      repaired++;
    }

    console.log('');
  }

  const processed = batch.length;
  if (dryRun) {
    console.log(`\nDry-run complete. ${processed} of ${total} summaries previewed.`);
  } else {
    console.log(`\nDone. ${repaired} repaired, ${failed} failed (of ${processed} processed).`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
