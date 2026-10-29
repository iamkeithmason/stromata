/**
 * /design/reader-nav/[slug] — a NOINDEX interaction prototype, not linked in nav.
 *
 * Feature Backlog: "Mid-text navigation on phones". On a phone, every way off a
 * long text sits on screen 1 or after the last line; readers stall in between.
 * This prototype tries one answer on the REAL text page: the page below is the
 * reader itself (app/texts/[slug]/page.tsx, imported, not copied), and
 * ReaderNavPrototype layers the behaviour on top of it:
 *   - past the frontispiece, the site header hides on scroll-down;
 *   - scrolling up brings back a reading header (where you are + "Contents"),
 *     not the site header;
 *   - tapping it drops a sheet from the top: contents, the collection, Read next.
 * Add ?reveal=1 to also flash the reading header at each section boundary.
 *
 * It exists so Keith can judge an interaction on his own phone, which static
 * Figma frames could not show. NOT a shipping decision. The body is read by the
 * imported reader page, so this route selects nothing itself.
 */

import type { Metadata } from 'next'
import TextPage from '@/app/texts/[slug]/page'
import { ReaderNavPrototype, type PrototypeSection } from './ReaderNavPrototype'

export const metadata: Metadata = {
  title: 'Reader navigation (prototype) — The Stromata',
  robots: { index: false, follow: false },
}

export const revalidate = 604800
export const dynamicParams = false

// Draft sections for the one test text with no headings, standing in for the
// proposed `texts.sections` field. Each starts at the paragraph that opens with
// `startsWith` (checked against the body on 29 Oct 2026). Editorial, not authorial.
const SECTIONS: Record<string, PrototypeSection[]> = {
  'address-on-vainglory-and-how-to-bring-up-children': [
    { label: 'Vainglory', startsWith: 'Has any man done what I asked?' },
    { label: 'The newborn child', startsWith: 'The man-child has lately been born.' },
    { label: 'The soul as a city', startsWith: 'Regard thyself as a king' },
    { label: 'The gate of the tongue', startsWith: 'Well now, let us first of all approach the gate of the tongue' },
    { label: 'The gate of hearing', startsWith: 'Now let us pass to another gate.' },
    { label: 'Smell and sight', startsWith: 'Let us pass on, if you wilt, to another gate' },
    { label: 'Within the city', startsWith: 'Come now, when we have entered this city' },
    { label: 'Marriage and daughters', startsWith: 'If you do bring him up to the secular life' },
  ],
}

// The three texts the template was designed against: long without headings,
// long with 44 headings, short and part of a collection.
export function generateStaticParams() {
  return [
    { slug: 'address-on-vainglory-and-how-to-bring-up-children' },
    { slug: 'prescription-against-heretics' },
    { slug: 'catechetical-lecture-xxiii-mystagogic-catechesis-v' },
  ]
}

export default async function ReaderNavPrototypePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return (
    <>
      <TextPage params={params} />
      <ReaderNavPrototype sections={SECTIONS[slug] ?? null} />
    </>
  )
}
