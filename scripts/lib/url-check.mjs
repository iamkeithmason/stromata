/**
 * url-check.mjs — the assertion half of the prospect URL sweep
 *
 * `scripts/check-prospect-urls.mjs` does the network and the printing; this
 * module decides what a URL field contains and what a response means. It is
 * pure and unit-tested, for the same reason `wire-check.mjs` is: a sweep that
 * looks in the wrong place goes green, and a green sweep is worse than none.
 *
 * Why this exists at all. On 2026-09-21 a duplicate sweep of the Content
 * Prospect List incidentally checked five URLs that had never been fetched:
 *
 *   - All of Grace            Reference URL → gutenberg.org/ebooks/27570, a
 *                             DIFFERENT BOOK (Buchanan's Journal of Man). It
 *                             was synced, fetched, and 108 KB of the wrong work
 *                             was imported under Spurgeon's name.
 *   - Cloud of Unknowing #14  ccel.org/ccel/anonymous/cloud → 404
 *   - Preces Privatae #12     ccel.org/ccel/andrewes/preces → 404
 *   - Lamentation #109        archive.org/details/lamentationofsinner00parr → 404
 *   - Hymns E. Church #243    sacred-texts.com/chr/hec/ → 403 (Cloudflare)
 *
 * Four rotted and one was never fetchable. None had been checked, because a
 * URL sitting in a field looks like a fact.
 *
 * THE DISTINCTION THAT MATTERS: a 403 is not a dead link. The sacred-texts URL
 * is correct — the pipeline simply cannot fetch it. Collapsing "gone" and
 * "refused" into one "bad" bucket would have this tool recommend deleting good
 * data, so the verdicts stay separate and only `dead` fails a run by default.
 *
 * What it CANNOT tell you: whether the URL resolves to the RIGHT WORK. All of
 * Grace's wrong-book URL answered 200 and would pass this check. Reachability
 * is the cheap half; CLAUDE.md's rule — fetch it and read the title and author
 * out of the first few hundred bytes — remains the one that catches that, and
 * remains a human/agent step.
 */

/** Fields that can hold a URL, ordered by how much a failure in them costs. */
export const URL_FIELDS = [
  // The sync prefers this one, so a bad value here reaches Stage 2.
  { name: 'Cleared edition URL', severity: 'high' },
  // Multi-part works pin their remaining parts here; a gap silently truncates.
  { name: 'Additional edition URLs', severity: 'high' },
  // Advisory since the sync stopped preferring it, but still what humans click.
  { name: 'Reference URL', severity: 'low' },
];

const MARKDOWN_LINK = /\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/gi;
const BARE_URL = /https?:\/\/[^\s<>()[\]"']+/gi;

/**
 * Pull every http(s) URL out of one field's raw value.
 *
 * The values are not uniform: `Additional edition URLs` holds several URLs
 * separated by newlines or literal `<br>`, and Notion auto-links bare domains
 * so a value can come back as `[gutenberg.org](http://gutenberg.org)`. Taking
 * the markdown target first and then scanning what remains avoids counting a
 * link twice or mistaking its label for a second URL.
 */
export function urlsInValue(value) {
  const raw = String(value ?? '');
  if (!raw.trim()) return [];

  const found = [];
  const seen = new Set();
  const push = (url) => {
    // Trailing punctuation is prose, not part of the address.
    const cleaned = url.replace(/[.,;:]+$/, '');
    if (!seen.has(cleaned)) {
      seen.add(cleaned);
      found.push(cleaned);
    }
  };

  const withoutLinks = raw.replace(MARKDOWN_LINK, (_match, target) => {
    push(target);
    return ' ';
  });

  for (const match of withoutLinks.matchAll(BARE_URL)) push(match[0]);
  return found;
}

/** Every URL on a row, tagged with the field it came from. */
export function extractUrls(row) {
  const out = [];
  for (const field of URL_FIELDS) {
    for (const url of urlsInValue(row?.fields?.[field.name])) {
      out.push({ field: field.name, severity: field.severity, url });
    }
  }
  return out;
}

/**
 * What a response (or a failure to get one) means.
 *
 * Deliberately narrow: this says whether the address still answers, never
 * whether it answers with the right text.
 */
export function classify({ status, error } = {}) {
  if (error) {
    return { verdict: 'unreachable', why: `request failed: ${error}` };
  }
  if (status >= 200 && status < 300) {
    return { verdict: 'ok', why: `HTTP ${status}` };
  }
  if (status === 404 || status === 410) {
    return { verdict: 'dead', why: `HTTP ${status} — the URL is gone` };
  }
  if (status === 401 || status === 403) {
    return {
      verdict: 'blocked',
      why: `HTTP ${status} — refused, not gone; the address may be correct but the pipeline cannot fetch it`,
    };
  }
  if (status === 429) {
    return { verdict: 'blocked', why: 'HTTP 429 — rate limited; re-check before concluding anything' };
  }
  if (status >= 500) {
    return { verdict: 'server-error', why: `HTTP ${status} — the host is failing; transient until proven otherwise` };
  }
  return { verdict: 'unexpected', why: `HTTP ${status}` };
}

/** Worst-first ordering, so a report's first line is the thing to fix. */
export const VERDICT_ORDER = ['dead', 'unreachable', 'unexpected', 'server-error', 'blocked', 'ok'];

export function compareResults(a, b) {
  const byVerdict = VERDICT_ORDER.indexOf(a.verdict) - VERDICT_ORDER.indexOf(b.verdict);
  if (byVerdict !== 0) return byVerdict;
  // Within a verdict, a cleared edition matters more than a reference.
  if (a.severity !== b.severity) return a.severity === 'high' ? -1 : 1;
  return String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
}

/**
 * Should the run exit non-zero?
 *
 * Only `dead` by default. `blocked` is real information but not a defect in the
 * data, and failing on it would make the check cry wolf about sacred-texts
 * every single run until someone stopped reading the output — which is how a
 * check stops working without ever going red.
 */
export function shouldFail(results, { failOn = 'dead' } = {}) {
  if (failOn === 'never') return false;
  const fatal = failOn === 'any'
    ? new Set(['dead', 'unreachable', 'unexpected', 'server-error', 'blocked'])
    : new Set(['dead']);
  return results.some((r) => fatal.has(r.verdict));
}

/** One-line summary counts, for the tail of the report. */
export function summarise(results) {
  // A plain object, not Object.create(null): the verdicts are a fixed internal
  // set, so there is nothing to defend against, and a null-prototype object is
  // a surprise to every caller that compares or serialises it.
  const counts = {};
  for (const r of results) counts[r.verdict] = (counts[r.verdict] ?? 0) + 1;
  return counts;
}
