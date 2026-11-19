# Write the step where the release reads

*The Stromata · 17 November 2026 · from replacing* Address on Vainglory *with Chrysostom's Homilies 20 and 21
on Ephesians ([#234](https://github.com/iamkeithmason/stromata/pull/234)), with Homily 50 on Matthew
([#236](https://github.com/iamkeithmason/stromata/pull/236)) done alongside*

## In one line

A redirect that a ticket said "will ship in the 16 Nov release" never shipped, because the promise lived
only in the ticket's prose and nothing that assembles the release ever reads ticket prose. The fix was to
give such steps a line the release routine collects: `Before release:` in the PR description.

## Where it came from

*Address on Vainglory* (accession 1, the top landing page) was unpublished on 10 Nov for copyright. The
ticket to replace it opened: "the Vainglory URL will redirect to Homily 21 in the 16 Nov release." On
17 Nov the redirect existed nowhere: not on `release`, not on `main`, not in any open PR, and not in the
database. The old URL had answered not-found for a week. Separately, the redirect's destination was still
an unpublished draft, so shipping the redirect alone would have moved readers from one not-found page to
another.

## What we did

1. Checked `main`, `release`, open PRs and the database for the redirect, found it in none of them, and
   reported that before building anything.
2. Built the redirect into the same PR as the content work, and wrote the dependency into the PR
   description as `Before release: publish homily-21-… in /admin/review`.
3. Changed the Monday release routine to copy every `Before release:` line from the PRs a release carries
   into a "Before you merge" checklist at the top of the release PR, beside migrations. This is the same
   shape as the existing `Card:` line, which the routine already collects.
4. Wrote the convention into CLAUDE.md beside the `Card:` rule.
5. Keith published the destination the same morning; the PR line was replaced with a dated "done" note,
   so the checklist would not show a finished step as open.

## What worked

- **Checking every place the thing could live before saying it was missing.** Branch, branch, open PRs,
  database: four looks, and the answer "it does not exist" was then a finding rather than a guess.
- **Reusing a shape the routine already understands.** `Card:` lines were already harvested from PR
  descriptions; `Before release:` needed one sentence in the routine's prompt and one paragraph of docs.
- **Guarded writes.** Every database edit named the row by id and accession and required the exact old
  text to be present. When a second session had already fixed Homily 50, this session's identical update
  matched nothing and changed nothing.

## What didn't, and why

- **A promise in a ticket is not a step in a process.** "Will redirect in the 16 Nov release" was true as
  an intention and invisible to every mechanism that builds a release. Nobody forgot; there was nothing
  to remember with.
- **The ticket asked for work that was already done.** It specified a fresh import of two texts that a
  pipeline run had imported the day before. `npm run pipeline:status` or one database query would have
  turned "import X" into "finish X".
- **The second session checked for in-flight work only after acting.** Asked to "do Homily 50 here now",
  this session ran its update before searching PRs, and only the guard saved a double write. This is the
  fourth surfacing of the [claim the work before you build](2026-11-02-claim-the-work-before-you-build.md)
  lesson; the guard made it cheap this time, but the search should have come first.
- **A routine failing quietly.** The release routine's 16 Nov run failed on a usage limit after nine
  seconds, so the week's report never arrived. The release went out by hand, so nothing was lost, but the
  report that exists so silence never hides a failure was itself silent.

## The principle, stated generally

A step that a merge cannot perform (publish this, apply that migration, flip this setting) has to be
written where the thing that assembles the release will read it, in a form it already collects. Prose in
a ticket, a chat or a commit message is a note to a human who may not be there; a tagged line in the PR
description is an input to the process. And the step must be marked done in the same place, or the
checklist will report finished work as open.

## Where else it fits

- Paideia: Supabase migrations, Edge Function secrets and cron jobs that a code merge depends on.
- Any weekly or batched release where the person merging is not the person who wrote the change.
- Content work that pairs a code change with an editorial act (a redirect and a publish, a new page and
  its first entries).
- Scheduled routines that report on other routines: a routine that can fail silently needs its own
  failure to surface somewhere a person looks.

## Rules of thumb

- If a change depends on something a merge cannot do, write `Before release: <the step>` in the PR
  description, one line per step.
- When the step is done, replace the line with a dated note in the same place.
- When a ticket promises something for a release, check the release for it before trusting the promise.
- Before acting on a ticket, check whether the work already exists: pipeline status, the database, open
  PRs. Then act.
- Guard every direct database write with the row's id and the exact old value, so a duplicate is a
  no-op rather than a clobber.
