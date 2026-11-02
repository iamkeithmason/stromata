/**
 * provenance-panel.ts — the pure logic behind the provenance panel on the
 * admin text record.
 *
 * One place that answers "can I trust this text's source?" without opening
 * the form's fields one by one. The panel is advisory: it makes missing or
 * unsafe provenance conspicuous, it never blocks a publish (the human
 * rights/provenance gate stays with the editor). Pure, so it is unit tested —
 * the admin page itself cannot be loaded without Keith's login.
 */

export type PanelInput = {
  sourceUrl?: string | null
  sourceAttribution?: string | null
  provenanceNotes?: string | null
  translationNotes?: string | null
  ocrQuality?: string | null
  license?: string | null
  published?: boolean
  authorName?: string | null
  authorDeathYear?: number | null
  authorIsDraft?: boolean
}

export type Severity = 'unsafe' | 'missing' | 'note'

export type PanelFlag = { severity: Severity; message: string }

export type PanelRow = { label: string; value: string | null }

export type PanelModel = {
  rows: PanelRow[]
  flags: PanelFlag[]
  /** 'unsafe' beats 'missing' beats 'ok'. */
  status: 'unsafe' | 'incomplete' | 'ok'
}

const blank = (s?: string | null) => !s || !s.trim()
const clean = (s?: string | null) => (blank(s) ? null : s!.trim())

/** Host of a source URL, or null when it is not a parseable http(s) URL. */
export function sourceHost(url?: string | null): string | null {
  if (blank(url)) return null
  try {
    const u = new URL(url!.trim())
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.hostname.replace(/^www\./, '') : null
  } catch {
    return null
  }
}

/** Every four-digit year (1000–2099) in a note, in order, without repeats. */
export function yearsIn(text?: string | null): number[] {
  const found = (text ?? '').match(/\b(?:1\d{3}|20\d{2})\b/g) ?? []
  return [...new Set(found.map(Number))]
}

/**
 * Acquisition method, inferred from the source host and OCR grade. This is a
 * description of what the record says, not a verification of it.
 */
export function acquisitionMethod(input: Pick<PanelInput, 'sourceUrl' | 'ocrQuality'>): string | null {
  const host = sourceHost(input.sourceUrl)
  if (!host) return null
  const ocr = input.ocrQuality ? `, OCR quality ${input.ocrQuality}` : ''
  if (host.endsWith('archive.org')) return `Archive.org${ocr}`
  return `${host}${ocr}`
}

export function buildProvenancePanel(input: PanelInput): PanelModel {
  const flags: PanelFlag[] = []
  const attribution = clean(input.sourceAttribution)
  const translation = clean(input.translationNotes)
  const provenance = clean(input.provenanceNotes)
  const host = sourceHost(input.sourceUrl)

  // Rights
  const death = input.authorDeathYear
  let rights: string
  if (input.license) {
    rights = `Licensed: ${input.license}`
    if (!attribution || !host) {
      flags.push({
        severity: 'unsafe',
        message: 'Licensed text needs both a source attribution and a source URL.',
      })
    }
  } else if (death == null) {
    rights = 'Public domain claimed — author death year unknown'
    flags.push({ severity: 'unsafe', message: 'Author death year is unknown, so public-domain status cannot be confirmed.' })
  } else if (death >= 1900) {
    rights = `Author died ${death} — not clear by the 1900 rule`
    flags.push({
      severity: 'unsafe',
      message: `Author died ${death}. Only publish if a translation_copyright_clear basis is recorded in the notes.`,
    })
  } else {
    rights = `Public domain (author d. ${death})`
  }

  // Source
  if (!host) {
    flags.push({
      severity: 'missing',
      message: blank(input.sourceUrl) ? 'No source URL — nothing to check the text against.' : 'Source URL is not a valid http(s) link.',
    })
  }
  if (!attribution) flags.push({ severity: 'missing', message: 'No source attribution (edition).' })
  if (!provenance) flags.push({ severity: 'missing', message: 'No provenance notes.' })

  // A pre-1929 publication is public domain whatever the translator's death
  // date, and the notes mix birth, death and publication years, so a late year
  // is a prompt to check, not a verdict.
  const years = yearsIn(translation)
  const late = years.find(y => y >= 1929)
  if (late != null) {
    flags.push({
      severity: 'note',
      message: `Translation notes mention ${late} — confirm the edition was published before 1929.`,
    })
  }
  if (input.ocrQuality === 'low') {
    flags.push({ severity: 'note', message: 'OCR quality is low — expect scanning errors in the body.' })
  }
  if (input.authorIsDraft) {
    flags.push({ severity: 'note', message: `${input.authorName || 'The author'} is still a draft stub.` })
  }
  if (input.published && flags.some(f => f.severity !== 'note')) {
    flags.unshift({ severity: 'unsafe', message: 'This text is published with the problems below unresolved.' })
  }

  const rows: PanelRow[] = [
    { label: 'Edition', value: attribution },
    { label: 'Translator / translation', value: translation },
    { label: 'Source URL', value: clean(input.sourceUrl) },
    { label: 'Dates in translation notes', value: years.length ? years.join(', ') : null },
    { label: 'Acquisition method', value: acquisitionMethod(input) },
    { label: 'Rights', value: rights },
  ]

  const status = flags.some(f => f.severity === 'unsafe')
    ? 'unsafe'
    : flags.some(f => f.severity === 'missing')
      ? 'incomplete'
      : 'ok'

  return { rows, flags, status }
}
