/**
 * Tests for dewittenberg-blockquote.mjs.
 *
 * Fixtures are real fragments copied from the small-catechism-luther and
 * disputation-of-doctor-martin-luther-on-the-power-and-efficacy-of-indulgences
 * bodies as stored in Supabase (2026-09-21), after chrome stripping but
 * before this pass.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dewittenbergBlockquote } from './dewittenberg-blockquote.mjs';

test('double-nested blockquote markers are stripped from every line', () => {
  const body = [
    '> > **The Creed: The Simple Way a Father Should Present it to His Household**',
    '> > ',
    '> > **I. The First Article: On Creation**',
    '> > ',
    '> > **I believe in God the Almighty Father, Creator of Heaven and Earth.**',
  ].join('\n');
  const out = dewittenbergBlockquote(body);
  assert.equal(
    out,
    [
      '**The Creed: The Simple Way a Father Should Present it to His Household**',
      '',
      '**I. The First Article: On Creation**',
      '',
      '**I believe in God the Almighty Father, Creator of Heaven and Earth.**',
    ].join('\n'),
  );
});

test('single-nested blockquote markers are stripped too', () => {
  const body = [
    '> Out of love for the truth and the desire to bring it to light, the following propositions will be discussed at Wittenberg.',
    '> ',
    '> 1. Our Lord and Master Jesus Christ, when He said Poenitentiam agite, willed that the whole life of believers should be repentance.',
  ].join('\n');
  assert.equal(
    dewittenbergBlockquote(body),
    [
      'Out of love for the truth and the desire to bring it to light, the following propositions will be discussed at Wittenberg.',
      '',
      '1. Our Lord and Master Jesus Christ, when He said Poenitentiam agite, willed that the whole life of believers should be repentance.',
    ].join('\n'),
  );
});

test('an underscore-rule divider glued to a real title is removed, and the title survives', () => {
  const body = "**II.  \nTHE CREED  \n\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_**\n\n> > **The Creed: The Simple Way a Father Should Present it to His Household**";
  const out = dewittenbergBlockquote(body);
  assert.equal(out, '**II.  \nTHE CREED  **\n\n**The Creed: The Simple Way a Father Should Present it to His Household**');
  assert.doesNotMatch(out, /\\_/);
});

test('an underscore-rule divider glued to a citation is removed, leaving a clean blank line', () => {
  const body = '_Works of Martin Luther:  \nAdolph Spaeth, L.D. Reed, Henry Eyster Jacobs, et Al., Trans. & Eds.  \n(Philadelphia: A. J. Holman Company, 1915), Vol.1, pp. 29-38_  \n\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\n\n> Out of love for the truth.';
  const out = dewittenbergBlockquote(body);
  assert.equal(
    out,
    '_Works of Martin Luther:  \nAdolph Spaeth, L.D. Reed, Henry Eyster Jacobs, et Al., Trans. & Eds.  \n(Philadelphia: A. J. Holman Company, 1915), Vol.1, pp. 29-38_  \n\nOut of love for the truth.',
  );
});

test('a standalone underscore-rule divider block is removed too, not just the glued case', () => {
  const body = 'A heading above it.\n\n\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\n\nBody below it.';
  assert.equal(dewittenbergBlockquote(body), 'A heading above it.\n\nBody below it.');
});

test('a short italicised phrase is never mistaken for the divider', () => {
  const body = 'Real emphasis: _grace_ alone, _faith_ alone, _Christ_ alone.';
  assert.equal(dewittenbergBlockquote(body), body);
});

test('text with no ">" or underscore-run passes through unchanged', () => {
  const body = 'Plain prose about the Word, with no markup artefacts at all.';
  assert.equal(dewittenbergBlockquote(body), body);
});

test('empty and missing input do not throw', () => {
  assert.equal(dewittenbergBlockquote(''), '');
  assert.equal(dewittenbergBlockquote(null), '');
  assert.equal(dewittenbergBlockquote(undefined), '');
});

test('a ">" that is not at the start of a line is left alone', () => {
  // Guards the line-anchored design: this function must never eat a
  // mid-sentence ">" the way a naive global strip would.
  const body = 'The threshold reads 5 > 3, which the catechist notes in passing.';
  assert.equal(dewittenbergBlockquote(body), body);
});
