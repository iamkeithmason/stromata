// Server-rendered download affordances. Clicks are tracked by Umami's
// automatic `data-umami-event` binding (same pattern as the ko-fi and
// collection-nav links), so no client component is needed.
//
// Two DISTINCT event names, one per user-meaningful action (per the analytics
// conventions in CLAUDE.md — never overload one name across content types):
//   • text-download        — a single text
//   • collection-download  — a whole collection bundle
// Each carries `from` (surface) and `format` (markdown | pdf); identifiers are
// slugs, never titles.
//
// Targets are Route Handlers that return a file with Content-Disposition:
// attachment — so plain <a href> (a full request), not next/link.

type Tone = 'light' | 'dark'
type Format = 'markdown' | 'pdf'

function linkStyle(dark: boolean): React.CSSProperties {
  return { color: dark ? 'rgba(250,246,236,0.85)' : 'var(--ink)', textDecoration: 'underline', textUnderlineOffset: 2 }
}

// One labelled row offering the same target in both formats.
function DownloadRow({
  label,
  base,
  event,
  from,
  idAttr,
  idValue,
  dark,
}: {
  label: string
  base: string // e.g. `/texts/${slug}/download`
  event: 'text-download' | 'collection-download'
  from: string
  idAttr: 'text' | 'collection'
  idValue: string
  dark: boolean
}) {
  const formats: { format: Format; label: string }[] = [
    { format: 'markdown', label: 'Markdown' },
    { format: 'pdf', label: 'PDF' },
  ]
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span style={{ color: dark ? 'rgba(250,246,236,0.7)' : 'var(--ink-mute)' }}>{label}</span>
      {formats.map(({ format, label: fmtLabel }, i) => (
        <span key={format} className="flex items-baseline gap-2">
          {i > 0 && <span aria-hidden style={{ color: dark ? 'rgba(250,246,236,0.4)' : 'var(--ink-faint)' }}>·</span>}
          <a
            href={`${base}/${format}`}
            // Belt to robots.ts's braces: crawlers that ignore the disallow
            // still shouldn't treat a CPU-heavy render as a page to follow.
            rel="nofollow"
            // inline-block + padding brings each link to the 24px minimum tap target
            // ("PDF" was 23×16 on a phone; 26 Oct critique).
            className="inline-block py-1 min-w-[1.5rem] text-center hover:opacity-70 transition-opacity"
            style={linkStyle(dark)}
            data-umami-event={event}
            data-umami-event-from={from}
            data-umami-event-format={format}
            {...{ [`data-umami-event-${idAttr}`]: idValue }}
          >
            {fmtLabel}
          </a>
        </span>
      ))}
    </li>
  )
}

export function DownloadLinks({
  textSlug,
  collectionSlug,
  from,
  tone = 'light',
}: {
  /** When set, offers single-text downloads. */
  textSlug?: string
  /** When set, offers whole-collection downloads. */
  collectionSlug?: string
  /** Originating surface, e.g. "text-reader" or "collection-page". */
  from: string
  tone?: Tone
}) {
  const dark = tone === 'dark'
  if (!textSlug && !collectionSlug) return null

  return (
    <section aria-label="Download">
      <p className="kicker" style={{ marginBottom: '0.75rem', color: dark ? 'rgba(250,246,236,0.7)' : undefined }}>
        Download
      </p>
      <ul className="flex flex-col gap-2 text-xs">
        {textSlug && (
          <DownloadRow
            label={collectionSlug ? 'This text' : 'Text'}
            base={`/texts/${textSlug}/download`}
            event="text-download"
            from={from}
            idAttr="text"
            idValue={textSlug}
            dark={dark}
          />
        )}
        {collectionSlug && (
          <DownloadRow
            label={textSlug ? 'Whole collection' : 'Collection'}
            base={`/collections/${collectionSlug}/download`}
            event="collection-download"
            from={from}
            idAttr="collection"
            idValue={collectionSlug}
            dark={dark}
          />
        )}
      </ul>
    </section>
  )
}
