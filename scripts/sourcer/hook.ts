/**
 * The PreToolUse enforcement hook — the Sourcer's boundary, in the hook, not the
 * prompt, so it cannot drift. It:
 *   (a) SEALS the surface: anything other than the five sourcer tools is denied
 *       (no bash, no filesystem, no web, no Supabase/Notion write beyond the read
 *       tools and the confined stage write);
 *   (b) proves the copyright boundary by construction: `fetch_pinned_source` is
 *       allowed only when the prospect's resolved host is on the allowlist and a
 *       valid clearance record exists — and the URL is never taken from the tool
 *       input, only resolved server-side from the pinned edition;
 *   (c) blocks any correction-apply / import / publish runner action;
 *   (d) blocks any file write outside content/staging/.
 *
 * `gateToolCall` is the pure decision, factored out for unit tests (no SDK).
 */

import type { HookCallback, HookInput, PreToolUseHookInput } from '@anthropic-ai/claude-agent-sdk';
import {
  hasProvenanceBasis,
  isWithinStaging,
  resolveAllowlistedFetchUrl,
} from './contract';
import { FORBIDDEN_RUNNER_ACTIONS, isRunnerAction } from './runner';
import type { ClearanceRecord, ClearedProspect, GateDecision } from './types';

const MCP = 'mcp__sourcer__';
export const TOOL = {
  readProspects: `${MCP}read_cleared_prospects`,
  readCorpus: `${MCP}read_corpus`,
  fetch: `${MCP}fetch_pinned_source`,
  runScript: `${MCP}run_pipeline_script`,
  stage: `${MCP}stage_draft`,
} as const;

/** The only tool names the agent may call. Everything else is denied. */
export const ALLOWED_TOOLS = Object.values(TOOL);

export interface AcceptedProspect {
  decision: GateDecision;
  prospect: ClearedProspect;
  clearanceRecord: ClearanceRecord;
}

export interface RunState {
  repoRoot: string;
  dryRun: boolean;
  /** Gated, accepted prospects keyed by Notion page id. */
  byId: Map<string, AcceptedProspect>;
  staged: string[];
  toolDenials: Array<{ tool: string; reason: string }>;
  errors: Array<{ slug: string; detail: string }>;
}

export interface ToolDecision {
  allow: boolean;
  reason?: string;
}

function deny(reason: string): ToolDecision {
  return { allow: false, reason };
}
const ALLOW: ToolDecision = { allow: true };

/**
 * The pure per-call decision. Sealed surface + per-tool assertions. Never trusts
 * a URL from the tool input — the fetch host is resolved from the pinned edition
 * in run state.
 */
export function gateToolCall(
  state: RunState,
  toolName: string,
  input: Record<string, unknown>,
): ToolDecision {
  if (!(ALLOWED_TOOLS as string[]).includes(toolName)) {
    return deny(`Sourcer is sealed: "${toolName}" is not one of the permitted tools.`);
  }

  // Read tools are always allowed (read-only Notion / Supabase SELECT).
  if (toolName === TOOL.readProspects || toolName === TOOL.readCorpus) return ALLOW;

  const prospectId = typeof input.prospectId === 'string' ? input.prospectId : '';
  const known = prospectId ? state.byId.get(prospectId) : undefined;

  if (toolName === TOOL.fetch) {
    if (!known) return deny(`fetch: unknown or un-gated prospectId "${prospectId}".`);
    // The URL is derived from the pinned edition — an off-allowlist / missing
    // pinned edition is unfetchable, and any `url` field in the input is ignored.
    const resolved = resolveAllowlistedFetchUrl(known.prospect);
    if (!resolved) {
      return deny(
        `fetch: prospect "${known.prospect.slug}" has no allowlisted pinned edition — ` +
          'the Sourcer cannot choose a source.',
      );
    }
    if (!hasProvenanceBasis(known.prospect)) {
      return deny(`fetch: prospect "${known.prospect.slug}" has no provenance basis in the clearance record.`);
    }
    return ALLOW;
  }

  if (toolName === TOOL.runScript) {
    if (!known) return deny(`run_pipeline_script: unknown or un-gated prospectId "${prospectId}".`);
    const action = typeof input.action === 'string' ? input.action : '';
    if ((FORBIDDEN_RUNNER_ACTIONS as readonly string[]).includes(action)) {
      return deny(
        `run_pipeline_script: action "${action}" is forbidden — correction-apply, ` +
          'pipeline-import, and any publish/DB-write mode are structurally unavailable.',
      );
    }
    if (!isRunnerAction(action)) {
      return deny(`run_pipeline_script: "${action}" is not a permitted action (clean | detect only).`);
    }
    return ALLOW;
  }

  if (toolName === TOOL.stage) {
    if (!known) return deny(`stage_draft: unknown or un-gated prospectId "${prospectId}".`);
    // Any explicit path in the input must resolve within staging (writeStaged
    // re-asserts this too; the hook is the outer guard).
    const target = typeof input.path === 'string' ? input.path : '';
    if (target && !isWithinStaging(state.repoRoot, target)) {
      return deny(`stage_draft: path "${target}" is outside content/staging/.`);
    }
    return ALLOW;
  }

  // Unreachable given the allow-list check above, but deny by default.
  return deny(`Sourcer is sealed: "${toolName}" is not permitted.`);
}

/** Build the PreToolUse hook callback. */
export function createEnforcementHook(state: RunState): HookCallback {
  return async (input: HookInput) => {
    if (input.hook_event_name !== 'PreToolUse') return {};
    const pre = input as PreToolUseHookInput;
    const toolName = pre.tool_name ?? '';
    const raw = (pre.tool_input ?? {}) as Record<string, unknown>;
    const decision = gateToolCall(state, toolName, raw);
    if (decision.allow) {
      return { hookSpecificOutput: { hookEventName: 'PreToolUse' as const, permissionDecision: 'allow' as const } };
    }
    state.toolDenials.push({ tool: toolName, reason: decision.reason ?? 'denied' });
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse' as const,
        permissionDecision: 'deny' as const,
        permissionDecisionReason: decision.reason ?? 'denied',
      },
    };
  };
}
