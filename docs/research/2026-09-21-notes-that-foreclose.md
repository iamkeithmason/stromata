# A note that forecloses a capability is worse than no note

## In one line

An instruction file that says "X is impossible, don't retry" suppresses the one action that
would reveal X is now possible — so a false capability claim never corrects itself, and the
cost compounds silently for as long as the file is trusted.

## Where it came from

`CLAUDE.md` carried this, near the top, under a heading announcing the workspace's plan tier:

> the following tools are **plan-gated and will fail with a 400 "requires a Business plan"
> error**: … `notion-query-data-sources` in SQL mode against a single data source
>
> **Use instead:** `notion-search` … then `notion-fetch` each result by ID … it's the only
> reliable path on this workspace's plan. **Don't spend time retrying the gated tools with
> different parameters — they fail on plan, not on query shape.**

Every line of that is plausible. Some of it was true. The SQL half was not.

The note had been load-bearing for months: reading the 291-row Content Prospect List meant a
keyword search plus one page fetch per hit, with no aggregation. Earlier in this same session I
told Keith a whole-list duplicate check wasn't practical on this plan — not from testing, but
from quoting the file.

Then a task needed it enough to be worth one probe. SQL mode worked. So did `rows` mode, which
the note didn't mention at all. Only view mode was actually gated.

The immediate payoff: a duplicate sweep across all 291 prospects, in one query, of the thing
that had been written off as impractical. It found 14 duplicate groups covering 29 rows.

## What we did

1. **Probed before planning around the claim** — one `SELECT COUNT(*)`. It returned 291.
2. **Rewrote the note as a dated observation** rather than a standing fact: which modes were
   verified, on what date, against which data source, plus the real limit (SQL draws on a
   metered shared-workspace budget on this plan — it is not free, and it did run out later the
   same afternoon, which is itself now recorded).
3. **Found the contradiction the fix left behind.** Correcting the section at the top of the
   file left a second copy of the false claim 200 lines below, in the pre-run sync steps, still
   instructing future runs that the query tools were gated. The stale claim had survived inside
   the very file that now warned against stale claims.
4. **Ran the replacement query before documenting it** — which caught a bug in it.

## What worked

**Dating the claim.** "Gated as of 2026-06, tested with a single-source `SELECT`" ages honestly;
"is gated" does not. A reader three months later can see the claim's age and decide whether to
re-test. The undated form gives them nothing to doubt.

**Recording the limit alongside the capability.** The corrected note says SQL is metered on this
plan and will start refusing. Roughly an hour later it did exactly that, mid-task. Because the
behaviour was already written down it read as an expected boundary rather than a new breakage,
and the fallback (`rows` mode, `notion-fetch`) was already named.

**Running the documented fragment against the live system.** The replacement note offered a
ranked query. Score is a Notion formula that returns nothing to SQL, so it has to be recomputed
from `Value ÷ (Complexity + Effort)`. The obvious expression is wrong: the three inputs are
stored as integers, so SQLite does integer division.

```
Value 3 · Complexity 1 · Effort 2   →   1     (not 1.5)
```

Every row collapses onto a handful of integers and `ORDER BY score DESC` returns an arbitrary
order that still *looks* ranked. Running it first turned a plausible snippet into a caught bug;
the cast is now flagged in the docs as load-bearing. Had it been written down unrun, it would
have read as authoritative and been copied forward indefinitely.

**Grepping for the claim, not just fixing the section.** The second copy was only found because
the file was re-read after the edit. One `grep` for the claim's distinctive phrase would have
found it immediately; nothing about editing the first instance surfaces the second.

## What didn't, and why

**Trusting the file's confidence.** The note's tone was its main defence: it named an exact
error string, gave a reasoned alternative, and pre-empted the retry with "they fail on plan, not
on query shape." Specificity reads as evidence. It wasn't — the whole thing may well have been
written from a single failure of view mode and generalised.

**Assuming a correction is a single edit.** A claim repeated in two places is half-fixed by one
edit, and the half that survives is now *more* dangerous, because the file looks corrected.

**Reasoning about SQLite's types from the schema.** The columns are declared `FLOAT` in the
data source's own table definition. That is what made integer division a surprise, and it is
why "it should be a float" is not a check.

## The principle, stated generally

Two claims decay differently, and only one of them is self-healing.

A note saying **"X works like this"** gets tested every time someone uses X. If it drifts, the
next user hits the drift and fixes it. The feedback loop is automatic.

A note saying **"X is impossible"** is never tested, because nobody attempts what the file says
cannot be done. It has no feedback loop at all. It will outlive the limitation it describes,
and the only thing that ever corrects it is someone ignoring the file.

So negative capability claims need what positive ones get for free: an expiry. Since files don't
expire, the substitute is a date and a method — what was tested, when, and how — so a reader can
judge staleness instead of inheriting a verdict.

The same asymmetry explains the smaller lesson. A documented *command* is checked by everyone who
runs it; a documented *impossibility* is checked by nobody. And a command that produces
plausible-but-wrong output (integer division, a regex anchor that matches end-of-string rather
than end-of-line) sits in between: it is run often, but never *checked*, because it does not
fail. Silent-wrong is the failure mode that survives longest.

## Where else it fits

- **Any agent instruction file** — `CLAUDE.md`, `AGENTS.md`, a README's "known limitations",
  a skill's preamble. These accumulate negative claims fastest, because each one was written at
  the moment something failed, and nothing ever revisits it.
- **Vendor and platform capabilities specifically.** Plan tiers change, APIs add modes, quotas
  move. Any note of the form "this connector/tool/plan cannot X" has a short half-life and no
  alarm.
- **Environment quirks written up as permanent** — "this host can't reach Y", "that endpoint
  403s". True on the day, indefinitely quoted afterwards.
- **Documented code fragments** — the query in the runbook, the curl in the README, the snippet
  in the onboarding doc. Copied far more often than they are re-run.
- **Inherited pointers treated as facts.** The same shape shows up in data, not just docs: on
  this project five prospect rows carried a `Reference URL` that had never been fetched, and on
  checking, four returned 404 and one a 403 — one of which had already caused the wrong book to
  be imported. A recorded pointer nobody has followed is a claim nobody has tested.

## Rules of thumb

1. **Before planning around a documented impossibility, spend one call testing it.** One probe
   is cheaper than any workaround it might retire.
2. **Write negative claims with a date and a method**, never bare. "Gated as of 2026-06, tested
   with a single-source `SELECT`" beats "is gated" — the first can be re-tested, the second can
   only be believed.
3. **Never write "don't retry this."** It is the one instruction that guarantees the claim can
   never be corrected. Write the cost of retrying instead, and let the reader judge.
4. **Record the limit next to the capability.** "Works, but metered" turns a future failure into
   an expected boundary rather than a fresh incident.
5. **Run a fragment against the live system before writing it down.** Documenting it grants it
   authority it has not earned. This applies hardest to things that return plausible output when
   wrong.
6. **After correcting a claim, grep the file for it.** A claim stated once is usually stated
   twice, and a half-corrected file is worse than an uncorrected one.
7. **Suspect any pointer nobody has followed** — a URL, a path, an id — especially one sitting in
   a field whose name implies it was checked.
