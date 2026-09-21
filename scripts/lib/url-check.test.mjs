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
