# Homepage brief

The brief a design critic judges the homepage against. Approved by Keith on 4 Nov 2026 for the first
design-critique run (see `CHANGELOG.md`, entries of that date). Hand it to a critic as it stands; the
critic optimises for whatever it is told, so a vague or wrong brief gives a vague or wrong verdict.
Change it here, not in a prompt, so every run judges the same page.

## The brief

The Stromata is a curated library of public-domain Christian theological texts, from the Apostolic
Fathers to the 1890s. The homepage is not where most readers arrive: most land on a text from a search
engine, about a third of them on a phone. The homepage is therefore for the reader who has come back, or
who has just finished a text and wants to know what else is here. Its job is to make the second text easy
to find. The site measures that directly, as the share of readers who move from a first text to a second.

It should feel like walking into a well-kept library: quiet, ordered and unhurried, with a sense of depth
behind each door, and nothing that feels like a content feed or a storefront. The collection is arranged
into "rooms" (themes, eras, traditions) and changes with the liturgical season. Judge it at 390px first.
The first phone screen should show something to read, not furniture. Typography and spacing carry most
of the design.

Imagery is used to show how pre-modern readers saw the world (the night sky of the hero, with its nested
spheres and stars; the author portraits), not as decoration. The wider challenge is making a library that
is literally just texts visual and inviting, at a scale of hundreds of works, without an image per text.

This is a personal project, and it reflects on its maker as much as on the library. It should look
considered and refined: chosen with taste, not just modern. Judge whether each element looks deliberate,
and whether the whole would make a thoughtful reader trust the person behind it.

Judge execution against this concept. Don't suggest adding marketing patterns: no hero call to action,
testimonials or sign-up prompts.

## Decisions a critic should know, so it doesn't argue them again

- **Courier Prime is the UI face** for furniture: chips, navigation, metadata (Keith, 27 Oct 2026, chosen
  on `/design/sans`). A critic may find it surprising; that is evidence to weigh, not a fault to fix.
- **The starry hero stays.** It is the page's picture of the pre-modern cosmos. On phones it is a band,
  not a full screen, and it carries the season's pick (4 Nov 2026).

## How to run a critique

1. Render the page locally against live data at 390px and 1440px (see "Screens reference" in
   `CLAUDE.md`), full page, in slices.
2. Give the screenshots and this brief to a **fresh-context** critic (a separate agent that has not seen
   the work), with the design plugin's `design-critique` output format.
3. **Check every claim against the code and the screenshots before acting on it.** On 4 Nov two of the
   critic's findings were wrong (a missing link that exists; two rule colours that are one token), and one
   came from an error in the brief itself.
