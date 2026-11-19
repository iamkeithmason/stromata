# Move the work to the write

*The Stromata · 18 November 2026 · from replacing per-request PDF rendering with a printable reader and
stored collection PDFs ([#238](https://github.com/iamkeithmason/stromata/pull/238))*

## In one line

Twice we tried to make an expensive read cheaper by keeping callers away from it (robots.txt, `nofollow`,
a week's CDN cache, then a firewall challenge), and twice the bill came back. What fixed it was moving the
work off the read path entirely: render once when the content changes, or let the reader's own device do it.

## Where it came from

On 29 Sep 2026 Vercel's function table showed 159 PDF renders in 12 hours costing as much CPU as every text
page together. We answered with a robots.txt disallow, `rel=nofollow` and a week's `s-maxage`. On 18 Nov the
30-day Fluid Active CPU stood at 3h 34m of the 4h Hobby allowance, and the PDF routes topped the table again:
87 text-PDF calls (~1 min) and 17 collection-PDF calls (~2 min) in 12 hours. The crawlers doing it ignore
robots.txt, and a cache does little when nearly every request is for a different one of ~600 files. Readers,
meanwhile, rarely downloaded single texts (25 clicks all time) but often downloaded collections (34 against
82 collection views).

## What we did

1. **Texts:** dropped the server PDF. A print stylesheet plus a "Print / Save as PDF" button (`window.print()`)
   lets the reader's browser make the PDF. The old URL redirects to the text page from the CDN.
2. **Collections:** render each PDF once with the existing renderer and store it in Vercel Blob. The download
   route only redirects to the stored file.
3. **Rebuild on write, at the existing choke point.** Every save that changes a collection already
   revalidates `/collections/<slug>`. The rebuild hook sits in the two revalidation helpers, keyed on that
   path, so it covers all eight admin routes at once, and a 40-chapter batch publish rebuilds once.
4. **Measured before choosing storage.** Rendered three collections locally: PDFs run ~1.45× their body
   text, ~32 MB for all 41. That turned "Supabase egress is shared" into a number: 1,000 downloads ≈ 16% of
   the shared 5 GB cycle. Blob, on its own meter, won.
5. **Print by whitelist.** Every child of the reader page is hidden in print except the title block and the
   reading column, so furniture added later stays off paper without anyone tagging it.

## What worked

- **Removing the work rather than guarding it.** No request path can reach the renderer now, whoever sends it.
- **Piggybacking on invalidation.** "When does this derived file go stale?" had already been answered by
  "when does this page go stale?", and that answer already ran in one place.
- **A sample measurement before a storage decision.** Three renders took two minutes and replaced a guess
  about meters with a cost per thousand downloads.
- **Checking the real artefact, not the CSS.** Chromium's print-to-PDF at 390px, with the dark theme and a
  large text size switched on, showed light, book-sized pages and no stranded headings.

## What didn't, and why

- **Access controls on an expensive endpoint.** robots.txt and `nofollow` are requests that bad crawlers
  ignore, and per-URL caching does not help a long tail of distinct URLs. Both were reasonable first moves.
  Neither bounded the cost, because the cost was still per request.
- **The first fix was judged by its intent, not its effect.** The September change was not checked against
  the function table a few weeks later; the CPU warning found it instead.
- **Session limits on pushing.** The preview Keith asked for could not be pushed from the session, which may
  only push its own branch. A preview needs a person, or a pre-granted permission, to push `preview/*`.

## The principle, stated generally

When an endpoint is expensive per request and its output changes only when its inputs do, move the work to
the write: compute on change and serve the stored result, or hand the work to the client. Guarding the read
(rate limits, robots rules, caches) bounds the cost only when callers cooperate and requests repeat. Hook the
recompute onto the place the system already decides "this is now stale", rather than onto each writer.

## Where else it fits

- Paideia: any generated report, export or summary served on demand from data that changes on a schedule.
- OG images, sitemaps, feeds and search indexes: build on publish, serve static.
- LLM-generated text (summaries, notes) shown on public pages: generate on change, never per view.
- Any "export" button whose output a browser could produce itself: print, CSV from a rendered table.

## Rules of thumb

- If a route's output depends only on stored content, ask "could this be built when the content changes?"
  before reaching for a cache.
- Put derived-artefact rebuilds where invalidation already happens, keyed on the same path or tag.
- Before choosing between storage meters, render a sample and get bytes per item; then price a thousand reads.
- After a cost fix ships, put a dated check on the calendar to read the same meter again.
- For print, whitelist what prints; a blacklist goes stale with every new fixed element.
