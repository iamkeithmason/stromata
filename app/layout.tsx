import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'The Stromata',
  description:
    'A freely accessible library of out-of-print historical Christian texts, organised by author, tradition, era, theme, and genre.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
