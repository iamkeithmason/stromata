/**
 * Where the publisher's mark files are served. Kept apart from lib/brand/mark.ts
 * so the cover, which also renders in a client component (reading history),
 * does not pull the mark's path data into the browser bundle.
 */
export type MarkCut = 'print' | 'small'

/** Public URL of a cut's SVG file (written by npm run mark:svg). */
export function markUrl(cut: MarkCut): string {
  return `/mark/${cut}.svg`
}
