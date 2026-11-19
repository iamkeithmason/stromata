# Carry the rejections into the brief

*The Stromata · 5 November 2026 · from tracing seventeen genre ornaments from pre-1600 woodcuts
([#202](https://github.com/iamkeithmason/stromata/pull/202))*

## In one line

Background agents traced seventeen period ornaments well once they were briefed with what Keith had already
turned down and why. When a brief carried only his latest choice ("redo as line art"), an agent satisfied it to
the letter and landed on a style he had rejected earlier for a different reason.

## Where it came from

The `/design/visual` exploration needed one small ornament per genre (seventeen), to sit on book covers at
30–40px. Keith asked for them to be traced from real woodcuts in public-domain herbals rather than drawn. The
session could not draw them itself in any useful time, so it sent each round to background agents. Each agent
fetched page scans, traced by hand against a gridded crop, built SVGs with a shared stroke library, and
returned a comparison sheet. Keith reviewed every round from his phone and answered in a line.

## What we did

1. **Four pilots, three styles.** Round 1 made filled silhouettes with cream cuts. Keith found them lumpy and
   chose "redo as line art". Round 2 made exactly that: even-weight strokes with round ends. They were clean,
   and they read as a modern UI icon set, which was the complaint Keith had made about an earlier round of
   abstract motifs. Round 3 named both failures in the brief ("not lumpy; not a modern icon; it should look
   *cut*") and described the target in craft terms: lines that swell and thin, chiselled ends, a few hatch
   cuts on the shadow side. Keith accepted three of the four, and the fourth (wheat) after one focused redo.
2. **Fan-out for the other thirteen.** Three agents ran in parallel, split by how hard their sources would be
   to find. One took the plants, all from the same 1499 herbal. One took everyday objects. One took the four
   with no obvious period subject (quill, column, harp, heart). Each brief pointed at the accepted four as the
   style reference and at the shared library, and asked for a sheet that set the new ornaments beside the
   accepted ones at the real size.
3. **Review before forwarding.** The session read every sheet itself before sending it on. It passed on the
   agent's own honest weaknesses and added its own reading where that differed.
4. **Redo by name, not by round.** Keith accepted eleven of seventeen at once. The six weak ones went back in
   one brief, with each one's specific failure stated ("reads as a bin", "lighthouse, not a strong tower",
   "a leaf, not a heart"). Five came back right. The palm took one more pass.

## What worked

- **A comparison sheet as the unit of decision.** Each sheet showed the source crop, the previous attempt, the
  new one at 30, 40, 64 and 160px, and the whole set in a row at 40 and 30px. Keith decided every round from a
  phone, in a few words, and never needed the files.
- **A shared library and an accepted reference held the set together.** Three agents in parallel, then a
  fourth, produced one visual family because they all built from the same stroke code and compared against the
  same four accepted ornaments.
- **Naming the failure got it fixed.** "Reads as a lighthouse" produced battlements. "Reads as a leaf" produced
  a proper cleft and point. "Reads as wheat beside the wheat" produced a palm with a different silhouette.
- **Agents' self-critique was mostly honest.** Every agent's report listed real weaknesses, and its picks
  between variants were usually right.
- **Letting the agent propose a different object** solved the column. An open book read at once at 30px. The
  column became a thin stick at any proportion.
- **Licences checked at the holder.** Wikimedia Commons refuses this cloud session, so every source came from
  the Internet Archive, the Met or the Rijksmuseum, each confirmed in the holder's own metadata.

## What didn't, and why

- **The brief carried the choice and dropped the reason.** "Redo as line art" was Keith's choice. "It must not
  feel modern" was his standing constraint, said a day earlier about a different round. The round-2 brief
  carried the first and not the second, so the agent optimised for clean line art and returned the look he had
  already turned down. That round cost about 236,000 subagent tokens and twelve minutes, plus a decision
  from Keith that should not have been needed.
- **Small-size readability is its own test, and it failed separately from beauty.** The wheat became a corn
  cob, the column a stick, the heart a leaf, and the palm passed for grass at 30px. Each looked fine at 160px.
  Only the set row at the real size showed it.
- **Agents' picks could still be weak.** An agent that has iterated on a piece judges it against its own
  earlier versions, not against the set. The tower and the heart were each the agent's chosen variant and
  were still wrong. Reading the set row caught them.
- **Some motifs failed whatever was tried.** Augustine's flaming heart read as a strawberry after three
  attempts, and the crown fallback said "king", not "martyr". Knowing when to stop and change the object
  saved more rounds.
- **Housekeeping leaked.** One agent downloaded Python wheels into the repository root, which tripped the
  stop hook. A container restart killed another mid-task. It resumed from its transcript, because its files
  were in the scratchpad, not in memory.

The whole job took roughly 1.9 million subagent tokens across ten agent runs (seven agents, three resumed),
for seventeen ornaments. About one token in eight went on a style already rejected.

## The principle, stated generally

When you delegate a taste-led task to an agent that has not seen the conversation, its brief needs three
things. It needs the target. It needs every option already rejected, with the reason for each. And it needs
the owner's standing constraints, even when they were said about something else. An agent optimises only for
what the brief says, so a new choice from the owner overrides the old constraints unless the brief restates
them. Then judge the work at the size and in the company where it will actually be used, not on its own.

## Where else it fits

- **Any iterative design or writing loop run through subagents.** Examples: note_draft critics, the
  design-critic loop, the plate hunts in this same PR. Each round's brief should carry the running list of
  rejections, not just the latest instruction.
- **Prompting in general.** A correction like "make it shorter" can undo an earlier "keep the citations" if
  the earlier rule is not restated.
- **Human handoffs.** A designer picking up mid-stream needs the rejected options and the reasons, or they will
  re-propose them.
- **Paideia and other projects** whenever the owner reviews outputs in rounds from a phone. The comparison
  sheet pattern travels.

## Rules of thumb

- **Keep a "rejected, and why" list in every brief after round one,** and add the owner's standing constraints
  ("not modern") even when they were said about something else.
- **Describe the target in craft terms, not category terms.** "Swelling lines, chiselled ends, a few hatch
  cuts" works where "line art" does not.
- **Make the decision artefact one image**: the source, the previous attempt, the new one at real sizes, and
  the full set in a row at the size it will be used.
- **Read the set row yourself before forwarding.** The agent's pick is a claim.
- **Name each failure concretely when sending work back** ("reads as a bin"), one line per item.
- **After two failed passes on one motif, offer a different object** rather than a third pass.
- **Brief agents to keep dependencies and downloads out of the repository**, and to work in the scratchpad,
  so a restart can be resumed.
