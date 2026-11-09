import { traditionColor } from '@/lib/tradition-colors'
import { ornamentUrl } from '@/lib/genres/ornaments'

/**
 * Long titles on small covers. A cover's title panel holds five lines (four on a
 * small cover, see the @container rule in globals.css), and a clamp cuts wherever
 * the last line ends, mid-word ("…Power and Efficacy o.."). So a long title steps
 * down a size, and a small cover gets a copy shortened at a word boundary.
 * Re-measured 9 Nov 2026, after the bottom band (the S) was made smaller to give
 * the panel the height: on all 191 published titles over 30 characters, at cover
 * widths 84, 148, 200 and 224px, every title fits whole except three of 96+
 * characters on small covers. Shortened to 80 characters, every one fits, and a
 * phone cover shortens 8 titles where it used to shorten 33. (The 4 Nov
 * calibration, three lines and 56 characters, is superseded.)
 */
const SMALL_COVER_CHARS = 80

function lengthClass(title: string): 'long' | 'medium' | 'short' {
  if (title.length > 60) return 'long'     // smaller size on every cover
  if (title.length > 40) return 'medium'   // smaller size on small covers only
  return 'short'
}

function shortenAtWord(title: string, max: number): string {
  if (title.length <= max) return title
  const cut = title.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return (space > 0 ? cut.slice(0, space) : cut).replace(/[\s,:;(/–-]+$/, '') + '…'
}

export function BookCover({
  title,
  authorName,
  deathYear,
  accessionNumber,
  traditionSlug,
  index,
  readingMinutes,
  accessionDisplay,
  genre,
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
  /**
   * Genre name (e.g. "Sermon"). When it has an ornament (lib/genres/ornaments.ts),
   * the ornament takes the place of the hairline rule between title and author;
   * an unknown or missing genre keeps the rule.
   */
  genre?: string | null
}) {
  const ground = traditionColor(traditionSlug)
  const ornament = ornamentUrl(genre)
  const shortTitle = shortenAtWord(title, SMALL_COVER_CHARS)
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

      {/* Mid panel: vellum, italic title + genre ornament (or rule) + author */}
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
          data-length={lengthClass(title)}
          style={{
            fontFamily: 'var(--serif)',
            fontStyle: 'italic',
            fontWeight: 500,
            lineHeight: 1.15,
            color: 'var(--ink)',
            margin: 0,
            display: '-webkit-box',
            WebkitLineClamp: 5,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            paddingBottom: '0.2em',
          }}
        >
          {shortTitle === title ? (
            title
          ) : (
            <>
              <span className="book-cover-title-full">{title}</span>
              <span className="book-cover-title-short" aria-hidden="true">{shortTitle}</span>
            </>
          )}
        </p>
        {ornament ? (
          /* Genre ornament, drawn as a mask so each shape is fetched once and
             cached, and coloured by a token that the reader dark theme leaves
             alone (the cover panel stays cream). Decorative: the genre is
             stated in text wherever it matters.
             Sized to the panel's slack (9 Nov 2026): it takes 18cqi of height
             against the rule's 16cqi. At 16cqi + 8cqi of margin, 53 of the 106
             published titles over 40 characters lost their descenders (up to
             8px) at every cover width; at this size none do. Re-measure before
             making it bigger. */
          <span
            aria-hidden="true"
            className="book-cover-ornament"
            style={{
              display: 'block',
              width: 'min(28px, 14cqi)',
              height: 'min(28px, 14cqi)',
              margin: 'min(4px, 2cqi) auto',
              flexShrink: 0,
              backgroundColor: 'var(--cover-ornament)',
              WebkitMaskImage: `url(${ornament})`,
              maskImage: `url(${ornament})`,
              WebkitMaskSize: 'contain',
              maskSize: 'contain',
              WebkitMaskRepeat: 'no-repeat',
              maskRepeat: 'no-repeat',
              WebkitMaskPosition: 'center',
              maskPosition: 'center',
            }}
          />
        ) : (
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
        )}
        {authorName && (
          <p
            className="book-cover-author"
            style={{
              fontFamily: 'var(--serif-smallcaps)',
      fontFeatureSettings: '"smcp" 1',
              fontSize: 'min(0.8rem, 6.4cqi)',
              letterSpacing: '0.08em',
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

      {/* Bottom band: reading time (optional) + S mark. Kept slim (9 Nov 2026,
          Keith): at full height it weighed as much as the title panel. */}
      <div
        style={{
          textAlign: 'center',
          padding: readingMinutes
            ? 'min(0.4rem, 3.2cqi) min(1rem, 8cqi)'
            : 'min(0.6rem, 4.8cqi) min(1rem, 8cqi)',
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
            fontSize: 'min(0.875rem, 7cqi)',
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
