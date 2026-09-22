import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Type Comparison — The Stromata',
  robots: { index: false, follow: false },
}

/**
 * /design/type — the body-face decision, made by looking rather than arguing.
 *
 * This exists because a typeface question cannot be settled in prose. The
 * candidates here are all Renaissance-humanist serifs a paragraph apart in
 * description and quite far apart on the page, and the only honest test is the
 * same real passage, at the real reading size, on the real measure.
 *
 * Junicode WON this comparison on 22 Sep 2026 and is now the site's body face,
 * loaded from app/globals.css like any other. This page is kept as the record
 * of how the decision was made, and as the surface for the next one.
 *
 * Specimen passage: Thomas Traherne, Centuries of Meditations (First Century),
 * which is already in the corpus — a live text, not lorem ipsum, because the
 * thing being judged is how this library's own prose sits in each face.
 */

const SPECIMEN = [
  'An empty book is like an infant’s soul, in which anything may be written. It is capable of all things, but containeth nothing. I have a mind to fill this with profitable wonders. And since Love made you put it into my hands I will fill it with those Truths you love without knowing them: with those things which, if it be possible, shall shew my Love; to you in communicating most enriching Truths: to Truth in exalting her beauties in such a Soul.',
  'Do not wonder that I promise to fill it with those Truths you love but know not; for though it be a maxim in the schools that there is no Love of a thing unknown, yet I have found that things unknown have a secret influence on the soul, and like the centre of the earth unseen violently attract it. We love we know not what, and therefore everything allures us.',
]

const JUNICODE = 'var(--serif)'   // Junicode is the global body face as of 22 Sep 2026

type Candidate = {
  id: string
  name: string
  stack: string
  status: string
  note: string
  features?: string
}

const CANDIDATES: Candidate[] = [
  {
    id: 'ebgaramond',
    name: 'EB Garamond',
    stack: 'var(--serif)',
    status: 'Retired 22 Sep 2026 — was the body face',
    note:
      'Claude Garamond by way of Octavio Pardo’s revival. Warm, unobtrusive, a small x-height that wants generous leading. No smcp or onum table in the subset we ship, which is why the labels below had to fake their small caps until now.',
  },
  {
    id: 'junicode',
    name: 'Junicode 2',
    stack: JUNICODE,
    status: 'Shipping — the body face',
    note:
      'Peter Baker’s face for medievalists — the one patristic and medieval scholarship is actually set in. Larger x-height and a firmer, squarer foot than EB Garamond, so it holds a smaller size better. Carries real smcp, c2sc and onum, which no other face here does.',
  },
  {
    id: 'imfell',
    name: 'IM Fell English',
    stack: 'var(--serif-display)',
    status: 'Shipping — display only',
    note:
      'Igino Marini’s revival of the types John Fell left to Oxford in 1686, punches cut by Van Dijck and de Walpergen. Shown at body size deliberately: the revival reproduces inked letterpress impression, which is the point at display size and a liability at 1.25rem down a long column. Judge whether that is charm or noise.',
  },
]

function Section({ title, blurb, children }: { title: string; blurb?: string; children: React.ReactNode }) {
  return (
    <section className="mb-24">
      <h2
        className="font-serif italic text-2xl"
        style={{
          color: 'var(--ink)',
          borderBottom: '1px solid var(--rule)',
          paddingBottom: '0.5rem',
          marginBottom: blurb ? '1rem' : '2rem',
        }}
      >
        {title}
      </h2>
      {blurb && (
        <p
          className="font-serif"
          style={{ color: 'var(--ink-mute)', fontSize: 'var(--text-base)', maxWidth: '62ch', marginBottom: '2.5rem', lineHeight: 1.6 }}
        >
          {blurb}
        </p>
      )}
      {children}
    </section>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="kicker mb-3">{children}</p>
}

export default function TypeComparisonPage() {
  return (
    <div style={{ background: 'var(--paper)' }} className="min-h-screen">

      <main id="main-content" className="mx-auto px-6 py-20" style={{ maxWidth: 'var(--content-max)' }}>
        <p className="kicker mb-4">Internal reference</p>
        <h1 className="font-serif text-4xl mb-5" style={{ color: 'var(--ink)' }}>
          Type comparison
        </h1>
        <p
          className="font-serif"
          style={{ color: 'var(--ink-soft)', fontSize: 'var(--text-xl)', maxWidth: '58ch', lineHeight: 1.5, marginBottom: '1rem' }}
        >
          The same passage of Traherne, at the reading size and measure the site actually uses, in
          each candidate for the body face.
        </p>
        <p
          className="font-serif"
          style={{ color: 'var(--ink-mute)', fontSize: 'var(--text-base)', maxWidth: '62ch', lineHeight: 1.6, marginBottom: '5rem' }}
        >
          Read a full paragraph in each rather than scanning the specimen lines — the difference
          between two Renaissance serifs shows up in the texture of a column, not in a word.
        </p>

        {/* ── The body test ─────────────────────────────────────────── */}
        <Section
          title="The body test"
          blurb="Set at var(--text-prose) on var(--reading-measure) — the same values as a text page, so this is what a reader would get."
        >
          {CANDIDATES.map((c) => (
            <div key={c.id} className="mb-20">
              <div className="flex items-baseline gap-4 flex-wrap mb-1">
                <h3 className="font-serif text-2xl" style={{ color: 'var(--ink)' }}>
                  {c.name}
                </h3>
                <span className="kicker">{c.status}</span>
              </div>
              <p
                className="font-serif"
                style={{ color: 'var(--ink-mute)', fontSize: 'var(--text-sm)', maxWidth: '62ch', lineHeight: 1.6, marginBottom: '1.75rem' }}
              >
                {c.note}
              </p>
              <div style={{ maxWidth: 'var(--reading-measure)', borderLeft: '2px solid var(--rule-soft)', paddingLeft: '2rem' }}>
                {SPECIMEN.map((para, i) => (
                  <p
                    key={i}
                    style={{
                      fontFamily: c.stack,
                      fontSize: 'var(--text-prose)',
                      lineHeight: 1.7,
                      color: 'var(--ink)',
                      marginBottom: i === SPECIMEN.length - 1 ? 0 : '1.25rem',
                    }}
                  >
                    {para}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </Section>

        {/* ── Display ───────────────────────────────────────────────── */}
        <Section
          title="At display size"
          blurb="A text title at var(--text-display). IM Fell earns its keep here in a way it may not in a column."
        >
          {CANDIDATES.map((c) => (
            <div key={c.id} className="mb-10">
              <Label>{c.name}</Label>
              <p style={{ fontFamily: c.stack, fontSize: 'var(--text-display)', lineHeight: 1.1, color: 'var(--ink)' }}>
                Centuries of Meditations
              </p>
              <p style={{ fontFamily: c.stack, fontStyle: 'italic', fontSize: 'var(--text-xl)', color: 'var(--ink-soft)', marginTop: '0.5rem' }}>
                Thomas Traherne, c. 1670
              </p>
            </div>
          ))}
          <p className="font-serif" style={{ color: 'var(--ink-faint)', fontSize: 'var(--text-sm)', maxWidth: '62ch', lineHeight: 1.6 }}>
            Note: no italic woff2 is loaded for IM Fell English, so its second line is a synthetic
            oblique — a slanted roman, not a drawn italic. That is a real cost of keeping it as the
            display face, and one reason the italic line above looks weaker than the others.
          </p>
        </Section>

        {/* ── Small caps ────────────────────────────────────────────── */}
        <Section
          title="Small caps — the label problem"
          blurb="Letterspaced full capitals are what you reach for when your face has no small caps. Three ways to set the same label, worst to best."
        >
          <div style={{ display: 'grid', gap: '2.5rem' }}>
            <div>
              <Label>Was: EB Garamond, uppercase, 0.18em tracking</Label>
              <p
                style={{
                  fontFamily: 'var(--serif)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.18em',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--ink-faint)',
                }}
              >
                Texts through the year
              </p>
            </div>

            <div>
              <Label>Synthetic small caps — what font-variant-caps gives a face with no smcp</Label>
              <p
                style={{
                  fontFamily: 'var(--serif)',
                  fontVariantCaps: 'small-caps',
                  letterSpacing: '0.08em',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--ink-faint)',
                }}
              >
                Texts through the year
              </p>
              <p className="font-serif" style={{ color: 'var(--ink-faint)', fontSize: 'var(--text-sm)', maxWidth: '62ch', marginTop: '0.5rem', lineHeight: 1.6 }}>
                The browser scales the capitals down. Stems come out too light against the
                lowercase around them — the giveaway is the thin, spindly look at small size.
              </p>
            </div>

            <div>
              <Label>Retired: IM Fell English SC — a separate 56 KB companion family, no longer needed</Label>
              <p style={{ fontFamily: 'var(--serif-smallcaps)', letterSpacing: '0.08em', fontSize: 'var(--text-sm)', color: 'var(--ink-faint)' }}>
                Texts through the year
              </p>
            </div>

            <div>
              <Label>Now: Junicode’s own smcp — same family as the body text, no extra font file</Label>
              <p
                style={{
                  fontFamily: JUNICODE,
                  fontFeatureSettings: '"smcp" 1',
                  letterSpacing: '0.08em',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--ink-faint)',
                }}
              >
                Texts through the year
              </p>
              <p className="font-serif" style={{ color: 'var(--ink-faint)', fontSize: 'var(--text-sm)', maxWidth: '62ch', marginTop: '0.5rem', lineHeight: 1.6 }}>
                This is what the decision turned on. Junicode as the body face made the separate
                56 KB IM Fell English SC file redundant, because the small caps come from a
                family the page is already loading.
              </p>
            </div>
          </div>
        </Section>

        {/* ── Small-caps size ───────────────────────────────────────── */}
        <Section
          title="How big should a small-cap label be?"
          blurb="Small caps are drawn at roughly x-height, not cap height — measured on this subset, they top out at 0.686 of a capital. A label converted from capitals to small caps therefore loses 31% of its apparent height unless the font-size goes up. This ladder is the knob. Rows are scale steps, not arbitrary values — a scale with a bespoke step in it is not a scale, and an earlier cut of this used 0.95rem and quietly broke that."
        >
          <div style={{ maxWidth: 'var(--reading-measure)' }}>
            <div className="flex items-baseline gap-4 py-3" style={{ borderBottom: '1px solid var(--rule)' }}>
              <span className="font-mono" style={{ width: '7rem', fontSize: 'var(--text-sm)', color: 'var(--ink-mute)' }}>was</span>
              <span
                style={{
                  fontFamily: 'var(--serif)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.18em',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--ink-faint)',
                  flex: 1,
                }}
              >
                Start with
              </span>
              <span className="font-mono" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-faint)' }}>0.8rem caps</span>
            </div>

            {[
              ['0.8rem', '--text-sm'],
              ['0.875rem', '--text-label'],
              ['1rem', '--text-base — current'],
              ['1.25rem', '--text-prose'],
              ['1.167rem', 'off-scale; matches old cap height exactly'],
            ].map(([size, note]) => (
              <div key={size} className="flex items-baseline gap-4 py-3" style={{ borderBottom: '1px solid var(--rule-soft)' }}>
                <span className="font-mono" style={{ width: '7rem', fontSize: 'var(--text-sm)', color: 'var(--ink-mute)' }}>
                  {size}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--serif-smallcaps)',
                    fontFeatureSettings: '"smcp" 1',
                    letterSpacing: '0.08em',
                    fontSize: size,
                    color: 'var(--ink-faint)',
                    flex: 1,
                  }}
                >
                  Start with
                </span>
                <span className="font-mono" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-faint)', width: '18rem', textAlign: 'right' }}>
                  {note}
                </span>
              </div>
            ))}
          </div>

          <p className="font-serif" style={{ color: 'var(--ink-mute)', fontSize: 'var(--text-base)', maxWidth: '62ch', lineHeight: 1.6, marginTop: '2rem' }}>
            A caution the ladder cannot show. Small caps are a form for SHORT labels — two to five
            words. The homepage subtitle, “A library of public-domain Christian texts, edited for
            legibility”, is a nine-word sentence set as a label, and no size setting fixes that: a
            sentence in small caps is slower to read than the same sentence in italic, because the
            forms carry no ascenders or descenders to give the eye word-shapes. It was equally true
            when the line was letterspaced capitals. Worth deciding separately from the size.
          </p>
        </Section>

        {/* ── Figures ───────────────────────────────────────────────── */}
        <Section
          title="Figures — lining against oldstyle"
          blurb="Dates and reading times run through this site constantly. Lining figures are all cap-height and punch holes in a line of prose; oldstyle figures have ascenders and descenders and sit in it."
        >
          <div style={{ display: 'grid', gap: '2rem', maxWidth: 'var(--reading-measure)' }}>
            <div>
              <Label>EB Garamond — lining (no onum available)</Label>
              <p style={{ fontFamily: 'var(--serif)', fontSize: 'var(--text-prose)', color: 'var(--ink)' }}>
                Written c. 1670, first printed in 1908 — 23 min read.
              </p>
            </div>
            <div>
              <Label>Junicode — oldstyle via onum</Label>
              <p style={{ fontFamily: JUNICODE, fontFeatureSettings: '"onum" 1', fontSize: 'var(--text-prose)', color: 'var(--ink)' }}>
                Written c. 1670, first printed in 1908 — 23 min read.
              </p>
            </div>
          </div>
        </Section>

        {/* ── Cost ──────────────────────────────────────────────────── */}
        <Section
          title="What each would cost to ship"
          blurb="Measured, not estimated. Junicode ships upstream as a 978 KB variable font carrying the full MUFI medieval character set; the figure below is after pinning the width and ENLA axes, instancing to weight 400, and subsetting to Latin with smcp / c2sc / onum retained."
        >
          <div style={{ maxWidth: 'var(--reading-measure)' }}>
            {[
              ['EB Garamond Regular', '21 KB', 'Shipping'],
              ['EB Garamond Italic', '22 KB', 'Shipping'],
              ['IM Fell English Regular', '58 KB', 'Shipping — display only'],
              ['IM Fell English SC', '56 KB', 'Added in this branch'],
              ['Junicode Regular (subset)', '33 KB', 'Candidate'],
              ['Junicode Italic (subset)', '36 KB', 'Candidate'],
              ['Junicode VF Roman (upstream, unsubsetted)', '978 KB', 'Never ship this'],
            ].map(([name, size, status]) => (
              <div
                key={name}
                className="flex items-baseline gap-4 py-3"
                style={{ borderBottom: '1px solid var(--rule-soft)' }}
              >
                <span className="font-serif" style={{ color: 'var(--ink)', fontSize: 'var(--text-base)', flex: 1 }}>
                  {name}
                </span>
                <span className="font-mono" style={{ color: 'var(--ink-soft)', fontSize: 'var(--text-sm)', width: '6rem', textAlign: 'right' }}>
                  {size}
                </span>
                <span className="kicker" style={{ width: '13rem', textAlign: 'right' }}>
                  {status}
                </span>
              </div>
            ))}
          </div>
          <p className="font-serif" style={{ color: 'var(--ink-mute)', fontSize: 'var(--text-base)', maxWidth: '62ch', lineHeight: 1.6, marginTop: '2rem' }}>
            Swapping EB Garamond for Junicode costs about 26 KB across roman and italic, and returns
            the 56 KB small-caps file. On that arithmetic the decision is a matter of taste, not
            budget — which is the point of this page.
          </p>
        </Section>

        <p className="font-serif" style={{ color: 'var(--ink-faint)', fontSize: 'var(--text-sm)', borderTop: '1px solid var(--rule)', paddingTop: '1.5rem' }}>
          Junicode is by Peter S. Baker, licensed OFL 1.1. IM Fell types are Igino Marini’s revival,
          freely licensed. EB Garamond is Georg Duffner and Octavio Pardo’s, OFL 1.1.
        </p>
      </main>
    </div>
  )
}
