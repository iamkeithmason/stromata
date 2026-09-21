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

test('the breadcrumb rule covers every section of the site, not one', () => {
  // The Fathers-only version of this rule let a Summa breadcrumb into the
  // corpus on 2026-09-21. Any `Home > … > …` block is a breadcrumb.
  for (const crumb of [
    'Home > Fathers of the Church > Commentary on John (Origen) > Book II',
    'Home > Summa Theologiae > First Part > Question 2',
    'Home > Catholic Encyclopedia > A > Abbey',
  ]) {
    assert.deepEqual(stripChrome(`${crumb}\n\nThe body.`).removed.map(r => r.rule), ['newadvent-breadcrumb']);
  }
  // ...but it still needs the second `>`, so a sentence cannot match.
  const prose = 'Home is where the heart is > and nowhere else';
  assert.deepEqual(stripChrome(prose).removed, []);
});

// The Summa masthead as it actually reached the corpus, copied from the body
// of summa-theologica-curated-selection-aquinas-01-summa-theologica-curated-selection
// on 2026-09-21 — a hand-imported "curated selection" of 26 questions that
// bypassed fetch-texts.mjs, so it carried this run, undecoded HTML entities
// and all, once per question.
const SUMMA_MASTHEAD = [
  'The Summa Theologi&aelig; of St. Thomas Aquinas',
  'Second and Revised Edition, 1920',
  'Literally translated by Fathers of the English Dominican Province',
  'Online Edition Copyright © 2017 by Kevin Knight',
  'Nihil Obstat. F. Innocentius Apap, O.P., S.T.M., Censor. Theol.',
  'Imprimatur. Edus. Canonicus Surmont, Vicarius Generalis. Westmonasterii.',
  'APPROBATIO ORDINIS',
  'Nihil Obstat. F. Raphael Moss, O.P., S.T.L. and F. Leo Moore, O.P., S.T.L.',
  'Imprimatur. F. Beda Jarrett, O.P., S.T.L., A.M., Prior Provincialis Angli&aelig;',
  'MARI&AElig; IMMACULAT&AElig; - SEDI SAPIENTI&AElig;',
  'SUMMA THEOLOGIAE: Man\'s last end (Prima Secundae Partis, Q. 1)',
  'Home > Summa Theologiae > First Part of the Second Part > Question 1',
  '# Question 1. Man\'s last end',
  'Objection 1. It would seem that it does not belong to a wise man to consider the end.',
].join('\n\n');

test('the whole New Advent Summa masthead is found and removed, prose untouched', () => {
  const { output, removed } = stripChrome(SUMMA_MASTHEAD);
  const ids = removed.map(r => r.rule);
  assert.deepEqual(new Set(ids), new Set([
    'newadvent-summa-masthead-title',
    'newadvent-summa-edition-line',
    'newadvent-summa-translator-line',
    'newadvent-summa-online-copyright',
    'newadvent-nihil-obstat',
    'newadvent-imprimatur',
    'newadvent-summa-approbatio-ordinis',
    'newadvent-summa-dedication',
    'newadvent-summa-page-title',
    'newadvent-breadcrumb',
  ]));
  assert.equal(
    output,
    '# Question 1. Man\'s last end\n\nObjection 1. It would seem that it does not belong to a wise man to consider the end.',
  );
  // Every stray &aelig;/&AElig; entity in the fixture lived inside the
  // stripped masthead — none should survive into the cleaned output.
  assert.doesNotMatch(output, /&[a-zA-Z]+;/);
});

test('the Summa masthead rules stay dormant without the breadcrumb to confirm them', () => {
  // Nihil Obstat / Imprimatur are real front matter on plenty of Catholic
  // works that are not New Advent scrapes, so they must not fire alone.
  const body = 'Nihil Obstat. Some censor.\n\nImprimatur. Some bishop.\n\nThe actual text.';
  assert.deepEqual(stripChrome(body).removed, []);
});

test('a flattened Gutenberg header is caught even without the *** marker', () => {
  // The head rule keys on `*** START OF`; this body had none, and 108 KB of
  // licence text reached Supabase in front of the work.
  const body = [
    "Project Gutenberg eBook of Buchanan's Journal of Man, July 1887 This eBook is for the use of anyone anywhere in the United States and most other parts of the world at no cost.",
    'Chapter the first, in which the book actually begins.',
  ].join('\n\n');
  const { output, removed } = stripChrome(body);
  assert.deepEqual(removed.map(r => r.rule), ['gutenberg-flat-header']);
  assert.equal(output, 'Chapter the first, in which the book actually begins.');
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

// A front-matter list of illustrations, shortened from the Hurlbut "Every
// Child Can Read" Pilgrim's Progress body as stored in Supabase, 2026-09-21.
// The seven captions in the real body are real plate captions for images
// pulled in separately by fetch-gutenberg-plates.mjs; only this print-page
// table of contents for them is chrome.
const GUTENBERG_ILLUSTRATED_BODY = [
  'Jesse Lyman Hurlbut.',
  '* * *',
  '\\[9\\]',
  '## LIST OF ILLUSTRATIONS.',
  'Christian Confides in His Wife',
  '_Frontispiece_',
  'PAGE',
  'Evangelist Points to Wicket-Gate',
  '15',
  '* * *',
  '\\[11\\]',
  '## THE PILGRIM\'S PROGRESS',
  '* * *',
  '## CHAPTER I.',
  'As I walked through the wilderness of this world, I lighted on a certain place where was a den,\\[1\\] and laid me down in that place to sleep.',
  '### FOOTNOTES:',
  '\\[1\\] Bedford jail, in which Bunyan was twelve years a prisoner.',
].join('\n\n');

test('the Gutenberg list-of-illustrations span is removed up to the next heading', () => {
  const { output, removed } = stripChrome(GUTENBERG_ILLUSTRATED_BODY, { source: 'gutenberg' });
  assert.deepEqual(removed.map(r => r.rule), ['gutenberg-list-of-illustrations', 'gutenberg-page-number']);
  // The editor's own signature (real preface content) and the "* * *" scene
  // divider that opens Chapter I survive; only the illustrations table and
  // the two isolated page numbers around it are gone.
  assert.match(output, /Jesse Lyman Hurlbut\./);
  assert.match(output, /^## THE PILGRIM'S PROGRESS/m);
  assert.doesNotMatch(output, /LIST OF ILLUSTRATIONS/);
  assert.doesNotMatch(output, /Wicket-Gate/);
  assert.doesNotMatch(output, /\\\[9\\\]|\\\[11\\\]/);
  // The footnote marker fused to "den," and its definition are real content
  // and must survive untouched.
  assert.match(output, /den,\\\[1\\\]/);
  assert.match(output, /\\\[1\\\] Bedford jail/);
});

test('a fused bracket number is advisory, never auto-stripped — it may be a real footnote', () => {
  const body = 'Many a young person has \\[6\\]stumbled through the dull parts.';
  const { output, removed, advisories } = stripChrome(body, { source: 'gutenberg' });
  assert.deepEqual(removed, []);
  assert.equal(output, body);
  assert.deepEqual(advisories.map(a => a.rule), ['inline-bracket-number']);
});

test('a fused bracket number outside the document\'s own FOOTNOTES range is auto-stripped', () => {
  // The real ambiguity-breaker found in the Bunyan corpus text, 2026-09-21:
  // the book's single FOOTNOTES apparatus only defines 1–11, so a fused
  // "\[17\]" elsewhere cannot be a footnote reference under any reading —
  // nothing defines it — and is safe to remove outright, unlike the [6] case
  // above, which sits inside the defined range and stays ambiguous.
  const body = [
    'As I walked through the wilderness of this world, I lighted on a certain place where was a den,\\[1\\] and laid me down to sleep.',
    'because that all which you forsake is not\\[17\\] worth to be compared with',
    '### FOOTNOTES:',
    '\\[1\\] Bedford jail, in which Bunyan was twelve years a prisoner.',
  ].join('\n\n');
  const { output, removed, advisories } = stripChrome(body, { source: 'gutenberg' });
  assert.deepEqual(removed.map(r => r.rule), ['gutenberg-out-of-range-fused-number']);
  assert.match(output, /not worth to be compared with/);
  assert.doesNotMatch(output, /\\\[17\\\]/);
  // [1] is within the defined range (1–11), so it is genuinely ambiguous and
  // stays exactly as ambiguous as before — advisory only, never auto-decided.
  assert.match(output, /den,\\\[1\\\]/);
  assert.deepEqual(advisories.map(a => a.rule), ['inline-bracket-number']);
  // The footnote apparatus itself is never touched, even though it is full
  // of bracket-numbers in the defined range.
  assert.match(output, /\\\[1\\\] Bedford jail/);
});

test('with no FOOTNOTES apparatus at all, every fused number stays advisory', () => {
  // No basis for telling a marker from a page number without a defined
  // range to check against, so nothing here is auto-stripped.
  const body = 'because that all which you forsake is not\\[17\\] worth to be compared with';
  const { output, removed, advisories } = stripChrome(body, { source: 'gutenberg' });
  assert.deepEqual(removed, []);
  assert.equal(output, body);
  assert.deepEqual(advisories.map(a => a.rule), ['inline-bracket-number']);
});

test('an isolated bracket number is stripped, but a footnote definition list is not', () => {
  const body = 'Text before.\n\n\\[13\\]\n\n## CHAPTER I.\n\n### FOOTNOTES:\n\n\\[1\\] Bedford jail.';
  const { output, removed } = stripChrome(body, { source: 'gutenberg' });
  assert.deepEqual(removed.map(r => r.rule), ['gutenberg-page-number']);
  assert.match(output, /Text before\./);
  assert.match(output, /## CHAPTER I\./);
  assert.match(output, /\\\[1\\\] Bedford jail\./);
});

// Chrome fragments copied verbatim from projectwittenberg.org (the 95 Theses
// and Small Catechism pages, fetched 2026-09-21); the body lines are trimmed
// for brevity. wittenberg-published-in-label is deliberately unconditional
// (not `requires: 'wittenberg'`) — see its comment in source-chrome.mjs — so
// it must also work with no other wittenberg tell in the document.
const WITTENBERG_BODY = [
  '## PROJECT WITTENBERG  \n__________',
  '#### Disputation of Doctor Martin Luther on the Power and Efficacy of Indulgences',
  '[Martin Luther](http://www.iclnet.org/pub/resources/text/wittenberg/wittenberg-luther.html) - [Project Wittenberg](http://www.iclnet.org/pub/resources/text/wittenberg/wittenberg-home.html)',
  '**Published in:**',
  '_Works of Martin Luther: Adolph Spaeth, L.D. Reed, Henry Eyster Jacobs, et Al., Trans. & Eds. (Philadelphia: A. J. Holman Company, 1915), Vol.1, pp. 29-38_',
  '1. Our Lord and Master Jesus Christ, when He said Poenitentiam agite, willed that the whole life of believers should be repentance.',
  '![pwimage](w4.gif)',
  'This text was converted to ASCII text for Project Wittenberg by Allen Mulvey, and is in the public domain. You may freely distribute, copy or print this text.',
  'Rev. Robert E. Smith  \nWalther Library  \nConcordia Theological Seminary.',
  'E-mail: smithre@mail.ctsfw.edu  \nSurface Mail: 6600 N. Clinton St., Ft. Wayne, IN 46825 USA  \nPhone: (260) 452-3149 - Fax: (260) 452-2126',
  'To: [Martin Luther](http://www.iclnet.org/pub/resources/text/wittenberg/wittenberg-luther.html) - [Project Wittenberg](http://www.iclnet.org/pub/resources/text/wittenberg/wittenberg-home.html)',
].join('\n\n');

test('the whole Project Wittenberg chrome run is found and removed, prose untouched', () => {
  const { output, removed } = stripChrome(WITTENBERG_BODY, { source: 'wittenberg' });
  const ids = removed.map(r => r.rule);
  assert.deepEqual(new Set(ids), new Set([
    'wittenberg-masthead',
    'wittenberg-nav-trail',
    'wittenberg-published-in-label',
    'wittenberg-icon',
    'wittenberg-translator-credit',
    'wittenberg-contact-block',
    'wittenberg-contact-info',
  ]));
  // The heading, the citation paragraph, and the actual thesis survive —
  // stripping removes furniture, not the front matter the citation carries.
  assert.match(output, /Disputation of Doctor Martin Luther/);
  assert.match(output, /Works of Martin Luther:/);
  assert.match(output, /Poenitentiam agite/);
  assert.doesNotMatch(output, /PROJECT WITTENBERG/);
  assert.doesNotMatch(output, /Walther Library/);
});

// Copied verbatim from the small-catechism-luther bodies as imported into
// Supabase (2026-09-21) — the repeated per-chapter masthead and the orphaned
// page dividers left behind once the paragraphs they bracketed were already
// stripped. Confirms the healing rules match real pipeline output, not an
// assumed shape. Chapter II (The Creed) has no jump-anchor list at all — only
// chapter I (Ten Commandments) generates one, covered separately below.
const CATECHISM_CHAPTER_HEAD = [
  "### Luther's Little Instruction Book  \n(The Small Catechism of Martin Luther)",
  '### _Translated by Robert E. Smith  \nMay 22, 1994_',
  '_(Version 1.1 -- December 22, 1994)  \nPW# 001-003-002Ea_',
  '* * *',
  '* * *',
  '**II.  \nTHE CREED**',
  'We must fear, love, and trust God more than anything else.',
  '* * *',
  '* * *',
  '* * *',
].join('\n\n');

test('the repeated masthead and the orphaned page dividers are all stripped', () => {
  const { output, removed } = stripChrome(CATECHISM_CHAPTER_HEAD, { source: 'wittenberg' });
  const ids = removed.map(r => r.rule);
  assert.deepEqual(new Set(ids), new Set([
    'wittenberg-work-title-header',
    'wittenberg-translator-credit-heading',
    'wittenberg-edition-code',
    'wittenberg-orphaned-divider',
  ]));
  assert.equal(removed.filter(r => r.rule === 'wittenberg-orphaned-divider').length, 5);
  assert.equal(output, '**II.  \nTHE CREED**\n\nWe must fear, love, and trust God more than anything else.');
});

// The 95 Theses page uses a different jump-anchor step (by tens) and a
// different divider count, confirming the rules aren't overfit to one
// work's exact numbers — and the anchor list there sits in its OWN block,
// blank-line separated from the heading above it.
const THESES_DIVIDERS_AND_ANCHORS = [
  '![pwimage](w4.gif)',
  '\\[10\\] \\[20\\] \\[30\\] \\[40\\] \\[50\\] \\[60\\] \\[70\\] \\[80\\] \\[90\\]',
  'Out of love for the truth and the desire to bring it to light, the following propositions will be discussed at Wittenberg.',
  '* * *',
].join('\n\n');

test('the jump-anchor and divider rules generalise beyond the catechism\'s own numbers', () => {
  const { output, removed } = stripChrome(THESES_DIVIDERS_AND_ANCHORS, { source: 'wittenberg' });
  assert.deepEqual(new Set(removed.map(r => r.rule)), new Set([
    'wittenberg-icon',
    'wittenberg-jump-anchors',
    'wittenberg-orphaned-divider',
  ]));
  assert.equal(output, 'Out of love for the truth and the desire to bring it to light, the following propositions will be discussed at Wittenberg.');
});

test('a jump-anchor list glued onto the same block as a real heading is left alone', () => {
  // The one case the markdown-level rule cannot safely handle: on the Ten
  // Commandments chapter specifically, the source's <font size="-1"> anchor
  // wrapper sits right after the title with no blank line, so turndown emits
  // title and anchors as ONE block. This module only drops whole blocks, and
  // dropping this one would lose the real chapter title with it — so it is
  // correctly left alone here. fetch-texts.mjs's DOM pass removes the
  // <font size="-1"> wrapper before turndown ever runs, which is the actual
  // fix for any future fetch; the one already-imported occurrence needed a
  // one-off hand correction instead (see the run-log).
  const glued = '**I.  \nTHE TEN COMMANDMENTS**  \n\\[1\\] \\[2\\] \\[3\\] \\[4\\] \\[5\\] \\[6\\] \\[7\\] \\[8\\] \\[9\\] \\[10\\]';
  const doc = ['![pwimage](w4.gif)', glued].join('\n\n');
  const { removed } = stripChrome(doc);
  assert.deepEqual(removed.map(r => r.rule), ['wittenberg-icon']);
});

test('a decorative underscore-rule divider is stripped once Wittenberg is confirmed, but real emphasis is not', () => {
  const decorative = ['![pwimage](w4.gif)', 'A heading above it.', '\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_', 'Body below it.'].join('\n\n');
  const { removed } = stripChrome(decorative, { source: 'wittenberg' });
  assert.deepEqual(new Set(removed.map(r => r.rule)), new Set(['wittenberg-icon', 'wittenberg-underscore-rule']));

  // A single italicised word or short phrase is never six-plus underscores.
  const prose = ['![pwimage](w4.gif)', 'Real emphasis.', '_grace_ alone, _faith_ alone.'].join('\n\n');
  assert.deepEqual(stripChrome(prose, { source: 'wittenberg' }).removed.map(r => r.rule), ['wittenberg-icon']);
});

test('an underscore divider is left alone in a document with no confirmed Wittenberg tell', () => {
  // The regression this guards: a bare underscore-run is not unique to
  // Wittenberg's chrome. mystagogical-catecheses/catechetical-lecture-18.md
  // (a New Advent import) uses the exact same shape as a genuine topic-break
  // divider inside Cyril's own lecture text — caught by this exact scenario
  // during a dry run before wittenberg-underscore-rule shipped, when it was
  // briefly `structural: true` instead of `requires: 'wittenberg'`.
  const cyril = [
    'And now, brethren beloved, the word of instruction exhorts you all.',
    '\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_',
    'The Faith which we rehearse contains in order the following.',
  ].join('\n\n');
  assert.deepEqual(stripChrome(cyril).removed, []);
  assert.equal(stripChrome(cyril).output, cyril);
});

test('wittenberg-published-in-label fires with no other wittenberg tell present', () => {
  // The load-bearing case: this label is the one tell the DOM pass in
  // fetch-texts.mjs cannot isolate (see its comment), so on a normal fetch it
  // is the only wittenberg chrome left in the markdown — nothing else survives
  // to confirm the source, and it must still be caught.
  const body = ['**Published in:**', 'The actual citation text.', 'The body proper.'].join('\n\n');
  const { output, removed } = stripChrome(body);
  assert.deepEqual(removed.map(r => r.rule), ['wittenberg-published-in-label']);
  assert.equal(output, 'The actual citation text.\n\nThe body proper.');
});

test('the nav trail rule requires a confirmed Wittenberg document, and needs the site name', () => {
  // Without any unconditional wittenberg tell elsewhere, a short dash-joined
  // line is left alone — this is the shape a real sentence with an em dash
  // could take, so it must not fire on its own.
  const untagged = 'Grace and peace - and nothing else - be with you always.';
  assert.deepEqual(stripChrome(untagged).removed, []);

  // Even inside a confirmed Wittenberg document, a dash-joined block that
  // doesn't name the project is content, not a nav trail.
  const confirmed = [
    '![pwimage](w4.gif)',
    'Grace and peace - and nothing else - be with you always.',
  ].join('\n\n');
  const { removed } = stripChrome(confirmed);
  assert.deepEqual(removed.map(r => r.rule), ['wittenberg-icon']);
});

test('the in-page jump-anchor list is stripped, matching the real (parens-free) shape turndown emits', () => {
  // stripAllLinks (fetch-texts.mjs) removes every <a> project-wide, so no
  // href ever survives into these — an assumption a previous version of this
  // rule got wrong (it expected `[1](url)` and never matched real output,
  // which is how the list survived into two imported texts unnoticed). Both
  // real shapes: single digits (the catechism) and by-tens (the 95 Theses).
  const singleDigits = '\\[1\\] \\[2\\] \\[3\\] \\[4\\] \\[5\\]';
  const byTens = '\\[10\\] \\[20\\] \\[30\\]';
  for (const body of [singleDigits, byTens]) {
    const doc = ['![pwimage](w4.gif)', body].join('\n\n');
    const { output, removed } = stripChrome(doc);
    assert.ok(removed.some(r => r.rule === 'wittenberg-jump-anchors'), `not matched: ${body}`);
    assert.equal(output, '');
  }
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

test('a title-matched drop keeps a chapter heading that merely leads the body', () => {
  // The case that makes `true` unsafe and a string safe. New Advent serves each
  // book of Clement's Stromata as one page titled "The Stromata (Book II)"
  // whose first heading is a real chapter heading. Deleting it loses content.
  const stromata = '# Chapter 1. Introductory.\n\nMy Miscellanies will contain the truth.';
  assert.equal(stripChrome(stromata, { dropLeadingHeading: 'The Stromata (Book II)' }).output, stromata);
  assert.deepEqual(stripChrome(stromata, { dropLeadingHeading: 'The Stromata (Book II)' }).removed, []);

  // Where the heading IS the title — the multi-chapter fetch, where the title
  // was read from this very h1 — it goes.
  const john = '# Commentary on the Gospel of John (Book II)\n\nAnd the Word was with God.';
  const { output, removed } = stripChrome(john, {
    dropLeadingHeading: 'Commentary on the Gospel of John (Book II)',
  });
  assert.deepEqual(removed.map(r => r.rule), ['leading-h1']);
  assert.equal(output, 'And the Word was with God.');
});

test('heading/title matching survives emphasis and trailing punctuation, nothing more', () => {
  const body = '# _The Divine Institutes_ (Book I).\n\nBody.';
  assert.equal(stripChrome(body, { dropLeadingHeading: 'The Divine Institutes (Book I)' }).output, 'Body.');
  // A heading that only resembles the title is content.
  assert.equal(
    stripChrome(body, { dropLeadingHeading: 'The Divine Institutes' }).output,
    body,
  );
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
    const namesSite = /New ?Advent|newadvent|PROJECT GUTENBERG|Project Gutenberg|Transcriber|Wittenberg|Walther Library|Concordia Theological Seminary|Surface Mail|pwimage/i.test(pattern);
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
    'He later taught at Concordia Theological Seminary, where the Walther Library still holds his papers.',
    'Robert E. Smith’s translation work for Project Wittenberg began years before this letter was written.',
    'The letter was published in a Leipzig journal the following spring.',
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
