/**
 * The Sourcer's structural contract — the pure predicates the enforcement hook
 * (hook.ts) and the gate (gate.ts) both build on. These are the checks the spec
 * requires to hold "by construction, not by discipline":
 *
 *   - `resolveAllowlistedFetchUrl` — the ONLY way a fetch URL is produced. It is
 *     derived from the editor's pinned `Cleared edition URL`; the agent cannot
 *     pass or substitute a URL. Off-allowlist / malformed → null (refused).
 *   - `isWithinStaging` — every file write must resolve under content/staging/.
 *   - `validateClearanceRecord` — the human clearance record is present and
 *     well-formed. It NEVER judges whether the reasoning is correct.
 *
 * Because these live here (and the hook calls them), the boundary cannot drift
 * into the prompt.
 */

import path from 'path';
import {
  SOURCE_ALLOWLIST,
  FORBIDDEN_HOSTS,
  STAGING_ROOT,
} from './config';
import type { ClearedProspect, ClearanceRecord } from './types';

// ---------------------------------------------------------------------------
// Slug + dedupe (self-contained; the Sourcer is independent of the Scout).
// ---------------------------------------------------------------------------

function stripDiacritics(s: string): string {
  return s.normalize('NFKD').replace(/\p{Diacritic}/gu, '');
}

/** kebab-case slug fragment: lowercase, ascii-fold, non-alnum → '-', collapse. */
export function kebab(s: string): string {
  return stripDiacritics(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

/** The work title, split off an "Author — Work" title (em dash), else the whole title. */
export function workFromTitle(title: string, author: string): string {
  const t = (title || '').trim();
  if (t.includes('—')) return t.split('—').slice(1).join('—').trim();
  // Fall back to trimming a leading "Author: " / "Author - " if present.
  const a = (author || '').trim();
  if (a && t.toLowerCase().startsWith(a.toLowerCase())) {
    return t.slice(a.length).replace(/^[\s:—-]+/, '').trim() || t;
  }
  return t;
}

/** Last whitespace-separated token of the author name (the surname, roughly). */
function authorSurname(author: string): string {
  const parts = (author || '').trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

/**
 * Deterministic collection slug: `{short-work-kebab}-{author-surname-kebab}`,
 * matching the queue convention in CLAUDE.md. Short work = first ~5 words.
 */
export function slugFor(title: string, author: string): string {
  const work = workFromTitle(title, author);
  const shortWork = work.split(/\s+/).slice(0, 5).join(' ');
  const left = kebab(shortWork);
  const right = kebab(authorSurname(author));
  return [left, right].filter(Boolean).join('-') || kebab(title) || 'untitled';
}

/**
 * Normalised author+work dedupe key: lowercase, strip diacritics + punctuation,
 * collapse whitespace. Conservative — no article/preposition stripping.
 */
export function dedupeKey(author: string, work: string): string {
  const norm = (s: string) =>
    stripDiacritics(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  return `${norm(author)}::${norm(work)}`;
}

/** Normalise an author name for the corpus author lookup. */
export function authorKey(name: string): string {
  return stripDiacritics(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Source allowlist + fetch-URL resolution (the copyright boundary by construction).
// ---------------------------------------------------------------------------

function hostOf(rawUrl: string): string | null {
  const s = String(rawUrl || '').trim();
  if (!/^https?:\/\//i.test(s)) return null;
  try {
    return new URL(s).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** True when host === domain or host ends with ".<domain>" for some allowlisted domain. */
export function isAllowlistedHost(host: string | null): boolean {
  if (!host) return false;
  if (FORBIDDEN_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return false;
  return SOURCE_ALLOWLIST.some((d) => host === d || host.endsWith(`.${d}`));
}

/** True iff a URL string parses to an allowlisted host. */
export function isAllowlistedUrl(u: string): boolean {
  return isAllowlistedHost(hostOf(u));
}

/** The registrable-ish allowlisted domain the host matches (for the provenance ocr_source). */
export function allowlistedDomain(host: string | null): string | null {
  if (!host) return null;
  return SOURCE_ALLOWLIST.find((d) => host === d || host.endsWith(`.${d}`)) ?? null;
}

/**
 * Turn an Archive.org details/stream URL into its `_djvu.txt` derivative — the
 * preferred plain-text OCR form for scans. Idempotent for URLs already ending in
 * `_djvu.txt`. Non-archive URLs pass through unchanged.
 */
export function preferDjvuTxt(rawUrl: string): string {
  const host = hostOf(rawUrl);
  if (!host || !(host === 'archive.org' || host.endsWith('.archive.org'))) return rawUrl;
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return rawUrl;
  }
  if (/_djvu\.txt$/i.test(u.pathname)) return u.toString();
  // /details/<id> or /stream/<id> (optionally /<id>#page/...) → /stream/<id>/<id>_djvu.txt
  const m = u.pathname.match(/^\/(?:details|stream)\/([^/]+)/);
  if (m) {
    const id = m[1];
    return `https://archive.org/stream/${id}/${id}_djvu.txt`;
  }
  return rawUrl;
}

/**
 * The full ordered list of URLs the editor pinned for this one edition — the
 * primary `Cleared edition URL` followed by any `Additional edition URLs`. These
 * are the ONLY URLs that can ever be fetched; nothing the agent supplies is
 * considered. Empty entries are dropped, order preserved, duplicates removed.
 */
export function pinnedUrls(prospect: ClearedProspect): string[] {
  const all = [prospect.clearedEditionUrl, ...(prospect.additionalEditionUrls || [])]
    .map((u) => (u || '').trim())
    .filter(Boolean);
  return Array.from(new Set(all));
}

/**
 * Resolve the SINGLE primary fetch URL (part 1) from a prospect's clearance
 * record — always the editor's pinned `Cleared edition URL`, never anything the
 * agent supplies. Used for provenance display and the single-part common case.
 *
 * @returns the resolved (allowlisted, djvu-preferred) URL, or null when the
 * pinned edition is missing, malformed, or off the allowlist.
 */
export function resolveAllowlistedFetchUrl(prospect: ClearedProspect): string | null {
  const pinned = (prospect.clearedEditionUrl || '').trim();
  if (!pinned) return null;
  const host = hostOf(pinned);
  if (!isAllowlistedHost(host)) return null;
  return preferDjvuTxt(pinned);
}

/**
 * Resolve ALL pinned parts of the one edition. All-or-nothing: if ANY pinned URL
 * is missing, malformed, or off the allowlist, returns null (the whole prospect
 * is refused — a part is never silently dropped). Otherwise returns the resolved
 * (allowlisted, djvu-preferred) URLs in order.
 */
export function resolveAllowlistedFetchUrls(prospect: ClearedProspect): string[] | null {
  const pinned = pinnedUrls(prospect);
  if (pinned.length === 0) return null;
  const resolved: string[] = [];
  for (const u of pinned) {
    if (!isAllowlistedHost(hostOf(u))) return null;
    resolved.push(preferDjvuTxt(u));
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// Clearance-record well-formedness (present + parseable; NEVER judged for merit).
// ---------------------------------------------------------------------------

const YEAR_RE = /\b(1[0-9]{3}|20[0-2][0-9])\b/g;

/** Best-effort parse of a translator name from the free-text basis (advisory only). */
function parseTranslator(notes: string): string | null {
  const m =
    notes.match(/\b[Tt]rans(?:lated|lation)?\s+by\s+([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,3})/) ||
    notes.match(/\b[Tt]ranslator[:\s]+([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,3})/);
  return m ? m[1].trim() : null;
}

/**
 * Extract a ClearanceRecord from a prospect. The pdBasis is the Translation
 * notes copied VERBATIM; translator / edition / publication years are advisory
 * best-effort reads. Returns null only when there is no basis text at all.
 */
export function extractClearanceRecord(
  prospect: ClearedProspect,
  ocrSourceDomain: string,
): ClearanceRecord | null {
  const basis = (prospect.translationNotes || '').trim();
  if (!basis) return null;
  const years = Array.from(basis.matchAll(YEAR_RE)).map((m) => Number(m[1]));
  const editionYear = years.length ? Math.min(...years) : null;
  const publicationYear = years.length ? Math.max(...years) : null;
  return {
    clearedEditionUrl: (prospect.clearedEditionUrl || '').trim(),
    translator: parseTranslator(basis),
    editionYear,
    publicationYear,
    pdBasis: basis,
    ocrSource: ocrSourceDomain,
  };
}

/** Does the prospect carry a non-empty provenance basis? (`no-provenance-basis` otherwise.) */
export function hasProvenanceBasis(prospect: ClearedProspect): boolean {
  return (prospect.translationNotes || '').trim().length > 0;
}

// ---------------------------------------------------------------------------
// Staging path confinement (every write must resolve under content/staging/).
// ---------------------------------------------------------------------------

/** Absolute path of the staging root, given the repo root. */
export function stagingRootAbs(repoRoot: string): string {
  return path.resolve(repoRoot, STAGING_ROOT);
}

/**
 * True iff `candidate` resolves to a path AT or UNDER content/staging/. Rejects
 * traversal (`..`), absolute escapes, and the staging root's siblings. This is
 * the predicate the file-write hook enforces on every write.
 */
export function isWithinStaging(repoRoot: string, candidate: string): boolean {
  const root = stagingRootAbs(repoRoot);
  const abs = path.isAbsolute(candidate)
    ? path.resolve(candidate)
    : path.resolve(repoRoot, candidate);
  const rel = path.relative(root, abs);
  // Inside iff rel does not climb out and is not absolute. rel === '' is the root itself.
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}
