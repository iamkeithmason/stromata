/**
 * Tests for the source-chrome backstop.
 *
 * The failure this guards against is a *silent* one: a DOM selector that stops
 * matching, a staged file fetched before a fixer landed, a body that reaches
 * Supabase with a nav bar on it and nobody notices until a reader does. So the
 * tests here are mostly about the two ways this module could fail quietly —
 * missing chrome it should catch, and eating prose it should not.
 *
 * The New Advent fixtures are the real thing, copied from the body of
 * `commentary-on-the-gospel-of-john-book-ii` as it was stored in Supabase.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectChrome, stripChrome, assertNoChrome, CHROME_RULES } from './source-chrome.mjs';

// The A–Z bar as turndown actually emits it: the gaps are U+00A0, not spaces,
// because New Advent builds the bar out of &nbsp;. A rule written with a
// literal space silently never fires — that is the point of this fixture.
const AZ_BAR = 'A  B  C  D  E  F  G  H  I  J  K  L  M  N  O  P  Q  R  S  T  U  V  W  X  Y  Z';

const NEW_ADVENT_BODY = [
  AZ_BAR,
  '![New Advent](../images/logo.gif)',
  'Home > Fathers of the Church > Commentary on John (Origen) > Book II',
  '# Commentary on the Gospel of John (Book II)',
  '## 1',
  '_And the Word was with God, and the Word was God._ In the preceding section, my revered brother Ambrosius, we have discussed what the Gospel is.',
  'CONTACT US | ADVERTISE WITH NEW ADVENT',
].join('\n\n');

test('the whole New Advent chrome run is found and removed, prose untouched', () => {
  const { output, removed } = stripChrome(NEW_ADVENT_BODY);
  const ids = removed.map(r => r.rule);
  assert.deepEqual(new Set(ids), new Set([
    'newadvent-az-bar',
    'newadvent-logo',
    'newadvent-breadcrumb',
    'newadvent-footer-nav',
  ]));
  assert.equal(
    output,
    '# Commentary on the Gospel of John (Book II)\n\n## 1\n\n_And the Word was with God, and the Word was God._ In the preceding section, my revered brother Ambrosius, we have discussed what the Gospel is.',
  );
});

test('the A–Z bar is matched through non-breaking spaces, not just U+0020', () => {
  // Both forms occur: &nbsp; from the live page, plain spaces once a body has
  // been round-tripped through something that normalised them.
  for (const gap of ['  ', '  ', ' ']) {
    const bar = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').join(gap);
    assert.equal(detectChrome(bar).length, 1, `not matched with gap ${JSON.stringify(gap)}`);
  }
});

test('a sentence that merely names the source is left alone', () => {
  // Rules act on whole blocks, so prose mentioning New Advent survives. If this
  // ever fails, some rule has started matching substrings mid-paragraph.
  const prose = [
    'The text below follows the New Advent transcription, which is itself the Ante-Nicene Fathers translation.',
    'Kevin Knight has kept that edition online for decades, and readers arriving from a Home page elsewhere will recognise it.',
  ].join('\n\n');
  const { output, removed } = stripChrome(prose);
  assert.deepEqual(removed, []);
  assert.equal(output, prose, 'a clean body must come back byte-for-byte identical');
});

test('the "About this page" citation is stripped — it belongs in source_attribution', () => {
  const body = [
    'To those who may devote their leisure in reading through these pages, be peace.',
    'Translated by Peter Holmes. From Ante-Nicene Fathers, Vol. 3. Edited by Alexander Roberts, James Donaldson, and A. Cleveland Coxe. (Buffalo, NY: Christian Literature Publishing Co., 1885.) Revised and edited for New Advent by Kevin Knight. <http://www.newadvent.org/fathers/0311.htm>.',
  ].join('\n\n');
  const { output, removed } = stripChrome(body);
  assert.deepEqual(removed.map(r => r.rule), ['newadvent-source-block']);
  assert.equal(output, 'To those who may devote their leisure in reading through these pages, be peace.');
});

test('a bare New Advent URL on its own line goes too', () => {
  const body = 'The last paragraph of the treatise.\n\nhttp://www.newadvent.org/fathers/34011.htm';
  const { output, removed } = stripChrome(body);
  assert.deepEqual(removed.map(r => r.rule), ['newadvent-bare-url']);
  assert.equal(output, 'The last paragraph of the treatise.');
});

test('Gutenberg boilerplate truncates head and tail, keeping the book', () => {
  const body = [
    'The Project Gutenberg EBook of Something, by Someone',
    '*** START OF THIS PROJECT GUTENBERG EBOOK SOMETHING ***',
    'Chapter the first, in which the book actually begins.',
    "### Transcriber's note:",
    'Minor typographical errors have been silently normalized.',
    "End of the Project Gutenberg EBook of The Pilgrim's Progress",
    'This eBook is for the use of anyone anywhere at no cost.',
  ].join('\n\n');
  const { output } = stripChrome(body);
  assert.equal(output, 'Chapter the first, in which the book actually begins.');
});

test('stripping is idempotent and a second pass is a no-op', () => {
  const once = stripChrome(NEW_ADVENT_BODY).output;
  const twice = stripChrome(once);
  assert.deepEqual(twice.removed, []);
  assert.equal(twice.output, once);
});

test('assertNoChrome is silent on clean text and throws naming the rule on dirty', () => {
  assert.doesNotThrow(() => assertNoChrome('Plain prose about the Word.'));
  assert.throws(
    () => assertNoChrome(NEW_ADVENT_BODY, { label: 'book-ii.md' }),
    /book-ii\.md[\s\S]*newadvent-az-bar/,
  );
});

test('a leading H1 is advisory, never stripped by default', () => {
  const body = '# Commentary on the Gospel of John (Book II)\n\nThe body proper.';
  const { output, removed, advisories } = stripChrome(body);
  assert.deepEqual(removed, []);
  assert.equal(output, body);
  assert.deepEqual(advisories.map(a => a.rule), ['leading-h1']);

  // ...but opt-in removal works, for the New Advent case where the H1 is the
  // scraped page title and the reader already renders it.
  const dropped = stripChrome(body, { dropLeadingHeading: true });
  assert.deepEqual(dropped.removed.map(r => r.rule), ['leading-h1']);
  assert.equal(dropped.output, 'The body proper.');
});

test('an H1 further down the body is not treated as a duplicate title', () => {
  const body = 'An opening paragraph.\n\n# A heading partway through';
  assert.deepEqual(stripChrome(body).advisories, []);
  assert.equal(stripChrome(body, { dropLeadingHeading: true }).output, body);
});

test('source-relative images are flagged, since they resolve to nothing here', () => {
  const body = '![Evangelist Points to Wicket-Gate.](images/i_020.jpg)\n\nHe answered, "Sir, I read in the book."';
  const { advisories } = stripChrome(body);
  assert.ok(advisories.some(a => a.rule === 'relative-image'));
  // An absolute image is somebody's deliberate choice, not a scrape artefact.
  assert.deepEqual(
    stripChrome('![Plate](https://cdn.example.com/plate.jpg)\n\nBody.').advisories,
    [],
  );
});

test('the source filter narrows the rule set without changing behaviour on a match', () => {
  assert.deepEqual(stripChrome(NEW_ADVENT_BODY, { source: 'gutenberg' }).removed, []);
  assert.equal(stripChrome(NEW_ADVENT_BODY, { source: 'newadvent' }).removed.length, 4);
});

test('every rule names its source site, is structural, or is conditional', () => {
  // This is the invariant that lets the healer scan the whole corpus without
  // knowing where each text came from. A rule matching generic prose would
  // quietly delete real content, so it must stay true.
  for (const rule of CHROME_RULES) {
    const pattern = rule.match.source;
    const namesSite = /New ?Advent|newadvent|PROJECT GUTENBERG|Project Gutenberg|Transcriber/i.test(pattern);
    assert.ok(
      namesSite || rule.structural === true || typeof rule.requires === 'string',
      `rule ${rule.id} is none of site-named, structural or conditional: ${pattern}`,
    );
  }
});

test('conditional rules stay dormant until the source is confirmed', () => {
  // The generic blocks — a lone "Fathers", a heading reading "About this page"
  // — must be inert in a text that carries no proof of being a scrape.
  const innocent = ['Fathers', '## About this page', 'Search: Submit Search'].join('\n\n');
  assert.deepEqual(stripChrome(innocent).removed, []);
  assert.equal(stripChrome(innocent).output, innocent);

  // Add one unconditional New Advent tell and they all become live.
  const scraped = ['![New Advent](../images/logo.gif)', innocent].join('\n\n');
  const { output, removed } = stripChrome(scraped);
  assert.deepEqual(new Set(removed.map(r => r.rule)), new Set([
    'newadvent-logo', 'newadvent-tab-nav', 'newadvent-about-this-page', 'newadvent-search-box',
  ]));
  assert.equal(output, '');
});

test('the editor contact paragraph goes unconditionally — it names the site', () => {
  const body = 'The final paragraph.\n\n**Contact information.** The editor of New Advent is Kevin Knight. My email address is feedback732 _at_ newadvent.org.';
  const { output, removed } = stripChrome(body);
  assert.deepEqual(removed.map(r => r.rule), ['newadvent-contact-info']);
  assert.equal(output, 'The final paragraph.');
});

test('no rule fires on real corpus prose', () => {
  // The other half of the invariant, checked against text rather than patterns.
  // These are genuine paragraphs from texts already in the corpus, chosen
  // because they brush against the rules: they cite translators and editions,
  // they name their source, they start with headings, they are alphabetical.
  const PROSE = [
    'Translated by C.A. Heurtley, whose rendering of the Commonitory has never been bettered, though the Latin repays a second look.',
    'From Ante-Nicene Fathers, Vol. 3, the reader may turn to the Prescription Against Heretics and find the same argument in cruder form.',
    '## Chapter 1. The Object of the Following Treatise.',
    'A. The first head. B. The second. C. The third.',
    'Home is where the heart is, and the Fathers of the Church knew it better than we do.',
    'He wrote to the church at Buffalo, NY: Christian Literature Publishing Co. had asked for a preface.',
    'END OF THE FIRST BOOK.',
    'Books 2 and 3 are wanting.',
    'Contact with the heretics, he says, is the beginning of contagion; advertise your faith rather than your doubts.',
  ];
  for (const block of PROSE) {
    assert.deepEqual(
      detectChrome(block),
      [],
      `a rule matched real prose: ${JSON.stringify(block)}`,
    );
  }
});

test('empty and missing input do not throw', () => {
  assert.equal(stripChrome('').output, '');
  assert.equal(stripChrome(null).output, '');
  assert.deepEqual(detectChrome(undefined), []);
});
