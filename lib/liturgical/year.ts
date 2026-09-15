/**
 * The liturgical year — which season a given date falls in.
 *
 * Replaces the hand-edited `CURRENT_SEASON` constant that the seasonal panel
 * used to carry: the season is now derived from the date, so the church year
 * turns over on its own instead of waiting for someone to edit a file and
 * deploy.
 *
 * Western (Anglican) calendar. The six seasons tile the year with no gaps, so
 * `resolveSeason` always has an answer:
 *
 *   Advent       Advent Sunday → 24 December
 *   Christmas    25 December → 5 January          (the Twelve Days)
 *   Epiphany     6 January → Shrove Tuesday       (Epiphanytide, incl. pre-Lent)
 *   Lent         Ash Wednesday → Holy Saturday
 *   Eastertide   Easter Day → Pentecost
 *   Trinitytide  the day after Pentecost → the day before Advent Sunday
 *
 * Each season also carries its **cycle** — the coarser grouping used when the
 * year is spoken of in two movements plus the time between them. The cycle is
 * the hook for later work (grouping seasons into collections, the liturgical
 * wheel); nothing needs it yet, but deriving it here keeps one source of truth:
 *
 *   incarnation  Advent · Christmas · Epiphany
 *   paschal      Lent · Eastertide
 *   ordinary     Trinitytide
 *
 * Deliberately out of scope: feast days and saints' days (a much larger content
 * model and an open-ended maintenance commitment), the Triduum as its own
 * season, and the distinction between Epiphanytide proper and pre-Lent.
 */

export const SEASONS = ['advent', 'christmas', 'epiphany', 'lent', 'eastertide', 'trinitytide'] as const
export type Season = (typeof SEASONS)[number]

export const CYCLES = ['incarnation', 'paschal', 'ordinary'] as const
export type Cycle = (typeof CYCLES)[number]

const CYCLE_OF: Record<Season, Cycle> = {
  advent: 'incarnation',
  christmas: 'incarnation',
  epiphany: 'incarnation',
  lent: 'paschal',
  eastertide: 'paschal',
  trinitytide: 'ordinary',
}

export type SeasonPosition = {
  season: Season
  cycle: Cycle
  /** First day of the season (UTC midnight). */
  start: Date
  /** Last day of the season, inclusive (UTC midnight). */
  end: Date
}

// ── Date helpers ────────────────────────────────────────────────────────────
// Everything works in UTC midnight so a season boundary is a whole day and
// never shifts with the viewer's timezone or with British Summer Time.

const DAY_MS = 86_400_000

function utc(year: number, month1: number, day: number): Date {
  return new Date(Date.UTC(year, month1 - 1, day))
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS)
}

/**
 * Easter Sunday in the Gregorian calendar (Meeus/Jones/Butcher algorithm).
 * Everything in the paschal cycle is an offset from this date, which is why it
 * is the only piece of real arithmetic here.
 */
export function easterSunday(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)   // 3 = March, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return utc(year, month, day)
}

/** Ash Wednesday — 46 days before Easter (40 fast days plus six Sundays). */
export function ashWednesday(year: number): Date {
  return addDays(easterSunday(year), -46)
}

/** Pentecost — the fiftieth day, counting Easter Day as the first. */
export function pentecost(year: number): Date {
  return addDays(easterSunday(year), 49)
}

/**
 * Advent Sunday — the fourth Sunday before Christmas Day, i.e. the Sunday on or
 * nearest to St Andrew's Day (30 November). Found by stepping back from
 * Christmas to the Sunday before it, then back three more weeks.
 */
export function adventSunday(year: number): Date {
  const christmas = utc(year, 12, 25)
  const sundayBefore = addDays(christmas, -(christmas.getUTCDay() === 0 ? 7 : christmas.getUTCDay()))
  return addDays(sundayBefore, -21)
}

function position(season: Season, start: Date, end: Date): SeasonPosition {
  return { season, cycle: CYCLE_OF[season], start, end }
}

/**
 * The season a date falls in, with its cycle and bounds.
 *
 * Seasons are tested in calendar order within the relevant liturgical year.
 * Christmas straddles 1 January, so a date in early January belongs to the
 * previous calendar year's Christmas — handled by checking that season first.
 */
export function resolveSeason(date: Date = new Date()): SeasonPosition {
  const day = startOfUtcDay(date)
  const y = day.getUTCFullYear()

  // Christmas carried over from last year: 1–5 January.
  const lastChristmasStart = utc(y - 1, 12, 25)
  const lastChristmasEnd = utc(y, 1, 5)
  if (day >= utc(y, 1, 1) && day <= lastChristmasEnd) {
    return position('christmas', lastChristmasStart, lastChristmasEnd)
  }

  const ash = ashWednesday(y)
  const easter = easterSunday(y)
  const whitsun = pentecost(y)
  const advent = adventSunday(y)

  // Epiphany: 6 January until the day before Ash Wednesday.
  if (day < ash) {
    return position('epiphany', utc(y, 1, 6), addDays(ash, -1))
  }
  // Lent: Ash Wednesday to Holy Saturday.
  if (day < easter) {
    return position('lent', ash, addDays(easter, -1))
  }
  // Eastertide: Easter Day to Pentecost inclusive.
  if (day <= whitsun) {
    return position('eastertide', easter, whitsun)
  }
  // Trinitytide: the day after Pentecost to the day before Advent Sunday.
  if (day < advent) {
    return position('trinitytide', addDays(whitsun, 1), addDays(advent, -1))
  }
  // Advent: Advent Sunday to Christmas Eve.
  if (day < utc(y, 12, 25)) {
    return position('advent', advent, utc(y, 12, 24))
  }
  // Christmas: 25 December to 5 January.
  return position('christmas', utc(y, 12, 25), utc(y + 1, 1, 5))
}
