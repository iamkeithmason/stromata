#!/usr/bin/env node
/**
 * monthly-metrics.mjs — print one row of the Monthly Log. READ-ONLY.
 *
 *   node scripts/monthly-metrics.mjs --month 2026-09
 *   node scripts/monthly-metrics.mjs --month=2026-09 --json
 *
 * The log's numbers used to be assembled by hand from the Umami dashboard, and
 * at least one of them ("avg texts/session", derived from `text-open`) was
 * wrong by construction: `text-open` fires on clicks, so every reader who
 * landed on a text straight from a search engine counted as zero texts. This
 * reads the same facts off the API, from sources that do not have that hole.
 *
 * Target: Umami Cloud. Auth and endpoint shapes are shared with the digest via
 * scripts/lib/umami.mjs — share token on the free tier, API key on a paid plan.
 * Every query below is a documented Umami endpoint:
 *   GET websites/{id}/stats                  ?startAt&endAt[&event=<name>]
 *   GET websites/{id}/metrics                ?startAt&endAt&type=path|referrer|channel
 *   GET websites/{id}/event-data/values      ?startAt&endAt&eventName&propertyName
 * The `event=` filter on /stats is what makes "unique visitors who fired X"
 * answerable at all — it scopes the visitor count to sessions carrying X.
 *
 * Supabase supplies the corpus counts, the same credentials the digest uses.
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { createUmamiClient } from './lib/umami.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local'), quiet: true });

/**
 * `text-session-depth` shipped on this date. Conversion before it is not a low
 * number — it is no number, and printing 0% would be worse than printing n/a.
 */
const SESSION_DEPTH_LIVE_FROM = '2026-09-21';

// ───────────────────────────── arguments ─────────────────────────────

// Accept both `--month 2026-09` (as the brief writes it) and `--month=2026-09`
// (as every other script here writes it).
const flags = {};
{
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(argv[i]);
    if (!m) continue;
    if (m[2] !== undefined) flags[m[1]] = m[2];
    else if (argv[i + 1] && !argv[i + 1].startsWith('--')) flags[m[1]] = argv[++i];
    else flags[m[1]] = true;
  }
}

function die(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

const MONTH = typeof flags.month === 'string' ? flags.month : null;
if (!MONTH || !/^\d{4}-\d{2}$/.test(MONTH)) {
  die('Give a month: --month 2026-09');
}

/** UTC month window, clamped to now so an in-flight month reads "so far". */
function monthWindow(month) {
  const [y, m] = month.split('-').map(Number);
  const start = Date.UTC(y, m - 1, 1);
  const end = Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1);
  const now = Date.now();
  return { startAt: start, endAt: Math.min(end, now), partial: end > now, monthEnd: end };
}

const win = monthWindow(MONTH);
if (win.startAt >= Date.now()) die(`${MONTH} has not started yet.`);
const range = { startAt: win.startAt, endAt: win.endAt };

// ───────────────────────────── helpers ─────────────────────────────

/** metrics / event-data rows -> [{ key, count }] across both response shapes. */
const rows = (data) =>
  (Array.isArray(data) ? data : []).map((r) => ({
    key: r.value ?? r.x ?? r.name ?? '(none)',
    count: Number(r.total ?? r.y ?? r.count ?? 0),
  }));

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * Search engines, by referrer hostname. Only used when Umami's own `channel`
 * metric is unavailable — its classification is better maintained than ours.
 */
const SEARCH_HOSTS =
  /(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|search\.yahoo\.[a-z.]+|yandex\.[a-z.]+|baidu\.com|ecosia\.org|startpage\.com|search\.brave\.com|qwant\.com|lite\.duckduckgo\.com|mojeek\.com|searx[^.]*\.[a-z.]+)$/i;

function hostOf(referrer) {
  if (!referrer || referrer === '(none)') return null;
  try {
    return new URL(referrer.includes('://') ? referrer : `https://${referrer}`).hostname;
  } catch {
    return referrer;
  }
}

function supabaseClient() {
  const url = (
    process.env.ANALYTICS_SUPABASE_URL ||
    process.env.SCOUT_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    ''
  )
    .replace(/\/rest\/v1\/?$/, '')
    .replace(/\/$/, '');
  const key =
    process.env.ANALYTICS_SUPABASE_KEY ||
    process.env.SCOUT_SUPABASE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/** A text page is /texts/<slug> — the /texts index itself is not a text read. */
const TEXT_PAGE = /^\/texts\/[^/?#]+\/?$/;

/**
 * Unique visitors who fired `reader-return`, if the API will tell us; the raw
 * event count if it will not. Never a silent zero.
 */
async function countReturningReaders(umami, eventCounts) {
  const fallback = {
    returningReaders: eventCounts.get('reader-return') ?? 0,
    returningBasis: 'reader-return events (≤1 per device per ISO week; not deduped by visitor)',
  };

  // Probe with whichever event actually fired most this month.
  const [probeName] = [...eventCounts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  if (!probeName) return fallback;
  try {
    const probe = await umami.get('websites/{id}/stats', { ...range, event: probeName });
    if (num(probe?.visitors) === 0) return fallback; // filter ignored
  } catch {
    return fallback;
  }

  const scoped = await umami.get('websites/{id}/stats', { ...range, event: 'reader-return' });
  return {
    returningReaders: num(scoped?.visitors),
    returningBasis: 'unique visitors in sessions that fired reader-return',
  };
}

// ───────────────────────────── the row ─────────────────────────────

async function main() {
  let umami;
  try {
    umami = await createUmamiClient();
  } catch (err) {
    die(
      `${err.message}\n\n` +
        'The Monthly Log row needs read access to Umami Cloud. Put ONE of these in\n' +
        '.env.local (see .env.example):\n' +
        '  • UMAMI_SHARE_URL=…   the website Share URL (free tier — what the digest uses)\n' +
        '  • UMAMI_API_KEY=… plus UMAMI_WEBSITE_ID=…   (paid plan)\n' +
        'Supabase read credentials are needed too, for the corpus counts:\n' +
        '  ANALYTICS_SUPABASE_URL + ANALYTICS_SUPABASE_KEY (service-role or a read role;\n' +
        '  RLS hides texts from the anon key).'
    );
  }

  const [stats, eventMetrics, pathMetrics, depthValues, referrerRes, channelRes] = await Promise.all([
    umami.get('websites/{id}/stats', range),
    umami.get('websites/{id}/metrics', { ...range, type: 'event', limit: 200 }),
    umami.get('websites/{id}/metrics', { ...range, type: 'path', limit: 1000 }),
    umami.get('websites/{id}/event-data/values', {
      ...range,
      eventName: 'text-session-depth',
      propertyName: 'depth',
    }),
    umami.get('websites/{id}/metrics', { ...range, type: 'referrer', limit: 50 }).catch(() => null),
    // `channel` buckets traffic (search / direct / referral / social) server-side.
    // Newer than some Cloud deployments, so treat its absence as normal.
    umami.get('websites/{id}/metrics', { ...range, type: 'channel' }).catch(() => null),
  ]);

  const visits = num(stats?.visits);
  const visitors = num(stats?.visitors);
  const eventCounts = new Map(rows(eventMetrics).map((r) => [String(r.key), r.count]));

  // ── Returning readers ──
  // /stats accepts an `event=` filter, which would give unique VISITORS who
  // fired reader-return. Share tokens silently ignore it and answer 0 — a
  // number indistinguishable from "nobody returned", which is precisely the
  // kind of quiet wrong answer this whole exercise exists to stop. So probe it
  // against an event known to have fired, and only trust it if it agrees.
  const { returningReaders, returningBasis } = await countReturningReaders(umami, eventCounts);

  // ── Avg texts/session ──
  // Pageviews on /texts/<slug>, not `text-open` clicks: a reader who arrives on
  // a text straight from Google fires no click event but is unquestionably
  // reading a text. This is the fix the Monthly Log's 0.2 needed.
  const textPageviews = rows(pathMetrics)
    .filter((r) => TEXT_PAGE.test(String(r.key).split('?')[0]))
    .reduce((a, r) => a + r.count, 0);
  const avgTextsPerSession = visits > 0 ? textPageviews / visits : null;

  // ── First → second text conversion ──
  const depths = new Map(rows(depthValues).map((r) => [String(r.key), r.count]));
  const d1 = depths.get('1') ?? 0;
  const d2 = depths.get('2') ?? 0;
  const depthLive = win.monthEnd > Date.parse(`${SESSION_DEPTH_LIVE_FROM}T00:00:00Z`);
  const conversion = depthLive && d1 > 0 ? d2 / d1 : null;

  // ── Organic search share, and the top referrer ──
  let organicShare = null;
  let organicBasis = null;
  const channels = rows(channelRes);
  if (channels.length) {
    const total = channels.reduce((a, c) => a + c.count, 0);
    const search = channels
      .filter((c) => /search|organic/i.test(String(c.key)))
      .reduce((a, c) => a + c.count, 0);
    if (total > 0) {
      organicShare = search / total;
      organicBasis = "Umami's own channel classification";
    }
  }
  const referrers = rows(referrerRes)
    .map((r) => ({ ...r, host: hostOf(String(r.key)) }))
    .filter((r) => r.host && !/thestromata\.com$/i.test(r.host));
  if (organicShare === null && referrers.length) {
    // Fall back to classifying referrer hosts. The denominator is all visits,
    // not all referrals, so direct traffic dilutes the share the same way
    // Umami's channel view would.
    const search = referrers.filter((r) => SEARCH_HOSTS.test(r.host)).reduce((a, r) => a + r.count, 0);
    if (visits > 0) {
      organicShare = search / visits;
      organicBasis = 'referrer hostnames ÷ all visits (channel metric unavailable)';
    }
  }
  const topReferrer = referrers.sort((a, b) => b.count - a.count)[0] ?? null;

  // ── Corpus ──
  const sb = supabaseClient();
  let totalTexts = null;
  let textsAdded = null;
  let corpusNote = null;
  if (!sb) {
    corpusNote = 'Supabase credentials missing — set ANALYTICS_SUPABASE_URL/KEY.';
  } else {
    const [all, added] = await Promise.all([
      sb.from('texts').select('id', { count: 'exact', head: true }).eq('published', true),
      sb
        .from('texts')
        .select('id', { count: 'exact', head: true })
        .eq('published', true)
        .gte('published_at', new Date(win.startAt).toISOString())
        .lt('published_at', new Date(win.monthEnd).toISOString()),
    ]);
    if (all.error || added.error) {
      corpusNote = `Supabase read failed: ${(all.error || added.error).message}`;
    } else {
      totalTexts = all.count ?? 0;
      textsAdded = added.count ?? 0;
    }
  }

  const result = {
    month: MONTH,
    partial: win.partial,
    window: { from: new Date(win.startAt).toISOString(), to: new Date(win.endAt).toISOString() },
    visitors,
    visits,
    returningReaders,
    returningBasis,
    textPageviews,
    avgTextsPerSession,
    firstToSecond: { depth1: d1, depth2: d2, conversion, liveFrom: SESSION_DEPTH_LIVE_FROM },
    organicShare,
    organicBasis,
    topReferrer: topReferrer ? { host: topReferrer.host, visits: topReferrer.count } : null,
    totalTexts,
    textsAdded,
    corpusNote,
  };

  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(render(result));
}

// ───────────────────────────── rendering ─────────────────────────────

const pct = (v) => (v == null ? 'n/a' : `${(v * 100).toFixed(1)}%`);
const dec = (v) => (v == null ? 'n/a' : v.toFixed(2));

function render(r) {
  const L = [];
  L.push(`\nMonthly Log — ${r.month}${r.partial ? ' (month in progress)' : ''}`);
  L.push(`${r.window.from.slice(0, 10)} → ${r.window.to.slice(0, 10)} · ${r.visitors} visitors · ${r.visits} visits\n`);

  const line = (label, value, note) =>
    L.push(`  ${label.padEnd(26)}${String(value).padEnd(12)}${note ? `· ${note}` : ''}`);

  line('Returning readers', r.returningReaders, r.returningBasis);
  line(
    'Avg texts/session',
    dec(r.avgTextsPerSession),
    `${r.textPageviews} /texts/<slug> pageviews ÷ ${r.visits} visits`
  );
  line(
    'First → second text',
    pct(r.firstToSecond.conversion),
    r.firstToSecond.conversion == null
      ? `no data — text-session-depth live from ${r.firstToSecond.liveFrom}`
      : `depth2 ${r.firstToSecond.depth2} ÷ depth1 ${r.firstToSecond.depth1}`
  );
  line('Organic search', pct(r.organicShare), r.organicBasis ?? 'no referrer data');
  line(
    'Top referrer',
    r.topReferrer ? r.topReferrer.host : 'n/a',
    r.topReferrer ? `${r.topReferrer.visits} visits` : 'direct traffic only'
  );
  line('Total texts', r.totalTexts ?? 'n/a', r.corpusNote ?? 'published');
  line('Texts added', r.textsAdded ?? 'n/a', r.corpusNote ? '' : 'published_at within the month');

  L.push('');
  L.push('Umami undercounts: ad and tracking blockers drop the beacon entirely, and');
  L.push('admin devices opt out by design. Read these as lower bounds and compare');
  L.push('shares month to month, not absolutes.');
  if (r.partial) L.push('This month is still running — the row is "so far", not final.');
  L.push('');
  return L.join('\n');
}

main().catch((err) => die(err.message || String(err)));
