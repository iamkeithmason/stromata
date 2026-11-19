# Verify on the path that will run it

*The Stromata · 10 November 2026 · from building the backlog card "Editorial paragraph breaks for walls of
text" ([#224](https://github.com/iamkeithmason/stromata/pull/224)), migrations 038 and 039*

## In one line

Every check of a new database function passed, and its first real use failed. The checks ran through the
Supabase connector as `postgres`, which has no time limit; the script calls it through the API, which
cancels anything over 8 seconds. Separately, the first batch of model proposals ignored a rule the
prompt stated plainly, 127 times in 1,265, and only a count of the stored output showed it.

## Where it came from

The card needed a way to find "walls of text" (prose paragraphs of 800+ words) without downloading every
body, so the counting was written as a SQL function, `paragraph_wall_stats`, called by the drafting script
through PostgREST with the service key. A model then proposed paragraph breaks for 27 texts, which Keith
reviews one by one before any is applied.

## What we did

1. Wrote the function and checked its figures against the 10 Nov measurement through the Supabase
   connector's `execute_sql`: 151 published texts, 25 in Tier 1. They matched.
2. Tried to test the whole migration inside a block that rolls itself back. The connector asked for a
   confirmation nobody answered in time, so that test never ran. The migration was later applied on
   Keith's go-ahead without it, and Postgres refused the first attempt: a `BEFORE` trigger's `WHEN`
   clause may not reference the whole row on a table with generated columns. The transaction rolled back;
   the rule moved into a trigger function and the second attempt applied.
3. Re-checked after applying, all through the connector: the counts, the trigger on a draft-only write and
   on a real edit, the shape check, anon's permissions. All passed.
4. Keith ran the drafting script's dry run on his laptop. It failed at once:
   `canceling statement due to statement timeout`. The function took 15–16 s; PostgREST's role
   (`authenticator`) carries `statement_timeout = 8s`; the connector's `postgres` role carries none.
5. Timed the same work in pages of 60 texts under `set local statement_timeout = '8s'`: 0.8–2.3 s a
   page, same 153 rows. Migration 039 made the function take a page at a time and the script walk the
   pages. The dry run then passed and the real run drafted 26 texts.
6. Before Keith opened the review queue, read the stored proposals in SQL: anchor uniqueness, where
   breaks fell, and the first word of each new paragraph. 127 of 1,265 new paragraphs opened with "For",
   which almost always gives the reason for the sentence before it, though the prompt said not to break
   there. With Keith's go-ahead those were removed in SQL, and the draft step now drops them in code.

## What worked

- **Timing the work under the live limit.** `set local statement_timeout = '8s'` inside the test reproduced
  the API's constraint exactly, so the fix was measured against the same limit that had broken it.
- **Paging instead of raising the limit.** Lifting the service role's timeout would have removed a guard
  on every admin query to make one function pass. Paging kept the guard and the function under it.
- **Counting the model's output before a person read it.** One `GROUP BY` on the first word of each new
  paragraph turned "some breaks look odd" (from four samples) into "127 break the stated rule", which is
  a number an owner can decide on in one reply.
- **A deterministic filter after the prompt.** The draft step's `tidyBreaks` already narrowed model replies
  (range, duplicates, minimum length). The "For" rule joined it, so the next run cannot repeat the miss
  however the model behaves.

## What didn't, and why

- **The checks ran on a different path from the code.** Same database, same function, different role,
  different limits. Every check was true and none of them was the check that mattered. Nothing in the
  checklist said to run as the role the code uses.
- **The safeguard test was skipped when it was inconvenient.** The rolled-back test of the whole migration
  would have caught the trigger error before production. When its confirmation timed out, the migration
  was applied without it rather than re-running the test first. The cost was small (a rolled-back
  failure), but only because the migration ran in a transaction.
- **A prompt instruction was treated as a guarantee.** "Never break so that a sentence beginning 'For'…
  is cut off from what it answers" was in the prompt. The model broke there one time in ten. A rule the
  output must obey belongs in code that checks the output, not only in the request.
- **Cost:** one failed dry run on Keith's laptop, one extra migration, an unplanned SQL cleanup of the
  stored drafts, and about an hour of back and forth while Keith waited at the terminal.

## The principle, stated generally

A check proves something only about the path it ran on. When the code that will use a thing runs under
different credentials, limits or tools from the check, the check has to reproduce those conditions, or it
is evidence about a different system. The same holds for model output: a rule stated in the prompt is a
request, so verify the output against the rule before a person spends attention on it, and enforce in
code any rule the output must always obey.

## Where else it fits

- Any SQL verified through an admin console or MCP connector and then called through an API with its own
  role: Supabase functions, RLS policies, views, anything time-bound.
- Paideia: anything checked in the Supabase dashboard and then called from the app's anon or
  authenticated client, which carry 3 s and 8 s timeouts.
- Scripts checked on a laptop with full credentials that will run in CI or a scheduled routine with
  narrower ones.
- Every model-drafted batch a person will review: notes, summaries, sections, paragraph breaks. Count the
  output against the prompt's rules before the review, not during it.

## Rules of thumb

- Before calling a database function done, run it as the role that will call it, or under that role's
  limits: `set local role …` or `set local statement_timeout = '8s'` in the test.
- Know the limits of each path. Here: `anon` 3 s, `authenticated` and `authenticator` 8 s, `postgres`
  none. `select rolname, rolconfig from pg_roles` lists them in one query.
- When a pre-apply test can't run, stop and get it run. Don't apply without it, even when the change is
  reversible.
- After a model drafts a batch, run one aggregate over the stored output for each rule in its prompt
  before anyone reviews it. A rule that fails is a rule for code, not a stronger word in the prompt.
- Raise a timeout only as a last resort, and for one function rather than a whole role.
