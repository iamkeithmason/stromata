import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * The pure half of `POST /api/revalidate`: who may call it, and what they may
 * ask for. Kept apart from the route so it is testable without `next/cache`.
 *
 * WHY THE ENDPOINT EXISTS. Admin saves refresh their pages through
 * `revalidatePath` (lib/publishing/). CLI scripts that edit published texts
 * straight in the database (rejoin-text-paragraphs, strip-source-chrome,
 * reformat-text-body, repair-summaries, …) cannot: `revalidatePath` only works
 * inside the running app. Under the week-long page cache their edits took up to
 * a week to show. The scripts now POST the slugs they changed here, through
 * `scripts/lib/revalidate.mjs`.
 *
 * WHAT IT REFUSES. Only concrete paths: no dynamic-route patterns
 * (`/texts/[slug]`) and no "purge everything" switch. Either would re-render
 * the whole library on crawlers' next pass, which is the bill this cache exists
 * to avoid (see lib/publishing/revalidate-entities.ts).
 */

/** Enough for a full-corpus script run (~770 texts) with room to spare. */
export const MAX_PATHS = 2000

const SLUG = /^[a-z0-9][a-z0-9-]{0,199}$/
const PATH = /^\/[a-z0-9/._-]{0,299}$/i

export type ParsedRequest =
  | { ok: true; paths: string[] }
  | { ok: false; error: string }

/**
 * `{ texts?: string[], paths?: string[] }` → the concrete paths to refresh.
 * `texts` are slugs and become `/texts/{slug}` (a body-only edit changes the
 * reader page and nothing else); `paths` are for anything else a script
 * changed (`/`, `/texts`, `/authors/{slug}`).
 */
export function parseRevalidateBody(body: unknown): ParsedRequest {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Body must be a JSON object.' }
  }
  const { texts, paths } = body as { texts?: unknown; paths?: unknown }
  const out = new Set<string>()

  if (texts !== undefined) {
    if (!Array.isArray(texts)) return { ok: false, error: '`texts` must be an array of slugs.' }
    for (const t of texts) {
      if (typeof t !== 'string' || !SLUG.test(t)) {
        return { ok: false, error: `Not a slug: ${JSON.stringify(t)}` }
      }
      out.add(`/texts/${t}`)
    }
  }
  if (paths !== undefined) {
    if (!Array.isArray(paths)) return { ok: false, error: '`paths` must be an array of paths.' }
    for (const p of paths) {
      if (typeof p !== 'string' || !PATH.test(p) || p.includes('..') || p.includes('//')) {
        return { ok: false, error: `Not a concrete path: ${JSON.stringify(p)}` }
      }
      out.add(p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p)
    }
  }

  if (out.size === 0) return { ok: false, error: 'Nothing to revalidate: pass `texts` or `paths`.' }
  if (out.size > MAX_PATHS) return { ok: false, error: `At most ${MAX_PATHS} paths per call.` }
  return { ok: true, paths: [...out] }
}

/**
 * Constant-time comparison of the presented secret with the configured one.
 * Both sides are hashed first so their lengths always match, which
 * `timingSafeEqual` requires. An unset or empty configured secret matches
 * nothing: the endpoint fails closed.
 */
export function secretMatches(presented: string | null | undefined, configured: string | undefined): boolean {
  if (!configured || !presented) return false
  const a = createHash('sha256').update(presented).digest()
  const b = createHash('sha256').update(configured).digest()
  return timingSafeEqual(a, b)
}
