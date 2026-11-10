import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wordCount, proseWordCount, checkFootnotes, readStaged, sqlLiteral, buildSql } from './replace-text-body.mjs';

const BODY = 'Word '.repeat(120) + 'end.[^1]\n\n' + 'More text '.repeat(30) + '\n\n[^1]: Ps. l. 15.';
const staged = (extra = '') => `---
target_slug: "confession"
expected_id: "17489f68-d7fd-47e1-9b16-8e31d598f117"
expected_accession: 21
source_url: "https://archive.org/details/x"
source_attribution: "Translated by A."
translation_notes: "Notes with a $q$ inside"
provenance_notes: "Prov."
review_note: "10 Nov: replaced."
license:
${extra}---

${BODY}
`;

test('wordCount matches the generated column; proseWordCount drops footnote definitions', () => {
  assert.equal(wordCount('  a  b\n\nc '), 3);
  assert.equal(proseWordCount('a b\n\n[^1]: Ps. l. 15.'), 2);
});

test('checkFootnotes pairs markers with definitions', () => {
  assert.deepEqual(checkFootnotes('x[^1]\n\n[^1]: y').problems, []);
  assert.match(checkFootnotes('x[^1]').problems[0], /no definition/);
  assert.match(checkFootnotes('x\n\n[^2]: y').problems[0], /no marker/);
});

test('readStaged keeps the row guards and never carries published or the introduction', () => {
  const item = readStaged(staged());
  assert.equal(item.slug, 'confession');
  assert.equal(item.expectedAccession, 21);
  assert.equal(item.fields.review_state, 'pending');
  assert.equal(item.fields.license, null);
  assert.equal(item.fields.sections, null);
  assert.equal(item.clearSummary, false);
  for (const k of ['published', 'editorial_introduction', 'note_draft', 'word_count', 'slug', 'id']) {
    assert.ok(!(k in item.fields), `${k} must not be written`);
  }
});

test('readStaged refuses a file missing a guard', () => {
  assert.throws(() => readStaged(staged().replace('expected_accession: 21\n', '')), /expected_accession/);
});

test('sqlLiteral dollar-quotes without colliding with the content', () => {
  assert.equal(sqlLiteral(null), 'null');
  assert.equal(sqlLiteral("it's"), "$q$it's$q$");
  assert.equal(sqlLiteral('a $q$ b'), '$qq$a $q$ b$qq$');
});

test('buildSql guards on id, slug, accession and published = false, and never publishes', () => {
  const sql = buildSql(readStaged(staged()), []);
  assert.match(sql, /accession_number = 21 and published = false/);
  assert.match(sql, /raise exception/);
  assert.match(sql, /delete from text_scripture_references/);
  assert.doesNotMatch(sql, /published\s*=\s*true/);
  assert.doesNotMatch(sql, /editorial_introduction/);
  assert.doesNotMatch(sql, /summary = null/);
  assert.match(buildSql(readStaged(staged('clear_summary: true\n'))), /summary = null/);
});
