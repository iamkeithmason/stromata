# The build is a recurring job, and merges set its run count

*The Stromata · 6 October 2026 · from root-causing the 21 Sep Supabase egress spike ([#144](https://github.com/iamkeithmason/stromata/pull/144))*

## In one line

A deploy pipeline is a job that reads your metered services every time it runs, and with agents
in the loop its run count is set by how often work merges, which nobody decides. So a per-build
cost that looks negligible can spend a month's allowance in a day.

## Where it came from

The Supabase organisation Stromata shares with Paideia went over its 5 GB free-plan egress
(5.93 GB). The per-project chart put almost all of it on one Stromata day, 21 Sep: ~3.5 GB uncached
and ~1.1 GB cached. Log Query was already at 249.7 GB of a 100 GB allowance, so the diagnosis
could not use logs.

Root-causing it from git history and cheap SQL took about twenty minutes. 21 Sep had **29 merges
to `main`** (2 on 15 Sep, 5 on 22 Sep), and previews still built on every push. Until that
evening's fix, every listing page selected `texts.body` to print "approx. N min read", and the
theme, era, tradition and location pages are prerendered at build. A `sum(octet_length(body))`
grouped the way those pages group put **one build at ~220 MB**, with themes alone at 131 MB
because a text sits under several themes. About 40 builds ran on the old code; at ~3:1 compression
that is ~3 GB. The same day's session that wrote the fix had verified it by scanning ~29.6 GB of
logs.

The fix from 21 Sep (a stored `word_count`) was correct, and two weeks later two things were
still true. Nothing stopped a listing page selecting `body` again: the rule lived in a CHANGELOG
entry. And search still selected `body` for up to 10 hits per query to cut a 160-character
snippet, a known cost recorded in a code comment as "deliberate".

## What we did

- **Diagnosed with instruments off the exhausted meter.** We used git log (merge counts per day,
  the fix's timestamp), CHANGELOG, and four SQL queries on column sizes and storage metadata, and
  ran no log queries at all. We said plainly which parts were certain (the mechanism, the per-build
  size) and which were inferred (the split between builds, verification work and crawlers).
- **Turned the fix into a guard.** `lib/supabase/no-body-in-listings.test.ts` scans every public
  page and route for a `.select()` that returns `body`, resolving `const` and composed select
  strings, plus `select('*')` on `texts`. It has a short allowlist that must name real files.
- **Proved the guard both ways**: planting `body` in the theme page's query turned it red, and so
  did planting `select('*')`.
- **Sent the answer across the meter instead of its inputs**, three times over: `word_count` instead
  of bodies (the 21 Sep fix); a `text_excerpts` SQL function that returns the window around a
  search hit instead of the body (590 kB → 5.9 kB per 10-hit search); and portraits stored at
  display size instead of the original scans (55 MB bucket, up to 5 MB each).
- **Shrank the allowlist**: once search had its excerpt function, it left the guard's exemptions.

## What worked

**Reconstructing the bill from the change history.** Merges per day multiplied by bytes per build
reproduced the spike to within the uncertainty of the compression ratio. Each input came from a
free instrument: `git log --first-parent`, and column sizes from SQL.

**Checking the planted fault.** The first sabotage run passed when it should have failed. The
guard was fine; the plant was in the page's TypeScript type, not its query. Reading why the
mutation did not fire, rather than trusting the green, caught it in one step. Two real regex bugs
in the guard (capture-group numbering, a comment counted as code) surfaced the same way.

## What didn't, and why

**A correct fix with no guard is a fix on probation.** The 21 Sep entry explained the cause
exactly, and nothing in CI would have noticed a new listing page selecting `body`. Prose recorded
the lesson but could not hold it in place.

**"Deliberate" cost recorded in a comment is still cost.** Search's body query was a
reasonable trade on the day, and its comment said so. The comment stopped anyone *removing* the
query by accident, but it priced nothing: nobody had written down that one search could move
several MB.

**The cost was invisible at every point of decision.** No merge looked expensive; no build
reported what it read. The price only arrived on the usage page two weeks later, aggregated across
two projects.

## The principle, stated generally

**Anything that runs per merge is a recurring job, and its frequency is now set by agent
throughput.** CI, builds, previews, prerendering and cache warm-ups all read from metered services
every time they run. When an agent can land 29 merges in a day, a per-run cost that was negligible
at human pace becomes the dominant line on the bill. Price the per-run cost, and multiply by the
merge rate you actually have, not the one you used to have.

**Cross the meter with answers, not inputs.** Whenever a consumer derives a small value from a large
one (a count from a body, a snippet from a text, a thumbnail from a scan), do the derivation where
the large value lives and send only the result.

**Diagnose a metered overrun with instruments that don't read the same meter.** Change history,
schema metadata and column-size queries are free, and they usually suffice to reconstruct the bill.

## Where else it fits

- **Any CI pipeline that calls paid APIs**: LLM-graded tests, screenshot services, seeded databases.
  Their cost scales with pushes, not with users.
- **Static-site and ISR builds** against any metered backend, including CMS APIs with request quotas.
- **Agent sessions that verify against production**: a verification loop runs once per attempt,
  so its cost multiplies by the number of attempts.
- **Any API that returns a large field for a client to summarise**: send the summary.
- **Postmortems where the logging budget is itself exhausted.**

## Rules of thumb

1. Before calling a cost fixed, write the check that would catch its return, and plant the fault
   once to watch it fire. If the plant doesn't fire, find out why before trusting the green.
2. For anything that runs per merge, estimate bytes (or tokens, or CPU) per run × merges per day
   at today's rate.
3. If a client throws away most of what it fetched, move the derivation to the server.
4. A cost kept "on purpose" gets a number next to it, and goes on the guard's allowlist, which only
   shrinks.
5. When the meter you're diagnosing is also the one you'd diagnose with, reach for git history and
   SQL metadata first.
