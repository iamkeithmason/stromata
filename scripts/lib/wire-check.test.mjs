/**
 * Tests for the wire sweep's assertion half.
 *
 * The failure mode worth guarding against is a sweep that reports green
 * because it looked in the wrong place: matching the tracker script as if it
 * were a beacon, treating a pageview as a custom event, or counting a missing
 * property as present. Each of those is a test here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isUmamiCollect, parseBeacon, checkProps, SLUG, summarise } from './wire-check.mjs';

test('the collection endpoint is matched, the tracker script is not', () => {
  assert.equal(isUmamiCollect('https://cloud.umami.is/api/send'), true);
  assert.equal(isUmamiCollect('https://gateway-eu.umami.is/api/send'), true);
  assert.equal(isUmamiCollect('https://analytics.example.com/api/send'), false);
  // Blocking the script would leave window.umami undefined and every check
  // would pass by firing nothing.
  assert.equal(isUmamiCollect('https://cloud.umami.is/script.js'), false);
  assert.equal(isUmamiCollect('https://www.thestromata.com/texts/foo'), false);
  assert.equal(isUmamiCollect('not a url'), false);
});

test('a named event parses; a pageview and junk do not', () => {
  const beacon = JSON.stringify({
    type: 'event',
    payload: {
      website: 'w',
      url: '/texts/pastoral-rule-1',
      name: 'text-session-depth',
      data: { depth: 1, text: 'pastoral-rule-1' },
    },
  });
  assert.deepEqual(parseBeacon(beacon), {
    name: 'text-session-depth',
    data: { depth: 1, text: 'pastoral-rule-1' },
    url: '/texts/pastoral-rule-1',
  });

  assert.equal(parseBeacon(JSON.stringify({ type: 'event', payload: { url: '/texts' } })), null);
  assert.equal(parseBeacon('{not json'), null);
  assert.equal(parseBeacon(null), null);
  assert.equal(parseBeacon(JSON.stringify({ payload: 'nope' })), null);
});

test('an event with no data object still parses, and then fails its props', () => {
  const ev = parseBeacon(JSON.stringify({ payload: { name: 'text-open' } }));
  assert.deepEqual(ev, { name: 'text-open', data: {}, url: '' });
  assert.deepEqual(checkProps(ev, { from: 'texts-index' }).problems, [
    'from missing (wanted texts-index)',
  ]);
});

test('checkProps enforces exact values, presence, and patterns', () => {
  const ev = { name: 'text-open', data: { from: 'texts-index', text: 'pastoral-rule-1' }, url: '' };
  assert.equal(checkProps(ev, { from: 'texts-index', text: SLUG }).ok, true);
  assert.equal(checkProps(ev, { from: 'texts-index', text: true }).ok, true);

  const wrong = checkProps(ev, { from: 'theme-page' });
  assert.equal(wrong.ok, false);
  assert.match(wrong.problems[0], /from=texts-index, wanted theme-page/);

  // A title where a slug belongs is the failure the slug rule exists to catch.
  const titled = { name: 'text-open', data: { from: 'texts-index', text: 'The Pastoral Rule' }, url: '' };
  assert.equal(checkProps(titled, { text: SLUG }).ok, false);
});

test('an empty string counts as missing, not as present', () => {
  const ev = { name: 'theme-click', data: { theme: '', source: 'text-page' }, url: '' };
  assert.deepEqual(checkProps(ev, { theme: true }).problems, ['theme missing']);
});

test('numeric property values compare by value', () => {
  const ev = { name: 'text-session-depth', data: { depth: 2, text: 'a-b' }, url: '' };
  assert.equal(checkProps(ev, { depth: 2 }).ok, true);
  assert.equal(checkProps(ev, { depth: 1 }).ok, false);
});

test('no beacon at all is a failure with a readable reason', () => {
  assert.deepEqual(checkProps(null, { from: true }), { ok: false, problems: ['no beacon captured'] });
});

test('summarise tallies by status', () => {
  assert.deepEqual(
    summarise([{ status: 'pass' }, { status: 'pass' }, { status: 'fail' }, { status: 'skip' }]),
    { pass: 2, fail: 1, skip: 1 }
  );
});
