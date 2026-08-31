// Helpers shared by the /texts and /authors index pages to build filter facets
// from the published library (so only values that actually have content appear).

export type FacetRef =
  | { slug: string; name: string }
  | { slug: string; label: string }
  | null

export type Facet = { slug: string; label: string }

// Collapse a list of { slug, name|label } references to unique, de-duplicated facets.
export function uniqueFacets(refs: FacetRef[]): Facet[] {
  const seen = new Map<string, string>()
  for (const ref of refs) {
    if (!ref) continue
    const label = 'name' in ref ? ref.name : ref.label
    if (!seen.has(ref.slug)) seen.set(ref.slug, label)
  }
  return [...seen.entries()].map(([slug, label]) => ({ slug, label }))
}

// Only honour a query-param value that corresponds to a real facet.
export function pickFacet(value: string | undefined, facets: { slug: string }[]): string {
  return value && facets.some(f => f.slug === value) ? value : ''
}
