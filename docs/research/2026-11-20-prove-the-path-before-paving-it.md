# Prove the path before paving it

*The Stromata · 20 November 2026 · from moving the content pipeline off Keith's laptop
([#253](https://github.com/iamkeithmason/stromata/pull/253), card "Pipeline off localhost: weekly cloud run,
queue in Supabase, next-action labels")*

## In one line

The card prescribed a migration, a new table and a scheduled job; its own "MVP validation" said to run one
cloud session by hand first, and Keith had deferred that. Running it first changed the plan: the blocker had
already gone, the real gap was elsewhere (a source format with no committed path), and three of eight queued
sources pointed at the wrong thing.

## Where it came from

On 12 Nov the queue held 103 pending prospects and every pipeline step needed the laptop. The card bundled
three builds. Its notes listed credentials as the first open question, and a parked action from 9 Nov said a
cloud import had failed for want of the Supabase service key. On 20 Nov Keith asked for a plan and an
autonomy split, then said go.

## What we did

1. **Read the environment before planning.** `get_environment` listed `SUPABASE_SERVICE_ROLE_KEY`; one REST
   read with it returned 200. The blocker in the card and the parked action had been removed since they were
   written.
2. **Ran the card's MVP by hand before writing code.** One session imported the three texts parked since
   9 Nov, then took five prospects through Stages 1–5a: 25 drafts, each checked by query.
3. **Verified each source by its content, not its status code.** Read the title before fetching.
4. **Built the table behind a fallback.** `prospect-store.mjs` reads the table, or the JSON file while the
   table does not exist, and says which. The code could merge before the migration ran.
5. **Checked the backfill by reading it back in both directions**, not by the write count.

## What worked

- **The hand run found what the plan could not.** Four of the five top-scored prospects were CCEL plain-text
  exports, which the fetcher cannot read. Without the run, the weekly job would have been built, scheduled
  and failed on its first four items. The converter it needed (`ccel-to-markdown.mjs`) now exists because the
  run hit the gap.
- **Content checks caught three bad sources in eight.** Westminster's link was a Wikisource versions page,
  Re-Baptism's New Advent number served a different treatise, and Jewel's staged file was Gutenberg's landing
  page. Every one answered 200.
- **Fallback decoupled the merge from the migration.** The PR stayed safe to merge while the schema change
  waited on Keith, which it did for most of an evening.
- **The read-back caught 231 phantom changes.** The write reported 259 rows; reading them back flagged 231 as
  different, all `null` in the file versus absent in the table. Same data, but the comparison would have
  reported false changes on every sync and import.

## What didn't, and why

- **The connector's approval prompt never reached Keith.** `apply_migration` asked for confirmation twice;
  both requests timed out after about four minutes with his screen open on the phone. The fix was to stop
  using the tool for the step: he pasted the SQL into the Supabase editor in a mobile browser. About eight
  minutes and two round trips were lost to a path he could not see.
- **Third-party metadata nearly passed a copyright gate.** CCEL's header gives J. H. Jowett's dates as
  1817–1893: Benjamin Jowett's. A death-year check fed from that header would have cleared him (he died
  in 1923) for the wrong reason. Keith later cleared him on the 1905 publication, recorded as a ruling.
- **The first export rewrote the whole file.** Snapshotting the table to JSON sorted rows and dropped explicit
  nulls: an 8,000-line diff for one changed row. Fixed by keeping the file's order and nulls.

## The principle, stated generally

When a plan includes its own cheap validation step, run that step before building anything, even if it was
deferred: it tests the assumption the rest of the plan rests on, against the world as it is now rather than as
the plan's author found it. Verify identity at the content, never at the transport (a 200) or a third party's
catalogue. And verify a data move by reading it back, in both directions, with a comparison that knows which
differences are real.

## Where else it fits

- Any backlog card written more than a few days before it is built: credentials, quotas and blockers change.
- Any job that reads external sources: scrapers, importers, the Sourcer, link checkers.
- Any migration with a backfill, in any project, and any export written back into git.
- Any tool step that needs a human's interactive approval while the human is on a different device.

## Rules of thumb

- Run the card's MVP validation first, even when it was deferred. It is the cheapest thing on the card.
- Before planning around a blocker, check whether it still exists: one environment read, one live call.
- A status code proves a server answered, not that it holds the right work. Read the title and author.
- Never gate a hard constraint on a source's catalogue metadata. Read the title page.
- After a backfill, compare both directions; treat null and absent as equal, and nothing else.
- Ship the new store behind a fallback that announces itself, so code and schema can land separately.
- When a tool needs approval and the person is on their phone, offer the manual path first.
- Make exports preserve the source's order and nulls, so the diff is the change.
