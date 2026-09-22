/**
 * Tests for the prospect URL sweep's assertion half.
 *
 * Every field value here is a real one from the Content Prospect List on
 * 2026-09-21, because the shapes are the whole difficulty: Notion auto-links
 * bare domains into markdown, and `Additional edition URLs` separates parts
 * with literal `<br>`. A regex that looks right against invented input and
 * wrong against these would make the sweep quietly check nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  urlsInValue,
  extractUrls,
  classify,
  compareResults,
  shouldFail,
  summarise,
  URL_FIELDS,
} from './url-check.mjs';

test('a plain URL is found', () => {
  assert.deepEqual(
    urlsInValue('https://ccel.org/ccel/spurgeon/grace/cache/grace.txt'),
    ['https://ccel.org/ccel/spurgeon/grace/cache/grace.txt'],
  );
});

test('an empty or missing value yields nothing', () => {
  assert.deepEqual(urlsInValue(''), []);
  assert.deepEqual(urlsInValue('   '), []);
  assert.deepEqual(urlsInValue(null), []);
  assert.deepEqual(urlsInValue(undefined), []);
});

test("Notion's auto-linked bare domain is counted once, by its target", () => {
  // Notion renders the bare word `Archive.org` in a note as a markdown link.
  // Counting the label as well would invent a second URL to check.
  assert.deepEqual(
    urlsInValue('Preferred over the [Archive.org](http://Archive.org) scan because it is a transcription'),
    ['http://Archive.org'],
  );
});

test('a markdown link whose label repeats the URL is not double-counted', () => {
  assert.deepEqual(
    urlsInValue(
      '[https://archive.org/download/allofgraceearnes00spur/allofgraceearnes00spur_djvu.txt](https://archive.org/download/allofgraceearnes00spur/allofgraceearnes00spur_djvu.txt)',
    ),
    ['https://archive.org/download/allofgraceearnes00spur/allofgraceearnes00spur_djvu.txt'],
  );
});

test('the multi-part Additional edition URLs value yields every part', () => {
  // Jewel #116 pins parts 02-06 this way; missing one silently truncates the work.
  const value = [
    '[https://anglicanhistory.org/jewel/apology/02.html](https://anglicanhistory.org/jewel/apology/02.html)',
    '[https://anglicanhistory.org/jewel/apology/03.html](https://anglicanhistory.org/jewel/apology/03.html)',
    '[https://anglicanhistory.org/jewel/apology/04.html](https://anglicanhistory.org/jewel/apology/04.html)',
  ].join('<br>');
  assert.deepEqual(urlsInValue(value), [
    'https://anglicanhistory.org/jewel/apology/02.html',
    'https://anglicanhistory.org/jewel/apology/03.html',
    'https://anglicanhistory.org/jewel/apology/04.html',
  ]);
});

test('newline-separated parts work too', () => {
  const value = 'https://www.newadvent.org/fathers/33042.htm\nhttps://www.newadvent.org/fathers/33043.htm';
  assert.equal(urlsInValue(value).length, 2);
});

test('trailing prose punctuation is not part of the address', () => {
  assert.deepEqual(
    urlsInValue('see https://ccel.org/ccel/anselm/basic_works, then stop'),
    ['https://ccel.org/ccel/anselm/basic_works'],
  );
});

test('a Google Drive folder is still a URL — the sweep reports, it does not pre-judge', () => {
  // Nine Drive rows carried one of these as their only Reference URL. It is a
  // useless *source*, but that is an editorial call, not this tool's.
  assert.deepEqual(
    urlsInValue('https://drive.google.com/drive/folders/1Vmkx2SgjAN0R6IICzFq9ZUmSFSoKMXPa'),
    ['https://drive.google.com/drive/folders/1Vmkx2SgjAN0R6IICzFq9ZUmSFSoKMXPa'],
  );
});

test('extractUrls tags each URL with its field and severity', () => {
  const row = {
    fields: {
      'Cleared edition URL': 'https://ccel.org/ccel/spurgeon/grace/cache/grace.txt',
      'Reference URL': 'https://ccel.org/ccel/spurgeon/grace',
      'Additional edition URLs': '',
    },
  };
  const found = extractUrls(row);
  assert.equal(found.length, 2);
  assert.deepEqual(
    found.map((f) => [f.field, f.severity]),
    [['Cleared edition URL', 'high'], ['Reference URL', 'low']],
  );
});

test('a row with no URLs at all yields nothing rather than throwing', () => {
  assert.deepEqual(extractUrls({ fields: {} }), []);
  assert.deepEqual(extractUrls({}), []);
  assert.deepEqual(extractUrls(null), []);
});

test('2xx is ok', () => {
  assert.equal(classify({ status: 200 }).verdict, 'ok');
  assert.equal(classify({ status: 204 }).verdict, 'ok');
});

test('404 and 410 are dead — the four rotted URLs found by hand', () => {
  assert.equal(classify({ status: 404 }).verdict, 'dead');
  assert.equal(classify({ status: 410 }).verdict, 'dead');
});

test('403 is blocked, NOT dead — this is the distinction the tool exists to keep', () => {
  // sacred-texts.com answers 403 behind Cloudflare. The URL is correct; the
  // pipeline just cannot fetch it. Calling that "dead" would have the sweep
  // recommend deleting a good address.
  const v = classify({ status: 403 });
  assert.equal(v.verdict, 'blocked');
  assert.match(v.why, /not gone/);
  assert.equal(classify({ status: 401 }).verdict, 'blocked');
  assert.equal(classify({ status: 429 }).verdict, 'blocked');
});

test('5xx is a failing host, not a failing link', () => {
  assert.equal(classify({ status: 500 }).verdict, 'server-error');
  assert.equal(classify({ status: 503 }).verdict, 'server-error');
});

test('a network failure is unreachable and carries the reason', () => {
  const v = classify({ error: 'getaddrinfo ENOTFOUND nowhere.invalid' });
  assert.equal(v.verdict, 'unreachable');
  assert.match(v.why, /ENOTFOUND/);
});

test('an odd status is surfaced rather than silently passed', () => {
  assert.equal(classify({ status: 418 }).verdict, 'unexpected');
});

test('results sort worst-first, cleared editions ahead of references', () => {
  const rows = [
    { id: 9, verdict: 'ok', severity: 'low' },
    { id: 12, verdict: 'dead', severity: 'low' },
    { id: 71, verdict: 'dead', severity: 'high' },
    { id: 243, verdict: 'blocked', severity: 'low' },
  ];
  const sorted = [...rows].sort(compareResults);
  assert.deepEqual(sorted.map((r) => r.id), [71, 12, 243, 9]);
});

test('only dead fails the run by default', () => {
  assert.equal(shouldFail([{ verdict: 'dead' }]), true);
  assert.equal(shouldFail([{ verdict: 'blocked' }]), false);
  assert.equal(shouldFail([{ verdict: 'server-error' }]), false);
  assert.equal(shouldFail([{ verdict: 'ok' }]), false);
  assert.equal(shouldFail([]), false);
});

test('--fail-on=any widens it, --fail-on=never disables it', () => {
  assert.equal(shouldFail([{ verdict: 'blocked' }], { failOn: 'any' }), true);
  assert.equal(shouldFail([{ verdict: 'ok' }], { failOn: 'any' }), false);
  assert.equal(shouldFail([{ verdict: 'dead' }], { failOn: 'never' }), false);
});

test('summarise counts by verdict', () => {
  const counts = summarise([
    { verdict: 'ok' }, { verdict: 'ok' }, { verdict: 'dead' }, { verdict: 'blocked' },
  ]);
  assert.deepEqual(counts, { ok: 2, dead: 1, blocked: 1 });
});

test('the cleared edition field outranks the reference field', () => {
  // If this inverts, the report leads with the least consequential failure.
  const cleared = URL_FIELDS.find((f) => f.name === 'Cleared edition URL');
  const reference = URL_FIELDS.find((f) => f.name === 'Reference URL');
  assert.equal(cleared.severity, 'high');
  assert.equal(reference.severity, 'low');
  assert.ok(URL_FIELDS.indexOf(cleared) < URL_FIELDS.indexOf(reference));
});

/* ---------------------------------------------------------------------------
   The positive control.

   The fixtures are the two real failures this exists to catch, not invented
   input: the Gutenberg body that was pinned as Spurgeon and is Buchanan, and
   the Vercel SSO page that was read as proof a font had been removed. A test
   written against plausible-looking input would pass while the check looked in
   the wrong place, which is the failure mode the whole module guards against.
   --------------------------------------------------------------------------- */

import {
  positiveControl,
  normaliseForMatch,
  significantWords,
  controlPassed,
  CONTROL_ORDER,
} from './url-check.mjs';

const pad = (s) => s + ' '.repeat(0) + ' filler text. '.repeat(40);

test('normalisation folds case, accents and punctuation', () => {
  assert.equal(normaliseForMatch("Æthelred's Preces Privatæ!"), 'aethelred s preces privatae');
  assert.equal(normaliseForMatch(null), '');
});

test('significant words drop articles and prepositions', () => {
  assert.deepEqual(significantWords('The Cloud of Unknowing'), ['cloud', 'unknowing']);
});

test('the real Gutenberg body confirms the work it actually is', () => {
  const body = pad(`The Project Gutenberg eBook of The Christian Year

Title: The Christian Year

Author: John Keble

Editor: Henry Morley`);
  const r = positiveControl({ body, expect: { title: 'The Christian Year', author: 'John Keble' } });
  assert.equal(r.verdict, 'confirmed');
});

test('THE SPURGEON CASE: a 200 body for the wrong book is not confirmed', () => {
  // gutenberg.org/ebooks/27570, pinned as Spurgeon's All of Grace.
  const body = pad(`The Project Gutenberg eBook of Buchanan's Journal of Man, July 1887

Title: Buchanan's Journal of Man, July 1887

Author: Joseph Rodes Buchanan`);
  const r = positiveControl({ body, expect: { title: 'All of Grace', author: 'Charles Spurgeon' } });
  assert.equal(r.verdict, 'unconfirmed');
  assert.match(r.why, /Spurgeon/);
  assert.equal(controlPassed(r.verdict), false);
});

test('THE SSO CASE: an access gate is called out, not merely unconfirmed', () => {
  const body = pad('Authentication Required. Redirecting to vercel.com/sso-api to sign in to continue.');
  const r = positiveControl({ body, expect: { title: 'Colophon', author: 'The Stromata' } });
  assert.equal(r.verdict, 'interstitial');
  assert.match(r.why, /gate/);
});

test('a negative check on an interstitial never reads as success', () => {
  // The precise mistake: grepping an SSO page for a retired font name, finding
  // nothing, and calling the font removed.
  const body = pad('Sign in to continue. This deployment is protected.');
  const r = positiveControl({ body, expect: { title: 'Junicode specimen', author: 'Peter Baker' } });
  assert.notEqual(r.verdict, 'confirmed');
  assert.equal(r.verdict, 'interstitial');
});

test('an empty or near-empty body is no-content, not a mismatch', () => {
  assert.equal(positiveControl({ body: '', expect: { title: 'X', author: 'Y' } }).verdict, 'no-content');
  assert.equal(positiveControl({ body: '<html><body></body></html>', expect: { title: 'X', author: 'Y' } }).verdict, 'no-content');
});

test('author without title is partial — possibly a different work by the same hand', () => {
  const body = pad('A Treatise on the Priesthood, by John Keble, printed at Oxford.');
  const r = positiveControl({ body, expect: { title: 'The Christian Year', author: 'John Keble' } });
  assert.equal(r.verdict, 'partial');
  assert.match(r.why, /different work/);
});

test('title without author is partial and says to check the edition', () => {
  const body = pad('The Christian Year: Thoughts in Verse for the Sundays and Holydays.');
  const r = positiveControl({ body, expect: { title: 'The Christian Year', author: 'John Keble' } });
  assert.equal(r.verdict, 'partial');
  assert.match(r.why, /edition/);
});

test('a majority of title words is enough — subtitles and edition wording vary', () => {
  const body = pad('Centuries of Meditations, by Thomas Traherne, now first printed.');
  const r = positiveControl({ body, expect: { title: 'Centuries of Meditations', author: 'Thomas Traherne' } });
  assert.equal(r.verdict, 'confirmed');
});

test('nothing to check against is unconfirmed, never confirmed', () => {
  const r = positiveControl({ body: pad('Some perfectly real page of text.'), expect: {} });
  assert.equal(r.verdict, 'unconfirmed');
});

test('only text inside the window counts', () => {
  const body = pad('irrelevant preamble') + ' John Keble The Christian Year';
  const near = positiveControl({ body, expect: { title: 'The Christian Year', author: 'John Keble' } });
  const far = positiveControl({ body, expect: { title: 'The Christian Year', author: 'John Keble' }, window: 100 });
  assert.equal(near.verdict, 'confirmed');
  assert.notEqual(far.verdict, 'confirmed');
});

test('controlPassed is strict — only confirmed proceeds unattended', () => {
  for (const v of CONTROL_ORDER) {
    assert.equal(controlPassed(v), v === 'confirmed', `${v} should ${v === 'confirmed' ? '' : 'not '}pass`);
  }
});

test('Old English letters expand rather than vanish — Ælfric is in this corpus', () => {
  assert.equal(normaliseForMatch('Ælfric'), 'aelfric');
  assert.equal(normaliseForMatch('Þorpe and ðe olde ſtyle'), 'thorpe and de olde style');
  assert.equal(normaliseForMatch('Œuvres'), 'oeuvres');
});
