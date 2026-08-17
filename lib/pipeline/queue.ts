// Server-side read/write access to the prospect queue
// (scripts/ingestion/prospect-queue.json). Never import from a Client
// Component — this uses the Node fs API.

import { promises as fs } from 'fs'
import path from 'path'
import type { Status } from './vocab'

export const QUEUE_PATH = path.join(process.cwd(), 'scripts', 'ingestion', 'prospect-queue.json')

export type Prospect = {
  id: string
  status: Status | string
  added?: string
  author?: string
  death_year?: number | null
  tradition?: string
  era?: string
  title?: string
  genre?: string
  source_type?: string
  source_url?: string
  collection_slug?: string
  translation_copyright_clear?: boolean
  translator?: string
  translator_death_year?: number | null
  docx_path?: string
  stage_1_notes?: string
  stage_2_output?: string
  stage_3_themes?: string[]
  rejection_reason?: string
  notes?: string
}

export type Queue = { prospects: Prospect[] }

export async function readQueue(): Promise<Queue> {
  const raw = await fs.readFile(QUEUE_PATH, 'utf8')
  const parsed = JSON.parse(raw) as Queue
  if (!parsed || !Array.isArray(parsed.prospects)) {
    throw new Error('prospect-queue.json is malformed: missing prospects array')
  }
  return parsed
}

// Atomic write: write to a sibling temp file, then rename into place so a
// crash mid-write can never leave a truncated queue.
export async function writeQueue(queue: Queue): Promise<void> {
  const tmp = `${QUEUE_PATH}.${process.pid}.tmp`
  const body = JSON.stringify(queue, null, 2) + '\n'
  await fs.writeFile(tmp, body, 'utf8')
  await fs.rename(tmp, QUEUE_PATH)
}

// --- Pure transforms (side-effect free; unit-testable) ---

// Insert a new prospect or replace an existing one matched by id.
export function upsertProspect(queue: Queue, prospect: Prospect): Queue {
  const idx = queue.prospects.findIndex(p => p.id === prospect.id)
  const next = [...queue.prospects]
  if (idx === -1) next.push(prospect)
  else next[idx] = { ...next[idx], ...prospect }
  return { ...queue, prospects: next }
}

export function findProspect(queue: Queue, id: string): Prospect | undefined {
  return queue.prospects.find(p => p.id === id)
}

// Mark a prospect rejected with a reason. Kept separate from a raw status
// write so the reason is never lost.
export function rejectProspect(queue: Queue, id: string, reason: string): Queue {
  return {
    ...queue,
    prospects: queue.prospects.map(p =>
      p.id === id ? { ...p, status: 'rejected', rejection_reason: reason } : p
    ),
  }
}
