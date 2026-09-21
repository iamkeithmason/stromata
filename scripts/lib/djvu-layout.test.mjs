import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseDjvuXml,
  bodyBlock,
  classifyLines,
  assemblePage,
  lowConfidence,
  stripStrayMarks,
  applyWordFixes,
  markVerseBreaks,
  decodeEntities,
} from './djvu-layout.mjs';

// Every fixture below is a real line from the Archive.org scan of the 1743
// Psychomachia (bim_eighteenth-century_psychomachia-the-war-of_prudentius_1743).
// Invented fixtures would pass a check that the real scan fails, which is the
// failure this suite exists to prevent.

/** Build one <LINE> from [text, x0, x1, y0, y1, conf] tuples. */
const line = (words) =>
  `<LINE>${words
    .map(
      ([t, x0, x1, y0, y1, c]) =>
        `<WORD coords="${x0},${y1},${x1},${y0}" x-confidence="${c ?? 90}">${t}</WORD>`,
    )
    .join('')}</LINE>`;

const page = (lines, width = 4849, height = 7776) =>
  `<OBJECT width="${width}" height="${height}">${lines.join('')}</OBJECT>`;

const doc = (...pages) => `<?xml version="1.0"?><DjVuXML><BODY>${pages.join('')}</BODY></DjVuXML>`;

/** A page of full-measure verse, for the classifier to find a body block in. */
const verseLines = (n, y0 = 1300, step = 235) =>
  Array.from({ length: n }, (_, i) =>
    line([[`Verse line number ${i} running the full measure`, 700, 3450, y0 + i * step, y0 + i * step + 200]]),
  );

test('parseDjvuXml normalises DjVu coords to y0 above y1', () => {
  const pages = parseDjvuXml(doc(page([line([['word', 100, 200, 500, 700]])])));
  assert.equal(pages.length, 1);
  const [l] = pages[0].lines;
  assert.equal(l.y0, 500);
  assert.equal(l.y1, 700);
  assert.equal(l.text, 'word');
});

test('parseDjvuXml sorts lines by position, not document order', () => {
  // Six pages of this scan emit their LINE elements out of reading order.
  const pages = parseDjvuXml(
    doc(
      page([
        line([['second', 700, 1200, 2000, 2100]]),
        line([['first', 700, 1200, 1000, 1100]]),
      ]),
    ),
  );
  assert.deepEqual(pages[0].lines.map((l) => l.text), ['first', 'second']);
});

test('parseDjvuXml decodes entities and keeps the long s', () => {
  assert.equal(decodeEntities('&#383;teel&#39;d'), "ſteel'd");
  const pages = parseDjvuXml(doc(page([line([['&#383;oul', 700, 1200, 100, 200]])])));
  assert.equal(pages[0].lines[0].text, 'ſoul');
});

test('bodyBlock takes the margins from the long lines, per page', () => {
  const pages = parseDjvuXml(doc(page(verseLines(6))));
  const block = bodyBlock(pages[0].lines);
  assert.equal(block.x0, 700);
  assert.equal(block.x1, 3450);
  assert.equal(block.count, 6);
});

test('a page number above the block is a header, a catchword below it a footer', () => {
  const pages = parseDjvuXml(
    doc(
      page([
        line([['[', 2540, 2580, 1185, 1260], ['22', 2600, 2700, 1185, 1260], [']', 2720, 2760, 1185, 1260]]),
        ...verseLines(6),
        line([['Here', 3026, 3300, 6214, 6320]]),
      ]),
    ),
  );
  const roles = classifyLines(pages[0]).map((l) => l.role);
  assert.equal(roles[0], 'header');
  assert.equal(roles[roles.length - 1], 'footer');
  assert.deepEqual(new Set(roles.slice(1, -1)), new Set(['body']));
});

test('a short line set well into the measure is a turnover, and is joined to the line above', () => {
  // "Crear;" on p.20 — the tail of the line above, set flush right.
  const pages = parseDjvuXml(
    doc(
      page([
        ...verseLines(4),
        line([['Crear;', 3221, 3484, 4091, 4196]]),
        ...verseLines(3, 4400),
      ]),
    ),
  );
  const { kept } = assemblePage(classifyLines(pages[0]));
  const joined = kept.find((l) => l.joined.length);
  assert.ok(joined, 'the turnover should have been folded into a line');
  assert.match(joined.text, /Crear;$/);
});

test('a row of specks is noise however many "words" the scanner splits it into', () => {
  // `2 „ — — K 2 8 8` on p.20: eight tokens, one letter, 4x the height of a
  // line of type. Counting words would have made it the fullest line there.
  const specks = [
    ['2', 4380, 4390, 764, 900],
    ['„', 4392, 4396, 950, 1050],
    ['—', 4398, 4401, 1100, 1200],
    ['—', 4400, 4403, 1250, 1350],
    ['K', 4402, 4405, 1400, 1450],
    ['2', 4404, 4406, 1470, 1520],
    ['8', 4406, 4408, 1540, 1580],
    ['8', 4407, 4409, 1590, 1618],
  ];
  const pages = parseDjvuXml(doc(page([line(specks), ...verseLines(8)])));
  assert.equal(classifyLines(pages[0])[0].role, 'noise');
});

test('a fragment joins a line that breaks off, and is dropped after one that does not', () => {
  const broken = line([['Stunn', 772, 3609, 5726, 6041], ["d with the shock, comes tumbling to the", 800, 3609, 5726, 6041]]);
  const frag = line([['|', 851, 900, 6100, 6167], ['c', 950, 1000, 6100, 6167], ['ow', 1050, 1200, 6100, 6167]]);

  const tail = verseLines(2, 6400);
  const wants = assemblePage(classifyLines(parseDjvuXml(doc(page([...verseLines(6), broken, frag, ...tail])))[0]));
  assert.ok(wants.kept.some((l) => l.joined.length), 'should join onto a line ending mid-phrase');

  const complete = line([['A line that ends with a full stop right here.', 700, 3450, 5726, 6041]]);
  const done = assemblePage(classifyLines(parseDjvuXml(doc(page([...verseLines(6), complete, frag, ...tail])))[0]));
  assert.ok(done.kept.every((l) => l.joined.length === 0));
  assert.ok(done.dropped.some((d) => d.role === 'fragment'), 'and report it rather than drop it silently');
});

test('a wider-than-usual gap between lines is reported as type the scan lost', () => {
  // p.20 really is missing two lines; the couplets either side do not rhyme.
  const pages = parseDjvuXml(
    doc(page([...verseLines(4, 1300, 235), ...verseLines(4, 2900, 235)])),
  );
  const { suspectedGaps } = assemblePage(classifyLines(pages[0]));
  assert.equal(suspectedGaps.length, 1);
  assert.ok(suspectedGaps[0].missing >= 1);
});

test('lowConfidence surfaces the scanner\'s own doubt without changing the text', () => {
  const pages = parseDjvuXml(
    doc(page([...verseLines(5), line([['.” The pond rows lance; nor sounds the twanging bow', 488, 3462, 4864, 5000, 38]])])),
  );
  const { kept } = assemblePage(classifyLines(pages[0]));
  const flagged = lowConfidence(kept);
  assert.equal(flagged.length, 1);
  assert.match(flagged[0].text, /twanging bow/);
});

test('stripStrayMarks removes whole tokens only, and says what it removed', () => {
  const { text, removed } = stripStrayMarks('| Ofer floods of wine, and trodden heaps of flow’rs, ©');
  assert.equal(text, 'Ofer floods of wine, and trodden heaps of flow’rs,');
  assert.deepEqual(removed, ['|', '©']);
});

test('stripStrayMarks keeps A, I and O, which are words', () => {
  assert.equal(stripStrayMarks('A O I b c').text, 'A O I');
});

test('stripStrayMarks takes marginal numbers at the edges and leaves them inside', () => {
  assert.equal(
    stripStrayMarks('To brave che fiercest fury of her foes. 275').text,
    'To brave che fiercest fury of her foes.',
  );
  assert.equal(
    stripStrayMarks('With the three 3 of th’ infernal train,').text,
    'With the three 3 of th’ infernal train,',
  );
});

test('applyWordFixes keeps the case it found, because 18th-century nouns are capitalised', () => {
  const fixes = { cafe: 'case', breaft: 'breast' };
  assert.equal(applyWordFixes('Think, in like Cafe, what must be done;', fixes).text,
    'Think, in like Case, what must be done;');
  assert.equal(applyWordFixes('the human breaft,', fixes).text, 'the human breast,');
  assert.equal(applyWordFixes('BREAFT', fixes).text, 'BREAST');
});

test('applyWordFixes matches whole words only', () => {
  assert.equal(applyWordFixes('fides fide', { fide: 'side' }).text, 'fides side');
});

test('applyWordFixes reports which fixes never fired', () => {
  const { applied } = applyWordFixes('nothing here', { cafe: 'case' });
  assert.equal(applied.has('cafe'), false);
});

test('markVerseBreaks marks every line but the stanza-final ones', () => {
  const out = markVerseBreaks(['## Heading', 'first line', 'second line', '', 'after the break']);
  assert.deepEqual(out, ['## Heading', 'first line\\', 'second line', '', 'after the break']);
});

test('markVerseBreaks does not double a backslash it already put there', () => {
  assert.deepEqual(markVerseBreaks(['a\\', 'b\\', 'c']), ['a\\', 'b\\', 'c']);
});

test('applyWordFixes anchors on word boundaries only where there is one', () => {
  // "IRS T," is the drop-capital F missing from FIRST. A trailing \b after the
  // comma matches nothing, and does so silently.
  assert.equal(
    applyWordFixes("IRS T, heav'n-born FaiTH", { 'IRS T,': 'FIRST,' }).text,
    "FIRST, heav'n-born FaiTH",
  );
});

test('markVerseBreaks leaves a prose footnote unbroken', () => {
  // The 1743 prints two prose footnotes inside the verse. They arrive as
  // blockquotes, and a hard break at the compositor's line end would set
  // prose as though it were verse.
  const out = markVerseBreaks([
    'Who spiritually can explain',
    "What ABRAM's *mystick* \\* *Numbers* mean.",
    '> \\* There are various Expositions of this Passage,',
  ]);
  assert.equal(out[0], 'Who spiritually can explain\\');
  // Last verse line before the note: no break, the paragraph ends there.
  assert.equal(out[1], "What ABRAM's *mystick* \\* *Numbers* mean.");
  assert.equal(out[2], '> \\* There are various Expositions of this Passage,');
});
