// Server-side read/write access to the prospect queue. Never import from a
// Client Component.
//
// The queue is the `prospects` table (supabase/migrations/041_prospects.sql).
// Until that migration has been applied, scripts/lib/prospect-store.mjs falls
// back to scripts/ingestion/prospect-queue.json, so this module works either
// way; `source` on the result says which store answered.

import path from 'path'
import type { Status } from './vocab'
import { createServerClient } from '@/lib/supabase/server'
import { loadProspects, saveProspects, changedProspects } from '@/scripts/lib/prospect-store.mjs'

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
  license?: string
  docx_path?: string
  stage_1_notes?: string
  stage_2_output?: string
  stage_3_themes?: string[]
  rejection_reason?: string
  notes?: string
}

export type QueueSource = 'db' | 'file'
export type Queue = { prospects: Prospect[]; source?: QueueSource }

// No credentials (a bare local checkout) means the file, as before.
function client() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null
  return createServerClient()
}

export async function readQueue(): Promise<Queue> {
  const { source, prospects } = await loadProspects(client(), { file: QUEUE_PATH })
  return { source: source as QueueSource, prospects: prospects as Prospect[] }
}

// Persist a whole queue. Against the table only the prospects that differ from
// what is stored are written; the file is rewritten atomically, as before.
export async function writeQueue(queue: Queue): Promise<void> {
  const sb = client()
  const { source, prospects: current } = await loadProspects(sb, { file: QUEUE_PATH })
  const next = queue.prospects.map(stripUiFields)
  if (source === 'db') {
    await saveProspects(sb, 'db', changedProspects(current, next), { file: QUEUE_PATH })
  } else {
    await saveProspects(null, 'file', next, { file: QUEUE_PATH })
  }
}

// UI-only fields (`_actions`, `_hasOutput`, ...) never reach either store.
function stripUiFields(p: Prospect): Prospect {
  return Object.fromEntries(Object.entries(p).filter(([k]) => !k.startsWith('_'))) as Prospect
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

// How many prospects sit at one status, for the admin console's nav card. A
// head-only count against the table, so the dashboard never pulls the whole
// queue (stage notes included) just to show one number.
export async function countProspects(status: string): Promise<number> {
  const sb = client()
  if (sb) {
    const { count, error } = await sb.from('prospects').select('id', { count: 'exact', head: true }).eq('status', status)
    if (!error) return count ?? 0
  }
  const { prospects } = await readQueue()
  return prospects.filter(p => p.status === status).length
}
