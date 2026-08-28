/**
 * The Notion write contract. This is the enforcement point the spec requires to
 * live "in the hook, not the prompt, so it cannot drift". `validateContract`
 * is the pure predicate; hook.ts wraps it (plus the copyright gate, dedupe,
 * threshold and cap) into the PreToolUse hook that gates the single create tool.
 *
 * A processed proposal that fails ANY check here is blocked — it never reaches
 * Notion.
 */

import {
  NOTION_ERAS,
  NOTION_GENRES,
  NOTION_TRADITIONS,
  PROVENANCE_CAVEAT,
  PROVISIONAL_STATUS,
  FORBIDDEN_STATUSES,
} from './config';
import type { ScoredProposal } from './types';

/**
 * Normalised `author + work` dedupe key: lowercase, strip diacritics and
 * punctuation, collapse whitespace. Deliberately conservative — no article or
 * preposition stripping, so "On the Incarnation" cannot collapse into "the
 * Incarnation" (a false-positive dedupe is worse than a missed one).
 */
export function dedupeKey(author: string, work: string): string {
  const norm = (s: string) =>
    (s || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  return `${norm(author)}::${norm(work)}`;
}

/** Compose the final Translation notes: the agent's reasoning + the caveat. */
export function translationNotesWithCaveat(agentNotes: string): string {
  const reasoning = (agentNotes || '').trim();
  return reasoning ? `${reasoning}\n\n${PROVENANCE_CAVEAT}` : PROVENANCE_CAVEAT;
}

function isInt1to3(n: unknown): boolean {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 3;
}

/** Obvious placeholder hosts — a proposal sourced only from these is junk. */
const PLACEHOLDER_HOSTS = ['example.com', 'example.org', 'example.net', 'localhost', '127.0.0.1'];

function isRealSourceUrl(u: string): boolean {
  const s = String(u).trim();
  if (!/^https?:\/\//i.test(s)) return false;
  let host = '';
  try {
    host = new URL(s).hostname.toLowerCase();
  } catch {
    return false;
  }
  return !PLACEHOLDER_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

export function firstHttpUrl(urls: string[] | undefined): string | null {
  if (!Array.isArray(urls)) return null;
  const u = urls.find((x) => isRealSourceUrl(x));
  return u ? String(u).trim() : null;
}

function hasTraditionFlag(p: ScoredProposal): boolean {
  return p.taxonomyNotes.some((n) => /tradition:\s*needs-editorial/i.test(n));
}
function hasEraFlag(p: ScoredProposal): boolean {
  return p.taxonomyNotes.some((n) => /era:\s*needs-editorial/i.test(n));
}

/**
 * Validate the contract's required fields and controlled values against a
 * PROCESSED proposal (Era derived, tradition resolved). Returns the list of
 * violations (empty = valid). Dedupe / threshold / cap / copyright are NOT
 * checked here — they live in the hook.
 */
export function validateContract(p: ScoredProposal): string[] {
  const v: string[] = [];

  const requireStr = (field: keyof ScoredProposal, label: string) => {
    const val = p[field];
    if (typeof val !== 'string' || val.trim() === '') v.push(`missing ${label}`);
  };

  requireStr('title', 'Title');
  requireStr('author', 'Author');
  requireStr('work', 'work');

  // Title must be in "Author — Work" form (an em dash). This is the mandated
  // shape and it rejects placeholder/probe calls (e.g. a bare "test").
  if (typeof p.title === 'string' && p.title.trim() !== '' && !p.title.includes('—')) {
    v.push('Title must be in "Author — Work" form (missing "—")');
  }
  requireStr('rationale', 'Rationale');
  requireStr('discoveryNote', 'Discovery note');
  requireStr('translationNotes', 'Translation notes reasoning');

  for (const axis of ['value', 'complexity', 'effort'] as const) {
    if (!isInt1to3(p[axis])) v.push(`${axis} must be an integer 1–3`);
  }

  // Tradition: a valid Notion option, OR cleared (null) with a needs-editorial flag.
  if (p.resolvedTradition == null) {
    if (!hasTraditionFlag(p)) v.push('Tradition is empty without a needs-editorial flag');
  } else if (!NOTION_TRADITIONS.includes(p.resolvedTradition as never)) {
    v.push(`Tradition "${p.resolvedTradition}" is not a controlled Notion value`);
  }

  // Era: a valid Notion option, OR blank (null) with a needs-editorial flag.
  if (p.era == null) {
    if (!hasEraFlag(p)) v.push('Era is empty without a needs-editorial flag');
  } else if (!NOTION_ERAS.includes(p.era as never)) {
    v.push(`Era "${p.era}" is not a controlled Notion value`);
  }

  if (p.genre && !NOTION_GENRES.includes(p.genre as never)) {
    v.push(`Genre "${p.genre}" is not a controlled Notion value`);
  }

  if (!firstHttpUrl(p.candidateSources)) {
    v.push('Reference URL missing — need at least one http(s) candidate source');
  }

  if (!translationNotesWithCaveat(p.translationNotes).includes(PROVENANCE_CAVEAT)) {
    v.push('Translation notes missing the unverified-provenance caveat');
  }

  // Defensive: the writer always stamps PROVISIONAL_STATUS. Assert it still reads
  // as provisional so a config edit pointing it at a decided status is caught.
  if (FORBIDDEN_STATUSES.includes(PROVISIONAL_STATUS) || PROVISIONAL_STATUS.trim() === '') {
    v.push(`provisional Status "${PROVISIONAL_STATUS}" reads as decided — refusing to write`);
  }

  return v;
}
