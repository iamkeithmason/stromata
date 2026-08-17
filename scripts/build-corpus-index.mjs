#!/usr/bin/env node

/**
 * build-corpus-index.mjs — word-frequency index across all published texts.
 *
 * This is the foundation of detect-scannos.mjs and its strongest signal: a
 * word appearing once or twice across the whole library is almost always OCR
 * damage, while archaic forms like "shew" will have hundreds of occurrences and
 * so are self-evidently correct — no dictionary can make that distinction.
 *
 * Reads `body` for every published text from Supabase, tokenises (excluding
 * front matter, code, and tables), and writes data/corpus-frequency.json:
 *
 *   {
 *     meta:  { textCount, totalTokens, distinctWords, builtAt },
 *     words: { "<word>": { count, texts } }   // texts = distinct texts it appears in
 *   }
 *
 * The per-word `texts` count matters: 40 occurrences in one text is a different
 * signal from one occurrence in each of 40 texts.
 *
 * Usage:
 *   node scripts/build-corpus-index.mjs [--refresh]
 *
 * The index is a build artefact (gitignored). --refresh rebuilds it even if it
 * already exists.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

import { tokenize, wordKey } from './lib/corpus-tokenize.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local'), override: true });

export const CORPUS_PATH = path.join(__dirname, '..', 'data', 'corpus-frequency.json');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const refresh = process.argv.slice(2).includes('--refresh');

  if (fs.existsSync(CORPUS_PATH) && !refresh) {
    console.log(`Corpus index already exists: ${path.relative(process.cwd(), CORPUS_PATH)}`);
    console.log('Pass --refresh to rebuild.');
    return;
  }

  console.log('Fetching published texts…');
  const { data: texts, error } = await supabase.from('texts').select('slug, body').eq('published', true);
  if (error) throw new Error(`Supabase query failed: ${error.message}`);
  if (!texts || texts.length === 0) {
    console.warn('No published texts found — writing an empty index.');
  }

  const words = Object.create(null);
  let totalTokens = 0;

  for (const text of texts || []) {
    if (!text.body) continue;
    const seenInText = new Set();
    for (const { word } of tokenize(text.body)) {
      const key = wordKey(word);
      totalTokens++;
      const entry = words[key] || (words[key] = { count: 0, texts: 0 });
      entry.count++;
      if (!seenInText.has(key)) {
        seenInText.add(key);
        entry.texts++;
      }
    }
  }

  const meta = {
    textCount: texts ? texts.length : 0,
    totalTokens,
    distinctWords: Object.keys(words).length,
    builtAt: new Date().toISOString(),
  };

  fs.mkdirSync(path.dirname(CORPUS_PATH), { recursive: true });
  fs.writeFileSync(CORPUS_PATH, JSON.stringify({ meta, words }, null, 0) + '\n', 'utf8');

  console.log(`✓ Wrote ${path.relative(process.cwd(), CORPUS_PATH)}`);
  console.log(`  ${meta.textCount} text(s) · ${meta.totalTokens} tokens · ${meta.distinctWords} distinct words`);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
