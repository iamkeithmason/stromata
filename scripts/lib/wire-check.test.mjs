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
import { isUmamiCollect, parseBeacon, checkProps, pickEvent, SLUG, READ_NEXT_PICK, summarise } from './wire-check.mjs';

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

test('read-next pick accepts the four kinds and nothing else', () => {
  for (const kind of ['editorial', 'author', 'theme', 'genre']) {
    assert.equal(checkProps({ data: { pick: kind } }, { pick: READ_NEXT_PICK }).ok, true, kind);
  }
  assert.equal(checkProps({ data: { pick: 'Editorial' } }, { pick: READ_NEXT_PICK }).ok, false);
  assert.equal(checkProps({ data: {} }, { pick: READ_NEXT_PICK }).ok, false);
});

test('pickEvent prefers the event that passes over an earlier one of the same name', () => {
  // A navigating click: the landing page's own event arrives first.
  const captured = [
    { name: 'text-view', data: { text: 'conference-9' } },
    { name: 'text-open', data: { text: 'conference-9' } },
    { name: 'text-open', data: { from: 'tradition-page', text: 'conference-9' } },
  ];
  const { event, ok } = pickEvent(captured, 'text-open', { from: 'tradition-page', text: SLUG });
  assert.equal(ok, true);
  assert.equal(event.data.from, 'tradition-page');
});

test('pickEvent falls back to the first of the name, so a real failure still says why', () => {
  const captured = [{ name: 'text-open', data: { text: 'conference-9' } }];
  const { event, ok } = pickEvent(captured, 'text-open', { from: 'tradition-page' });
  assert.equal(ok, false);
  assert.deepEqual(checkProps(event, { from: 'tradition-page' }).problems, ['from missing (wanted tradition-page)']);
});

test('pickEvent returns no event when none of the name arrived', () => {
  assert.deepEqual(pickEvent([{ name: 'text-view', data: {} }], 'text-open', {}), { event: null, ok: false });
});

test('pickEvent ignores events sent from another page', () => {
  // The landing page's event carries the landing url; the click's carries the
  // url of the page it was clicked on.
  const captured = [
    { name: 'text-open', url: '/texts/conference-9', data: { text: 'conference-9' } },
    { name: 'text-open', url: '/search?q=augustine', data: { from: 'search-results', text: 'conference-9' } },
  ];
  const onSearch = pickEvent(captured, 'text-open', { from: 'search-results' }, { onPath: '/search?q=augustine' });
  assert.equal(onSearch.ok, true);
  // Only the landing page's event arrived: report no beacon, not "from missing".
  const lost = pickEvent(captured.slice(0, 1), 'text-open', { from: 'search-results' }, { onPath: '/search?q=augustine' });
  assert.deepEqual(lost, { event: null, ok: false });
});

test('pickEvent keeps an event with no url rather than guessing where it came from', () => {
  const { ok } = pickEvent([{ name: 'text-open', url: '', data: { from: 'era-page' } }], 'text-open', { from: 'era-page' }, { onPath: '/eras/ante-nicene' });
  assert.equal(ok, true);
});
