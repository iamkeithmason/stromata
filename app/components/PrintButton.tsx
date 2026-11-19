'use client'

// "Print / Save as PDF" on the text page. The browser lays the page out for
// paper with the print stylesheet in globals.css; there is no server render.
//
// Tracked declaratively, like every other download: Umami's click binding
// reads the data-umami-event-* attributes on any element, so the handler only
// opens the print dialog. Same event and `from` as the old PDF link, with
// format=print, so the series continues across the change.
export function PrintButton({
  slug,
  from,
  className,
  style,
}: {
  slug: string
  from: string
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={className}
      style={style}
      data-umami-event="text-download"
      data-umami-event-from={from}
      data-umami-event-format="print"
      data-umami-event-text={slug}
    >
      Print / Save as PDF
    </button>
  )
}
