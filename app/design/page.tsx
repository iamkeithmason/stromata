import type { Metadata } from 'next'
import { BookCover } from '@/app/components/BookCover'
import { LancetArch } from '@/app/components/LancetArch'
import { ColourSwatch } from './LiveToken'

export const metadata: Metadata = {
  title: 'Design Reference — The Stromata',
  robots: { index: false, follow: false },
}

// Self-contained placeholder portrait (no external dependency) used only to
// demonstrate how a real author photo clips into the LancetArch opening.
const DEMO_PORTRAIT =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="280" viewBox="0 0 200 280">' +
      '<rect width="200" height="280" fill="#6b5b3e"/>' +
      '<circle cx="100" cy="104" r="50" fill="#d8c39a"/>' +
      '<path d="M32 280 C32 206 168 206 168 280 Z" fill="#c9b487"/>' +
      '</svg>',
  )

// ── Helpers ────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-20">
      <h2
        className="font-serif italic text-2xl mb-2"
        style={{ color: 'var(--ink)', borderBottom: '1px solid var(--rule)', paddingBottom: '0.5rem', marginBottom: '2rem' }}
      >
        {title}
      </h2>
      {children}
    </section>
  )
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-10">
      <p className="kicker mb-4">{title}</p>
      {children}
    </div>
  )
}

function TokenRow({ name, value, children }: { name: string; value: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 py-2" style={{ borderBottom: '1px solid var(--rule-soft)' }}>
      <code className="font-mono shrink-0" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-mute)', width: '18rem' }}>
        {name}
      </code>
      <code className="font-mono shrink-0" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-faint)', width: '7rem' }}>
        {value}
      </code>
      {children}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function DesignPage() {
  return (
    <div style={{ background: 'var(--paper)', minHeight: '100vh', paddingTop: '4rem' }}>
      <div className="content-shell py-16">

        {/* Header */}
        <div className="mb-16">
          <p className="kicker-gold mb-3">Internal reference</p>
          <h1 className="font-serif text-4xl mb-3" style={{ color: 'var(--ink)' }}>Design System</h1>
          <p className="font-serif" style={{ fontSize: 'var(--text-label)', color: 'var(--ink-mute)', maxWidth: '50ch' }}>
            Design tokens, typography, CSS classes, and components used across The Stromata.
            Not indexed by search engines.
          </p>
        </div>

        {/* ── 1. Colour Tokens ─────────────────────────────────────────── */}
        <Section title="Colour tokens">

          <p className="font-serif mb-8" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-faint)', maxWidth: '60ch' }}>
            Every value below is read live from the computed CSS custom property, so this
            page cannot drift from <code className="font-mono">globals.css</code>. Add or change
            a token there and the swatch here follows.
          </p>

          <SubSection title="Paper & ground">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <ColourSwatch token="--paper" label="Primary background" />
              <ColourSwatch token="--paper-deep" label="Inset / deeper" />
              <ColourSwatch token="--paper-edge" label="Borders, card edges" />
              <ColourSwatch token="--vellum" label="Lifted surfaces" />
            </div>
          </SubSection>

          <SubSection title="Ink">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <ColourSwatch token="--ink" label="Primary text" />
              <ColourSwatch token="--ink-soft" label="Slightly softened" />
              <ColourSwatch token="--ink-mute" label="Secondary text (AA)" />
              <ColourSwatch token="--ink-faint" label="Tertiary / labels (AA)" />
            </div>
          </SubSection>

          <SubSection title="Gold">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <ColourSwatch token="--gold" label="Accent, rules, large glyphs" />
              <ColourSwatch token="--gold-ink" label="Gold TEXT (AA)" />
              <ColourSwatch token="--gold-rule" label="Hairline rules" />
              <ColourSwatch token="--gold-border" label="Keyline (rest)" />
              <ColourSwatch token="--gold-border-strong" label="Keyline (hover/focus)" />
            </div>
          </SubSection>

          <SubSection title="Rules & structure">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <ColourSwatch token="--rule" label="Standard borders" />
              <ColourSwatch token="--rule-soft" label="Soft dividers" />
              <ColourSwatch token="--accent" label="Accent blue" />
              <ColourSwatch token="--accent-soft" label="Soft accent" />
            </div>
          </SubSection>

          <SubSection title="Dark & highlights">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <ColourSwatch token="--dark" label="Footer ground" />
              <ColourSwatch token="--dark-surface" label="Lifted dark" />
              <ColourSwatch token="--hero-ground" label="Frontispiece hero (stable)" />
              <ColourSwatch token="--highlight" label="Yellow highlight" />
              <ColourSwatch token="--highlight-2" label="Green highlight" />
              <ColourSwatch token="--highlight-3" label="Pink highlight" />
            </div>
          </SubSection>

          <SubSection title="Reversed-out — cream text/rules on a dark or liturgical ground">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <ColourSwatch token="--on-dark" backdrop="--season-trinitytide" label="Primary reversed heading" />
              <ColourSwatch token="--on-dark-body" backdrop="--season-trinitytide" label="Reversed body" />
              <ColourSwatch token="--on-dark-soft" backdrop="--season-trinitytide" label="Reversed labels, marks" />
              <ColourSwatch token="--on-dark-mute" backdrop="--season-trinitytide" label="Reversed metadata / dim" />
              <ColourSwatch token="--on-dark-border" backdrop="--season-trinitytide" label="Reversed border" />
              <ColourSwatch token="--on-dark-rule" backdrop="--season-trinitytide" label="Reversed hairline" />
              <ColourSwatch token="--on-dark-gold" backdrop="--season-trinitytide" label="Reversed gold" />
              <ColourSwatch token="--on-dark-gold-soft" backdrop="--season-trinitytide" label="Reversed gold, faint" />
              <ColourSwatch token="--cover-mid" label="Book-cover inner panel" />
            </div>
          </SubSection>

          <SubSection title="Liturgical season grounds">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <ColourSwatch token="--season-advent-lent" label="Advent / Lent (violet)" />
              <ColourSwatch token="--season-eastertide" label="Eastertide (gold-ochre)" />
              <ColourSwatch token="--season-trinitytide" label="Trinitytide (green) — current" />
              <ColourSwatch token="--season-feast" label="Feast days (dark ochre)" />
            </div>
          </SubSection>
        </Section>

        {/* ── 2. Type scale ─────────────────────────────────────────────── */}
        <Section title="Type scale">
          <div className="mb-8">
            {[
              { token: '--text-sm',      value: '0.8rem',   label: 'Chip/tag text, smallest labels, captions, card metadata, TOC' },
              { token: '--text-label',   value: '0.875rem', label: 'Footer links, CTA links, search results' },
              { token: '--text-base',    value: '1rem',     label: 'Author names, dates, body text, most UI text' },
              { token: '--text-prose',   value: '1.25rem',  label: 'Long-form reading body' },
              { token: '--text-xl',      value: '1.5rem',   label: 'Seasonal panel, prominent links' },
              { token: '--text-display', value: '3rem',     label: 'Text reader title heading' },
              { token: '--text-hero',    value: 'clamp(2.75rem, 5vw, 4rem)', label: 'Frontispiece hero title (text reader)' },
            ].map(({ token, value, label }) => (
              <TokenRow key={token} name={token} value={value}>
                <span
                  className="font-serif flex-1"
                  style={{ fontSize: `var(${token})`, color: 'var(--ink)', lineHeight: 1.4 }}
                >
                  The works of the ages
                </span>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-faint)', maxWidth: '20ch', textAlign: 'right' }}>
                  {label}
                </span>
              </TokenRow>
            ))}
          </div>

          <SubSection title="Responsive / clamped sizes (homepage exceptions)">
            <div className="space-y-3">
              {[
                { label: 'Hero title', value: 'clamp(2.5rem, 6vw, 4rem)', style: { fontFamily: 'var(--serif-display)', fontSize: 'clamp(2.5rem, 6vw, 4rem)', color: 'var(--ink)' } },
                { label: 'Hero subtitle', value: 'clamp(1.1rem, 2.5vw, 1.4rem)', style: { fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 'clamp(1.1rem, 2.5vw, 1.4rem)', color: 'var(--ink-soft)' } },
                { label: 'SeasonalPanel season name', value: 'clamp(2.25rem, 5vw, 3.25rem)', style: { fontFamily: 'var(--serif-cormorant)', fontStyle: 'italic', fontSize: 'clamp(2.25rem, 5vw, 3.25rem)', color: 'var(--ink)' } },
              ].map(({ label, value, style }) => (
                <div key={label} className="py-2" style={{ borderBottom: '1px solid var(--rule-soft)' }}>
                  <div className="flex gap-4 mb-1 items-center">
                    <code className="font-mono" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-mute)', minWidth: '14rem' }}>{label}</code>
                    <code className="font-mono" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-faint)' }}>{value}</code>
                  </div>
                  <p style={style}>The Stromata</p>
                </div>
              ))}
            </div>
          </SubSection>
        </Section>

        {/* ── 3. Font families ──────────────────────────────────────────── */}
        <Section title="Font families">
          {[
            { token: '--serif', family: 'EB Garamond', role: 'Body text, labels, kickers', sample: 'The works of John Chrysostom, c. 407' },
            { token: '--serif-display', family: 'IM Fell English', role: 'Page titles, decorative headings (roman only — no italic woff2 loaded)', sample: 'On the Priesthood' },
            { token: '--serif-cormorant', family: 'Cormorant Garamond', role: 'Search bar, season name, lead titles', sample: 'Trinitytide — the long green season' },
          ].map(({ token, family, role, sample }) => (
            <div key={token} className="py-5" style={{ borderBottom: '1px solid var(--rule-soft)' }}>
              <div className="flex gap-8 items-baseline mb-2 flex-wrap">
                <code className="font-mono" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-mute)' }}>{token}</code>
                <span className="kicker">{family}</span>
              </div>
              <p style={{ fontFamily: `var(${token})`, fontSize: 'var(--text-xl)', color: 'var(--ink)', lineHeight: 1.3 }}>
                {sample}
              </p>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-faint)', marginTop: '0.4rem' }}>{role}</p>
            </div>
          ))}
        </Section>

        {/* ── 4. CSS classes ────────────────────────────────────────────── */}
        <Section title="Semantic CSS classes">

          <SubSection title="Kicker variants">
            <div className="space-y-4">
              <div className="py-3 flex items-center gap-8" style={{ borderBottom: '1px solid var(--rule-soft)' }}>
                <code className="font-mono shrink-0" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-mute)', width: '10rem' }}>.kicker</code>
                <span className="kicker">Featured authors</span>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-faint)' }}>0.8rem · uppercase · 0.18em tracking · --ink-faint · Used for: section labels, nav chips, metadata</span>
              </div>
              <div className="py-3 flex items-center gap-8" style={{ borderBottom: '1px solid var(--rule-soft)' }}>
                <code className="font-mono shrink-0" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-mute)', width: '10rem' }}>.kicker-gold</code>
                <span className="kicker-gold">New collection</span>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-faint)' }}>Same as .kicker · --gold · Used for: editorial labels, seasonal panel labels</span>
              </div>
            </div>
          </SubSection>

          <SubSection title="Caption">
            <div className="py-3 flex items-center gap-8" style={{ borderBottom: '1px solid var(--rule-soft)' }}>
              <code className="font-mono shrink-0" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-mute)', width: '10rem' }}>.caption</code>
              <span className="caption">~ 20 min · 6 books · Finished</span>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-faint)' }}>0.8rem · 0.12em tracking · --ink-mute · Used for: card metadata, reading progress</span>
            </div>
          </SubSection>

          <SubSection title="Rules">
            <div className="space-y-6">
              <div>
                <div className="flex items-center gap-4 mb-2">
                  <code className="font-mono" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-mute)' }}>.rule-gold</code>
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-faint)' }}>1px solid --gold-rule · Section dividers beneath headers</span>
                </div>
                <hr className="rule-gold" />
              </div>
              <div>
                <div className="flex items-center gap-4 mb-2">
                  <code className="font-mono" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-mute)' }}>.rule-muted</code>
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-faint)' }}>1px solid --rule · General dividers</span>
                </div>
                <hr className="rule-muted" />
              </div>
            </div>
          </SubSection>

          <SubSection title="Section header pattern">
            <div className="max-w-lg">
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="font-serif italic text-xl" style={{ color: 'var(--ink)' }}>Recently added</h2>
                <span className="kicker">All texts →</span>
              </div>
              <hr className="rule-gold" />
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-faint)', marginTop: '0.75rem' }}>
                Composed from: font-serif italic text-xl · .kicker aside · .rule-gold
              </p>
            </div>
          </SubSection>
        </Section>

        {/* ── 5. Component gallery ──────────────────────────────────────── */}
        <Section title="Component gallery">

          <SubSection title="BookCover — colour by tradition">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
              {[
                { title: 'On the Priesthood', authorName: 'John Chrysostom', deathYear: 407, accessionNumber: 99, traditionSlug: 'patristic', index: 0 },
                { title: 'Of Good Marriage', authorName: 'Augustine of Hippo', deathYear: 430, accessionNumber: 83, traditionSlug: 'patristic', index: 1 },
                { title: 'The Golden Grove', authorName: 'Jeremy Taylor', deathYear: 1667, accessionNumber: 84, traditionSlug: 'anglican', index: 2 },
                { title: 'Against Marcion', authorName: 'Tertullian', deathYear: 240, accessionNumber: 93, traditionSlug: null, index: 3 },
              ].map((props, i) => (
                <div key={i}>
                  <BookCover {...props} />
                  <p className="caption mt-2">{props.traditionSlug ?? 'no tradition'}</p>
                </div>
              ))}
            </div>
          </SubSection>

          <SubSection title="LancetArch — featured author arches">
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-6">
              {['A', 'B', 'J', 'T', 'C', '§'].map(initial => (
                <div key={initial} style={{ maxWidth: 100, aspectRatio: '200 / 380' }}>
                  <LancetArch initial={initial} label={`Initial ${initial}`} />
                </div>
              ))}
            </div>
            {/* With a portrait: the photo is clipped to the arch, the gold
                keyline framing it. Self-contained placeholder image. */}
            <p className="mt-6 mb-2 text-sm" style={{ color: 'var(--ink-mute)' }}>
              With an author portrait (initial fallback shown last):
            </p>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-6">
              {[DEMO_PORTRAIT, DEMO_PORTRAIT, null].map((src, i) => (
                <div key={i} style={{ maxWidth: 100, aspectRatio: '200 / 380' }}>
                  <LancetArch initial="P" label="Portrait demo" imageUrl={src} />
                </div>
              ))}
            </div>
          </SubSection>

          <SubSection title="Theme chip">
            <div className="flex flex-wrap gap-2">
              {['Prayer', 'Humility', 'Scripture', 'Sacraments', 'Eschatology', 'Conscience'].map(theme => (
                <span
                  key={theme}
                  style={{
                    color: 'var(--ink-mute)',
                    border: '1px solid var(--rule)',
                    fontFamily: 'var(--serif)',
                    fontSize: 'var(--text-sm)',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    padding: '3px 10px',
                  }}
                >
                  {theme}
                </span>
              ))}
            </div>
          </SubSection>

          <SubSection title="Tradition label (FeaturedAuthors / author page)">
            <div className="flex gap-6 flex-wrap">
              {['Patristic', 'Anglican', 'Roman Catholic', 'Reformed', 'Lutheran'].map(t => (
                <span
                  key={t}
                  style={{
                    fontSize: 'var(--text-sm)',
                    letterSpacing: '0.15em',
                    textTransform: 'uppercase',
                    color: 'var(--gold)',
                    fontFamily: 'var(--serif)',
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
          </SubSection>

          <SubSection title="Lead entry primitives">
            <div className="max-w-md space-y-2">
              <p className="kicker-gold">New collection</p>
              <h3
                className="font-cormorant italic"
                style={{ fontSize: 'clamp(1.4rem, 3vw, 2rem)', fontWeight: 400, lineHeight: 1.2, color: 'var(--ink)' }}
              >
                On the Priesthood
              </h3>
              <p className="font-serif" style={{ fontSize: 'var(--text-base)', color: 'var(--ink)' }}>
                John Chrysostom <span style={{ color: 'var(--ink-mute)' }}>· c. 407</span>
              </p>
              <p className="font-serif" style={{ fontSize: 'var(--text-base)', lineHeight: 1.65, color: 'var(--ink-soft)', maxWidth: '52ch' }}>
                Six dialogues on the nature and burden of pastoral ministry, written c. 390.
              </p>
              <div className="flex items-center gap-3 pt-1">
                <span style={{ fontFamily: 'var(--serif)', fontSize: 'var(--text-label)', color: 'var(--gold)', borderBottom: '1px solid var(--gold-rule)', paddingBottom: '1px' }}>
                  Browse collection →
                </span>
                <span className="caption">6 books</span>
              </div>
            </div>
          </SubSection>

        </Section>

      </div>
    </div>
  )
}
