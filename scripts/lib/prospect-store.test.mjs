import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  toRow, fromRow, isMissingTable, changedProspects, sortProspects, loadProspects, saveProspects, QUEUE_FILE,
} from './prospect-store.mjs';

const sample = {
  id: 'all-of-grace-spurgeon',
  status: 'staged',
  added: '2026-09-08',
  author: 'Charles Haddon Spurgeon',
  death_year: 1892,
  translation_copyright_clear: true,
  translator: '',
  translator_death_year: null,
  stage_3_themes: ['salvation', 'repentance'],
  notes: 'From Notion.',
  license: null,
};

test('a prospect survives toRow → fromRow unchanged, apart from null fields', () => {
  const back = fromRow(toRow(sample));
  const expected = { ...sample };
  delete expected.translator_death_year; // null columns are omitted on the way out
  delete expected.license;
  assert.deepEqual(back, expected);
});

test('unknown keys ride in extra and come back; UI-only _keys are dropped', () => {
  const row = toRow({ ...sample, legacy_field: 'kept', _hasOutput: true });
  assert.deepEqual(row.extra, { legacy_field: 'kept' });
  assert.equal('_hasOutput' in row, false);
  assert.equal(fromRow(row).legacy_field, 'kept');
});

test('toRow gives the table what its column types accept', () => {
  const row = toRow({ id: 'x', status: 'pending', added: '', death_year: '1109', stage_3_themes: undefined });
  assert.equal(row.added, null);
  assert.equal(row.death_year, 1109);
  assert.deepEqual(row.stage_3_themes, []);
});

test('a column never shadows an extra key of the same name', () => {
  const p = fromRow({ id: 'x', status: 'pending', stage_3_themes: [], extra: { status: 'stale' } });
  assert.equal(p.status, 'pending');
});

test('isMissingTable recognises the not-yet-migrated answers and nothing else', () => {
  assert.equal(isMissingTable({ code: 'PGRST205', message: "Could not find the table 'public.prospects'" }), true);
  assert.equal(isMissingTable({ code: '42P01', message: 'relation "prospects" does not exist' }), true);
  assert.equal(isMissingTable({ code: '42501', message: 'permission denied' }), false);
  assert.equal(isMissingTable(null), false);
});

test('changedProspects returns only the rows that differ, plus new ones', () => {
  const before = [sample, { id: 'b', status: 'pending', stage_3_themes: [] }];
  const after = [
    { ...sample, status: 'imported' },
    { id: 'b', status: 'pending', stage_3_themes: [] },
    { id: 'c', status: 'pending', stage_3_themes: [] },
  ];
  assert.deepEqual(changedProspects(before, after).map((p) => p.id), ['all-of-grace-spurgeon', 'c']);
});

test('null and absent fields count as the same, so a table round trip is not a change', () => {
  const fromFile = { ...sample, translator_death_year: null, license: null };
  const fromTable = fromRow(toRow(fromFile)); // drops the nulls
  assert.deepEqual(changedProspects([fromFile], [fromTable]), []);
  assert.equal(changedProspects([fromFile], [{ ...fromTable, translator_death_year: 1887 }]).length, 1);
});

test('sortProspects orders by date added, then id', () => {
  const out = sortProspects([
    { id: 'b', added: '2026-10-01' }, { id: 'a', added: '2026-10-01' }, { id: 'z', added: '2026-09-01' },
  ]);
  assert.deepEqual(out.map((p) => p.id), ['z', 'a', 'b']);
});

// A fake client that answers like PostgREST before migration 041 has run.
const unmigrated = {
  from: () => ({
    select: () => ({ limit: async () => ({ data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.prospects'" } }) }),
  }),
};

test('before the migration, reads fall back to the file and say so', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pq-'));
  const file = path.join(dir, 'q.json');
  fs.writeFileSync(file, JSON.stringify({ prospects: [sample] }));
  const { source, prospects } = await loadProspects(unmigrated, { file });
  assert.equal(source, 'file');
  assert.equal(prospects[0].id, sample.id);
  await saveProspects(null, 'file', [{ ...sample, status: 'imported' }], { file });
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).prospects[0].status, 'imported');
});

test('any other database error is raised, never papered over with the file', async () => {
  const broken = { from: () => ({ select: () => ({ limit: async () => ({ data: null, error: { code: '42501', message: 'permission denied' } }) }) }) };
  await assert.rejects(loadProspects(broken), /permission denied/);
});

test('every prospect in the committed queue file maps to a valid row', () => {
  const statuses = new Set(['pending', 'stage-1-done', 'stage-2-done', 'stage-3-done', 'staged', 'imported', 'rejected']);
  const { prospects } = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
  for (const p of prospects) {
    const row = toRow(p);
    assert.match(row.id, /^[a-z0-9-]+$/, p.id);
    assert.ok(statuses.has(row.status), `${p.id}: status ${row.status}`);
    assert.ok(Array.isArray(row.stage_3_themes), p.id);
    assert.ok(row.added === undefined || row.added === null || /^\d{4}-\d{2}-\d{2}$/.test(row.added), `${p.id}: added ${row.added}`);
  }
});
