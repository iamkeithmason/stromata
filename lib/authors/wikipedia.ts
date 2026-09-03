// Shared Wikipedia-lookup helpers for the author admin forms.
//
// Both the "new author" and "edit author" forms let an editor type a name and
// pull suggested biographical fields from Wikipedia's REST summary endpoint.
// The parsing logic lives here so the two forms stay in sync — see
// app/admin/authors/new/NewAuthorForm.tsx and
// app/admin/authors/[id]/edit/EditAuthorForm.tsx.

export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim()
}

export function extractYears(text: string): { birth: number | null; death: number | null } {
  const range = text.match(/\([^)]*?(\d{3,4})\s*[–—-]\s*[^)]*?(\d{3,4})[^)]*?\)/)
  if (range) return { birth: parseInt(range[1]), death: parseInt(range[2]) }
  const born = text.match(/born\s+(?:c\.?\s*)?(\d{3,4})/)
  const died = text.match(/died\s+(?:c\.?\s*)?(\d{3,4})/)
  return { birth: born ? parseInt(born[1]) : null, death: died ? parseInt(died[1]) : null }
}

export function suggestTradition(text: string): string {
  const t = text.toLowerCase()
  if (t.includes('reformed') || t.includes('calvinist') || t.includes('presbyterian')) return 'reformed'
  if (t.includes('lutheran')) return 'lutheran'
  if (t.includes('anglican') || t.includes('church of england')) return 'anglican'
  if (t.includes('methodist')) return 'methodist'
  if (t.includes('anabaptist') || t.includes('mennonite') || t.includes('quaker')) return 'radical-reformation'
  if (t.includes('eastern orthodox') || t.includes('greek orthodox') || t.includes('russian orthodox')) return 'eastern-orthodox'
  if (t.includes('roman catholic') || t.includes('jesuit') || t.includes('dominican') || t.includes('franciscan') || t.includes('benedictine')) return 'roman-catholic'
  if (t.includes('coptic') || t.includes('syriac') || t.includes('armenian church') || t.includes('ethiopian') || t.includes('oriental orthodox')) return 'oriental-orthodox'
  if (t.includes('byzantine') || t.includes('carolingian') || t.includes('john of damascus') || t.includes('maximus the confessor')) return 'imperial'
  if (
    t.includes('church father') || t.includes('patristic') ||
    t.includes('archbishop of constantinople') || t.includes('bishop of hippo') ||
    t.includes('bishop of milan') || t.includes('bishop of carthage') ||
    t.includes('cappadocian') || t.includes('doctor of the church') ||
    t.includes('archbishop') || t.includes('patriarch')
  ) return 'patristic'
  if (t.includes('early church') || t.includes('apostolic father') || t.includes('apologist') || t.includes('ante-nicene')) return 'early-church'
  return ''
}

export type WikipediaSuggestions = {
  title: string
  birthYear: number | null
  deathYear: number | null
  traditionSlug: string
  bio: string
  bioSource: string
  /** Portrait URL from the summary (originalimage preferred over thumbnail), or null. */
  imageUrl: string | null
}

export type WikipediaLookupResult =
  | { ok: true; suggestions: WikipediaSuggestions }
  | { ok: false; reason: 'not-found' | 'network' }

// Fetch and parse a Wikipedia summary into suggested author fields.
// Returns a discriminated result rather than throwing, so callers can render
// a friendly note without a try/catch of their own.
export async function fetchWikipediaSuggestions(name: string): Promise<WikipediaLookupResult> {
  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name.trim())}`,
      { headers: { Accept: 'application/json' } }
    )
    if (!res.ok) return { ok: false, reason: 'not-found' }

    const data = await res.json()
    const extract: string = data.extract ?? ''
    const description: string = data.description ?? ''

    const { birth, death } = extractYears(extract)
    const sentences = extract.replace(/\n+/g, ' ').split(/(?<=[.!?])\s+/)

    // Prefer the full-resolution image; fall back to the thumbnail. Both are
    // upload.wikimedia.org URLs. The field is already returned by this call —
    // pre-1900 author portraits (engravings, icons, manuscript illustrations)
    // are almost universally public domain, but this is not guaranteed, so the
    // editor confirms and a source is always recorded before display.
    const imageUrl: string | null =
      (typeof data.originalimage?.source === 'string' && data.originalimage.source) ||
      (typeof data.thumbnail?.source === 'string' && data.thumbnail.source) ||
      null

    return {
      ok: true,
      suggestions: {
        title: data.title ?? name.trim(),
        birthYear: birth,
        deathYear: death,
        traditionSlug: suggestTradition(extract + ' ' + description),
        bio: sentences.slice(0, 3).join(' '),
        bioSource: `Wikipedia, cached ${new Date().toISOString().split('T')[0]}`,
        imageUrl,
      },
    }
  } catch {
    return { ok: false, reason: 'network' }
  }
}
