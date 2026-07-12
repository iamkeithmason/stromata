'use client'
import { useState } from 'react'
import Link from 'next/link'

const LINKS = [
  { href: '/authors', label: 'Authors' },
  { href: '/locations', label: 'Locations' },
  { href: '/texts', label: 'Library' },
  { href: '/about', label: 'About' },
]

export function MobileNav() {
  const [open, setOpen] = useState(false)

  return (
    <div className="sm:hidden">
      <button
        type="button"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className="flex flex-col justify-center items-end gap-1.5 p-2 -mr-2"
      >
        <span style={{ width: 20, height: 1, background: 'var(--ink-mute)', transition: 'transform 150ms ease', transform: open ? 'translateY(3.5px) rotate(45deg)' : 'none' }} />
        <span style={{ width: 20, height: 1, background: 'var(--ink-mute)', opacity: open ? 0 : 1, transition: 'opacity 150ms ease' }} />
        <span style={{ width: 20, height: 1, background: 'var(--ink-mute)', transition: 'transform 150ms ease', transform: open ? 'translateY(-3.5px) rotate(-45deg)' : 'none' }} />
      </button>

      {open && (
        <nav
          className="fixed left-0 right-0 flex flex-col text-sm font-serif"
          style={{
            top: '61px',
            background: 'var(--paper)',
            borderBottom: '1px solid var(--rule)',
            color: 'var(--ink-soft)',
            zIndex: 50,
          }}
        >
          {LINKS.map(link => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="px-8 py-4 hover:opacity-70 transition-opacity"
              style={{ borderBottom: '1px solid var(--rule)' }}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  )
}
