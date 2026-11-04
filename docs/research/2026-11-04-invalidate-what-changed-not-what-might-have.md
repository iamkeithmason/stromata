# Invalidate what changed, not what might have

*The Stromata · 4 November 2026 · from the backlog card "On-demand cache revalidation: refetch from
Supabase only when content changes" ([#193](https://github.com/iamkeithmason/stromata/pull/193))*

## In one line

A cache refresh scoped to "every page of this kind" looked free because refreshing is lazy, but crawlers
visit every page, so one chapter edit cost as much as a deploy; and a rule written down a month earlier
("every writer must invalidate") had still missed two writers, which a test then found in one run.

## Where it came from

Keith asked to work on Vercel usage through a backlog card logged on 7 October, during the Supabase
egress outage. The card's prompt specified a rebuild of the caching layer: `unstable_cache` with
`text:{slug}` and `library` tags, a revalidate endpoint, a CI guard. Three days before the card was
logged, the 4 October work ([a longer cache window needs every writer](2026-10-06-a-longer-cache-window-needs-every-writer.md))
had already shipped the week-long cache and per-save `revalidatePath`. Vercel's per-route CPU figures
need a Pro plan, so this session could not measure; it worked from the code.

## What we did

1. Read the card against the current code before building. Most of its design had shipped in another
   form; the card's prompt would have rebuilt working caching for little gain. Keith narrowed the scope.
2. Found the real cost in the code: saving a collection chapter, a collection or a location called
   `revalidatePath('/texts/[slug]', 'page')`, marking all ~770 text pages stale. Its comment argued this
   was cheap because "nothing is rebuilt until a reader or crawler next asks".
3. Replaced every route-wide purge with the named pages that actually change (a collection's published
   chapters; a location's authors and their texts), each from one slug-only query.
4. Wrote a source-scan test that refuses a route-wide or layout purge, and fails on any admin route that
   writes to Supabase without importing a revalidation helper. Ran it against the old file to confirm it
   fails there.
5. Added a secret-protected endpoint so CLI scripts, which cannot call `revalidatePath`, can refresh the
   pages they edit.

## What worked

- **Reading an aging card against the code first.** Five weeks of shipped work stood between the card
  and the codebase. One read turned a caching rewrite into a targeted fix.
- **The guard found what the prose rule had missed.** The 6 October rule was "list every write path and
  confirm each invalidates". On its first run the guard named two writers that had never been
  revalidated: the summary generator and the review queue's description approval. A rule in a document
  is followed most of the time; a test is followed every time.
- **Mutation-checking the guard.** Running it against the old code showed it fails where it should. A
  guard that has only ever passed proves nothing.

## What didn't, and why

- **"Lazy" was taken to mean "cheap".** Deferring the work to the next visit is cheap only when visits are
  sparse. On a crawled site every page is visited, so a lazy purge of a whole route is an eager one, a
  little later. The reasoning was written in a code comment and survived a month because it sounded right.
- **I stated a cost to Keith before tracing its trigger.** In the scope question I said every collection
  publish from the review queue re-rendered the library. Reading the batch path afterwards showed the
  queue skipped the purge, and had the opposite bug: live siblings were never refreshed at all. The
  decision didn't change, but it rested on a wrong mechanism, and I had to correct it after he chose.
- **No measurement.** The saving is argued from the code, not shown on the meter. It can be checked
  after the next release, on the Usage page's daily CPU bars for days with content edits.

## The principle, stated generally

The scope of an invalidation should match the scope of the change. A broad purge is a cost multiplied by
everything that will next read the cache, and on public sites that includes every crawler. The list of
writers, and the rule against broad purges, belong in a test, because the prose version is satisfied by
the writers you remember and silent about the ones you don't.

## Where else it fits

- Paideia, or any ISR, CDN or data-cache surface where pages share data: purge the dependants you can
  name, not the route that might contain them.
- Search indexes, materialised views, derived files such as `data/corpus-frequency.json`: rebuild the
  affected slice, not the whole thing.
- Any backlog where cards wait weeks: the older the card, the more likely the code has moved under it.
- Any written convention about "every X must do Y" that a source scan can check.

## Rules of thumb

1. Before purging a route or a layout, list the pages that actually show the change. If you can list
   them, purge those; if you can't, find out why before purging everything.
2. "Lazy" is cheap only if the readers are few. Count the crawlers.
3. Turn "every writer must invalidate" into a test that scans the writers, and keep a short, reasoned
   exception list beside it.
4. Run a new guard against the code it is meant to catch, once, before trusting a pass.
5. Before stating a cost to the person deciding, trace the code path that incurs it.
6. Read a card older than a couple of weeks against the current code before building from its prompt.
