/**
 * wire-check.mjs — the pure half of the analytics wire sweep.
 *
 * "An analytics change is done when you have observed the outgoing request
 * carrying the expected payload" (CLAUDE.md). This module knows how to tell an
 * Umami collection request from any other request, how to read a beacon body,
 * and whether a captured event carries the properties its register row claims.
 * It touches no browser, so scripts/verify-analytics.mjs can be trusted to be
 * asserting the right thing without first having to run a browser to find out.
 */

/**
 * Does this URL address Umami's collection endpoint?
 *
 * The tracker POSTs to `<script host>/api/send`. We match on the host so a
 * self-hosted instance or a region gateway is caught too, and deliberately
 * exclude the tracker script itself — blocking that would leave
 * `window.umami` undefined and every check would "pass" by firing nothing,
 * which is the exact ambiguity CLAUDE.md warns about.
 */
export function isUmamiCollect(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (!/umami/i.test(u.hostname)) return false;
  if (/\/script\.js$/.test(u.pathname)) return false;
  return u.pathname.endsWith('/api/send') || u.pathname.endsWith('/api/collect');
}

/**
 * Read one beacon body into `{ name, data, url }`, or null when it is not a
 * named custom event (a pageview, or a body we cannot parse).
 */
export function parseBeacon(postData) {
  if (!postData) return null;
  let body;
  try {
    body = JSON.parse(postData);
  } catch {
    return null;
  }
  const payload = body?.payload;
  if (!payload || typeof payload !== 'object') return null;
  if (!payload.name) return null; // pageview, not a custom event
  return {
    name: String(payload.name),
    data: payload.data && typeof payload.data === 'object' ? payload.data : {},
    url: typeof payload.url === 'string' ? payload.url : '',
  };
}

/**
 * Assert a captured event against an expectation.
 *
 * `expected` maps property name -> matcher:
 *   • a string or number — the value must equal it
 *   • `true`            — the property must be present and non-empty
 *   • a RegExp          — the value must match
 *
 * Returns `{ ok, problems }`; `problems` is human-readable, because a failing
 * row in the table has to say what was wrong without a re-run to find out.
 */
export function checkProps(event, expected) {
  const problems = [];
  if (!event) return { ok: false, problems: ['no beacon captured'] };

  for (const [key, matcher] of Object.entries(expected)) {
    const value = event.data[key];
    const present = value !== undefined && value !== null && value !== '';

    if (matcher === true) {
      if (!present) problems.push(`${key} missing`);
      continue;
    }
    if (matcher instanceof RegExp) {
      if (!present) problems.push(`${key} missing`);
      else if (!matcher.test(String(value))) problems.push(`${key}=${value} !~ ${matcher}`);
      continue;
    }
    if (!present) problems.push(`${key} missing (wanted ${matcher})`);
    else if (String(value) !== String(matcher)) problems.push(`${key}=${value}, wanted ${matcher}`);
  }
  return { ok: problems.length === 0, problems };
}

/** A slug-shaped identifier — the rule that identifiers are slugs, not titles. */
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Which rule chose a read-next pick (`pick` on text-open from=read-next): the
 * editor's own choice, or one of lib/read-next.ts's rules. Lets editorial picks
 * be compared with automatic ones without joining sessions.
 */
export const READ_NEXT_PICK = /^(editorial|author|theme|genre)$/;

/** Render result rows as a fixed-width table. */
export function formatTable(rows) {
  const head = ['', 'EVENT', 'CASE', 'DETAIL'];
  const mark = { pass: '✓', fail: '✗', skip: '–' };
  const body = rows.map((r) => [mark[r.status] ?? '?', r.event, r.case, r.detail ?? '']);
  const all = [head, ...body];
  const widths = head.map((_, i) => Math.max(...all.map((r) => String(r[i] ?? '').length)));
  const line = (cells) => cells.map((c, i) => String(c ?? '').padEnd(widths[i])).join('  ').trimEnd();
  return [line(head), widths.map((w) => '─'.repeat(w)).join('  '), ...body.map(line)].join('\n');
}

/** Tally rows by status. */
export function summarise(rows) {
  const t = { pass: 0, fail: 0, skip: 0 };
  for (const r of rows) t[r.status] = (t[r.status] ?? 0) + 1;
  return t;
}
