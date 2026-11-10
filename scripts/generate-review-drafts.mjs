/**
 * generate-review-drafts.mjs — pre-generation for the /admin/review queue.
 *
 * The review queue is meant to be read and tapped through on a phone in spare
 * minutes. Anything that needs an API call has to be done BEFORE Keith opens
 * it, or every card becomes a wait. This script fills the three draft fields
 * the queue reads:
 *
 *   texts.note_draft            — the editorial introduction, where one is
 *                                 missing (4 drafts at time of writing). Uses
 *                                 the shared critic loop, so these are held to
 *                                 the same bar as every other note.
 *   texts.summary_draft         — the ~110–140 character summary, generated
 *                                 from title + note_draft rather than the body.
 *                                 A note_draft is already ~800 characters of
 *                                 distilled editorial prose about this exact
 *                                 text; summarising that instead of a
 *                                 30,000-word body costs a fraction and reads
 *                                 no worse. This is why note_drafts are filled
 *                                 first below — the summary depends on them.
 *   collections.description_draft — the collection blurb, ~800 characters,
 *                                 written from the collection's note_drafts.
 *   texts.sections_draft        — editor's sections for long texts with no
 *                                 headings (scripts/lib/sections.mjs has the
 *                                 definition). Unlike the three above, these
 *                                 targets are mostly PUBLISHED texts, so this
 *                                 step selects its own rows; they are reviewed
 *                                 at /admin/review/sections, not in the publish
 *                                 queue. A new import that meets the definition
 *                                 is picked up by the next run, with no flag.
 *   texts.paragraphs_draft      — proposed editorial paragraph breaks for
 *                                 texts with a prose paragraph of 800+ words
 *                                 (scripts/lib/paragraphs.mjs). Anchors only,
 *                                 never a body. Unpublished texts are drafted
 *                                 whatever their tier (new imports, the
 *                                 standing habit); published ones in tier
 *                                 order, Tier 1 by default (--tier=2 or 3 to
 *                                 go further). Reviewed at
 *                                 /admin/review/paragraphs.
 *
 * Nothing here publishes, and nothing here writes a live field: every write
 * goes to a *_draft column, which is what makes the script safe to re-run and
 * safe to run ahead of review.
 *
 * Meters (CLAUDE.md, "Supabase limits"): the sections step reads `body` only
 * for texts that need sections and have no draft, filtered on the server
 * first. The first backfill reads 33 bodies, about 3.4 MB of egress (under
 * 0.1% of the 5 GB cycle); later runs read only new imports. Anthropic tokens:
 * each text sends its paragraphs cut to 50 words, roughly 8–15k input tokens,
 * so the backfill is about $2 on Opus; the script prints the exact figure.
 *
 * The paragraphs step chooses its texts with the `paragraph_wall_stats` SQL
 * function (migration 038), which counts paragraph words inside the database,
 * so no body is downloaded to decide. It then reads the body of each chosen
 * text once. On 10 Nov 2026 the first run was 27 texts (25 published Tier 1,
 * 2 unpublished drafts), 3.6 MB of bodies (0.07% of the 5 GB cycle).
 * Anthropic tokens: one call per 800+ word prose paragraph, sending that
 * paragraph as numbered sentences. Those 27 texts hold 248 such paragraphs,
 * 314k words: about 530k input tokens and a few thousand output, so about $3
 * on Opus. `--dry-run` prints the tier report and the candidates without
 * calling anything; the script prints the exact cost of a real run.
 *
 * Usage:
 *   node scripts/generate-review-drafts.mjs                          # everything missing
 *   node scripts/generate-review-drafts.mjs --collection <slug>      # one collection
 *   node scripts/generate-review-drafts.mjs --standalone             # texts with no collection
 *   node scripts/generate-review-drafts.mjs --dry-run                # print the plan, call nothing
 *   node scripts/generate-review-drafts.mjs --force                  # regenerate drafts that exist
 *   node scripts/generate-review-drafts.mjs --limit=10               # cap the work
 *   node scripts/generate-review-drafts.mjs --sections               # only the sections step
 *   node scripts/generate-review-drafts.mjs --sections --slug=<slug> # sections for one text
 *   node scripts/generate-review-drafts.mjs --paragraphs             # only the paragraph-breaks step (Tier 1)
 *   node scripts/generate-review-drafts.mjs --paragraphs --tier=2    # … Tiers 1 and 2
 *   node scripts/generate-review-drafts.mjs --paragraphs --slug=<slug>
 *   node scripts/generate-review-drafts.mjs --paragraphs --dry-run   # the corpus report: tiers, candidates
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { NOTE_MODEL, generateNoteWithCritic } from './lib/note-prompt.mjs';
import {
  SUMMARY_MODEL,
  REVIEW_SUMMARY_GUIDANCE,
  generateSummary,
} from './lib/summary-prompt.mjs';
import {
  PRICES,
  costReport,
  selectDescriptionTargets,
  selectNoteTargets,
  selectSummaryTargets,
  summarySourceFor,
} from './lib/review-drafts.mjs';
import {
  HAS_CONTENTS_PATTERN,
  LONG_TEXT_WORDS,
  SECTIONS_PROMPT,
  bodyBlocks,
  buildSectionsDoc,
  parseDraftReply,
  promptDigest,
  selectSectionTargets,
  validatePicks,
} from './lib/sections.mjs';
import {
  FLAG_WORDS,
  PARAGRAPHS_PROMPT,
  buildParagraphsDoc,
  noBreaksDoc,
  paragraphStats,
  parseBreaksReply,
  selectParagraphTargets,
  sentenceDigest,
  tidyBreaks,
  tierFor,
  validatePicks as validateBreakPicks,
} from './lib/paragraphs.mjs';

const SECTIONS_MODEL = process.env.SECTIONS_MODEL || NOTE_MODEL;
const PARAGRAPHS_MODEL = process.env.PARAGRAPHS_MODEL || NOTE_MODEL;
// Texts per `paragraph_wall_stats` call; 60 measured at 0.2–0.7 s a page.
const WALL_STATS_PAGE = 60;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local'), override: true });

// ── Flags ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(name);
const flagValue = (name) => {
  const hit = args.find((a) => a.startsWith(`${name}=`));
  if (hit) return hit.slice(name.length + 1);
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('--') ? args[idx + 1] : null;
};

const MODE = {
  collection: flagValue('--collection'),
  standalone: hasFlag('--standalone'),
  dryRun: hasFlag('--dry-run'),
  force: hasFlag('--force'),
  limit: flagValue('--limit') ? parseInt(flagValue('--limit'), 10) : null,
  sections: hasFlag('--sections'),
  paragraphs: hasFlag('--paragraphs'),
  tier: flagValue('--tier') ? parseInt(flagValue('--tier'), 10) : 1,
  slug: flagValue('--slug'),
};

// ── Cost accounting ──────────────────────────────────────────────────────────
// Prices and the report live in lib/review-drafts.mjs, where they are unit
// tested — a cost report that silently reads $0.00 because a model id drifted
// is worse than no report at all.

const spend = new Map(); // model → { inputTokens, outputTokens }
function record(model, usage) {
  if (!usage) return;
  const bucket = spend.get(model) ?? { inputTokens: 0, outputTokens: 0 };
  bucket.inputTokens += usage.inputTokens ?? 0;
  bucket.outputTokens += usage.outputTokens ?? 0;
  spend.set(model, bucket);
}

function reportSpend() {
  if (spend.size === 0) {
    console.log('\nNo API calls made.');
    return;
  }
  const { lines, total, unpriced } = costReport(spend, PRICES);
  console.log('\n── Tokens and cost ─────────────────────────────────────────');
  for (const line of lines) console.log(`  ${line}`);
  console.log(
    `  TOTAL: $${total.toFixed(4)}` +
    (unpriced.length ? ` (excluding ${unpriced.join(', ')} — no price on file)` : '')
  );
}

// ── Clients ──────────────────────────────────────────────────────────────────
function requireEnv(name) {
  if (!process.env[name]) {
    console.error(`Missing ${name}. Set it in .env.local before running.`);
    process.exit(1);
  }
  return process.env[name];
}

const supabase = createClient(
  requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
  requireEnv('SUPABASE_SERVICE_ROLE_KEY')
);
// The API key is only needed for a real run; a dry run should work without it.
const anthropic = MODE.dryRun
  ? null
  : new Anthropic({ apiKey: requireEnv('ANTHROPIC_API_KEY') });

// ── The collection description prompt ────────────────────────────────────────
// Deliberately local rather than in scripts/lib: this is the only caller. The
// lesson the shared modules encode is that *duplicated* prompts drift — a
// single-caller prompt belongs with its caller until a second one appears.
const DESCRIPTION_PROMPT = `You are writing the description for a collection on The Stromata, a curated library of out-of-print Christian theological texts. A collection gathers the chapters or books of a single work.

You will be given the collection's title, its author, and the editorial notes written for several of its individual chapters. Write the description of the collection as a whole.

- About 800 characters. Three or four sentences.
- Describe the WORK, not the chapters individually, and not the library. What is it, what occasioned it, what does it argue or do, what is it like to read?
- Open with something concrete and specific to this work. Do not open with the title, the author's name, or "This collection".
- Do not list the chapters. Do not say how many there are.
- No marketing register, no evaluation of importance, no instructions to the reader about how to read it.
- Do not end with "Expect…", "Read it…", or an "X rather than Y" contrast.

Return only the description, with no preamble. End on a complete sentence.`;

async function generateDescription({ title, author, notes }) {
  const userMessage = [
    `Collection: ${title}`,
    `Author: ${author}`,
    '',
    'Editorial notes from chapters of this work:',
    ...notes.slice(0, 8).map((n, i) => `  (${i + 1}) ${n}`),
  ].join('\n');

  const message = await anthropic.messages.create({
    model: NOTE_MODEL,
    max_tokens: 700,
    system: DESCRIPTION_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });
  record(NOTE_MODEL, {
    inputTokens: message.usage?.input_tokens ?? 0,
    outputTokens: message.usage?.output_tokens ?? 0,
  });
  return (message.content?.[0]?.text ?? '').trim();
}

// ── Target selection ─────────────────────────────────────────────────────────

async function loadDraftTexts() {
  let query = supabase
    .from('texts')
    .select(
      'id, title, slug, body, note_draft, summary, summary_draft, author_id, collection_id, ' +
      'author:authors(name), collection:collections(slug)'
    )
    .eq('published', false)
    .order('collection_order', { nullsFirst: false });

  const { data, error } = await query;
  if (error) {
    console.error('Failed to load drafts:', error.message);
    process.exit(1);
  }

  let rows = data ?? [];
  if (MODE.collection) {
    rows = rows.filter((t) => t.collection?.slug === MODE.collection);
    if (rows.length === 0) {
      console.error(`No unpublished texts found in collection "${MODE.collection}".`);
      process.exit(1);
    }
  } else if (MODE.standalone) {
    rows = rows.filter((t) => !t.collection_id);
  }
  return rows;
}

// ── Step 1: note_draft ───────────────────────────────────────────────────────

async function fillNoteDrafts(texts, siblingsByAuthor) {
  const targets = selectNoteTargets(texts, { force: MODE.force });
  if (targets.length === 0) {
    console.log('Introductions: all present.\n');
    return 0;
  }

  const slice = MODE.limit ? targets.slice(0, MODE.limit) : targets;
  console.log(`Introductions: ${slice.length} to generate (model: ${NOTE_MODEL}).`);

  let done = 0;
  for (let i = 0; i < slice.length; i++) {
    const text = slice[i];
    const authorName = text.author?.name ?? 'Unknown';
    console.log(`  [${i + 1}/${slice.length}] ${text.title}`);

    if (MODE.dryRun) { done++; continue; }

    const siblingNotes = (siblingsByAuthor.get(text.author_id) ?? [])
      .filter((s) => s.id !== text.id)
      .map((s) => s.note)
      .filter(Boolean);

    let result;
    try {
      result = await generateNoteWithCritic({
        anthropic, title: text.title, author: authorName,
        body: text.body ?? '', siblingNotes,
        log: (msg) => console.log(`  ${msg}`),
      });
    } catch (err) {
      console.error(`    ✗ API error: ${err.message}`);
      continue;
    }
    record(NOTE_MODEL, result.usage);

    if (!result.note) {
      console.error('    ✗ no usable note produced; leaving unchanged');
      continue;
    }

    const { error } = await supabase
      .from('texts')
      .update({ note_draft: result.note })
      .eq('id', text.id);
    if (error) {
      console.error(`    ✗ write error: ${error.message}`);
      continue;
    }

    // Keep the in-memory row and the sibling map current: the summary step
    // below reads note_draft, and later notes by this author steer away from it.
    text.note_draft = result.note;
    const bucket = siblingsByAuthor.get(text.author_id) ?? [];
    const existing = bucket.find((s) => s.id === text.id);
    if (existing) existing.note = result.note;
    else bucket.push({ id: text.id, note: result.note });
    siblingsByAuthor.set(text.author_id, bucket);

    console.log(`    ✓ saved (${result.note.length} chars, score ${result.score ?? 'n/a'})`);
    done++;
  }
  console.log('');
  return done;
}

// ── Step 2: summary_draft ────────────────────────────────────────────────────

async function fillSummaryDrafts(texts) {
  // A text that already has a live `summary` needs no draft — the queue falls
  // back to it. `--force` regenerates regardless. (Selection is unit tested in
  // lib/review-drafts.test.mjs.)
  const targets = selectSummaryTargets(texts, { force: MODE.force });
  if (targets.length === 0) {
    console.log('Summaries: all present.\n');
    return 0;
  }

  const slice = MODE.limit ? targets.slice(0, MODE.limit) : targets;
  console.log(`Summaries: ${slice.length} to generate (model: ${SUMMARY_MODEL}).`);

  let done = 0;
  for (let i = 0; i < slice.length; i++) {
    const text = slice[i];
    const authorName = text.author?.name ?? 'Unknown';

    // Prefer the note_draft; fall back to the body only when there is still no
    // note (generation failed above, or --limit cut it off).
    const { source, from } = summarySourceFor(text);
    if (!source) {
      console.warn(`  [${i + 1}/${slice.length}] ${text.title} — no note_draft and no body; skipped`);
      continue;
    }

    if (MODE.dryRun) {
      console.log(`  [${i + 1}/${slice.length}] ${text.title} — from ${from}`);
      done++;
      continue;
    }

    let summary;
    try {
      const result = await generateSummary({
        anthropic, title: text.title, author: authorName, source,
        extraGuidance: REVIEW_SUMMARY_GUIDANCE,
      });
      summary = result.summary;
      record(SUMMARY_MODEL, result);
    } catch (err) {
      console.error(`  [${i + 1}/${slice.length}] ${text.title} — ✗ API error: ${err.message}`);
      continue;
    }

    if (!summary) {
      console.error(`  [${i + 1}/${slice.length}] ${text.title} — ✗ no usable summary`);
      continue;
    }

    const { error } = await supabase
      .from('texts')
      .update({ summary_draft: summary })
      .eq('id', text.id);
    if (error) {
      console.error(`  [${i + 1}/${slice.length}] ${text.title} — ✗ write error: ${error.message}`);
      continue;
    }

    text.summary_draft = summary;
    console.log(`  [${i + 1}/${slice.length}] ${text.title} — ✓ ${summary.length} chars`);
    done++;
  }
  console.log('');
  return done;
}

// ── Step 3: collections.description_draft ────────────────────────────────────

// Who a collection is by is derived from its texts — `collections.author_id` is
// only a manual override and is null for everything the pipeline creates, so
// reading it alone would hand the description prompt "Unknown" for most
// collections. Mirrors lib/collections/author.ts, which is the TypeScript copy
// the site renders from; this script runs under plain node and can't import it.
function collectionAuthorName(collection, texts) {
  const override = [collection.author].flat().filter(Boolean)[0];
  if (override?.name) return override.name;

  const names = [];
  for (const t of texts) {
    const name = [t.author].flat().filter(Boolean)[0]?.name;
    if (name && !names.includes(name)) names.push(name);
  }
  if (names.length === 0) return 'Unknown';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

async function fillCollectionDescriptions(texts) {
  const collectionIds = [...new Set(texts.map((t) => t.collection_id).filter(Boolean))];
  if (collectionIds.length === 0) {
    console.log('Collection descriptions: no collections in scope.\n');
    return 0;
  }

  const { data: collections, error } = await supabase
    .from('collections')
    .select('id, title, slug, description, description_draft, author:authors(name)')
    .in('id', collectionIds);
  if (error) {
    console.error('Failed to load collections:', error.message);
    return 0;
  }

  const targets = selectDescriptionTargets(collections ?? [], { force: MODE.force });
  if (targets.length === 0) {
    console.log('Collection descriptions: all present.\n');
    return 0;
  }

  console.log(`Collection descriptions: ${targets.length} to generate (model: ${NOTE_MODEL}).`);

  let done = 0;
  for (let i = 0; i < targets.length; i++) {
    const c = targets[i];
    const inCollection = texts.filter((t) => t.collection_id === c.id);
    const notes = inCollection.filter((t) => t.note_draft).map((t) => t.note_draft);

    if (notes.length === 0) {
      console.warn(`  [${i + 1}/${targets.length}] ${c.title} — no note drafts to write from; skipped`);
      continue;
    }

    if (MODE.dryRun) {
      console.log(`  [${i + 1}/${targets.length}] ${c.title} — from ${notes.length} note(s)`);
      done++;
      continue;
    }

    let description;
    try {
      description = await generateDescription({
        title: c.title,
        author: collectionAuthorName(c, inCollection),
        notes,
      });
    } catch (err) {
      console.error(`  [${i + 1}/${targets.length}] ${c.title} — ✗ API error: ${err.message}`);
      continue;
    }

    if (!description) {
      console.error(`  [${i + 1}/${targets.length}] ${c.title} — ✗ no usable description`);
      continue;
    }

    const { error: writeError } = await supabase
      .from('collections')
      .update({ description_draft: description })
      .eq('id', c.id);
    if (writeError) {
      console.error(`  [${i + 1}/${targets.length}] ${c.title} — ✗ write error: ${writeError.message}`);
      continue;
    }

    console.log(`  [${i + 1}/${targets.length}] ${c.title} — ✓ ${description.length} chars`);
    done++;
  }
  console.log('');
  return done;
}

// ── Step 4: texts.sections_draft ─────────────────────────────────────────────

async function fillSectionDrafts() {
  // Metadata first, with the "already has contents" test run on the server, so
  // no body is downloaded for a text that does not need sections.
  let query = supabase
    .from('texts')
    .select('id, title, slug, word_count, note_draft, editorial_introduction, sections_draft, author:authors(name)')
    .gte('word_count', LONG_TEXT_WORDS)
    .not('body', 'match', HAS_CONTENTS_PATTERN)
    .order('title');
  if (!MODE.force) query = query.is('sections_draft', null);
  if (MODE.slug) query = query.eq('slug', MODE.slug);

  const { data: candidates, error } = await query;
  if (error) {
    console.error('Failed to load section candidates:', error.message);
    return 0;
  }
  if (!candidates?.length) {
    console.log(`Sections: nothing to draft${MODE.slug ? ` for "${MODE.slug}"` : ''}.\n`);
    return 0;
  }

  const slice = MODE.limit ? candidates.slice(0, MODE.limit) : candidates;
  console.log(`Sections: ${slice.length} candidate(s) (model: ${SECTIONS_MODEL}).`);

  let done = 0;
  for (let i = 0; i < slice.length; i++) {
    const text = slice[i];
    const tag = `  [${i + 1}/${slice.length}] ${text.title}`;

    // One body at a time, and only for a candidate.
    const { data: row, error: bodyError } = await supabase
      .from('texts')
      .select('body')
      .eq('id', text.id)
      .single();
    if (bodyError || !row?.body) {
      console.error(`${tag} — ✗ could not read the body`);
      continue;
    }
    // The server filter is a prefilter; the shared definition decides.
    const [target] = selectSectionTargets([{ ...text, body: row.body }], { force: MODE.force });
    if (!target) {
      console.log(`${tag} — has contents already; skipped`);
      continue;
    }

    const blocks = bodyBlocks(row.body);
    if (MODE.dryRun) {
      console.log(`${tag} — ${blocks.length} paragraphs`);
      done++;
      continue;
    }

    const userMessage = [
      `Title: ${text.title}`,
      `Author: ${[text.author].flat()[0]?.name ?? 'Unknown'}`,
      '',
      `Editor's introduction: ${text.editorial_introduction ?? text.note_draft ?? '(none)'}`,
      '',
      `The text, ${blocks.length} paragraphs:`,
      promptDigest(blocks),
    ].join('\n');

    let picks;
    try {
      const message = await anthropic.messages.create({
        model: SECTIONS_MODEL,
        max_tokens: 1000,
        system: SECTIONS_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      });
      record(SECTIONS_MODEL, {
        inputTokens: message.usage?.input_tokens ?? 0,
        outputTokens: message.usage?.output_tokens ?? 0,
      });
      picks = parseDraftReply(message.content?.[0]?.text);
    } catch (err) {
      console.error(`${tag} — ✗ ${err.message}`);
      continue;
    }

    // The prompt asks for the first section at paragraph 1; hold it to that
    // rather than leave the opening paragraphs outside every section.
    if (picks.length) picks[0].paragraph = 0;
    const problems = validatePicks(picks, blocks.length);
    if (problems.length) {
      console.error(`${tag} — ✗ unusable draft: ${problems.join(' ')}`);
      continue;
    }

    const { error: writeError } = await supabase
      .from('texts')
      .update({ sections_draft: buildSectionsDoc(blocks, picks) })
      .eq('id', text.id);
    if (writeError) {
      console.error(`${tag} — ✗ write error: ${writeError.message}`);
      continue;
    }
    console.log(`${tag} — ✓ ${picks.map((p) => p.label).join(' · ')}`);
    done++;
  }
  console.log('');
  return done;
}

// ── Step 5: texts.paragraphs_draft ───────────────────────────────────────────

async function fillParagraphDrafts() {
  // Paragraph word counts come from the database, so deciding which texts to
  // draft downloads no bodies. One page of texts per call: the whole corpus in
  // one call outran the API's 8 s statement timeout (migration 039).
  const { count: textCount, error: countError } = await supabase
    .from('texts')
    .select('id', { count: 'exact', head: true });
  if (countError) {
    console.error(`Failed to count texts: ${countError.message}`);
    return 0;
  }
  const rows = [];
  for (let offset = 0; offset < (textCount ?? 0); offset += WALL_STATS_PAGE) {
    const { data: page, error } = await supabase.rpc('paragraph_wall_stats', {
      min_words: FLAG_WORDS,
      page_offset: offset,
      page_size: WALL_STATS_PAGE,
    });
    if (error) {
      console.error(
        `Failed to load paragraph figures: ${error.message}` +
        (/paragraph_wall_stats/.test(error.message) ? ' (have migrations 038 and 039 been applied?)' : '')
      );
      return 0;
    }
    rows.push(...(page ?? []));
  }

  // The corpus report: every text with an 800+ word paragraph, by tier.
  const byTier = { 1: [0, 0], 2: [0, 0], 3: [0, 0] };
  for (const r of rows) {
    const t = tierFor(r);
    if (t) byTier[t][r.published ? 0 : 1]++;
  }
  console.log(`Paragraphs: texts with a ${FLAG_WORDS}+ word paragraph (published · unpublished):`);
  console.log(`  Tier 1  ${byTier[1][0]} · ${byTier[1][1]}   1,000+ word paragraph, 90%+ of words in 300+ word paragraphs`);
  console.log(`  Tier 2  ${byTier[2][0]} · ${byTier[2][1]}   1,000+ word paragraph`);
  console.log(`  Tier 3  ${byTier[3][0]} · ${byTier[3][1]}   800–999`);
  const states = rows.reduce((m, r) => ({ ...m, [r.draft_state]: (m[r.draft_state] ?? 0) + 1 }), {});
  console.log(
    `  Proposals: ${states.pending ?? 0} pending · ${states.held ?? 0} held · ${states.applied ?? 0} applied.`
  );

  // --force redrafts pending proposals only when this step is asked for by
  // name: a plain forced run (to redo summaries) must not re-spend ~$3 here.
  const targets = selectParagraphTargets(rows, {
    maxTier: MODE.tier,
    force: MODE.force && MODE.paragraphs,
    slug: MODE.slug,
  });
  if (!targets.length) {
    console.log(`Paragraphs: nothing to draft${MODE.slug ? ` for "${MODE.slug}"` : ''}.\n`);
    return 0;
  }
  const slice = MODE.limit ? targets.slice(0, MODE.limit) : targets;
  console.log(
    `Paragraphs: ${slice.length} candidate(s), published up to Tier ${MODE.tier} plus unpublished (model: ${PARAGRAPHS_MODEL}).`
  );

  let done = 0;
  let wallCount = 0;
  for (let i = 0; i < slice.length; i++) {
    const text = slice[i];
    const tag = `  [${i + 1}/${slice.length}] T${tierFor(text)} ${text.title}`;

    if (MODE.dryRun) {
      console.log(`${tag} — longest paragraph ${text.max_words} words`);
      done++;
      continue;
    }

    // One body at a time, and only for a candidate.
    const { data: row, error: bodyError } = await supabase
      .from('texts')
      .select('body, author:authors(name)')
      .eq('id', text.id)
      .single();
    if (bodyError || !row?.body) {
      console.error(`${tag} — ✗ could not read the body`);
      continue;
    }
    const body = row.body;
    const { blocks, walls } = paragraphStats(body);
    if (!walls.length) {
      // Stored as a held, empty proposal so later runs do not read this body again.
      await supabase
        .from('texts')
        .update({ paragraphs_draft: noBreaksDoc('The long paragraphs are verse, a list or a quotation; left alone.') })
        .eq('id', text.id);
      console.log(`${tag} — no long prose paragraph (verse, list or quotation); recorded, skipped`);
      continue;
    }
    wallCount += walls.length;

    const picks = [];
    let failed = false;
    for (const w of walls) {
      const userMessage = [
        `Title: ${text.title}`,
        `Author: ${[row.author].flat()[0]?.name ?? 'Unknown'}`,
        '',
        `The paragraph, ${blocks[w].words} words:`,
        sentenceDigest(blocks[w].text),
      ].join('\n');
      try {
        const message = await anthropic.messages.create({
          model: PARAGRAPHS_MODEL,
          max_tokens: 300,
          system: PARAGRAPHS_PROMPT,
          messages: [{ role: 'user', content: userMessage }],
        });
        record(PARAGRAPHS_MODEL, {
          inputTokens: message.usage?.input_tokens ?? 0,
          outputTokens: message.usage?.output_tokens ?? 0,
        });
        // The reply only ever narrows: out-of-range, repeated or crowded breaks are dropped.
        for (const sentence of tidyBreaks(blocks[w].text, parseBreaksReply(message.content?.[0]?.text))) {
          picks.push({ paragraph: w, sentence });
        }
      } catch (err) {
        console.error(`${tag} — ✗ paragraph ${w + 1}: ${err.message}`);
        failed = true;
        break;
      }
    }
    if (failed) continue;
    if (!picks.length) {
      // A decision, not a failure: record it so the next run does not pay for it again.
      const { error: noneError } = await supabase
        .from('texts')
        .update({ paragraphs_draft: noBreaksDoc('Claude found no turn worth a break in the long paragraphs.') })
        .eq('id', text.id);
      console.log(
        `${tag} — no turn found in ${walls.length} long paragraph(s); ${noneError ? `✗ ${noneError.message}` : 'recorded as held'}`
      );
      continue;
    }

    const problems = validateBreakPicks(body, picks);
    if (problems.length) {
      console.error(`${tag} — ✗ unusable draft: ${problems.join(' ')}`);
      continue;
    }
    const { error: writeError } = await supabase
      .from('texts')
      .update({ paragraphs_draft: buildParagraphsDoc(body, picks) })
      .eq('id', text.id);
    if (writeError) {
      console.error(`${tag} — ✗ write error: ${writeError.message}`);
      continue;
    }
    console.log(`${tag} — ✓ ${picks.length} break(s) across ${walls.length} paragraph(s)`);
    done++;
  }
  if (!MODE.dryRun) console.log(`  ${wallCount} long paragraph(s) read.`);
  console.log('');
  return done;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (MODE.paragraphs) {
    console.log(
      `Drafting paragraph breaks${MODE.slug ? ` for "${MODE.slug}"` : ''}` +
      `${MODE.dryRun ? ' (dry run — no API calls, no writes)' : ''}` +
      `${MODE.force ? ' (force — redrafting existing drafts)' : ''}\n`
    );
    const paragraphs = await fillParagraphDrafts();
    console.log(`── Summary ─────────────────────────────────────────────────`);
    console.log(`  Paragraph proposals ${MODE.dryRun ? 'would draft' : 'drafted'}: ${paragraphs}`);
    reportSpend();
    if (!MODE.dryRun && paragraphs > 0) console.log('\nReview them at /admin/review/paragraphs.');
    return;
  }

  if (MODE.sections) {
    console.log(
      `Drafting sections${MODE.slug ? ` for "${MODE.slug}"` : ''}` +
      `${MODE.dryRun ? ' (dry run — no API calls, no writes)' : ''}` +
      `${MODE.force ? ' (force — redrafting existing drafts)' : ''}\n`
    );
    const sections = await fillSectionDrafts();
    console.log(`── Summary ─────────────────────────────────────────────────`);
    console.log(`  Sections ${MODE.dryRun ? 'would draft' : 'drafted'}: ${sections}`);
    reportSpend();
    if (!MODE.dryRun && sections > 0) console.log('\nReview them at /admin/review/sections.');
    return;
  }

  const scope = MODE.collection
    ? `collection "${MODE.collection}"`
    : MODE.standalone
      ? 'standalone drafts'
      : 'all drafts';
  console.log(
    `Pre-generating review drafts for ${scope}` +
    `${MODE.dryRun ? ' (dry run — no API calls, no writes)' : ''}` +
    `${MODE.force ? ' (force — regenerating existing drafts)' : ''}\n`
  );

  const texts = await loadDraftTexts();
  console.log(`${texts.length} unpublished text(s) in scope.\n`);
  // Sections are drafted for published texts too, so an empty draft queue does
  // not end the run; only a run scoped to a collection skips them.
  const sections = MODE.collection || MODE.standalone ? 0 : await fillSectionDrafts();
  const paragraphs = MODE.collection || MODE.standalone ? 0 : await fillParagraphDrafts();
  if (texts.length === 0) {
    console.log(`── Summary ─────────────────────────────────────────────────`);
    console.log(`  Sections ${MODE.dryRun ? 'would draft' : 'drafted'}: ${sections}`);
    console.log(`  Paragraph proposals ${MODE.dryRun ? 'would draft' : 'drafted'}: ${paragraphs}`);
    reportSpend();
    return;
  }

  // Sibling notes per author, so the critic loop can steer a new note away from
  // the cluster it belongs to. Built from the whole corpus, not just this scope.
  const { data: allNoted } = await supabase
    .from('texts')
    .select('id, author_id, note_draft')
    .not('note_draft', 'is', null);
  const siblingsByAuthor = new Map();
  for (const t of allNoted ?? []) {
    if (!t.author_id) continue;
    if (!siblingsByAuthor.has(t.author_id)) siblingsByAuthor.set(t.author_id, []);
    siblingsByAuthor.get(t.author_id).push({ id: t.id, note: t.note_draft });
  }

  // Order matters: summaries are written from note_drafts.
  const notes = await fillNoteDrafts(texts, siblingsByAuthor);
  const summaries = await fillSummaryDrafts(texts);
  const descriptions = await fillCollectionDescriptions(texts);

  console.log('── Summary ─────────────────────────────────────────────────');
  const verb = MODE.dryRun ? 'would generate' : 'generated';
  console.log(`  Introductions ${verb}: ${notes}`);
  console.log(`  Summaries ${verb}: ${summaries}`);
  console.log(`  Collection descriptions ${verb}: ${descriptions}`);
  console.log(`  Sections ${verb}: ${sections}`);
  console.log(`  Paragraph proposals ${verb}: ${paragraphs}`);
  reportSpend();
  if (!MODE.dryRun) console.log('\nReview them at /admin/review.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
