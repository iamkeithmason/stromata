// Server-rendered download affordances. Clicks are tracked by Umami's
// automatic `data-umami-event` binding (same pattern as the ko-fi and
// collection-nav links), so no client component is needed.
//
// Two DISTINCT event names, one per user-meaningful action (per the analytics
// conventions in CLAUDE.md — never overload one name across content types):
//   • text-download        — a single text
//   • collection-download  — a whole collection bundle
// Both carry `from` (surface) and `format` (markdown | pdf); identifiers are
// slugs, never titles.
//
// Targets are Route Handlers that return a file with Content-Disposition:
// attachment — so a plain <a href> (a full request), not next/link.

type Tone = 'light' | 'dark'

function linkStyle(dark: boolean): React.CSSProperties {
  return {
    color: dark ? 'rgba(250,246,236,0.75)' : 'var(--ink-mute)',
    textDecoration: 'none',
  }
}

export function DownloadLinks({
  textSlug,
  collectionSlug,
  from,
  tone = 'light',
}: {
  /** When set, offers a single-text markdown download. */
  textSlug?: string
  /** When set, offers a whole-collection markdown download. */
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
          <li>
            <a
              href={`/texts/${textSlug}/download/markdown`}
              className="hover:opacity-70 transition-opacity underline underline-offset-2"
              style={linkStyle(dark)}
              data-umami-event="text-download"
              data-umami-event-from={from}
              data-umami-event-format="markdown"
              data-umami-event-text={textSlug}
            >
              This text (Markdown)
            </a>
          </li>
        )}
        {collectionSlug && (
          <li>
            <a
              href={`/collections/${collectionSlug}/download/markdown`}
              className="hover:opacity-70 transition-opacity underline underline-offset-2"
              style={linkStyle(dark)}
              data-umami-event="collection-download"
              data-umami-event-from={from}
              data-umami-event-format="markdown"
              data-umami-event-collection={collectionSlug}
            >
              {textSlug ? 'Whole collection (Markdown)' : 'Download all (Markdown)'}
            </a>
          </li>
        )}
      </ul>
    </section>
  )
}
