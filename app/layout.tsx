import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'

export const metadata: Metadata = {
  title: 'The Stromata',
  description:
    'A freely accessible library of out-of-print historical Christian texts, organised by author, tradition, era, theme, and genre.',
  alternates: {
    types: {
      'application/rss+xml': 'https://www.thestromata.com/rss',
    },
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
      <Script
        defer
        src="https://cloud.umami.is/script.js"
        data-website-id="36255fb6-66a4-4bcf-9065-65f7a74a3944"
        strategy="afterInteractive"
      />
    </html>
  )
}
