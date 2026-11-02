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
import { normaliseMarkdown, rejoinSpuriousBreaks, overrideForFile } from './normalise-markdown.mjs';
import { detectScannos, loadCorpus, loadAllowlist } from './detect-scannos.mjs';
import { normaliseTitle, normaliseName } from './lib/dedup-match.mjs';
import { parseFrontmatter } from './lib/frontmatter.mjs';
import { stripChrome, assertNoChrome } from './lib/source-chrome.mjs';
import { leadingH1Verdict } from './lib/leading-h1.mjs';
import { needsSections } from './lib/sections.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const QUEUE_PATH = path.join(__dirname, 'ingestion', 'prospect-queue.json');
const OUTPUT_DIR = path.join(__dirname, 'ingestion', 'output');

// Scanno detection is flag-only at import time. Load the corpus index and
// allowlist once; if the index hasn't been built, detection is skipped silently
// (run scripts/build-corpus-index.mjs to enable it).
const scannoCorpus = loadCorpus();
const scannoAllowlist = loadAllowlist();

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

  // `author_id` is deliberately left null: collection authorship is derived
  // from the collection's texts (lib/collections/author.ts), so writing it here
  // would be a second copy of a fact the texts already carry — and the one that
  // silently goes stale. The column survives only as a manual override, set in
  // the admin edit form when a collection's own attribution differs from its
  // texts'. The author stub itself is still created: main() calls
  // resolveAuthor() before this, so the texts have someone to point at.
  const { data: created, error } = await supabase
    .from('collections')
    .insert({
      slug: prospect.collection_slug,
      title: prospect.title,
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
      // Exclude the review-summary meta file. Two naming conventions exist:
      // clean-archive-ocr.mjs writes `{slug}-review-summary.md`, while
      // fetch-texts.mjs writes `_review-summary.md` — matching on the shared
      // `review-summary.md` suffix catches both. (Missing the underscore form
      // previously made single-text digital imports look like 2-file
      // collections, spawning a phantom `collections` row.)
      .filter(f => f.endsWith('.md') && !f.endsWith('review-summary.md'))
      .sort()
      .map(f => path.join(dir, f));
    if (files.length > 0) return files;
  }

  const flatPath = path.join(OUTPUT_DIR, `${prospect.collection_slug}.md`);
  return fs.existsSync(flatPath) ? [flatPath] : [];
}

// ---------------------------------------------------------------------------
// Per-text import
// ---------------------------------------------------------------------------

// Every skip carries a `reason` so the caller can tell a benign skip
// (already_exists) apart from a real failure (everything else) — a prospect
// must never be marked "imported" on the strength of benign skips alone.
async function importTextFile(filePath, prospect, authorId, collectionId) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const { data, body } = parseFrontmatter(raw);

  if (!data.title || !data.slug || !body) {
    const msg = `${path.basename(filePath)} missing title/slug/body`;
    console.warn(`  ! ${msg} — skipped`);
    return { skipped: true, reason: 'missing_fields', detail: msg };
  }

  const { data: existing } = await supabase.from('texts').select('id').eq('slug', data.slug).maybeSingle();
  if (existing) {
    console.log(`  · ${data.slug} already imported — skipped`);
    return { skipped: true, reason: 'already_exists' };
  }

  // Title + author-name duplicate guard. The slug check above makes the import
  // idempotent, but the SAME work can already be live under a *different* slug —
  // and, when a draft author stub shadows the real author, under a different
  // author_id too. So also skip when a text with the same normalised title
  // already exists under an author whose name normalises the same, regardless
  // of slug/author_id/published. (Shares normalisation with dedup-draft-texts.mjs.)
  // A title differing only by curly quotes or whitespace is the CLI dedup tool's
  // backstop; this catches the common draft-author-stub case at the source.
  const { data: sameTitle } = await supabase
    .from('texts')
    .select('slug, published, title, authors(name)')
    .ilike('title', data.title);
  if (sameTitle && sameTitle.length > 0) {
    const wantTitle = normaliseTitle(data.title);
    const wantAuthor = normaliseName(prospect.author);
    const dup = sameTitle.find(
      t => normaliseTitle(t.title) === wantTitle && normaliseName(t.authors?.name) === wantAuthor
    );
    if (dup) {
      console.log(`  · "${data.title}" already exists as ${dup.slug} (${dup.published ? 'published' : 'draft'}) — skipped duplicate`);
      return { skipped: true, reason: 'already_exists' };
    }
  }

  const genreId = await resolveGenreId(data.genre);
  if (!genreId) {
    const msg = `genre "${data.genre}" not found for "${data.title}"`;
    console.warn(`  ! ${msg} — skipped`);
    return { skipped: true, reason: 'genre_not_found', detail: msg };
  }

  const themeIds = await resolveThemeIds(data.themes);

  const warnings = [];
  const corrections = [];

  // Page-break repair. Scanned/OCR sources split a sentence into two paragraphs
  // wherever a printed page ended; this rejoins those mid-sentence splits (and
  // only those — see rejoinSpuriousBreaks) so the stored body reads correctly.
  // Nothing else about the body's spacing is touched, and a body with no such
  // splits is inserted byte-for-byte unchanged.
  const override = overrideForFile(filePath);
  const { output: repairedBody, joined: breaksJoined } = rejoinSpuriousBreaks(body, { override });
  if (breaksJoined > 0) {
    corrections.push(`${data.slug}: rejoined ${breaksJoined} mid-sentence page-break split(s)`);
    console.log(`  ↩ rejoined ${breaksJoined} mid-sentence page-break split(s) in ${data.slug}`);
  }

  // Source-site chrome. The fetcher strips this at the DOM level and again at
  // the markdown level, but a staged file can predate a fixer, be hand-edited,
  // or come from a source whose markup moved — which is exactly how a New Advent
  // nav bar, logo and breadcrumb reached fourteen rows in September 2026 while
  // the fetcher that would have caught them was already correct. Import is the
  // last gate before the database, so it checks rather than trusts the file.
  //
  // Unambiguous chrome is stripped and counted, like the page-break rejoin
  // above; judgement calls (a duplicated title heading, an image path relative
  // to the source site) are flagged for review and left alone. The assert after
  // it is a self-check on this module rather than an independent detector — if
  // a strip ever leaves behind something its own detector still flags, the text
  // is refused rather than inserted half-cleaned.
  // A body that opens with its own title shows it twice, since the reader page
  // renders <h1>{title}</h1> above it. The verdict is conservative — it keeps
  // any heading it cannot prove is the work's name, and never touches one that
  // names a division (`Chapter 1.`, `Preface`) — so it is safe to apply here
  // rather than only in the healer. Without it, a staged file that predates the
  // last sweep imports with the duplicate; about fifty collections are staged
  // and not yet imported at the time of writing.
  const headingVerdict = leadingH1Verdict({ slug: data.slug, title: data.title, body: repairedBody });

  const { output: cleanBody, removed: chromeRemoved, advisories: chromeAdvisories } =
    stripChrome(repairedBody, {
      dropLeadingHeading: headingVerdict.drop ? headingVerdict.heading : false,
    });
  if (chromeRemoved.length > 0) {
    const detail = chromeRemoved.map(r => r.rule).join(', ');
    corrections.push(`${data.slug}: stripped ${chromeRemoved.length} source-chrome block(s) (${detail})`);
    console.log(`  ✂ stripped ${chromeRemoved.length} source-chrome block(s) in ${data.slug}: ${detail}`);
  }
  for (const advisory of chromeAdvisories) {
    warnings.push(`${data.slug}: ${advisory.why} — ${advisory.excerpt}`);
    console.warn(`  ⚠ ${advisory.rule} in ${data.slug}: ${advisory.why}`);
  }
  try {
    assertNoChrome(cleanBody, { label: data.slug });
  } catch (err) {
    console.warn(`  ! ${err.message}`);
    return { skipped: true, reason: 'chrome_survived', detail: err.message };
  }

  // Verse check (flag-only — never rewrites the body). A stanza silently split
  // into paragraphs is the one failure mode that ships wrong output, so surface
  // it at import time rather than let it be discovered after publication.
  const { report: normReport } = normaliseMarkdown(cleanBody, { override });
  if (normReport.verseFlags.length > 0) {
    const ranges = normReport.verseFlags.map(f => `${f.startLine}-${f.endLine}`).join(', ');
    const warning = `${data.slug}: ${normReport.verseFlags.length} verse run(s) flagged, review before publish (body lines ${ranges})`;
    warnings.push(warning);
    console.warn(`  ⚠ ${normReport.verseFlags.length} verse run(s) flagged in ${data.slug} — review before publish`);
  }

  // Scanno check (flag-only — never auto-corrects). Surface the Tier-1 count so
  // near-certain OCR errors are reviewed before publish. Skipped if the corpus
  // index isn't built yet.
  if (scannoCorpus) {
    const tier1 = detectScannos(cleanBody, { corpus: scannoCorpus, allowlist: scannoAllowlist, slug: data.slug })
      .filter(f => f.tier === 1).length;
    if (tier1 > 0) {
      warnings.push(`${data.slug}: ${tier1} Tier-1 scanno(s) flagged, review before publish`);
      console.warn(`  ⚠ ${tier1} Tier-1 scanno(s) flagged in ${data.slug} — run detect-scannos.mjs before publish`);
    }
  }

  // A non-null license carries its own attribution obligation (CC BY-SA and
  // similar require the work to be credited to its source, not just marked
  // public domain by omission). Refuse rather than import a licensed text
  // with nothing to attribute it to.
  const license = data.license || null;
  const sourceUrl = data.source_url || prospect.source_url || null;
  const sourceAttribution = data.source_attribution || null;
  if (license && (!sourceAttribution || !sourceUrl)) {
    const msg = `${data.slug}: license "${license}" set but source_attribution and/or source_url missing`;
    console.warn(`  ! ${msg}`);
    return { skipped: true, reason: 'license_missing_attribution', detail: msg };
  }

  const { data: text, error } = await supabase
    .from('texts')
    .insert({
      title: data.title,
      slug: data.slug,
      author_id: authorId,
      genre_id: genreId,
      body: cleanBody,
      collection_id: collectionId,
      collection_order: data.collection_order ?? null,
      source_url: sourceUrl,
      source_attribution: sourceAttribution,
      provenance_notes: data.provenance_notes || null,
      translation_notes: data.translation_notes || null,
      license,
      ocr_quality: data.ocr_quality || null,
      note_draft: data.note_draft || null,
      published: false,
    })
    .select('id')
    .single();

  if (error) {
    const msg = `insert failed for "${data.title}": ${error.message}`;
    console.warn(`  ! ${msg}`);
    return { skipped: true, reason: 'insert_failed', detail: msg };
  }

  if (themeIds.length > 0) {
    await supabase.from('text_themes').insert(themeIds.map(theme_id => ({ text_id: text.id, theme_id })));
  }

  console.log(`  + imported: ${data.title}`);
  // No flag is stored: the drafting script selects texts by the same definition,
  // so this one is drafted on its next run. The line just says it will be.
  // (word_count itself is set by the database; this count is only for the hint.)
  const wordCount = cleanBody.trim().split(/\s+/).filter(Boolean).length;
  if (needsSections({ word_count: wordCount, body: cleanBody })) {
    console.log(`    long, with no headings: sections will be drafted by the next \`npm run generate:review-drafts\``);
  }
  return { skipped: false, warnings, corrections };
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
      // No collection-level pre-flight skip. importTextFile skips per-text by
      // slug, and the finalizer below marks a prospect "imported" when every
      // file already existed — so re-runs stay idempotent while a prospect can
      // still add new chapters to a collection that already exists (e.g.
      // completing a multi-book work whose first book was imported earlier).
      const authorId = await resolveAuthor(prospect);
      const collectionId = files.length > 1 ? await resolveCollectionId(prospect) : null;

      let importedCount = 0;
      const failures = [];
      const reviewWarnings = [];
      const appliedCorrections = [];
      for (const file of files) {
        const result = await importTextFile(file, prospect, authorId, collectionId);
        if (!result.skipped) {
          importedCount++;
          if (result.warnings) reviewWarnings.push(...result.warnings);
          if (result.corrections) appliedCorrections.push(...result.corrections);
        } else if (result.reason !== 'already_exists') {
          failures.push(result.detail || result.reason);
        }
      }

      const today = new Date().toISOString().split('T')[0];

      if (importedCount > 0) {
        // Real progress was made. Still surface any partial failures rather
        // than let them go unnoticed just because the prospect overall succeeded.
        prospect.status = 'imported';
        let note = `Imported ${importedCount} text(s) on ${today}.`;
        if (failures.length > 0) {
          note += ` ${failures.length} file(s) failed and were NOT imported: ${failures.join(' | ')}`;
        }
        if (appliedCorrections.length > 0) {
          note += ` Auto-corrected: ${appliedCorrections.join(' | ')}.`;
        }
        if (reviewWarnings.length > 0) {
          note += ` REVIEW NEEDED before publish: ${reviewWarnings.join(' | ')}`;
        }
        prospect.stage_1_notes = prospect.stage_1_notes ? `${prospect.stage_1_notes} ${note}` : note;
      } else if (failures.length > 0) {
        // Nothing actually landed in the database — leave status as "staged"
        // so the next run retries, instead of silently claiming success.
        const note = `Import attempt on ${today} imported 0 text(s) — all ${failures.length} file(s) failed: ${failures.join(' | ')}. Status left as "staged" for retry.`;
        prospect.stage_1_notes = prospect.stage_1_notes ? `${prospect.stage_1_notes} ${note}` : note;
        console.warn(`  ! 0 imported, ${failures.length} failed — status left as "staged" for retry`);
      } else {
        // Every file was skipped for benign reasons (already_exists) — the
        // prospect's content is already fully represented in the database.
        prospect.status = 'imported';
        const note = `All ${files.length} file(s) already existed in the database as of ${today} — marked imported without inserting anything new.`;
        prospect.stage_1_notes = prospect.stage_1_notes ? `${prospect.stage_1_notes} ${note}` : note;
      }
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
