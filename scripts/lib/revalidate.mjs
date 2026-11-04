/**
 * Tell the live site which public pages a CLI script has just changed.
 *
 * Admin saves refresh their pages through `revalidatePath`; a script writing
 * straight to Supabase cannot, so under the week-long page cache its edit took
 * up to a week to show. Call this after a successful `--write`:
 *
 *   import { revalidateSite } from './lib/revalidate.mjs'
 *   await revalidateSite({ texts: changedSlugs })
 *
 * It POSTs to `${REVALIDATE_URL}/api/revalidate` (default
 * https://thestromata.com) with `REVALIDATE_SECRET`, both from `.env.local`.
 * See app/api/revalidate/route.ts.
 *
 * NEVER FATAL. The database write has already happened; a failed refresh only
 * means the pages show the change when their week is up. So every failure is a
 * warning on stderr and a `false` return, never a throw or a non-zero exit.
 *
 * Meter: one small Vercel function invocation per call, plus one re-render
 * (and one Supabase read of that text) per page actually visited afterwards.
 * Pass only the slugs the run changed.
 */

const DEFAULT_URL = 'https://thestromata.com'
const BATCH = 500

/**
 * @param {{ texts?: string[], paths?: string[] }} what
 * @param {{ fetch?: typeof fetch, env?: Record<string, string | undefined>, log?: (msg: string) => void }} [deps]
 * @returns {Promise<boolean>} true when every batch was accepted
 */
export async function revalidateSite(what, deps = {}) {
  const env = deps.env ?? process.env
  const doFetch = deps.fetch ?? globalThis.fetch
  const warn = deps.log ?? (msg => console.warn(msg))

  const texts = [...new Set(what.texts ?? [])]
  const paths = [...new Set(what.paths ?? [])]
  if (texts.length === 0 && paths.length === 0) return true

  const secret = env.REVALIDATE_SECRET
  if (!secret) {
    warn(
      `⚠ REVALIDATE_SECRET is not set, so ${texts.length + paths.length} changed page(s) were not ` +
        'refreshed on the live site; they will update within a week. Add it to .env.local ' +
        '(the same value as in Vercel → Settings → Environment Variables).'
    )
    return false
  }
  const base = (env.REVALIDATE_URL || DEFAULT_URL).replace(/\/+$/, '')

  // Batches keep each request under the endpoint's path cap. Extra paths go
  // with the first batch only.
  const batches = []
  for (let i = 0; i < Math.max(texts.length, 1); i += BATCH) {
    batches.push({ texts: texts.slice(i, i + BATCH), ...(i === 0 && paths.length ? { paths } : {}) })
  }

  let allOk = true
  for (const body of batches) {
    try {
      const res = await doFetch(`${base}/api/revalidate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-revalidate-secret': secret },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        allOk = false
        warn(`⚠ Revalidation request answered ${res.status}. ${explain(res)}`)
      }
    } catch (err) {
      allOk = false
      warn(`⚠ Revalidation request failed: ${err instanceof Error ? err.message : String(err)}. ` +
        'The database write stands; the pages will update within a week.')
    }
  }
  if (allOk) console.log(`↻ Refreshed ${texts.length + paths.length} page(s) on ${base}.`)
  return allOk
}

/** One line on what a refusal most likely means. Exported for tests. */
export function explain(res) {
  if (res.headers?.get?.('x-vercel-mitigated') === 'challenge' || res.status === 429) {
    return 'Vercel Bot Protection challenged the request. Add a firewall rule that bypasses ' +
      'bot protection for the path /api/revalidate (Vercel → Firewall → Configure → New rule).'
  }
  if (res.status === 401) return 'The secret does not match the one set in Vercel.'
  if (res.status === 503) return 'REVALIDATE_SECRET is not set in Vercel for this deployment.'
  if (res.status === 404) return 'The endpoint is not deployed yet (it ships with the release that adds it).'
  return 'The pages will update within a week.'
}
