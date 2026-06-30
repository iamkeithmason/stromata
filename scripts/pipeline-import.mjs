/**
 * pipeline-import.mjs — Stage 5a: import staged pipeline output into Supabase
 *
 * Reads prospect-queue.json for status: "staged" items, parses the markdown
 * output from Stage 2/3/4, and inserts each text as `published: false`.
 * Creates a draft author stub if the author isn't already in the database.
 *
 * HARD CONSTRAINTS (see CLAUDE.md):
 *   - Never sets `published: true`.
 *   - Never writes `editorial_introduction` — that stays null until Keith
 *     reviews and promotes the note_draft himself in the text edit form.
 *   - Re-verifies copyright (death_year < 1900, or translation_copyright_clear
 *     with translator_death_year < 1928) before inserting.
 *
 * Idempotent: skips any text whose slug already exists in the database.
 *
 * Usage:
 *   node scripts/pipeline-import.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const QUEUE_PATH = path.join(__dirname, 'ingestion', 'prospect-queue.json');
const OUTPUT_DIR = path.join(__dirname, 'ingestion', 'output');

// ---------------------------------------------------------------------------
// Frontmatter parsing — the pipeline's frontmatter is flat key: value YAML,
// no nesting, so a hand-rolled parser avoids adding a dependency.
// ---------------------------------------------------------------------------

function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: raw.trim() };

  const [, frontmatterBlock, rest] = match;
  const data = {};

  for (const line of frontmatterBlock.split('\n')) {
    const m = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (!m) continue;
    const [, key, rawValue] = m;
    // Strip inline YAML comments (two or more spaces + # + rest of line).
    // Two-space minimum avoids stripping # inside content like URLs.
    const cleanValue = rawValue.trim().replace(/\s{2,}#.*$/, '').trim();
    data[key] = parseValue(cleanValue);
  }

  const body = stripEditorialIntroPlaceholder(rest.trim());
  return { data, body };
}

function parseValue(value) {
  if (value === '') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+$/.test(value)) return Number(value);

  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map(v => stripQuotes(v.trim()));
  }

  return stripQuotes(value);
}

function stripQuotes(value) {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return value;
}

function stripEditorialIntroPlaceholder(body) {
  return body
    .replace(/<!--\s*EDITORIAL INTRO[\s\S]*?-->\n?/, '')
    .trim();
}

// ---------------------------------------------------------------------------
// Author resolution — find by name, or create a draft stub.
// ---------------------------------------------------------------------------

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

async function resolveAuthor(prospect) {
  const { data: existing } = await supabase
    .from('authors')
    .select('id, slug')
    .ilike('name', prospect.author)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: tradition } = await supabase
    .from('traditions')
    .select('id')
    .eq('slug', prospect.tradition)
    .single();

  if (!tradition) {
    throw new Error(`Unknown tradition slug "${prospect.tradition}" — check controlled vocabulary.`);
  }

  let eraId = null;
  if (prospect.era) {
    const { data: era } = await supabase.from('eras').select('id').eq('slug', prospect.era).single();
    eraId = era?.id ?? null;
  }

  const { data: created, error } = await supabase
    .from('authors')
    .insert({
      name: prospect.author,
      slug: slugify(prospect.author),
      tradition_id: tradition.id,
      era_id: eraId,
      death_year: prospect.death_year ?? null,
      draft: true,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to create draft author "${prospect.author}": ${error.message}`);

  console.log(`  + created draft author stub: ${prospect.author}`);
  return created.id;
}

// ---------------------------------------------------------------------------
// Genre / theme resolution
// ---------------------------------------------------------------------------

async function resolveGenreId(genreName) {
  if (!genreName) return null;
  const { data } = await supabase.from('genres').select('id').ilike('name', genreName).maybeSingle();
  return data?.id ?? null;
}

async function resolveThemeIds(themeValues) {
  if (!themeValues || themeValues.length === 0) return [];
  const { data: themes } = await supabase.from('themes').select('id, slug, name');
  if (!themes) return [];

  const ids = [];
  for (const value of themeValues) {
    const match = themes.find(
      t => t.slug.toLowerCase() === value.toLowerCase() || t.name.toLowerCase() === value.toLowerCase()
    );
    if (match) ids.push(match.id);
    else console.warn(`  ! theme "${value}" not found in controlled vocabulary — skipped`);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Copyright re-verification (defense in depth — Stage 1 already checked this)
// ---------------------------------------------------------------------------

function copyrightClear(prospect) {
  if (prospect.death_year && prospect.death_year < 1900) return true;
  if (prospect.translation_copyright_clear && prospect.translator_death_year && prospect.translator_death_year < 1928) {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Collection resolution (digital multi-chapter sources only)
// ---------------------------------------------------------------------------

async function resolveCollectionId(prospect) {
  const { data: existing } = await supabase
    .from('collections')
    .select('id')
    .eq('slug', prospect.collection_slug)
    .maybeSingle();

  if (existing) return existing.id;

  const authorId = await resolveAuthor(prospect);

  const { data: created, error } = await supabase
    .from('collections')
    .insert({
      slug: prospect.collection_slug,
      title: prospect.title,
      author_id: authorId,
      published: false,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to create collection "${prospect.collection_slug}": ${error.message}`);
  return created.id;
}

// ---------------------------------------------------------------------------
// Output file discovery — checks directory first (multi-chapter split),
// falls back to flat file. Source type doesn't determine the shape —
// the actual output does, since OCR works may now be split into sections.
// ---------------------------------------------------------------------------

function findOutputFiles(prospect) {
  const dir = path.join(OUTPUT_DIR, prospect.collection_slug);
  if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
    const files = fs
      .readdirSync(dir)
      .filter(f => f.endsWith('.md') && !f.endsWith('-review-summary.md'))
      .sort()
      .map(f => path.join(dir, f));
    if (files.length > 0) return files;
  }

  const flatPath = path.join(OUTPUT_DIR, `${prospect.collection_slug}.md`);
  return fs.existsSync(flatPath) ? [flatPath] : [];
}

// ---------------------------------------------------------------------------
// Pre-flight existence check — avoids re-running all pipeline stages for
// texts that are already in the database.
// ---------------------------------------------------------------------------

async function alreadyInDatabase(prospect) {
  // Check for an existing collection by slug
  const { data: col } = await supabase
    .from('collections')
    .select('id')
    .eq('slug', prospect.collection_slug)
    .maybeSingle();
  if (col) return true;

  // Check for an existing text whose slug is or starts with the collection slug
  const { data: texts } = await supabase
    .from('texts')
    .select('id')
    .or(`slug.eq.${prospect.collection_slug},slug.like.${prospect.collection_slug}-%`)
    .limit(1);
  return !!(texts && texts.length > 0);
}

// ---------------------------------------------------------------------------
// Per-text import
// ---------------------------------------------------------------------------

async function importTextFile(filePath, prospect, authorId, collectionId) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const { data, body } = parseFrontmatter(raw);

  if (!data.title || !data.slug || !body) {
    console.warn(`  ! ${path.basename(filePath)} missing title/slug/body — skipped`);
    return { skipped: true };
  }

  const { data: existing } = await supabase.from('texts').select('id').eq('slug', data.slug).maybeSingle();
  if (existing) {
    console.log(`  · ${data.slug} already imported — skipped`);
    return { skipped: true };
  }

  const genreId = await resolveGenreId(data.genre);
  if (!genreId) {
    console.warn(`  ! genre "${data.genre}" not found for "${data.title}" — skipped`);
    return { skipped: true };
  }

  const themeIds = await resolveThemeIds(data.themes);

  const { data: text, error } = await supabase
    .from('texts')
    .insert({
      title: data.title,
      slug: data.slug,
      author_id: authorId,
      genre_id: genreId,
      body,
      collection_id: collectionId,
      collection_order: data.collection_order ?? null,
      source_attribution: data.source_attribution || null,
      provenance_notes: data.provenance_notes || null,
      translation_notes: data.translation_notes || null,
      ocr_quality: data.ocr_quality || null,
      note_draft: data.note_draft || null,
      published: false,
    })
    .select('id')
    .single();

  if (error) {
    console.warn(`  ! insert failed for "${data.title}": ${error.message}`);
    return { skipped: true };
  }

  if (themeIds.length > 0) {
    await supabase.from('text_themes').insert(themeIds.map(theme_id => ({ text_id: text.id, theme_id })));
  }

  console.log(`  + imported: ${data.title}`);
  return { skipped: false };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const queue = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'));
  const staged = queue.prospects.filter(p => p.status === 'staged');

  if (staged.length === 0) {
    console.log('No staged prospects to import.');
    return;
  }

  console.log(`Found ${staged.length} staged prospect(s).\n`);

  for (const prospect of staged) {
    console.log(`${prospect.id}`);

    if (!copyrightClear(prospect)) {
      prospect.status = 'rejected';
      prospect.rejection_reason = 'Failed copyright re-verification at import time.';
      console.warn(`  ! copyright check failed — rejected`);
      continue;
    }

    const files = findOutputFiles(prospect);
    if (files.length === 0) {
      console.warn(`  ! no output files found — leaving status as "staged"`);
      continue;
    }

    try {
      if (await alreadyInDatabase(prospect)) {
        console.log(`  · already in database — status unchanged, skipping`);
        console.log('');
        continue;
      }

      const authorId = await resolveAuthor(prospect);
      const collectionId = files.length > 1 ? await resolveCollectionId(prospect) : null;

      let importedCount = 0;
      for (const file of files) {
        const result = await importTextFile(file, prospect, authorId, collectionId);
        if (!result.skipped) importedCount++;
      }

      prospect.status = 'imported';
      prospect.stage_1_notes = prospect.stage_1_notes
        ? `${prospect.stage_1_notes} Imported ${importedCount} text(s) on ${new Date().toISOString().split('T')[0]}.`
        : `Imported ${importedCount} text(s) on ${new Date().toISOString().split('T')[0]}.`;
    } catch (err) {
      console.warn(`  ! ${err.message}`);
    }

    console.log('');
  }

  fs.writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2) + '\n');
  console.log('Queue updated. Review imported texts at /admin/drafts.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
