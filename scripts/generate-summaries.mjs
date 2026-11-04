/**
 * generate-summaries.mjs — Backfill text summaries via Claude API
 *
 * Queries all published texts where summary IS NULL, calls the Claude API
 * for each, and writes the result back to the database. Safe to re-run —
 * only processes texts without an existing summary.
 *
 * Usage:
 *   node scripts/generate-summaries.mjs
 *
 * Dry-run (list texts that need summaries without calling the API):
 *   node scripts/generate-summaries.mjs --dry-run
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { generateSummary } from './lib/summary-prompt.mjs';
import { revalidateSite } from './lib/revalidate.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local'), override: true });

const dryRun = process.argv.includes('--dry-run');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function main() {
  const { data: texts, error: fetchError } = await supabase
    .from('texts')
    .select('id, slug, title, body, author:authors(name)')
    .eq('published', true)
    .is('summary', null)
    .order('title');

  if (fetchError) {
    console.error('Failed to fetch texts:', fetchError.message);
    process.exit(1);
  }

  const total = texts.length;
  if (total === 0) {
    console.log('All published texts already have summaries. Done.');
    return;
  }

  if (dryRun) {
    console.log(`${total} text${total === 1 ? '' : 's'} need summaries:\n`);
    texts.forEach((t, i) => {
      const authorName = t.author?.name ?? 'Unknown';
      console.log(`  ${i + 1}. ${t.title} — ${authorName}`);
    });
    return;
  }

  console.log(`Generating summaries for ${total} text${total === 1 ? '' : 's'}…\n`);

  let generated = 0;
  const livePages = [];

  for (let i = 0; i < texts.length; i++) {
    const text = texts[i];
    const authorName = text.author?.name ?? 'Unknown';
    process.stdout.write(`[${i + 1}/${total}] ${text.title} — ${authorName} … `);

    let summary;
    try {
      ({ summary } = await generateSummary({
        anthropic, title: text.title, author: authorName, source: text.body ?? '',
      }));
    } catch (err) {
      console.error(`✗ API error: ${err.message}`);
      continue;
    }

    const { error: writeError } = await supabase
      .from('texts')
      .update({ summary })
      .eq('id', text.id);

    if (writeError) {
      console.error(`✗ Write error: ${writeError.message}`);
      continue;
    }

    console.log(`✓ (${summary.length} chars)`);
    generated++;
    livePages.push(text.slug);
  }

  console.log(`\nDone. ${generated}/${total} summaries generated.`);
  // A summary is the reader's meta description and the text's listing card.
  // Cards on author/theme/era pages pick it up within the week.
  if (livePages.length) await revalidateSite({ texts: livePages, paths: ['/', '/texts'] });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
