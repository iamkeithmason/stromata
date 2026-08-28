/**
 * The PreToolUse enforcement hook — the contract's single point of truth.
 *
 * Every proposed write passes through here before it can reach Notion. The hook
 * (a) seals the tool surface: anything other than the one create tool is denied;
 * (b) processes the proposal (Score, derived Era, tradition guard) and validates
 * the write contract; (c) applies the copyright hard gate, dedupe, threshold and
 * cap as discriminated, logged decisions — never silent drops; (d) in dry-run,
 * records what WOULD be written and denies the actual write.
 *
 * Because the gate lives here and not in the prompt, it cannot drift.
 */

import type { HookCallback, HookInput, PreToolUseHookInput } from '@anthropic-ai/claude-agent-sdk';
import { COPYRIGHT_CUTOFF_YEAR, DEFAULT_MAX_PROPOSALS } from './config';
import { validateContract } from './contract';
import { isAboveThreshold, processProposal } from './scoring';
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
  batchKeys: Set<string>;
  accepted: ScoredProposal[];
  written: Array<{ scored: ScoredProposal; url: string }>;
  skips: SkipRecord[];
  /** Malformed (contract-violating) attempts — denied so the agent resubmits. */
  malformed: Array<{ title: string; author: string; detail: string }>;
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

function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Coerce raw tool input into a ProposalInput (SDK already shape-validates). */
export function toProposalInput(raw: Record<string, unknown>): ProposalInput {
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? [v] : [];
  return {
    title: String(raw.title ?? ''),
    author: String(raw.author ?? ''),
    work: String(raw.work ?? ''),
    tradition: raw.tradition ? String(raw.tradition) : undefined,
    genre: raw.genre ? String(raw.genre) : undefined,
    birthYear: num(raw.birthYear),
    deathYear: num(raw.deathYear),
    floruitYear: num(raw.floruitYear),
    value: Number(raw.value),
    complexity: Number(raw.complexity),
    effort: Number(raw.effort),
    tier1: Boolean(raw.tier1),
    rationale: String(raw.rationale ?? ''),
    discoveryNote: String(raw.discoveryNote ?? ''),
    candidateSources: arr(raw.candidateSources),
    translationNotes: String(raw.translationNotes ?? ''),
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
 * Mutates run state (records skip / malformed / acceptance) and returns the hook
 * payload.
 */
export function gateProposal(state: RunState, raw: Record<string, unknown>) {
  const input = toProposalInput(raw);
  const scored = processProposal(input);
  const label = { title: scored.title || '(untitled)', author: scored.author || '(unknown)' };

  const record = (reason: SkipRecord['reason'], detail: string) => {
    state.skips.push({ ...label, reason, detail });
    return deny(`${reason}: ${detail}`);
  };

  // 1. Contract — required fields, controlled values (a violation is a malformed
  //    call, not a dropped candidate: deny so the agent fixes and resubmits).
  const violations = validateContract(scored);
  if (violations.length > 0) {
    state.malformed.push({ ...label, detail: violations.join('; ') });
    return deny(`contract-violation: ${violations.join('; ')} — fix and resubmit this candidate.`);
  }

  // 2. Copyright hard gate — a known death year at or after the cutoff is out of
  //    the safe harbour. Unknown death year is allowed through (flagged elsewhere).
  if (scored.deathYear != null && scored.deathYear >= COPYRIGHT_CUTOFF_YEAR) {
    return record('rights-excluded', `author d.${scored.deathYear} ≥ ${COPYRIGHT_CUTOFF_YEAR} cutoff`);
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

  // 4. Threshold (on the canonical Score).
  if (!isAboveThreshold(scored)) {
    return record('below-threshold', `Score ${scored.score.toFixed(3)} < threshold`);
  }

  // 5. Cap.
  if (state.accepted.length >= state.maxProposals) {
    return record('over-cap', `run cap of ${state.maxProposals} reached`);
  }

  // Accepted. Reserve the slot deterministically here (the gate owns the cap).
  state.batchKeys.add(scored.dedupeKey);
  state.accepted.push(scored);

  if (state.dryRun) {
    return deny(`dry-run: recorded proposal "${scored.title}" (not written). Continue.`);
  }
  return allow();
}

/** Build the PreToolUse hook callback. Seals the surface and gates proposals. */
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
