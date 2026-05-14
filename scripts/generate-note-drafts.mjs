/**
 * generate-note-drafts.mjs — Backfill editorial note drafts via Claude API
 *
 * Queries all texts where note_draft IS NULL, calls the Claude API for each,
 * and writes the result back to the database. Safe to re-run.
 *
 * Usage:
 *   node scripts/generate-note-drafts.mjs
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { NOTE_PROMPT } from './lib/note-prompt.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function generateDraft(title, authorName, body) {
  const userMessage = [
    `Title: ${title}`,
    `Author: ${authorName}`,
    ``,
    body.slice(0, 3000),
  ].join('\n');

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 300,
    system: NOTE_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  return message.content[0].text.trim();
}

async function main() {
  const { data: texts, error: fetchError } = await supabase
    .from('texts')
    .select('id, title, body, author:authors(name)')
    .is('note_draft', null);

  if (fetchError) {
    console.error('Failed to fetch texts:', fetchError.message);
    process.exit(1);
  }

  const total = texts.length;
  if (total === 0) {
    console.log('No texts need note drafts. Done.');
    return;
  }

  let generated = 0;

  for (let i = 0; i < texts.length; i++) {
    const text = texts[i];
    const authorName = text.author?.name ?? 'Unknown';
    console.log(`[${i + 1}/${total}] Generating draft for: ${text.title} — ${authorName}`);

    let draft;
    try {
      draft = await generateDraft(text.title, authorName, text.body ?? '');
    } catch (err) {
      console.error(`  ✗ API error for "${text.title}": ${err.message}`);
      continue;
    }

    const { error: writeError } = await supabase
      .from('texts')
      .update({ note_draft: draft })
      .eq('id', text.id);

    if (writeError) {
      console.error(`  ✗ Write error for "${text.title}": ${writeError.message}`);
      continue;
    }

    console.log(`  ✓ Done`);
    generated++;
  }

  console.log(`\nDone. ${generated} draft${generated === 1 ? '' : 's'} generated.`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
