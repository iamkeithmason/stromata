import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractHeadings } from '../../lib/headings.ts';
import {
  HAS_CONTENTS_PATTERN,
  LONG_TEXT_WORDS,
  anchorFor,
  blockKey,
  bodyBlocks,
  buildSectionsDoc,
  countHeadings,
  needsSections,
  parseDraftReply,
  promptDigest,
  resolveAnchor,
  resolvePicks,
  sameSections,
  selectSectionTargets,
  validatePicks,
} from './sections.mjs';

// Shaped like the real Vainglory body: numbered paragraphs, blank lines between,
// an unnumbered closing line.
const VAINGLORY = [
  '1. Has any man done what I asked? Has he prayed to God on our behalf?',
  '2. Vainglory is like the fruit of Sodom, fair to look on.',
  '15. Yet I hear of many who are admired for this.',
  '16. The man-child has lately been born. His father thinks of every means.',
  '17. Many may laugh at what I am saying on the ground that these things are trifles.',
  '23. Regard thyself as a king ruling over a city which is the soul of thy son.',
  'Amen.',
].join('\n\n');

// ── The definition ──────────────────────────────────────────────────────────

test('heading count agrees with the reader page (extractHeadings) on every fixture', () => {
  const bodies = [
    VAINGLORY,
    '# Letter of Dedication\n\nText.\n\n## Part One\n\nMore.\n\n### A note\n',
    '## **Bold heading**\n\n## [Linked](http://x)\n\n#### too deep\n\n#nospace\n',
    '## **\n\n## real\n',
    'No headings at all, just prose.\n\nAnd more prose.',
  ];
  for (const body of bodies) {
    assert.equal(countHeadings(body), extractHeadings(body).length, body.slice(0, 40));
  }
});

test('a long text needs sections only when the reader shows it no contents', () => {
  assert.equal(needsSections({ word_count: LONG_TEXT_WORDS, body: VAINGLORY }), true);
  assert.equal(needsSections({ word_count: LONG_TEXT_WORDS - 1, body: VAINGLORY }), false);
  // Two headings: still no contents list (the reader needs three), so still needs sections.
  assert.equal(needsSections({ word_count: 20000, body: '# A\n\nx\n\n# B\n\ny' }), true);
  assert.equal(needsSections({ word_count: 20000, body: '# A\n\n## B\n\n### C\n\nz' }), false);
  assert.equal(needsSections({ word_count: null, body: VAINGLORY }), false);
});

test('targets are texts that need sections and have no draft, unless forced', () => {
  const rows = [
    { slug: 'needs', word_count: 20000, body: VAINGLORY, sections_draft: null },
    { slug: 'drafted', word_count: 20000, body: VAINGLORY, sections_draft: { source: 'editorial', sections: [] } },
    { slug: 'short', word_count: 500, body: VAINGLORY, sections_draft: null },
    { slug: 'headed', word_count: 20000, body: '# A\n\n## B\n\n### C', sections_draft: null },
  ];
  assert.deepEqual(selectSectionTargets(rows).map((r) => r.slug), ['needs']);
  assert.deepEqual(selectSectionTargets(rows, { force: true }).map((r) => r.slug), ['needs', 'drafted']);
});

test('the server prefilter matches exactly the bodies that have contents', () => {
  const re = new RegExp(HAS_CONTENTS_PATTERN);
  assert.equal(re.test('# A\n\nx\n\n## B\n\ny\n\n### C\n'), true);
  assert.equal(re.test('# A\n\nx\n\n## B\n'), false);
  assert.equal(re.test(VAINGLORY), false);
});

// ── Paragraphs and anchors ──────────────────────────────────────────────────

test('blocks split on blank lines; the key drops list numbers and markup', () => {
  const blocks = bodyBlocks(VAINGLORY);
  assert.equal(blocks.length, 7);
  assert.equal(blockKey(blocks[3]), 'The man-child has lately been born. His father thinks of every means.');
  assert.equal(blockKey('*Wherefore* putting away all **guile**'), 'Wherefore putting away all guile');
});

test('an anchor finds its own paragraph and no other, even when openings repeat', () => {
  const blocks = ['Let us now speak of the eyes and what they see.', 'Let us now speak of the ears and what they hear.', 'Amen.'];
  const a = anchorFor(blocks, 1);
  assert.equal(a, 'Let us now speak of the ears');
  assert.equal(resolveAnchor(blocks, a), 1);
  assert.equal(resolveAnchor(blocks, 'Let us now speak'), -1, 'ambiguous anchors resolve to nothing');
  assert.equal(resolveAnchor(blocks, 'Not in this text'), -1);
});

test('picks round-trip through the stored document', () => {
  const blocks = bodyBlocks(VAINGLORY);
  const picks = [
    { label: 'Vainglory', paragraph: 0 },
    { label: 'The newborn child', paragraph: 3 },
    { label: 'The soul as a city', paragraph: 5 },
  ];
  const doc = buildSectionsDoc(blocks, picks);
  assert.equal(doc.source, 'editorial');
  assert.deepEqual(doc.sections[1], { label: 'The newborn child', starts_with: 'The man-child has lately been born.' });
  assert.deepEqual(resolvePicks(blocks, doc), { picks, missing: [] });
});

test('an anchor the body no longer contains is reported, not guessed', () => {
  const blocks = bodyBlocks(VAINGLORY);
  const doc = { source: 'editorial', sections: [{ label: 'Gone', starts_with: 'This sentence was edited away' }] };
  assert.deepEqual(resolvePicks(blocks, doc), { picks: [], missing: ['Gone'] });
});

test('sameSections tells an approved draft from an edited one', () => {
  const doc = { source: 'editorial', sections: [{ label: 'A', starts_with: 'x' }, { label: 'B', starts_with: 'y' }] };
  assert.equal(sameSections(doc, structuredClone(doc)), true);
  assert.equal(sameSections(doc, { ...doc, sections: [doc.sections[0], { label: 'B2', starts_with: 'y' }] }), false);
  assert.equal(sameSections(doc, null), false);
});

// ── Validation ──────────────────────────────────────────────────────────────

test('valid picks pass; each kind of mistake is named', () => {
  assert.deepEqual(validatePicks([{ label: 'A', paragraph: 0 }, { label: 'B', paragraph: 3 }], 7), []);
  assert.match(validatePicks([{ label: 'A', paragraph: 0 }], 7).join(), /at least 2/);
  assert.match(validatePicks([{ label: '', paragraph: 0 }, { label: 'B', paragraph: 1 }], 7).join(), /no title/);
  assert.match(validatePicks([{ label: 'A', paragraph: 3 }, { label: 'B', paragraph: 3 }], 7).join(), /must start after/);
  assert.match(validatePicks([{ label: 'A', paragraph: 0 }, { label: 'B', paragraph: 9 }], 7).join(), /does not exist/);
  assert.match(validatePicks([{ label: 'x'.repeat(61), paragraph: 0 }, { label: 'B', paragraph: 1 }], 7).join(), /limit is 60/);
});

// ── Drafting ────────────────────────────────────────────────────────────────

test('the digest numbers paragraphs from 1 and cuts long ones', () => {
  const digest = promptDigest(bodyBlocks(VAINGLORY), 4).split('\n');
  assert.equal(digest[0], '[1] Has any man done …');
  assert.equal(digest[6], '[7] Amen.');
});

test('a model reply becomes 0-based picks; a fence or a stray sentence is tolerated', () => {
  const reply = 'Here you are:\n```json\n[{"label":"Vainglory","paragraph":1},{"label":"The newborn child","paragraph":4}]\n```';
  assert.deepEqual(parseDraftReply(reply), [
    { label: 'Vainglory', paragraph: 0 },
    { label: 'The newborn child', paragraph: 3 },
  ]);
  assert.throws(() => parseDraftReply('I could not do that.'), /no JSON array/);
});
