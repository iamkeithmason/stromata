/**
 * in-flight.mjs — the judgement half of `npm run in-flight`
 *
 * `scripts/in-flight.mjs` gathers (GitHub search, git, the prospect queue, the
 * run logs); this module decides what matches and what the verdict is. It is
 * pure and unit-tested, like `card-names.mjs` and `url-check.mjs`, because a
 * check that quietly looks in the wrong place prints "nothing in flight" and is
 * believed.
 *
 * Why it exists. Sessions kept redoing work another session had done or was
 * doing: two builds of "Mid-text navigation on phones" on 2 Nov 2026 (#184 and
 * #187), an import of two Ephesians homilies a pipeline run had imported the
 * day before (16 Nov), and a "fix Homily 50 now" whose database update ran
 * minutes after #236 had already made it (17 Nov). Each could have been caught
 * by a two-minute look; the look was prose in one command, so nothing else did
 * it. This makes the look one command any session can run first.
 *
 * MATCHING. The query is two or three distinctive words (a title, a slug, an
 * author). A source matches when EVERY query word starts some word of its text,
 * case-insensitively, with hyphens, underscores and slashes read as spaces, so
 * "homily 50" finds the slug `homily-50-on-matthew` and "ephesian" finds
 * "Ephesians". Every-word, not any-word: "homily" alone would list half the
 * corpus, and the point is a short list a session will actually read.
 */

/** Windows, in days, from the card: merged PRs 7, branches 3, run logs 14. */
export const WINDOWS = { mergedDays: 7, branchDays: 3, runLogDays: 14 };

const DAY = 24 * 60 * 60 * 1000;

/** Split a query into lower-case words, dropping empties. */
export function queryWords(input) {
  const raw = Array.isArray(input) ? input.join(' ') : String(input ?? '');
  return wordsOf(raw);
}

function wordsOf(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[-_/.:#]+/g, ' ')
    .split(/[^\p{L}\p{N}']+/u)
    .map((w) => w.replace(/^'+|'+$/g, ''))
    .filter(Boolean);
}

/** True when every query word starts some word of `text`. */
export function matches(text, words) {
  if (!words.length) return false;
  const have = wordsOf(text);
  return words.every((q) => have.some((w) => w.startsWith(q)));
}

function daysAgo(iso, now) {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? (now - t) / DAY : Infinity;
}

/**
 * PRs from GitHub search, `{number, title, body, state, merged_at, html_url}`.
 * Open PRs match at any age; merged ones only within the window.
 */
export function matchPullRequests(items, words, now = Date.now()) {
  const open = [];
  const merged = [];
  for (const p of items ?? []) {
    if (!matches(`${p.title}\n${p.body ?? ''}`, words)) continue;
    if (p.state === 'open') open.push(p);
    else if (p.merged_at && daysAgo(p.merged_at, now) <= WINDOWS.mergedDays) merged.push(p);
  }
  const byNumber = (a, b) => b.number - a.number;
  return { open: open.sort(byNumber), merged: merged.sort(byNumber) };
}

/** Remote branches `{name, date, subject}`, pushed within the window. */
export function matchBranches(branches, words, now = Date.now()) {
  return (branches ?? [])
    .filter((b) => daysAgo(b.date, now) <= WINDOWS.branchDays)
    .filter((b) => matches(`${b.name}\n${b.subject ?? ''}`, words))
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
}

/** Prospect-queue entries whose id, title, collection slug or author match. */
export function matchProspects(prospects, words) {
  return (prospects ?? []).filter((p) =>
    matches([p.id, p.title, p.collection_slug, p.author].filter(Boolean).join('\n'), words),
  );
}

/** The date a run-log file is for, from its `YYYY-MM-DD…` name, or null. */
export function runLogDate(file) {
  const m = /(\d{4}-\d{2}-\d{2})/.exec(String(file).split('/').pop());
  return m ? m[1] : null;
}

/**
 * Run logs `{file, text}` dated within the window that mention the words,
 * each with the matching lines (up to three) so the reader sees why.
 */
export function matchRunLogs(logs, words, now = Date.now()) {
  const out = [];
  for (const log of logs ?? []) {
    const date = runLogDate(log.file);
    if (!date || daysAgo(`${date}T23:59:59Z`, now) > WINDOWS.runLogDays) continue;
    if (!matches(log.text, words)) continue;
    // Lines holding every word say most; failing those, lines holding any.
    const all = String(log.text).split('\n').filter((l) => l.trim());
    const full = all.filter((l) => matches(l, words));
    const lines = (full.length ? full : all.filter((l) => words.some((q) => matches(l, [q]))))
      .slice(0, 3)
      .map((l) => l.trim().slice(0, 160));
    out.push({ file: log.file, date, lines });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Build the report from whatever was gathered. A source that could not be read
 * is passed as `null` and named in `unchecked`: the verdict never says "nothing
 * in flight" about a place it did not look.
 */
export function buildReport({ words, pulls, branches, prospects, runLogs, now = Date.now() }) {
  const unchecked = [];
  const pr = pulls == null ? (unchecked.push('GitHub pull requests'), { open: [], merged: [] }) : matchPullRequests(pulls, words, now);
  const br = branches == null ? (unchecked.push('remote branches'), []) : matchBranches(branches, words, now);
  const pq = prospects == null ? (unchecked.push('prospect queue'), []) : matchProspects(prospects, words);
  const rl = runLogs == null ? (unchecked.push('run logs'), []) : matchRunLogs(runLogs, words, now);
  const count = pr.open.length + pr.merged.length + br.length + pq.length + rl.length;
  return { words, openPRs: pr.open, mergedPRs: pr.merged, branches: br, prospects: pq, runLogs: rl, count, unchecked, verdict: verdict(count, unchecked) };
}

export function verdict(count, unchecked = []) {
  if (count > 0) return `${count} match${count === 1 ? '' : 'es'}: read them before acting`;
  if (unchecked.length) return `nothing found, but not checked: ${unchecked.join(', ')}`;
  return 'nothing in flight';
}
