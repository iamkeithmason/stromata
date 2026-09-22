import Link from 'next/link'
import type { Metadata } from 'next'
import { SiteHeader } from '@/app/components/SiteHeader'

export const metadata: Metadata = {
  title: 'Colophon — The Stromata',
  description:
    'The types, the page, and the editorial method behind The Stromata — what the site is set in, and how its texts are sourced and checked.',
  alternates: { canonical: '/colophon' },
}

/**
 * /colophon — the printer's note at the end of the book.
 *
 * This page exists for a specific reason. A reader's first judgement of a
 * digital library is whether anyone actually chose anything, and the honest
 * answer here is yes — but nothing on the site said so, which left the
 * typography to be read as a default rather than a decision. A colophon is
 * the traditional and correct place to say it, and it costs nothing but
 * accuracy: every claim below is checkable against the type and the texts.
 */

function Rule() {
  return <hr style={{ border: 0, borderTop: '1px solid var(--rule)', margin: '4rem 0 2.5rem' }} />
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-serif text-2xl" style={{ color: 'var(--ink)', marginBottom: '1.5rem' }}>
      {children}
    </h2>
  )
}

function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="font-serif"
      style={{ color: 'var(--ink)', fontSize: 'var(--text-base)', lineHeight: 1.85, display: 'grid', gap: '1.5rem' }}
    >
      {children}
    </div>
  )
}

/** One entry in the type list — the face, where it is used, and its history. */
function TypeEntry({
  name,
  stack,
  role,
  children,
}: {
  name: string
  stack: string
  role: string
  children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: '3rem' }}>
      <p style={{ fontFamily: stack, fontSize: '2.25rem', lineHeight: 1.15, color: 'var(--ink)', marginBottom: '0.35rem' }}>
        {name}
      </p>
      <p className="kicker" style={{ marginBottom: '1rem' }}>{role}</p>
      <div
        className="font-serif"
        style={{ color: 'var(--ink-soft)', fontSize: 'var(--text-base)', lineHeight: 1.8, display: 'grid', gap: '1rem' }}
      >
        {children}
      </div>
    </div>
  )
}

export default function ColophonPage() {
  return (
    <div style={{ background: 'var(--paper)', paddingTop: '4rem' }} className="min-h-screen">
      <SiteHeader breadcrumb="Colophon" />

      <main id="main-content" className="max-w-2xl mx-auto px-6 py-16">
        <p className="kicker" style={{ marginBottom: '1rem' }}>Colophon</p>

        <h1 className="font-serif text-4xl" style={{ color: 'var(--ink)', marginBottom: '1.5rem' }}>
          How this is set and made
        </h1>

        <p
          className="font-serif"
          style={{ color: 'var(--ink-soft)', fontStyle: 'italic', fontSize: 'var(--text-xl)', lineHeight: 1.5, marginBottom: '1.5rem' }}
        >
          A colophon is the note a printer leaves at the end of a book, recording who set it, in
          what type, and by what method.
        </p>

        <Prose>
          <p>
            The convention is worth keeping. A library that presents other people&rsquo;s words owes
            its readers an account of the hands those words passed through on the way — which
            edition, which translator, which scan, and what was changed. That account is kept on
            each text, under its provenance note. This page records the rest: the type the site is
            set in, the reasoning behind the page itself, and the editorial method.
          </p>
        </Prose>

        <Rule />
        <Heading>The type</Heading>

        <Prose>
          <p>
            Three faces, each doing one job. All three are freely licensed, self-hosted rather than
            loaded from a font service, and chosen because they belong to the same tradition as the
            texts.
          </p>
        </Prose>

        <div style={{ marginTop: '2.5rem' }}>
          <TypeEntry name="IM Fell English" stack="var(--serif-display)" role="Titles and the wordmark">
            <p>
              In 1686 John Fell, Bishop of Oxford and the man who built the University&rsquo;s
              learned press, left it his collection of punches and matrices. He had bought them in
              Holland and Germany in the 1670s; the larger sizes were cut for him by his own
              punchcutter, Peter de Walpergen, and others came from the Dutch cutter Christoffel van
              Dijck. They were among the first old-style types cast in England, and Oxford has them
              still.
            </p>
            <p>
              The digital revival is Igino Marini&rsquo;s, made between 2000 and 2007. It reproduces
              the types as they were actually inked and impressed onto paper rather than as they
              were drawn — which is why the letters here look slightly worn, and why they are used
              for titles rather than for reading.
            </p>
          </TypeEntry>

          <TypeEntry name="IM Fell English SC" stack="var(--serif-smallcaps)" role="Section labels and captions">
            <p>
              The small-caps companion to the same Fell types. Small capitals are drawn at the
              height of the lowercase with matching stem weights, so a label set in them sits inside
              the page rather than shouting above it. Most websites approximate them by stretching
              the spacing on ordinary capitals; the difference is small, and it is the difference
              between a typographic form and an imitation of one.
            </p>
          </TypeEntry>

          <TypeEntry name="EB Garamond" stack="var(--serif)" role="Everything you read">
            <p>
              Claude Garamond cut his romans in Paris in the 1540s, and nearly every serif made
              since has been measured against them. This digital version is Georg Duffner and
              Octavio Pardo&rsquo;s, built from scans of specimens held in Antwerp. It is used at a
              generous size on a deliberately narrow column, because the texts here were written to
              be read slowly.
            </p>
          </TypeEntry>
        </div>

        <Rule />
        <Heading>The page</Heading>

        <Prose>
          <p>
            The background is not white. Paper reflects the light around it and never reaches the
            brightness a screen is capable of, and a page of fourth-century prose does not want the
            glare of an empty document. The colour here is warm and slightly grey, closer to a book
            left open on a table than to a sheet fresh from a printer.
          </p>
          <p>
            The reading column is narrower than the window allows. Long lines make the eye lose its
            place on the return, and the remedy is older than the web: set a measure, keep to it,
            and let the margins do nothing. Rules are hairlines in gold rather than borders in grey,
            which is the weight they were given when they were cut into a page rather than drawn on
            a screen.
          </p>
          <p>
            Every colour on the site comes from a fixed palette of named values, and the build
            refuses to compile if a new one is introduced by hand. That sounds like a technical
            detail and is really an editorial one: it is how a page stays consistent when it is
            revised often.
          </p>
        </Prose>

        <Rule />
        <Heading>The texts</Heading>

        <Prose>
          <p>
            Every author here died before 1900, and every translation used is out of copyright. That
            is not a formality — it is checked per text, against a named translator and a dated
            edition, before anything is published. Where the rule and the reality differ, the
            reality governs: a translation published before 1929 is in the public domain in the
            United States whatever became of its translator afterwards, and several texts here rest
            on exactly that.
          </p>
          <p>
            Texts come from scans, from digital archives, and from the long-standing online
            collections that made this material available in the first place. Where a text was
            recovered from a scan, the scan is named. Where the quality of that scan affected the
            result, that is recorded on the text itself. Nothing is silently corrected.
          </p>
          <p>
            Transcription and clean-up are done with the help of software, including language
            models, because a poor scan of an eighteenth-century octavo is exactly the kind of work
            that repays it. Nothing reaches the library on that basis alone: every text is read and
            released by hand, and the introductory notes are written by an editor rather than
            generated. The library grows slowly for that reason.
          </p>
        </Prose>

        <Rule />
        <Heading>The build</Heading>

        <Prose>
          <p>
            The site is built with Next.js and served from Vercel; the texts live in a Postgres
            database. There is no advertising, no tracking of individuals, and no login. Analytics
            are limited to counting which texts are opened, which is the only question the library
            needs answered in order to know what to collect next.
          </p>
          <p>
            The Stromata is edited by Keith Mason. There is more on the purpose of the library, and
            on how it came to exist, on the{' '}
            <Link href="/about" style={{ color: 'var(--gold-ink)' }} className="transition-opacity hover:opacity-70">
              about page
            </Link>
            .
          </p>
        </Prose>

        <Rule />

        <p className="font-serif" style={{ color: 'var(--ink-faint)', fontSize: 'var(--text-sm)', lineHeight: 1.8 }}>
          IM Fell types &copy; Igino Marini, freely licensed. EB Garamond by Georg Duffner and
          Octavio Pardo, under the SIL Open Font License. Both are used unmodified except for
          subsetting to the characters this site needs.
        </p>
      </main>
    </div>
  )
}
