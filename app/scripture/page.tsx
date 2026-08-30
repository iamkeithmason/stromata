import Link from 'next/link'
import { SiteHeader } from '@/app/components/SiteHeader'
import ScriptureSearch from './ScriptureSearch'

export const metadata = { title: 'Scripture — The Stromata' }

// A few well-attested verses as starting points into the reverse lookup.
const EXAMPLES = ['John 3:16', 'Romans 8:28', 'Psalm 23:1', 'Matthew 5:3', '1 Corinthians 13:4', 'Genesis 1:1']

export default function ScriptureIndexPage() {
  return (
    <div style={{ background: 'var(--paper)', paddingTop: '4rem' }} className="min-h-screen">
      <SiteHeader breadcrumb={null} />

      <main className="max-w-2xl mx-auto px-6 py-12">
        <div className="mb-6">
          <h1 className="font-serif text-3xl mb-3" style={{ color: '#1b1b1b' }}>Scripture</h1>
          <p className="font-serif leading-relaxed" style={{ color: '#1b1b1b' }}>
            Look up a verse to see which texts in the library cite it. Enter a reference such as
            {' '}<span style={{ fontStyle: 'italic' }}>John 3:16</span> or{' '}
            <span style={{ fontStyle: 'italic' }}>Rom. 8:28</span>.
          </p>
        </div>

        <div className="mb-10">
          <ScriptureSearch />
        </div>

        <div>
          <h2 className="text-xs tracking-[0.18em] uppercase mb-3" style={{ color: '#6f6a60' }}>
            Try a verse
          </h2>
          <div className="flex flex-wrap gap-x-2 gap-y-2">
            {EXAMPLES.map((ref, i) => (
              <span key={ref} className="font-serif" style={{ color: '#1b1b1b' }}>
                <Link
                  href={`/scripture/${encodeURIComponent(ref)}`}
                  className="hover:opacity-70 transition-opacity"
                  style={{ textDecoration: 'underline', textDecorationColor: '#d6d0c8' }}
                >
                  {ref}
                </Link>
                {i < EXAMPLES.length - 1 ? <span style={{ color: '#c9c2b6' }}>{'  ·'}</span> : null}
              </span>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
