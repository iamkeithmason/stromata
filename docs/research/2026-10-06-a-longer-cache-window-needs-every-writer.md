# A longer cache window is a promise every writer has to keep

*The Stromata · 6 October 2026 · from two rounds of cutting Vercel Fluid Active CPU after going over the Hobby allowance (CHANGELOG 2026-09-29 and 2026-10-04)*

## In one line

The first CPU fix was sized against the day's peak instead of the allowance and fell short; the second fix needed a week-long cache, which would have turned seven admin editors that had never refreshed their pages into a week of "my edit didn't save" — so the invalidation work had to ship with the cache, not after it. The effect of both fixes is **not yet measured**.

## Where it came from

Stromata went over the Hobby allowance for Fluid Active CPU: 5h50m in the 30 days to 29 Sep, stepping up sharply on 21 Sep. Vercel Observability (production, 12h) named two routes: `/texts/[slug]` renders and the PDF download routes. The 21 Sep step lined up with merge rate to `main` — 17 merges in 1–19 Sep, 37 in 20–29 Sep — because every production deploy starts with an empty page cache and crawlers then re-render the site.

## What we did

- **29 Sep, round one:** daily page revalidation (was hourly), the public Supabase data cache moved with it, crawlers disallowed from the download routes, downloads CDN-cached for a day, previews opt-in (`[preview]` tag).
- **4 Oct, round two:** the first round halved the daily peak, but usage sat at ~12–17 min/day against a ~8 min/day budget (4h Hobby allowance over the month), and early September had already been at the limit. So: weekly page revalidation (`604800`) with the data cache matched; weekly PDF cache; `revalidateEntity` wired into seven admin routes that had never called `revalidatePath`; sibling `/texts/[slug]` pages marked stale when a collection changes; and production builds skipped for commits that touch only a short allowlist (CHANGELOG, CLAUDE.md, digest reports, pipeline run-log/queue/output), replayed against the last 79 production commits first.

## What worked

- **Reading the platform's per-route numbers before choosing a fix.** The sitemap looked like an obvious thing to cache; measured, it cost ~7 s of CPU a day and was left alone. Text pages (262 invocations, ~2 min) and PDFs (33 invocations, 73 s; ~1 s per text PDF, ~9 s per collection PDF) were the real cost.
- **Replaying the build-skip rule over history** (79 production commits: skipped the four Monday digests, the pipeline runs and two docs-only commits, and wrongly skipped none) before trusting it, then 14 tests built from awkward git states (renames, merge commits, a root commit, look-alike paths). The rule is "every doubt builds".
- **Finding the writers by grep before lengthening the window.** `revalidatePath` existed for texts and authors only. Invisible under an hourly window, it would have been a week-long silent bug.

## What didn't, and why

- **Round one was sized against the peak, not the limit.** "Halved the daily peak" read as success; the question that mattered — is it under ~8 min/day? — was never asked, and the answer was no. A fix measured against the previous state says nothing about the constraint.
- **Two settings that must move together look independent.** Next refreshes a page as often as its *shortest* data-cache entry, so changing only the page `revalidate` would have done nothing. It was caught by reading how the cache layers compose, not by a test.
- **A known gap stays a gap.** A direct DB edit from a CLI script calls no `revalidatePath` and now takes up to a week to show; PDF edits don't purge the CDN. Both were accepted with Keith's agreement, and are written down rather than fixed.
- **Not verified as of this write-up:** the CPU effect itself (needs about a week of daily bars) and `revalidatePath(pattern, 'page')` against a live deployment. Neither claim should be repeated as a result.

## The principle, stated generally

Making a cache longer is a promise that every write path will say when it changes something. Before extending a TTL, enumerate the writers and prove each one invalidates; the length of the window is the length of the bug if one doesn't. And size any cost fix against the limit you are trying to get under, not against the figure you started from.

## Where else it fits

Any ISR/CDN/data-cache TTL change (Paideia's snapshot-plus-signature surfaces already do this by construction); build-skip or path-allowlist rules in any CI/deploy config; any quota-driven work, where "better than before" is a different claim from "under the cap"; any admin editor added later (the check belongs next to the list of surfaces, `entitySurfaces`).

## Rules of thumb

1. Before lengthening a cache window, list every write path to the cached data and confirm each calls the invalidation; add the missing ones in the same change.
2. State the budget as a number before the fix, and report the result against that number, not against yesterday.
3. Pick targets from the platform's own per-route cost data; a plausible suspect measured at seconds a day is not the problem.
4. Coupled settings (page window + data-cache window) change together; the shortest governs.
5. A skip rule gets replayed over real history and fails closed: every doubt builds.
6. Say what is not yet measured, with the date it can be.
