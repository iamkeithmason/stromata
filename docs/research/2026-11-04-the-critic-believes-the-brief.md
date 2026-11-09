# The critic believes the brief

*The Stromata · 4 November 2026 · from the first homepage design critique (PRs
[#195](https://github.com/iamkeithmason/stromata/pull/195), [#200](https://github.com/iamkeithmason/stromata/pull/200)
and the first-screen PR that followed them)*

## In one line

A fresh-context critic, given screenshots and a written brief, found the homepage's biggest problem in one
pass, but it also argued confidently from a sentence in the brief that was simply wrong, and it judged a
deliberate design choice "accidental" because the brief never mentioned the choice.

## Where it came from

Keith asked whether the design plugin had skills worth using on the homepage. The session ran two in
sequence: `design-system` (an audit for hard-coded values and copied components) and then
`design-critique`. For the critique, the session drafted a brief from `CLAUDE.md`, Keith approved it and
added one paragraph of his own (the site reflects on its maker, so it should look considered, not just
modern), and a separate agent that had seen none of the conversation judged full-page screenshots at
390px and 1440px against it.

## What we did

1. Rendered `release` locally against live data, full page, in slices, at both widths.
2. Gave a fresh agent the screenshots, the brief and the skill's output format, and told it to judge only
   what it could see, not to read the code.
3. Checked every claim against the code and the screenshots before passing the report on. The checked
   version, not the raw report, went to Keith.
4. Shipped the fixes he agreed in one PR to `release`, and mocked up three options for the one
   structural finding (the first phone screen) on the real page, for him to choose from.

## What worked

- **Independence found what proximity hid.** Earlier the same day this session had built and screenshot
  the homepage several times without noticing that a 390px phone showed no text at all on its first
  screen. The critic led with exactly that, scored the page 6.5/10, and named the fix. It was the most
  important finding of the day, and it came from the agent that had not built anything.
- **Verifying the report was cheap and changed it.** Most claims held, and confirming them took minutes,
  using code that was already open.
- **Options beat a recommendation for a taste call.** Three mock-ups of the first screen, made by injecting
  CSS into the real page rather than drawing in a design tool, let Keith choose in one look.

## What didn't, and why

- **The brief carried a factual error, and the critic built on it.** The draft said the page had "no
  imagery beyond book-cover blocks". It has a large illustrated hero and eight author portraits. The
  critic, doing its job, flagged the hero as off-brief, a "planetarium rather than a library". That
  concept complaint came from the session's own sentence, not from the page. Keith's answer (the sky is
  there to picture how the pre-modern mind saw the world) belonged in the brief all along.
- **Missing decisions read as accidents.** The critic's top taste complaint was the Courier Prime
  monospace on the chips. That face was Keith's deliberate choice a week earlier, and the brief did not
  say so. A critic that is told nothing about past decisions will re-argue every one of them.
- **Two claims were wrong outright:** a footer "missing" a Search link it has, and two section rules
  "differing" in colour that are one token. Screenshot reading is estimation, and the critic sometimes
  states its estimates as facts.

## The principle, stated generally

A fresh-context reviewer is valuable because it has nothing but what you hand it, and that is also its
limit: it treats the brief as ground truth and the artefact as evidence. So the brief's facts must be
checked against the artefact before the review, and its settled decisions must be written down. The
review's claims must then be checked against the artefact afterwards, before anyone acts on them.

## Where else it fits

- Any LLM-as-judge setup: prose critics for `note_draft`s, code reviewers, the design-critic loop
  (`scripts/design/critic-loop.mjs`), whose `--aesthetic` brief `CLAUDE.md` already calls load-bearing.
  This is the second time that lesson has surfaced here.
- Subagent research briefs in general: a wrong premise in the prompt comes back as a confident finding.
- Human design reviews too: a reviewer who doesn't know a choice was deliberate will spend their
  attention reopening it.

## Rules of thumb

- **Check every factual sentence in a brief against the artefact before sending it.** Prefer describing
  what is there over describing what you remember is there.
- **Give the critic a "decisions already made" section,** so its attention goes to execution rather than to
  re-litigating.
- **Keep the brief in the repo** (`docs/design/homepage-brief.md`), so each run judges the same thing and
  corrections accumulate.
- **Treat the report as claims, not findings.** Verify each one, label what didn't hold, and pass on the
  checked version.
- **When a critic argues the concept rather than the execution,** first check whether the brief caused
  it. If not, it is a decision for the owner, not a fix.
