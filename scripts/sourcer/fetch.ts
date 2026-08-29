/**
 * The pinned-source fetch. Every fetch URL is derived from the editor's pinned
 * edition SERVER-SIDE (contract.resolveAllowlistedFetchUrls) — the agent never
 * passes or substitutes a URL. A work split across several allowlisted pages is
 * pinned as multiple parts (primary + "Additional edition URLs"); all parts are
 * fetched IN ORDER and concatenated into one immutable `raw.txt`. Archive.org
 * scans are pulled as `_djvu.txt`. `raw.txt` is never edited again; a re-run that
 * finds an existing `raw.txt` is a no-op (idempotent).
 *
 * This is the module the fetch tool's handler calls; the PreToolUse hook has
 * ALREADY asserted every resolved host is allowlisted and the clearance record
 * is valid before the handler runs — this module re-checks anyway (defence in
 * depth).
 */

import fs from 'fs';
import { FETCH_DELAY_MS, MAX_FETCH_BYTES, BUNDLE_FILES } from './config';
import { allowlistedDomain, resolveAllowlistedFetchUrls } from './contract';
import { bundlePath, writeStaged } from './staging';
import type { ClearedProspect } from './types';

export interface FetchResult {
  slug: string;
  /** The primary (part 1) resolved URL — for provenance display. */
  url: string;
  /** Every resolved part URL, in order. */
  urls: string[];
  /** Number of parts fetched (or that make up an existing raw.txt). */
  parts: number;
  host: string;
  /** The allowlisted registrable domain of part 1 (for provenance ocr_source). */
  domain: string;
  rawPath: string;
  bytes: number;
  contentType: string;
  /** True when raw.txt already existed and was left untouched. */
  alreadyPresent: boolean;
  /** First ~2 KB of the raw capture, for the agent to judge format/quality. */
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
 * Assemble the immutable raw capture from the fetched parts. A single part is
 * stored untouched; multiple parts are delimited with a provenance marker so the
 * boundaries (and each part's source URL) survive into the downstream split.
 * Pure — unit-testable without network.
 */
export function assembleRawParts(parts: Array<{ url: string; text: string }>): string {
  if (parts.length === 1) return parts[0].text;
  return parts
    .map((p, i) => `<!-- SOURCER PART ${i + 1}/${parts.length} · ${p.url} -->\n${p.text}`)
    .join('\n\n');
}

/** Fetch one URL, enforcing the timeout. Returns the body text + content type. */
async function fetchOne(url: string, timeoutMs: number): Promise<{ text: string; contentType: string; bytes: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Stromata-Sourcer/0 (+https://thestromata.com; public-domain text sourcing)',
        Accept: 'text/plain, text/html;q=0.9, */*;q=0.5',
      },
      redirect: 'follow',
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) throw new Error(`fetch failed for ${url} — HTTP ${res.status}`);
  const contentType = res.headers.get('content-type') ?? '';
  const buf = Buffer.from(await res.arrayBuffer());
  return { text: buf.toString('utf8'), contentType, bytes: buf.byteLength };
}

/**
 * Fetch every pinned part of the ONE edition for a prospect and store the
 * concatenation immutably as raw.txt. Throws a discriminated error if any
 * resolved URL is not allowlisted (should never happen post-gate/hook — this is
 * the last structural backstop).
 */
export async function fetchPinnedSource(
  prospect: ClearedProspect,
  repoRoot: string,
  opts: { timeoutMs?: number } = {},
): Promise<FetchResult> {
  const urls = resolveAllowlistedFetchUrls(prospect);
  if (!urls) {
    throw new Error(
      `refused: prospect "${prospect.slug}" has a missing or off-allowlist pinned edition part — ` +
        'the Sourcer cannot choose a source. Fix the Cleared edition URL(s) on the Content Prospect List.',
    );
  }
  const primary = urls[0];
  const host = hostOf(primary);
  const domain = allowlistedDomain(host) ?? host;
  const rawPath = bundlePath(repoRoot, prospect.slug, BUNDLE_FILES.raw);

  // Immutable: never re-fetch or overwrite an existing raw capture.
  if (fs.existsSync(rawPath)) {
    const existing = fs.readFileSync(rawPath, 'utf8');
    return {
      slug: prospect.slug,
      url: primary,
      urls,
      parts: urls.length,
      host,
      domain,
      rawPath,
      bytes: Buffer.byteLength(existing, 'utf8'),
      contentType: 'existing',
      alreadyPresent: true,
      preview: existing.slice(0, 2048),
    };
  }

  const timeoutMs = opts.timeoutMs ?? 60_000;
  const fetched: Array<{ url: string; text: string }> = [];
  let totalBytes = 0;
  let firstContentType = '';
  for (let i = 0; i < urls.length; i++) {
    if (i > 0) await politenessDelay(); // rate-limit between parts
    const part = await fetchOne(urls[i], timeoutMs);
    if (i === 0) firstContentType = part.contentType;
    totalBytes += part.bytes;
    if (totalBytes > MAX_FETCH_BYTES) {
      throw new Error(
        `fetch for "${prospect.slug}" exceeds the ${MAX_FETCH_BYTES}-byte cap after ${i + 1} part(s)`,
      );
    }
    fetched.push({ url: urls[i], text: part.text });
  }

  const raw = assembleRawParts(fetched);
  writeStaged(repoRoot, rawPath, raw);

  return {
    slug: prospect.slug,
    url: primary,
    urls,
    parts: urls.length,
    host,
    domain,
    rawPath,
    bytes: Buffer.byteLength(raw, 'utf8'),
    contentType: firstContentType,
    alreadyPresent: false,
    preview: raw.slice(0, 2048),
  };
}
