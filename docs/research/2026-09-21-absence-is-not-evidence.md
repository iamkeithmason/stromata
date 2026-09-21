# An absence is a hypothesis, not a finding

*The Stromata · 21 September 2026 · from an admin-at-scale product review that turned into a production outage ([#112](https://github.com/iamkeithmason/stromata/pull/112), [#115](https://github.com/iamkeithmason/stromata/pull/115))*

## In one line

Four times in one session I reported that something was missing, and each time I
had inferred it from a symptom rather than read the source — the thing was
already built, or built and broken for a different reason; an absence observed
in **data** is a question to take to the **code**, never an answer.

## Where it came from

A session that began as product work — rethink the admin for a library that had
grown to 552 texts — and ended having found a live outage. Along the way the
same mistake recurred often enough to stop being bad luck.

**First.** Triaging the Notion backlog, I saw cards named *Admin Publishing:
pipeline workspace* and *Admin Publishing: prospect queue* sitting at `Idea`
while `/admin/pipeline` plainly existed. I reported both as stale. Reading the
cards, one was: the prospect queue was genuinely built. The other was not — its
scope is a view spanning prospect *through* publication, and nothing spans that
chain. I had matched on the name.

**Second.** I probed Umami's event stream for `reader-return`, the Growth
Model's North Star, found nothing across twelve weeks, and wrote that it was
"not instrumented". Keith pushed back — *I think that's calculated rather than
tracked, worth confirming.* Both halves of my claim were wrong. The dashboard
computes a repeat-visits proxy, so the North Star was measurable all along; and
`reader-return` **is** instrumented, mounted in the root layout, and had simply
never once fired.

**Third.** I wrote a backlog card proposing we build one-tap provenance
verification into the review queue, on the evidence that 0 of 12 collections
were verified and all 251 drafts were therefore unapprovable. Opening
`ReviewClient.tsx` before starting: the button exists, full width, wired to a
working route. Nothing was missing. Nobody had tapped it.

**Fourth**, and this one cost CI a cycle. A backfill script's first heuristic
required `updated_at` to sit near `created_at`. The dry run rejected all 207
candidates, because a database trigger bumps `updated_at` on every write and the
maintenance scripts rewrite bodies corpus-wide. I had reasoned about what the
column *should* mean instead of looking at what was in it.

The outage itself was the same shape from the other side. Every text page on the
site returned 404. A migration had narrowed `anon`'s `SELECT` on `texts` to a
column-level grant — correct, and it stays — but PostgREST refuses the *whole*
request when `select=*` expands to an ungranted column. The page did
`if (!text) notFound()`, so a permissions refusal and "no such text" were the
same thing to it. An absence in the data, again, standing in for a cause.

## What we did

Read the source first, every time, once the pattern was named. Opening four
files would have prevented all four errors and cost a couple of minutes.

For the outage, the fix is an explicit column list plus
`lib/supabase/public-columns.ts` recording the readable set with the reasoning
beside it — because the lesson had *already* been learned once, in a comment on
one count query in `app/authors/[slug]/page.tsx`, and written down nowhere the
next `select('*')` would meet it.

For the analytics, the convention became an ESLint rule. Within a minute of
existing it found a fourth broken call site that my hand audit had cleared as
safe — `ReadingProgressBar` calls its scroll handler once synchronously at
mount, and `computeProgress()` returns `1` outright when the document is shorter
than the viewport, so short texts fired `text-read` before the tracker existed.

## What worked

**The dry run.** The backfill's wrong heuristic never reached the database,
because the script's default is to print what it *would* write. The output —
`would backfill: 0` — was immediately, obviously wrong, and pointed at the
reasoning rather than the data.

**Keith's pushback.** One sentence of doubt on the `reader-return` claim
unwound a wrong conclusion I had already written into a backlog card and a PR
description. The correction was cheap because it came before the work, not
after.

**CI, on my own code.** The backfill script validated credentials and called
`process.exit(1)` at module scope, so importing it for a pure function killed
the test process — green locally where `.env.local` exists, red where it does
not. The count discrepancy was visible in the log (358 against a local 365) and
I read past it once before chasing it.

## What didn't, and why

**Naming the rule did not make me follow it.** After the second occurrence I
wrote, in a message to Keith, that "an absence claim needs a grep before it goes
in writing." I then made the same mistake twice more. Stating a discipline is
not adopting one; the gap closed only when the check became mechanical — read
the file before the claim — rather than remembered.

**A hand audit cleared a broken call site.** I classified all eleven
`window.umami?.track` sites by reasoning about when each runs, and got ten
right. The one I got wrong needed three facts held together — a handler invoked
at mount, an early return of `1`, a latch set before the call. The lint rule
needed none of them.

## The principle, stated generally

**A gap in the data licenses a question about the system, not a claim about
it.** Zero rows, an absent event, an empty column and a 404 are all *outputs*;
each has at least two causes — the thing does not exist, or the thing exists and
something about the path is broken — and the output cannot distinguish them.
The second cause is the more common one in any system old enough to have been
worked on, and it is the one that stays invisible, because a missing thing and a
broken thing look identical from the outside.

The corollary is about where the check lives. A convention that has been
ignored once is a convention; ignored three times, it was never one — it was a
preference someone wrote down. Encoding it mechanically converts a probability
into a contract, and the contract finds things the author would not have looked
for.

## Where else it fits

- **Any metric read as a product signal.** "Readers aren't reaching texts" was
  true and was not a content problem; the pages were 404ing. Before a number
  becomes a decision, confirm the path that produces it works.
- **Backlog triage against a codebase.** A card's title says what someone
  intended to build, not what exists. Open the file before marking it stale or
  writing its successor.
- **Migrations that narrow access.** Tightening a grant is correct and silent.
  The consumers are where it surfaces, and it surfaces as absence — not as an
  error naming the column.
- **Agent sessions generally.** An agent reading a database can reach a
  confident wrong conclusion faster than a human would, because querying is
  cheap and reading unfamiliar code feels expensive. The cost asymmetry is the
  trap.

## Rules of thumb

- Before writing "X is missing", open the file that would contain X. Every
  time, however obvious.
- Prefer the explanation that something exists and is broken over the
  explanation that it was never built — in a system with history, that prior is
  simply better.
- When a query returns nothing, ask what else would produce nothing.
- Make a script's default output what it *would* do. A wrong idea that prints is
  free; a wrong idea that writes is not.
- Treat a discrepancy you cannot explain as a lead, not noise — the number that
  does not add up usually knows the answer.
- A convention ignored twice does not need restating. It needs a lint rule, a
  test, or a gate.
