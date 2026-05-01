const TRADITION_COLORS: Record<string, string> = {
  'early-church':        '#7A6147',
  'patristic':           '#5A2A2A',
  'eastern-orthodox':    '#2C3A4A',
  'roman-catholic':      '#3D2E20',
  'anglican':            '#3D5167',
  'reformed':            '#2C3E2E',
  'lutheran':            '#3A3825',
  'radical-reformation': '#5A3A2A',
  'methodist':           '#2E3A4A',
  'ecumenical':          '#3D3D35',
  'byzantine':           '#2C2E4A',
  'oriental-orthodox':   '#3A2E20',
}
const FALLBACK_COLOR = '#3D5167'

export function BookCover({
  title,
  authorName,
  deathYear,
  accessionNumber,
  traditionSlug,
  index,
  readingMinutes,
}: {
  title: string
  authorName: string | null
  deathYear: number | null
  accessionNumber: number | null
  traditionSlug: string | null
  index: number
  readingMinutes?: number
}) {
  const ground = TRADITION_COLORS[traditionSlug ?? ''] ?? FALLBACK_COLOR
  const num = String(accessionNumber ?? index + 1).padStart(2, '0')
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
          padding: 'var(--bc-band-pad, 1.5rem 1rem)',
          borderBottom: '1px solid rgba(245,240,230,.18)',
          flexShrink: 0,
        }}
      >
        <span
          className="book-cover-band-label"
          style={{
            fontFamily: 'var(--serif-display)',
            fontSize: '0.5rem',
            letterSpacing: '0.24em',
            color: 'rgba(245,240,230,0.70)',
            textTransform: 'uppercase',
          }}
        >
          Stromata
        </span>
        <span
          className="book-cover-band-label"
          style={{
            fontFamily: 'monospace',
            fontSize: '0.5rem',
            color: 'rgba(245,240,230,0.60)',
            letterSpacing: '0.04em',
          }}
        >
          № {num}
        </span>
      </div>

      {/* Mid panel: vellum, italic title + rule + author */}
      <div
        className="book-cover-mid"
        style={{
          flex: 1,
          background: '#F5F0E6',
          margin: 'var(--bc-mid-margin, 8px 10px)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          textAlign: 'center',
          padding: 'var(--bc-mid-pad, 1rem 1.25rem)',
          overflow: 'hidden',
          minHeight: 0,
        }}
      >
        <p
          className="book-cover-title"
          style={{
            fontFamily: 'var(--serif)',
            fontSize: 'var(--bc-title-size, 1rem)',
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
            width: 20,
            height: 1,
            background: 'var(--ink)',
            opacity: 0.35,
            margin: 'var(--bc-rule-margin, 1rem auto)',
            flexShrink: 0,
          }}
        />
        {authorName && (
          <p
            className="book-cover-author"
            style={{
              fontFamily: 'var(--serif)',
              fontSize: 'var(--bc-author-size, 0.8rem)',
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
              fontSize: 'var(--bc-year-size, 0.8rem)',
              color: 'var(--ink-mute)',
              margin: '5px 0 0',
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
            ? 'var(--bc-band-pad-compact, 0.6rem 1rem)'
            : 'var(--bc-bottom-band-pad, 1rem 1rem)',
          borderTop: '1px solid rgba(245,240,230,.18)',
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
            fontSize: 'var(--bc-s-size, 1.25rem)',
            color: 'rgba(245,240,230,0.70)',
            lineHeight: 1,
          }}
        >
          S
        </span>
        {readingMinutes && (
          <span
            style={{
              fontFamily: 'var(--serif-display)',
              fontSize: '0.45rem',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: 'rgba(245,240,230,0.55)',
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
