# The Stromata — Claude Code Instructions

The Stromata is a curated digital library of public-domain Christian theological texts, built with Next.js 15 App Router and Supabase. This file governs the weekly content pipeline agent.

---

## Pipeline Purpose

**Driver 3 — content breadth.** The pipeline finds, fetches, cleans, and stages new texts from public-domain sources. It does not discover authors or handle user-facing SEO — those are separate concerns.

Stages 1–4 are automated and produce staged markdown output. **Stage 5a (import) runs automatically** via `scripts/pipeline-import.mjs`, writing texts into Supabase as `published: false` so Keith can review them in the existing admin UI at `/admin/drafts` rather than copy-pasting from local files. **Stage 5b (publish) is always manual** — Keith reviews each draft in the text edit form and publishes at his own discretion.

---

## HARD CONSTRAINTS — Never Violate

1. **Never set `published: true` programmatically.**
2. **Never write or promote `note_draft` into `editorial_introduction` programmatically.** (Note: the database column is `editorial_introduction`, not `editorial_note` — this is the field shown above the text body, populated only by Keith via the "Use this draft" button in the text edit form.)
3. **Always verify `author.death_year < 1900` before Stage 1 exit.** If `translation_copyright_clear: true` is set explicitly in the prospect, a modern translation may be usable — but still verify before proceeding. If uncertain, reject. (`pipeline-import.mjs` re-verifies this at import time as well.)
4. **All `tradition` / `era` / `genre` / `theme` values must come from the controlled vocabularies at the bottom of this file.** Do not invent values.
5. **Assign at most 6 themes per text.**
6. **Never set `authors.draft: false` programmatically.** The import script may create draft author stubs (`draft: true`) when an author isn't yet in the database, but only Keith promotes an author out of draft, from the author edit form.

---

## Prospect Queue

**Location:** `scripts/ingestion/prospect-queue.json`

This is the Content Prospect List. Each item moves through a linear status chain:

```
pending → stage-1-done → stage-2-done → stage-3-done → staged → imported → [manual publish] → rejected
```

**Before starting a run, sync new prospects from Notion** (see Pre-run section below). Then process only items with `status: "pending"`. After each stage completes, update the item's `status` (and relevant fields) and write the file back before continuing to the next stage — this makes runs resumable.

### Queue schema

```json
{
  "prospects": [
    {
      "id": "unique-kebab-id",
      "status": "pending",
      "added": "YYYY-MM-DD",
      "author": "Display name",
      "death_year": 604,
      "tradition": "imperial",
      "era": "nicene-post-nicene",
      "title": "Book of Pastoral Rule",
      "genre": "Rule",
      "source_type": "newadvent",
      "source_url": "https://www.newadvent.org/fathers/...",
      "collection_slug": "pastoral-rule-gregory",
      "translation_copyright_clear": true,
      "translator": "James Barmby",
      "translator_death_year": 1887,
      "stage_1_notes": "",
      "stage_2_output": "",
      "stage_3_themes": [],
      "rejection_reason": ""
    }
  ]
}
```

**source_type options:** `newadvent` | `gutenberg` | `wikisource` | `archive_online` | `archive_ocr`

- `archive_online` — Archive.org hosted clean HTML/text (fetched directly)
- `archive_ocr` — Archive.org djvu.txt scan that needs OCR cleanup

---

## Pre-run — Sync from Notion

Before each pipeline run, pull new candidates from the Notion Content Prospect List so that manual JSON editing is not required.

**Notion database:** [Content Prospect List](https://app.notion.com/p/4c842767c9384c50847f55e08914eecf) (ID: `4c842767-c938-4c50-847f-55e08914eecf`)

### Steps

1. **Search for ready prospects.** Use the Notion MCP `search` tool to find pages in the Content Prospect List with `Status = "Text available"`, sorted by Score descending. Since the SQL query tool requires a Business plan, use keyword search and then `fetch` each result page to read its properties.

   Useful search queries to try in sequence:
   - `"Text available" site:notion.so stromata content`
   - Fetch the database page directly and follow linked prospect pages

2. **Fetch each candidate.** For each result, call `notion-fetch` with the page ID to read its full properties: Title, Author, Era, Tradition, Genre, Reference URL, Translation notes, Status, Score, Complexity, Effort.

3. **Skip already-handled items.** Do not add a prospect if:
   - Its `Status` in Notion is `Live`, `In progress`, or `Needs investigation`
   - An entry with the same `collection_slug` already exists in the local queue (any status)
   - A text or collection with the same slug already exists in Supabase

4. **Map fields to queue schema.** Notion fields → queue fields:

   | Notion field | Queue field | Notes |
   |---|---|---|
   | Title | `title` | Use as-is |
   | Author | `author` | Use as-is |
   | Era | `era` | Convert label to slug (see mapping below) |
   | Tradition | `tradition` | Convert name to slug (see mapping below) |
   | Genre | `genre` | Use as-is (names match) |
   | Reference URL | `source_url` | Use as the starting source URL |
   | Translation notes | `translator` / `translator_death_year` | Parse name and death year from the note |
   | Editorial notes | `notes` | Carry over as a `notes` field for Stage 1 context |

   **Era label → slug:**
   `Apostolic` → `apostolic` · `Ante-Nicene` → `ante-nicene` · `Nicene & Post-Nicene` → `nicene-post-nicene` · `Early Medieval` → `early-medieval` · `High Medieval` → `high-medieval` · `Late Medieval` → `late-medieval` · `Reformation` → `reformation` · `Post-Reformation` → `post-reformation` · `Modern` → `modern`

   **Tradition name → slug:**
   `Early Church` → `early-church` · `Patristic` → `patristic` · `Byzantine` → `imperial` · `Oriental Orthodox` → `oriental-orthodox` · `Eastern Orthodox` → `eastern-orthodox` · `Roman Catholic` → `roman-catholic` · `Anglican` → `anglican` · `Reformed` → `reformed` · `Lutheran` → `lutheran` · `Ecumenical` → `ecumenical`

   **source_type inference from Reference URL:**
   - `newadvent.org` → `newadvent` (but check: New Advent /fathers/ URLs are broken as of June 2026 — use `archive_ocr` instead)
   - `gutenberg.org` → `gutenberg`
   - `wikisource.org` → `wikisource`
   - `archive.org/stream/...djvu.txt` → `archive_ocr`
   - `archive.org` (other) → `archive_online`
   - Other clean HTML (e.g. anglicanhistory.org, ccel.org) → `archive_online`

   **death_year:** Not stored in Notion. Leave `null` — Stage 1 will research and fill it in. If the author's era strongly implies pre-1900 (e.g. Ante-Nicene, Early Medieval) it's safe to proceed.

5. **Add to queue.** Append new prospects with `status: "pending"` and `added: "<today's date>"`. Generate `collection_slug` as `{short-title-kebab}-{author-surname-kebab}` (e.g. `small-catechism-luther`). Set `id` to the same value as `collection_slug`.

6. **Limit new additions.** Add at most 5 new prospects per run to keep each run manageable. Prefer high Score (Value × inverse of Complexity) and low Effort items first.

---

## Stage 1 — Copyright Verification & Source Check

For each `status: "pending"` prospect:

0. **Existence check:** Before doing any work, verify the text isn't already in the database. Query Supabase for any text or collection whose slug matches or starts with `collection_slug`. Also check whether output files already exist in `scripts/ingestion/output/{collection_slug}`. If already imported, set `status: "imported"` and skip all remaining stages.

1. **Copyright check:** `death_year < 1900` OR `translation_copyright_clear: true` with a translator who died before 1928. If the check fails, set `status: "rejected"` and fill `rejection_reason`.

2. **Source reachability:**
   ```bash
   curl -sI "<source_url>" | head -1
   ```
   Must return HTTP 200 (or 301/302 with a valid final destination). If unreachable, set `status: "rejected"` with reason `"source URL returned <status>"`.

3. On both checks passing: set `status: "stage-1-done"` and fill `stage_1_notes` with copyright basis (e.g. `"Death year 604; translation by Barmby (d. 1887), public domain."`).

---

## Stage 2 — Text Ingestion

### Digital sources (`newadvent` | `gutenberg` | `wikisource` | `archive_online`)

Write `scripts/ingestion/config.js` with the prospect's metadata, then run:

```bash
node scripts/ingestion/fetch-texts.mjs
```

The script fetches, cleans (HTML → Markdown), and outputs to `scripts/ingestion/output/{slug}/`. It also generates `note_draft` inline via the Claude API using the prompt in `scripts/lib/note-prompt.mjs`, and auto-suggests themes via keyword matching.

**config.js template:**

```js
export default {
  collection: {
    name: "<title>",
    slug: "<collection_slug from queue>",
    author: "<author>",
    description: "",
  },
  urls: ["<source_url>"],              // array — list multiple URLs for multi-chapter works
  source: "<source_type>",            // newadvent | archive.org | gutenberg | wikisource
  knownFields: {
    genre: "<genre from controlled vocab>",
    sourceAttribution: "<e.g. Translated by James Barmby (NPNF Series II, Vol. XII).>",
    provenanceNotes: "Text sourced from <source>. Accessed <Month YYYY>.",
    translationNotes: "<Translator name (birth–death). Translation date; copyright status.>",
    copyrightSafe: true,
  },
};
```

On success, read the output directory, note the main output file path, set `status: "stage-2-done"` and `stage_2_output` (e.g. `"scripts/ingestion/output/pastoral-rule-gregory/"`).

If the script errors (network failure, parse failure), note the error in `stage_1_notes` and leave status at `"stage-1-done"` to retry next run.

### Archive OCR sources (`archive_ocr`)

1. **Check for source file:** `scripts/ingestion/sources/{collection_slug}-raw.txt`
   If absent, download it:
   ```bash
   curl -L "https://archive.org/stream/{archive_identifier}/{archive_identifier}_djvu.txt" \
     -o "scripts/ingestion/sources/{collection_slug}-raw.txt"
   ```

2. **Add an entry** to `scripts/ingestion/archive-ocr-config.mjs` following the template at the bottom of that file. At minimum set: `sourceFile`, `startLandmark`, `endLandmark`, `slug`, `title`, `author`, `genre`, `sourceAttribution`, `provenanceNotes`, `translationNotes`, `editorialNotes`. Leave `manualCorrections: {}` and `regexCorrections: []` — these are filled later by hand.

3. **Run:**
   ```bash
   node scripts/ingestion/clean-archive-ocr.mjs <config-key>
   ```

4. Read the output. OCR sources will need more manual correction later; this is expected. Set `status: "stage-2-done"`.

---

## Stage 3 — Theme & Tag Review

Read the output markdown file from Stage 2. The frontmatter will already contain `themes` (from `suggestThemes()`) and `genre`.

1. **Themes:** Review the auto-suggested list. Adjust to 2–6 themes from THEME_CLUSTERS below. Use slugs.
2. **Genre:** Confirm it's from GENRES below. Correct if needed.
3. **Tradition:** Confirm from TRADITIONS. Correct if needed.
4. **Era:** Confirm from ERAS. Correct if needed.

Edit the output markdown file's frontmatter directly. Set `status: "stage-3-done"` and fill `stage_3_themes` in the queue with the final theme slugs.

---

## Stage 4 — Note Draft Confirmation

Check that `note_draft` is present and non-empty in the output file's frontmatter. The `fetch-texts.mjs` script generates it inline — it should already be there.

If absent or empty, generate one using `scripts/lib/note-prompt.mjs`:
- ~80–120 words
- Museum-label / reviewer's-notes tone
- Ends by orienting the reader to the reading experience
- Call the Claude API (`claude-opus-4-8` model) with the NOTE_PROMPT as system prompt, and title + author + first 3000 chars of body as the user message

Write the draft back into the frontmatter. Set `status: "staged"`.

---

## Stage 5a — Import to Supabase (Automated)

Run after Stage 4 produces staged output for the run:

```bash
node scripts/pipeline-import.mjs
```

`scripts/pipeline-import.mjs` reads every `status: "staged"` prospect, parses the frontmatter + body from its output file(s), and:
- Resolves the author by name; if not found, creates a draft author stub (`draft: true`) with whatever metadata the prospect carries (name, death_year, tradition, era). Never sets `draft: false`.
- Resolves genre and theme IDs against the controlled vocabulary tables.
- Re-verifies copyright before inserting (HARD CONSTRAINT 3).
- Inserts each text with `published: false` and `note_draft` populated. **Never writes `editorial_introduction`** — that field stays null until Keith fills it in himself.
- For multi-chapter digital sources, creates/reuses a `collections` row (also `published: false`).
- Skips any text whose slug already exists (idempotent, safe to re-run).
- Sets the prospect's `status` to `"imported"` (or `"rejected"` if the copyright re-check fails).

---

## Stage 5b — Human Review & Publish (Manual — Never Automate)

**The pipeline stops here.** Imported texts sit in Supabase as `published: false`, visible at `/admin/drafts`.

Keith will:
1. Open `/admin/drafts` and pick a text to review
2. Open it in the text edit form (`/admin/texts/[id]/edit`) — body, themes, and genre are already filled in from the pipeline
3. Review `note_draft` and optionally click "Use this draft" to copy it into `editorial_introduction`, then edit it in his own voice
4. If the author was created as a draft stub, review/complete the author's bio at `/admin/authors/[id]/edit` and uncheck "Draft — needs review" when ready
5. Check the `published` checkbox and save when satisfied

---

## Run Log

After each run, append a log entry to `scripts/ingestion/run-log/`:

```bash
mkdir -p scripts/ingestion/run-log
```

Filename: `scripts/ingestion/run-log/YYYY-MM-DD.md`

```markdown
# Pipeline Run — YYYY-MM-DD

## Summary
- Processed: N pending items
- Staged: N (slugs: foo, bar)
- Rejected: N (slugs: baz — reason)
- Errors: N

## Details

### foo — On the Priesthood (Chrysostom)
Stage 1: copyright clear (d. 407; Schaff translation d. 1893 public domain). Source URL 200.
Stage 2: fetched 6 chapters via New Advent, 14,200 words. Output: scripts/ingestion/output/on-the-priesthood/
Stage 3: themes adjusted — added Ministry, removed Providence (not prominent). Final: Ministry, Vocation, Preaching.
Stage 4: note_draft present from fetch script.
Stage 5a: imported 6 texts as published:false. Author already existed (not draft).
Status: imported.
```

---

## Controlled Vocabularies

### Traditions (use `slug`)
| slug | name |
|------|------|
| `early-church` | Early Church (pre-Nicene) |
| `patristic` | Patristic |
| `imperial` | Imperial |
| `oriental-orthodox` | Oriental Orthodox |
| `eastern-orthodox` | Eastern Orthodox |
| `roman-catholic` | Roman Catholic |
| `anglican` | Anglican |
| `reformed` | Reformed |
| `lutheran` | Lutheran |
| `radical-reformation` | Radical Reformation |
| `methodist` | Methodist |
| `ecumenical` | Ecumenical |

### Eras (use `slug`)
| slug | label |
|------|-------|
| `apostolic` | Apostolic (to c. 100) |
| `ante-nicene` | Ante-Nicene (c. 100–325) |
| `nicene-post-nicene` | Nicene & Post-Nicene (325–600) |
| `early-medieval` | Early Medieval (600–1000) |
| `high-medieval` | High Medieval (1000–1350) |
| `late-medieval` | Late Medieval (1350–1500) |
| `reformation` | Reformation (1500–1600) |
| `post-reformation` | Post-Reformation (1600–1800) |
| `modern` | Modern (1800–1900) |

### Genres (use `name`, not slug)
Homily · Sermon · Letter · Treatise · Essay · Meditation · Rule · Prayer · Catechesis · Commentary · Dialogue · Hymn · Confession · Hagiography · Apology · Exegesis

### Theme Clusters (use `slug`, max 6 per text)

**The Interior Life:** `prayer` · `repentance` · `contemplation` · `humility` · `suffering` · `spiritual-warfare` · `desire` · `rest`

**The Christian Life:** `vocation` · `community` · `hospitality` · `fasting` · `poverty` · `obedience` · `marriage` · `work`

**Doctrine:** `trinity` · `christology` · `pneumatology` · `salvation` · `eschatology` · `creation` · `scripture` · `providence`

**The Church:** `liturgy` · `sacraments` · `ministry` · `monasticism` · `preaching` · `tradition`

**Moral & Ethical:** `justice` · `virtue` · `vice` · `death` · `conscience`

---

## Existing Scripts — Do Not Duplicate Logic

| Script | Purpose | When to call |
|--------|---------|--------------|
| `scripts/ingestion/fetch-texts.mjs` | Fetch & clean digital sources; generate note_draft inline | Stage 2, digital |
| `scripts/ingestion/clean-archive-ocr.mjs` | Clean Archive.org djvu.txt OCR | Stage 2, archive_ocr |
| `scripts/ingestion/config.js` | Config for fetch-texts.mjs — overwrite per prospect | Stage 2, digital |
| `scripts/ingestion/archive-ocr-config.mjs` | Config for clean-archive-ocr.mjs — append per prospect | Stage 2, archive_ocr |
| `scripts/lib/note-prompt.mjs` | Shared NOTE_PROMPT constant | Stage 4 fallback |
| `scripts/pipeline-import.mjs` | Import staged output into Supabase as `published: false` | Stage 5a |
| `scripts/generate-note-drafts.mjs` | Backfill note_draft in Supabase for existing texts | Maintenance only |
| `scripts/generate-summaries.mjs` | Backfill summaries in Supabase | Maintenance only |
| `scripts/repair-summaries.mjs` | Repair truncated summaries | Maintenance only |

---

## Notes on Sources

- **New Advent** (`newadvent`): static HTML — fetch-texts.mjs handles it directly. Many works span multiple chapter pages; list all URLs in the `urls` array.
- **CCEL** (`ccel`): dynamic rendering — cannot scrape directly. Use the Archive.org djvu.txt scan of the NPNF volumes instead (`archive_ocr`).
- **Project Gutenberg** (`gutenberg`): plain text — fetch-texts.mjs handles it. Use the plain text URL (not HTML).
- **Wikisource** (`wikisource`): mediawiki HTML — fetch-texts.mjs handles it. Use the `/wiki/` URL.
- **Archive.org** (`archive_online`): Use djvu.txt URL for OCR works; use direct HTML URLs for clean digitised editions.

For multi-volume NPNF works on Archive.org, the djvu.txt identifier pattern is typically:
`https://archive.org/stream/{identifier}/{identifier}_djvu.txt`
