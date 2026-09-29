import { createPublicClient } from '@/lib/supabase/public'
import { SITE_URL } from '@/lib/metadata'

// Serves /llms.txt — a curated, Markdown-formatted map of the site for AI
// assistants and agentic tools (per the llmstxt.org convention), so they can
// cite and link The Stromata accurately when readers ask where to read a text.
// Generated from the live library rather than hand-maintained, and deliberately
// curated (a bounded selection of the most useful entry points) rather than a
// full sitemap dump. Only links to routes that actually exist — the taxonomy
// hubs have detail pages (/themes/[slug] etc.) but no bare index pages.

export const dynamic = 'force-dynamic'
export const revalidate = 0

// How many links to surface per curated section — keeps the whole file well
// within the ~20–50 curated links the format calls for.
const MAX_AUTHORS = 12
const MAX_COLLECTIONS = 8
const MAX_THEMES = 10
const MAX_TRADITIONS = 6
const MAX_ERAS = 6

type Named = { slug: string; name: string } | null
type Labelled = { slug: string; label: string } | null
type TextRow = {
  author: { slug: string | null; name: string; draft: boolean; tradition: Named; era: Labelled } | null
  text_themes: { theme: Named }[] | null
  collection: { slug: string; title: string; published: boolean } | null
}

// Tally slug -> { label, count }, keeping the first label seen for each slug.
function tally() {
  const map = new Map<string, { label: string; count: number }>()
  return {
    add(slug: string | null | undefined, label: string) {
      if (!slug) return
      const entry = map.get(slug)
      if (entry) entry.count += 1
      else map.set(slug, { label, count: 1 })
    },
    top(n: number) {
      return [...map.entries()]
        .sort((a, b) => b[1].count - a[1].count || a[1].label.localeCompare(b[1].label))
        .slice(0, n)
    },
  }
}

function section(title: string, links: string[]): string {
  if (links.length === 0) return ''
  return `## ${title}\n\n${links.join('\n')}\n`
}

export async function GET() {
  // Live read: this feed declares `revalidate = 0` above and must reflect the
  // database as it is now, not the public client's daily cache.
  const supabase = createPublicClient({ live: true })

  const { data } = await supabase
    .from('texts')
    .select(
      'author:authors!inner(slug, name, draft, tradition:traditions(slug, name), era:eras(slug, label)), text_themes(theme:themes(slug, name)), collection:collections(slug, title, published)'
    )
    .eq('published', true)

  const rows = (data ?? []) as unknown as TextRow[]

  const authors = tally()
  const themes = tally()
  const traditions = tally()
  const eras = tally()
  const collections = tally()
  let publishedTexts = 0

  for (const row of rows) {
    publishedTexts += 1
    const a = row.author
    // Draft authors are unreviewed pipeline stubs — keep them out of the map.
    if (a && !a.draft && a.slug) {
      authors.add(a.slug, a.name)
      if (a.tradition) traditions.add(a.tradition.slug, a.tradition.name)
      if (a.era) eras.add(a.era.slug, a.era.label)
    }
    for (const tt of row.text_themes ?? []) {
      if (tt.theme) themes.add(tt.theme.slug, tt.theme.name)
    }
    const c = row.collection
    if (c && c.published) collections.add(c.slug, c.title)
  }

  const authorCount = new Set(
    rows.map(r => (r.author && !r.author.draft ? r.author.slug : null)).filter(Boolean)
  ).size

  const link = (path: string, label: string, note: string) =>
    `- [${label}](${SITE_URL}${path})${note ? `: ${note}` : ''}`

  const body = `# The Stromata

> A free digital reading room of public-domain Christian theological texts — homilies, letters, treatises, prayers, and meditations from writers across nineteen centuries, from the Apostolic Fathers to the nineteenth century.

The Stromata publishes clean, readable editions of Christian writings that have entered the public domain, each placed in its tradition, era, genre, and themes. All texts are free to read, quote, and reproduce for personal, educational, and ministry use. This is a curated map of the site's main entry points — a selection, not a full index — currently spanning ${publishedTexts} texts by ${authorCount} authors.

${section('Start here', [
  link('/', 'The Stromata', 'the reading room home page'),
  link('/about', 'About', 'what the library is and who it is for'),
  link('/texts', 'All texts', `browse the full library of ${publishedTexts} texts`),
  link('/authors', 'Authors', 'every author in the library, with dates and traditions'),
  link('/locations', 'Locations', 'an atlas of where these writers lived and worked'),
  link('/scripture', 'Scripture index', 'find texts by the Bible passages they cite'),
  link('/rss', 'RSS feed', 'newly published texts'),
])}
${section('Selected authors', authors.top(MAX_AUTHORS).map(([slug, { label }]) =>
  link(`/authors/${slug}`, label, ''),
))}
${section('Selected collections', collections.top(MAX_COLLECTIONS).map(([slug, { label }]) =>
  link(`/collections/${slug}`, label, 'multi-part work'),
))}
${section('Browse by theme', themes.top(MAX_THEMES).map(([slug, { label }]) =>
  link(`/themes/${slug}`, label, ''),
))}
${section('Browse by tradition', traditions.top(MAX_TRADITIONS).map(([slug, { label }]) =>
  link(`/traditions/${slug}`, label, ''),
))}
${section('Browse by era', eras.top(MAX_ERAS).map(([slug, { label }]) =>
  link(`/eras/${slug}`, label, ''),
))}`.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}
