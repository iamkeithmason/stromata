import test from 'node:test';
import assert from 'node:assert/strict';
import { copyrightBasis, copyrightClear } from './copyright.mjs';

test('an author who died before 1900 clears', () => {
  assert.equal(copyrightBasis({ death_year: 1892 }), 'author-death');
  assert.equal(copyrightClear({ death_year: 1900 }), false);
});

test('a translation clears only when marked clear and the translator died before 1928', () => {
  assert.equal(copyrightBasis({ death_year: 1950, translation_copyright_clear: true, translator_death_year: 1925 }), 'translator-death');
  assert.equal(copyrightClear({ death_year: 1950, translation_copyright_clear: false, translator_death_year: 1925 }), false);
  assert.equal(copyrightClear({ death_year: 1950, translation_copyright_clear: true, translator_death_year: 1931 }), false);
});

test('a pre-1929 publication clears only with a recorded ruling', () => {
  const jowett = { death_year: 1923, publication_year: 1905 };
  assert.equal(copyrightClear(jowett), false, 'the year alone is a claim, not a decision');
  assert.equal(copyrightBasis({ ...jowett, copyright_ruling: 'Keith, 20 Nov 2026' }), 'publication-ruling');
  assert.equal(copyrightClear({ ...jowett, publication_year: 1929, copyright_ruling: 'Keith' }), false);
  assert.equal(copyrightClear({ ...jowett, copyright_ruling: '   ' }), false);
});
