#!/usr/bin/env node
/**
 * verify-site-health.mjs — does clicking a link on this site actually work?
 *
 * Written after a 2026-09-21 incident: a reader reported "buttons to the
 * texts don't respond" in Discord. The site *looked* fine — the homepage and
 * link preview both rendered — because those are served from Vercel's ISR
 * cache without touching Supabase. What was actually broken was anything
 * behind a *live* database read: a stalled Supabase connection meant clicking
 * into an uncached text hung with no feedback, and the fix (CHANGELOG,
 * 2026-09-21) landed a request timeout so that failure is now fast and
 * visible instead of an indefinite hang. This script is the check that
 * should have caught it in the first place, and the one to run again after
 * any future report shaped like "nothing happens when I click."
 *
 * It measures wall-clock time to load a page — including cache-miss-shaped
 * pages the maintainer's own cached browser tab would never surface — and,
 * critically, performs a REAL click on a REAL link and asserts the browser
 * actually arrives somewhere. A page that renders is not the same claim as a
 * link that works; this checks the second one directly rather than inferring
 * it from the first.
 *
 * Usage
 *   node scripts/verify-site-health.mjs --url=https://<preview>.vercel.app
 *   node scripts/verify-site-health.mjs --prod            # production, opt-in
 *   node scripts/verify-site-health.mjs --prod --budget=5000
 *
 * Exit code is 0 only when nothing failed, so it can gate a deploy or run on
 * a schedule and alert on drift.
 *
 * Needs a Chromium: `npx playwright install chromium` once. In a sandbox with
 * a preinstalled browser, point at it with --browser-path= or CHROMIUM_PATH.
 * Vercel Deployment Protection and the TLS-proxy workaround are the same as
 * verify-analytics.mjs — see --bypass-token / --via-node there for the story;
 * this script accepts the same two flags for the same reasons.
 */

import { chromium } from 'playwright';
import { formatTable, summarise } from './lib/wire-check.mjs';

const PROD = 'https://www.thestromata.com';

const flags = {};
for (const a of process.argv.slice(2)) {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  if (m) flags[m[1]] = m[2] === undefined ? true : m[2];
}

function die(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(2);
}

let BASE = (flags.url || '').replace(/\/$/, '');
if (!BASE && flags.prod) BASE = PROD;
if (!BASE) {
  die(
    'Give a target: --url=https://<preview>.vercel.app\n' +
      '  Production needs the explicit --prod flag (or --url plus --prod to confirm).'
  );
}
if (BASE.startsWith(PROD) && !flags.prod) {
  die('That is production. Pass --prod as well if you mean it.');
}

// A page that takes longer than this to finish loading is a failure, not a
// slow pass — a reader does not have a "give it a bit longer" setting. 10s is
// generous; the pages that mattered in the 2026-09-21 incident were hanging
// for 20s+ or not returning at all.
const BUDGET_MS = Number(flags.budget) || 10000;
const BROWSER_PATH = flags['browser-path'] || process.env.CHROMIUM_PATH || undefined;
const VIA_NODE = Boolean(flags['via-node']);
const BYPASS_TOKEN = flags['bypass-token'] || process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '';
const BYPASS_HEADERS = BYPASS_TOKEN
  ? { 'x-vercel-protection-bypass': BYPASS_TOKEN, 'x-vercel-set-bypass-cookie': 'true' }
  : {};

const rows = [];
const row = (surface, name, status, detail) => rows.push({ event: surface, case: name, status, detail });

async function installProxy(context) {
  if (!VIA_NODE) return;
  // See verify-analytics.mjs's installInterceptor for why this exists and why
  // the fetch timeout below is deliberately generous rather than inherited.
  await context.route('**/*', async (route) => {
    try {
      await route.fulfill({ response: await route.fetch({ maxRedirects: 5, timeout: 60000 }) });
    } catch {
      await route.abort().catch(() => {});
    }
  });
}

/** Time a navigation. Returns { ok, ms, status, error }. */
async function timedGoto(page, url, { timeout = BUDGET_MS } = {}) {
  const start = Date.now();
  try {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
    return { ok: true, ms: Date.now() - start, status: res?.status() ?? null };
  } catch (err) {
    return { ok: false, ms: Date.now() - start, error: String(err.message || err).split('\n')[0] };
  }
}

/** A page that loaded but is showing the root error boundary. */
async function isErrorBoundary(page) {
  return page.evaluate(() => document.body.innerText.includes("This page couldn't load"));
}

// ── Checks ──────────────────────────────────────────────────────────────

/**
 * Static/ISR-cached surfaces: the ones a maintainer's own browser tends to
 * see, because they were the ones already warm. Should always be fast.
 */
async function checkCachedPages(context) {
  for (const path of ['/', '/texts', '/authors']) {
    const page = await context.newPage();
    const r = await timedGoto(page, BASE + path);
    if (!r.ok) {
      row('cached pages', path, 'fail', `did not load: ${r.error}`);
    } else if (r.status && r.status >= 400) {
      row('cached pages', path, 'fail', `HTTP ${r.status} after ${r.ms}ms`);
    } else {
      row('cached pages', path, 'pass', `${r.ms}ms`);
    }
    await page.close();
  }
}

/**
 * Routes that read Supabase fresh on every request by design (see
 * lib/supabase/public.ts's `{ live: true }`). These are allowed to be slower
 * than a cached page, but not unboundedly slow — BUDGET_MS is the same wall
 * for both, because an indefinite hang is indistinguishable from broken to
 * whoever is waiting on it.
 */
async function checkLiveRoutes(context) {
  for (const path of ['/sitemap.xml', '/rss', '/llms.txt']) {
    const page = await context.newPage();
    const r = await timedGoto(page, BASE + path);
    if (!r.ok) {
      row('live routes', path, 'fail', `did not load: ${r.error}`);
    } else if (r.status && r.status >= 400) {
      row('live routes', path, 'fail', `HTTP ${r.status} after ${r.ms}ms`);
    } else {
      row('live routes', path, 'pass', `${r.ms}ms`);
    }
    await page.close();
  }
}

/**
 * The check that maps directly onto the incident report: open the library
 * index, click a real text link the way a reader would, and confirm the
 * browser actually arrives on a text page with content — not a hang, not the
 * error boundary, not a false 404. This is the one existing checks (which all
 * stop at "did the page respond") would have missed, because /texts itself
 * loads fine from cache; the failure only shows up one click further in.
 */
async function checkClickThrough(context) {
  const page = await context.newPage();
  const listing = await timedGoto(page, BASE + '/texts');
  if (!listing.ok) {
    row('click-through', 'load /texts', 'fail', `did not load: ${listing.error}`);
    await page.close();
    return;
  }

  const href = await page
    .locator('a[href^="/texts/"]')
    .first()
    .getAttribute('href')
    .catch(() => null);
  if (!href) {
    row('click-through', 'find a text link', 'fail', 'no /texts/* link found on /texts');
    await page.close();
    return;
  }

  const start = Date.now();
  try {
    await Promise.all([
      page.waitForURL((u) => u.pathname === href, { timeout: BUDGET_MS }),
      page.locator(`a[href="${href}"]`).first().click(),
    ]);
  } catch (err) {
    row(
      'click-through',
      `click ${href}`,
      'fail',
      `did not navigate within ${BUDGET_MS}ms: ${String(err.message || err).split('\n')[0]}`
    );
    await page.close();
    return;
  }
  const navMs = Date.now() - start;

  if (await isErrorBoundary(page)) {
    row('click-through', `click ${href}`, 'fail', `landed on the error boundary after ${navMs}ms`);
    await page.close();
    return;
  }

  // A real text page carries a title in an <h1>. Anything else — a blank
  // shell, a false 404 — means the click "worked" in the sense of changing
  // the URL but not in the sense that matters to a reader.
  const hasContent = await page.locator('h1').first().isVisible().catch(() => false);
  row(
    'click-through',
    `click ${href}`,
    hasContent ? 'pass' : 'fail',
    hasContent ? `navigated + rendered in ${navMs}ms` : `navigated in ${navMs}ms but no content rendered`
  );
  await page.close();
}

// ── main ────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nSite health sweep → ${BASE}`);
  console.log(`Budget: ${BUDGET_MS}ms per page load.\n`);

  const browser = await chromium.launch({
    headless: !flags.headed,
    ...(BROWSER_PATH ? { executablePath: BROWSER_PATH } : {}),
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1600 } });
  // Locator actions (click, getAttribute) auto-wait, but only up to whatever
  // timeout applies — without this they fall back to Playwright's own 30s
  // default, which silently swallows the BUDGET_MS the rest of this script is
  // built around. The click-through check found zero links on first use
  // because of exactly this: the page navigated before the client component
  // had hydrated, and the default timeout wasn't wired to this script's own.
  context.setDefaultTimeout(BUDGET_MS);
  if (BYPASS_TOKEN) await context.setExtraHTTPHeaders(BYPASS_HEADERS);
  await installProxy(context);

  const suites = [
    ['cached pages', checkCachedPages],
    ['live routes', checkLiveRoutes],
    ['click-through', checkClickThrough],
  ];
  for (const [name, fn] of suites) {
    process.stdout.write(`· ${name}\n`);
    try {
      await fn(context);
    } catch (err) {
      row(name, '(suite)', 'fail', String(err.message || err).slice(0, 160));
    }
  }

  await context.close();
  await browser.close();

  console.log(`\n${formatTable(rows)}\n`);
  const t = summarise(rows);
  console.log(`${t.pass} passed · ${t.fail} failed · ${t.skip} skipped\n`);
  if (t.fail) {
    console.log('A failure here means a reader-facing surface is slow, hanging, or dead —');
    console.log('not a maintenance nuisance to wave off.\n');
  }
  process.exit(t.fail ? 1 : 0);
}

main().catch((err) => {
  console.error(`\n✖ ${err.stack || err}\n`);
  process.exit(2);
});
