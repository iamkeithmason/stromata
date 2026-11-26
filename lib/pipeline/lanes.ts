// Which lane a prospect sits in on /admin/pipeline: what it is waiting for, who
// does it, and the next action, in plain words rather than raw status names.
//
// Pure (no I/O), so the whole mapping is pinned by lanes.test.ts. The page
// decorates each prospect with `_hasOutput` and `_liveStatus` first; this only
// reads them.

import { copyrightBasis } from '@/scripts/lib/copyright.mjs'

export type LaneId =
  | 'copyright'
  | 'ocr'
  | 'fetch'
  | 'review'
  | 'import'
  | 'drafts'
  | 'published'
  | 'rejected'

export type Lane = {
  id: LaneId
  label: string
  owner: string
  next: string
}

// In chain order. The page renders lanes in this order.
export const LANES: Lane[] = [
  { id: 'copyright', label: 'Needs copyright check', owner: 'Claude', next: 'Weekly run checks the death year and source, then fetches' },
  { id: 'ocr', label: 'Needs hands-on OCR', owner: 'Keith + Claude', next: 'A separate OCR session; the weekly run skips these' },
  { id: 'fetch', label: 'Cleared, waiting to be fetched', owner: 'Claude', next: 'Weekly run fetches and cleans the text' },
  { id: 'review', label: 'Ready for Keith to review', owner: 'Keith', next: 'Review the staged output, then Mark staged' },
  { id: 'import', label: 'Staged, waiting for import', owner: 'Claude', next: 'Next import run puts it in Drafts' },
  { id: 'drafts', label: 'In Drafts', owner: 'Keith', next: 'Approve and publish in /admin/review' },
  { id: 'published', label: 'Published', owner: '—', next: 'Nothing; it is live' },
  { id: 'rejected', label: 'Rejected', owner: '—', next: 'Nothing, unless the reason is resolved' },
]

export const LANE_BY_ID: Record<LaneId, Lane> = Object.fromEntries(LANES.map(l => [l.id, l])) as Record<LaneId, Lane>

export type LaneInput = {
  status: string
  source_type?: string
  death_year?: number | null
  translator?: string | null
  stage_1_notes?: string
  rejection_reason?: string
  publication_year?: number
  copyright_ruling?: string
  _hasOutput?: boolean
  _liveStatus?: 'live' | 'draft' | 'unknown'
}

export type LanePlacement = { lane: LaneId; reason: string }

const OCR_SOURCES = new Set(['archive_ocr'])

// A held prospect stays `pending` with the reason in its notes, written as
// "HELD: …" or "HELD at Stage 1: …". Surface that instead of the lane default,
// so a row says why it is stuck rather than implying nobody has looked.
export function heldReason(notes: string | undefined): string | null {
  if (!notes) return null
  const i = notes.lastIndexOf('HELD')
  if (i === -1) return null
  const rest = notes.slice(i).replace(/^HELD( at Stage \d)?:?\s*/, '')
  return 'Held: ' + firstSentence(rest)
}

function firstSentence(s: string): string {
  // Stop at the first sentence end that is not an abbreviation ("d. 1892", "S.J.").
  const m = s.match(/^(.{12,}?[a-z0-9)\]"'’]{2}[.!?])(\s|$)/)
  const out = (m ? m[1] : s).trim()
  return out.length > 160 ? out.slice(0, 157).trimEnd() + '…' : out
}

export function placeProspect(p: LaneInput): LanePlacement {
  const ocr = OCR_SOURCES.has(p.source_type ?? '')
  const held = heldReason(p.stage_1_notes)

  switch (p.status) {
    case 'rejected':
      return { lane: 'rejected', reason: p.rejection_reason ? firstSentence(p.rejection_reason) : 'No reason recorded' }
    case 'imported':
      if (p._liveStatus === 'live') return { lane: 'published', reason: 'Every text it produced is published' }
      if (p._liveStatus === 'unknown') return { lane: 'drafts', reason: 'Imported, but its texts could not be matched; check /admin/drafts' }
      return { lane: 'drafts', reason: 'Imported as unpublished drafts' }
    case 'staged':
      return { lane: 'import', reason: 'Reviewed and staged' }
    case 'stage-2-done':
    case 'stage-3-done':
      if (!p._hasOutput) return { lane: ocr ? 'ocr' : 'fetch', reason: 'Marked fetched, but no output is on disk here' }
      return { lane: 'review', reason: held ?? (p.status === 'stage-3-done' ? 'Themes chosen; output ready' : 'Fetched and cleaned; output ready') }
    case 'stage-1-done':
      if (ocr) return { lane: 'ocr', reason: held ?? 'Copyright cleared; the scan needs OCR cleanup' }
      return { lane: 'fetch', reason: held ?? 'Copyright cleared' }
    case 'pending':
    default:
      if (ocr) return { lane: 'ocr', reason: held ?? 'Scanned source; needs OCR cleanup' }
      return { lane: 'copyright', reason: held ?? copyrightHint(p) }
  }
}

function copyrightHint(p: LaneInput): string {
  if (copyrightBasis(p) === 'publication-ruling') return `Cleared on publication date (${p.publication_year}); ruling recorded`
  if (p.death_year == null) return 'Author death year not recorded yet'
  if (p.death_year >= 1900) return `Author d. ${p.death_year}: fails the pre-1900 rule unless a ruling clears it`
  return p.translator ? `Author d. ${p.death_year}; translation by ${p.translator} to verify` : `Author d. ${p.death_year}`
}

// Group placed prospects by lane, keeping every lane (empty ones included) so
// the counts row always reads prospect → published.
export function groupByLane<T extends LaneInput>(prospects: T[]): Map<LaneId, (T & LanePlacement)[]> {
  const out = new Map<LaneId, (T & LanePlacement)[]>(LANES.map(l => [l.id, []]))
  for (const p of prospects) {
    const placed = { ...p, ...placeProspect(p) }
    out.get(placed.lane)!.push(placed)
  }
  return out
}
