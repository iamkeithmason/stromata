import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Sans Comparison — The Stromata',
  robots: { index: false, follow: false },
}

/**
 * /design/sans — the UI-furniture face, chosen by looking.
 *
 * The Distinctive Visual Identity epic plans a sans for furniture (navigation,
 * filters, chips, metadata) so that the serif comes to mean "this is a text".
 * The choice of face is Keith's; this page is the comparison surface the epic's
 * card asks for: the same header, filters, list row and edition note set in
 * each candidate, beside the same Junicode paragraph, with everything else held
 * constant. The first column is today's all-serif furniture, as the control.
 *
 * Candidates load from Google Fonts for this page only; the winner would be
 * self-hosted and subset like the existing faces.
 */

type Candidate = { id: string; name: string; stack: string; note: string }

const CANDIDATES: Candidate[] = [
  {
    id: 'serif',
    name: 'Today: Junicode throughout',
    stack: 'var(--serif)',
    note: 'The control. Furniture and text share one face, so nothing tells the reader which is which.',
  },
  {
    id: 'source',
    name: 'Source Sans 3',
    stack: '"Source Sans 3", system-ui, sans-serif',
    note: 'Humanist, drawn after News Gothic and Franklin. Quiet and open; recedes behind a Renaissance serif.',
  },
  {
    id: 'alegreya',
    name: 'Alegreya Sans',
    stack: '"Alegreya Sans", system-ui, sans-serif',
    note: 'Calligraphic humanist, made as the partner of a book serif. Warmest of the set; closest in spirit to Junicode.',
  },
  {
    id: 'work',
    name: 'Work Sans',
    stack: '"Work Sans", system-ui, sans-serif',
    note: 'From your card’s bookmarks. Grotesque roots, wider and more modern; the clearest contrast, and the riskiest.',
  },
  {
    id: 'mono',
    name: 'Courier Prime',
    stack: '"Courier Prime", ui-monospace, monospace',
    note: 'From your card’s bookmarks. A typewriter voice for the catalogue, like a library card; the accession label already leans this way.',
  },
]

const FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600&family=Alegreya+Sans:wght@400;500&family=Work+Sans:wght@400;500&family=Courier+Prime&display=swap'

const FILTERS = ['Patristic', 'Reformed', 'Anglican', 'Lutheran', 'Roman Catholic']

function Specimen({ c }: { c: Candidate }) {
  const ui = { fontFamily: c.stack }
  return (
    <section
      className="flex flex-col gap-5 p-5"
      style={{ background: 'var(--vellum)', border: '1px solid var(--rule)' }}
      aria-labelledby={`sans-${c.id}`}
    >
      <div>
        <h2 id={`sans-${c.id}`} className="font-serif italic" style={{ fontSize: 'var(--text-xl)', color: 'var(--ink)' }}>
          {c.name}
        </h2>
        <p style={{ ...ui, fontSize: 'var(--text-label)', color: 'var(--ink-mute)', marginTop: '0.25rem' }}>{c.note}</p>
      </div>

      {/* Site header: the wordmark stays in its own face; only the furniture changes. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pb-3" style={{ borderBottom: '1px solid var(--rule)' }}>
        <span style={{ fontFamily: 'var(--serif-display)', letterSpacing: '0.3em', color: 'var(--ink)' }}>STROMATA</span>
        <nav className="flex gap-4" style={{ ...ui, fontSize: 'var(--text-label)', color: 'var(--ink-soft)' }}>
          <span>Authors</span><span>Library</span><span>About</span>
        </nav>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f, i) => (
          <span
            key={f}
            style={{
              ...ui,
              fontSize: 'var(--text-sm)',
              padding: '2px 8px',
              border: `1px solid ${i === 1 ? 'var(--gold)' : 'var(--rule)'}`,
              color: i === 1 ? 'var(--ink)' : 'var(--ink-mute)',
            }}
          >
            {f}
          </span>
        ))}
      </div>

      {/* A library list row: the title is the text speaking, so it stays serif. */}
      <div className="flex items-start justify-between gap-4 py-3" style={{ borderTop: '1px solid var(--rule-soft)', borderBottom: '1px solid var(--rule-soft)' }}>
        <div className="min-w-0">
          <span className="font-serif" style={{ color: 'var(--ink)' }}>Address on Vainglory and How to Bring Up Children</span>
          <div style={{ ...ui, fontSize: 'var(--text-sm)', color: 'var(--ink-faint)', marginTop: '0.2rem' }}>
            John Chrysostom · Humility · Vocation · approx. 65 min read
          </div>
        </div>
        <span style={{ ...ui, fontSize: 'var(--text-sm)', color: 'var(--ink-faint)' }}>Sermon</span>
      </div>

      {/* The text itself, which never changes face. */}
      <p className="font-serif" style={{ fontSize: 'var(--text-prose)', lineHeight: 1.8, color: 'var(--reader-text)' }}>
        It is my practice, my lord, to refer to you all matters concerning which I am in doubt. For who can better
        give guidance to my hesitation or inform my ignorance?
      </p>

      {/* Edition note in the rail. */}
      <div style={{ ...ui, fontSize: 'var(--text-sm)', lineHeight: 1.5, color: 'var(--ink-mute)' }}>
        <p style={{ color: 'var(--ink-soft)', marginBottom: '0.3rem' }}>About this edition</p>
        <p>Melmoth/Bosanquet translation (revised), via Georgetown University’s Forum Romanum. Source: archive.org ↗</p>
      </div>
    </section>
  )
}

export default function SansComparisonPage() {
  return (
    <main className="content-shell py-12">
      <link rel="stylesheet" href={FONTS_HREF} precedence="default" />
      <p className="kicker">Design · noindex</p>
      <h1 className="font-serif italic mt-2" style={{ fontSize: 'var(--text-display)', color: 'var(--ink)' }}>
        A sans for the furniture
      </h1>
      <p className="font-serif mt-3" style={{ maxWidth: '42rem', color: 'var(--ink-soft)' }}>
        The same header, filters, list row and edition note in each candidate, beside the same paragraph of Pliny in
        Junicode. Titles and the text stay serif in every column; only the furniture changes. Judge which split reads
        as deliberate rather than as a mistake.
      </p>
      <div className="grid gap-6 mt-10 md:grid-cols-2 xl:grid-cols-3">
        {CANDIDATES.map(c => (
          <Specimen key={c.id} c={c} />
        ))}
      </div>
    </main>
  )
}
