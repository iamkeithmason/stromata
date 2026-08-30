/**
 * audit-dead-links.mjs — read-only integrity audit for half-published content
 *
 * Finds published content whose author or collection is still hidden. The
 * public pages now degrade gracefully (the author page renders bio-less, the
 * collection link falls back to a standalone text), so these are no longer hard
 * 404s — but they're almost always an oversight worth finishing:
 *
 *   1. Published text  → unpublished collection   (collection hidden from the site)
 *   2. Published text  → draft author             (author has no public bio / index entry)
 *   3. Thin / phantom collections (<= 1 text)      (informational — often a
 *      single text wrongly wrapped in a collection by an import miscount)
 *
 * Read-only: it never writes to the database. Safe to run after any pipeline
 * batch, or in CI. Exits non-zero if any issue (checks 1–2) is found, so it can
 * gate a deploy; check 3 is advisory and never fails the run.
 *
 * Usage:
 *   node scripts/audit-dead-links.mjs
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (read from
 * .env.local, same as pipeline-import.mjs).
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('✗ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (.env.local).');
  process.exit(2);
}
const supabase = createClient(url, key);

function heading(s) { return `\n\x1b[1m${s}\x1b[0m`; }

async function main() {
  // Pull the joins we need in one pass each. The library is small; no paging.
  const [{ data: texts, error: tErr }, { data: collections, error: cErr }] = await Promise.all([
    supabase
      .from('texts')
      .select('id, slug, title, published, author:authors(name, slug, draft), collection:collections(slug, title, published)'),
    supabase
      .from('collections')
      .select('id, slug, title, published, texts:texts(count)'),
  ]);

  if (tErr || cErr) {
    console.error('✗ Query failed:', (tErr || cErr).message);
    process.exit(2);
  }

  // PostgREST returns embedded to-one relations as an object here, but be
  // defensive: normalise author/collection to a single object either way.
  const one = v => (Array.isArray(v) ? v[0] ?? null : v ?? null);

  // Check 1 — published text under an unpublished collection
  const deadCollectionLinks = (texts ?? [])
    .map(t => ({ ...t, collection: one(t.collection) }))
    .filter(t => t.published && t.collection && t.collection.published === false);

  // Check 2 — published text whose author is still a draft stub
  const deadAuthorLinks = (texts ?? [])
    .map(t => ({ ...t, author: one(t.author) }))
    .filter(t => t.published && t.author && t.author.draft === true);

  // Check 3 — collections with 0 or 1 texts (advisory)
  const thinCollections = (collections ?? [])
    .map(c => ({ ...c, count: one(c.texts)?.count ?? 0 }))
    .filter(c => c.count <= 1);

  // ── Report ────────────────────────────────────────────────────────────────
  console.log(heading('Dead-link audit'));

  console.log(heading(`1. Published texts → unpublished collection  (${deadCollectionLinks.length})`));
  if (deadCollectionLinks.length === 0) {
    console.log('   ✓ none');
  } else {
    for (const t of deadCollectionLinks) {
      console.log(`   ✗ /texts/${t.slug}  →  /collections/${t.collection.slug} (draft)  — "${t.title}"`);
    }
  }

  console.log(heading(`2. Published texts → draft author  (${deadAuthorLinks.length})`));
  if (deadAuthorLinks.length === 0) {
    console.log('   ✓ none');
  } else {
    // Group by author so a prolific draft author (e.g. Luther) reads as one line.
    const byAuthor = new Map();
    for (const t of deadAuthorLinks) {
      const k = t.author.slug ?? t.author.name;
      if (!byAuthor.has(k)) byAuthor.set(k, { name: t.author.name, slug: t.author.slug, texts: [] });
      byAuthor.get(k).texts.push(t.slug);
    }
    for (const a of byAuthor.values()) {
      console.log(`   ✗ /authors/${a.slug} (draft "${a.name}")  — ${a.texts.length} published text(s)`);
    }
  }

  console.log(heading(`3. Thin collections, ≤1 text  (${thinCollections.length})  [advisory]`));
  if (thinCollections.length === 0) {
    console.log('   ✓ none');
  } else {
    for (const c of thinCollections) {
      console.log(`   • ${c.slug}  (${c.count} text${c.count === 1 ? '' : 's'}, ${c.published ? 'published' : 'draft'})  — "${c.title}"`);
    }
  }

  const issues = deadCollectionLinks.length + deadAuthorLinks.length;
  console.log(heading(`Result: ${issues} integrity issue(s)`));
  process.exit(issues > 0 ? 1 : 0);
}

main().catch(err => { console.error('✗ audit failed:', err); process.exit(2); });
