/**
 * The pinned-source fetch. The fetch URL is derived from the editor's
 * `Cleared edition URL` SERVER-SIDE (contract.resolveAllowlistedFetchUrl) — the
 * agent never passes or substitutes a URL. Archive.org scans are pulled as
 * `_djvu.txt`. The untouched response is written to `raw.txt` and never edited
 * again; a re-run that finds an existing `raw.txt` is a no-op (idempotent).
 *
 * This is the module the fetch tool's handler calls; the PreToolUse hook has
 * ALREADY asserted the resolved host is allowlisted and the clearance record is
 * valid before the handler runs — this module re-checks anyway (defence in depth).
 */

import fs from 'fs';
import { FETCH_DELAY_MS, MAX_FETCH_BYTES, BUNDLE_FILES } from './config';
import { allowlistedDomain, resolveAllowlistedFetchUrl } from './contract';
import { bundlePath, writeStaged } from './staging';
import type { ClearedProspect } from './types';

export interface FetchResult {
  slug: string;
  url: string;
  host: string;
  /** The allowlisted registrable domain (for provenance ocr_source). */
  domain: string;
  rawPath: string;
  bytes: number;
  contentType: string;
  /** True when raw.txt already existed and was left untouched. */
  alreadyPresent: boolean;
  /** First ~2 KB of the raw fetch, for the agent to judge format/quality. */
  preview: string;
}

function hostOf(url: string): string {
  return new URL(url).hostname.toLowerCase();
}

/** Sleep for the politeness delay between fetches. */
export function politenessDelay(ms = FETCH_DELAY_MS): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Fetch the ONE pinned edition for a prospect and store it immutably as raw.txt.
 * Throws a discriminated error if the resolved URL is not allowlisted (should
 * never happen post-gate/hook — this is the last structural backstop).
 */
export async function fetchPinnedSource(
  prospect: ClearedProspect,
  repoRoot: string,
  opts: { timeoutMs?: number } = {},
): Promise<FetchResult> {
  const url = resolveAllowlistedFetchUrl(prospect);
  if (!url) {
    throw new Error(
      `refused: prospect "${prospect.slug}" has no allowlisted pinned edition — the Sourcer ` +
        'cannot choose a source. Fix the Cleared edition URL on the Content Prospect List.',
    );
  }
  const host = hostOf(url);
  const domain = allowlistedDomain(host) ?? host;
  const rawPath = bundlePath(repoRoot, prospect.slug, BUNDLE_FILES.raw);

  // Immutable: never re-fetch or overwrite an existing raw capture.
  if (fs.existsSync(rawPath)) {
    const existing = fs.readFileSync(rawPath, 'utf8');
    return {
      slug: prospect.slug,
      url,
      host,
      domain,
      rawPath,
      bytes: Buffer.byteLength(existing, 'utf8'),
      contentType: 'existing',
      alreadyPresent: true,
      preview: existing.slice(0, 2048),
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60_000);
  let res: Response;
  try {
    res = await fetch(url, {
      signal: controller.signal,
      headers: {
        // A descriptive UA is politeness on the allowlisted archives.
        'User-Agent': 'Stromata-Sourcer/0 (+https://thestromata.com; public-domain text sourcing)',
        Accept: 'text/plain, text/html;q=0.9, */*;q=0.5',
      },
      redirect: 'follow',
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    throw new Error(`fetch failed for ${url} — HTTP ${res.status}`);
  }

  const contentType = res.headers.get('content-type') ?? '';
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_FETCH_BYTES) {
    throw new Error(
      `fetch for ${url} is ${buf.byteLength} bytes, over the ${MAX_FETCH_BYTES}-byte cap`,
    );
  }
  const text = buf.toString('utf8');

  writeStaged(repoRoot, rawPath, text);

  return {
    slug: prospect.slug,
    url,
    host,
    domain,
    rawPath,
    bytes: buf.byteLength,
    contentType,
    alreadyPresent: false,
    preview: text.slice(0, 2048),
  };
}
