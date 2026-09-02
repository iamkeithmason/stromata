/**
 * umami-report.mjs — Read-only Umami analytics reporting for The Stromata
 *
 * Umami Cloud gates its API-key API behind a paid plan, but every plan (incl.
 * the free tier) can enable a per-website **Share URL**. That share link is
 * backed by a public endpoint that mints a short-lived, read-only share token,
 * which is exactly what this script uses — no API key, no account password.
 *
 * Auth (pick one; share mode is the free-tier path):
 *   - Share mode  : set UMAMI_SHARE_URL to the full share link (easiest — the
 *                   Cloud region and slug are parsed from it), or set
 *                   UMAMI_SHARE_ID (+ UMAMI_REGION for EU/US Cloud). Free tier.
 *   - API-key mode: set UMAMI_API_KEY (paid plan) — same commands, used
 *                   automatically if present.
 *
 * Umami Cloud is regionalised; the share resolver auto-discovers the working
 * endpoint by probing the known candidates and `doctor` reports which won —
 * pin it as UMAMI_API_BASE afterwards to skip probing.
 *
 * This script only ever issues GET requests. Because Umami Cloud has no
 * read-only API-key tier, that GET-only discipline IS the safety boundary —
 * do not add write calls here.
 *
 * Usage:
 *   node scripts/umami-report.mjs <command> [options]
 *
 * Commands:
 *   overview                  stats + top pages + top referrers + live visitors
 *   stats                     summary numbers (visitors, visits, pageviews, ...)
 *   pages                     top pages (metric: url)
 *   referrers                 top referrers
 *   browsers | os | devices   environment breakdowns
 *   countries                 visitors by country
 *   events                    counts per custom event name (text-open, ...)
 *   event <name> [--prop=P]   value breakdown for one event's property
 *                             (e.g. event text-open --prop=from). Omit --prop
 *                             to list the properties recorded for that event.
 *   active                    live visitors in the last 5 minutes
 *   doctor                    resolve auth, print the resolved website id and a
 *                             raw stats fetch — the "observe the wire" check
 *
 * Options:
 *   --range=7d|30d|24h|today|all   time window (default 7d)
 *   --start=YYYY-MM-DD --end=YYYY-MM-DD   explicit window (overrides --range)
 *   --limit=N     rows for metric/value breakdowns (default 15)
 *   --tz=Area/City   timezone for day bucketing (default $TZ or Etc/UTC)
 *   --json        print raw JSON instead of formatted tables
 *
 * Examples:
 *   node scripts/umami-report.mjs overview --range=30d
 *   node scripts/umami-report.mjs event text-open --prop=text --range=all
 *   node scripts/umami-report.mjs event collection-open --prop=from
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { createUmamiClient, rangeToWindow } from './lib/umami.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local'), quiet: true });

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const positional = [];
const flags = {};
for (const arg of argv) {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(arg);
  if (m) flags[m[1]] = m[2] === undefined ? true : m[2];
  else positional.push(arg);
}

const command = positional[0] || 'overview';
const AS_JSON = Boolean(flags.json);
const LIMIT = Number(flags.limit) || 15;
const TZ = flags.tz || process.env.TZ || 'Etc/UTC';

function resolveRange() {
  const now = Date.now();
  if (flags.start || flags.end) {
    const start = flags.start ? Date.parse(`${flags.start}T00:00:00Z`) : now - 7 * 864e5;
    const end = flags.end ? Date.parse(`${flags.end}T23:59:59Z`) : now;
    if (Number.isNaN(start) || Number.isNaN(end)) {
      fail('Invalid --start/--end (expected YYYY-MM-DD).');
    }
    return { startAt: start, endAt: end };
  }
  const win = rangeToWindow(flags.range || '7d', now);
  if (!win) fail(`Unknown --range "${flags.range}" (use 24h|today|7d|30d|90d|all).`);
  return win;
}

// ---------------------------------------------------------------------------
// Umami client — resolved once, GET-only (see scripts/lib/umami.mjs)
// ---------------------------------------------------------------------------

let _client;
async function client() {
  if (!_client) _client = await createUmamiClient();
  return _client;
}
async function api(pathname, params = {}) {
  return (await client()).get(pathname, params);
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const num = (n) => (typeof n === 'number' ? n.toLocaleString('en-US') : String(n ?? ''));

function table(title, rows) {
  console.log(`\n${title}`);
  if (!rows.length) {
    console.log('  (no data)');
    return;
  }
  const labelW = Math.min(60, Math.max(...rows.map((r) => String(r.label).length)));
  const valW = Math.max(...rows.map((r) => num(r.value).length));
  for (const r of rows) {
    const label = String(r.label).length > 60 ? String(r.label).slice(0, 59) + '…' : r.label;
    console.log(`  ${label.padEnd(labelW)}  ${num(r.value).padStart(valW)}`);
  }
}

function metricRows(data) {
  // metrics + event-data/values normalise to { label, value }
  return (Array.isArray(data) ? data : []).map((r) => ({
    label: r.x ?? r.value ?? r.name ?? '(none)',
    value: r.y ?? r.total ?? r.count ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdStats(range) {
  const s = await api('websites/{id}/stats', range);
  if (AS_JSON) return console.log(JSON.stringify(s, null, 2));
  const v = (x) => (x && typeof x === 'object' ? x.value : x); // {value,prev} or scalar
  table('Summary', [
    { label: 'Visitors', value: v(s.visitors) },
    { label: 'Visits', value: v(s.visits) },
    { label: 'Pageviews', value: v(s.pageviews) },
    { label: 'Bounces', value: v(s.bounces) },
    { label: 'Total time (s)', value: v(s.totaltime) },
  ]);
}

async function cmdMetric(range, type, title) {
  const data = await api('websites/{id}/metrics', { ...range, type, limit: LIMIT });
  if (AS_JSON) return console.log(JSON.stringify(data, null, 2));
  table(title, metricRows(data));
}

async function cmdActive() {
  const data = await api('websites/{id}/active');
  const n = Array.isArray(data) ? data[0]?.x ?? data[0]?.visitors ?? 0 : data?.x ?? data ?? 0;
  if (AS_JSON) return console.log(JSON.stringify(data, null, 2));
  console.log(`\nLive visitors (last 5 min): ${num(n)}`);
}

async function cmdEvent(range) {
  const name = positional[1];
  if (!name) fail('Usage: event <name> [--prop=PROPERTY]');
  const prop = flags.prop;
  if (!prop) {
    // List the properties recorded for this event so the caller can pick one.
    const fields = await api('websites/{id}/event-data/fields', range);
    if (AS_JSON) return console.log(JSON.stringify(fields, null, 2));
    const props = [
      ...new Set(
        (Array.isArray(fields) ? fields : [])
          .filter((f) => (f.eventName ?? f.event_name) === name)
          .map((f) => f.propertyName ?? f.property_name ?? f.field)
          .filter(Boolean)
      ),
    ];
    console.log(`\nProperties recorded for event "${name}":`);
    if (props.length) props.forEach((p) => console.log(`  ${p}`));
    else
      console.log(
        '  (none found in range — try a wider --range, or a known property such\n' +
          '   as: from, text, collection, author, country, source, state)'
      );
    console.log(`\nBreak one down with:  event ${name} --prop=from`);
    return;
  }
  const data = await api('websites/{id}/event-data/values', {
    ...range,
    eventName: name,
    propertyName: prop,
  });
  if (AS_JSON) return console.log(JSON.stringify(data, null, 2));
  table(`${name} · ${prop}`, metricRows(data).slice(0, LIMIT));
}

async function cmdDoctor(range) {
  const { base, headers, websiteId, via, mode, region } = await client();
  console.log('Umami auth doctor');
  console.log(`  mode        : ${mode}`);
  console.log(`  region      : ${region || '(none set)'}`);
  console.log(`  resolved via: ${via}`);
  console.log(`  data base   : ${base}   <- pin this as UMAMI_API_BASE to skip probing`);
  console.log(`  auth header : ${Object.keys(headers)[0]} (value redacted)`);
  console.log(`  website id  : ${websiteId}`);
  const s = await api('websites/{id}/stats', range);
  console.log('\n  raw stats fetch OK. Wire payload:');
  console.log('  ' + JSON.stringify(s));
  console.log(
    '\n  Verified: the request reached Umami and returned data. Compare a number\n' +
      '  above against the Umami dashboard for the same window to confirm.'
  );
}

async function cmdOverview(range) {
  await cmdStats(range);
  await cmdMetric(range, 'path', `Top pages (${flags.range || '7d'})`);
  await cmdMetric(range, 'referrer', 'Top referrers');
  await cmdActive();
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

async function main() {
  const range = resolveRange();
  const metrics = {
    pages: ['path', 'Top pages'],
    referrers: ['referrer', 'Top referrers'],
    browsers: ['browser', 'Browsers'],
    os: ['os', 'Operating systems'],
    devices: ['device', 'Devices'],
    countries: ['country', 'Countries'],
    events: ['event', 'Events'],
  };

  switch (command) {
    case 'overview':
      return cmdOverview(range);
    case 'stats':
      return cmdStats(range);
    case 'active':
      return cmdActive();
    case 'event':
      return cmdEvent(range);
    case 'doctor':
      return cmdDoctor(range);
    default:
      if (metrics[command]) return cmdMetric(range, ...metrics[command]);
      fail(`Unknown command "${command}". Run with no args for overview, or see the header for usage.`);
  }
}

main().catch((err) => fail(err.message || String(err)));
