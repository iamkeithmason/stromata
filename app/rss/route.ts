import { createPublicClient } from '@/lib/supabase/public'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export async function GET() {
  const supabase = createPublicClient()

  const { data: texts } = await supabase
    .from('texts')
    .select('title, slug, created_at, author:authors(name), genre:genres(name)')
    .eq('published', true)
    .order('created_at', { ascending: false })
    .limit(50)

  const siteUrl = 'https://www.thestromata.com'

  const items = (texts ?? []).map(text => {
    const author = (text.author as unknown as { name: string } | null)?.name ?? ''
    const genre = (text.genre as unknown as { name: string } | null)?.name ?? ''
    const pubDate = new Date(text.created_at as string).toUTCString()
    const link = `${siteUrl}/texts/${text.slug}`
    const description = [author, genre].filter(Boolean).join(' · ')

    return `    <item>
      <title>${escapeXml(text.title)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${pubDate}</pubDate>
      ${author ? `<author>${escapeXml(author)}</author>` : ''}
      <description>${escapeXml(description)}</description>
    </item>`
  })

  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>The Stromata</title>
    <link>${siteUrl}</link>
    <atom:link href="${siteUrl}/rss" rel="self" type="application/rss+xml"/>
    <description>Freely accessible texts from the Christian tradition — homilies, letters, meditations, treatises from writers who have been dead for more than a century.</description>
    <language>en-gb</language>
    <copyright>Public domain</copyright>
    <managingEditor>keith.stewart.mason@gmail.com (Keith Mason)</managingEditor>
    <webMaster>keith.stewart.mason@gmail.com (Keith Mason)</webMaster>
    <ttl>1440</ttl>
${items.join('\n')}
  </channel>
</rss>`

  return new Response(feed, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}
