#!/usr/bin/env node
/**
 * check-card-names — every PR merged into main since release last moved must say
 * which backlog card it builds: `Card: <exact Feature title>`, or `Card: none`.
 * Exits 1 if any PR has neither (routine PRs are exempt by title).
 *
 *   node scripts/check-card-names.mjs                 # since origin/release last moved
 *   node scripts/check-card-names.mjs --since=2026-11-17
 *   node scripts/check-card-names.mjs --json
 *
 * Run by the Monday release routine before it opens the promotion PR, and by the
 * weekly review. Reads PR bodies through `gh api search/issues` (the one GitHub
 * path routines have in a cloud session); costs one or two search calls, no
 * Supabase or Vercel meter. The judgement half, unit-tested, is
 * scripts/lib/card-names.mjs.
 *
 * PRs merged before CONVENTION_START predate `Card: none` and are listed but
 * never fail the check.
 */
import { execFileSync } from 'node:child_process';
import { summarise } from './lib/card-names.mjs';

const REPO = 'iamkeithmason/stromata';
const CONVENTION_START = '2026-11-18';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));

function releaseMoved() {
  try {
    execFileSync('git', ['fetch', '-q', 'origin', 'release'], { stdio: 'ignore' });
    return execFileSync('git', ['log', '-1', '--format=%cI', 'origin/release'], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

const since = args.since || releaseMoved();
if (!since) {
  console.error('check-card-names: could not read when origin/release last moved; pass --since=YYYY-MM-DD');
  process.exit(2);
}

let items;
try {
  const q = `repo:${REPO} is:pr is:merged base:main merged:>=${since.slice(0, 19)}`;
  const out = execFileSync('gh', ['api', '-X', 'GET', 'search/issues', '-f', `q=${q}`, '-f', 'per_page=100', '--paginate',
    '--jq', '.items[] | {number, title, body, merged_at: .pull_request.merged_at}'], { encoding: 'utf8' });
  items = out.split('\n').filter(Boolean).map((l) => JSON.parse(l));
} catch (err) {
  // Never a pass: a check that could not ask GitHub has checked nothing.
  console.error(`check-card-names: GitHub search failed (${err.message.split('\n')[0]}); nothing was checked`);
  process.exit(2);
}

const before = items.filter((p) => (p.merged_at || '') < CONVENTION_START);
const checked = items.filter((p) => (p.merged_at || '') >= CONVENTION_START);
const { rows, missing, fail } = summarise(checked);

if (args.json) {
  console.log(JSON.stringify({ since, checked: rows, beforeConvention: before.map((p) => p.number), missing, fail }, null, 2));
} else {
  console.log(`PRs merged into main since ${since} (${items.length}; ${before.length} before the Card: none convention of ${CONVENTION_START})\n`);
  for (const r of rows.sort((a, b) => a.number - b.number)) {
    const mark = r.status === 'missing' ? '✗' : '✓';
    const what = r.status === 'named' ? r.cards.join(' · ') : r.status;
    console.log(`  ${mark} #${r.number} ${r.title.slice(0, 60)} — ${what}`);
  }
  for (const p of before) console.log(`  · #${p.number} ${p.title.slice(0, 60)} — before the convention, not checked`);
  console.log(fail
    ? `\n${missing.length} PR(s) name no card: add \`Card: <exact title>\` or \`Card: none\` to the description.`
    : '\nEvery checked PR names its card or says Card: none.');
}
process.exit(fail ? 1 : 0);
