/**
 * Tests for the in-flight check. The fixtures are the real misses the check was
 * written for: Homily 50 (#236, 17 Nov 2026), the Ephesians imports (queue and
 * run log, 16 Nov), and the duplicate mid-text navigation builds (#184/#187,
 * 2 Nov). PR bodies are trimmed; titles, states and dates are as on GitHub.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  queryWords, matches, matchPullRequests, matchBranches, matchProspects,
  matchRunLogs, runLogDate, buildReport, verdict,
} from './in-flight.mjs';

const NOV17_NOON = Date.parse('2026-11-17T12:05:00Z');

const PR_236 = {
  number: 236, state: 'closed', merged_at: '2026-11-17T11:51:25Z',
  title: 'Homily 50 on Matthew: restore NPNF I/10 opening header (run log)',
  body: 'Follow-up to the item flagged in #234. Made to the **published** text `homily-50-on-matthew` (accession 3).',
};
const PR_234 = {
  number: 234, state: 'closed', merged_at: '2026-11-17T10:02:00Z',
  title: 'Replace Address on Vainglory with Homilies 20 and 21 on Ephesians',
  body: 'Card: none\n\nBefore release: publish homily-21-ephesians-chrysostom in /admin/review',
};
const OLD_MERGED = {
  number: 120, state: 'closed', merged_at: '2026-10-01T09:00:00Z',
  title: 'Homily 50 on Matthew: first import', body: '',
};

const QUEUE = [
  { id: 'homily-20-ephesians-chrysostom', status: 'imported', title: 'Homily 20 on Ephesians (On Marriage)',
    author: 'John Chrysostom', collection_slug: 'homily-20-ephesians-chrysostom', added: '2026-11-16' },
  { id: 'homily-21-ephesians-chrysostom', status: 'imported', title: 'Homily 21 on Ephesians (On Children and Parents)',
    author: 'John Chrysostom', collection_slug: 'homily-21-ephesians-chrysostom', added: '2026-11-16' },
  { id: 'small-catechism-luther', status: 'imported', title: 'The Small Catechism', author: 'Martin Luther' },
];

const LOGS = [
  { file: 'scripts/ingestion/run-log/2026-11-16.md',
    text: '# Pipeline Run — 2026-11-16\n\n### homily-21-ephesians-chrysostom — Homily 21 on Ephesians\nStage 5a: imported 1 text as published:false.' },
  { file: 'scripts/ingestion/run-log/2026-10-01.md', text: 'Homily 20 on Ephesians mentioned long ago' },
];

test('query words are lower-cased and split on spaces and slug punctuation', () => {
  assert.deepEqual(queryWords(['Homily', '50']), ['homily', '50']);
  assert.deepEqual(queryWords('on-the-thoughts'), ['on', 'the', 'thoughts']);
});

test('every word must start a word of the text, so slugs and plurals match', () => {
  assert.ok(matches('homily-50-on-matthew', ['homily', '50']));
  assert.ok(matches('Homilies on Ephesians', ['ephesian']));
  assert.ok(!matches('Homily 21 on Ephesians', ['homily', '50']));
  assert.ok(!matches('Homily 1500', ['50']), 'a number matches a whole word start, not a substring');
  assert.ok(!matches('anything', []), 'an empty query matches nothing');
});

test('"homily 50" on 17 Nov lists #236, merged minutes earlier', () => {
  const r = buildReport({ words: queryWords('homily 50'), pulls: [PR_236, PR_234, OLD_MERGED],
    branches: [], prospects: QUEUE, runLogs: LOGS, now: NOV17_NOON });
  assert.deepEqual(r.mergedPRs.map((p) => p.number), [236]);
  assert.equal(r.count, 1);
  assert.equal(r.verdict, '1 match: read them before acting');
});

test('"ephesians" on 17 Nov lists the 16 Nov imports in the queue and the run log', () => {
  const r = buildReport({ words: queryWords('ephesians'), pulls: [PR_236, PR_234],
    branches: [], prospects: QUEUE, runLogs: LOGS, now: NOV17_NOON });
  assert.deepEqual(r.prospects.map((p) => p.id), ['homily-20-ephesians-chrysostom', 'homily-21-ephesians-chrysostom']);
  assert.deepEqual(r.runLogs.map((l) => l.file), ['scripts/ingestion/run-log/2026-11-16.md'], 'the October log is outside 14 days');
  assert.ok(r.runLogs[0].lines.some((l) => l.includes('Ephesians')));
  assert.deepEqual(r.mergedPRs.map((p) => p.number), [234]);
});

test('"mid-text navigation" on 2 Nov evening lists the open #184 before #187 is opened', () => {
  const now = Date.parse('2026-11-02T19:00:00Z');
  const pulls = [{ number: 184, state: 'open', merged_at: null,
    title: 'Mid-text navigation on phones: reading header, slim pill, top sheet', body: '' }];
  const branches = [{ name: 'origin/ccr-9f23c31e-tbodj7', date: '2026-11-02T12:30:00Z',
    subject: 'Mid-text navigation on phones: reading header' }];
  const r = buildReport({ words: queryWords('mid-text navigation'), pulls, branches, prospects: [], runLogs: [], now });
  assert.deepEqual(r.openPRs.map((p) => p.number), [184]);
  assert.equal(r.branches.length, 1);
});

test('open PRs match at any age; merged ones only within 7 days', () => {
  const now = Date.parse('2026-11-20T00:00:00Z');
  const pulls = [
    { number: 1, state: 'open', merged_at: null, title: 'Index foreign keys', body: '' },
    { number: 2, state: 'closed', merged_at: '2026-11-14T00:00:00Z', title: 'Index foreign keys again', body: '' },
    { number: 3, state: 'closed', merged_at: '2026-11-01T00:00:00Z', title: 'Index foreign keys once', body: '' },
    { number: 4, state: 'closed', merged_at: null, title: 'Index foreign keys, closed unmerged', body: '' },
  ];
  const { open, merged } = matchPullRequests(pulls, ['index', 'foreign'], now);
  assert.deepEqual(open.map((p) => p.number), [1]);
  assert.deepEqual(merged.map((p) => p.number), [2]);
});

test('branches older than 3 days are left out', () => {
  const now = Date.parse('2026-11-20T00:00:00Z');
  const b = [
    { name: 'origin/claude/fk-index', date: '2026-11-19T00:00:00Z', subject: 'Index foreign keys' },
    { name: 'origin/claude/fk-index-old', date: '2026-11-10T00:00:00Z', subject: 'Index foreign keys' },
  ];
  assert.deepEqual(matchBranches(b, ['foreign'], now).map((x) => x.name), ['origin/claude/fk-index']);
});

test('prospects match on author as well as title', () => {
  assert.equal(matchProspects(QUEUE, ['luther']).length, 1);
});

test('run-log dates come from the file name, suffixes allowed', () => {
  assert.equal(runLogDate('scripts/ingestion/run-log/2026-11-17-homily-50-matthew.md'), '2026-11-17');
  assert.equal(runLogDate('README.md'), null);
  assert.deepEqual(matchRunLogs([{ file: 'notes.md', text: 'ephesians' }], ['ephesians']), []);
});

test('no match prints the nothing-in-flight verdict', () => {
  const r = buildReport({ words: queryWords('psychomachia prudentius'), pulls: [PR_236], branches: [],
    prospects: QUEUE, runLogs: LOGS, now: NOV17_NOON });
  assert.equal(r.count, 0);
  assert.equal(r.verdict, 'nothing in flight');
});

test('a source that could not be read is named, never reported as clear', () => {
  const r = buildReport({ words: ['anything'], pulls: null, branches: [], prospects: [], runLogs: [] });
  assert.deepEqual(r.unchecked, ['GitHub pull requests']);
  assert.equal(r.verdict, 'nothing found, but not checked: GitHub pull requests');
  assert.equal(verdict(2, ['run logs']), '2 matches: read them before acting');
});
