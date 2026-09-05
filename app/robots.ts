import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/metadata'

// Serves /robots.txt — allows crawling of the public site, keeps crawlers out
// of the admin and API surfaces, and points them at the sitemap.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/api/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
