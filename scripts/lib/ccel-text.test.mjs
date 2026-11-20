import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCcel, toMarkdown, titleCase, cleanInline, findBlock } from './ccel-text.mjs';

// Shaped on the real exports (All of Grace, Julian's Revelations, the Exercises).
const SAMPLE = [
  '     __________________________________________________________________',
  '',
  '           Title: Revelations of Divine Love',
  '     __________________________________________________________________',
  '',
  '                                   FIRST WEEK',
  '     __________________________________________________________________',
  '',
  'CHAPTER I',
  '',
  '  "A Revelation of Love--in Sixteen Shewings"',
  '',
  '   THIS is a Revelation of Love that Jesus Christ, our endless bliss, made',
  '   in Sixteen Shewings, or Revelations particular. [1]',
  '',
  '   "Where sin abounded,',
  '   grace did much more abound."',
  '',
  '        I am the Ground of thy beseeching:',
  '        first, it is my will.',
  '     __________________________________________________________________',
  '',
  '   [1] made one, united.',
  '',
  '   [2] precious, honoured.',
  '     __________________________________________________________________',
  '',
  'WHAT ARE WE AT?',
  '',
  '   I HEARD A STORY; I think it came from the North Country- -a minister called.',
].join('\n');

test('footnote apparatus and markers are dropped; paragraphs are unwrapped', () => {
  const md = toMarkdown(parseCcel(SAMPLE));
  assert.doesNotMatch(md, /\[1\]|made one, united/);
  assert.match(md, /made in Sixteen Shewings, or Revelations particular\.\n/);
});

test('chapter heads become ##, with the chapter summary in italics', () => {
  const md = toMarkdown(parseCcel(SAMPLE));
  assert.match(md, /## Chapter I\n\n\*A Revelation of Love—in Sixteen Shewings\*/);
});

test('centred heads are ##, flush-left heads ###, ALL CAPS title-cased', () => {
  const md = toMarkdown(parseCcel(SAMPLE));
  assert.match(md, /^## First Week$/m);
  assert.match(md, /^### What Are We at\?$/m);
  assert.match(toMarkdown(parseCcel(SAMPLE), { flatHeadings: true }), /^## What Are We at\?$/m);
});

test('deeper-indented lines are kept as a quote with their line breaks', () => {
  const md = toMarkdown(parseCcel(SAMPLE));
  assert.match(md, /> I am the Ground of thy beseeching:  \n> first, it is my will\./);
});

test('CCEL double hyphens become dashes', () => {
  assert.equal(cleanInline('North Country- -a minister'), 'North Country—a minister');
  assert.equal(cleanInline('temptation, --for methought'), 'temptation,—for methought');
});

test('titleCase keeps small words low and numerals up, and leaves mixed case alone', () => {
  assert.equal(titleCase('THE CALL OF THE TEMPORAL KING'), 'The Call of the Temporal King');
  assert.equal(titleCase('BOOK II'), 'Book II');
  assert.equal(titleCase('Translated by Grace Warrack'), 'Translated by Grace Warrack');
});

test('findBlock locates a heading for slicing one work out of a combined file', () => {
  const blocks = parseCcel(SAMPLE);
  assert.ok(findBlock(blocks, 'WHAT ARE WE AT?') > findBlock(blocks, 'CHAPTER I'));
  assert.equal(findBlock(blocks, 'NOT THERE'), -1);
});
