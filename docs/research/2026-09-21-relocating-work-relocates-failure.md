# Moving work earlier moves failure later

*The Stromata · 21 September 2026 · from the Supabase egress fix ([#118](https://github.com/iamkeithmason/stromata/pull/118)) and the empty library it shipped an hour later*

## In one line

An optimisation that moves work from request-time to build-time moves the
*failure* too — from a bad minute that heals itself into a bad artefact that is
served until someone rebuilds — and error handling that renders "nothing" for
"the query failed" is what turns the one into the other.

## Where it came from

Supabase's free-plan egress ran to 11.07 GB against a 5 GB allowance. The cause
was real and mundane: every listing page selected each text's full `body` to
compute "approx. N min read", so `/texts` downloaded the whole 29 MB corpus per
request. The fix stored a `word_count` column, dropped `body` from the
listings, cached the public client's reads, and — the change that matters here —
made `/texts` and `/authors` statically prerendered instead of dynamic.

Measured afterwards, it worked: `/texts` went from a 29 MB query that had
already begun timing out to 310 kB, and eight identical page requests cost
Supabase three API calls instead of twenty-four.

Then, within the hour, Supabase's REST API stopped answering — HTTP 522 to
everything, a one-row `select id limit 1` included, while the management API
still reported `ACTIVE_HEALTHY`. A deploy ran during that window. The site came
back up serving **"Library — 0 texts — No texts match these filters"** at HTTP
200, `/authors` likewise, and 404s on theme pages that exist.

Nothing in the diff was wrong. The outage was upstream and would have passed.
What the diff had changed was what an outage *costs*: before, those pages were
rendered per request, so a broken minute was a broken minute. After, they were
prerendered, so a broken minute became a build artefact.

## What we did

- **Verified the handoff instead of implementing it.** The diagnosis came from
  another AI and was substantially right, but checking it against the database
  found two things it had not claimed: `/texts` was not merely expensive, its
  query had already started returning `57014 statement timeout` — the page was
  *broken in production*; and the biggest theme pages were 500ing for an
  unrelated reason, a `id=in.(…)` filter built from 264 UUIDs making a ~10 kB
  URL. Neither was in the report. Both were the more severe findings.
- **Measured the caching rather than reading it.** Several pages already carried
  `export const revalidate = 3600`. On a production build, three requests for
  the same route cost three round trips: a page that reads `searchParams`, or
  that has no `generateStaticParams`, is classed dynamic and never enters the
  route cache, so the directive was inert. It looked like caching and was not.
  The fix went to the layer that actually governs it — the fetch.
- **After the incident, made the failure loud.** `lib/supabase/query.ts`
  (`orThrow`) throws on a query error instead of yielding `data ?? []`. At build
  time that fails the deploy; during regeneration it aborts and Next keeps
  serving the last good copy. Where a page gated `notFound()` on a single row,
  `.single()` became `.maybeSingle()` — because `.single()` reports *zero rows*
  as an error, so a naive guard would have turned a genuinely missing slug into
  a 500.
- **Reproduced the incident to check the fix.** With Supabase still down, the
  build now exits 1 with `Supabase query failed for a theme page: an HTML error
  page from the gateway … Supabase was most likely unreachable`. The same
  conditions that had produced a green build shipping an empty library now
  produce no build at all.

## What worked

**Re-deriving the claim from the source.** The handoff was a good report and
still under-described the problem by two severe bugs. Treating it as a
hypothesis with evidence attached — and spending the twenty minutes to run its
queries — is what found them.

**Preferring a mechanism that cannot drift.** `word_count` is a
`GENERATED ALWAYS … STORED` column rather than a backfilled one, so admin edits,
pipeline imports and direct SQL all recompute it and no code path can forget to.
Its SQL mirrors the JavaScript exactly, and a test pins the pair against figures
Postgres actually returned. That part of the change has no failure mode that
needs watching.

**Reproducing the failure before trusting the fix.** The build failing loudly,
*while the outage was still happening*, is the only evidence that the guard
works that does not depend on reasoning about it.

## What didn't, and why

**Making the pages static was a net win that shipped a regression, and both were
the same decision.** The upside — one query an hour instead of one per request —
is exactly the property that made the outage persistent. We reasoned carefully
about the *cost* of the change and not at all about its *failure mode*, because
the change was framed as a performance fix and performance fixes are judged on
throughput.

**The silent-empty default did the actual damage.** `const { data } = await
supabase…` followed by `data ?? []` discards `error`. Under a dynamic page that
is merely a bad minute. Under a prerender it is a confident, complete, wrong
page with HTTP 200 — the worst available outcome, because nothing anywhere
reports a problem.

**The lesson was already written down, and that was not enough.** This repo's
`lib/supabase/public-columns.ts` carries a long comment about precisely this
shape: a permission refusal was "indistinguishable from 'no such text'", so
every reading page answered 404 while the indexes worked, and it "shipped
silently and stayed silent". That note fixed the *cause* it came from — the
column grants — and the *shape* returned through a different door sixteen days
later, with an outage in place of a refusal. Prose described the failure; it
could not prevent a new instance of it. The repo already knows this — it is the
argument for its own colour-literal lint rule, that "a documented convention is
a probability an LLM follows most of the time; a lint rule in CI is a contract"
— and this is that argument arriving a second time, from a different direction.

## The principle, stated generally

**Every optimisation that relocates work also relocates failure, and the two
move in opposite directions.** Pushing work earlier — build-time rendering,
precomputation, caching, materialising — buys throughput by *committing to an
answer sooner*. The same commitment means an upstream failure at that moment is
no longer absorbed by the next request; it is captured and served. Ask of any
such change not only "what does this make cheaper?" but "what does this make
*permanent*?" — and specifically: if the dependency is down at the moment we
commit, what do we ship?

The enabling condition is always the same: **code that cannot tell "it failed"
from "there is nothing".** An empty collection and an error are different
answers, and any layer that collapses them converts every upstream outage into a
plausible-looking artefact. This is why `data ?? []`, `catch { return [] }`, and
a bare `if (!row) notFound()` are not defensive but dangerous — they are
strongest precisely where the failure is least visible.

And: **a lesson recorded as prose prevents the instance, not the class.** When
the same shape returns through a different door, that is the signal to stop
writing it down and encode it — as a guard, a lint rule, a type, a test. The
second occurrence is the trigger, not the third.

## Where else it fits

- **Any build-time data fetch.** Static site generation, ISR, precomputed
  indexes, generated API clients, snapshot fixtures. The question is always what
  gets baked if the source is unavailable at build.
- **Caches and materialised views.** A cache populated during an incident serves
  the incident for its whole TTL. Populating a cache with an error — or with an
  empty result derived from an error — is worse than not caching.
- **Any `?? []`, `|| {}`, or `catch { return [] }` on the boundary of a network
  call.** Each one is a place where "down" becomes "empty". Grep for them; they
  are cheap to find and each is a decision that was probably never made
  deliberately.
- **`notFound()` / 404 paths gated on a nullable lookup.** A 404 is an assertion
  that a thing does not exist. It should never be reachable from "we could not
  find out".
- **Agent-to-agent handoffs.** A report from another model is evidence and a
  hypothesis, not a conclusion. Its confident parts are usually right; its
  omissions are where the severe findings live.
- **Any framework directive that is declarative** — `revalidate`, `cache`,
  `preload`, an index hint, a memo. Presence in the source is not evidence of
  effect.

## Rules of thumb

1. Before making something static or cached, answer: **"if the source is down
   when we commit, what do we serve?"** If the answer is "an empty but valid
   page", stop and fix the error handling first — the optimisation is not the
   risky part, the silence is.
2. **Never collapse "failed" into "empty."** At every network boundary, an error
   must take a different path from a zero-row result. `data ?? []` is the bug.
3. **A 404 must never be reachable from a failed query.** If absence and failure
   can both produce null, separate them at the call (`maybeSingle` over
   `single`) before guarding, or a fix for one becomes a 500 for the other.
4. **Reproduce the failure to test the fix for a failure.** A guard verified
   only by reasoning is a guard you have not tested; an ongoing outage is a free
   test rig — use it while it lasts.
5. **Treat a handed-over diagnosis as a hypothesis.** Re-run its queries against
   the real system before building on it. Budget time to find what it missed,
   not just to confirm what it said.
6. **Never trust a declarative directive to be doing anything.** Measure it —
   repeat the same request against a production build and see whether the
   dependency is actually spared.
7. **On the second sighting of a failure shape, encode it.** Prose stopped the
   first instance and will not stop the third. A guard, a lint rule or a test is
   the only form a lesson survives in.
