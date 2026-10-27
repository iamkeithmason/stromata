import Link from 'next/link'
import { SiteHeader } from '@/app/components/SiteHeader'
import SearchBar from '@/app/SearchBar'

// Every 404 lands here: an unknown URL, and any page that calls notFound() (a text,
// author or collection slug that doesn't exist, or a draft). Until 27 Oct 2026 there
// was no not-found page, so readers got Next's bare default ("404 | This page could
// not be found.") with no header and no way back; the first screens-reference
// render caught it. Next sends the 404 status and a noindex robots tag itself.
export const metadata = {
  title: 'Page not found — The Stromata',
}

const LINKS = [
  { href: '/texts', label: 'Browse the library' },
  { href: '/authors', label: 'All authors' },
  { href: '/', label: 'The front page' },
]

export default function NotFound() {
  return (
    <div style={{ background: 'var(--paper)', paddingTop: '4rem' }} className="min-h-screen">
      <SiteHeader />

      <main id="main-content" className="content-shell py-20 sm:py-28">
        <div className="max-w-xl">
          <p className="kicker" style={{ marginBottom: '1rem' }}>Not found</p>
          <h1 className="font-serif text-3xl sm:text-4xl mb-4" style={{ color: 'var(--ink)' }}>
            This page isn&rsquo;t on the shelves
          </h1>
          <p className="font-serif leading-relaxed mb-10" style={{ color: 'var(--ink-mute)', fontSize: 'var(--text-prose)' }}>
            The link may be old, or the address mistyped. Search for what you were after, or
            start again from the library.
          </p>

          <div className="mb-10">
            <SearchBar />
          </div>

          <ul className="flex flex-col sm:flex-row sm:flex-wrap gap-x-8 gap-y-3 font-serif">
            {LINKS.map(l => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="inline-block py-1 underline underline-offset-4 hover:opacity-70 transition-opacity"
                  style={{ color: 'var(--ink)', textDecorationColor: 'var(--gold-rule)' }}
                >
                  {l.label} →
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  )
}
