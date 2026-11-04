# Claim the work before you build

*The Stromata · 2 November 2026 · from building the backlog card "Mid-text navigation on phones" twice,
in parallel ([#184](https://github.com/iamkeithmason/stromata/pull/184), closed; [#187](https://github.com/iamkeithmason/stromata/pull/187), merged)*

## In one line

Two agent sessions built the same feature on the same day, because nothing on the card said the work was
taken: the second session started from the card, not from the open pull requests, and the duplication
surfaced only at the very end, as a clash in the analytics register.

## Where it came from

On 2 November Keith asked one session to find the Figma exploration ticket, answered the card's two open
questions there, then said "could we build it for next week's release". Earlier the same day another
session had already built the card and opened draft PR #184 against `release`. The card's Status was
`Planned` in both cases, which reads the same whether a build exists or not.

## What we did

1. The second session read the card, the prototype PR (#170) and the reader code, then built the
   feature end to end: outline library and tests, the reading header and sheet, section anchors, a new
   wire-sweep suite, CHANGELOG, a draft PR (#187).
2. Only when it went to register the new events in Notion did it find `text-sheet-open` and `text-jump`
   rows already there, written that morning, with different property values. A search of the branches
   then found #184.
3. The two builds were compared on what mattered: #184 predated Keith's two decisions of 2 November
   (numeral style for editorial sections, the short-text threshold); #187 carried them, plus a wire check
   and a test of the numbered-list case. Keith chose #187; #184 was closed unmerged, its register rows
   deleted, and the surviving rows rewritten to match what shipped.

## What worked

- The register as a single written vocabulary. It was the only place both builds had to write the same
  thing, so it was the place the collision became visible. Without it the duplication would have been
  found at review, or not at all.
- Comparing the two builds on decisions and evidence rather than on which came first. The later build
  won because it carried the owner's latest rulings, which a "first one wins" rule would have discarded.
- Labelling the duplicate rows and asking, rather than deleting them on the spot.

## What didn't, and why

- **The card did not record that a build existed.** `Planned` meant "a PR is open" by convention, but the
  PR number was nowhere on the card, so a reader could not tell taken from not-yet-started.
- **The second builder started from the card, not from the work in flight.** One search of open PRs for
  the card's title would have found #184 in seconds. It was not in the checklist, so it was not done.
- **The decisions moved after the first build.** Keith answered the card's open questions in the second
  session, after #184 was written. Answering a question on a card does not tell a build already in
  progress, so even a claimed card would have needed a "decisions changed since the build" note.
- **Cost.** A full feature build, a CI run, two sets of register rows and a cleanup, spent to produce one
  feature.

This is the third surfacing of a single lesson: check what is already in flight before you start.
On 27 October an audit was run before reading the owner's plans ([read the plan before the audit](2026-10-27-read-the-plan-before-the-audit.md));
on 29 October an exploration audited production while `release` carried a week of unshipped work on the
same page ([prototype the motion](2026-10-29-prototype-the-motion.md)). Here a whole build repeated one
that was open.

## The principle, stated generally

When several agent sessions can act on one backlog, claiming work must be an explicit, visible write,
made before the work starts, in the place the next agent will look first. A status that is set either
by convention or late (at PR open) cannot prevent a duplicate; it can only record one. And the check runs
both ways: a builder looks for open work before starting, and a decision-maker who changes the spec says
so where the in-flight build will see it.

## Where else it fits

- Paideia's backlog and `/next-agent-card`-style routines: any queue several sessions draw from.
- Scheduled routines that could overlap a hand-started session (Scout, Sourcer, the digest).
- Content batches: two sessions picking the "next Drive batch" from the same ranked list.
- Any shared register or vocabulary: it is a natural collision detector, so read it before writing to it.

## Rules of thumb

- Before building a card, search open PRs and branches for its title, and read the card's Notes for a PR
  link. Two queries; seconds.
- Claim at the start, not at the PR: write "Building in session X / PR #N" onto the card the moment work
  begins, and the PR number as soon as it exists.
- When you answer a card's open question, check whether a build is already open, and if so put the
  decision on that PR too.
- If a duplicate turns up, compare the builds on the owner's latest decisions and on evidence, label what
  you find, and let the owner choose; never delete the other session's work yourself.
- Treat a shared register as a lock you can read: an entry you did not write, dated today, is a signal
  to stop and look.
