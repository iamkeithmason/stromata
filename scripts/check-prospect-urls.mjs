/**
 * check-prospect-urls.mjs — fetch every URL in the Content Prospect List and
 * report the ones that no longer answer.
 *
 * A URL sitting in a Notion field looks like a fact. It is a claim, and nothing
 * re-tests it. On 2026-09-21 a hand check of five of them found four 404s and
 * one 403 — and the same class of unchecked value had already caused 108 KB of
 * the wrong book to be imported under Spurgeon's name, because the row's
 * Reference URL pointed at a different work entirely.
 *
 * This makes the cheap half of that check a command. The judgement half lives
 * in scripts/lib/url-check.mjs and is unit-tested, so the sweep cannot go green
 * by looking in the wrong place.
 *
 * WHAT IT DOES NOT DO — read this before trusting a green run. It answers only
 * "does this address still respond?". It cannot tell you the URL points at the
 * RIGHT WORK: the All of Grace URL that caused the incident answered 200 and
 * would pass here. CLAUDE.md's rule stands unchanged — before Stage 2, fetch
 * the source and read the title and author out of the first few hundred bytes.
 *
 * Reads Notion over the REST API with NOTION_TOKEN (same credential and
 * endpoint as scripts/scout/notion.ts), NOT the MCP connector, so it does not
 * consume the MCP query budget. Read-only: it never writes to Notion.
 *
 * Usage:
 *   node scripts/check-prospect-urls.mjs                 # every row, every URL field
 *   node scripts/check-prospect-urls.mjs --cleared-only  # just Cleared edition URL
 *   node scripts/check-prospect-urls.mjs --status="Text available"
 *   node scripts/check-prospect-urls.mjs --json          # machine-readable
 *   node scripts/check-prospect-urls.mjs --fail-on=any   # blocked/5xx also exit 1
 *
 * Exits 1 if any URL is dead (404/410). A 403 is reported but does not fail the
 * run — see url-check.mjs for why that distinction is load-bearing.
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  URL_FIELDS,
  extractUrls,
  classify,
  compareResults,
  shouldFail,
  summarise,
} from './lib/url-check.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local'), override: true });

const DATA_SOURCE_ID = 'e3236509-a018-494c-93cf-9a035f3d10a8';
const NOTION_VERSION = '2025-09-03';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const clearedOnly = args.includes('--cleared-only');
const statusFilter = args.find((a) => a.startsWith('--status='))?.slice('--status='.length);
const failOn = args.find((a) => a.startsWith('--fail-on='))?.slice('--fail-on='.length) ?? 'dead';
const concurrency = Number(args.find((a) => a.startsWith('--concurrency='))?.slice('--concurrency='.length) ?? 6);
const timeoutMs = Number(args.find((a) => a.startsWith('--timeout='))?.slice('--timeout='.length) ?? 15000);

function token() {
  return process.env.NOTION_TOKEN || process.env.SCOUT_NOTION_TOKEN || '';
}

/** Flatten one Notion property to the plain string the extractor expects. */
function plain(prop) {
  if (!prop) return '';
  if (prop.type === 'url') return prop.url ?? '';
  if (prop.type === 'title') return (prop.title ?? []).map((t) => t.plain_text).join('');
  if (prop.type === 'rich_text') return (prop.rich_text ?? []).map((t) => t.plain_text).join('');
  if (prop.type === 'select') return prop.select?.name ?? '';
  if (prop.type === 'unique_id') return String(prop.unique_id?.number ?? '');
  return '';
}

async function fetchRows() {
  const rows = [];
  let cursor;
  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const res = await fetch(`https://api.notion.com/v1/data_sources/${DATA_SOURCE_ID}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token()}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Notion query failed (${res.status}): ${await res.text()}`);
    const json = await res.json();
    for (const page of json.results) {
      const p = page.properties ?? {};
      rows.push({
        id: plain(p.ID) || page.id.slice(0, 8),
        title: plain(p.Title),
        status: plain(p.Status),
        fields: Object.fromEntries(URL_FIELDS.map((f) => [f.name, plain(p[f.name])])),
      });
    }
    cursor = json.has_more ? json.next_cursor : undefined;
  } while (cursor);
  return rows;
}

/**
 * HEAD first, then GET on anything that isn't a clean answer.
 *
 * Plenty of hosts — Archive.org among them — answer HEAD with 405 or 403 while
 * serving GET perfectly. Treating a HEAD refusal as the verdict would report
 * healthy URLs as broken, which is the same false-positive failure the 403/404
 * distinction exists to avoid.
 */
export async function probe(url) {
  for (const method of ['HEAD', 'GET']) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { method, redirect: 'follow', signal: controller.signal });
      clearTimeout(timer);
      if (method === 'HEAD' && (res.status === 405 || res.status === 403 || res.status >= 500)) {
        continue; // give GET a chance before believing it
      }
      return { status: res.status, finalUrl: res.url };
    } catch (err) {
      clearTimeout(timer);
      if (method === 'GET') {
        return { error: err.name === 'AbortError' ? `timed out after ${timeoutMs}ms` : String(err.message || err) };
      }
    }
  }
  return { error: 'no response' };
}

async function mapWithLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

async function main() {
  if (!token()) {
    console.error('NOTION_TOKEN (or SCOUT_NOTION_TOKEN) is not set — add it to .env.local.');
    process.exit(2);
  }

  const rows = await fetchRows();
  const targets = [];
  for (const row of rows) {
    if (statusFilter && row.status !== statusFilter) continue;
    if (row.title.startsWith('[DUPLICATE')) continue; // dropped rows are not worth checking
    for (const found of extractUrls(row)) {
      if (clearedOnly && found.field !== 'Cleared edition URL') continue;
      targets.push({ ...found, id: row.id, title: row.title, status: row.status });
    }
  }

  if (!asJson) {
    console.log(`Checking ${targets.length} URL(s) across ${rows.length} prospect(s)\n`);
  }

  const results = await mapWithLimit(targets, concurrency, async (t) => {
    const { verdict, why } = classify(await probe(t.url));
    return { ...t, verdict, why };
  });

  results.sort(compareResults);
  const counts = summarise(results);
  const problems = results.filter((r) => r.verdict !== 'ok');

  if (asJson) {
    console.log(JSON.stringify({ counts, results }, null, 2));
  } else {
    for (const r of problems) {
      console.log(`${r.verdict.toUpperCase().padEnd(13)} #${r.id}  ${r.title}`);
      console.log(`              ${r.field}: ${r.url}`);
      console.log(`              ${r.why}\n`);
    }
    console.log('---');
    console.log(
      Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(' · ') || 'nothing checked',
    );
    if (problems.length === 0) console.log('Every URL answered.');
    console.log(
      '\nReachability only — a 200 does NOT mean the URL holds the right work.\n' +
      'Before Stage 2, fetch the source and read its title and author (CLAUDE.md).',
    );
  }

  if (shouldFail(results, { failOn })) process.exit(1);
}

// Only sweep when run directly, so `probe` can be imported and exercised
// against known-answer URLs without hitting Notion or parsing argv.
if (process.argv[1] && import.meta.url === `file://${path.resolve(process.argv[1])}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(2);
  });
}
