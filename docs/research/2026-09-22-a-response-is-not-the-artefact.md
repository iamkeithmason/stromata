# A response is not the artefact

*The Stromata · 22 September 2026 · from a typography session prompted by reader feedback that the site's font "screams Claude/ChatGPT/Whatever" ([#131](https://github.com/iamkeithmason/stromata/pull/131))*

## In one line

I applied "verify you fetched the thing you asked for" correctly to a Project
Gutenberg URL, then twenty minutes later read a Vercel SSO login page as proof
that my fonts had shipped — a `200` is a statement about a transport, never
about what came back, and the same session shows the rule being obeyed and
broken with no change in my confidence either time.

## Where it came from

Duncan, a reader, left feedback on Discord: warm about the library, and then —
*I'm not such a fan of the font as it screams Claude/ChatGPT/Whatever.* The
session that followed was mostly judgement work, and produced three lessons
worth separating from it.

**The one that cost most.** I pushed a branch, Vercel deployed a preview, and I
went to verify what I had told Keith I could not verify: that the new fonts
served and that Cormorant was gone from the wire. Every check came back clean.
`/`, `/colophon`, `/design/type` all returned `200`. A grep of the homepage HTML
found zero references to `fonts.googleapis`, zero to `cormorant`. I reported
"Cormorant is gone from the wire entirely" as a verified fact.

It was a login page. The preview had Deployment Protection on, so every request
302'd to `vercel.com/sso-api`, and a login page contains no reference to
Cormorant for the excellent reason that it contains no reference to anything on
the site. The one check that broke the illusion was accidental: fonts came back
as `text/html`, 340 KB. A `.woff2` that is a third of a megabyte of HTML is not
a font.

What makes this worth writing down is not that I was fooled. It is that the
project's CLAUDE.md warns about this exact failure **twice** — once for the
Spurgeon mis-fetch, where a queue row cleared against a correct edition was
fetched from a wrong one and 108 KB of *Buchanan's Journal of Man* went into the
library under Spurgeon's name; once for the analytics sweep, in the words "a
Vercel preview with Deployment Protection on answers 302 to `vercel.com/sso-api`
for everything, so the sweep sees a login page rather than the site." And I had
*obeyed* the first of those earlier in the same session: asked to queue Keble's
*The Christian Year*, I fetched Gutenberg #4272 and read `Title: The Christian
Year / Author: John Keble` out of the file header before trusting it. Same rule,
same session, one hour apart. Applied to somebody else's URL; forgotten for my
own deployment.

**The second.** Asked about Junicode as an alternative body face, I raised file
size as a real caution: it carries the full MUFI medieval character set, and I
said it would need subsetting before it was web-viable. True as far as it went,
and it read as a point against. Then I measured: 978 KB upstream, and **33 KB**
after pinning the width and ENLA axes, instancing to weight 400, and subsetting
to Latin. Against EB Garamond's 21 KB. The caution I had offered as a
consideration was, at the scale that mattered, not one.

**The third.** The question underneath — Garamond or Junicode — is a taste
question, and I had been answering it in prose: adjectives about x-height and
colour and firmness of foot. Two Renaissance serifs described a paragraph apart
are indistinguishable to a reader deciding between them. Building
`/design/type`, which renders the same real passage of Traherne at the
production reading size on the production measure in each candidate, replaced
the whole argument.

## What we did

For the fetch: stopped, said plainly that the earlier verification was
worthless, and corrected it in the PR body as well as in chat so the claim
would not sit in the thread looking like evidence. Then re-verified at source
level — a grep of the repo, which is a real artefact — rather than pretending
the wire check had happened.

Chasing the correction turned up an actual bug. Retiring the `--serif-cormorant`
token had left two references to it in `app/design/page.tsx`, so both rows
rendered in the browser default. I had spotted them mid-session, filed them
mentally as "fix with the small-caps work", and never returned. The location is
the joke: `/design` exists precisely so the reference cannot drift from
`globals.css`, and it was the one page left drifting.

For Junicode: measured, then published the number in the PR and the backlog card
so the next person does not re-litigate it from general knowledge.

## What worked

**Reading the header, on the one occasion I did it.** Gutenberg #4272 took one
`curl` and one `head -c 700`. Guessing three plausible ebook IDs first — all
wrong, one of them *Beatrix* by Balzac — cost more than the check did.

**Measuring instead of reasoning about size.** `pyftsubset` plus a variable-font
instancer answered in under a minute a question I had been answering from
recall. The answer reversed my advice.

**Rendering the candidates.** `/design/type` is now the artefact that settles
the question, and it also carries the lining-vs-oldstyle comparison and the
four ways to set a small-caps label, so three separate arguments collapsed into
one page someone can look at.

**Checking the font tables rather than assuming them.** Before choosing how to
do small caps I asked fontTools whether the shipped faces had an `smcp` table.
Neither EB Garamond nor IM Fell English does — so `font-variant-caps` would have
produced the browser's synthetic small caps, worse than the letterspaced
capitals being replaced. That one query changed the implementation.

## What didn't, and why

**A status code was allowed to stand in for content.** `200` means a server
answered. It does not mean the server answered with the thing named in the URL,
and under an auth gate it reliably does not. The generalisation of the Spurgeon
rule is not "verify Gutenberg URLs"; it is "assert on the bytes you wanted,
whoever you are fetching from and whatever you are fetching for."

**A negative grep was treated as strong evidence.** "Zero references to
`cormorant`" felt conclusive, and it is exactly the shape of result that an
empty or wrong document produces most readily. A search that can only return
zero on the document you have has told you nothing. Pairing every negative check
with a positive control on the same fetch — *does this document contain
something I am certain the real one contains?* — would have caught it in the
same breath. I had no positive control at all.

**Deferred cleanup inside a session is lost work.** Both dangling
`--serif-cormorant` references were seen, named as leftovers, and postponed to a
step that turned out not to touch that file. Nothing carried the intention
forward. The task list I was already keeping would have held it for the cost of
one line.

**A qualitative caution was offered where a number was cheap.** "It would need
subsetting" is the kind of statement that sounds like diligence and functions
like a verdict. When the quantity decides the question and measuring it takes a
minute, the hedge is the error.

## The principle, stated generally

**A response is not the artefact, and a signal of success is not the success.**
Every layer between a request and the thing requested — auth gates, redirects,
CDNs, error pages rendered with `200`, caches, proxies — is capable of returning
something well-formed and irrelevant. Transport-level success is evidence about
the transport. Content-level claims need content-level assertions.

This is the twin of a lesson already in this bank. *An absence is a hypothesis,
not a finding* says a missing thing in the data is a question for the code. The
mirror holds too: **a present thing in the response is also a hypothesis.**
Absence and presence are symmetric, and neither is self-authenticating. The
practical form of both is the same instruction: go and look at the source.

Two corollaries earn their own line:

**A negative check needs a positive control.** Concluding *X is absent* from a
document you have not established is the right document is unfalsifiable by
construction — the wrong document also lacks X. Confirm the document first with
something you know must be there.

**When a number decides the question, measure it.** Recalled magnitudes are
about the artefact as distributed, not as deployable: a font as shipped, a
dependency before tree-shaking, a dataset before the columns you need. The gap
between the two is routinely an order of magnitude, and it is routinely the
whole decision.

## Where else it fits

- **Any agent verifying its own deployment.** Preview environments behind SSO,
  staging behind basic auth, and corporate proxies returning interstitials all
  produce confident `200`s. This is the single most likely way an agent reports
  a deploy verified when it has verified a login screen.
- **Scraping and ingestion of every kind.** Soft-404s, paywall interstitials,
  consent walls and "temporarily unavailable" pages are all `200` with a body.
  The Stromata's pipeline already encodes this for one source; the rule is not
  source-specific.
- **Health checks and smoke tests.** A check that asserts only on status is
  satisfied by an error page. Assert on a string only the working page contains.
- **Dependency and asset budgets.** "That library is huge" is a claim about the
  published bundle. Measure the built output before it settles an architecture
  decision.
- **Any question of taste with more than one credible answer.** Render the
  candidates on the real content at the real size. Prose comparison of two
  similar things is a worse instrument than looking at them, and it consumes
  more tokens to be less useful.

## Rules of thumb

1. **Assert on content, never on status.** A fetch is verified when you have
   read something from the body that only the right artefact contains.
2. **Pair every negative check with a positive control from the same response.**
   If you cannot name something the real document must contain, you cannot
   conclude anything from what it lacks.
3. **Check the content type and the size.** A `.woff2` returning `text/html`, or
   a 340 KB "font", is the cheapest tell there is.
4. **When you catch yourself hedging about a quantity, go and measure it** —
   especially if the hedge is doing the work of an argument.
5. **Recalled sizes describe the distributed artefact, not the deployable one.**
   Subset, tree-shake, or instance first, then quote a number.
6. **For taste questions, build the comparison surface before writing the
   comparison.** Same content, same size, same measure, side by side.
7. **Ask the file, not your memory, about file capabilities** — OpenType tables,
   codec support, schema columns. One query beats a confident assumption.
8. **A deferred fix that is not written down is not deferred, it is dropped.**
   If you say "I'll fix that later in this session", put it in the task list in
   the same breath.
9. **When you find a rule you already broke, check where else it applied in the
   same session.** Obeying it once is not evidence you obeyed it throughout —
   here, one hour separated correct application from failure.
10. **Deleting a token or symbol is not done until its consumers are swept** —
    and check the documentation or reference page first, since it is the
    consumer least likely to be exercised and most likely to be believed.
