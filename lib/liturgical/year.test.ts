/**
 * Tests for the liturgical year.
 *
 * Two kinds, deliberately. The fixed dates pin the arithmetic against an
 * external authority (published Easter and Advent Sunday dates) — a computus
 * that is self-consistently wrong would sail past a property test. The tiling
 * property then checks the thing the panel actually depends on: that every day
 * of the year has exactly one season, with no gap or overlap at a boundary.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SEASONS,
  adventSunday,
  ashWednesday,
  easterSunday,
  pentecost,
  resolveSeason,
} from './year'

const iso = (d: Date) => d.toISOString().slice(0, 10)
const at = (s: string) => new Date(`${s}T12:00:00Z`)

test('Easter Sunday matches the published dates', () => {
  const expected: Record<number, string> = {
    2024: '2024-03-31',
    2025: '2025-04-20',
    2026: '2026-04-05',
    2027: '2027-03-28',
    2028: '2028-04-16',
    2029: '2029-04-01',
    2030: '2030-04-21',
  }
  for (const [year, date] of Object.entries(expected)) {
    assert.equal(iso(easterSunday(Number(year))), date, `Easter ${year}`)
  }
})

test('Ash Wednesday is 46 days before Easter, and Pentecost the fiftieth day', () => {
  assert.equal(iso(ashWednesday(2026)), '2026-02-18')
  assert.equal(iso(pentecost(2026)), '2026-05-24')
})

test('Advent Sunday is the fourth Sunday before Christmas', () => {
  assert.equal(iso(adventSunday(2024)), '2024-12-01')
  assert.equal(iso(adventSunday(2025)), '2025-11-30')
  assert.equal(iso(adventSunday(2026)), '2026-11-29')
  // Always a Sunday, and always within its 27 Nov – 3 Dec window.
  for (let y = 2024; y <= 2040; y++) {
    const d = adventSunday(y)
    assert.equal(d.getUTCDay(), 0, `Advent Sunday ${y} falls on a Sunday`)
    assert.equal(d.getUTCMonth() === 10 || d.getUTCMonth() === 11, true, `Advent Sunday ${y} in Nov/Dec`)
  }
})

test('boundary days resolve to the right season', () => {
  const cases: Array<[string, string]> = [
    ['2026-02-17', 'epiphany'],    // Shrove Tuesday — last day of Epiphanytide
    ['2026-02-18', 'lent'],        // Ash Wednesday
    ['2026-04-04', 'lent'],        // Holy Saturday
    ['2026-04-05', 'eastertide'],  // Easter Day
    ['2026-05-24', 'eastertide'],  // Pentecost — still Eastertide
    ['2026-05-25', 'trinitytide'], // the day after
    ['2026-09-15', 'trinitytide'], // the panel's hand-set season, as a sanity check
    ['2026-11-28', 'trinitytide'], // the day before Advent Sunday
    ['2026-11-29', 'advent'],      // Advent Sunday
    ['2026-12-24', 'advent'],      // Christmas Eve
    ['2026-12-25', 'christmas'],   // Christmas Day
    ['2027-01-05', 'christmas'],   // Twelfth Night — carried over the year end
    ['2027-01-06', 'epiphany'],    // Epiphany
  ]
  for (const [date, season] of cases) {
    assert.equal(resolveSeason(at(date)).season, season, date)
  }
})

test('the returned bounds always bracket the date', () => {
  for (let y = 2024; y <= 2035; y++) {
    for (let d = new Date(Date.UTC(y, 0, 1)); d.getUTCFullYear() === y; d = new Date(d.getTime() + 86_400_000)) {
      const { start, end, season } = resolveSeason(d)
      assert.ok(SEASONS.includes(season), `${iso(d)} has a known season`)
      assert.ok(start <= d && d <= end, `${iso(d)} lies within its ${season} bounds`)
    }
  }
})

test('the six seasons tile the year with no gap or overlap', () => {
  let previous = resolveSeason(at('2024-01-01'))
  for (let d = at('2024-01-02'); d < at('2036-01-01'); d = new Date(d.getTime() + 86_400_000)) {
    const current = resolveSeason(d)
    if (current.season === previous.season && current.start.getTime() === previous.start.getTime()) continue
    // A change of season: the new one must begin the day after the old one ended.
    assert.equal(
      current.start.getTime() - previous.end.getTime(),
      86_400_000,
      `${previous.season} ends ${iso(previous.end)}, ${current.season} starts ${iso(current.start)}`,
    )
    previous = current
  }
})

test('cycles group the seasons in two movements plus the time between', () => {
  assert.equal(resolveSeason(at('2026-12-01')).cycle, 'incarnation')
  assert.equal(resolveSeason(at('2027-01-10')).cycle, 'incarnation')
  assert.equal(resolveSeason(at('2026-03-01')).cycle, 'paschal')
  assert.equal(resolveSeason(at('2026-04-20')).cycle, 'paschal')
  assert.equal(resolveSeason(at('2026-09-15')).cycle, 'ordinary')
})
