/**
 * Tests for the pure raw-assembly helper — a single pinned part is stored
 * untouched; multiple parts are concatenated IN ORDER with a provenance marker
 * per part — and for the Archive.org djvu-HTML-wrapper detector/unwrapper. No
 * network.
 *
 * Run: npx tsx --test scripts/sourcer/fetch.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { assembleRawParts, extractDjvuPreText, looksLikeDjvuHtmlWrapper } from './fetch';

test('a single part is stored completely untouched (no markers)', () => {
  const raw = assembleRawParts([{ url: 'https://archive.org/x_djvu.txt', text: 'BOOK I.\n\nplain text' }]);
  assert.equal(raw, 'BOOK I.\n\nplain text');
});

test('multiple parts are concatenated in order with per-part markers', () => {
  const raw = assembleRawParts([
    { url: 'https://newadvent.org/1', text: 'first' },
    { url: 'https://newadvent.org/2', text: 'second' },
    { url: 'https://newadvent.org/3', text: 'third' },
  ]);
  assert.match(raw, /SOURCER PART 1\/3 · https:\/\/newadvent\.org\/1/);
  assert.match(raw, /SOURCER PART 3\/3 · https:\/\/newadvent\.org\/3/);
  // Order preserved: part 1 body before part 2 body before part 3 body.
  assert.ok(raw.indexOf('first') < raw.indexOf('second'));
  assert.ok(raw.indexOf('second') < raw.indexOf('third'));
});

// A trimmed-down but structurally real excerpt of Archive.org's `_djvu.txt`
// text-reader page — captured from an actual fetch of
// https://archive.org/stream/hymnsofeasternch00neal_0/hymnsofeasternch00neal_0_djvu.txt
// on 2026-09-01, which returned this HTML wrapper instead of raw text. The nav
// chrome before <pre> mirrors what actually leaked into a staged body.md.
const ARCHIVE_ORG_DJVU_HTML_WRAPPER = `<!DOCTYPE html>
<html lang="en">
  <head>
    <title>Full text of &quot;Hymns of the Eastern Church&quot;</title>
  </head>
  <body>
    <div class="wayback">Skip to main content</div>
    <div class="nav">
      <a href="/web">Web</a> <a href="/details/texts">Texts</a> <a href="/details/audio">Audio</a>
    </div>
    <h1>Full text of "Hymns of the Eastern Church"</h1>
      <pre>OF  THE

UNIVERSITY
Of  ILLINOIS

S.  John  Damascene— (circ.  a.d.  780)  ...  31

&quot;A troparion&quot; is dedicated &amp; ended thus.
</pre>        </div><!--/.container-->
  </body>
</html>`;

test('looksLikeDjvuHtmlWrapper detects the HTML page, not real djvu.txt', () => {
  assert.ok(looksLikeDjvuHtmlWrapper(ARCHIVE_ORG_DJVU_HTML_WRAPPER));
  assert.ok(!looksLikeDjvuHtmlWrapper('OF THE\n\nUNIVERSITY\nOf ILLINOIS\n\nplain djvu.txt text'));
  assert.ok(!looksLikeDjvuHtmlWrapper(''));
});

test('extractDjvuPreText recovers exactly the <pre> content, decoded, dropping all page chrome', () => {
  const text = extractDjvuPreText(ARCHIVE_ORG_DJVU_HTML_WRAPPER);
  assert.ok(text !== null);
  assert.match(text!, /^OF  THE/);
  assert.match(text!, /S\.  John  Damascene/);
  // Entities decoded.
  assert.match(text!, /"A troparion" is dedicated & ended thus\./);
  // None of the page chrome survived.
  assert.doesNotMatch(text!, /Skip to main content/);
  assert.doesNotMatch(text!, /<h1>|<div|<html|<body/);
});

test('extractDjvuPreText returns null when there is no <pre> block to recover', () => {
  assert.equal(extractDjvuPreText('<!DOCTYPE html><html><body>no pre here</body></html>'), null);
});
