import { traditionColor } from '@/lib/tradition-colors'

export function BookCover({
  title,
  authorName,
  deathYear,
  accessionNumber,
  traditionSlug,
  index,
  readingMinutes,
  accessionDisplay,
}: {
  title: string
  authorName: string | null
  deathYear: number | null
  accessionNumber: number | null
  traditionSlug: string | null
  index: number
  readingMinutes?: number
  /**
   * Override the accession display in the top band.
   * - undefined (default) → "№ XX" computed from accessionNumber or index
   * - null               → hide the № entirely (used for collections)
   * - string             → render this exact string (e.g. "№ 100–105")
   */
  accessionDisplay?: string | null
}) {
  const ground = traditionColor(traditionSlug)
  const num = String(accessionNumber ?? index + 1).padStart(2, '0')
  const bandAccession = accessionDisplay !== undefined
    ? accessionDisplay   // null → hidden below; string → shown as-is
    : `№ ${num}`
  const year = deathYear
    ? deathYear < 600
      ? `c. ${deathYear}`
      : `d. ${deathYear}`
    : null

  return (
    <div
      className="book-cover"
      style={{
        background: ground,
        aspectRatio: '2/3',
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
      }}
    >
      {/* Top band: Stromata left + № right */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: 'min(1.5rem, 12cqi) min(1rem, 8cqi)',
          borderBottom: '1px solid var(--on-dark-rule)',
          flexShrink: 0,
        }}
      >
        <span
          className="book-cover-band-label"
          style={{
            fontFamily: 'var(--serif-display)',
            fontSize: 'min(0.5rem, 4cqi)',
            letterSpacing: '0.24em',
            color: 'var(--on-dark-soft)',
            textTransform: 'uppercase',
          }}
        >
          Stromata
        </span>
        {bandAccession !== null && (
          <span
            className="book-cover-band-label"
            style={{
              fontFamily: 'monospace',
              fontSize: 'min(0.5rem, 4cqi)',
              color: 'var(--on-dark-soft)',
              letterSpacing: '0.04em',
            }}
          >
            {bandAccession}
          </span>
        )}
      </div>

      {/* Mid panel: vellum, italic title + rule + author */}
      <div
        className="book-cover-mid"
        style={{
          flex: 1,
          background: 'var(--cover-mid)',
          margin: 'min(8px, 4cqi) min(10px, 5cqi)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          textAlign: 'center',
          padding: 'min(1rem, 8cqi) min(1.25rem, 10cqi)',
          overflow: 'hidden',
          minHeight: 0,
        }}
      >
        <p
          className="book-cover-title"
          style={{
            fontFamily: 'var(--serif)',
            fontSize: 'min(1rem, 8cqi)',
            fontStyle: 'italic',
            fontWeight: 500,
            lineHeight: 1.15,
            color: 'var(--ink)',
            margin: 0,
            display: '-webkit-box',
            WebkitLineClamp: 4,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            paddingBottom: '0.2em',
          }}
        >
          {title}
        </p>
        <div
          style={{
            width: 'min(20px, 10cqi)',
            height: 1,
            background: 'var(--ink)',
            opacity: 0.35,
            margin: 'min(1rem, 8cqi) auto',
            flexShrink: 0,
          }}
        />
        {authorName && (
          <p
            className="book-cover-author"
            style={{
              fontFamily: 'var(--serif)',
              fontSize: 'min(0.8rem, 6.4cqi)',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--ink-soft)',
              margin: 0,
            }}
          >
            {authorName}
          </p>
        )}
        {year && (
          <p
            className="book-cover-year"
            style={{
              fontFamily: 'var(--serif)',
              fontStyle: 'italic',
              fontSize: 'min(0.8rem, 6.4cqi)',
              color: 'var(--ink-mute)',
              margin: 'min(5px, 2.5cqi) 0 0',
            }}
          >
            {year}
          </p>
        )}
      </div>

      {/* Bottom band: reading time (optional) + S mark */}
      <div
        style={{
          textAlign: 'center',
          padding: readingMinutes
            ? 'min(0.6rem, 4.8cqi) min(1rem, 8cqi)'
            : 'min(1rem, 8cqi) min(1rem, 8cqi)',
          borderTop: '1px solid var(--on-dark-rule)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.35rem',
          flexShrink: 0,
        }}
      >
        <span
          className="book-cover-s"
          style={{
            fontFamily: 'var(--serif-display)',
            fontSize: 'min(1.25rem, 10cqi)',
            color: 'var(--on-dark-soft)',
            lineHeight: 1,
          }}
        >
          S
        </span>
        {readingMinutes && (
          <span
            style={{
              fontFamily: 'var(--serif-display)',
              fontSize: 'min(0.45rem, 3.6cqi)',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: 'var(--on-dark-mute)',
              lineHeight: 1,
            }}
          >
            ~ {readingMinutes} min
          </span>
        )}
      </div>
    </div>
  )
}
