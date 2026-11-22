# The Stromata

The code behind [thestromata.com](https://thestromata.com), a curated library of public-domain Christian
texts, from the early church to the modern era, edited for reading on the web and in print.

## How it is built

- **Site:** Next.js 15 (App Router) on Vercel, with Tailwind for layout and a token-based design system in
  `app/globals.css`.
- **Data:** Supabase (Postgres). Migrations are in `supabase/`.
- **Content pipeline:** `scripts/ingestion/` and `scripts/pipeline-import.mjs` find, fetch, clean and stage
  texts from public-domain sources. Every text is checked for copyright before import and arrives as an
  unpublished draft for human review.
- **Agents:** `scripts/scout/` looks for gaps in the collection, and `scripts/sourcer/` acquires cleared
  editions. Both run on GitHub Actions and propose; neither publishes.

`CLAUDE.md` is the working manual for the AI agents that help maintain the project. It holds the rules they
follow, and the reasons for them.

## Rights

The texts are in the public domain, and each one records its source and the basis for that status.

Everything else in this repository is copyright Keith Mason, all rights reserved, unless a file says
otherwise: the code, the design, and the editorial work (introductions, notes, summaries, section divisions
and paragraph breaks). It is public so it can be read, not reused. If you would like to use something,
please ask.

The fonts in `public/fonts/` are by their designers and are licensed under the SIL Open Font License 1.1;
the licence for each family sits beside its files. The ornaments and engravings in `scripts/design/` are
public-domain works, each credited with its source and licence in the README beside it.
