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
import { HERBAL_ORNAMENTS } from './herbal-ornaments'

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
 * The genre's ornament, round 3: things, not signs.
 *
 * Round 1 varied one star by its points (indistinguishable at cover size);
 * round 2 gave each genre an abstract motif (distinct, but read as modern
 * icons, and Sermon/Homily still too alike). Keith pointed to the chapter
 * ornaments of an illuminated bible (a drop, a fish, a feather, a sprig, a
 * flower): corporeal objects, cut like woodcuts. So each genre is now an
 * object chosen for its meaning, drawn as a solid gold silhouette with cream
 * "cut" lines on a 48-unit grid. These are hand-coded sketches of the
 * direction; finished ornaments would want an illustrator or a set of
 * public-domain printer's ornaments.
 */
const G = { fill: 'var(--gold-ink)' } as const
const CUT = { fill: 'none', stroke: 'var(--cover-mid)', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' } as const
const LINE = { fill: 'none', stroke: 'var(--gold-ink)', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

/** Leaves along a curved stem: an ellipse every `step` from t0 to t1, alternating sides. */
function leaves(points: [number, number, number][], rx: number, ry: number) {
  return points.map(([x, y, angle], k) => (
    <ellipse key={k} cx={x} cy={y} rx={rx} ry={ry} transform={`rotate(${angle} ${x} ${y})`} {...G} />
  ))
}

const MOTIFS: Record<string, { name: string; draw: () => React.ReactNode }> = {
  Sermon: { name: 'a fish: "fishers of men"', draw: () => (<>
    <path d="M5 24c8-11 24-11 32 0-8 11-24 11-32 0z" {...G} />
    <path d="M36 24l9-8-2 8 2 8z" {...G} />
    <circle cx={11.5} cy={22.5} r={1.4} fill="var(--cover-mid)" />
    <path d="M17 18.5c2 3.5 2 7.5 0 11M22 17.5c2.2 4 2.2 9 0 13M27 18c2 3.8 2 8.2 0 12M31.5 19.5c1.6 3 1.6 6 0 9" {...CUT} />
  </>) },
  Homily: { name: 'a loaf: bread broken for the household', draw: () => (<>
    <path d="M6 30c0-9 8-15 18-15s18 6 18 15c0 3-2 5-5 5H11c-3 0-5-2-5-5z" {...G} />
    <path d="M14 22l4 6M21 19l4 7M28 19l4 7M35 22l3 5" {...CUT} />
  </>) },
  Letter: { name: 'a quill', draw: () => (<>
    <path d="M12 38C15 25 26 12 42 5c-3 13-14 26-28 34z" {...G} />
    <path d="M12 38L40 7M20 30l-5-1M25 24l-5-1M30 18l-5-1M35 12l-4-1" {...CUT} />
    <path d="M12 38l-6 6" {...LINE} />
  </>) },
  Treatise: { name: 'a column: "the pillar and ground of the truth"', draw: () => (<>
    <path d="M10 8h28v4c-3 0-4 2-4 4H14c0-2-1-4-4-4z" {...G} />
    <rect x={16} y={17} width={16} height={20} {...G} />
    <path d="M12 38h24v4H12z" {...G} />
    <path d="M20 19v16M24 19v16M28 19v16" {...CUT} />
  </>) },
  Essay: { name: 'an olive sprig', draw: () => (<>
    <path d="M10 40C18 30 26 18 38 8" {...LINE} />
    {leaves([[17,31,-60],[16,25,-20],[24,23,-70],[22,17,-20],[30,15,-70],[29,10,-25],[37,8,-55]], 5.2, 2.2)}
  </>) },
  Meditation: { name: 'a lily: "consider the lilies"', draw: () => (<>
    <path d="M24 44V24" {...LINE} />
    <path d="M24 26c-4-6-4-14 0-20 4 6 4 14 0 20z" {...G} />
    <path d="M23 26c-6-1-12-6-14-13 6 0 11 4 14 13z" {...G} />
    <path d="M25 26c6-1 12-6 14-13-6 0-11 4-14 13z" {...G} />
    <path d="M24 37c-4-1-8-3-10-7 4 0 8 2 10 7z" {...G} />
    <path d="M24 9v12" {...CUT} />
  </>) },
  Rule: { name: 'a beehive: an ordered life in common', draw: () => (<>
    <path d="M10 38c0-16 6-28 14-28s14 12 14 28z" {...G} />
    <path d="M8 38h32v4H8z" {...G} />
    <path d="M15.5 18h17M12.5 24h23M11 30h26" {...CUT} />
    <path d="M21 38v-4a3 3 0 0 1 6 0v4z" fill="var(--cover-mid)" />
  </>) },
  Prayer: { name: 'a candle', draw: () => (<>
    <path d="M24 3c3 4 5 7 5 9.5a5 5 0 0 1-10 0C19 10 21 7 24 3z" {...G} />
    <rect x={19} y={19} width={10} height={19} {...G} />
    <path d="M14 38h20v3H14zM18 41h12l-2 3h-8z" {...G} />
    <path d="M22 22v13" {...CUT} />
  </>) },
  Catechesis: { name: 'an ear of wheat: seed sown', draw: () => (<>
    <path d="M24 46V12" {...LINE} />
    {leaves([[20.5,34,-35],[27.5,34,35],[20.5,27,-35],[27.5,27,35],[20.5,20,-35],[27.5,20,35],[24,12,0]], 3.2, 5.2)}
    <path d="M24 7L24 2M20 11l-3-5M28 11l3-5" {...LINE} strokeWidth={1.4} />
  </>) },
  Commentary: { name: 'a vine with grapes: "I am the vine"', draw: () => (<>
    <path d="M24 6c-4 2-6 6-4 9" {...LINE} />
    <path d="M24 9c6-6 16-4 18 4-6 2-14 2-18-4z" {...G} />
    {[[18,18],[25,18],[32,18],[21.5,24],[28.5,24],[18,30],[25,30],[21.5,36],[25,42]].map(([x,y],k)=>(<circle key={k} cx={x} cy={y} r={3.6} {...G} />))}
    <path d="M28 11l9 1" {...CUT} />
  </>) },
  Exegesis: { name: 'a key: what opens the text', draw: () => (<>
    <circle cx={14} cy={24} r={9} {...G} />
    <circle cx={14} cy={24} r={3.5} fill="var(--cover-mid)" />
    <path d="M22 21.5h22v5H22z" {...G} />
    <path d="M33 26.5h4v6h-4zM39 26.5h3v4h-3z" {...G} />
  </>) },
  Dialogue: { name: 'a pomegranate: many seeds, one fruit', draw: () => (<>
    <circle cx={24} cy={27} r={15} {...G} />
    <path d="M19 13l1-6 4 4 4-4 1 6z" {...G} />
    <path d="M24 16v22M17 22c-3 4-3 10 0 14M31 22c3 4 3 10 0 14" {...CUT} />
  </>) },
  Hymn: { name: 'a harp: the psalmist’s instrument', draw: () => (<>
    <path d="M12 42L10 8c10 0 22 8 28 18l4 16z" {...G} />
    <path d="M15 12l2 26M20 13l2 25M25 15l2 23M30 18l2 20M35 23l2 15" {...CUT} />
  </>) },
  Poem: { name: 'a rose', draw: () => (<>
    <path d="M12 38c4-2 8-2 12 2-4 2-8 2-12-2zM36 38c-4-2-8-2-12 2 4 2 8 2 12-2z" {...G} />
    <circle cx={24} cy={22} r={14} {...G} />
    <path d="M24 22c3 0 4-3 2-5s-7-1-7 4 5 8 10 6 6-9 2-13M17 13c-4 4-5 11-1 15" {...CUT} />
  </>) },
  Confession: { name: 'a heart: "our heart is restless"', draw: () => (<>
    <path d="M24 42C10 32 4 24 9 15c4-7 12-6 15 0 3-6 11-7 15 0 5 9-1 17-15 27z" {...G} />
    <path d="M24 3c2 3 3 5 2 7-1-1-2-1-2 1-1-2-2-4 0-8z" {...G} />
    <path d="M13 17c1-3 4-4 6-3" {...CUT} />
  </>) },
  Hagiography: { name: 'a palm: the martyr’s branch', draw: () => (<>
    <path d="M14 45C18 32 24 18 36 4" {...LINE} />
    {[[19,34],[22,28],[25,22],[29,16],[33,10]].flatMap(([x,y],k)=>[
      <path key={`l${k}`} d={`M${x} ${y}q-7 0-11-5`} {...LINE} strokeWidth={2.6} />,
      <path key={`r${k}`} d={`M${x} ${y}q6 3 11 1`} {...LINE} strokeWidth={2.6} />,
    ])}
  </>) },
  Apology: { name: 'a tower: "a strong tower"', draw: () => (<>
    <path d="M13 44V14h4v-5h4v5h6v-5h4v5h4v30z" {...G} />
    <path d="M20 44v-8a4 4 0 0 1 8 0v8z" fill="var(--cover-mid)" />
    <path d="M24 20v6" {...CUT} strokeWidth={2.2} />
  </>) },
}

/** The traced herbal ornament where one exists (round 4), else the round-3 sketch. */
function GenreOrnament({ genre, size = 26 }: { genre: string; size?: number }) {
  const herbal = HERBAL_ORNAMENTS[genre]
  if (herbal) {
    return (
      <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" style={{ display: 'block' }}>
        <path d={herbal.d} fillRule="evenodd" fill="var(--gold-ink)" />
      </svg>
    )
  }
  const m = MOTIFS[genre]
  if (!m) return null
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" style={{ display: 'block' }}>
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
          A mark on each cover for its kind of writing, in place of the plain hairline under the title.
          Round 3: things, not signs. Round 1 varied one star (too alike); round 2 used abstract motifs
          (distinct, but modern, and the two &ldquo;voices&rdquo; too close). Following the chapter ornaments
          of an illuminated bible, each genre is now an object chosen for its meaning (a fish for sermons, a
          quill for letters, a beehive for rules), cut like a woodcut. Round 4 replaces the sketches with
          ornaments traced from real woodcuts and prints made before 1600, most from one herbal, <em>Ortus
          sanitatis</em> (Strasbourg, 1499). All seventeen are done. One recent text per genre:
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
          {shelf.map(t => (
            <Link key={t.slug} href={`/texts/${t.slug}`} style={{ textDecoration: 'none' }}>
              <div style={{ background: traditionColor(t.author?.tradition?.slug ?? null), aspectRatio: '2/3', padding: 8, display: 'flex' }}>
                <div className="flex flex-col items-center justify-center text-center" style={{ background: 'var(--cover-mid)', flex: 1, padding: '10px 8px', gap: 8 }}>
                  <p className="font-serif italic" style={{ color: 'var(--ink)', fontSize: t.title.length > 60 ? '0.72rem' : 'var(--text-sm)', lineHeight: 1.2, display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {t.title}
                  </p>
                  <GenreOrnament genre={t.genre?.name ?? ''} size={36} />
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
              <GenreOrnament genre={g} size={40} />
              <span>
                <span className="block font-serif" style={{ color: 'var(--ink)' }}>{g}</span>
                <span className="block caption" style={{ color: 'var(--ink-faint)' }}>
                  {HERBAL_ORNAMENTS[g] ? `${HERBAL_ORNAMENTS[g].name} · traced` : `${MOTIFS[g]?.name} · sketch`}
                </span>
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
