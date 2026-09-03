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
}

export default nextConfig
