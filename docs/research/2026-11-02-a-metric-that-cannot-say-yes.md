# A metric that cannot say yes

*The Stromata · 2 November 2026 · from the concept-extraction pilot ([#181](https://github.com/iamkeithmason/stromata/pull/181))*

## In one line

The pilot's first headline, "0 of 614 concepts recur", was produced by a metric that could not have
returned anything else, and the way to catch that is to ask what the instrument would read if the
answer were yes before believing it when it says no.

## Where it came from

Backlog card "Concept extraction pilot: 20 diverse texts". The build session had no
`ANTHROPIC_API_KEY`, so the `extract` step (one API call per section) never ran. Keith chose to run
the extraction with Claude Code subagents instead: ten agents, two texts each, 111 sections.

## What we did

1. Cut the 20 texts into sections, gave each agent its files, and asked for granular concepts with a
   verbatim quotation. Re-checked every quotation in the main thread with the harness's own
   function (614 kept, 0 dropped).
2. Ran `report`. It said 0 recurring, 614 singletons, 100%.
3. Looked at how recurrence was counted: two concepts matched only if their labels were equal after
   case and plural folding. Ten agents who never saw each other's output had no way to word an idea
   identically. Words did cluster by topic (christ, repentance, judgment), so the data was not empty.
4. Added a grouping step: one agent read all 614 labels with glosses and grouped those naming the
   same specific idea (118 groups, 261 labels left alone). Recurrence moved from 0 to 16 ideas, 15 of
   them matching no curated Theme.
5. A code review of the harness found it could silently apply a stale grouping, and that the
   merge step for subagent output lived in a scratchpad script. Both were fixed in the PR.

## What worked

- Re-running the quotation check in the main thread instead of accepting each agent's "I checked
  them". Zero drops, but the check is why that number means something.
- Reading the zero as a question about the instrument. The cluster of shared words was the clue.
- Giving the grouping pass the whole label set in one read, so one reader makes every cross-text call.
- The review pass: both real defects were in the glue around the model, not in the model's output.

## What didn't, and why

- **The first metric was written before anyone had seen a label.** The tests used labels that matched
  by construction ("Spiritual warfare" / "spiritual warfare"), so they passed against a metric that
  was blind to real wording variance.
- **Agents shared one scratchpad.** Three of the ten wrote helper scripts with the same names
  (`mk.py`, `gen.py`); two reran a file another agent had overwritten and rewrote other agents' result
  files. Nothing was lost, but only because each file was re-verified afterwards against the counts the
  agents had reported.
- **The no-key route started as a throwaway script.** It produced the numbers in the PR, but the
  committed harness could not reproduce them until `ingest` was added.
- **Positional ids** in the file handed to the grouping agent were tied to a locale-dependent sort,
  and nothing noticed if the file changed underneath them.

## The principle

A measurement earns trust by being able to fail the other way. Before reading a result, plant a case
where the answer is known to be yes and confirm the instrument says so; when the inputs are wordings
produced independently, compare by meaning, and keep the judgement in a stored, validated artefact so
the number can be reproduced and challenged.

## Where else it fits

- Any "do these items overlap" count over model-generated labels: tags, topics, themes, issue titles.
- Duplicate detection across independently drafted summaries or notes.
- The analytics sweep and other checks that report "none found": a zero needs a known-positive control.
- Any fan-out whose agents write files: reconciliation after the fact has to read the files, not the
  reports.

## Rules of thumb

1. Before trusting a zero, write down what the metric would read if the answer were yes, and test
   that with a planted positive. A metric that can only say no is not evidence.
2. Independent model passes do not converge on wording. Compare by meaning, in one pass that sees all
   the items, and store the result so it can be inspected.
3. Re-run the downstream check in the orchestrating thread; do not accept a subagent's self-check as
   the check.
4. Give every fan-out agent its own subdirectory. Shared scratch space turns same-named helper files
   into silent overwrites.
5. A route that exists because a credential was missing still ships as committed code with a
   test, or its results cannot be reproduced.
6. Ids shared between a tool and a model are positions, so tie them to a fingerprint of the data and
   refuse a mismatch.
