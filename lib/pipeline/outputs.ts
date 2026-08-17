// Server-side: does a prospect already have staged output on disk?
// Used to decorate queue rows so a prospect that was fetched before its status
// was advanced still offers Review/Stage instead of only Fetch.

import { promises as fs } from 'fs'
import path from 'path'

const OUTPUT_DIR = path.join(process.cwd(), 'scripts', 'ingestion', 'output')

export async function hasOutput(slug: string | undefined): Promise<boolean> {
  if (!slug) return false
  try {
    await fs.access(path.join(OUTPUT_DIR, `${slug}.md`))
    return true
  } catch {
    /* no flat file */
  }
  try {
    const dir = path.join(OUTPUT_DIR, slug)
    const stat = await fs.stat(dir)
    if (stat.isDirectory()) {
      const entries = await fs.readdir(dir)
      // A directory with only the review-summary file doesn't count as content.
      return entries.some(e => e.endsWith('.md') && !e.endsWith('_review-summary.md'))
    }
  } catch {
    /* no dir */
  }
  return false
}
