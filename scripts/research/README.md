# Provenance assistant (v0)

An **advisory** copyright-research tool. Give it a candidate source URL and it
identifies the translation, its edition and publication year, fingerprints it
against known editions, and returns a **SAFE / HOLD verdict with evidence** plus a
paste-ready `Translation notes` line.

It sits between the [Scout](../scout/README.md) (which proposes prospects) and the
[Sourcer](../sourcer/README.md) (which acquires cleared ones): it does the
provenance *research*, so the editor's copyright *decision* is an informed
confirmation instead of cold forensics.

> It is **read-only and advisory**. It never writes Notion or the database and
> **never sets `Rights cleared`** — the copyright decision, and the tick, stay
> with the editor. It only tells you what a source *is*.

## Run it

```bash
npm run research -- https://www.newadvent.org/fathers/3304.htm

# unit-test the pure parts (no API key / network needed)
npm run test:research
```

Required env: `ANTHROPIC_API_KEY` (the assessment call). Model:
`claude-sonnet-5` (`RESEARCH_MODEL` to override).

## What it does

1. **Fetch** the candidate page (public http(s) only; a basic SSRF guard blocks
   localhost, private/link-local/loopback IPs, and the cloud metadata endpoint).
   HTML is converted to text with the Sourcer's deterministic `htmlToText`.
2. **Assess** it with Claude against the project's public-domain rules — the
   decisive fact is the **publication year** (a translation published before 1929
   is public domain regardless of the translator's later death); a fluent *modern*
   translation of a work that had to be translated is a **trap** (onthewing.org /
   William Gross, Luther's Works American Edition, the Fathers of the Church
   series, Popular Patristics, any post-1928 colophon). Register alone is not
   decisive — it prefers a **verbatim phrase** match against a named, dated edition.
   It **defaults to HOLD** whenever the basis is not concrete.
3. **Report** the verdict, the evidence (work / translator / edition / year /
   fingerprint phrase / reasoning), whether the host is **on the Sourcer allowlist**
   (directly pinnable), and a paste-ready `Translation notes` line.

## Why it exists

Sourcing's hard part isn't the mechanical fetch/clean — the Sourcer already
removes that. It's the judgement: *is this the public-domain translation, or a
copyrighted modern one?* That question is easy to get wrong (a KJV Scripture
epigraph can make a 1958 translation look antique), and it shouldn't fall on the
editor alone. This tool does that research and hands over a verdict; the human
still owns the copyright call and the `Rights cleared` tick.

## Boundaries

- Never writes Notion, Supabase, or any file; prints to the terminal only.
- Never sets or implies `Rights cleared`. A SAFE verdict is a *recommendation*.
- Not limited to the Sourcer allowlist — you assess any public candidate to decide
  whether to pin it — but it tells you whether the host is pinnable.
