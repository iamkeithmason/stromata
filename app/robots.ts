import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/metadata'

// Serves /robots.txt — allows crawling of the public site, keeps crawlers out
// of the admin and API surfaces, and points them at the sitemap.
//
// The download routes are disallowed too. Until 18 Nov 2026 each PDF was rendered
// on demand (@react-pdf/renderer, CPU-heavy), and on 2026-09-29 Vercel's function
// table showed 159 PDF renders in 12 hours costing as much CPU as every text page
// put together — crawler traffic, not readers. PDFs are no longer rendered per
// request, but the markdown routes still read whole bodies, and the reader page
// carries the same text, so nothing indexable is lost.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/api/', '/texts/*/download/', '/collections/*/download/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
