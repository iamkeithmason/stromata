/**
 * Provenance assistant — advisory SAFE/HOLD copyright research for a candidate
 * source URL. It fetches the page, asks Claude to identify the translation and
 * its public-domain basis, and prints a verdict with evidence + a paste-ready
 * `Translation notes` line.
 *
 *   npm run research -- <url>
 *
 * It is READ-ONLY: it never writes Notion or the database and never sets
 * `Rights cleared`. The copyright decision stays with the editor; this only does
 * the research so that decision is an informed confirmation, not cold forensics.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import { fetchCandidate } from './fetch';
import { assessProvenance } from './assess';
import { isSourcerPinnable } from './ssrf';
import { renderReport } from './report';
import type { ResearchResult } from './types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
dotenv.config({ path: path.join(REPO_ROOT, '.env.local') });

function parseArgs(argv: string[]): { url: string } {
  const url = argv.find((a) => !a.startsWith('--')) ?? '';
  return { url };
}

async function main() {
  const { url } = parseArgs(process.argv.slice(2));
  if (!url) {
    console.error('Usage: npm run research -- <url>');
    process.exit(1);
  }

  console.error(`Fetching candidate: ${url}`);
  const page = await fetchCandidate(url);
  console.error(`  ${page.bytes} bytes · assessing provenance…\n`);

  const assessment = await assessProvenance(page);
  const result: ResearchResult = {
    url: page.url,
    host: page.host,
    allowlisted: isSourcerPinnable(page.url),
    fetchedBytes: page.bytes,
    assessment,
  };

  process.stdout.write(renderReport(result));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
