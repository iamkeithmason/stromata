'use client'

import { useEffect, useState } from 'react'

/**
 * Drift-proof design-token display.
 *
 * The printed value is read LIVE from the computed CSS custom property at
 * runtime — never hand-typed — so this reference page can no longer disagree
 * with globals.css. (It previously drifted: --ink-mute was shown as its
 * pre-AA value long after the token itself was darkened.) The swatch colour
 * is `var(--token)` for the same reason. On the server the value is unknown,
 * so it renders a placeholder until hydration; fine for an internal,
 * noindex reference page.
 */
function useTokenValue(token: string): string {
  const [value, setValue] = useState('')
  useEffect(() => {
    try {
      setValue(getComputedStyle(document.documentElement).getPropertyValue(token).trim())
    } catch {
      /* getComputedStyle can throw in exotic contexts; the swatch still renders */
    }
  }, [token])
  return value
}

export function ColourSwatch({
  token,
  label,
  backdrop,
}: {
  token: string
  label?: string
  /** Token name for a ground to show behind translucent (reversed-out) colours. */
  backdrop?: string
}) {
  const value = useTokenValue(token)
  return (
    <div className="flex flex-col gap-1">
      <div
        className="w-full rounded-sm"
        style={{
          height: 48,
          background: backdrop ? `var(${backdrop})` : `var(${token})`,
          border: '1px solid var(--rule-soft)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {backdrop && (
          <div style={{ width: '70%', height: '55%', borderRadius: 2, background: `var(${token})` }} />
        )}
      </div>
      <code style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-mute)', fontFamily: 'monospace' }}>{token}</code>
      <code style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-faint)', fontFamily: 'monospace' }}>{value || '…'}</code>
      {label && <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-faint)' }}>{label}</span>}
    </div>
  )
}

/**
 * A non-colour token (a length, a grid template), printed live from the
 * computed CSS, for the same drift-proof reason as ColourSwatch. `scope` reads
 */
export function TokenValue({ token, label }: { token: string; label?: string }) {
  const value = useTokenValue(token)
  return (
    <div className="flex flex-col gap-1">
      <code style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-mute)', fontFamily: 'monospace' }}>{token}</code>
      <code style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-faint)', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{value || '…'}</code>
      {label && <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-faint)' }}>{label}</span>}
    </div>
  )
}
