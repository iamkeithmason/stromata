import Link from 'next/link'
import { Wordmark } from './Wordmark'
import { MobileNav } from './MobileNav'

export function SiteHeader({ breadcrumb }: { breadcrumb?: React.ReactNode }) {
  return (
    <header
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        background: 'var(--paper)',
        borderBottom: '1px solid var(--rule)',
      }}
      className="h-16 px-8 flex justify-between items-center gap-4"
    >
      <div className="flex gap-4 text-sm items-baseline font-serif min-w-0" style={{ color: 'var(--ink-mute)' }}>
        <Wordmark size={16} />
        {breadcrumb && (
          <span className="flex items-baseline gap-4 min-w-0">
            <span className="shrink-0">/</span>
            <span className="truncate">{breadcrumb}</span>
          </span>
        )}
      </div>
      <nav className="hidden sm:flex gap-6 text-sm shrink-0" style={{ fontFamily: 'var(--ui-face)', color: 'var(--ink-soft)' }}>
        <Link href="/authors" className="hover:opacity-70 transition-opacity">Authors</Link>
        <Link href="/locations" className="hover:opacity-70 transition-opacity">Locations</Link>
        <Link href="/texts" className="hover:opacity-70 transition-opacity">Library</Link>
        <Link href="/about" className="hover:opacity-70 transition-opacity">About</Link>
      </nav>
      <MobileNav />
    </header>
  )
}
