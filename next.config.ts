import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // @react-pdf/renderer must run as a Node server dependency, not be bundled
  // (it pulls in native-ish font/stream code). Used by the /download/pdf routes.
  serverExternalPackages: ['@react-pdf/renderer'],
}

export default nextConfig
