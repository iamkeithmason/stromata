import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // @react-pdf/renderer must run as a Node server dependency, not be bundled
  // (it pulls in native-ish font/stream code). Used by the /download/pdf routes.
  serverExternalPackages: ['@react-pdf/renderer'],
  // pdfkit (a transitive dep of @react-pdf/renderer) loads its standard-font data
  // files via Node's package "imports" map (`#standard-fonts/*` -> a createRequire()
  // call), which Vercel's build-time file tracer can't follow statically. Without
  // this, the deployed function is missing node_modules/pdfkit/js/standard-fonts/
  // entirely and every PDF render throws `Cannot find module '.../Helvetica.cjs'`
  // at runtime (confirmed via Vercel's production logs for /download/pdf: 2026-09-03).
  outputFileTracingIncludes: {
    '/texts/[slug]/download/pdf': ['./node_modules/pdfkit/js/standard-fonts/**'],
    '/collections/[slug]/download/pdf': ['./node_modules/pdfkit/js/standard-fonts/**'],
  },
  // Duplicate author records merged on 17 Nov 2026; the retired slugs point at
  // the author that now carries their texts.
  async redirects() {
    return [
      ['athanasius-traditional-attribution', 'athanasius-of-alexandria'],
      ['clement-of-rome-attributed', 'clement-of-rome'],
      ['church-of-england-thomas-cranmer-et-al', 'thomas-cranmer'],
    ].map(([from, to]) => ({
      source: `/authors/${from}`,
      destination: `/authors/${to}`,
      permanent: true,
    }))
  },
}

export default nextConfig
