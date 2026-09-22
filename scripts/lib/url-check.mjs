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

/* ===========================================================================
   The positive control — does the body evidence the work we asked for?
   ===========================================================================

   `classify` above answers whether an address still answers. That is the cheap
   half, and the file has said so in prose since it was written: "All of Grace's
   wrong-book URL answered 200 and would pass this check." What follows makes
   the other half mechanical.

   It exists because the same mistake was made twice, in two directions:

     - WRONG WORK. gutenberg.org/ebooks/27570 was pinned as Spurgeon's *All of
       Grace* and is in fact *Buchanan's Journal of Man, July 1887*. It returned
       200, the sync took it, and the wrong book was imported under Spurgeon's
       name.

     - WRONG DOCUMENT ENTIRELY. On 2026-09-22 a Vercel preview with Deployment
       Protection on answered every request with an SSO login page, at 200. A
       grep of that page for a retired font name found nothing, and the absence
       was reported as proof the font had been removed. A negative check against
       an unverified document is unfalsifiable: the wrong document also lacks
       the string you searched for.

   So a fetch is verified when the body contains something the RIGHT artefact
   must contain — never by its status, and never by what it fails to contain.

   Deliberately conservative about blame: not finding the expected words is
   reported as `unconfirmed`, not as a mismatch. A legitimate page can spell an
   author differently, or lead with a frontispiece image. `unconfirmed` means
   "a human must look", which is the honest verdict. */

/** Phrases that mean "you are looking at the gate, not the thing behind it". */
const INTERSTITIAL_MARKERS = [
  'sso-api', 'single sign-on', 'sign in to continue', 'authentication required',
  'log in to continue', 'access denied', 'checking your browser',
  'enable javascript and cookies', 'are you a robot', 'verify you are human',
  'subscribe to read', 'this content is protected',
];

/**
 * Strip case, accents and punctuation so "Æthelred's" and "aethelreds" meet.
 *
 * NFKD alone is not enough, and the gap bites precisely this corpus. Æ, Œ,
 * þ, ð and ß are LIGATURES AND LETTERS, not accented Latin letters, so they
 * do not decompose — and the `[^a-z0-9]` sweep below would then delete them
 * outright, turning "Æthelred" into "thelred" and failing to match a source
 * that spells it "Aethelred". Caught by a unit test, not in review. The long s
 * is here for the same reason it is everywhere else in this project: scans.
 */
const LETTER_EXPANSIONS = [
  [/Æ/g, 'AE'], [/æ/g, 'ae'],
  [/Œ/g, 'OE'], [/œ/g, 'oe'],
  [/[Þþ]/g, 'th'], [/[Ðð]/g, 'd'],
  [/ß/g, 'ss'], [/[Øø]/g, 'o'], [/[Đđ]/g, 'd'], [/ſ/g, 's'],
];

export function normaliseForMatch(text) {
  let out = String(text ?? '');
  for (const [re, to] of LETTER_EXPANSIONS) out = out.replace(re, to);
  return out
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Words worth matching on. Drops the articles and prepositions that make
 * "The Cloud of Unknowing" match almost any devotional page.
 */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'on', 'in', 'to', 'and', 'or', 'for', 'from',
  'by', 'with', 'his', 'her', 'its', 'de', 'la', 'le',
]);

export function significantWords(text) {
  return normaliseForMatch(text).split(' ').filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/**
 * Decide whether `body` evidences the work named by `expect`.
 *
 * @param {object}  input
 * @param {string}  input.body     the fetched text (the head of it is enough)
 * @param {object}  input.expect   { title, author } as the queue records them
 * @param {number} [input.window]  how many characters of the head to trust
 * @returns {{verdict: string, why: string, matched?: object}}
 *
 * Verdicts, worst first: `interstitial` (a gate, not the work), `no-content`
 * (nothing to read — a redirect shell, an image, an empty body), `unconfirmed`
 * (readable, but neither title nor author found), `partial` (one of the two),
 * `confirmed` (both).
 */
export function positiveControl({ body, expect = {}, window = 4000 } = {}) {
  const head = String(body ?? '').slice(0, window);
  const hay = normaliseForMatch(head);

  const marker = INTERSTITIAL_MARKERS.find((m) => hay.includes(normaliseForMatch(m)));
  if (marker) {
    return {
      verdict: 'interstitial',
      why: `the body looks like an access gate, not the work (matched "${marker}") — a 200 here says nothing about the artefact`,
    };
  }

  // Fewer than ~200 readable characters is not something you can conclude from.
  if (hay.replace(/\s/g, '').length < 200) {
    return { verdict: 'no-content', why: 'too little readable text in the response to confirm anything' };
  }

  const titleWords = significantWords(expect.title);
  const authorWords = significantWords(expect.author);
  if (titleWords.length === 0 && authorWords.length === 0) {
    return { verdict: 'unconfirmed', why: 'no expected title or author given to check against' };
  }

  // A majority of a title's significant words, and any one author word (a
  // surname alone is the usual case — "Spurgeon", "Keble").
  const hit = (w) => hay.includes(w);
  const titleHits = titleWords.filter(hit);
  const authorHits = authorWords.filter(hit);
  const titleFound = titleWords.length > 0 && titleHits.length * 2 >= titleWords.length;
  const authorFound = authorHits.length > 0;

  const matched = { title: titleHits, author: authorHits };

  if (titleFound && authorFound) {
    return { verdict: 'confirmed', why: `body names "${expect.title}" and "${expect.author}"`, matched };
  }
  if (titleFound || authorFound) {
    return {
      verdict: 'partial',
      why: titleFound
        ? `body names the title but not "${expect.author}" — check the edition before trusting it`
        : `body names "${expect.author}" but not the title — may be a different work by the same author`,
      matched,
    };
  }
  return {
    verdict: 'unconfirmed',
    why: `body mentions neither "${expect.title}" nor "${expect.author}" in its first ${window} characters — this is the Spurgeon/All-of-Grace shape; read it before Stage 2`,
    matched,
  };
}

/** Worst-first, so the most suspicious row is the first line of a report. */
export const CONTROL_ORDER = ['interstitial', 'no-content', 'unconfirmed', 'partial', 'confirmed'];

/** Is this verdict good enough to proceed on without a human reading it? */
export function controlPassed(verdict) {
  return verdict === 'confirmed';
}
