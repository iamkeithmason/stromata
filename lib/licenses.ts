/**
 * texts.license → display name + canonical license URL.
 *
 * `null` (the default for every text so far) means public domain — no license
 * line renders. A non-null value is a slug into this table; the CC deed URL is
 * what makes the reader page's license line legally meaningful rather than
 * just a label, since Creative Commons requires the license itself to be
 * linked, not merely named.
 */
export const LICENSES: Record<string, { name: string; url: string }> = {
  'cc-by-4.0': {
    name: 'CC BY 4.0',
    url: 'https://creativecommons.org/licenses/by/4.0/',
  },
  'cc-by-sa-4.0': {
    name: 'CC BY-SA 4.0',
    url: 'https://creativecommons.org/licenses/by-sa/4.0/',
  },
}

/** Resolve a license slug to its display name + URL, or null for public domain / unknown. */
export function resolveLicense(slug: string | null | undefined): { name: string; url: string } | null {
  if (!slug) return null
  return LICENSES[slug] ?? null
}
