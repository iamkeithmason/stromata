/**
 * card-names — does every PR merged into main say which backlog card it builds?
 *
 * The weekly reconciliation flips a Feature Backlog card to Built only where a
 * PR or CHANGELOG entry names it (CLAUDE.md, "Keeping the record current"). A PR
 * that builds a card and does not name it leaves the card Planned forever, and
 * nothing notices: PR #183 did exactly that. So the convention needs a check,
 * and a check needs a state it can fail on. That is why a PR that builds no
 * card says `Card: none` rather than leaving the line out: a missing line is
 * the one thing the check reports, never a pass.
 *
 * Routine PRs (release promotions, the analytics digest, pipeline runs, Sourcer
 * bundles, screens refreshes) are exempt by title, since none of them builds a
 * card and they are opened by routines, not sessions.
 *
 * Pure: no network. scripts/check-card-names.mjs feeds it PRs from GitHub.
 */

/** Titles of PRs opened by routines. None of them builds a backlog card. */
export const ROUTINE_TITLES = [
  /^Release \d{4}-\d{2}-\d{2}/,
  /^Analytics digest/,
  /^Pipeline run \d{4}-\d{2}-\d{2}/,
  /^Sourcer\b/,
  /^Screens reference/,
];

/** Every `Card:` line in a PR body, in order. `Card: none` comes back as 'none'. */
export function cardLines(body) {
  const out = [];
  for (const raw of String(body || '').split(/\r?\n/)) {
    const m = raw.match(/^\s*(?:[-*]\s*)?\**Card\**\s*:\s*\**\s*(.+?)\s*$/i);
    if (!m) continue;
    const value = m[1].replace(/^`|`$/g, '').trim();
    out.push(/^none\b/i.test(value) ? 'none' : value);
  }
  return out;
}

/**
 * Classify one PR: { number, title, body } →
 *   { status: 'named' | 'none' | 'routine' | 'missing', cards: string[] }
 * Only 'missing' fails the check.
 */
export function classify(pr) {
  if (ROUTINE_TITLES.some((re) => re.test(pr.title || ''))) return { status: 'routine', cards: [] };
  const lines = cardLines(pr.body);
  const named = lines.filter((c) => c !== 'none');
  if (named.length) return { status: 'named', cards: named };
  if (lines.includes('none')) return { status: 'none', cards: [] };
  return { status: 'missing', cards: [] };
}

/** Classify a list of PRs and say whether the check fails. */
export function summarise(prs) {
  const rows = prs.map((pr) => ({ number: pr.number, title: pr.title, ...classify(pr) }));
  const missing = rows.filter((r) => r.status === 'missing');
  return { rows, missing, fail: missing.length > 0 };
}
