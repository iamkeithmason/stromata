# Prototype the motion

*The Stromata · 29 October 2026 · from a mobile exploration of the text page: analytics, five persona
walkthroughs, two Figma rounds and an interaction prototype ([#170](https://github.com/iamkeithmason/stromata/pull/170),
closed; card "Mid-text navigation on phones")*

## In one line

Static design frames cannot settle an interaction question: the owner could not tell from two rounds of
Figma how the navigation opened, and an hour with a working prototype on his own phone settled what the
frames could not. Persona research grounded in real traffic, and design briefs tested against several
contrasting cases, made the prototype worth building.

## Where it came from

Keith wanted to explore the reader page on phones, starting from Chrysostom's *Address on Vainglory*,
the site's best search page, and asked whether there was a better way to explore than his first plan
(imagined personas, a source document, Figma agents).

## What we did

1. **Evidence first.** Umami for the one page: 109 of 115 visitors arrived from search, 60% on phones, and
   none reached a second text. Search Console showed the page's queries are a long tail Google anonymises,
   so it could not tell a seeker of the text from a parent searching for advice; a snippet test was
   proposed as the cheap way to find out.
2. **Persona walkthroughs.** Five agents, one per reader, walked the real page at 390px against a local
   build, briefed with the evidence. They converged: every reader stalls around screen 21, where the
   sermon turns to children and the nearest link is 63 screens away.
3. **Figma round one.** Four directions, one per reader, each with its own aesthetic brief and a fresh
   critic. All scored 6.5. Keith saw that none of them would work as a template.
4. **Figma round two.** Three mechanisms for the template, each drawn against three contrasting texts
   (long without headings, 44 chapters, a short collection part), then critiqued and compared by a judge.
5. **Interaction prototype.** Keith still could not tell from the frames how the drawer opened. A noindex
   route that imports the real reader page and adds one client component gave him a preview link. Three
   rounds of feedback from his phone followed within an hour: keep the site menu reachable, show a small
   persistent pill, two levels of progress, animate the section changes and the sheet. Then a slim pill
   and contextual labels. All of it went onto the backlog card before the PR was closed.

## What worked

- Grounding the personas in traffic before imagining them. The zero-second-text finding set the
  north-star metric, and the mobile share justified phone-first.
- Walkthrough agents on the real page found defects the brief never asked for: a 540px layout on a 390px
  phone, a citation with no translator, a translation of unconfirmed copyright.
- Briefing each design agent with its own aesthetic kept four directions distinct.
- Drawing every template variant against three contrasting texts made template failures visible at once.
- A prototype that imports the real page instead of copying it: no new database reads (so the egress
  guard stayed green), real data, and a two-file diff that can be closed without residue.
- Resuming the workflow from its journal after a container restart: five of seven agents came back from
  cache.

## What didn't, and why

- **Audited the wrong baseline.** The walkthroughs and round one ran against production, while `release`
  already carried a week of unshipped work on the same page (Read next, a compact frontispiece, the
  overflow fix). A fix was written for a bug `release` had already fixed, and some round-one advice was
  redundant. This is the second time the lesson has surfaced; see
  [read the plan before the audit](2026-10-27-read-the-plan-before-the-audit.md).
- **Moved the ground under running agents.** Resetting the working branch to `main` mid-workflow, to
  quiet an unpushed-commits warning, changed the files the critics were reading. Three critics then
  marked a font "off-system" that `release` had adopted. Their scores were partly measuring the wrong
  design system.
- **Asked frames to answer a motion question.** Two rounds and seven Figma agents could not show how a
  header hides and returns, or how a sheet opens. The owner's first comment on the frames was that he
  could not tell how to open the drawer.

## The principle, stated generally

Match the artefact to the question. Frames answer questions about layout and hierarchy; questions about
behaviour (what appears when, how it moves, how you get out) need something that moves, in the owner's
own hand, on the device the users use. Build the cheapest working thing on the real product rather than
a high-fidelity picture of it, and do it as soon as the open question becomes one of behaviour.
Before either, pin the baseline: audit the branch that will ship, and keep it fixed while agents read it.

## Where else it fits

- Any navigation, onboarding or gesture work in Paideia or Portfolio.
- Agent design workflows generally: give agents a fixed checkout (a worktree) and never change the main
  working tree while they run.
- Reviews of unreleased work: check what is queued for release before recommending.

## Rules of thumb

- When feedback on frames is "I can't tell how this works", stop drawing and prototype.
- A prototype wraps the real page; it never copies it.
- Before an audit, diff the branch that ships against production, and audit that branch.
- Point design and critic agents at a checkout that will not move until they finish.
- Test a template against at least three contrasting real cases before scoring it.
- Ground personas in traffic data before asking agents to imagine them.
