/**
 * The Notion write contract. This is the enforcement point the PRD requires to
 * live "in the hook, not the prompt, so it cannot drift". `validateContract`
 * is the pure predicate; hook.ts wraps it (plus dedupe / threshold / cap) into
 * the PreToolUse hook that gates the single create tool.
 *
 * A row that fails ANY check here is blocked — it never reaches Notion.
 */

import {
  FORBIDDEN_STATUSES,
  NOTION_ERAS,
  NOTION_GENRES,
  NOTION_TRADITIONS,
  PROVISIONAL_STATUS,
} from './config';
import type { ProposalInput } from './types';

const COPYRIGHT_FLAGS = ['likely-clear', 'needs-check', 'trap-adjacent'];

/**
 * Normalised `author + work` dedupe key: lowercase, strip punctuation and
 * leading articles, collapse whitespace. Stable across title edits and the
 * "Author — Work" vs "Work" spellings.
 */
export function dedupeKey(author: string, work: string): string {
  const norm = (s: string) =>
    (s || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/\p{Diacritic}/gu, '') // strip diacritics
      // Deliberately conservative: no article/preposition stripping. "On the
      // Incarnation" must not collapse into "the Incarnation" — a false-positive
      // dedupe (distinct works merged) is worse than a missed one, which only
      // yields a provisional row the editor ignores.
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  return `${norm(author)}::${norm(work)}`;
}

/**
 * Validate the contract's required fields and controlled values. Returns the
 * list of violations (empty = valid). Dedupe / threshold / cap are NOT checked
 * here — they need run state and live in the hook.
 */
export function validateContract(p: Partial<ProposalInput>): string[] {
  const v: string[] = [];

  const requireStr = (field: keyof ProposalInput, label: string) => {
    const val = p[field];
    if (typeof val !== 'string' || val.trim() === '') v.push(`missing ${label}`);
  };

  requireStr('title', 'Title');
  requireStr('author', 'Author');
  requireStr('work', 'work');
  requireStr('rationale', 'Rationale');
  requireStr('discoveryNote', 'Discovery note');
  requireStr('copyrightReason', 'Copyright flag reason');

  if (!Array.isArray(p.candidateSources) || p.candidateSources.length === 0) {
    v.push('missing Candidate source(s)');
  }

  if (!p.tradition || !NOTION_TRADITIONS.includes(p.tradition as never)) {
    v.push(`Tradition "${p.tradition ?? ''}" is not a controlled Notion value`);
  }
  if (!p.era || !NOTION_ERAS.includes(p.era as never)) {
    v.push(`Era "${p.era ?? ''}" is not a controlled Notion value`);
  }
  if (p.genre && !NOTION_GENRES.includes(p.genre as never)) {
    v.push(`Genre "${p.genre}" is not a controlled Notion value`);
  }

  if (!p.copyrightFlag || !COPYRIGHT_FLAGS.includes(p.copyrightFlag)) {
    v.push(`Copyright flag "${p.copyrightFlag ?? ''}" is not one of ${COPYRIGHT_FLAGS.join(' / ')}`);
  }

  for (const axis of ['impact', 'confidence', 'ease'] as const) {
    const n = p[axis];
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 1 || n > 5) {
      v.push(`${axis} must be a number 1–5`);
    }
  }

  // Defensive: the writer always stamps PROVISIONAL_STATUS, but assert here so a
  // config edit that pointed it at a decided status would be caught, not shipped.
  if (FORBIDDEN_STATUSES.includes(PROVISIONAL_STATUS) || PROVISIONAL_STATUS.trim() === '') {
    v.push(`provisional Status "${PROVISIONAL_STATUS}" reads as decided — refusing to write`);
  }

  return v;
}
