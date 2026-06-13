import type { Metadata } from 'next'
import Script from 'next/script'
import { Cormorant_Garamond } from 'next/font/google'
import { TrackWeeklyReader } from '@/app/components/TrackWeeklyReader'
import { OG_IMAGE } from '@/lib/metadata'
import './globals.css'

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '500'],
  style: ['normal', 'italic'],
  variable: '--font-cormorant',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://www.thestromata.com'),
  title: 'The Stromata',
  description:
    'A freely accessible library of out-of-print historical Christian texts, organised by author, tradition, era, theme, and genre.',
  alternates: {
    types: {
      'application/rss+xml': 'https://www.thestromata.com/rss',
    },
  },
  openGraph: {
    type: 'website',
    siteName: 'The Stromata',
    images: [OG_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    images: [OG_IMAGE.url],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cormorant.variable}>
      <body>
        {children}
        <TrackWeeklyReader />
      </body>
      <Script
        defer
        src="https://cloud.umami.is/script.js"
        data-website-id="36255fb6-66a4-4bcf-9065-65f7a74a3944"
        strategy="afterInteractive"
      />
      <Script id="hotjar" strategy="afterInteractive">{`
        (function(h,o,t,j,a,r){
          h.hj=h.hj||function(){(h.hj.q=h.hj.q||[]).push(arguments)};
          h._hjSettings={hjid:6699405,hjsv:6};
          a=o.getElementsByTagName('head')[0];
          r=o.createElement('script');r.async=1;
          r.src=t+h._hjSettings.hjid+j+h._hjSettings.hjsv;
          a.appendChild(r);
        })(window,document,'https://static.hotjar.com/c/hotjar-','.js?sv=');
      `}</Script>
    </html>
  )
}
