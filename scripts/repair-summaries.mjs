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

// ── Prompt (mirrors the fix applied to generate-summaries.mjs) ───────────────
const SUMMARY_PROMPT = `You are writing a meta description for a text on The Stromata, a curated library of out-of-print Christian theological texts.

Write 1–2 complete sentences. Hard limit: 160 characters total — count carefully before responding. Every sentence must end with a period. If a sentence would push the total past 160 characters, write a shorter sentence instead. Never cut off mid-sentence or use ellipses.

Be descriptive and specific — tell the reader exactly what the text is and what it addresses. Do not be evaluative or promotional. Do not begin with the author's name or the title. Do not use phrases like "this important work" or "a must-read".

Return only the summary, with no preamble or explanation.`;

// ── Detect truncation ─────────────────────────────────────────────────────────
function isTruncated(summary) {
  if (!summary) return false;
  const s = summary.trim();
  if (s.endsWith('…') || s.endsWith('...')) return true;
  if (!/[.!?]$/.test(s)) return true;  // doesn't end at sentence boundary
  return false;
}

// ── Trim only at sentence boundary, never add ellipses ───────────────────────
function trimToLength(text, max) {
  if (text.length <= max) return text;
  const truncated = text.slice(0, max);
  const lastEnd = Math.max(
    truncated.lastIndexOf('.'),
    truncated.lastIndexOf('!'),
    truncated.lastIndexOf('?')
  );
  if (lastEnd > 0) return truncated.slice(0, lastEnd + 1).trim();
  return truncated.trim();
}

// ── Generate one summary, retrying with tighter limit if truncated ────────────
async function generateSummary(title, authorName, body, maxChars = 160, attempt = 1) {
  // Each retry tightens the char limit so the model fits within a complete sentence
  const limitInstruction = SUMMARY_PROMPT.replace('160 characters', `${maxChars} characters`);

  const userMessage = [
    `Title: ${title}`,
    `Author: ${authorName}`,
    '',
    body.slice(0, 3000),
  ].join('\n');

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 100,
    system: limitInstruction,
    messages: [{ role: 'user', content: userMessage }],
  });

  const result = trimToLength(message.content[0].text.trim(), maxChars);

  // Retry with a tighter limit (up to 4 attempts: 160 → 140 → 120 → 100)
  if (isTruncated(result) && attempt < 4) {
    await new Promise(r => setTimeout(r, 100)); // rate-limit between retries too
    return generateSummary(title, authorName, body, maxChars - 20, attempt + 1);
  }

  return result;
}

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
      newSummary = await generateSummary(text.title, authorName, text.body ?? '');
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
