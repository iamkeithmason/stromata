import { SITE_URL } from '@/lib/metadata'

// Shared builders for the downloadable representations of a text and of a
// collection. Both the per-text route (app/texts/[slug]/download/markdown) and
// the per-collection route (app/collections/[slug]/download/markdown) render
// their markdown through here so the frontmatter shape, colophon, and metadata
// ordering stay identical across the two surfaces.
//
// The body stored in `texts.body` is already markdown (react-markdown renders
// it on the reading page), so a download is essentially frontmatter + colophon
// + that body — no re-serialisation of the prose.

// Exact wording agreed in the Feature Backlog entry "Text downloads (PDF and
// markdown)". Do NOT gate downloads behind membership — they sit on the
// reading (free, ungated) side of the founding bifurcation.
export const COLOPHON =
  'Downloaded from The Stromata (thestromata.com). Free for personal, educational, and ministry use.'

export type DownloadableText = {
  title: string
  slug: string
  body: string
  summary?: string | null
  editorial_introduction?: string | null
  accession_number?: number | null
  source_attribution?: string | null
  provenance_notes?: string | null
  translation_notes?: string | null
  genre?: { name: string } | null
  author?: {
    name: string
    tradition?: { name: string } | null
    era?: { label: string } | null
  } | null
}

export type DownloadableCollection = {
  title: string
  slug: string
  description?: string | null
  author?: { name: string } | null
}

const today = () => new Date().toISOString().slice(0, 10)

// Era label without the parenthetical span, matching the reading page
// (e.g. "Nicene & Post-Nicene (325–600)" → "Nicene & Post-Nicene").
const eraName = (label?: string | null) => label?.replace(/\s*\(.*?\)/, '').trim() || null

const accession = (n?: number | null) =>
  n == null ? null : `STROMATA № ${String(n).padStart(2, '0')}`

// Quote and escape a YAML scalar so titles/attributions with colons, quotes,
// or newlines can't break the frontmatter block.
function yamlValue(v: string): string {
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ')}"`
}

// Render an ordered list of [key, value] pairs as a YAML frontmatter block,
// dropping any pair whose value is null/empty.
function frontmatter(pairs: [string, string | null | undefined][]): string {
  const lines = pairs
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${k}: ${yamlValue(String(v))}`)
  return `---\n${lines.join('\n')}\n---`
}

// A safe, slug-based filename for the download attachment.
export function markdownFilename(slug: string): string {
  return `${slug.replace(/[^a-z0-9-]/gi, '-')}.md`
}

// One text's markdown. When `standalone` is false (collection bundling) the
// frontmatter and colophon are omitted — the collection wrapper supplies those
// once at the top — and the title is rendered at H2 with a display position.
function textSection(
  text: DownloadableText,
  opts: { standalone: boolean; position?: number } = { standalone: true }
): string {
  const authorName = text.author?.name ?? null
  const parts: string[] = []

  if (opts.standalone) {
    parts.push(
      frontmatter([
        ['title', text.title],
        ['author', authorName],
        ['tradition', text.author?.tradition?.name ?? null],
        ['era', eraName(text.author?.era?.label)],
        ['genre', text.genre?.name ?? null],
        ['source', text.source_attribution ?? null],
        ['accession', accession(text.accession_number)],
        ['url', `${SITE_URL}/texts/${text.slug}`],
        ['downloaded', today()],
      ])
    )
    parts.push('')
    parts.push(`# ${text.title}`)
    if (authorName) parts.push(`*${authorName}*`)
    parts.push('')
    parts.push(`> ${COLOPHON}`)
  } else {
    const heading = opts.position != null ? `## ${opts.position}. ${text.title}` : `## ${text.title}`
    parts.push(heading)
    const meta = [authorName, text.genre?.name, accession(text.accession_number)]
      .filter(Boolean)
      .join(' · ')
    if (meta) parts.push(`*${meta}*`)
  }

  parts.push('')

  // Curated editorial introduction (Keith-authored; never note_draft) if present.
  if (text.editorial_introduction) {
    parts.push('## Introduction')
    parts.push('')
    parts.push(text.editorial_introduction.trim())
    parts.push('')
    parts.push('---')
    parts.push('')
  }

  parts.push(text.body.trim())

  // Provenance footer.
  const provenance = [
    text.source_attribution ? `Source: ${text.source_attribution}` : null,
    text.provenance_notes,
    text.translation_notes ? `Translation: ${text.translation_notes}` : null,
  ].filter(Boolean)
  if (provenance.length > 0) {
    parts.push('')
    parts.push('---')
    parts.push('')
    parts.push(provenance.join('  \n'))
  }

  return parts.join('\n')
}

// Full markdown document for a single text download.
export function buildTextMarkdown(text: DownloadableText): string {
  return textSection(text, { standalone: true }).trimEnd() + '\n'
}

// Full markdown document for a whole-collection download: one collection-level
// frontmatter + colophon, then every published text in reading order.
export function buildCollectionMarkdown(
  collection: DownloadableCollection,
  texts: DownloadableText[]
): string {
  const authorName = collection.author?.name ?? null
  const parts: string[] = [
    frontmatter([
      ['title', collection.title],
      ['author', authorName],
      ['type', 'collection'],
      ['texts', String(texts.length)],
      ['url', `${SITE_URL}/collections/${collection.slug}`],
      ['downloaded', today()],
    ]),
    '',
    `# ${collection.title}`,
  ]
  if (authorName) parts.push(`*${authorName}*`)
  parts.push('')
  parts.push(`> ${COLOPHON}`)
  parts.push('')
  if (collection.description) {
    parts.push(collection.description.trim())
    parts.push('')
  }

  texts.forEach((text, i) => {
    parts.push('')
    parts.push(textSection(text, { standalone: false, position: i + 1 }))
    parts.push('')
    parts.push('---')
  })

  return parts.join('\n').trimEnd() + '\n'
}
