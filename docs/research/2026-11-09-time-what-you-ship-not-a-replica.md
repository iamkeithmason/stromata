# Time what you ship, not a replica

*The Stromata · 9 November 2026 · from building ranked body search
([#213](https://github.com/iamkeithmason/stromata/pull/213), migrations 036 and 037)*

## In one line

Measuring the backlog card's suggested design before building it caught a search that would have taken
2.8 s, but the replacement was measured on a stand-in, and the real function shipped four to seven times
slower than that measurement until it was timed where readers would actually hit it.

## Where it came from

The card "Search: whole-word body matching with relevance ranking (backend)" proposed a full-text search
built on an expression index, with no stored column. Keith asked for it to be built, merged and applied
on the same day.

## What we did

1. **Measured the card's design first**, inside transactions on production that rolled themselves back
   (a `DO` block that raises its results as an error, because the tool returns only the last statement).
   The expression index matched in 2 ms, but ranking re-parsed every matching body: 1.4 s to rank and
   2.8 s for a full search.
2. **Measured an alternative**, a stored `tsvector`. To avoid locking the live table, it was built on a
   temporary copy, and the search was timed as a plain query: 0.39 s for "alms", 0.68 s for "god". On
   that number we shipped the stored column, inside a SQL function.
3. **Applied it and timed it through the public API, as a reader's search would run it.** It took 1.5 s
   for "alms" and 2.7 s for "god". Our own measurement had been wrong.
4. **Timed the parts inside the real wrapper.** Ranking took 49 ms, excerpts 323 ms, the plain query
   0.56 s, and the function 2.6 s. Three suspects were tested and cleared in turn: the CTE blocking the
   index, the body carried through the sort, and a generic plan. Then two real causes:
   - Postgres inlines a CTE referenced once. The final `SELECT` named the headline three times, so
     every `ts_headline` ran three times.
   - The has-before and has-after flags used `strpos(body, excerpt)` across 52 KB bodies, which cost
     about 2 s for 20 rows.
5. **Fixed both in migration 037:** `materialized` CTEs, and `starts_with`/`right` in place of `strpos`.
   The flags matched the exact version on all 50 test rows. The function now takes 0.19–0.60 s in the
   database and 0.85–1.3 s through the API (about 0.5 s of that is the API's own floor).

## What worked

- **Measuring the card's plan before building it.** The written design would have shipped a 2.8 s
  search. A card is a hypothesis about cost as well as about value.
- **Rolled-back trials on the real data**, using the raise-the-result trick. They gave real numbers
  with no lasting change.
- **Timing at the boundary the user hits.** Only the API timing caught the regression. Every earlier
  number was a component, or a copy.
- **Timing the parts inside the real wrapper** once the parts' sum did not match the whole. The gap,
  0.56 s as a query against 2.6 s as a function, pointed straight at the wrapper.

## What didn't, and why

- **The benchmark measured a replica.** A plain query on a temporary table is not a SQL function on
  the live table. The inlining that tripled `ts_headline` happens only in the function's shape, so
  the replica could not show it.
- **Three plausible hypotheses were tested before the real cause.** Each fix was reasonable, and each
  was refuted in one rolled-back run. That was cheap, but the order could have been better: profile
  each expression in the final `SELECT` first, then the plan.
- **A migration was applied before the shipped artefact had been timed.** The page had a fallback, so
  readers saw no harm. Without the fallback, a slow search would have gone live.

## The principle, stated generally

A measurement of a stand-in is a hypothesis about the real thing. Time the artefact you ship, in the
wrapper and at the boundary its users hit, before you call it done. When the sum of the parts does not
match the whole, the wrapper is doing work you did not write.

## Where else it fits

- Any SQL function or view: time `select * from fn(...)` through the client the app uses, not the query
  pasted into an editor.
- Prompt and agent changes: a prompt tested in isolation is not the prompt inside the pipeline, with its
  system prompt and tools.
- Paideia and the portfolio: any benchmark taken on a fixture, or on a dev build, rather than on the
  deployed path.

## Rules of thumb

- Measure the card's plan before building it. Then measure what you built, where it runs.
- Benchmark the wrapped artefact (the function, the endpoint, the page), not the query inside it.
- If the parts are fast and the whole is slow, time each expression of the outer select before
  theorising about plans.
- In Postgres, a CTE referenced once is inlined. If its output is used several times, mark it
  `materialized`, or the expensive call runs once per use.
- Ship a fallback behind any new database dependency, so a slow or missing piece degrades rather than
  breaks.
