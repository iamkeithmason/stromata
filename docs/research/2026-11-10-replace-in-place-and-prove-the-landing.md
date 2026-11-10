# Replace in place, and prove the landing

*The Stromata · 10 November 2026 · from replacing three held texts with cleared translations
([#221](https://github.com/iamkeithmason/stromata/pull/221), merged)*

## In one line

When a session cannot run the write itself and has to carry 100 KB of text through a tool call, the
only proof that the right text landed is a checksum of what the database stored, compared with one
computed from the file. A visual check would not have caught a slip, because the text was retyped by
the model, not copied byte for byte.

## Where it came from

On 10 November four texts were unpublished for copyright or provenance problems. Three had cleared
public-domain replacements: Dysinger's Praktikos (evagriusponticus.net), White's 1918 Patrick
(archive.org OCR), and the 1908 Cook & Tinker Sermo Lupi (archive.org OCR). The brief asked for the
rows to be replaced in place, so that the permanent accession numbers and the old URLs survived.
Nothing in the pipeline could do that: `pipeline-import.mjs` only inserts, and skips a slug that exists.

The cloud session had the Supabase connector but no service-role key, so a Node script could not write.

## What we did

1. Wrote `scripts/replace-text-body.mjs`. It reads staged files with flat frontmatter, guards every
   write on id + slug + accession number + `published = false`, and never touches `published`,
   `editorial_introduction` or `note_draft`. Dry run by default. `--apply` writes with the service key
   (a local run); `--sql=<file>` turns the same update into one guarded transaction per text, for a
   session that has only the connector. Both modes build the write from the same function.
2. Staged the three bodies. Two came from the existing OCR cleaner (`clean-archive-ocr.mjs`, new config
   entries, every correction named); the Praktikos from a small HTML parser.
3. Ran each transaction through `execute_sql`, then selected `md5(body)` and an MD5 of the provenance
   fields from the row, and compared both with MD5s computed locally from the staged file. All three
   matched on the first try.
4. Rebuilt `text_scripture_references` for each text, since the old rows indexed the old translation.

## What worked

- **The checksum turned a hope into a fact.** The SQL was 40–50 KB per text, and the model reproduced
  it in the tool call rather than streaming the file. A dropped clause or a quietly normalised
  character would have looked fine on screen. Comparing an MD5 computed on each side proves the stored
  text is the staged text, so nobody has to read the output to check it.
- **One builder for both write paths.** Because `--sql` and `--apply` share `buildSql`'s inputs and
  guards, the connector route did not need its own review. The guards in the SQL (a `do` block that
  raises unless exactly one unpublished row matches) are the same as the ones in the client path.
- **Reading the source end to end.** The brief said the 1908 sermon translation was "not individually
  credited". The scan shows it signed at the end, "Elizabeth W. Manwaring", as every selection in that
  volume is. It was caught only because the cleaner's end landmark had to be chosen by reading where
  the text stopped.

## What didn't, and why

- **The first write timed out unanswered.** The connector asks the user to confirm each write, and
  Keith was away; after four minutes the call failed and the session could not retry it in that turn.
  Approval for a gated write has to come from someone who is there, so the write waited for him.
- **A checkpoint in the brief was treated as a progress report.** The brief said "report the path you'll
  use before writing anything". The session wrote the script and staged files, then reported. Nothing
  went wrong, but in an asynchronous run the only way to honour a checkpoint is to end the turn on
  the question.
- **A parser dropped 69 list items silently.** Dysinger's chapters carry nested lists; the first parser
  read only top-level paragraphs, and chapter 57 came out as two sentences. It was caught by reading
  one chapter against the source, not by any count. A count of structural elements on each side would
  have caught it at once.
- **The scripture index silently skipped a form we kept.** White abbreviates Isaiah "Is."; the parser
  in `lib/scripture` does not recognise it, so three references would never have been indexed. Keeping
  the source's form was right for fidelity, but nothing reported the skip; it showed up only as a
  smaller count than expected.

## The principle, stated generally

When a model has to carry data through a channel where it may retype rather than copy it, verify what
landed with a fingerprint computed independently on both sides; a visual check does not prove the text
is unchanged. And an approval gate held by a person needs that person to be there when the write runs.

## Where else it fits

- Any MCP write of a large body: Notion page content, a Supabase migration pasted as SQL, an artifact
  republished from text in context.
- Any import whose parser can drop structure (lists, footnotes, tables, verse lines): reconcile element
  counts between source and output before trusting the output.
- Any brief that states facts about a source (who translated it, what a folder holds): treat them as
  claims, as CLAUDE.md already says of Drive folder names.

## Rules of thumb

- After a write you could not stream byte for byte, select a hash of the stored value and compare it
  with a hash of the source file. Equal hashes are the only "done".
- Give a write two routes (local key, connector SQL) from one builder, so the guards are written once.
- Schedule writes that need a confirmation for when the person who confirms is present, and say so before
  starting.
- When a brief says "report before you write", stop there, even in an async run.
- Count the structure on both sides of a conversion (paragraphs, list items, footnotes) before reading
  the prose.
- When you keep a source's own form, run the downstream parser over it and compare the count with what
  you expected.
