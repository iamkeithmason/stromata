// Renders a JSON-LD structured-data block. Mirrors the inline
// `<script type="application/ld+json">` pattern already used in
// app/authors/[slug]/page.tsx, factored out so the several pages that now
// emit structured data share one implementation.
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  // Escape `<` so a value containing "</script>" can't close the script element
  // early (JSON.stringify does not escape `<`). Standard JSON-LD safety measure.
  const json = JSON.stringify(data).replace(/</g, '\\u003c')
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  )
}
