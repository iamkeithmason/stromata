/**
 * /design/reader-nav — index for the reader-navigation prototype (NOINDEX).
 * See ./[slug]/page.tsx for what the prototype does and why.
 */

import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Reader navigation (prototype) — The Stromata',
  robots: { index: false, follow: false },
}

const TEXTS = [
  { slug: 'address-on-vainglory-and-how-to-bring-up-children', title: 'Chrysostom, Address on Vainglory', note: 'Long, no headings; uses eight draft editorial sections' },
  { slug: 'prescription-against-heretics', title: 'Tertullian, Prescription Against Heretics', note: 'Long, 44 chapter headings; the contents list is windowed' },
  { slug: 'catechetical-lecture-xxiii-mystagogic-catechesis-v', title: 'Cyril of Jerusalem, Catechetical Lecture XXIII', note: 'Short, part 24 of a 24-part collection' },
]

export default function ReaderNavIndex() {
  return (
    <main style={{ background: 'var(--paper)', color: 'var(--ink)' }} className="min-h-screen px-6 py-16 max-w-xl mx-auto">
      <p className="kicker-gold">Prototype · not in navigation</p>
      <h1 className="font-serif text-3xl mt-3">Reader navigation</h1>
      <p className="font-serif mt-4" style={{ color: 'var(--ink-soft)', lineHeight: 1.6 }}>
        Open one on a phone and scroll into the text. The site header steps aside as you read; scroll up a
        little and a reading header returns, showing where you are. Tap it for the contents and what to read next.
      </p>
      <ul className="mt-10 flex flex-col gap-8">
        {TEXTS.map(t => (
          <li key={t.slug}>
            <Link href={`/design/reader-nav/${t.slug}`} className="font-serif italic text-lg" style={{ color: 'var(--accent)' }}>{t.title} →</Link>
            <p className="font-serif text-sm mt-1" style={{ color: 'var(--ink-mute)' }}>{t.note}</p>
            <Link href={`/design/reader-nav/${t.slug}?reveal=1`} className="font-serif text-sm mt-1 inline-block" style={{ color: 'var(--gold-ink)' }}>
              Same, with the header flashing at each section boundary
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
