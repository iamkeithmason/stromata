# Debug the deployed revision, not the checkout

*The Stromata · 21 September 2026 · from diagnosing the production admin crash ([#110](https://github.com/iamkeithmason/stromata/pull/110))*

## In one line

A green reproduction is evidence only after the code under test is proven to be
the code that failed; otherwise the first debugging task is revision identity,
not runtime behaviour.

## Where it came from

Production `/admin` crashed with a spread-operator `TypeError`, while the first
local production build rendered the page normally. The apparent environment
difference disappeared when the checkout was compared with `origin/main`: it
was ten commits behind and did not contain the failing spread expression.

## What we did

- Compared local `HEAD`, `origin/main`, and the deployed code before trusting
  the local reproduction.
- Fast-forwarded without disturbing unrelated working-tree changes.
- Reproduced the exact exception against the deployed implementation.
- Verified the database relation shape directly, then fixed and tested both
  object and legacy array representations.
- Matched the separate upload report to its concrete Vercel request and
  Supabase row rather than inferring it from the nearby dashboard crash.

## What worked

**Revision identity resolved the contradiction.** The server, database, and
framework did not need a theory: the local build and production were executing
different source. Once synchronized, the failing value was unambiguous — a
Supabase to-one relation returned an object, and the page spread it as though it
were an array.

**Evidence was joined across boundaries.** Vercel established the request
method, path, referer, status, and timestamp; Supabase established which row was
actually updated. Together they distinguished a failed insert from a successful
edit request without changing production data.

## What didn't, and why

**The first successful local build was a false reassurance.** It proved only
that an older checkout worked. Because the revision mismatch had not yet been
checked, the strongest-looking signal in the investigation answered the wrong
question.

**Temporal proximity was not causality.** The dashboard crash followed a save,
but the two requests exercised different code paths. Treating them as one fault
would have obscured both the relation-shape bug and the absence of any insert
request.

## The principle, stated generally

**Before interpreting a reproduction, establish code identity.** A test result
is scoped to the exact revision, configuration, data boundary, and request path
it exercised. If any of those differ from the failing system, “passes locally”
is a new observation, not a contradiction.

## Where else it fits

- Production-only failures investigated from long-lived or dirty checkouts.
- Preview deployments whose branch has moved since the reported incident.
- Database bugs where the same query is run under different roles or RLS rules.
- Incident reports that place two failures close together and invite one causal
  story before their requests have been identified.

## Rules of thumb

1. Record the deployed commit before reproducing a production failure.
2. Compare local `HEAD` with that commit before trusting a green build or test.
3. State precisely what a green signal exercised; do not let “local” stand in
   for “equivalent to production”.
4. Correlate nearby symptoms by request ID, path, method, timestamp, and data
   mutation before treating them as one incident.
5. When evidence crosses services, use each system for the fact it can prove:
   request logs for execution, database reads for persisted state.
