import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // @react-pdf/renderer must run as a Node server dependency, not be bundled
  // (it pulls in native-ish font/stream code). Since 18 Nov 2026 no public route
  // renders a PDF: collection PDFs are built when an admin save or publish
  // touches the collection (lib/pdf/collection-pdf-schedule.ts), so the renderer
  // runs inside /api routes and the backfill script only.
  serverExternalPackages: ['@react-pdf/renderer'],
  // pdfkit (a transitive dep of @react-pdf/renderer) loads its standard-font data
  // files via Node's package "imports" map (`#standard-fonts/*` -> a createRequire()
  // call), which Vercel's build-time file tracer can't follow statically. Without
  // this, the deployed function is missing node_modules/pdfkit/js/standard-fonts/
  // entirely and every PDF render throws `Cannot find module '.../Helvetica.cjs'`
  // at runtime (confirmed via Vercel's production logs for /download/pdf: 2026-09-03).
  // Keys are route globs: every API route, since any admin save that revalidates
  // a collection's page schedules that collection's PDF rebuild.
  outputFileTracingIncludes: {
    '/api/**/*': ['./node_modules/pdfkit/js/standard-fonts/**'],
  },
  async redirects() {
    // Duplicate author records merged on 17 Nov 2026; the retired slugs point at
    // the author that now carries their texts.
    const authors = [
      ['athanasius-traditional-attribution', 'athanasius-of-alexandria'],
      ['clement-of-rome-attributed', 'clement-of-rome'],
      ['church-of-england-thomas-cranmer-et-al', 'thomas-cranmer'],
    ].map(([from, to]) => ({
      source: `/authors/${from}`,
      destination: `/authors/${to}`,
      permanent: true,
    }))
    // Texts withdrawn for copyright, pointing at a public-domain text on the same
    // ground. Address on Vainglory (accession 1, unpublished 10 Nov 2026: its
    // translation is in copyright) → Chrysostom's Homily 21 on Ephesians, on
    // children and parents. On the Thoughts (Evagrius, unpublished 10 Nov 2026 for
    // copyright) → his Praktikos, in the cleared Dysinger translation; remove it in
    // the PR that republishes On the Thoughts, if permission ever comes. A
    // destination must be published before its redirect ships.
    const texts = [
      ['address-on-vainglory-and-how-to-bring-up-children', 'homily-21-on-ephesians-on-children-and-parents'],
      ['on-the-thoughts', 'treatise-on-the-practical-life'],
    ].map(([from, to]) => ({
      source: `/texts/${from}`,
      destination: `/texts/${to}`,
      permanent: true,
    }))
    return [...authors, ...texts]
  },
}

export default nextConfig
