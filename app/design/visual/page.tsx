/**
 * /design/visual — a NOINDEX design exploration, not linked in nav.
 *
 * The question (Keith, 4 Nov 2026): the library is literally texts. How can it be
 * made visual and inviting at the scale of hundreds of works, when a magazine's
 * answer (an image per article) does not scale? The approach explored here: make
 * the pictures from what every text and author already has (an era, a date, a
 * genre, a tradition), drawn once and generated for every record.
 *
 *   I.   The cosmos as a map — the homepage sky's nested spheres become nine era
 *        rings, earliest at the centre, with every published author as a star.
 *   II.  An ornament per genre — a small star or rosette on each book cover,
 *        generated from the genre, so the shelves read as kinds of writing.
 *   III. One plate per era — nine public-domain images, chosen once, for the
 *        eras rather than the texts. Not sourced yet; the frames say what to find.
 *
 * Real published data throughout, metadata only (no `body`; see
 * lib/supabase/no-body-in-listings.test.ts). Colour comes from tokens.
 * NOT a shipping decision: nothing here is wired into navigation.
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { createPublicClient } from '@/lib/supabase/public'
import { traditionColor } from '@/lib/tradition-colors'
import { SectionHeader } from '@/app/components/SectionHeader'

export const metadata: Metadata = {
  title: 'Making the library visual (exploration) — The Stromata',
  robots: { index: false, follow: false },
}

// Era rings, earliest innermost. Years bound each ring so an author's death year
// sets the angle: the ring is read clockwise from the top, like a clock of history.
const ERA_RINGS = [
  { slug: 'apostolic', name: 'Apostolic', from: 30, to: 100 },
  { slug: 'ante-nicene', name: 'Ante-Nicene', from: 100, to: 325 },
  { slug: 'nicene-post-nicene', name: 'Nicene & Post-Nicene', from: 325, to: 600 },
  { slug: 'early-medieval', name: 'Early Medieval', from: 600, to: 1000 },
  { slug: 'high-medieval', name: 'High Medieval', from: 1000, to: 1350 },
  { slug: 'late-medieval', name: 'Late Medieval', from: 1350, to: 1500 },
  { slug: 'reformation', name: 'Reformation', from: 1500, to: 1600 },
  { slug: 'post-reformation', name: 'Post-Reformation', from: 1600, to: 1800 },
  { slug: 'modern', name: 'Modern', from: 1800, to: 1900 },
] as const

const GENRES = [
  'Homily', 'Sermon', 'Letter', 'Treatise', 'Essay', 'Meditation', 'Rule', 'Prayer', 'Catechesis',
  'Commentary', 'Dialogue', 'Hymn', 'Poem', 'Confession', 'Hagiography', 'Apology', 'Exegesis',
]

type AuthorRow = {
  name: string
  slug: string
  death_year: number | null
  era: { slug: string } | null
}

type TextRow = {
  title: string
  slug: string
  author_id: string | null
  genre: { name: string } | null
  author: { name: string; tradition: { slug: string } | null } | null
}

// ── geometry ────────────────────────────────────────────────────────────────

/** An n-pointed star centred on (cx, cy): outer radius r, inner radius r * pinch. */
function starPath(cx: number, cy: number, r: number, points: number, pinch = 0.42): string {
  const steps = points * 2
  let d = ''
  for (let i = 0; i < steps; i++) {
    const a = (Math.PI * i) / points - Math.PI / 2
    const rad = i % 2 === 0 ? r : r * pinch
    d += `${i === 0 ? 'M' : 'L'}${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`
  }
  return d + 'Z'
}

/**
 * The genre's ornament, round 2. Round 1 varied one star by its number of points,
 * and at cover size four, five and six points read as the same mark (Keith,
 * 4 Nov). Here each genre has its own traditional motif, drawn on one 24-unit
 * grid with one stroke weight, so they read as a set and apart from each other.
 * Related genres share a family: Sermon and Homily are both "voice" arcs; Hymn
 * and Poem are both Gothic foils; Treatise and Essay are both lozenges.
 */
const S = { fill: 'none', stroke: 'var(--gold-ink)', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' } as const
const F = { fill: 'var(--gold-ink)' } as const

/** A Gothic foil: n lobes round a centre (trefoil, quatrefoil). */
function foil(n: number, r = 4.6, d = 4.4) {
  return Array.from({ length: n }, (_, k) => {
    const a = (2 * Math.PI * k) / n - Math.PI / 2
    return <circle key={k} cx={12 + d * Math.cos(a)} cy={12 + d * Math.sin(a)} r={r} {...S} />
  })
}

const MOTIFS: Record<string, { name: string; draw: () => React.ReactNode }> = {
  Sermon: { name: 'a voice: three arcs from a point', draw: () => (<>
    <circle cx={5} cy={12} r={1.6} {...F} />
    <path d="M9 7.5a6.5 6.5 0 0 1 0 9" {...S} /><path d="M12.5 5a10 10 0 0 1 0 14" {...S} /><path d="M16 2.5a13.5 13.5 0 0 1 0 19" {...S} />
  </>) },
  Homily: { name: 'a quieter voice: two arcs', draw: () => (<>
    <circle cx={7} cy={12} r={1.6} {...F} />
    <path d="M11 7.5a6.5 6.5 0 0 1 0 9" {...S} /><path d="M14.5 5a10 10 0 0 1 0 14" {...S} />
  </>) },
  Letter: { name: 'a wax seal', draw: () => (<>
    <circle cx={12} cy={12} r={9} {...S} /><circle cx={12} cy={12} r={6} {...S} />
    <path d="M12 8.5v7M8.5 12h7" {...S} />
  </>) },
  Treatise: { name: 'a lozenge within a square', draw: () => (<>
    <rect x={4} y={4} width={16} height={16} {...S} /><path d="M12 6l6 6-6 6-6-6z" {...S} />
  </>) },
  Essay: { name: 'a single lozenge', draw: () => (<path d="M12 3l8 9-8 9-8-9z" {...S} />) },
  Meditation: { name: 'a point within circles', draw: () => (<>
    <circle cx={12} cy={12} r={9} {...S} /><circle cx={12} cy={12} r={5} {...S} /><circle cx={12} cy={12} r={1.6} {...F} />
  </>) },
  Rule: { name: 'ruled lines', draw: () => (<>
    <path d="M4 6h16M4 12h16M4 18h16" {...S} /><path d="M7 3v18" {...S} />
  </>) },
  Prayer: { name: 'a candle flame', draw: () => (<>
    <path d="M12 3c3 4 5 7 5 10a5 5 0 0 1-10 0c0-3 2-6 5-10z" {...S} /><path d="M12 11c1 1.4 1.8 2.6 1.8 3.6a1.8 1.8 0 0 1-3.6 0c0-1 .8-2.2 1.8-3.6z" {...F} />
  </>) },
  Catechesis: { name: 'steps', draw: () => (<path d="M4 20h5v-5h5v-5h5V4" {...S} />) },
  Commentary: { name: 'a text with its margin', draw: () => (<>
    <rect x={3} y={4} width={18} height={16} {...S} /><path d="M15 4v16" {...S} /><path d="M6 9h6M6 12h6M6 15h6" {...S} /><circle cx={18} cy={9} r={1.2} {...F} />
  </>) },
  Exegesis: { name: 'a key', draw: () => (<>
    <circle cx={7.5} cy={12} r={4} {...S} /><path d="M11.5 12H21M17 12v3.5M20 12v2.5" {...S} />
  </>) },
  Dialogue: { name: 'two circles meeting (vesica)', draw: () => (<>
    <circle cx={9} cy={12} r={6.5} {...S} /><circle cx={15} cy={12} r={6.5} {...S} />
  </>) },
  Hymn: { name: 'a quatrefoil', draw: () => (<>{foil(4, 4.4, 4.6)}</>) },
  Poem: { name: 'a trefoil', draw: () => (<>{foil(3, 4.6, 4.4)}</>) },
  Confession: { name: 'a cross pattée', draw: () => (
    <path d="M10 3h4l-1 6.5L19.5 8.5 21 12l-1.5 3.5L13 14.5l1 6.5h-4l1-6.5L4.5 15.5 3 12l1.5-3.5L11 9.5z" {...S} />
  ) },
  Hagiography: { name: 'a halo', draw: () => (<>
    <circle cx={12} cy={12} r={4.5} {...S} />
    {Array.from({ length: 12 }, (_, k) => { const a = (Math.PI * k) / 6; return <path key={k} d={`M${12 + 6.5 * Math.cos(a)} ${12 + 6.5 * Math.sin(a)}L${12 + 9.5 * Math.cos(a)} ${12 + 9.5 * Math.sin(a)}`} {...S} /> })}
  </>) },
  Apology: { name: 'a shield', draw: () => (<>
    <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" {...S} /><path d="M12 7v10" {...S} />
  </>) },
}

function GenreOrnament({ genre, size = 22 }: { genre: string; size?: number }) {
  const m = MOTIFS[genre]
  if (!m) return null
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ display: 'block' }}>
      {m.draw()}
    </svg>
  )
}

// ── data ────────────────────────────────────────────────────────────────────

async function loadData() {
  const supabase = createPublicClient()
  const [{ data: authors }, { data: texts }] = await Promise.all([
    supabase.from('authors').select('id, name, slug, death_year, era:eras(slug)').eq('draft', false),
    supabase
      .from('texts')
      .select('title, slug, author_id, genre:genres(name), author:authors(name, tradition:traditions(slug))')
      .eq('published', true)
      .order('created_at', { ascending: false }),
  ])
  const textRows = (texts ?? []) as unknown as TextRow[]
  const counts = new Map<string, number>()
  for (const t of textRows) if (t.author_id) counts.set(t.author_id, (counts.get(t.author_id) ?? 0) + 1)
  const authorRows = ((authors ?? []) as unknown as (AuthorRow & { id: string })[])
    .map(a => ({ ...a, texts: counts.get(a.id) ?? 0 }))
    .filter(a => a.texts > 0)
  return { authors: authorRows, texts: textRows }
}

// ── page ────────────────────────────────────────────────────────────────────

export default async function VisualExploration() {
  const { authors, texts } = await loadData()

  // I. The cosmos as a map
  const SIZE = 760
  const C = SIZE / 2
  const ringGap = (C - 40) / (ERA_RINGS.length + 0.5)
  const stars = authors.flatMap(a => {
    const ringIndex = ERA_RINGS.findIndex(r => r.slug === a.era?.slug)
    if (ringIndex < 0) return []
    const ring = ERA_RINGS[ringIndex]
    const year = a.death_year ?? (ring.from + ring.to) / 2
    const t = Math.min(1, Math.max(0, (year - ring.from) / (ring.to - ring.from)))
    const angle = t * 2 * Math.PI - Math.PI / 2
    const radius = ringGap * (ringIndex + 1)
    return [{
      ...a,
      x: C + radius * Math.cos(angle),
      y: C + radius * Math.sin(angle),
      r: 3 + Math.sqrt(a.texts) * 2.2,
    }]
  })
  const unplaced = authors.length - stars.length

  // II. One recent text per genre, for the shelf of covers
  const byGenre = new Map<string, TextRow>()
  for (const t of texts) {
    const g = t.genre?.name
    if (g && !byGenre.has(g)) byGenre.set(g, t)
  }
  const shelf = GENRES.filter(g => byGenre.has(g)).map(g => byGenre.get(g)!)

  return (
    <main className="page-vellum min-h-screen">
      <div className="content-shell py-12">
        <p className="kicker mb-3">Design exploration · not linked · noindex</p>
        <h1 className="font-serif italic mb-4" style={{ fontSize: 'var(--text-display)', color: 'var(--ink)', lineHeight: 1.1 }}>
          Making the library visual
        </h1>
        <p className="font-serif mb-12" style={{ fontSize: 'var(--text-prose)', color: 'var(--ink-soft)', maxWidth: '60ch', lineHeight: 1.6 }}>
          A library of texts has no pictures of its own, and an image per text does not scale to hundreds
          of works. These studies make the pictures from what every record already has: an era, a date, a
          genre, a tradition. Each is drawn once and generated for every text and author.
        </p>

        {/* ── I ── */}
        <SectionHeader title="I. The cosmos as a map" aside={`${stars.length} authors`} />
        <p className="font-serif mb-6" style={{ color: 'var(--ink-soft)', maxWidth: '60ch', lineHeight: 1.6 }}>
          The homepage sky&rsquo;s nested spheres, read as history. Each ring is an era, earliest at the
          centre, as the medieval cosmos set the earth within its spheres. Each published author is a star,
          placed round the ring by date of death (clockwise from the top) and sized by how many texts the
          library holds. Every star links to its author.
        </p>
        <div className="mb-3" style={{ background: 'var(--hero-ground)', maxWidth: SIZE }}>
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Authors of the library placed on nine era rings" style={{ display: 'block', width: '100%', height: 'auto' }}>
            {ERA_RINGS.map((ring, i) => (
              <g key={ring.slug}>
                <circle cx={C} cy={C} r={ringGap * (i + 1)} fill="none" stroke="var(--on-dark-rule)" strokeWidth={1} />
                <text x={C + 6} y={C - ringGap * (i + 1) - 5} fill="var(--on-dark-mute)" fontSize={11} fontFamily="var(--serif)" fontStyle="italic">
                  {ring.name}
                </text>
              </g>
            ))}
            <circle cx={C} cy={C} r={4} fill="var(--cosmos-gold)" />
            {stars.map(s => (
              <a key={s.slug} href={`/authors/${s.slug}`}>
                <title>{`${s.name}${s.death_year ? `, d. ${s.death_year}` : ''} · ${s.texts} text${s.texts === 1 ? '' : 's'}`}</title>
                <path d={starPath(s.x, s.y, s.r, 8, 0.4)} fill="var(--cosmos-gold-light)" opacity={0.92} />
              </a>
            ))}
          </svg>
        </div>
        <p className="caption mb-16" style={{ color: 'var(--ink-faint)' }}>
          Hover a star for its author.{unplaced > 0 ? ` ${unplaced} author${unplaced === 1 ? ' has' : 's have'} no era yet and ${unplaced === 1 ? 'is' : 'are'} not placed.` : ''}{' '}
          Possible uses: the hero itself, the /authors page, or an era page&rsquo;s header showing its own ring lit.
        </p>

        {/* ── II ── */}
        <SectionHeader title="II. An ornament per genre" aside={`${shelf.length} of ${GENRES.length} genres`} />
        <p className="font-serif mb-6" style={{ color: 'var(--ink-soft)', maxWidth: '60ch', lineHeight: 1.6 }}>
          A mark on each cover for its kind of writing, in place of the plain hairline under the title, so
          a shelf of covers shows sermons, letters and prayers at a glance. Round 2: the first round varied
          one star by its number of points, and at this size the marks could not be told apart. Now each
          genre has its own traditional motif, on one grid and one stroke weight, with related genres sharing
          a family. One recent text per genre:
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
          {shelf.map(t => (
            <Link key={t.slug} href={`/texts/${t.slug}`} style={{ textDecoration: 'none' }}>
              <div style={{ background: traditionColor(t.author?.tradition?.slug ?? null), aspectRatio: '2/3', padding: 8, display: 'flex' }}>
                <div className="flex flex-col items-center justify-center text-center" style={{ background: 'var(--cover-mid)', flex: 1, padding: '10px 8px', gap: 8 }}>
                  <p className="font-serif italic" style={{ color: 'var(--ink)', fontSize: t.title.length > 60 ? '0.72rem' : 'var(--text-sm)', lineHeight: 1.2, display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {t.title}
                  </p>
                  <GenreOrnament genre={t.genre?.name ?? ''} />
                  <p className="smallcaps" style={{ color: 'var(--ink-mute)', fontSize: 'var(--text-sm)' }}>
                    {t.author?.name}
                  </p>
                </div>
              </div>
              <p className="caption mt-1" style={{ color: 'var(--ink-faint)' }}>{t.genre?.name}</p>
            </Link>
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-4 mb-16">
          {GENRES.map(g => (
            <div key={g} className="flex items-center gap-3">
              <GenreOrnament genre={g} size={32} />
              <span>
                <span className="block font-serif" style={{ color: 'var(--ink)' }}>{g}</span>
                <span className="block caption" style={{ color: 'var(--ink-faint)' }}>{MOTIFS[g]?.name}</span>
              </span>
            </div>
          ))}
        </div>

        {/* ── III ── */}
        <SectionHeader title="III. One plate per era" aside="not sourced yet" />
        <p className="font-serif mb-6" style={{ color: 'var(--ink-soft)', maxWidth: '60ch', lineHeight: 1.6 }}>
          Nine public-domain images, chosen once, for the eras rather than the texts: enough for every
          era page, every text&rsquo;s header and the homepage to carry a picture of its world. Each frame
          names what to look for. Open collections with clear public-domain status include Wikimedia
          Commons, the British Library&rsquo;s Flickr Commons, the Getty&rsquo;s Open Content and the Met&rsquo;s
          Open Access; each image&rsquo;s status would be checked one by one, as texts are.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-16">
          {[
            ['Apostolic', 'A catacomb fresco: the Good Shepherd, an orant'],
            ['Ante-Nicene', 'An early Christian sarcophagus relief'],
            ['Nicene & Post-Nicene', 'A Ravenna or Roman apse mosaic'],
            ['Early Medieval', 'An insular gospel-book carpet page or initial'],
            ['High Medieval', 'A Gothic psalter or bible illumination'],
            ['Late Medieval', 'A book of hours: calendar page or border'],
            ['Reformation', 'A woodcut from an early printed bible or catechism'],
            ['Post-Reformation', 'An engraved frontispiece or emblem book plate'],
            ['Modern', 'A Victorian steel engraving or chromolithograph'],
          ].map(([era, what]) => (
            <figure key={era} style={{ border: '1px solid var(--rule)', padding: 12, margin: 0 }}>
              <div style={{ aspectRatio: '4/3', background: 'var(--paper-deep)', display: 'grid', placeItems: 'center' }}>
                <span className="caption" style={{ color: 'var(--ink-faint)' }}>plate to source</span>
              </div>
              <figcaption className="mt-2">
                <span className="smallcaps" style={{ color: 'var(--ink)' }}>{era}</span>
                <span className="block caption" style={{ color: 'var(--ink-mute)' }}>{what}</span>
              </figcaption>
            </figure>
          ))}
        </div>

        <p className="caption" style={{ color: 'var(--ink-faint)', maxWidth: '60ch' }}>
          Backlog card: &ldquo;Make the library visual at scale&rdquo;. Next step: Keith picks the studies worth
          taking further; each would get its own card before anything ships.
        </p>
      </div>
    </main>
  )
}
