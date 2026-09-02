/**
 * digest.mjs — Umami × Supabase analytics digest for The Stromata. READ-ONLY.
 *
 * Umami records events keyed by slug; Supabase knows what the slugs mean. This
 * pulls the events, joins them to the corpus, and rolls opens up by theme /
 * author / era / tradition / genre — the demand view Umami cannot produce on
 * its own — then prints a Markdown digest for prioritisation.
 *
 * Auth: same as scripts/umami-report.mjs (share token on the free tier).
 * Supabase: read-only. Prefers ANALYTICS_SUPABASE_URL/KEY, then SCOUT_SUPABASE_*,
 * then NEXT_PUBLIC_SUPABASE_URL + SERVICE_ROLE/anon. RLS blocks the anon key from
 * reading authors/texts, so a service-role or dedicated read role is needed.
 *
 * Usage:
 *   node scripts/analytics/digest.mjs [--range=30d] [--limit=15] [--json]
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { createUmamiClient, rangeToWindow } from '../lib/umami.mjs';
import { buildDigest } from './aggregate.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.env.local'), quiet: true });

const flags = {};
for (const a of process.argv.slice(2)) {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  if (m) flags[m[1]] = m[2] === undefined ? true : m[2];
}
const RANGE = flags.range || '30d';
const LIMIT = Number(flags.limit) || 15;

function die(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

// event-data/values and metrics rows -> { key, count }
const rows = (data, keyName) =>
  (Array.isArray(data) ? data : []).map((r) => ({
    [keyName]: r.value ?? r.x ?? r.name ?? '(none)',
    count: r.total ?? r.y ?? r.count ?? 0,
  }));

function supabaseClient() {
  const url = (process.env.ANALYTICS_SUPABASE_URL || process.env.SCOUT_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '')
    .replace(/\/rest\/v1\/?$/, '')
    .replace(/\/$/, '');
  const key =
    process.env.ANALYTICS_SUPABASE_KEY ||
    process.env.SCOUT_SUPABASE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    die(
      'Supabase credentials missing. Set ANALYTICS_SUPABASE_URL + ANALYTICS_SUPABASE_KEY\n' +
        '(or SCOUT_SUPABASE_*, or NEXT_PUBLIC_SUPABASE_URL + a read key). A service-role or\n' +
        'dedicated read role is needed — RLS hides authors/texts from the anon key.'
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

async function loadCorpus(sb) {
  const [texts, authors, traditions, eras, genres, themes, textThemes, collections] = await Promise.all([
    sb.from('texts').select('id, slug, title, author_id, genre_id'),
    sb.from('authors').select('id, name, tradition_id, era_id'),
    sb.from('traditions').select('id, name'),
    sb.from('eras').select('id, label'),
    sb.from('genres').select('id, name'),
    sb.from('themes').select('id, name'),
    sb.from('text_themes').select('text_id, theme_id'),
    sb.from('collections').select('slug, title'),
  ]);
  for (const [label, res] of Object.entries({ texts, authors, traditions, eras, genres, themes, textThemes, collections })) {
    if (res.error) die(`Supabase read failed for ${label}: ${res.error.message}`);
  }

  const themeNameById = new Map((themes.data ?? []).map((t) => [t.id, t.name]));
  const themesByTextId = new Map();
  for (const { text_id, theme_id } of textThemes.data ?? []) {
    const name = themeNameById.get(theme_id);
    if (!name) continue;
    if (!themesByTextId.has(text_id)) themesByTextId.set(text_id, []);
    themesByTextId.get(text_id).push(name);
  }

  return {
    textsBySlug: new Map((texts.data ?? []).map((t) => [t.slug, t])),
    authorsById: new Map((authors.data ?? []).map((a) => [a.id, a])),
    traditionsById: new Map((traditions.data ?? []).map((t) => [t.id, t.name])),
    erasById: new Map((eras.data ?? []).map((e) => [e.id, e.label])),
    genresById: new Map((genres.data ?? []).map((g) => [g.id, g.name])),
    themesByTextId,
    // aggregate/render use `.name` as the display label; collections store `title`.
    collectionsBySlug: new Map((collections.data ?? []).map((c) => [c.slug, { name: c.title }])),
  };
}

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------

const fmtDate = (ms) => new Date(ms).toISOString().slice(0, 10);
const n = (x) => Number(x || 0).toLocaleString('en-US');

function list(title, ranked, { max = LIMIT, unit = 'opens' } = {}) {
  const out = [`### ${title}`];
  if (!ranked.length) return out.concat('_(no data)_', '').join('\n');
  const w = Math.max(...ranked.slice(0, max).map((r) => n(r.value).length));
  for (const r of ranked.slice(0, max)) out.push(`- \`${n(r.value).padStart(w)}\`  ${r.label}`);
  out.push('');
  return out.join('\n');
}

function render(digest, { stats, eventCounts, window }) {
  const s = (k) => (stats?.[k] && typeof stats[k] === 'object' ? stats[k].value : stats?.[k]);
  const t = digest.totals;
  const lines = [];
  lines.push(`# The Stromata — analytics digest`);
  lines.push(`_Window: ${fmtDate(window.startAt)} → ${fmtDate(window.endAt)} (${RANGE}). Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')}Z._`);
  lines.push('');
  lines.push(`**Traffic:** ${n(s('visitors'))} visitors · ${n(s('visits'))} visits · ${n(s('pageviews'))} pageviews · ${n(s('bounces'))} bounces`);
  lines.push(`**Reading:** ${n(t.totalTextOpens)} text-opens across ${n(t.distinctTextsOpened)} texts` +
    (t.unmatchedOpens ? ` · ⚠ ${n(t.unmatchedOpens)} opens on slugs not in the DB` : ''));
  lines.push('');

  lines.push('## Demand by content dimension');
  lines.push('_What readers actually open, rolled up the way Umami can\'t. Feeds pipeline + backlog priority._');
  lines.push('');
  lines.push(list('By theme', digest.byTheme));
  lines.push(list('By author', digest.byAuthor));
  lines.push(list('By era', digest.byEra));
  lines.push(list('By tradition', digest.byTradition));
  lines.push(list('By genre', digest.byGenre));

  lines.push('## Top texts opened');
  if (digest.topTexts.length) {
    const w = Math.max(...digest.topTexts.slice(0, LIMIT).map((x) => n(x.count).length));
    for (const x of digest.topTexts.slice(0, LIMIT)) {
      lines.push(`- \`${n(x.count).padStart(w)}\`  **${x.title}** — ${x.author}  \`${x.slug}\``);
    }
  } else lines.push('_(no text-open events in range)_');
  lines.push('');

  if (digest.collections.length) {
    lines.push('## Collections opened');
    for (const c of digest.collections.slice(0, LIMIT)) lines.push(`- \`${n(c.count)}\`  ${c.name}  \`${c.slug}\``);
    lines.push('');
  }

  lines.push('## Reading entry points (`from`)');
  lines.push('_Which surfaces drive people into texts — where UI work has leverage._');
  lines.push(list('text-open origins', digest.fromAttribution, { unit: 'opens' }));

  if (digest.unmatchedTexts.length || digest.unmatchedCollections.length) {
    lines.push('## ⚠ Data-quality flags');
    if (digest.unmatchedTexts.length) {
      lines.push('Slugs opened but **not found in Supabase** (renamed / unpublished / stale share data):');
      for (const u of digest.unmatchedTexts.slice(0, LIMIT)) lines.push(`- \`${n(u.count)}\`  \`${u.slug}\``);
      lines.push('');
    }
    if (digest.unmatchedCollections.length) {
      lines.push('Unmatched collection slugs: ' + digest.unmatchedCollections.map((u) => `\`${u.slug}\` (${u.count})`).join(', '));
      lines.push('');
    }
  }

  lines.push('## Events firing (for the Notion Events Register reconciliation)');
  lines.push('_Cross-check against Growth Tracker → Events Register; investigate any event here that isn\'t documented there, or documented events absent here._');
  if (eventCounts.length) {
    for (const e of eventCounts.slice(0, 40)) lines.push(`- \`${n(e.count)}\`  ${e.key}`);
  } else lines.push('_(no custom events in range)_');
  lines.push('');

  lines.push('---');
  lines.push('_Umami undercounts: ad/tracking blockers (incl. Keith\'s own Chrome) drop the beacon, so treat these as lower bounds and read shares, not absolutes._');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------

async function main() {
  const window = rangeToWindow(RANGE);
  if (!window) die(`Unknown --range "${RANGE}" (use 24h|today|7d|30d|90d|all).`);
  const range = { startAt: window.startAt, endAt: window.endAt };

  const umami = await createUmamiClient();
  const [stats, textVals, collectionVals, fromVals, eventMetrics] = await Promise.all([
    umami.get('websites/{id}/stats', range),
    umami.get('websites/{id}/event-data/values', { ...range, eventName: 'text-open', propertyName: 'text' }),
    umami.get('websites/{id}/event-data/values', { ...range, eventName: 'collection-open', propertyName: 'collection' }),
    umami.get('websites/{id}/event-data/values', { ...range, eventName: 'text-open', propertyName: 'from' }),
    umami.get('websites/{id}/metrics', { ...range, type: 'event', limit: 100 }),
  ]);

  const db = await loadCorpus(supabaseClient());
  const digest = buildDigest({
    textOpens: rows(textVals, 'slug').map((r) => ({ slug: r.slug, count: r.count })),
    collectionOpens: rows(collectionVals, 'slug').map((r) => ({ slug: r.slug, count: r.count })),
    fromAttribution: rows(fromVals, 'surface').map((r) => ({ surface: r.surface, count: r.count })),
    db,
  });
  const eventCounts = rows(eventMetrics, 'key').sort((a, b) => b.count - a.count);

  if (flags.json) {
    console.log(JSON.stringify({ window, stats, digest, eventCounts }, null, 2));
    return;
  }
  console.log(render(digest, { stats, eventCounts, window }));
}

main().catch((err) => die(err.message || String(err)));
