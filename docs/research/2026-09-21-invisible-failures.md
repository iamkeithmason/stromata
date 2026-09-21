# Invisible failures need a witness, not an argument

*The Stromata · 21 September 2026 · from building `/admin/review` ([#100](https://github.com/iamkeithmason/stromata/pull/100)) and the sliding admin session ([#104](https://github.com/iamkeithmason/stromata/pull/104))*

## In one line

When a change's failure mode is **silence** — a stale page, a session that never
renews, a cost report that reads `$0.00` — reading the code proves nothing and
unit tests can pass over the top of it; something has to go and observe the real
artefact.

## Where it came from

A day building the phone-first review queue. Four separate things in one session
turned out to share a shape: each would have shipped looking exactly like the
working version, and each was caught only because something went and looked.

## What we did

- Extracted publishing into one `publishText()` with a **pure** `textPaths()`
  and a test naming every surface, instead of the `revalidatePath` list written
  inline in each admin route.
- Split verification of the sliding session in two: **unit tests** for the
  renewal arithmetic, and a **probe against a built server** for whether the
  cookie is actually attached.
- Re-verified a production database trigger after editing it, inside a
  transaction deliberately aborted with a `RAISE`, so nothing persisted.
- Made the pre-generation script's cost report **name** a model it has no price
  for, rather than costing it at zero.

## What worked

**1. The duplicated side-effect list was already wrong, and the test proved it.**
Publishing revalidated the homepage, `/texts`, the text, its author and its
themes — but not the collection, era, tradition, authors-index or location
pages, every one of them ISR at `revalidate = 3600`. A text published from the
collection page's point of view didn't appear there for up to an hour. Nobody
had noticed, because a stale ISR page is indistinguishable from a correct one
that simply hasn't been visited yet. Three inline copies of "what to invalidate"
meant three chances to be wrong; the first thing the extracted pure function did
was make the gap legible as a list of missing strings.

**2. Two failure classes needed two different checks.** Nine unit tests pin the
renewal threshold — boundary, self-limiting property, expired tokens. **Every
one of them would still pass if the middleware never attached the cookie at
all.** So a separate probe drove a built server: a fresh 30-day cookie got no
`Set-Cookie`, a 24-day-old one and a 60-minute-from-expiry one both did, and the
renewed token was decoded and checked — `role=admin`, expiry moved 24d → 30d,
`HttpOnly` / `SameSite=Lax` / `Path=/` intact. The tests answer "is the maths
right"; only the probe answers "does it happen".

**3. A rolled-back transaction verifies production safely.** Editing
`set_published_at_on_publish` meant touching the one thing that stamps
`published_at`. A `DO` block inserted a draft, published it, re-saved it,
asserted at each step, then raised — aborting the transaction and leaving
nothing behind. Three real assertions against the real trigger on the real
database, zero rows written. Confirmed afterwards with a count.

**4. A cost report that can't silently read zero.** The report prices per model
from a table. A model missing from that table is **named in the output and
excluded from the total**, never costed at zero — an obviously incomplete bill
beats an understated one. A test asserts the two model ids the script actually
defaults to are present, so a model-id drift becomes a failing test rather than
a run that cheerfully reports `$0.00`.

## What didn't, and why

**1. A verified fact rotted inside the same session, and I put it in a PR body.**
I grepped, found no `umami.disabled` anywhere, and reported that admin pageviews
were being tracked. True when checked. Hours later another PR merged
`lib/analytics/device-opt-out.ts`, which sets exactly that flag on admin login —
so by the time the decision was made, my claim was false, and it was sitting in
an open PR description as a durable statement. Caught only because a routine
re-read of `CLAUDE.md` mentioned the opt-out.

The repository is not a still object during a long session. Other PRs merge;
other agents run. A fact verified at 06:00 is not a fact at 11:00, and the cost
of the staleness is proportional to how durable the artefact you wrote it into
is — a chat message is cheap, a PR body or a doc is not.

**2. I wrote an assertion that could never fail.** A test contained
`assert.ok(!s.slice(out.length).startsWith('') || true)`. Every string
`startsWith('')`, and the `|| true` made it unconditional anyway. It passed, as
it always would have, and it was testing nothing. Same shape as everything
above: **a test that always passes looks exactly like a test that passes.** The
only reason it was caught is that a neighbouring assertion in the same test
failed and forced a re-read of the block.

## The principle, stated generally

Failure modes divide into two kinds, and they need different instruments.

**Loud failures** announce themselves: an exception, a red test, a 500. Reasoning
and unit tests catch these, because the broken state looks different from the
working state.

**Silent failures** do not. A stale cache, a session that never renews, an event
that never fires, a metric that reads zero, a test that cannot fail, a cost of
`$0.00` — in every case the broken state is **pixel-identical to the working
state** from where you are standing. No amount of reading the diff distinguishes
them, and a unit test that mocks the boundary will confidently pass over the
top.

For those, the verification has to **cross the boundary the failure hides
behind** and observe the real artefact: the actual HTTP response, the actual row,
the actual outgoing request. That is what "verified" has to mean for this class,
and it is a different act from "tested".

The corollary about time: verification has a shelf life proportional to how fast
the thing verified can change. In a repo where several agents open PRs in a day,
that shelf life is hours.

## Where else it fits

- **This repo already encodes one instance of it.** The analytics rule — *"an
  analytics change is not done when the attribute is in the JSX; it is done when
  you have observed the outgoing request carrying the expected payload"* — was
  paid for with four weeks of unusable data from the seasonal panel. Sessions
  since have paid the same bill in caching (ISR surfaces) and auth (cookie
  renewal). The rule is not about analytics. It is the general rule, discovered
  first in analytics.
- **Anywhere a list must track a growing system**: revalidation paths, sitemap
  entries, a cache-key allowlist, an exported-types barrel, RLS policies per
  table. Make the list a pure function with a test that names the members;
  a convention in a doc is a probability, a failing test is a contract. (Same
  argument the design-token ESLint rule already makes here.)
- **Any long agent session in a repo with other writers.** Re-verify before a
  fact lands anywhere durable.
- **Any script that spends money or writes at scale.** Its selection logic and
  its accounting are the two things worth testing, because both fail quietly.

## Rules of thumb

1. **Ask "what would this look like if it were broken?"** If the answer is
   "exactly the same", you need a probe, not an argument.
2. **Unit-test the arithmetic; probe the boundary.** Two checks, because they
   fail independently. The test that mocks the thing cannot witness the thing.
3. **Never let a verification read zero on its own authority.** A metric, count
   or cost that can be zero for two different reasons must say which.
4. **Verify against production inside a transaction you abort.** Assert, then
   `RAISE` — real behaviour, real data, nothing persisted.
5. **A duplicated side-effect list is a bug waiting.** Extract it to one pure
   function and test its members. Assume the existing copies already disagree —
   in this session, they did.
6. **Re-verify perishable facts before they enter durable artefacts.** Timestamp
   the claim, or re-check it at write time.
7. **Distrust a test that has never failed.** If you cannot say what would make
   it go red, make it go red once on purpose.
