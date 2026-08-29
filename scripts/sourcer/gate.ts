/**
 * The entry gate — the centre of the design. Before any fetch, every candidate
 * prospect must clear ALL of the checks below. Each failure is a discriminated
 * refusal, logged, with no side effect. `author-missing` is the one non-abort:
 * it FLAGS the draft (the editor must create the author before import) but the
 * text is still staged.
 *
 * This module is pure and deterministic — it runs with no SDK, no network, no
 * API key — so the gate is unit-testable in isolation (see gate.test.ts).
 */

import fs from 'fs';
import path from 'path';
import { DEFAULT_MAX_PROSPECTS, STAGING_ROOT, AUTHOR_COPYRIGHT_CUTOFF_YEAR } from './config';
import {
  authorKey,
  dedupeKey,
  hasProvenanceBasis,
  isAllowlistedHost,
  resolveAllowlistedFetchUrl,
} from './contract';
import type {
  ClearedProspect,
  CorpusView,
  GateDecision,
  RefusalReason,
  SkipRecord,
} from './types';

export interface GateOptions {
  max: number;
  repoRoot: string;
  /** Injectable for tests — defaults to fs existence of `<repoRoot>/content/staging/<slug>`. */
  isStaged?: (slug: string) => boolean;
}

export interface GateResult {
  /** Prospects that passed (pass or flagged), in intake order, capped at max. */
  accepted: GateDecision[];
  /** Full per-candidate decision list (accepted + refused), in order. */
  decisions: GateDecision[];
  /** Discriminated skip log for the refused candidates. */
  skips: SkipRecord[];
}

function defaultIsStaged(repoRoot: string): (slug: string) => boolean {
  return (slug: string) => {
    try {
      return fs.existsSync(path.resolve(repoRoot, STAGING_ROOT, slug));
    } catch {
      return false;
    }
  };
}

function decision(
  prospect: ClearedProspect,
  outcome: GateDecision['outcome'],
  reason: RefusalReason | null,
  detail: string,
  flags: string[] = [],
): GateDecision {
  return { prospect, outcome, reason, detail, flags };
}

/**
 * Evaluate one prospect against the gate. Pure — no side effects. `acceptedSoFar`
 * and `seenSlugs` let the caller enforce the cap and in-batch slug collisions.
 */
export function gateOne(
  prospect: ClearedProspect,
  corpus: CorpusView,
  opts: GateOptions,
  acceptedSoFar: number,
  seenSlugs: Set<string>,
): GateDecision {
  const isStaged = opts.isStaged ?? defaultIsStaged(opts.repoRoot);

  // 1. Rights cleared (a HUMAN sets this true).
  if (!prospect.rightsCleared) {
    return decision(prospect, 'refused', 'rights-not-cleared', 'Rights cleared checkbox is not set by a human');
  }

  // 2. Cleared edition URL present + on the source allowlist.
  const pinned = (prospect.clearedEditionUrl || '').trim();
  if (!pinned) {
    return decision(prospect, 'refused', 'no-cleared-edition', 'no Cleared edition URL pinned');
  }
  const resolved = resolveAllowlistedFetchUrl(prospect);
  if (!resolved) {
    // The URL is present but not allowlisted (or malformed). Distinguish the two.
    let host: string | null = null;
    try {
      host = new URL(pinned).hostname.toLowerCase();
    } catch {
      host = null;
    }
    if (!isAllowlistedHost(host)) {
      return decision(
        prospect,
        'refused',
        'source-not-allowlisted',
        `pinned edition host "${host ?? pinned}" is not on the source allowlist`,
      );
    }
    return decision(prospect, 'refused', 'no-cleared-edition', `pinned edition URL is malformed: ${pinned}`);
  }

  // 3. Provenance basis present (Translation notes non-empty).
  if (!hasProvenanceBasis(prospect)) {
    return decision(prospect, 'refused', 'no-provenance-basis', 'Translation notes carries no provenance basis');
  }

  // 4. Author check — copyright hard gate + author-missing flag.
  const flags: string[] = [];
  const authorRec = corpus.authorsByKey.get(authorKey(prospect.author));
  if (!authorRec) {
    // Not an abort: stage the draft, but flag it so the editor creates the author.
    flags.push('author-missing: author is not yet in the corpus — create the author record before import');
  } else if (authorRec.deathYear != null && authorRec.deathYear >= AUTHOR_COPYRIGHT_CUTOFF_YEAR) {
    return decision(
      prospect,
      'refused',
      'author-copyright-fail',
      `author "${authorRec.name}" d.${authorRec.deathYear} ≥ ${AUTHOR_COPYRIGHT_CUTOFF_YEAR} cutoff`,
    );
  }

  // 5. Not already in the corpus (by dedupe key OR slug).
  if (corpus.coveredWorks.has(dedupeKey(prospect.author, prospect.work)) || corpus.coveredSlugs.has(prospect.slug.toLowerCase())) {
    return decision(prospect, 'refused', 'already-present', `already in the corpus (${prospect.slug})`);
  }

  // 6. Not already staged (filesystem idempotency, plus in-batch slug collisions).
  if (isStaged(prospect.slug) || seenSlugs.has(prospect.slug)) {
    return decision(prospect, 'refused', 'already-staged', `a staged bundle already exists for ${prospect.slug}`);
  }

  // 7. Under the per-run cap.
  if (acceptedSoFar >= opts.max) {
    return decision(prospect, 'refused', 'over-cap', `run cap of ${opts.max} reached`);
  }

  const outcome = flags.length ? 'flagged' : 'pass';
  return decision(prospect, outcome, flags.length ? 'author-missing' : null, flags.length ? flags[0] : 'passed the gate', flags);
}

/** Run the gate over the whole candidate intake. Deterministic; no side effects. */
export function runGate(
  candidates: ClearedProspect[],
  corpus: CorpusView,
  opts: Partial<GateOptions> & { repoRoot: string },
): GateResult {
  const resolved: GateOptions = {
    max: opts.max ?? DEFAULT_MAX_PROSPECTS,
    repoRoot: opts.repoRoot,
    isStaged: opts.isStaged,
  };

  const decisions: GateDecision[] = [];
  const accepted: GateDecision[] = [];
  const skips: SkipRecord[] = [];
  const seenSlugs = new Set<string>();

  for (const prospect of candidates) {
    const d = gateOne(prospect, corpus, resolved, accepted.length, seenSlugs);
    decisions.push(d);
    if (d.outcome === 'refused' && d.reason) {
      skips.push({ title: prospect.title, author: prospect.author, reason: d.reason, detail: d.detail });
    } else {
      accepted.push(d);
      seenSlugs.add(prospect.slug);
    }
  }

  return { accepted, decisions, skips };
}
