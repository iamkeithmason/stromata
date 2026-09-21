#!/usr/bin/env node
/**
 * verify-analytics.mjs — observe the wire, don't trust the JSX.
 *
 * "An analytics change is not done when the attribute is in the JSX. It is done
 * when you have observed the outgoing request carrying the expected payload."
 * (CLAUDE.md). That rule was previously a manual browser-console ritual, which
 * is why the seasonal panel shipped a four-week engagement test with a missing
 * property and nobody noticed. This turns it into a command.
 *
 * It drives a real browser over a real deployment, intercepts every request to
 * Umami's collection endpoint, records the payload, and then ABORTS it — so a
 * verification run never lands a single synthetic event in the real dataset.
 * The tracker script itself is let through: blocking it would leave
 * `window.umami` undefined and every check would "pass" by firing nothing.
 *
 * Usage
 *   node scripts/verify-analytics.mjs --url=https://<preview>.vercel.app
 *   node scripts/verify-analytics.mjs --prod            # production, opt-in
 *   node scripts/verify-analytics.mjs --url=… --only=text-session-depth,theme-click
 *   node scripts/verify-analytics.mjs --url=… --headed --verbose
 *
 * Exit code is 0 only when nothing failed, so it can gate a deploy.
 *
 * Needs a Chromium: `npx playwright install chromium` once. In a sandbox with a
 * preinstalled browser, point at it with --browser-path= or CHROMIUM_PATH.
 *
 * Behind a TLS-inspecting proxy (CI sandboxes, some corporate networks) Chromium
 * will not trust the re-signed certificate and every page load fails with
 * ERR_CERT_AUTHORITY_INVALID. `--via-node` then routes each request through
 * Playwright's own Node-side stack, which reads the usual Node CA configuration
 * (NODE_EXTRA_CA_CERTS). Certificates are still verified — just by Node rather
 * than by Chromium. The page, its scripts and the tracker are the real ones.
 */

import { chromium } from 'playwright';
import {
  isUmamiCollect,
  parseBeacon,
  checkProps,
  formatTable,
  summarise,
  SLUG,
} from './lib/wire-check.mjs';

// ───────────────────────────── arguments ─────────────────────────────

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
  die('That is production. Pass --prod as well if you mean it (beacons are aborted either way).');
}

const ONLY = flags.only ? new Set(String(flags.only).split(',').map((s) => s.trim())) : null;
const VERBOSE = Boolean(flags.verbose);
const TIMEOUT = Number(flags.timeout) || 8000;
const BROWSER_PATH = flags['browser-path'] || process.env.CHROMIUM_PATH || undefined;
const VIA_NODE = Boolean(flags['via-node']);

const log = (...a) => VERBOSE && console.log('   ', ...a);

// ───────────────────────────── harness ─────────────────────────────

/** Every named event seen since the last reset. */
const captured = [];
let blockedCount = 0;

async function installInterceptor(context) {
  // Registered first, so the specific routes below take priority (Playwright
  // gives precedence to the most recently added matching route).
  if (VIA_NODE) {
    await context.route('**/*', async (route) => {
      try {
        await route.fulfill({ response: await route.fetch({ maxRedirects: 5 }) });
      } catch {
        // The context is torn down at the end of the run while requests are
        // still in flight; nothing useful to do but drop them.
        await route.abort().catch(() => {});
      }
    });
  }

  // Record and abort every Umami collection request. Abort, not fulfil: a 200
  // would be a lie the tracker might act on, and abort is the strongest
  // guarantee that nothing reaches the real dataset.
  await context.route(
    (url) => isUmamiCollect(typeof url === 'string' ? url : url.toString()),
    async (route) => {
      blockedCount += 1;
      const event = parseBeacon(route.request().postData());
      if (event) {
        captured.push(event);
        log(`beacon  ${event.name}  ${JSON.stringify(event.data)}`);
      }
      await route.abort();
    }
  );

  // Downloads are <a href> to route handlers that render a PDF. We want the
  // click event, not the file — abort the transfer so no PDF is ever built.
  await context.route('**/download/**', (route) => route.abort());
}

function reset() {
  captured.length = 0;
}

/** Poll the recorder for a named event. Returns the event or null. */
async function waitForEvent(name, { timeout = TIMEOUT } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const hit = captured.find((e) => e.name === name);
    if (hit) return hit;
    if (Date.now() > deadline) return null;
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** Open a URL in a FRESH TAB — a fresh tab is a fresh sessionStorage. */
async function open(context, path) {
  const page = await context.newPage();
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await ensureTracker(page);
  return page;
}

/**
 * The absence trap: "no event appeared" is ambiguous between broken code and a
 * tracker that never loaded. Refuse to report anything until the tracker is up.
 */
async function ensureTracker(page) {
  await page
    .waitForFunction(() => typeof window.umami !== 'undefined', null, { timeout: 15000 })
    .catch(() => {
      throw new Error(
        'window.umami never appeared — the tracker script did not load on this target. ' +
          'Every check would pass by firing nothing, so the run is stopped instead.'
      );
    });
}

/**
 * `null` in an expectation means "must be present, value not pinned here".
 * checkProps spells that `true`; this keeps the call sites readable.
 */
function normaliseExpect(obj) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v === null ? true : v]));
}

const rows = [];
const row = (event, name, status, detail) => rows.push({ event, case: name, status, detail });

/**
 * Do `action`, then assert the named event arrived carrying `expect`.
 */
async function expectEvent({ event, case: label, expect, action }) {
  const wanted = normaliseExpect(expect);
  reset();
  try {
    await action();
  } catch (err) {
    row(event, label, 'fail', `action failed: ${String(err.message || err).slice(0, 90)}`);
    return;
  }
  const hit = await waitForEvent(event);
  const { ok, problems } = checkProps(hit, wanted);
  if (ok) {
    row(event, label, 'pass', JSON.stringify(hit.data));
  } else {
    const others = captured.filter((e) => e.name !== event).map((e) => e.name);
    const extra = !hit && others.length ? ` (saw: ${[...new Set(others)].join(', ')})` : '';
    row(event, label, 'fail', problems.join('; ') + extra);
  }
}

/** Assert that NO event of this name arrives — used for the once-per-session rule. */
async function expectNoEvent({ event, case: label, action, timeout = 2500 }) {
  reset();
  await action();
  const hit = await waitForEvent(event, { timeout });
  if (hit) row(event, label, 'fail', `fired again with ${JSON.stringify(hit.data)}`);
  else row(event, label, 'pass', 'silent, as it should be');
}

// ───────────────────────────── discovery ─────────────────────────────

/**
 * The site has no index page for themes, eras, traditions or collections, so
 * the sitemap is the discovery source — it is generated from the database and
 * therefore lists exactly the pages that currently have content.
 */
async function loadSitemap() {
  const res = await fetch(`${BASE}/sitemap.xml`);
  if (!res.ok) die(`GET ${BASE}/sitemap.xml -> HTTP ${res.status}. Is the target deployed?`);
  const xml = await res.text();
  const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1].replace(/^https?:\/\/[^/]+/, ''))
    .filter(Boolean);
  const bucket = (prefix) => paths.filter((p) => p.startsWith(prefix) && p !== prefix);
  return {
    texts: bucket('/texts/'),
    authors: bucket('/authors/'),
    collections: bucket('/collections/'),
    themes: bucket('/themes/'),
    eras: bucket('/eras/'),
    traditions: bucket('/traditions/'),
    locations: bucket('/locations/'),
  };
}

/**
 * Visit candidate pages until one carries `selector`, and return that page.
 * Bounded, because a surface that exists on no page at all is a finding, not a
 * reason to crawl 219 texts.
 */
async function findPageWith(context, candidates, selector, { limit = 8 } = {}) {
  // A page that fails to LOAD is not evidence that the surface is missing, and
  // reporting it as "not found" would quietly turn an infrastructure failure
  // into a green-ish dash. Track load errors separately and let the caller say
  // so out loud.
  let loadError = null;
  let loaded = 0;
  for (const path of candidates.slice(0, limit)) {
    const page = await context.newPage();
    try {
      await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 30000 });
      loaded += 1;
      if (await page.locator(selector).first().count()) {
        await ensureTracker(page);
        log(`surface ${selector} found on ${path}`);
        return { page, path };
      }
    } catch (err) {
      loadError ??= `${path}: ${String(err.message).split('\n')[0]}`;
      log(`load failed ${path}: ${err.message}`);
    }
    await page.close();
  }
  if (loaded === 0 && loadError) throw new Error(`no candidate page loaded — ${loadError}`);
  return null;
}

const linkSelector = (event, from) =>
  `[data-umami-event="${event}"][data-umami-event-from="${from}"]`;

/** Click the first matching element without waiting for the navigation it starts. */
async function clickFirst(page, selector) {
  const el = page.locator(selector).first();
  await el.scrollIntoViewIfNeeded();
  await el.click({ noWaitAfter: true, timeout: 5000 });
}

// ───────────────────────────── the checks ─────────────────────────────

/**
 * One `from` value per surface, per the vocabulary in CLAUDE.md. Each entry is
 * (event, from) -> the pages that should carry that link.
 */
function navSurfaces(site) {
  return [
    // text-open — every `from` PR #93 added, plus the surfaces already live.
    ['text-open', 'texts-index', ['/texts']],
    ['text-open', 'search-results', ['/search?q=prayer']],
    ['text-open', 'theme-page', site.themes],
    ['text-open', 'era-page', site.eras],
    ['text-open', 'tradition-page', site.traditions],
    ['text-open', 'collection-page', site.collections],
    ['text-open', 'location-page', site.locations],
    ['text-open', 'scripture-page', site.scripture],
    // author-open
    ['author-open', 'authors-index', ['/authors']],
    ['author-open', 'search-results', ['/search?q=prayer']],
    ['author-open', 'collection-page', site.collections],
    ['author-open', 'text-reader', site.texts],
    ['author-open', 'featured-lead', ['/']],
    // collection-open — the two surfaces the brief names.
    ['collection-open', 'theme-page', site.themes],
    ['collection-open', 'scripture-page', site.scripture],
  ];
}

/** Properties each event must carry, beyond the mandatory `from`. */
const NAV_EXPECT = {
  'text-open': { from: null, text: SLUG },
  'author-open': { from: null, author: true },
  'collection-open': { from: null, collection: SLUG },
};

async function checkNavEvents(context, site) {
  for (const [event, from, candidates] of navSurfaces(site)) {
    if (ONLY && !ONLY.has(event)) continue;
    const label = `from=${from}`;
    if (!candidates || candidates.length === 0) {
      row(event, label, 'skip', 'no candidate page in the sitemap');
      continue;
    }
    const selector = linkSelector(event, from);
    let found;
    try {
      found = await findPageWith(context, candidates, selector);
    } catch (err) {
      // One unreachable surface must not stop the other fourteen.
      row(event, label, 'fail', String(err.message).slice(0, 110));
      continue;
    }
    if (!found) {
      row(event, label, 'skip', `no element matching ${selector} on ${candidates.length} candidate page(s)`);
      continue;
    }
    const expect = { ...NAV_EXPECT[event], from };
    await expectEvent({
      event,
      case: label,
      expect,
      action: () => clickFirst(found.page, selector),
    });
    await found.page.close();
  }
}

async function checkSessionDepth(context, site) {
  const [a, b, c] = site.texts;
  if (!a || !b || !c) {
    row('text-session-depth', 'depth 1 & 2', 'skip', 'need three published texts');
    return;
  }

  // A fresh tab is a fresh session. Organic landing — no click, no referrer.
  reset();
  const page = await open(context, a);
  let hit = await waitForEvent('text-session-depth');
  let res = checkProps(hit, { depth: 1, text: a.replace('/texts/', '') });
  row('text-session-depth', 'depth 1 · organic landing', res.ok ? 'pass' : 'fail',
    res.ok ? JSON.stringify(hit.data) : res.problems.join('; '));

  // Reload must not re-count the same text.
  await expectNoEvent({
    event: 'text-session-depth',
    case: 'reload does not re-count',
    action: () => page.reload({ waitUntil: 'domcontentloaded' }),
  });

  // Second distinct text, reached the way a reader reaches it — a click.
  const indexPage = page;
  await expectEvent({
    event: 'text-session-depth',
    case: 'depth 2 · text-open click',
    expect: { depth: 2, text: SLUG },
    action: async () => {
      await indexPage.goto(BASE + '/texts', { waitUntil: 'domcontentloaded' });
      await ensureTracker(indexPage);
      await clickFirst(indexPage, '[data-umami-event="text-open"]');
      await indexPage.waitForURL(/\/texts\/.+/, { timeout: 15000 }).catch(() => {});
      await ensureTracker(indexPage);
    },
  });

  // Back to a text already counted — browser history must not inflate depth.
  // History at this point is [text A, /texts, text B], so two steps back lands
  // on text A and two steps forward returns to text B; neither may fire.
  await expectNoEvent({
    event: 'text-session-depth',
    case: 'back/forward does not re-count',
    action: async () => {
      await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.goForward({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.goForward({ waitUntil: 'domcontentloaded' }).catch(() => {});
    },
  });

  // Depth 3 is deliberately not instrumented.
  await expectNoEvent({
    event: 'text-session-depth',
    case: 'depth 3 never fires',
    action: async () => {
      await page.goto(BASE + c, { waitUntil: 'domcontentloaded' });
      await ensureTracker(page);
    },
  });

  await page.close();
}

async function checkThemeClick(context, site) {
  const selector = '[data-umami-event="theme-click"][data-umami-event-source="text-page"]';
  const found = await findPageWith(context, site.texts, selector);
  if (!found) {
    row('theme-click', 'text-page hero chip', 'skip', 'no themed text found in the first candidates');
    return;
  }
  // Legacy exception, kept deliberately: this event uses `source`, not `from`,
  // and sends the theme's display NAME, not its slug (CLAUDE.md).
  await expectEvent({
    event: 'theme-click',
    case: 'text-page hero chip',
    expect: { source: 'text-page', theme: true },
    action: () => clickFirst(found.page, selector),
  });
  await found.page.close();
}

async function checkCollectionNav(context, site) {
  const selector = '[data-umami-event="collection-nav"]';
  const found = await findPageWith(context, site.texts, selector, { limit: 12 });
  if (!found) {
    row('collection-nav', 'prev/next', 'skip', 'no text inside a collection found');
    return;
  }
  for (const direction of ['next', 'prev', 'end']) {
    const sel = `${selector}[data-umami-event-direction="${direction}"]`;
    if (!(await found.page.locator(sel).first().count())) {
      log(`no ${direction} link on ${found.path}`);
      continue;
    }
    await expectEvent({
      event: 'collection-nav',
      case: `direction=${direction}`,
      // `collection` here is the collection TITLE, not a slug — pre-existing and
      // left alone for data continuity, so presence is what we assert.
      expect: { from: 'text-reader', direction, collection: true },
      action: () => clickFirst(found.page, sel),
    });
    await found.page.goto(BASE + found.path, { waitUntil: 'domcontentloaded' });
    await ensureTracker(found.page);
  }
  await found.page.close();
}

async function checkCitationCopy(context, site) {
  const page = await open(context, site.texts[0]);
  const button = page.getByRole('button', { name: /cite this text/i }).first();
  if (!(await button.count())) {
    row('citation-copy', 'text footer', 'skip', 'no "Cite this text" button on the page');
    await page.close();
    return;
  }
  await expectEvent({
    event: 'citation-copy',
    case: 'text footer button',
    expect: { from: 'text-reader', text: site.texts[0].replace('/texts/', '') },
    action: () => button.click(),
  });
  await page.close();
}

async function checkReaderSettings(context, site) {
  const page = await open(context, site.texts[0]);
  const opener = page.getByRole('button', { name: 'Reading settings' }).first();
  if (!(await opener.count())) {
    row('reader-setting-change', 'panel', 'skip', 'reader settings control not found');
    await page.close();
    return;
  }
  await opener.click();
  const panel = page.getByRole('dialog', { name: 'Reading settings' });

  // One case per setting, because the brief and the register both claim all
  // three fire — and a panel where only the first one is wired would otherwise
  // read as green.
  const cases = [
    ['theme', 'Theme'],
    ['font-size', 'Text size'],
    ['measure', 'Width'],
  ];
  for (const [i, [setting, groupLabel]] of cases.entries()) {
    // The panel is three <p class="kicker"> labels each followed by a row of
    // buttons, so the Nth child <div> is the Nth group. Take the LAST button of
    // the group: the first is usually the current value, and clicking the
    // active value still fires but tells us less.
    const group = panel.locator(':scope > div').nth(i);
    const target = group.locator('button').last();
    if (!(await target.count())) {
      row('reader-setting-change', `setting=${setting}`, 'skip', `no ${groupLabel} buttons`);
      continue;
    }
    await expectEvent({
      event: 'reader-setting-change',
      case: `setting=${setting}`,
      expect: { from: 'text-reader', setting, value: true },
      action: () => target.click(),
    });
  }
  await page.close();
}

async function checkDownloads(context, site) {
  // A text inside a collection offers both rows at once.
  const found =
    (await findPageWith(context, site.texts, '[data-umami-event="collection-download"]', { limit: 12 })) ??
    (await findPageWith(context, site.texts, '[data-umami-event="text-download"]', { limit: 6 }));
  if (!found) {
    row('text-download', 'markdown/pdf', 'skip', 'no download links found on any candidate text');
    return;
  }
  for (const event of ['text-download', 'collection-download']) {
    if (ONLY && !ONLY.has(event)) continue; // both live on the same page
    const idProp = event === 'text-download' ? 'text' : 'collection';
    for (const format of ['markdown', 'pdf']) {
      const sel = `[data-umami-event="${event}"][data-umami-event-format="${format}"]`;
      if (!(await found.page.locator(sel).first().count())) {
        row(event, `format=${format}`, 'skip', 'not offered on this page');
        continue;
      }
      await expectEvent({
        event,
        case: `format=${format}`,
        expect: { from: null, format, [idProp]: SLUG },
        action: () => clickFirst(found.page, sel),
      });
    }
  }
  // Collection downloads also live on the collection page itself.
  if (!ONLY || ONLY.has('collection-download')) {
    const onCollection = await findPageWith(
      context,
      site.collections,
      '[data-umami-event="collection-download"]'
    );
    if (onCollection) {
      await expectEvent({
        event: 'collection-download',
        case: 'from=collection-page',
        expect: { from: 'collection-page', format: 'markdown', collection: SLUG },
        action: () =>
          clickFirst(
            onCollection.page,
            '[data-umami-event="collection-download"][data-umami-event-format="markdown"]'
          ),
      });
      await onCollection.page.close();
    }
  }
  await found.page.close();
}

// ───────────────────────────── main ─────────────────────────────

async function main() {
  console.log(`\nAnalytics wire sweep → ${BASE}`);
  console.log('Umami beacons are intercepted and aborted; nothing reaches the dataset.\n');

  const browser = await chromium.launch({
    headless: !flags.headed,
    ...(BROWSER_PATH ? { executablePath: BROWSER_PATH } : {}),
  });
  const context = await browser.newContext({
    acceptDownloads: false,
    viewport: { width: 1280, height: 1600 },
  });
  context.setDefaultTimeout(TIMEOUT);
  await installInterceptor(context);
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(BASE).origin });

  const site = await loadSitemap();
  // Scripture pages are not in the sitemap; take them off the /scripture index.
  site.scripture = await (async () => {
    const page = await context.newPage();
    try {
      await page.goto(BASE + '/scripture', { waitUntil: 'domcontentloaded' });
      return await page.$$eval('a[href^="/scripture/"]', (as) =>
        [...new Set(as.map((a) => a.getAttribute('href')))].slice(0, 10)
      );
    } catch {
      return [];
    } finally {
      await page.close();
    }
  })();

  console.log(
    `Corpus: ${site.texts.length} texts · ${site.collections.length} collections · ` +
      `${site.themes.length} themes · ${site.scripture.length} scripture refs\n`
  );

  // Each suite declares the events it covers, so --only can skip whole suites
  // instead of every check having to re-test the filter.
  const suites = [
    ['session depth', ['text-session-depth'], checkSessionDepth],
    ['theme chips', ['theme-click'], checkThemeClick],
    ['collection nav', ['collection-nav'], checkCollectionNav],
    ['citation', ['citation-copy'], checkCitationCopy],
    ['reader settings', ['reader-setting-change'], checkReaderSettings],
    ['downloads', ['text-download', 'collection-download'], checkDownloads],
    ['navigation links', ['text-open', 'author-open', 'collection-open'], checkNavEvents],
  ];

  for (const [name, events, fn] of suites) {
    if (ONLY && !events.some((e) => ONLY.has(e))) continue;
    process.stdout.write(`· ${name}\n`);
    try {
      await fn(context, site);
    } catch (err) {
      row(name, '(suite)', 'fail', String(err.message || err).slice(0, 120));
    }
  }

  await context.close();
  await browser.close();

  console.log(`\n${formatTable(rows)}\n`);
  const t = summarise(rows);
  console.log(
    `${t.pass} passed · ${t.fail} failed · ${t.skip} skipped · ` +
      `${blockedCount} beacon(s) intercepted and aborted\n`
  );
  if (t.fail) {
    console.log('Failures are real until proven otherwise — an absent beacon means the');
    console.log('attribute is not reaching the wire, whatever the JSX says.\n');
  }
  process.exit(t.fail ? 1 : 0);
}

main().catch((err) => {
  console.error(`\n✖ ${err.stack || err}\n`);
  process.exit(2);
});
