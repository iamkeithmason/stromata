/**
 * The PreToolUse enforcement hook — the contract's single point of truth.
 *
 * Every proposed write passes through here before it can reach Notion. The hook
 * (a) seals the tool surface: anything other than the one create tool is denied;
 * (b) validates the write contract (required fields, controlled values,
 * provisional Status); (c) applies copyright triage, dedupe, threshold and cap
 * as discriminated, logged decisions — never silent drops; (d) in dry-run,
 * records what WOULD be written and denies the actual write.
 *
 * Because the gate lives here and not in the prompt, it cannot drift no matter
 * what the model decides to attempt.
 */

import type { HookCallback, HookInput, PreToolUseHookInput } from '@anthropic-ai/claude-agent-sdk';
import { DEFAULT_MAX_PROPOSALS } from './config';
import { validateContract } from './contract';
import { isAboveThreshold, scoreProposal } from './scoring';
import type {
  CoverageMap,
  ExistingProspect,
  ProposalInput,
  ScoredProposal,
  SkipRecord,
} from './types';

export const PROPOSE_TOOL = 'mcp__scout__propose_prospect';

export interface RunState {
  dryRun: boolean;
  maxProposals: number;
  coverage: CoverageMap;
  existingKeys: Set<string>;
  /** Dedupe keys accepted so far this run. */
  batchKeys: Set<string>;
  /** Rows that passed the gate (dry-run: would-write; apply: to be written). */
  accepted: ScoredProposal[];
  /** Rows actually written to Notion (apply mode only). */
  written: Array<{ scored: ScoredProposal; url: string }>;
  /** Every rejected candidate, with a discriminated reason. */
  skips: SkipRecord[];
  /**
   * Malformed proposal attempts (contract violations). These are denied so the
   * agent fixes and resubmits — they are NOT dropped candidates, so they are
   * kept apart from the skip log to avoid a retried-then-accepted candidate
   * masquerading as a skip.
   */
  malformed: Array<{ title: string; author: string; detail: string }>;
  /** Write failures surfaced by the tool handler (apply mode). */
  writeErrors: Array<{ title: string; detail: string }>;
}

export function createRunState(opts: {
  dryRun: boolean;
  maxProposals?: number;
  coverage: CoverageMap;
  existing: ExistingProspect[];
}): RunState {
  return {
    dryRun: opts.dryRun,
    maxProposals: opts.maxProposals ?? DEFAULT_MAX_PROPOSALS,
    coverage: opts.coverage,
    existingKeys: new Set(opts.existing.map((e) => e.dedupeKey)),
    batchKeys: new Set(),
    accepted: [],
    written: [],
    skips: [],
    malformed: [],
    writeErrors: [],
  };
}

/** Coerce raw tool input into a ProposalInput (SDK already shape-validates). */
export function toProposalInput(raw: Record<string, unknown>): ProposalInput {
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? [v] : [];
  return {
    title: String(raw.title ?? ''),
    author: String(raw.author ?? ''),
    work: String(raw.work ?? ''),
    tradition: String(raw.tradition ?? ''),
    era: String(raw.era ?? ''),
    genre: raw.genre ? String(raw.genre) : undefined,
    deathYear: raw.deathYear == null ? null : Number(raw.deathYear),
    impact: Number(raw.impact),
    confidence: Number(raw.confidence),
    ease: Number(raw.ease),
    tier1: Boolean(raw.tier1),
    rationale: String(raw.rationale ?? ''),
    discoveryNote: String(raw.discoveryNote ?? ''),
    candidateSources: arr(raw.candidateSources),
    copyrightFlag: raw.copyrightFlag as ProposalInput['copyrightFlag'],
    copyrightReason: String(raw.copyrightReason ?? ''),
  };
}

function deny(reason: string) {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse' as const,
      permissionDecision: 'deny' as const,
      permissionDecisionReason: reason,
    },
  };
}

function allow() {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse' as const,
      permissionDecision: 'allow' as const,
    },
  };
}

/**
 * Pure gate decision, factored out so it is unit-testable without the SDK.
 * Mutates run state (records skip / acceptance) and returns the hook payload.
 */
export function gateProposal(state: RunState, raw: Record<string, unknown>) {
  const input = toProposalInput(raw);
  const label = { title: input.title || '(untitled)', author: input.author || '(unknown)' };

  const record = (reason: SkipRecord['reason'], detail: string) => {
    state.skips.push({ ...label, reason, detail });
    return deny(`${reason}: ${detail}`);
  };

  // 1. Contract — required fields + controlled values. A violation is a
  //    malformed CALL, not a dropped candidate: deny so the agent fixes and
  //    resubmits, and keep it out of the skip log.
  const violations = validateContract(input);
  if (violations.length > 0) {
    state.malformed.push({ ...label, detail: violations.join('; ') });
    return deny(`contract-violation: ${violations.join('; ')} — fix and resubmit this candidate.`);
  }

  const scored = scoreProposal(input);

  // 2. Copyright triage exclusion — only the clearest traps (a known post-1899
  //    author the agent itself flagged trap-adjacent). Pre-1900 is safe harbour;
  //    everything else stays a flagged proposal for the editor to judge.
  if (scored.deathYear != null && scored.deathYear >= 1900 && scored.copyrightFlag === 'trap-adjacent') {
    return record('copyright-excluded', `author d.${scored.deathYear}, flagged trap-adjacent`);
  }

  // 3. Dedupe — corpus, then existing prospects, then this batch.
  if (state.coverage.coveredWorks.has(scored.dedupeKey)) {
    return record('already-published', `already in the corpus (${scored.dedupeKey})`);
  }
  if (state.existingKeys.has(scored.dedupeKey)) {
    return record('already-proposed', `already on the prospect list (${scored.dedupeKey})`);
  }
  if (state.batchKeys.has(scored.dedupeKey)) {
    return record('duplicate-in-batch', `proposed twice this run (${scored.dedupeKey})`);
  }

  // 4. Threshold.
  if (!isAboveThreshold(scored)) {
    return record('below-threshold', `ICE ${scored.iceScore} < threshold`);
  }

  // 5. Cap.
  if (state.accepted.length >= state.maxProposals) {
    return record('over-cap', `run cap of ${state.maxProposals} reached`);
  }

  // Accepted. Reserve the slot deterministically here (the gate owns the cap).
  state.batchKeys.add(scored.dedupeKey);
  state.accepted.push(scored);

  if (state.dryRun) {
    // Nothing is written in dry-run; deny the actual tool call but tell the
    // model this was recorded so it keeps proposing the next candidate.
    return deny(`dry-run: recorded proposal "${scored.title}" (not written). Continue.`);
  }
  return allow();
}

/**
 * Build the PreToolUse hook callback. Seals the surface (only the create tool
 * is ever permitted) and delegates conforming proposals to `gateProposal`.
 */
export function createEnforcementHook(state: RunState): HookCallback {
  return async (input: HookInput) => {
    if (input.hook_event_name !== 'PreToolUse') return {};
    const pre = input as PreToolUseHookInput;
    const toolName = pre.tool_name ?? '';
    if (toolName !== PROPOSE_TOOL) {
      return deny(`Scout is sealed: only ${PROPOSE_TOOL} is permitted, not "${toolName}".`);
    }
    const raw = (pre.tool_input ?? {}) as Record<string, unknown>;
    return gateProposal(state, raw);
  };
}
