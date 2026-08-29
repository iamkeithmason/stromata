/**
 * Fetch a candidate source page for assessment. Read-only: it pulls the page,
 * converts HTML to text (reusing the Sourcer's deterministic htmlToText), and
 * returns a truncated body for the model. It writes nothing.
 */

import { MAX_FETCH_BYTES } from './config';
import { validateCandidateUrl } from './ssrf';
import { htmlToText, looksLikeHtml } from '../sourcer/clean';

export interface CandidatePage {
  url: string;
  host: string;
  bytes: number;
  contentType: string;
  /** Plain text of the page (HTML converted), for the model to assess. */
  text: string;
}

export async function fetchCandidate(
  url: string,
  opts: { timeoutMs?: number } = {},
): Promise<CandidatePage> {
  const check = validateCandidateUrl(url);
  if (!check.ok) throw new Error(`refused: ${check.reason}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 45_000);
  let res: Response;
  try {
    res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Stromata-Research/0 (+https://thestromata.com; provenance assessment)',
        Accept: 'text/html, text/plain;q=0.9, */*;q=0.5',
      },
      redirect: 'follow',
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) throw new Error(`fetch failed for ${url} — HTTP ${res.status}`);

  const contentType = res.headers.get('content-type') ?? '';
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_FETCH_BYTES) {
    throw new Error(`candidate ${url} is ${buf.byteLength} bytes, over the ${MAX_FETCH_BYTES}-byte cap`);
  }
  const raw = buf.toString('utf8');
  const text = looksLikeHtml(raw, contentType) ? htmlToText(raw) : raw;

  return { url, host: check.host, bytes: buf.byteLength, contentType, text };
}
