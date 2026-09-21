/**
 * Fail loudly on a Supabase query error, instead of rendering the site empty.
 *
 * WHY THIS EXISTS — THE 2026-09-21 INCIDENT
 *
 * Public pages read Supabase as `const { data } = await supabase…` and then use
 * `data ?? []`, or `if (!row) notFound()`. Both discard `error`. That makes a
 * failed query indistinguishable from an empty library:
 *
 *   - `/texts` and `/authors` rendered "0 texts" / "No authors match these
 *     filters" — a complete, confident, wrong page, HTTP 200.
 *   - `/themes/[slug]` took the `notFound()` branch and answered 404 for themes
 *     that exist.
 *
 * On 2026-09-21 the Supabase REST API stopped answering (HTTP 522 on every
 * request, a one-row `select id limit 1` included, while the management API
 * still reported ACTIVE_HEALTHY). A Vercel deploy ran during that window, and
 * because those pages are prerendered, the empty result was not a bad minute —
 * it was **baked into the build** and served until the next successful
 * regeneration. Making the pages static made the site cheap to serve and, in
 * the same stroke, made a transient upstream failure persistent.
 *
 * `lib/supabase/public-columns.ts` already records this shape: migration 026
 * made `select('*')` a flat refusal, and every reading page answered 404
 * because a refusal and "no such row" looked identical to the caller. The
 * lesson was written down, the fix was applied to the columns, and the *shape*
 * came back through a different door. Hence a guard rather than another note.
 *
 * WHAT IT CHANGES
 *
 * A query error now throws. At build time that fails the deploy; during ISR
 * regeneration it aborts the regeneration and Next keeps serving the last good
 * copy of the page. Both are better than publishing an empty library: a deploy
 * that does not happen is visible and recoverable, and a stale page still shows
 * the texts.
 *
 * The trade is deliberate and worth stating: **a Supabase outage now fails
 * builds.** That is the point. The previous behaviour was a build that
 * "succeeded" and shipped a library with nothing in it.
 *
 * WHAT IT DOES NOT CHANGE
 *
 * An empty result with no error is still empty, and a genuinely missing row
 * still reaches `notFound()`. This only separates "the query failed" from
 * "the answer is nothing", which is the distinction the callers had lost.
 */

type QueryResult<T> = {
  data: T
  error: { message: string; code?: string | null; details?: string | null } | null
}

/**
 * Supabase's `error.message` is usually one line, but not always: when the
 * failure happens in front of PostgREST — a gateway timeout, say — the body is
 * a whole Cloudflare HTML error page, and it arrives here verbatim. Unabridged,
 * that buries the one line a reader needs under several kilobytes of markup, in
 * the build log where they are least able to skip it. So: collapse whitespace,
 * say so when it is HTML, and cap the rest.
 */
function readable(message: string): string {
  const flat = message.replace(/\s+/g, ' ').trim()
  if (/^<!DOCTYPE|^<html/i.test(flat)) {
    const title = /<title[^>]*>(.*?)<\/title>/i.exec(flat)?.[1]?.trim()
    return `an HTML error page from the gateway, not a PostgREST error${title ? ` (\u201c${title}\u201d)` : ''} — Supabase was most likely unreachable`
  }
  return flat.length > 300 ? `${flat.slice(0, 300)}…` : flat
}

/**
 * Unwrap a Supabase response, throwing if the query errored.
 *
 * `what` names the query in the thrown message — it is read off a build log by
 * someone who does not have this file open, so name the surface ("the library
 * index"), not the table.
 */
export function orThrow<T>({ data, error }: QueryResult<T>, what: string): T {
  if (error) {
    const code = error.code ? ` [${error.code}]` : ''
    const details = error.details ? ` — ${readable(error.details)}` : ''
    throw new Error(`Supabase query failed for ${what}${code}: ${readable(error.message)}${details}`)
  }
  return data
}
