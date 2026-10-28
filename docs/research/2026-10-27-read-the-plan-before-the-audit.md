# Read the plan before the audit

*The Stromata · 27 October 2026 · from a design review of the site and its Session 1 fixes ([#167](https://github.com/iamkeithmason/stromata/pull/167))*

## In one line

A review that judges a product against outside references will recommend against a direction the
owner has already chosen unless it reads the owner's own plans first, and the outside references
are themselves lossy descriptions worth checking against source.

## Where it came from

Keith shared three scraped `DESIGN.md` files (Stromata, The Lamp, Ad Fontes) and asked for a
comparison, then for an audit of the site and a scored library of reference sites. The audit ran
from the committed screens PDF, because Vercel's bot checkpoint stops cloud browsers.

## What we did

1. Compared the three files, then checked Stromata's against `app/globals.css`. The scraped file
   named Roboto, a Tailwind grey border and pill buttons. None exist in the tokens.
2. Audited the screens and ranked nine findings. Finding 1: `<body>` sets no font, so edition notes
   and list metadata fall back to the browser's sans; the proposed fix was "serif on body, done".
3. Published the audit. Keith then mentioned a half-done epic, *Distinctive Visual Identity*.
   Reading it showed its stated outcome includes **a deliberately chosen sans for UI furniture**,
   marked as a human taste call. Finding 1's framing ("everything should be serif") ran against it,
   and the first DESIGN.md had written "don't add a sans" as a rule.
4. Re-scoped: shipped serif-on-body as a *baseline* that removes an unchosen face, left the sans
   choice to Keith, and corrected DESIGN.md.
5. With GitHub Actions minutes spent, verified the fixes by rendering a local build against the
   live database (`npm run screens -- --only=…`) and reading the after-shots.

## What worked

- Checking the scraped DESIGN.md against `globals.css` before repeating any of it.
- The scraper's wrong "Roboto" was not noise: it was the scraper seeing the real fallback sans.
  Asking *why* the extractor saw something turned an error in the artefact into a real defect.
- Rendering after-shots locally replaced the preview and CI that were both unavailable.

## What didn't, and why

- The audit read the code and the screens but not the backlog or epics, so its top recommendation
  was framed against a decision already made. The cost was small (one re-scope, one DESIGN.md
  correction) only because Keith mentioned the epic before Session 1 shipped.
- CI showed red on every push for a reason unrelated to the code (no runner was assigned: the job
  ended in two seconds with `runner_id: 0`). The signal tested "Actions can run", not the diff.

## The principle, stated generally

Before recommending changes to someone's product, read the plans they have already written for it
(epics, backlog cards, decision logs), and treat any external description of the product, scraped
or generated, as a measurement to check against source. Where the description is wrong, ask what it
saw: an extractor's error often points at a real defect.

## Where else it fits

- Paideia and Portfolio reviews that compare against benchmark sites.
- Any `/next-agent-card` style build that touches an area with an active epic.
- Code review: read the linked issue or design doc before judging the approach.

## Rules of thumb

- Search the backlog and epics for the area before the first recommendation, not after the report.
- A recommendation that touches a taste call an epic reserves for the owner becomes a baseline or an
  option, never a verdict.
- When a scraped spec disagrees with the tokens, the tokens win, and the disagreement is a lead.
- Before reading a red check as a code failure, confirm the job ran a step.
