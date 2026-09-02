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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local'), override: true });

const dryRun = process.argv.includes('--dry-run');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SUMMARY_PROMPT = `You are writing a meta description for a text on The Stromata, a curated library of out-of-print Christian theological texts.

Write 1–2 complete sentences. Hard limit: 160 characters total — count carefully before responding. Every sentence must end with a period. If a sentence would push the total past 160 characters, write a shorter sentence instead. Never cut off mid-sentence or use ellipses.

Be descriptive and specific — tell the reader exactly what the text is and what it addresses. Do not be evaluative or promotional. Do not begin with the author's name or the title. Do not use phrases like "this important work" or "a must-read".

Return only the summary, with no preamble or explanation.`;

// Reduce to the longest run of whole sentences that fits within `max`.
// Never cuts mid-sentence; only if a single sentence already exceeds `max`
// does it fall back to a word-boundary cut, so a word is never split.
function trimToLength(text, max) {
  const clean = text.trim();
  if (clean.length <= max) return clean;
  const sentences = clean.match(/[^.!?]+[.!?]+/g) ?? [];
  let out = '';
  for (const sentence of sentences) {
    if ((out + sentence).length > max) break;
    out += sentence;
  }
  out = out.trim();
  if (out) return out;
  // No whole sentence fits — cut at the last word boundary, never mid-word.
  const slice = clean.slice(0, max);
  const lastSpace = slice.lastIndexOf(' ');
  return (lastSpace > 0 ? slice.slice(0, lastSpace) : slice).trim();
}

// Generate a summary. If the model overshoots 160 characters or stops
// mid-sentence, hand its own draft back with the exact character count and ask
// it to rewrite shorter. Feeding the overshoot back lets the model
// self-correct — far more reliable than silently re-trimming a hidden,
// ever-tighter limit, which is what produced summaries cut off mid-word.
async function generateSummary(title, authorName, body) {
  const userMessage = [
    `Title: ${title}`,
    `Author: ${authorName}`,
    '',
    body.slice(0, 3000),
  ].join('\n');

  const conversation = [{ role: 'user', content: userMessage }];
  let fallback = '';
  let lastTrim = '';
  for (let attempt = 1; attempt <= 4; attempt++) {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: SUMMARY_PROMPT,
      messages: conversation,
    });
    const candidate = message.content[0].text.trim();
    if (candidate.length <= 160 && /[.!?]$/.test(candidate)) return candidate;
    lastTrim = trimToLength(candidate, 160);
    if (/[.!?]$/.test(lastTrim) && lastTrim.length >= fallback.length) fallback = lastTrim;
    conversation.push({ role: 'assistant', content: candidate });
    conversation.push({
      role: 'user',
      content: `That draft was ${candidate.length} characters. Rewrite it as one or two complete sentences, each ending in a period, totalling 160 characters or fewer. Return only the summary.`,
    });
  }
  return fallback || lastTrim;
}

async function main() {
  const { data: texts, error: fetchError } = await supabase
    .from('texts')
    .select('id, title, body, author:authors(name)')
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

  for (let i = 0; i < texts.length; i++) {
    const text = texts[i];
    const authorName = text.author?.name ?? 'Unknown';
    process.stdout.write(`[${i + 1}/${total}] ${text.title} — ${authorName} … `);

    let summary;
    try {
      summary = await generateSummary(text.title, authorName, text.body ?? '');
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
  }

  console.log(`\nDone. ${generated}/${total} summaries generated.`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
