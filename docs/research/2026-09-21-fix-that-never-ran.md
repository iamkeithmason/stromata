# A fix that exists is not a fix that ran

*The Stromata · 21 September 2026 · from stripping New Advent's site chrome out of fourteen text bodies ([#109](https://github.com/iamkeithmason/stromata/pull/109))*

## In one line

The code that would have prevented the bug was already correct and already
merged; what was missing was anything that looked at the artefacts produced
before it landed — so the check belongs at the boundary where work **persists**,
not only at the tool that produces it.

## Where it came from

Keith noticed that Origen's *Commentary on John* opened with New Advent's A–Z
encyclopedia bar, its logo and a breadcrumb, and ended on `CONTACT US |
ADVERTISE WITH NEW ADVENT`. The obvious hypothesis was that the fetcher's
HTML-cleaning selectors had broken, or had never covered this.

Both were wrong. The selectors were correct, and I confirmed it by running them
against the live page. The timestamps told the real story: the fourteen affected
bodies were fetched at **09:01 on 2026-09-12**; the selectors landed at **10:18
the same morning**. The staged `.md` files on disk were already poisoned when the
fix arrived, and `pipeline-import.mjs` read them, inserted them into Supabase and
reported success.

Three of the fourteen were live on the site.

## What we did

- Added `scripts/lib/source-chrome.mjs`: rules over the *markdown*, after
  HTML→markdown conversion, where chrome has a small number of stable textual
  shapes. `stripChrome` removes, `detectChrome` reports, `assertNoChrome` throws.
- Wired it into **both ends** — the fetcher (strip, then assert and abort the
  page) and the importer (strip before insert, log the count as a correction).
- Split the findings into two classes: chrome that is mechanically certain gets
  stripped; a duplicated title heading and an unresolvable image path get
  *reported* and left alone.
- Healed 64 staged files, 14 database rows and, in a follow-up, the duplicated
  headings and the Pilgrim's Progress plates.

## What worked

**1. Putting the check at the persistence boundary, not just at the producer.**
The fetcher was right and it did not matter, because nothing re-examined the
file between the fetcher and the database. Import is the last gate before the
artefact becomes permanent and public, so import is where "check rather than
trust the file" earns its cost. Every layer upstream of that is an optimisation;
this one is the guarantee. Of the 64 poisoned files found on disk, only 14 had
been imported — the other 50 are collections still staged, which the import gate
now catches even though the fetcher that made them is long gone.

**2. Testing the guard by disabling the thing it backs up.** I could have
asserted the backstop worked by reading it. Instead I re-fetched the live Origen
page under the `generic` source profile — selectors that know nothing about New
Advent, which is exactly what selector drift looks like — and watched what the
markdown pass alone could clean. It caught eight chrome blocks and **left two
behind**: the masthead tab bar and the "About this page" contact paragraph. Both
rules exist now because that run failed, not because I imagined them.

**3. A dry run over a wider corpus, read before applying.** Extending the
duplicate-heading removal from 11 database rows to the staged files printed six
files whose leading heading was `# Chapter 1. Introductory.` — New Advent serves
each book of Clement's *Stromata* as one page, and that H1 is content. The rule I
had already shipped (`dropLeadingHeading: source === "newadvent"`) would have
deleted it. The dry run was not a preview of a run; it was a test of the rule,
and the only reason it was a test is that the corpus was wider than the case I
designed against.

**4. Corroboration as a safety mechanism for a generic pattern.** Some real
tells are too generic to match on: a block reading just `Fathers`, a heading
reading `About this page`. Marking those rules `requires: 'newadvent'` holds them
back until an unconditional, site-named rule has matched *elsewhere in the same
document*. A correctly-cleaned body confirms no source, so no conditional rule
can fire on it. That turns "unsafe pattern" into "safe pattern, conditional on
evidence" without weakening either half.

## What didn't, and why

**The first framing of the invariant was too narrow, and a test caught it.** I
wrote that every rule must "name its source site in the pattern", and added a
test asserting it. Two rules immediately failed — the A–Z bar (21 consecutive
capitals) and the breadcrumb (`Home > Fathers of the Church >`), both perfectly
safe and neither naming New Advent. The invariant I actually wanted was *no rule
may match ordinary prose*, which has three routes, not one. Worth noting that
the fix was to correct the rule I had written down, not to weaken the test.

**I shipped a real bug in the same change that fixed one.** The
`dropLeadingHeading` flag went out as a boolean keyed on the source, which is a
judgement dressed up as an invariant: "New Advent pages open with a duplicated
title" is true of *some* New Advent pages. It now takes the title as a string
and removes the heading only when the heading *is* that title. The cost was
nothing, because the dry run came first — but I had already written the
narrower, wronger version into a merged-looking branch and a changelog entry.

**Two tool-level frictions cost time and are worth recording.** `tsx` compiles
this project's `jsx: "preserve"` tsconfig with esbuild's *classic* transform, so
any attempt to server-render a Next component under it dies on `React is not
defined`; the fix is to set `globalThis.React` and import the component
dynamically, from an `.mts` file so top-level await is allowed. And
`www.gutenberg.org` is blocked by the agent environment's egress policy while
its mirrors are not — the same shape as the Wikipedia block already documented
for `backfill-author-images.mjs`.

## The principle, stated generally

**A correct producer is evidence about future output only.** It says nothing
about artefacts it has already written, and nothing about artefacts written by a
version of itself that no longer exists. Any pipeline where output is *stored*
between stages has a window in which a fix and the things it was meant to fix
coexist, and nothing in the pipeline is looking at that window.

So: **put the verification where the artefact becomes permanent**, and make it
examine the artefact rather than trust its provenance. Upstream checks are
cheaper and catch things earlier; the downstream one is the only one that can be
relied on, because it is the only one every artefact must pass regardless of
which version of the pipeline made it.

And the corollary about how to test such a guard: **the guard's test is the
producer disabled.** A backstop verified while the primary defence is working is
verified against a case that cannot occur.

## Where else it fits

- **Any generate-then-store pipeline.** Ingestion here; also a code generator
  whose output is committed, a migration that writes derived columns, an export
  that lands in a bucket. The question to ask is always: *what is already in the
  store that predates this fix?*
- **Fixes shipped mid-batch.** If a run is in flight or artefacts are staged when
  a fix merges, the fix has a blast radius of zero for everything already made.
  Timestamps are the cheapest way to find out — comparing the artefact's commit
  date with the fixer's took one `git log` here and reframed the entire task.
- **Any heuristic cleanup over a corpus.** The dry-run-as-rule-test and the
  corroboration-gated rule both generalise to deduplication, PII scrubbing,
  normalisation passes — anywhere a pattern is applied at scale to text a human
  wrote.
- **Agent-authored checks specifically.** An LLM writing a cleanup rule will
  design it against the examples in front of it. Running the dry run over
  everything *else* is what turns those examples into a sample.

## Rules of thumb

1. **When a producer is found to be correct, check what it produced before it
   was.** The fix's merge timestamp against the artefact's is a one-command
   question and it reframes the bug.
2. **Put the check where the artefact persists.** The last gate before storage is
   the only one every artefact must pass, whichever version of the pipeline made
   it.
3. **Test a backstop with the primary defence switched off.** Otherwise it is
   verified against a case that cannot happen.
4. **Run a cleanup's dry run over more than the cases you designed for, and read
   it before applying.** It is a test of the rule, not a preview of the run; the
   false positives are the finding.
5. **Before writing an invariant into a test, check it against every rule you
   already have.** If some of your own rules fail it, you have written down a
   narrower rule than the one you meant.
6. **A pattern too generic to be safe can be made safe by corroboration** —
   fire it only where an unambiguous sibling has already identified the
   document. Conditional beats omitted.
7. **A flag keyed on a category is a judgement pretending to be an invariant.**
   `source === "newadvent"` claims every page of that source shares a property.
   Key on the property instead.
