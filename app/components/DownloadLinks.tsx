import { PrintButton } from '@/app/components/PrintButton'

// Download affordances for a text and its collection. Clicks are tracked by
// Umami's automatic `data-umami-event` binding (same pattern as the ko-fi and
// collection-nav links).
//
// Two DISTINCT event names, one per user-meaningful action (per the analytics
// conventions in CLAUDE.md — never overload one name across content types):
//   • text-download        — a single text: format markdown | print
//   • collection-download  — a whole collection bundle: format markdown | pdf
// Each carries `from` (surface) and `format`; identifiers are slugs, never titles.
//
// A text's PDF is the browser's own "Save as PDF" (PrintButton + the print
// stylesheet); a collection's PDF is built ahead of time and stored
// (lib/pdf/collection-pdf.ts). Nothing here renders a PDF on request.
//
// Download targets are Route Handlers that return or redirect to a file, so
// plain <a href> (a full request), not next/link.

// 44px tall: the phone checklist's minimum tap target (CLAUDE.md, mobile-first).
const TARGET = 'inline-flex items-center min-h-[44px] hover:opacity-70 transition-opacity'
const LINK_STYLE: React.CSSProperties = { color: 'var(--ink)', textDecoration: 'underline', textUnderlineOffset: 2 }

function Sep() {
  return <span aria-hidden style={{ color: 'var(--ink-faint)' }}>·</span>
}

function FileLink({
  href,
  label,
  event,
  from,
  format,
  idAttr,
  idValue,
}: {
  href: string
  label: string
  event: 'text-download' | 'collection-download'
  from: string
  format: 'markdown' | 'pdf'
  idAttr: 'text' | 'collection'
  idValue: string
}) {
  return (
    <a
      href={href}
      // Belt to robots.ts's braces: crawlers have no business with a download.
      rel="nofollow"
      className={TARGET}
      style={LINK_STYLE}
      data-umami-event={event}
      data-umami-event-from={from}
      data-umami-event-format={format}
      {...{ [`data-umami-event-${idAttr}`]: idValue }}
    >
      {label}
    </a>
  )
}

export function DownloadLinks({
  textSlug,
  collectionSlug,
  from,
}: {
  /** When set, offers single-text downloads. */
  textSlug?: string
  /** When set, offers whole-collection downloads. */
  collectionSlug?: string
  /** Originating surface, e.g. "text-reader" or "collection-page". */
  from: string
}) {
  if (!textSlug && !collectionSlug) return null

  return (
    <section aria-label="Download">
      <p className="kicker" style={{ marginBottom: '0.25rem' }}>
        Download
      </p>
      <ul className="flex flex-col text-xs">
        {textSlug && (
          <li className="flex flex-wrap items-center gap-x-2">
            <span style={{ color: 'var(--ink-mute)' }}>{collectionSlug ? 'This text' : 'Text'}</span>
            <FileLink
              href={`/texts/${textSlug}/download/markdown`}
              label="Markdown"
              event="text-download"
              from={from}
              format="markdown"
              idAttr="text"
              idValue={textSlug}
            />
            <Sep />
            <PrintButton slug={textSlug} from={from} className={TARGET} style={LINK_STYLE} />
          </li>
        )}
        {collectionSlug && (
          <li className="flex flex-wrap items-center gap-x-2">
            <span style={{ color: 'var(--ink-mute)' }}>{textSlug ? 'Whole collection' : 'Collection'}</span>
            {(['markdown', 'pdf'] as const).map((format, i) => (
              <span key={format} className="flex items-center gap-x-2">
                {i > 0 && <Sep />}
                <FileLink
                  href={`/collections/${collectionSlug}/download/${format}`}
                  label={format === 'pdf' ? 'PDF' : 'Markdown'}
                  event="collection-download"
                  from={from}
                  format={format}
                  idAttr="collection"
                  idValue={collectionSlug}
                />
              </span>
            ))}
          </li>
        )}
      </ul>
    </section>
  )
}
