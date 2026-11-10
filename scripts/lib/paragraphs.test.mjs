import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FLAG_WORDS,
  MIN_PIECE_WORDS,
  PROVENANCE_LINE,
  anchorAt,
  applyBreaks,
  buildParagraphsDoc,
  countWords,
  draftState,
  paragraphBlocks,
  paragraphStats,
  parseBreaksReply,
  pieceWords,
  resolvePicks,
  sameWords,
  selectParagraphTargets,
  sentenceDigest,
  sentenceEnds,
  sentencesOf,
  tidyBreaks,
  tierFor,
  validatePicks,
  withProvenanceLine,
} from './paragraphs.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// A sentence of exactly `n` words, distinct per `id`, so anchors are unique.
const sentence = (id, n = 20) =>
  ['Then', ...Array.from({ length: n - 2 }, (_, i) => `w${id}x${i}`), `end${id}.`].join(' ');
// A prose paragraph of `count` sentences of `n` words each.
const para = (tag, count, n = 20) => Array.from({ length: count }, (_, i) => sentence(`${tag}${i}`, n)).join(' ');

// ── Detection and tiers ──────────────────────────────────────────────────────

test('countWords matches the SQL measurement: trimmed, split on whitespace', () => {
  assert.equal(countWords('  one two\nthree\tfour  '), 4);
  assert.equal(countWords(''), 0);
});

test('blocks drop heading lines, as the SQL function does, and keep offsets into the body', () => {
  const body = `## Chapter 1. Of Heathen Repentance\n\n${para('a', 2)}\n\n## Chapter 2\n${para('b', 1)}`;
  const blocks = paragraphBlocks(body);
  assert.equal(blocks.length, 2, 'the heading-only block is not a paragraph');
  assert.equal(blocks[0].words, 40);
  assert.equal(blocks[1].words, 20, 'a heading line inside a block is not counted');
  for (const b of blocks) assert.equal(body.slice(b.textStart, b.textStart + b.text.length), b.text);
});

test('only prose can be a wall: verse, lists, blockquotes and footnotes are left alone', () => {
  const longLines = Array.from({ length: 50 }, (_, i) => `Short verse line number ${i} of the poem here`).join('\n');
  const kinds = (body) => paragraphBlocks(body).map((b) => b.kind);
  assert.deepEqual(kinds(longLines), ['verse']);
  assert.deepEqual(kinds(`1. ${para('l', 45)}`), ['list']);
  assert.deepEqual(kinds(`> ${para('q', 45)}`), ['blockquote']);
  assert.deepEqual(kinds(`[^1]: ${para('f', 45)}`), ['footnote']);
  assert.deepEqual(kinds(`${para('p', 2)}\n\n### Notes\n\n${para('n', 45)}`), ['prose', 'footnote']);
  const stats = paragraphStats(`> ${para('q', 45)}\n\n${longLines}`);
  assert.equal(stats.flagged, false, 'a 900-word blockquote is not flagged');
  assert.equal(stats.tier, 3, 'but it still counts toward the tier, as measured');
});

test(`a prose paragraph of ${FLAG_WORDS}+ words is flagged; ${FLAG_WORDS - 1} is not`, () => {
  assert.equal(paragraphStats(para('a', 40)).flagged, true); // 800
  const under = `${para('a', 39)} ${sentence('z', 19)}`; // 799
  assert.equal(countWords(under), 799);
  assert.equal(paragraphStats(under).flagged, false);
});

test('tiers pin the 10 Nov definition, checked against real figures from the database', () => {
  // { max_words, total_words, long_words } from the database on 10 Nov 2026. max and total are as
  // measured; long_words is exact for the first and third, rebuilt from the measured share for the others.
  const real = {
    'a-priest-to-the-temple-the-country-parson': [{ max_words: 1596, total_words: 24150, long_words: 22323 }, 1],
    'against-marcion-book-iv': [{ max_words: 2605, total_words: 60031, long_words: 59731 }, 1],
    'on-repentance-tertullian': [{ max_words: 1240, total_words: 7169, long_words: 6032 }, 2],
    'the-city-of-god-book-viii': [{ max_words: 1080, total_words: 18583, long_words: 16186 }, 2],
  };
  for (const [slug, [row, tier]] of Object.entries(real)) assert.equal(tierFor(row), tier, slug);
  assert.equal(tierFor({ max_words: 1000, total_words: 1000, long_words: 900 }), 1, '90% exactly is Tier 1');
  assert.equal(tierFor({ max_words: 1000, total_words: 1000, long_words: 899 }), 2);
  assert.equal(tierFor({ max_words: 999, total_words: 999, long_words: 999 }), 3);
  assert.equal(tierFor({ max_words: 800, total_words: 800, long_words: 800 }), 3);
  assert.equal(tierFor({ max_words: 799, total_words: 799, long_words: 799 }), 0);
});

test('paragraphStats computes the same three figures as the SQL function', () => {
  const body = `# Title\n\n${para('a', 55)}\n\n${para('b', 10)}\n\n${para('c', 2)}`;
  const s = paragraphStats(body);
  assert.deepEqual([s.max_words, s.total_words, s.long_words], [1100, 1340, 1100]);
  assert.equal(s.tier, 2);
  assert.deepEqual(s.walls, [0]);
  assert.equal(s.longest, 1100);
});

test('the SQL function in the migration uses the same separator, heading pattern and thresholds', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../../supabase/migrations/038_paragraph_breaks.sql'), 'utf8');
  // E'' strings double their backslashes; these are the JS patterns spelled that way.
  assert.ok(sql.includes(String.raw`regexp_split_to_table(t.body, E'\\n[ \\t]*\\n')`), 'separator');
  assert.ok(sql.includes(String.raw`regexp_replace(b.blk, E'(^|\\n)#{1,6}[ \\t][^\\n]*', '', 'g')`), 'heading lines');
  assert.ok(sql.includes(String.raw`regexp_split_to_array(txt, '\s+')`), 'word split');
  assert.ok(sql.includes('words >= 300'), 'long-paragraph threshold');
});

// ── Sentences ────────────────────────────────────────────────────────────────

test('sentence ends skip abbreviations, initials, scripture references and lower-case continuations', () => {
  const text =
    'St. Paul wrote to the Romans. He said, cf. Rom. 5. 12, that sin entered. J. Smith agrees. ' +
    'The end comes at 13\\. Then a new one. etc. and so on.';
  assert.deepEqual(sentencesOf(text), [
    'St. Paul wrote to the Romans.',
    'He said, cf. Rom. 5. 12, that sin entered.',
    'J. Smith agrees.',
    'The end comes at 13\\.',
    'Then a new one. etc. and so on.',
  ]);
});

test('no sentence ends inside a quotation or a bracket, so no break can fall there', () => {
  const text =
    'He wrote: “Be still. Know that I am God.” Then he went on. (See above. Also below.) And so “it was. ' +
    'Still open';
  assert.deepEqual(sentencesOf(text), [
    'He wrote: “Be still. Know that I am God.”',
    'Then he went on.',
    '(See above. Also below.)',
    'And so “it was. Still open',
  ]);
  assert.deepEqual(sentencesOf('He said, "Go. Now." Then left.'), ['He said, "Go. Now."', 'Then left.']);
});

test('sentence ends are offsets just past the closing punctuation', () => {
  const text = 'One two. Three four? Five!';
  assert.deepEqual(sentenceEnds(text), [8, 20]);
});

// ── Picks, anchors, apply ────────────────────────────────────────────────────

const WALL = para('w', 50); // 1,000 words, 50 sentences
const BODY = `## Book I\n\n${para('intro', 3)}\n\n${WALL}\n\n${para('tail', 2)}`;
const wallIndex = () => paragraphStats(BODY).walls[0];

test('validatePicks accepts legal breaks and explains illegal ones', () => {
  const p = wallIndex();
  assert.deepEqual(validatePicks(BODY, [{ paragraph: p, sentence: 9 }, { paragraph: p, sentence: 24 }]), []);
  const errors = validatePicks(BODY, [
    { paragraph: 0, sentence: 0 }, // not a wall
    { paragraph: p, sentence: 49 }, // the last sentence: no break after it
    { paragraph: p, sentence: 9 }, // fine on its own
  ]);
  assert.equal(errors.length, 2, errors.join(' | '));
  const short = validatePicks(BODY, [{ paragraph: p, sentence: 0 }, { paragraph: p, sentence: 1 }]);
  assert.match(short.join(' '), new RegExp(`piece 2 would be 20 words; the minimum is ${MIN_PIECE_WORDS}`));
});

test('a proposal is stored as anchors, never as a body', () => {
  const p = wallIndex();
  const doc = buildParagraphsDoc(BODY, [{ paragraph: p, sentence: 24 }, { paragraph: p, sentence: 9 }]);
  assert.equal(doc.source, 'editorial');
  assert.deepEqual(Object.keys(doc), ['source', 'breaks']);
  assert.equal(doc.breaks.length, 2);
  assert.ok(doc.breaks[0].after.endsWith('endw9.'), 'sorted, ending at the sentence end');
  for (const b of doc.breaks) assert.ok(BODY.includes(b.after) && b.after.split(/\s+/).length >= 6);
  assert.deepEqual(resolvePicks(BODY, doc), {
    picks: [{ paragraph: p, sentence: 9 }, { paragraph: p, sentence: 24 }],
    missing: [],
    applied: false,
  });
});

test('anchors lengthen until unique, and give up on a repeated passage', () => {
  const repeated = 'Alpha beta gamma delta epsilon zeta.';
  const body = `${repeated} One two three four five six. ${repeated} Seven.`;
  assert.equal(anchorAt(body, body.indexOf('six.') + 4), 'one two three four five six.'.replace(/^o/, 'O'));
  assert.equal(anchorAt(`${repeated} ${repeated} X.`, repeated.length), null);
});

test('applying breaks changes only whitespace, adds exactly one blank line per break, and records nothing else', () => {
  const p = wallIndex();
  const doc = buildParagraphsDoc(BODY, [{ paragraph: p, sentence: 9 }, { paragraph: p, sentence: 24 }]);
  const out = applyBreaks(BODY, doc);
  assert.ok(sameWords(BODY, out));
  assert.equal(out.split(/\n[ \t]*\n/).length, BODY.split(/\n[ \t]*\n/).length + 2);
  const after = paragraphStats(out).blocks.map((b) => b.words);
  assert.deepEqual(after, [60, 200, 300, 500, 40]);
  assert.equal(resolvePicks(out, doc).applied, true, 'an applied draft reads as applied');
  assert.throws(() => applyBreaks(out, doc), /no longer match/, 'and cannot be applied twice');
});

test('apply refuses when the body has changed under an anchor', () => {
  const p = wallIndex();
  const doc = buildParagraphsDoc(BODY, [{ paragraph: p, sentence: 9 }]);
  const edited = BODY.replace('endw9.', 'endw9 changed.');
  assert.throws(() => applyBreaks(edited, doc), /no longer match/);
  assert.deepEqual(resolvePicks(edited, doc).missing, [doc.breaks[0].after]);
  assert.throws(() => applyBreaks(BODY, { source: 'editorial', breaks: [] }), /No breaks/);
});

test('apply works on a hard-wrapped block too, replacing the single newline', () => {
  const wrapped = WALL.replace(/endw9\. /, 'endw9.\n');
  const p = paragraphStats(wrapped).walls[0];
  const doc = buildParagraphsDoc(wrapped, [{ paragraph: p, sentence: 9 }]);
  const out = applyBreaks(wrapped, doc);
  assert.ok(out.includes('endw9.\n\nThen'));
  assert.ok(sameWords(wrapped, out));
});

test('sameWords ignores whitespace and nothing else', () => {
  assert.ok(sameWords('a  b\n\nc', 'a b c'));
  assert.ok(!sameWords('a b c', 'a b c.'));
  assert.ok(!sameWords('a b c', 'a c b'));
});

test('the provenance line is appended once', () => {
  assert.equal(withProvenanceLine(null), PROVENANCE_LINE);
  assert.equal(withProvenanceLine('Sourced from New Advent.'), `Sourced from New Advent. ${PROVENANCE_LINE}`);
  const once = withProvenanceLine('X.');
  assert.equal(withProvenanceLine(once), once);
});

test('draftState reads the queue position from the document', () => {
  assert.equal(draftState(null), 'none');
  assert.equal(draftState({ breaks: [] }), 'pending');
  assert.equal(draftState({ breaks: [], held: true }), 'held');
  assert.equal(draftState({ breaks: [], held: true, applied_at: '2026-11-10' }), 'applied');
});

// ── Drafting ─────────────────────────────────────────────────────────────────

test('the model sees numbered sentences with word counts', () => {
  assert.equal(sentenceDigest('One two. Three four five.'), '[1] (2 words) One two.\n[2] (3 words) Three four five.');
});

test('parseBreaksReply tolerates a fence, and refuses prose', () => {
  assert.deepEqual(parseBreaksReply('```json\n[4, 9]\n```'), [3, 8]);
  assert.deepEqual(parseBreaksReply('[]'), []);
  assert.throws(() => parseBreaksReply('No breaks needed.'), /no JSON array/);
});

test('tidyBreaks keeps a reply legal: in range, unique, no piece under the minimum', () => {
  // 50 sentences of 20 words; a break after sentence index 0 leaves a 20-word piece.
  assert.deepEqual(tidyBreaks(WALL, [9, 9, 24, 49, 70, -1]), [9, 24]);
  assert.deepEqual(tidyBreaks(WALL, [0, 9]), [9]);
  assert.deepEqual(tidyBreaks(WALL, [9, 10]), [9], 'the later of two crowded breaks goes');
  assert.deepEqual(pieceWords(WALL, [9, 24]), [200, 300, 500]);
  for (const cuts of [[0], [48], [3, 4, 5]]) {
    assert.ok(pieceWords(WALL, tidyBreaks(WALL, cuts)).every((w) => w >= MIN_PIECE_WORDS));
  }
});

test('selection: unpublished flagged texts always; published ones by tier; drafted ones only with force', () => {
  const rows = [
    { slug: 't1', published: true, has_draft: false, max_words: 1500, total_words: 2000, long_words: 2000 },
    { slug: 't2', published: true, has_draft: false, max_words: 1500, total_words: 9000, long_words: 2000 },
    { slug: 't3', published: true, has_draft: false, max_words: 900, total_words: 900, long_words: 900 },
    { slug: 'new', published: false, has_draft: false, max_words: 850, total_words: 900, long_words: 850 },
    { slug: 'done', published: true, has_draft: true, max_words: 1500, total_words: 1500, long_words: 1500 },
    { slug: 'fine', published: false, has_draft: false, max_words: 400, total_words: 900, long_words: 400 },
  ];
  const slugs = (opts) => selectParagraphTargets(rows, opts).map((r) => r.slug);
  assert.deepEqual(slugs(), ['t1', 'new']);
  assert.deepEqual(slugs({ maxTier: 3 }), ['t1', 't2', 't3', 'new']);
  assert.deepEqual(slugs({ force: true }), ['t1', 'new', 'done']);
  assert.deepEqual(slugs({ slug: 't3' }), ['t3']);
  assert.deepEqual(slugs({ slug: 'fine' }), [], 'a text with no wall is never drafted');
});
