# Make the claim carry its evidence

*The Stromata · 10 November 2026 · from the edition provenance audit, Step 1
([#220](https://github.com/iamkeithmason/stromata/pull/220), merged)*

## In one line

A field is only trustworthy when the evidence for it travels with it: the audit accepted a value only if
it appeared word for word in a quoted source, and checking the corpus's own provenance notes that way
found two published credits that were wrong.

## Where it came from

Each text's translator and edition lived in three free-text columns, mostly written by earlier agent
sessions. The ticket asked for a read-only script that proposes structured fields from that text, so a
later step can store them. "AI proposes, editor approves" was the stated rule, and an LLM pass was
allowed only if it never accepted a translator or edition that was not in the text.

## What we did

1. **Pass 1, deterministic.** A token-aware parser (`scripts/lib/edition-parse.mjs`, 26 tests from the
   ticket's fixtures) resolved 516 of 556 rows. Every field records the method that produced it, and every
   unresolved row a reason code.
2. **Pass 2, an LLM with a guard.** A model answered only the unresolved rows, and a field was kept only if
   its `evidence` was a verbatim substring of that row's notes and contained the value. The session had no
   API key loaded, so the script grew `--llm-export` / `--llm-answers`: export the requests, let any model
   answer (a subagent did), apply the answers through the same guard.
3. **Sourcing, with the same guard turned outward.** For gaps the notes could not fill, a committed
   `sourced-fields.json` holds values looked up elsewhere, each with its URL and a verbatim citation, and
   the script refuses any value that is not in that citation. Editor-confirmed values carry a note saying
   who confirmed them. These override Pass 1 and keep what they replaced.
4. Keith fixed the live records from paste sheets, and the session checked each save in the database.

## What worked

- **The guard held both ways.** Pass 2's answers passed it with none rejected, and also resolved no new
  row: what was missing (a translator, a volume) was not in the notes, and the guard would not let a model
  supply it. That is the result to want; a guard that a model can talk past is not a guard.
- **Checking stored claims against the edition's own citation caught real errors.** Of the rows checked
  against New Advent footers and other primary pages, two published credits were wrong. The *Stromata*
  notes credited "Roberts-Donaldson", the series editors; the citation names William Wilson. Pliny's
  letters were credited to Melmoth/Bosanquet; the text is a different, unidentified translation (the trail
  ends at a 1990s web file), possibly still in copyright.
- **Decoupling the model from the check.** Because the guard, not the answerer, decides, it did not matter
  that a subagent stood in for the API. The file of answers is committed and can be audited later.
- **Word-for-word comparison as the test of any text transform.** When the Melmoth replacement was first
  extracted, an off-by-one dropped Trajan's opening line; Keith spotted it by reading. The fix was a check
  that the extracted letters equal the source in every word, and the same check then made adding
  paragraph breaks safe. It became a rule on the paragraph-breaks backlog card.

## What didn't, and why

- **The provenance notes were treated as data, and some were inference.** Earlier sessions wrote
  attributions from general knowledge ("Roberts-Donaldson translation") rather than from the page's
  citation. Nothing in the note said which was which, so the error looked exactly like a fact.
- **The off-by-one reached the person.** The first Pliny sheet went out unchecked against its source; a
  one-line comparison would have caught it before Keith did.
- **A requested checkpoint was skipped.** The ticket asked for a report of existing code before writing;
  the session reported afterwards. Harmless here, but the checkpoint existed so the owner could redirect
  early.

## The principle, stated generally

A value an agent writes should carry, or point to, the exact text that justifies it, and a machine check
should refuse the value when that text does not contain it. Applied to a model's output this stops
invention; applied to stored records it exposes the ones that were inferred rather than read. Keep the
check separate from whoever produces the answer, so the answerer can change (API, subagent, person)
without weakening it.

## Where else it fits

- Any agent-written metadata: Scout and Sourcer prospect fields, `note_draft` claims about a work,
  copyright verdicts (the Drive-batch rule already prefers a verbatim phrase match over register).
- Paideia, anywhere a model fills a structured record from documents.
- Text transforms of any kind (OCR cleanup, rejoining, paragraphing, replacements): compare the result
  with the source word for word, and allow only the changes you meant.

## Rules of thumb

- Store the quote, not just the value: `{value, evidence, source_url}`.
- Accept a field only if its value appears in its evidence, and its evidence appears in the source.
- When a stored note and the edition's own citation disagree, the citation wins; record what it replaced.
- Before handing a person any extracted text, diff it against the source.
- A model pass that "resolves nothing new" under a strict guard is information: the gap needs a source,
  not a smarter parser.
