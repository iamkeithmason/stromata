# Ask whether the duplicate has already diverged

*The Stromata · 21 September 2026 · from making a collection's byline derived rather than stored ([#107](https://github.com/iamkeithmason/stromata/pull/107))*

## In one line

A schema question that sounds like taste — "should this field be stored or
derived?" — becomes a question of fact the moment you ask whether the stored
copy has *already* drifted, and the answer is usually one query away.

## Where it came from

Keith asked whether a collection should inherit its author from its texts
instead of carrying its own `author_id`, and asked me to argue the other side if
I disagreed. Both answers were available as opinion. Neither was worth much
until the corpus was asked.

## What we did

- Queried the live table before writing a word of argument: 40 collections, how
  many distinct text authors each had, and whether the stored author agreed.
- Found the duplicate had already diverged — one published collection with a
  null `author_id` and five texts all by the same author, rendering a live page
  with no byline at all.
- Built the derivation, kept the column as an override, and **flipped what
  `null` means** (from "no author" to "inherit") rather than dropping the column
  or backfilling it.
- Asked what deriving newly made *reachable*, rather than only what it broke.
- Merged `main` mid-session and re-read the claim the merge had quietly changed.

## What worked

**1. One query replaced the whole argument.** "Has the duplicated fact already
diverged, and did anyone notice?" is cheap, and its answer is not a matter of
opinion. It found `hydriotaphia-browne`: `author_id` null, five texts by Sir
Thomas Browne, a live published page with no byline, no breadcrumb, and no
author in its `<title>`, meta description, OG tags or `BreadcrumbList` JSON-LD.
Nothing alerts on that — a collection by nobody looks like a collection that
happens to have no author. The same query answered the design question from the
other side too: all 40 collections had exactly one distinct text author, so the
standalone column had no expressive power anyone was using.

**2. Flipping a sentinel's meaning can replace a migration.** `null` meant "no
author"; it now means "inherit from my texts". That needed no migration and no
backfill, because *no row had ever meant the old thing* — every null was an
omission, not a choice. The cleanup migration that followed was optional by
construction: it clears the rows whose stored value merely restates what their
texts already say, so the code renders identically before and after it. Worth
checking for whenever a field's semantics are about to change: if the old
meaning has no instances, the change is free.

**3. "What does this newly make reachable?" found the edge that "what does this
break?" would not.** Deriving from all texts rather than the stored column meant
the byline could now name an author reached only through an *unpublished* text —
and a draft author's page 404s until it has a published text. Nothing in the
corpus hits this today, so no test would have caught it and no review would have
flagged it. It's a consequence of the new reach, not a regression in the old
behaviour, and only the reachability question surfaces that class.

**4. Following the change outward caught a silent downgrade.** Because imports
stopped writing `author_id`, a script that fed the collection author into a
prose-generation prompt would have started sending `"Unknown"` for every
pipeline-created collection — worse output, no error, visible only in the prose
weeks later. Found by grepping every reader of the field, not by running
anything.

## What didn't, and why

**1. The premises moved underneath the session, twice, in one hour.** A second
collection lost its `author_id` while I was working — I reported "one bylineless
collection" at 13:55 and it was two by 14:10, changed by Keith in the admin UI.
Separately, another PR merged to `main` and added migrations `022`–`026`, so the
migration file I had already written collided on number, and rewrote the very
page I was editing. Both cost a rework round. This is the second write-up in two
days to record it: the previous one logged a fact verified at 06:00 that was
false by 11:00 for the same reason. The lesson has now been paid for twice, so
it should be a habit and not a note — **re-read `origin/main` and re-run the
query before you commit a number or a count, not only before you write it.**

**2. Pure unit tests could not see the change that mattered most.** The merge
switched the public collection page from the service-role client to the anon
key, where RLS filters `texts` to published rows. My derivation applies no
`published` filter of its own — which had meant "every text" and now means
"every text this caller may see". The documented behaviour changed without one
line of my code changing, and all 311 tests passed on both sides of it, because
the resolver is pure and the privilege lives at the boundary. Nothing was wrong;
the *claim* was wrong, and only reading the merge caught it.

**3. The CI badge was absent, not red, and absence reads as fine.** A
`pull_request` event raised by a GitHub App's token does not start a workflow
run, so the PR sat with no checks at all. "No checks yet" and "checks that will
never run" look identical on the page. Fixed here with a `workflow_dispatch`
trigger, but the general shape is the trap: a missing signal is not a passing
one, and nothing will tell you which you have.

## The principle, stated generally

**Two copies of one fact are a question of evidence, not of taste.** Before
arguing whether to normalise, ask the cheaper question: *has the duplicate
already diverged, and did anything notice?* Divergence in a field that is only
ever displayed is the dangerous case, because nothing reads it back and so
nothing can contradict it — the drift is invisible by construction, and its
absence of symptoms is not evidence of health.

And when a fact can be computed from data the system already holds under a
constraint (`NOT NULL`, a foreign key), storing it a second time buys nothing
but a place to be wrong.

## Where else it fits

- **Any denormalised or cached field**: a count, a rolled-up status, a
  `last_updated_by`, a search-index copy. The diverged-yet? query is the same
  shape every time and takes a minute.
- **Any "should we store or compute this?" design argument**, in code review or
  planning. If nobody has looked at whether the stored copy currently agrees
  with the computed one, the discussion is under-informed.
- **Any change that widens what a code path can reach** — a filter removed, a
  join loosened, a permission broadened. Ask what becomes reachable, separately
  from what breaks.
- **Any change to a claim that depends on the caller's privileges.** Pure tests
  pass on both sides of a privilege change; only reading the boundary catches it.
- **Long agent sessions generally.** Facts gathered at the start of a session are
  assertions about a moving system by the end of it.

## Rules of thumb

1. **Before arguing about a duplicated field, query whether it has already
   diverged.** One minute, and it converts an opinion into an argument — or
   refutes yours.
2. **Drift in a display-only field is invisible, so weight it higher**, not
   lower, than drift in a field something reads back and validates.
3. **Before changing a sentinel's meaning, check whether the old meaning has any
   instances.** If it has none, the change needs no migration.
4. **Ship the data cleanup as optional.** If the code behaves identically with
   and without it, the migration can't sequence-break a deploy.
5. **Ask "what does this newly make reachable?" as a separate question from
   "what does this break?"** They find different bugs.
6. **Grep every reader of a field you are changing the population of**, not just
   every writer. The readers are where a silent downgrade lands.
7. **Re-read `origin/main` and re-run your counts immediately before committing
   them.** In a long session, a number you gathered an hour ago is a guess.
8. **A missing check is not a passing one.** When a gate reports nothing, find
   out whether it ran.
