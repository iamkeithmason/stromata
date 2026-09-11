/**
 * backfill-author-images.mjs — batch-fetch author portraits from Wikipedia
 *
 * Does in one run what the admin author form does one author at a time: for
 * every author with no portrait yet, look the name up on Wikipedia's REST
 * summary endpoint, copy the returned portrait into the Supabase 'authors'
 * Storage bucket, and set authors.image_url / authors.image_source.
 *
 * This is the "auto-apply, fix on site" workflow: it stores a best-match
 * portrait for every author it can confidently resolve and SKIPS the ones a
 * machine shouldn't guess at (anonymous / unknown / composite names, Wikipedia
 * disambiguation pages, and anyone with no portrait on their page). It prints
 * the matched Wikipedia article title + URL for every author it touches so a
 * wrong face is easy to spot and fix afterwards in the admin form.
 *
 * The lookup mirrors lib/authors/wikipedia.ts and the store mirrors
 * app/api/admin/authors/image/route.ts (bounded-width thumbnail, Wikimedia-only
 * SSRF allowlist, 5 MB guard) — the same rules, applied in bulk. If either of
 * those changes, mirror it here.
 *
 * WHERE TO RUN THIS: on a machine with open outbound internet (your local dev
 * box). Wikipedia and upload.wikimedia.org must be reachable — the cloud agent
 * environment's egress policy blocks them, so this can't run from a web session.
 *
 * HARD CONSTRAINTS: none apply — this only writes image_url / image_source.
 * It never touches `published`, `note_draft`, `editorial_introduction`, or an
 * author's `draft` flag.
 *
 * Usage:
 *   node scripts/backfill-author-images.mjs            # dry run — report only, no writes
 *   node scripts/backfill-author-images.mjs --write    # apply: store + update DB
 *   node scripts/backfill-author-images.mjs --write --limit=5
 *   node scripts/backfill-author-images.mjs --write --slug=jerome     # one author
 *   node scripts/backfill-author-images.mjs --write --slug=jerome --force  # re-do one that already has an image
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// ── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const FORCE = args.includes('--force');
const LIMIT = numArg('--limit');
const SLUG = strArg('--slug');

function strArg(flag) {
  const hit = args.find((a) => a.startsWith(`${flag}=`));
  return hit ? hit.slice(flag.length + 1) : null;
}
function numArg(flag) {
  const v = strArg(flag);
  return v == null ? null : parseInt(v, 10);
}

// ── Store config (mirrors app/api/admin/authors/image/route.ts) ──────────────
const BUCKET = 'authors';
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const WIKIMEDIA_THUMB_WIDTH = 1024;
const USER_AGENT = 'TheStromata/1.0 (author portraits; keith.stewart.mason@gmail.com)';
const EXT_BY_TYPE = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

// Rewrite an upload.wikimedia.org file URL to a bounded-width thumbnail so we
// never download a multi-megabyte original. Returns null when the URL isn't a
// recognised Wikimedia upload URL — the caller then fetches the source as given
// (the MAX_BYTES guard still applies). Copied from the image route; keep in sync.
function boundedWikimediaUrl(raw, width) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.hostname.toLowerCase() !== 'upload.wikimedia.org') return null;

  const parts = url.pathname.split('/');
  if (parts[1] !== 'wikipedia' || parts.length < 6) return null;
  const filename = parts[parts.length - 1];
  if (!filename) return null;

  if (parts.includes('thumb')) {
    if (!/^\d+px-/.test(filename)) return null;
    parts[parts.length - 1] = filename.replace(/^\d+px-/, `${width}px-`);
  } else {
    parts.splice(3, 0, 'thumb');
    parts.push(`${width}px-${filename}`);
  }
  url.pathname = parts.join('/');
  return url.toString();
}

// Wikimedia/Wikipedia-only guard (SSRF), same as the image route.
function isAllowedSource(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  const h = url.hostname.toLowerCase();
  return (
    h === 'wikimedia.org' ||
    h === 'wikipedia.org' ||
    h.endsWith('.wikimedia.org') ||
    h.endsWith('.wikipedia.org')
  );
}

// ── Names a machine shouldn't guess a portrait for ───────────────────────────
// Anonymous / unknown attributions have no single subject; composite names
// (multiple authors joined) resolve to nobody or the wrong somebody.
function isUnportrayableName(name) {
  const n = name.trim();
  if (/^(anonymous|unknown)\b/i.test(n)) return 'anonymous/unknown attribution';
  if (/,.*\band\b/i.test(n) || /\band\b.*,/i.test(n)) return 'composite (multiple authors)';
  if (/\band\b/i.test(n) && /\b(capito|hedio|bucer)\b/i.test(n)) return 'composite (multiple authors)';
  return null;
}

// ── Wikipedia lookup (mirrors lib/authors/wikipedia.ts image extraction) ─────
async function fetchWikipediaPortrait(name) {
  const res = await fetch(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name.trim())}`,
    { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } },
  );
  if (res.status === 404) return { ok: false, reason: 'no Wikipedia page' };
  if (!res.ok) return { ok: false, reason: `Wikipedia returned ${res.status}` };

  const data = await res.json();
  if (data.type === 'disambiguation') {
    return { ok: false, reason: 'disambiguation page (ambiguous name)' };
  }

  const imageUrl =
    (typeof data.originalimage?.source === 'string' && data.originalimage.source) ||
    (typeof data.thumbnail?.source === 'string' && data.thumbnail.source) ||
    null;
  if (!imageUrl) return { ok: false, reason: 'no portrait on the page' };

  return {
    ok: true,
    imageUrl,
    title: data.title ?? name.trim(),
    description: data.description ?? '',
    pageUrl: data.content_urls?.desktop?.page ?? '',
  };
}

// ── Download the portrait, bounded to a sane width ───────────────────────────
async function downloadPortrait(sourceUrl) {
  if (!isAllowedSource(sourceUrl)) {
    return { ok: false, reason: 'image source is not a Wikimedia URL' };
  }
  const fetchImage = (u) =>
    fetch(u, { headers: { 'User-Agent': USER_AGENT } }).catch(() => null);

  const bounded = boundedWikimediaUrl(sourceUrl, WIKIMEDIA_THUMB_WIDTH);
  let res = bounded ? await fetchImage(bounded) : null;
  if (!res || !res.ok) res = await fetchImage(sourceUrl);

  if (!res) return { ok: false, reason: 'could not reach the image source' };
  if (!res.ok) return { ok: false, reason: `image source returned ${res.status}` };

  const contentType = res.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg';
  if (!contentType.startsWith('image/')) {
    return { ok: false, reason: `not an image (${contentType})` };
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) {
    return { ok: false, reason: `image larger than 5 MB (${(bytes.byteLength / 1e6).toFixed(1)} MB)` };
  }
  // Record the original file as provenance, not the resized thumbnail URL.
  return { ok: true, bytes, contentType, imageSource: sourceUrl };
}

function objectPath(slug, contentType) {
  const ext = EXT_BY_TYPE[contentType] ?? 'jpg';
  const base = (slug || 'author').replace(/[^a-z0-9-]/gi, '-').toLowerCase() || 'author';
  return `${base}-${Date.now()}.${ext}`;
}

async function storeAndLink(author, bytes, contentType, imageSource) {
  const objPath = objectPath(author.slug, contentType);
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(objPath, bytes, { contentType, upsert: false });
  if (upErr) return { ok: false, reason: `storage upload failed: ${upErr.message}` };

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(objPath);
  const { error: updErr } = await supabase
    .from('authors')
    .update({ image_url: pub.publicUrl, image_source: imageSource })
    .eq('id', author.id);
  if (updErr) return { ok: false, reason: `db update failed: ${updErr.message}` };

  return { ok: true, imageUrl: pub.publicUrl };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(
    `\n── Author image backfill — ${WRITE ? 'APPLY (writing)' : 'DRY RUN (report only)'} ──\n`,
  );

  let query = supabase.from('authors').select('id, name, slug, draft, image_url');
  if (SLUG) query = query.eq('slug', SLUG);
  else if (!FORCE) query = query.is('image_url', null);
  query = query.order('name');

  const { data: authors, error } = await query;
  if (error) {
    console.error('Failed to load authors:', error.message);
    process.exit(1);
  }

  let candidates = authors;
  if (SLUG && !FORCE) candidates = candidates.filter((a) => a.image_url == null);
  if (LIMIT != null) candidates = candidates.slice(0, LIMIT);

  const stats = { applied: 0, wouldApply: 0, skipped: 0, failed: 0 };

  for (const author of candidates) {
    const unportrayable = isUnportrayableName(author.name);
    if (unportrayable) {
      console.log(`⊘ SKIP   ${author.name} — ${unportrayable}`);
      stats.skipped++;
      continue;
    }

    let lookup;
    try {
      lookup = await fetchWikipediaPortrait(author.name);
    } catch (e) {
      console.log(`✗ FAIL   ${author.name} — lookup error: ${e.message}`);
      stats.failed++;
      await sleep(300);
      continue;
    }
    if (!lookup.ok) {
      console.log(`⊘ SKIP   ${author.name} — ${lookup.reason}`);
      stats.skipped++;
      await sleep(300);
      continue;
    }

    const match = `→ "${lookup.title}"${lookup.description ? ` (${lookup.description})` : ''}  ${lookup.pageUrl}`;

    if (!WRITE) {
      console.log(`◦ WOULD  ${author.name}  ${match}`);
      stats.wouldApply++;
      await sleep(300);
      continue;
    }

    const dl = await downloadPortrait(lookup.imageUrl);
    if (!dl.ok) {
      console.log(`✗ FAIL   ${author.name} — ${dl.reason}  ${match}`);
      stats.failed++;
      await sleep(300);
      continue;
    }
    const stored = await storeAndLink(author, dl.bytes, dl.contentType, dl.imageSource);
    if (!stored.ok) {
      console.log(`✗ FAIL   ${author.name} — ${stored.reason}  ${match}`);
      stats.failed++;
      await sleep(300);
      continue;
    }
    console.log(`✓ APPLY  ${author.name}  ${match}`);
    stats.applied++;
    await sleep(300);
  }

  console.log('\n── Summary ──');
  console.log(`  Candidates:  ${candidates.length}`);
  if (WRITE) console.log(`  Applied:     ${stats.applied}`);
  else console.log(`  Would apply: ${stats.wouldApply}`);
  console.log(`  Skipped:     ${stats.skipped}`);
  console.log(`  Failed:      ${stats.failed}`);
  if (!WRITE) {
    console.log('\n  Dry run — no changes written. Re-run with --write to apply.');
  } else {
    console.log('\n  Review the portraits on the author pages; fix any wrong match');
    console.log('  in the admin author form (upload a replacement or clear it).');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
