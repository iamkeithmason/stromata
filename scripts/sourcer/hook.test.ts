/**
 * Tests for the PreToolUse enforcement — the sealed surface and per-tool
 * decisions. Proves the hook blocks a database write and a correction-apply,
 * and that the fetch tool cannot be pointed at a URL the editor did not pin
 * (off-allowlist prospect denied even when a good URL is supplied in the input).
 *
 * Run: npx tsx --test scripts/sourcer/hook.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TOOL, gateToolCall, type AcceptedProspect, type RunState } from './hook';
import type { ClearanceRecord, ClearedProspect, GateDecision } from './types';

function prospect(over: Partial<ClearedProspect> = {}): ClearedProspect {
  return {
    id: 'p1',
    pageUrl: 'https://notion.so/p1',
    title: 'Athanasius — On the Incarnation',
    author: 'Athanasius',
    work: 'On the Incarnation',
    slug: 'on-the-incarnation-athanasius',
    tradition: 'Patristic',
    era: 'Nicene & Post-Nicene',
    genre: 'Treatise',
    status: 'Text available',
    clearedEditionUrl: 'https://archive.org/details/onincarnation00atha',
    rightsCleared: true,
    translationNotes: 'Trans. Robertson; published 1892, public domain.',
    referenceUrl: null,
    ...over,
  };
}

function accepted(p: ClearedProspect): AcceptedProspect {
  const clearanceRecord: ClearanceRecord = {
    clearedEditionUrl: p.clearedEditionUrl,
    translator: 'Robertson',
    editionYear: 1892,
    publicationYear: 1892,
    pdBasis: p.translationNotes,
    ocrSource: 'archive.org',
  };
  const decision: GateDecision = { prospect: p, outcome: 'pass', reason: null, detail: 'ok', flags: [] };
  return { prospect: p, clearanceRecord, decision };
}

function state(prospects: ClearedProspect[]): RunState {
  const byId = new Map<string, AcceptedProspect>();
  for (const p of prospects) byId.set(p.id, accepted(p));
  return { repoRoot: '/repo', dryRun: false, byId, staged: [], toolDenials: [], errors: [] };
}

test('sealed surface: a non-sourcer tool (Bash) is denied', () => {
  const d = gateToolCall(state([prospect()]), 'Bash', { command: 'ls' });
  assert.equal(d.allow, false);
});

test('sealed surface: a Supabase texts write is denied (not in the tool set)', () => {
  const d = gateToolCall(state([prospect()]), 'mcp__supabase__insert', { table: 'texts', published: true });
  assert.equal(d.allow, false);
});

test('read tools are allowed', () => {
  const s = state([prospect()]);
  assert.equal(gateToolCall(s, TOOL.readProspects, {}).allow, true);
  assert.equal(gateToolCall(s, TOOL.readCorpus, { authorName: 'Athanasius' }).allow, true);
});

test('fetch: allowed for a gated prospect with an allowlisted pinned edition', () => {
  const d = gateToolCall(state([prospect()]), TOOL.fetch, { prospectId: 'p1' });
  assert.equal(d.allow, true);
});

test('fetch: denied for an unknown / un-gated prospectId', () => {
  const d = gateToolCall(state([prospect()]), TOOL.fetch, { prospectId: 'nope' });
  assert.equal(d.allow, false);
});

test('fetch: denied when the prospect pinned an off-allowlist edition', () => {
  const p = prospect({ clearedEditionUrl: 'https://onthewing.org/luther.htm' });
  const d = gateToolCall(state([p]), TOOL.fetch, { prospectId: 'p1' });
  assert.equal(d.allow, false);
});

test('fetch: a URL supplied in the tool input CANNOT override the pinned edition', () => {
  // The prospect pinned an off-allowlist source; supplying a good URL must not help.
  const p = prospect({ clearedEditionUrl: 'https://evil.example/x' });
  const d = gateToolCall(state([p]), TOOL.fetch, {
    prospectId: 'p1',
    url: 'https://archive.org/details/legit',
  });
  assert.equal(d.allow, false);
});

test('run_pipeline_script: clean and detect are allowed', () => {
  const s = state([prospect()]);
  assert.equal(gateToolCall(s, TOOL.runScript, { prospectId: 'p1', action: 'clean' }).allow, true);
  assert.equal(gateToolCall(s, TOOL.runScript, { prospectId: 'p1', action: 'detect' }).allow, true);
});

test('run_pipeline_script: correction-apply is denied', () => {
  const d = gateToolCall(state([prospect()]), TOOL.runScript, { prospectId: 'p1', action: 'apply-reviewed' });
  assert.equal(d.allow, false);
});

test('run_pipeline_script: pipeline-import is denied', () => {
  const s = state([prospect()]);
  assert.equal(gateToolCall(s, TOOL.runScript, { prospectId: 'p1', action: 'import' }).allow, false);
  assert.equal(gateToolCall(s, TOOL.runScript, { prospectId: 'p1', action: 'pipeline-import' }).allow, false);
});

test('run_pipeline_script: a publish/DB-write action is denied', () => {
  const s = state([prospect()]);
  assert.equal(gateToolCall(s, TOOL.runScript, { prospectId: 'p1', action: 'publish' }).allow, false);
  assert.equal(gateToolCall(s, TOOL.runScript, { prospectId: 'p1', action: 'frobnicate' }).allow, false);
});

test('stage_draft: allowed for a gated prospect; a path outside staging is denied', () => {
  const s = state([prospect()]);
  assert.equal(gateToolCall(s, TOOL.stage, { prospectId: 'p1' }).allow, true);
  assert.equal(gateToolCall(s, TOOL.stage, { prospectId: 'p1', path: 'app/page.tsx' }).allow, false);
  assert.equal(gateToolCall(s, TOOL.stage, { prospectId: 'p1', path: '../../etc/passwd' }).allow, false);
  assert.equal(gateToolCall(s, TOOL.stage, { prospectId: 'p1', path: 'content/staging/on-the-incarnation-athanasius/metadata.yml' }).allow, true);
});
