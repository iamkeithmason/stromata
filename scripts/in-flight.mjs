#!/usr/bin/env node
/**
 * in-flight — before acting on a card, a ticket or a content change, look for
 * work another session has already done or is doing. Read-only; writes nothing.
 *
 *   npm run in-flight -- homily 50
 *   npm run in-flight -- on-the-thoughts --json
 *
 * Give two or three distinctive words: a title, a slug, an author. One report
 * covers open PRs (any age) and PRs merged in the last 7 days, remote branches
 * pushed in the last 3 days, prospect-queue entries, and run logs from the last
 * 14 days. Exits 0 always; the last line is the verdict.
 *
 * Meters: two `gh api search/issues` calls (GitHub search, about 30 a minute),
 * one `git fetch`, and local files. No Supabase or Vercel. The database is not
 * checked: when the work touches texts, also run one slug query by hand
 * (Supabase MCP `execute_sql`). The judgement half is scripts/lib/in-flight.mjs.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReport, queryWords, WINDOWS } from './lib/in-flight.mjs';

const REPO = 'iamkeithmason/stromata';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const QUEUE = path.join(ROOT, 'scripts/ingestion/prospect-queue.json');
const RUN_LOGS = path.join(ROOT, 'scripts/ingestion/run-log');

const argv = process.argv.slice(2);
const json = argv.includes('--json');
const raw = argv.filter((a) => !a.startsWith('--'));
const words = queryWords(raw);

if (!words.length) {
  console.log('Usage: npm run in-flight -- <two or three distinctive words>');
  process.exit(0);
}

function sh(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], cwd: ROOT });
}

function search(q) {
  const out = sh('gh', ['api', '-X', 'GET', 'search/issues', '-f', `q=${q}`, '-f', 'per_page=50',
    '--jq', '.items[] | {number, title, body, state, html_url, merged_at: .pull_request.merged_at}']);
  return out.split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

function pulls() {
  try {
    const since = new Date(Date.now() - WINDOWS.mergedDays * 864e5).toISOString().slice(0, 10);
    const terms = raw.join(' ');
    return [
      ...search(`repo:${REPO} is:pr is:open ${terms}`),
      ...search(`repo:${REPO} is:pr is:merged merged:>=${since} ${terms}`),
    ];
  } catch {
    return null;
  }
}

function branches() {
  try {
    try { sh('git', ['fetch', '-q', '--prune', 'origin']); } catch { /* offline: use what is known */ }
    return sh('git', ['for-each-ref', 'refs/remotes/origin', '--format=%(refname:short)%09%(committerdate:iso-strict)%09%(subject)'])
      .split('\n').filter(Boolean)
      .map((l) => { const [name, date, ...s] = l.split('\t'); return { name, date, subject: s.join('\t') }; })
      .filter((b) => b.name !== 'origin/HEAD');
  } catch {
    return null;
  }
}

function prospects() {
  try { return JSON.parse(readFileSync(QUEUE, 'utf8')).prospects; } catch { return null; }
}

function runLogs() {
  try {
    return readdirSync(RUN_LOGS).filter((f) => f.endsWith('.md'))
      .map((f) => ({ file: `scripts/ingestion/run-log/${f}`, text: readFileSync(path.join(RUN_LOGS, f), 'utf8') }));
  } catch {
    return null;
  }
}

const report = buildReport({ words, pulls: pulls(), branches: branches(), prospects: prospects(), runLogs: runLogs() });

if (json) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const section = (title, rows) => {
  if (!rows.length) return;
  console.log(`\n${title}`);
  for (const r of rows) console.log(`  ${r}`);
};
console.log(`In flight for: ${words.join(' ')}`);
section('Open pull requests', report.openPRs.map((p) => `#${p.number} ${p.title}  ${p.html_url ?? ''}`));
section(`Merged in the last ${WINDOWS.mergedDays} days`, report.mergedPRs.map((p) => `#${p.number} ${p.title} (merged ${p.merged_at.slice(0, 10)})`));
section(`Branches pushed in the last ${WINDOWS.branchDays} days`, report.branches.map((b) => `${b.name} (${b.date.slice(0, 10)}): ${b.subject}`));
section('Prospect queue', report.prospects.map((p) => `${p.id}: ${p.status}${p.added ? ` (added ${p.added})` : ''}`));
section(`Run logs, last ${WINDOWS.runLogDays} days`, report.runLogs.flatMap((l) => [l.file, ...l.lines.map((x) => `    ${x}`)]));
if (report.unchecked.length) console.log(`\nNot checked: ${report.unchecked.join(', ')}`);
console.log(`\nVerdict: ${report.verdict}`);
console.log('The database is not checked. If this touches texts, query the slug in Supabase too.');
