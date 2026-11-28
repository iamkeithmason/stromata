/**
 * source-chrome.mjs — the markdown-level backstop against source-site chrome
 *
 * Every digital source wraps its text in site furniture: New Advent's A–Z
 * encyclopedia bar, its logo, its breadcrumb, its "CONTACT US | ADVERTISE WITH
 * NEW ADVENT" footer and its "About this page" source citation; Project
 * Gutenberg's licence boilerplate and transcriber's notes. `fetch-texts.mjs`
 * strips these at the DOM level with cheerio selectors, which is the right
 * primary defence — it removes the chrome by container, before any of it
 * becomes text.
 *
 * The problem with a DOM selector is that it fails *silently*. When a source
 * renames a wrapper div, `$("#capitalcity").remove()` removes nothing, reports
 * nothing, and the chrome flows straight through turndown into the body — and
 * from there into a staged .md file, into Supabase, and onto the site. That is
 * exactly what happened to the Origen Commentary on John and the Hippolytus
 * Refutation books: they were fetched at 09:01 on 2026-09-12, the New Advent
 * selectors landed at 10:18 the same morning, and nothing between the two
 * noticed that fourteen bodies already carried a nav bar and a logo.
 *
 * So this module is the second line: it works on the *markdown*, after
 * turndown, where chrome has a small number of stable, unmistakable textual
 * shapes. A selector that stops matching is invisible; a body that still says
 * "ADVERTISE WITH NEW ADVENT" is not. `detectChrome` makes that visible and
 * `assertNoChrome` makes it fatal, so a poisoned body fails the fetch and fails
 * the import rather than being discovered by a reader.
 *
 * Rules operate on whole markdown blocks (paragraph-separated), never on
 * substrings, because every tell here IS a whole block. Matching a substring
 * mid-prose would risk cutting a sentence that merely mentions its source.
 */

/**
 * Whitespace inside scraped chrome is not reliably U+0020: New Advent's A–Z bar
 * is built from `&nbsp;`, which turndown preserves as U+00A0. Anywhere a rule
 * spans a gap that came from HTML, match this class rather than a literal space.
 */
const WS = '[\\s\\u00A0]';

/**
 * Each rule is `{ id, source, kind, match, why }`.
 *
 *   kind: 'block'          — drop every block that matches
 *   kind: 'tail'           — drop the first matching block and everything after it
 *   kind: 'head'           — drop the first matching block and everything before it
 *   kind: 'span-to-heading' — drop the first matching block and every block after
 *                             it up to (not including) the next markdown heading
 *
 * The invariant that makes it safe to run every rule against every body,
 * regardless of where the text came from, is that no rule can match ordinary
 * prose. A rule earns that one of three ways, and must do one of them:
 *
 *   - it names its source site in the pattern ("New Advent", "newadvent.org",
 *     "Project Gutenberg") — most rules;
 *   - `structural: true` — the shape alone is unmistakable, e.g. a block that
 *     is 21 consecutive capitals from B to Z;
 *   - `requires: '<source>'` — the pattern IS generic, so the rule is held back
 *     until an unconditional rule for that source has matched elsewhere in the
 *     same document. This is how a lone "Fathers" can be stripped from a New
 *     Advent scrape and never from a patristic text.
 *
 * Keep it that way — a rule that could match a real sentence in a clean body
 * belongs in the advisory list, not here. `source-chrome.test.mjs` enforces it.
 */
export const CHROME_RULES = [
  // --- Wikisource ------------------------------------------------------------
  {
    id: 'wikisource-retrieved-from',
    source: 'wikisource',
    kind: 'tail',
    // MediaWiki's print footer, `Retrieved from "https://en.wikisource.org/w/index.php?title=…&oldid=…"`,
    // sits inside #mw-content-text, so the wikisource selector in
    // fetch-texts.mjs carried it into the body of every chapter of The Great
    // Didactic (28 Nov 2026) and assertNoChrome did not know it. It names its
    // site in the pattern, so it cannot match prose.
    match: /^Retrieved from "https?:\/\/[a-z-]+\.wikisource\.org\//,
    why: 'Wikisource print footer ("Retrieved from …oldid=…")',
  },
  // --- New Advent -----------------------------------------------------------
  {
    id: 'newadvent-az-bar',
    source: 'newadvent',
    kind: 'block',
    // "A  B  C … Z" — the Catholic Encyclopedia index bar above every page.
    // The one rule that does not name its site: it is structural instead, and
    // safely so — a whole block consisting of 21+ consecutive capitals from B
    // to Z in order, separated only by whitespace, is not a sentence.
    structural: true,
    match: new RegExp(`^A(?:${WS}+[B-Z]){20,}${WS}*$`),
    why: 'New Advent A–Z encyclopedia index bar',
  },
  {
    id: 'newadvent-logo',
    source: 'newadvent',
    kind: 'block',
    // ![New Advent](../images/logo.gif) — a relative image that 404s here anyway.
    match: /^!\[New Advent\]\([^)]*\)$/,
    why: 'New Advent masthead logo image',
  },
  {
    id: 'newadvent-breadcrumb',
    source: 'newadvent',
    kind: 'block',
    // "Home > Fathers of the Church > <work> > <part>", and the same shape over
    // the site's other sections — "Home > Summa Theologiae > First Part >
    // Question 2" reached the corpus on 2026-09-21 because the first version of
    // this rule named only the Fathers section. Structural rather than
    // site-named: a block *opening* `Home >` and carrying a second `>` is a
    // breadcrumb, never a sentence, whatever sits between them.
    structural: true,
    match: new RegExp(`^Home${WS}*>[^\n]*>`),
    why: 'site breadcrumb trail',
  },
  {
    id: 'newadvent-footer-nav',
    source: 'newadvent',
    kind: 'block',
    match: new RegExp(`^CONTACT US${WS}*\\|${WS}*ADVERTISE WITH NEW ADVENT`),
    why: 'New Advent footer nav',
  },
  {
    id: 'newadvent-copyright',
    source: 'newadvent',
    kind: 'block',
    match: /Copyright\s*©[^\n]*New Advent LLC/,
    why: 'New Advent copyright line',
  },
  {
    id: 'newadvent-support',
    source: 'newadvent',
    kind: 'block',
    match: /Please help support the mission of New Advent/,
    why: 'New Advent donation appeal',
  },
  {
    id: 'newadvent-source-block',
    source: 'newadvent',
    kind: 'block',
    // The "About this page" citation: "Translated by … From Ante-Nicene
    // Fathers, Vol. 3 … Revised and edited for New Advent by Kevin Knight."
    // This is real provenance, but it belongs in the source_attribution and
    // translation_notes columns — which the pipeline already fills — not in
    // the reading body, where it reads as a scrape that was never cleaned.
    match: /Revised and edited for New Advent by/,
    why: 'New Advent "About this page" source citation (belongs in source_attribution)',
  },
  {
    id: 'newadvent-contact-info',
    source: 'newadvent',
    kind: 'block',
    match: /The editor of New Advent is/,
    why: 'New Advent editor contact paragraph',
  },
  {
    id: 'newadvent-about-this-page',
    source: 'newadvent',
    kind: 'block',
    // The heading over the source citation. Too generic to strip on its own —
    // hence `requires`, which holds it back until some site-named rule has
    // already proved this document is a New Advent scrape.
    requires: 'newadvent',
    match: /^#{1,6}\s*About this page$/,
    why: 'New Advent "About this page" heading',
  },
  {
    id: 'newadvent-tab-nav',
    source: 'newadvent',
    kind: 'block',
    // The masthead tab bar, which turndown flattens into one single-word block
    // per tab. "Fathers" alone is a word a patristic text might legitimately
    // use as a block, so this is conditional for the same reason as above.
    requires: 'newadvent',
    match: /^(?:Home|Encyclopedia|Summa|Fathers|Bible|Library)$/,
    why: 'New Advent masthead tab',
  },
  {
    id: 'newadvent-search-box',
    source: 'newadvent',
    kind: 'block',
    requires: 'newadvent',
    match: /^Search:\s*Submit Search$/,
    why: 'New Advent search box',
  },
  {
    id: 'newadvent-bare-url',
    source: 'newadvent',
    kind: 'block',
    // The citation's trailing URL, sometimes its own block, sometimes wrapped
    // in <> by turndown's autolink handling.
    match: /^<?https?:\/\/(?:www\.)?newadvent\.org\/\S*>?\.?$/,
    why: 'New Advent source URL',
  },

  // --- New Advent — Summa Theologiae pages -----------------------------------
  // The /summa/ section repeats its own masthead — title, edition, translator
  // credit, online-edition copyright, and both Dominican approbations — above
  // EVERY question, and repeats the page's own title as plain text above the
  // breadcrumb. A hand-imported "curated selection" of 26 questions (assembled
  // outside fetch-texts.mjs, which strips this at the DOM level on a normal
  // fetch) carried the whole run 26 times, undecoded HTML entities and all —
  // reached the corpus 2026-09-21.
  {
    id: 'newadvent-summa-masthead-title',
    source: 'newadvent',
    kind: 'block',
    requires: 'newadvent',
    // Turndown left &aelig;/&AElig; undecoded here, since this page was
    // hand-copied outside the normal fetch pipeline.
    match: /^The Summa Theologi(?:&aelig;|æ) of St\.?\s*Thomas Aquinas$/i,
    why: 'New Advent Summa masthead title',
  },
  {
    id: 'newadvent-summa-edition-line',
    source: 'newadvent',
    kind: 'block',
    requires: 'newadvent',
    match: /^(?:First|Second|Third)(?: and Revised)? Edition,\s*\d{4}$/,
    why: 'New Advent Summa masthead edition line',
  },
  {
    id: 'newadvent-summa-translator-line',
    source: 'newadvent',
    kind: 'block',
    requires: 'newadvent',
    match: /^Literally translated by Fathers of the English Dominican Province$/,
    why: 'New Advent Summa masthead translator credit (belongs in translation_notes)',
  },
  {
    id: 'newadvent-summa-online-copyright',
    source: 'newadvent',
    kind: 'block',
    requires: 'newadvent',
    match: /^Online Edition Copyright.*Kevin Knight/,
    why: 'New Advent Summa masthead online-edition copyright line',
  },
  {
    id: 'newadvent-nihil-obstat',
    source: 'newadvent',
    kind: 'block',
    requires: 'newadvent',
    match: /^Nihil Obstat\./,
    why: 'ecclesiastical censor approval notice (Nihil Obstat)',
  },
  {
    id: 'newadvent-imprimatur',
    source: 'newadvent',
    kind: 'block',
    requires: 'newadvent',
    match: /^Imprimatur\./,
    why: 'ecclesiastical publication approval notice (Imprimatur)',
  },
  {
    id: 'newadvent-summa-approbatio-ordinis',
    source: 'newadvent',
    kind: 'block',
    requires: 'newadvent',
    match: /^APPROBATIO ORDINIS$/,
    why: 'New Advent Summa masthead sub-heading',
  },
  {
    id: 'newadvent-summa-dedication',
    source: 'newadvent',
    kind: 'block',
    requires: 'newadvent',
    match: /^MARI(?:&AElig;|Æ) IMMACULAT(?:&AElig;|Æ)\s*-\s*SEDI SAPIENTI(?:&AElig;|Æ)$/i,
    why: 'New Advent Summa masthead dedication line',
  },
  {
    id: 'newadvent-summa-page-title',
    source: 'newadvent',
    kind: 'block',
    // "SUMMA THEOLOGIAE: <description> (<Part>, Q. <N>)" — the page's own
    // title repeated as plain text above the breadcrumb. Structural rather
    // than requiring confirmation: the all-caps prefix plus a parenthetical
    // ending "Q. <digits>" is not a shape real prose takes, the same way the
    // breadcrumb's "Home > … >" is safe unconditionally.
    structural: true,
    match: /^SUMMA THEOLOGIAE:.*\(.*Q\.\s*\d+\)\s*$/,
    why: 'New Advent Summa page title, duplicating the rendered title/H1',
  },

  // --- Project Gutenberg ----------------------------------------------------
  {
    id: 'gutenberg-header',
    source: 'gutenberg',
    kind: 'head',
    match: /^\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG/i,
    why: 'Project Gutenberg header boilerplate',
  },
  {
    id: 'gutenberg-flat-header',
    source: 'gutenberg',
    kind: 'block',
    // Newer PG plain-text files open with a licence paragraph that turndown
    // flattens into one block, and it does not always carry the `*** START OF`
    // marker the head rule keys on — so that rule alone let a whole PG header
    // through into a body on 2026-09-21.
    match: /Project Gutenberg eBook of[\s\S]*This eBook is for the use of anyone anywhere/,
    why: 'Project Gutenberg licence header (flattened, no *** marker)',
  },
  {
    id: 'gutenberg-footer',
    source: 'gutenberg',
    kind: 'tail',
    match: /^(?:\*\*\*\s*)?END OF (?:THE|THIS) PROJECT GUTENBERG/i,
    why: 'Project Gutenberg licence boilerplate',
  },
  {
    id: 'gutenberg-ebook-end',
    source: 'gutenberg',
    kind: 'tail',
    match: /^End of (?:the )?Project Gutenberg/i,
    why: 'Project Gutenberg end-of-ebook marker and everything after it',
  },
  {
    id: 'gutenberg-transcribers-note',
    source: 'gutenberg',
    kind: 'tail',
    // Always sits at the foot of a PG text, immediately before the end marker.
    match: /^#{1,6}\s*Transcriber'?s note/i,
    why: "Project Gutenberg transcriber's note",
  },

  // --- Project Gutenberg — illustrated editions -------------------------------
  // An illustrated PG edition's front matter includes a table of plates —
  // captions and print page numbers for images that live in the paper book,
  // not this text (the actual plates, when present, are separate ![...]
  // images pulled in by fetch-gutenberg-plates.mjs and are untouched by this
  // rule). Found on the Hurlbut "Every Child Can Read" Pilgrim's Progress,
  // 2026-09-21.
  {
    id: 'gutenberg-list-of-illustrations',
    source: 'gutenberg',
    kind: 'span-to-heading',
    // Unconditional/structural rather than `requires: 'gutenberg'`: by the
    // time a maintenance run reaches an already-imported body, the PG
    // header/footer it also carried have usually already been stripped at
    // fetch time (that is exactly what makes this body worth healing), so
    // there is no other Gutenberg tell left to require against — the same
    // reasoning as wittenberg-published-in-label above. The heading text
    // alone is not a shape real reading content takes.
    structural: true,
    match: /^#{1,6}\s*LIST OF ILLUSTRATIONS\.?\s*$/i,
    why: 'front-matter list of illustrations (captions/page numbers for plates, not the plates themselves)',
  },
  {
    id: 'gutenberg-page-number',
    source: 'gutenberg',
    kind: 'block',
    // "\[9\]" alone on its own line — a scanned/typeset page number that
    // landed as its own paragraph. Never a footnote reference: a footnote
    // marker is always fused to the word or punctuation it annotates (see the
    // inline-bracket-number advisory rule below), never isolated as a whole
    // block by itself. Unconditional for the same reason as the rule above.
    structural: true,
    match: /^\\?\[\d{1,4}\\?\]$/,
    why: 'isolated page number from the printed edition',
  },

  // --- Project Wittenberg -----------------------------------------------------
  // The site (static HTML, unchanged since ~2013) carries no semantic wrapper —
  // masthead, page nav and translator credit are plain <center>/<font>/<p> blocks
  // interleaved with the text, so fetch-texts.mjs's DOM pass matches by text
  // content rather than a container selector. These rules are the backstop for
  // wherever that text-matching misses, and one — wittenberg-published-in-label
  // — is the primary defence: the malformed, unclosed <p> nesting around the
  // edition citation (`<p><center><b>Published in:</b><br>\n<p><I>…</I>`) means
  // cheerio's own .text() merges the label into the citation that follows it,
  // so the DOM pass cannot isolate the label alone — only turndown's later block
  // split separates them, which is exactly the layer this module works on.
  {
    id: 'wittenberg-masthead',
    source: 'wittenberg',
    kind: 'block',
    // "Project Wittenberg" (or "PROJECT WITTENBERG") as its own heading, with an
    // optional underscore rule turndown carries over from a <br> before it.
    match: /^#{1,6}\s*Project Wittenberg\s*(\n_+\s*)?$/i,
    why: 'Project Wittenberg masthead',
  },
  {
    id: 'wittenberg-nav-trail',
    source: 'wittenberg',
    kind: 'block',
    // "To: <link> - <link> - Project Wittenberg" (top and bottom of every page,
    // and between chapters of a multi-page work) — sometimes without the "To:"
    // lead-in. Two things keep this from eating real prose: the lookahead
    // requires the literal site name somewhere in the block (a "* * *" divider
    // or an orphaned label never carries it), and the shape requires the whole
    // block to be 2–5 short segments joined by " - " with no sentence
    // punctuation — a real paragraph that happens to mention the project reads
    // as prose, not as a link list.
    match: /^(?=[\s\S]*Project Wittenberg)(?:To:\s*)?(?:\[[^\]]+\]\([^)]+\)|[A-Za-z][\w' ]{0,30})(?:\s-\s(?:\[[^\]]+\]\([^)]+\)|[A-Za-z][\w' ]{0,30})){1,4}$/i,
    requires: 'wittenberg',
    why: 'Project Wittenberg page nav trail',
  },
  {
    id: 'wittenberg-translator-credit',
    source: 'wittenberg',
    kind: 'block',
    // "This text was translated/converted … for Project Wittenberg by <name>,
    // and is in the public domain." Real provenance, but — like New Advent's
    // "About this page" citation — it belongs in translation_notes, not the body.
    match: /for Project Wittenberg by[\s\S]*public domain/i,
    why: 'Project Wittenberg translator/licence credit (belongs in translation_notes)',
  },
  {
    id: 'wittenberg-contact-block',
    source: 'wittenberg',
    kind: 'block',
    // The site's standing "direct comments to" signature block, present
    // whichever translator did the specific text. The gap is bounded tightly
    // (the real block is "Walther Library" immediately followed by "Concordia
    // Theological Seminary." on the next line) so that real prose discussing
    // the seminary's library — a real place, in a corpus about Lutheranism —
    // is not caught unless the two names sit exactly this close together.
    match: /Walther Library\s{0,6}\n?\s{0,6}Concordia Theological Seminary/i,
    why: 'Project Wittenberg contact signature',
  },
  {
    id: 'wittenberg-contact-info',
    source: 'wittenberg',
    kind: 'block',
    match: /Surface Mail:[\s\S]*Phone:/i,
    why: 'Project Wittenberg contact details (address/phone/fax)',
  },
  {
    id: 'wittenberg-icon',
    source: 'wittenberg',
    kind: 'block',
    // ![pwimage](w4.gif) — the small Project Wittenberg footer icon.
    match: /^!\[pwimage\]\([^)]*\)$/i,
    why: 'Project Wittenberg footer icon',
  },
  {
    id: 'wittenberg-work-title-header',
    source: 'wittenberg',
    kind: 'block',
    // "Luther's Little Instruction Book\n(The Small Catechism of Martin
    // Luther)" — the whole work's own title/subtitle, repeated verbatim as an
    // H3 at the top of EVERY page of this multi-page work (confirmed live:
    // book-1.html through book-appx.html on projectwittenberg.org all open
    // with this same block, immediately before the per-chapter heading).
    // Real front matter, but it belongs once — in the collection's own title,
    // already set from config — not seven times, once per chapter body.
    // Named narrowly to this one work's title, matching this file's existing
    // convention (cf. newadvent-support): a different Wittenberg work whose
    // template repeats its own title the same way needs its own rule when it
    // is fetched, same as any other new source-site tell.
    //
    // Structural rather than `requires: 'wittenberg'`: by the time a page
    // reaches this module, fetch-texts.mjs's DOM pass has usually already
    // removed every OTHER unconditional Wittenberg tell (masthead, icon, nav
    // trail), so on a normal fetch this heading is the only thing left that
    // could confirm the source at all — the same load-bearing role
    // wittenberg-published-in-label plays for the citation label. The
    // literal title text is specific enough that no other source's real
    // prose could produce it, so it is as safe unconditionally as that rule.
    structural: true,
    match: /^#{1,6}\s*Luther'?s Little Instruction Book\b/i,
    why: 'Project Wittenberg work title/subtitle, repeated on every chapter page',
  },
  {
    id: 'wittenberg-translator-credit-heading',
    source: 'wittenberg',
    kind: 'block',
    requires: 'wittenberg',
    // The header-form translator credit — "### _Translated by NAME_\n_DATE_"
    // — distinct from wittenberg-translator-credit above, which matches the
    // FOOTER-form sentence ("...for Project Wittenberg by NAME, and is in
    // the public domain..."). Both carry the same information, already
    // captured in translation_notes at Stage 2; this heading-form copy is
    // pure repetition, once per chapter. Generic by translator name on
    // purpose, so it covers any future Wittenberg work regardless of who
    // translated it.
    match: /^#{1,6}\s*_?Translated by\s+[\s\S]*$/i,
    why: 'Project Wittenberg header-form translator credit (belongs in translation_notes)',
  },
  {
    id: 'wittenberg-edition-code',
    source: 'wittenberg',
    kind: 'block',
    // "(Version 1.1 -- December 22, 1994)\nPW# 001-003-002Ea" — the site's
    // own internal edition/catalogue code. "PW#" is Project Wittenberg's own
    // tag prefix and does not occur in real prose, so this is safe
    // unconditionally, the same way newadvent-az-bar's shape is.
    structural: true,
    match: /PW#\s*[\w-]+/i,
    why: 'Project Wittenberg internal edition code',
  },
  {
    id: 'wittenberg-orphaned-divider',
    source: 'wittenberg',
    kind: 'block',
    requires: 'wittenberg',
    // A bare "* * *" block — turndown's rendering of the site's `<hr noshade>`
    // page dividers. The paragraphs they used to bracket (translator credit,
    // contact block, nav trail) are already stripped by the rules above, so
    // what survives is a divider with nothing left on either side of it:
    // template furniture, never content — a reader loses nothing a lone
    // horizontal rule alone conveyed.
    match: /^\*\s*\*\s*\*$/,
    why: 'Project Wittenberg orphaned page-divider (its bracketed content is already stripped)',
  },
  {
    id: 'wittenberg-underscore-rule',
    source: 'wittenberg',
    kind: 'block',
    requires: 'wittenberg',
    // A block of nothing but (turndown-escaped) underscores — the site's
    // other horizontal-rule idiom, a literal run of "_" characters used as a
    // typographic divider under a masthead or title.
    //
    // NOT structural, on purpose, despite looking as safe as
    // newadvent-az-bar: a bare underscore-run is not unique to Wittenberg's
    // site chrome. mystagogical-catecheses/catechetical-lecture-18.md (a
    // New Advent import, nothing to do with Wittenberg) uses the exact same
    // shape as a genuine topic-break divider inside Cyril's own lecture —
    // confirmed by a dry run against the real corpus before this rule
    // shipped, which is why it exists as a check here at all. Made
    // unconditional once, briefly, while writing this: fixed before it ever
    // reached --write.
    match: /^(?:\\_|_){6,}$/,
    why: 'Project Wittenberg underscore-rule divider',
  },
  {
    id: 'wittenberg-jump-anchors',
    source: 'wittenberg',
    kind: 'block',
    // "\[1\] \[2\] \[3\] …" — the in-page jump-to-section anchor list Project
    // Wittenberg puts above a numbered work (theses, commandments). Every
    // <a> tag is stripped project-wide (the stripAllLinks turndown rule in
    // fetch-texts.mjs), so these can never resolve to anything once
    // imported. This was originally left advisory rather than stripped, on
    // the theory that removal was an editorial call — but it escaped Stage 3
    // review twice in a row (both catechism chapters and the 95 Theses
    // shipped with it still in the body, confirmed against Supabase
    // 2026-09-21), which is the actual argument for stripping it outright: a
    // human check that has already missed the same dead artefact twice is
    // not a control. The pattern also needed fixing regardless — it assumed
    // turndown renders these as links with a surviving `(url)`, which never
    // happens once stripAllLinks has run; the real shape is bare escaped
    // brackets around each number, no parens at all.
    //
    // Structural rather than `requires: 'wittenberg'`: the 95 Theses body
    // carries no OTHER unconditional Wittenberg tell at all (its title isn't
    // the catechism's, it has no "Translated by" heading, and its citation
    // is deliberately kept rather than stripped) — so a gated version of this
    // rule would never fire there. A whole block that is nothing but 2+
    // groups of "\[digit\]" is unmistakable on its own (checked against the
    // full corpus 2026-09-21: this exact shape occurs in exactly one text,
    // the 95 Theses), and the cost of a false positive is minimal even in
    // principle — the block carries no prose to lose.
    structural: true,
    match: /^(?:\\?\[\d+\\?\]\s*){2,}$/,
    why: 'Project Wittenberg in-page jump-to-section anchor list (dead — every href is stripped project-wide)',
  },
  {
    id: 'wittenberg-published-in-label',
    source: 'wittenberg',
    kind: 'block',
    // The orphaned "**Published in:**" label that introduces an edition
    // citation. The citation paragraph itself is left as content — it varies
    // per work and reads as legitimate front matter — only the bare label goes.
    //
    // Unconditional rather than `requires: 'wittenberg'` — deliberately, not an
    // oversight. Everywhere else on the page, the DOM pass in fetch-texts.mjs
    // removes the chrome before turndown ever runs, so on a normal (non-broken)
    // fetch no other wittenberg rule survives into the markdown to confirm this
    // one. But this label specifically CANNOT be isolated at the DOM level: the
    // source HTML nests it as `<p><center><b>Published in:</b><br>\n<p><I>…`,
    // an unclosed <p> inside an unclosed <p>, so cheerio's .text() merges the
    // label with the citation that follows it and no selector can separate
    // them. Turndown's block split is the only place they come apart — which
    // makes this the primary defence for this one tell, not the backstop, and
    // it must fire without waiting for a confirmation that will never come. The
    // structural shape (a whole block that is only this bolded label) is
    // exactly as safe unconditionally as `newadvent-az-bar`'s 21-capitals shape.
    structural: true,
    match: /^\*\*Published in:\*\*\s*$/i,
    why: 'Project Wittenberg citation label (citation text itself is kept)',
  },
];

/**
 * Advisory findings: real tells, but ones where removal is an editorial call
 * rather than a mechanical certainty, so they are reported and never stripped.
 */
export const ADVISORY_RULES = [
  {
    id: 'leading-h1',
    kind: 'advisory',
    // The reader page renders <h1>{text.title}</h1> above the body, so an H1 in
    // the body's first block shows the title twice. New Advent pages always
    // carry one; whether a given text *wants* a body heading is Keith's call.
    match: /^#\s+\S/,
    firstBlockOnly: true,
    why: 'body opens with an H1 — the reader already renders the title above it',
  },
  {
    id: 'relative-image',
    kind: 'advisory',
    // ![Caption](images/i_020.jpg) — a path relative to the source site, which
    // resolves to nothing here. Needs a real asset or removal, not a strip.
    match: /!\[[^\]]*\]\((?!https?:)[^)]*\.(?:jpe?g|png|gif|webp)[^)]*\)/i,
    why: 'image with a source-relative path that will not resolve on this site',
  },
  {
    id: 'inline-bracket-number',
    kind: 'advisory',
    // "\[6\]stumbled" / "den,\[1\]" — a bracketed integer fused hard against
    // surrounding text, with nothing separating them. Once an isolated
    // page-number block is already gone (gutenberg-page-number, above), what
    // remains is genuinely ambiguous: it reads exactly like a real footnote
    // marker and exactly like a stray OCR page number that landed
    // mid-sentence, and Bunyan's "Every Child Can Read" edition carries real
    // instances of both. Check whether a nearby "### FOOTNOTES:" list defines
    // that number before deciding either way — that is a reading task, not a
    // mechanical one.
    // The adjacent character must be real text, not another bracket/paren/
    // backslash — otherwise this also fires on Project Wittenberg's jump
    // anchors (`\[[10](#95-10)\]` / `[\[1\]](#a)`), which are their own
    // dedicated CHROME_RULES entry (wittenberg-jump-anchors, above) and are
    // link syntax, not fused prose.
    match: /[^\s\\[\]()]\\?\[\d{1,4}\\?\]|\\?\[\d{1,4}\\?\][^\s\\[\]()]/,
    why: 'bracketed number fused to surrounding text — verify against a nearby FOOTNOTES list before treating as a stray page number',
  },
];

/**
 * Split markdown into paragraph blocks, keeping each block's trailing separator
 * verbatim so that `blocks.map(b => b.text + b.sep).join('')` rebuilds the
 * input exactly. Nothing about interior spacing is normalised — this module
 * removes blocks, it does not reformat the ones it keeps.
 */
function toBlocks(markdown) {
  const parts = markdown.split(/(\n[ \t]*(?:\n[ \t]*)+)/);
  const blocks = [];
  for (let i = 0; i < parts.length; i += 2) {
    blocks.push({ text: parts[i], sep: parts[i + 1] ?? '' });
  }
  return blocks;
}

/**
 * The rules in play for one document.
 *
 * Rules carrying `requires: '<source>'` are held back until an unconditional
 * rule for that source has matched somewhere in the same document. That is
 * what lets the list include blocks too generic to be safe on their own — a
 * lone "Fathers", a heading reading "About this page" — without ever risking
 * them against a text that isn't a scrape of that site. A correctly-cleaned
 * body confirms no source, so no conditional rule can fire on it.
 */
function ruleSet(markdown, blocks, source) {
  const scoped = source ? CHROME_RULES.filter(r => r.source === source) : CHROME_RULES;
  const conditional = scoped.filter(r => r.requires);
  if (conditional.length === 0) return scoped;

  const confirmed = new Set();
  for (const block of blocks) {
    const text = block.text.trim();
    if (!text) continue;
    for (const rule of scoped) {
      if (rule.requires) continue;
      if (rule.match.test(text)) confirmed.add(rule.source);
    }
  }
  return scoped.filter(r => !r.requires || confirmed.has(r.requires));
}

/**
 * Report every chrome block in `markdown` without changing it.
 *
 * @param {string} markdown
 * @param {{ source?: string, advisory?: boolean }} [options]
 *   source   — restrict to one source's rules (default: all, which is safe
 *              because every rule names its site)
 *   advisory — also return ADVISORY_RULES findings (default false)
 * @returns {Array<{ rule: string, why: string, kind: string, block: number, excerpt: string }>}
 */
export function detectChrome(markdown, options = {}) {
  if (!markdown) return [];
  const blocks = toBlocks(markdown);
  const rules = ruleSet(markdown, blocks, options.source);
  const findings = [];

  blocks.forEach((block, index) => {
    const text = block.text.trim();
    if (!text) return;
    for (const rule of rules) {
      if (!rule.match.test(text)) continue;
      findings.push({
        rule: rule.id,
        why: rule.why,
        kind: rule.kind,
        block: index,
        excerpt: excerpt(text),
      });
      break;
    }
    if (!options.advisory) return;
    for (const rule of ADVISORY_RULES) {
      if (rule.firstBlockOnly && index !== firstContentBlock(blocks)) continue;
      if (!rule.match.test(text)) continue;
      findings.push({ rule: rule.id, why: rule.why, kind: 'advisory', block: index, excerpt: excerpt(text) });
    }
  });

  return findings;
}

/**
 * Is this heading the same as that title? Compares leniently enough to survive
 * markdown emphasis and trailing punctuation, and no further — a heading that
 * merely resembles the title is content, and stays.
 */
function sameHeading(heading, title) {
  const norm = str => str
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[.,;:]+$/, '')
    .trim()
    .toLowerCase();
  return norm(heading) === norm(title);
}

function advisoriesIn(markdown, options) {
  return detectChrome(markdown, { source: options.source, advisory: true }).filter(f => f.kind === 'advisory');
}

/**
 * The first block that is actual content.
 *
 * Skips blank blocks and HTML comments — `fetch-texts.mjs` writes an
 * `<!-- EDITORIAL INTRO … -->` placeholder above the body, so in a staged file
 * the leading heading is the *second* block even though it is the first thing
 * a reader would see. Counting the comment made the leading-H1 handling a no-op
 * on every staged file while working fine on the same text in the database.
 */
function firstContentBlock(blocks) {
  return blocks.findIndex(b => {
    const text = b.text.trim();
    return text !== '' && !/^<!--[\s\S]*-->$/.test(text);
  });
}

/**
 * Does this heading name a structural division rather than the work?
 *
 * `Chapter 1. Introductory.`, `Section 1`, `Preface`, `Part One` are content:
 * the reader loses something real if they go. Used as an absolute veto on
 * dropping a leading heading, because it is the one signal available when no
 * title is supplied to compare against.
 *
 * The list is deliberately short. `Tractate`, `Conference`, `Dialogue`,
 * `Epistle`, `Book` and `Homily` all *look* structural and are not: in this
 * corpus each names a whole text, so `# Tractate 1 (John 1:1-5)` under the
 * title `Tractate 1 (John 1:1-5)` is a duplicated title, not a division. Only
 * words that name a part of a work belong here.
 */
export function looksStructuralHeading(heading) {
  return /^(chapter|caput|section|part|preface|prologue|prooemium|introduction|contents|argument)\b/i
    .test(String(heading ?? '').replace(/^[*_`\s]+/, ''));
}

function excerpt(text) {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > 110 ? `${oneLine.slice(0, 107)}…` : oneLine;
}

const FOOTNOTES_HEADING = /^#{1,6}\s*FOOTNOTES:?\s*$/i;

/**
 * The highest footnote number a document's own "### FOOTNOTES:" apparatus
 * actually defines, and the index of that heading — or null if there is no
 * such apparatus. A document with no footnote list gives no basis for telling
 * a footnote marker from a page number, so callers must stay conservative.
 */
function maxDefinedFootnoteNumber(blocks) {
  const headingAt = blocks.findIndex(b => FOOTNOTES_HEADING.test(b.text.trim()));
  if (headingAt === -1) return null;
  let max = 0;
  for (let i = headingAt + 1; i < blocks.length; i++) {
    const m = blocks[i].text.trim().match(/^\\?\[(\d{1,4})\\?\]\s/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max > 0 ? { max, headingAt } : null;
}

/**
 * Remove a fused bracket-number wherever its value exceeds every footnote a
 * document's own FOOTNOTES list defines. Nothing defines that number, so
 * whatever it looks like, it cannot be a footnote reference — it is a stray
 * page number that happened to land mid-sentence, the fused sibling of the
 * isolated gutenberg-page-number case above.
 *
 * Deliberately narrower than it could be: a number WITHIN the defined range
 * is left alone (and stays advisory) rather than trusted, because a genuine
 * footnote marker and a page number that happens to reuse a low digit are
 * indistinguishable without reading the sentence — Bunyan's page 6 carries
 * "\[6\]stumbled", which has nothing to do with footnote 6, "Perspective
 * glass is an old name for a telescope." Only the unambiguous, out-of-range
 * case is mechanical enough to act on.
 */
function stripOutOfRangeFusedNumbers(blocks) {
  const found = maxDefinedFootnoteNumber(blocks);
  if (!found) return { blocks, removed: [] };
  const { max, headingAt } = found;
  const removed = [];

  const next = blocks.map((block, index) => {
    if (index >= headingAt) return block; // never touch the apparatus itself
    const text = block.text;
    const cleaned = text.replace(/\\?\[(\d{1,4})\\?\]/g, (whole, digits) => {
      if (Number(digits) <= max) return whole;
      removed.push({
        rule: 'gutenberg-out-of-range-fused-number',
        why: `[${digits}] exceeds every footnote this document defines (highest is [${max}]) — a stray page number, not a reference`,
        blocks: 1,
        excerpt: excerpt(text.trim()),
      });
      return '';
    });
    return cleaned === text ? block : { ...block, text: cleaned };
  });

  return { blocks: next, removed };
}

/**
 * Remove source-site chrome from `markdown`.
 *
 * Only 'block', 'head' and 'tail' rules act. Advisory findings are returned
 * under `advisories` but the text is left alone — they need a human.
 *
 * Idempotent: a body with no chrome comes back byte-for-byte unchanged, so this
 * is safe to run on every import and safe to re-run over the whole corpus.
 *
 * @param {string} markdown
 * @param {{ source?: string, dropLeadingHeading?: boolean }} [options]
 * @returns {{ output: string, removed: Array, advisories: Array }}
 */
export function stripChrome(markdown, options = {}) {
  if (!markdown) return { output: markdown ?? '', removed: [], advisories: [] };

  let blocks = toBlocks(markdown);
  const rules = ruleSet(markdown, blocks, options.source);
  const removed = [];

  // head/tail rules first — they define the document's span, and a block rule
  // inside a region that is about to be cut shouldn't be reported twice.
  for (const rule of rules.filter(r => r.kind === 'head')) {
    const at = blocks.findIndex(b => rule.match.test(b.text.trim()));
    if (at === -1) continue;
    removed.push({ rule: rule.id, why: rule.why, blocks: at + 1, excerpt: excerpt(blocks[at].text) });
    blocks = blocks.slice(at + 1);
  }
  for (const rule of rules.filter(r => r.kind === 'tail')) {
    const at = blocks.findIndex(b => rule.match.test(b.text.trim()));
    if (at === -1) continue;
    removed.push({ rule: rule.id, why: rule.why, blocks: blocks.length - at, excerpt: excerpt(blocks[at].text) });
    blocks = blocks.slice(0, at);
  }

  // span-to-heading rules bound a floating mid-document run (a front-matter
  // list, say) rather than the whole document's start or end — drop the
  // matching block and everything after it up to, but not including, the
  // next markdown heading (or the document's end, if none follows).
  for (const rule of rules.filter(r => r.kind === 'span-to-heading')) {
    const at = blocks.findIndex(b => rule.match.test(b.text.trim()));
    if (at === -1) continue;
    let end = at + 1;
    while (end < blocks.length && !/^#{1,6}\s/.test(blocks[end].text.trim())) end++;
    removed.push({ rule: rule.id, why: rule.why, blocks: end - at, excerpt: excerpt(blocks[at].text) });
    blocks = [...blocks.slice(0, at), ...blocks.slice(end)];
  }

  const blockRules = rules.filter(r => r.kind === 'block');
  blocks = blocks.filter(block => {
    const text = block.text.trim();
    if (!text) return true;
    const hit = blockRules.find(r => r.match.test(text));
    if (!hit) return true;
    removed.push({ rule: hit.id, why: hit.why, blocks: 1, excerpt: excerpt(text) });
    return false;
  });

  // A fused bracket-number outside every range a document's own FOOTNOTES
  // list defines is unambiguously a stray page number — see the function
  // comment. Gated the same way as the Gutenberg block rules above: skip it
  // when the caller explicitly scoped this call to a different source.
  if (!options.source || options.source === 'gutenberg') {
    const stripped = stripOutOfRangeFusedNumbers(blocks);
    blocks = stripped.blocks;
    removed.push(...stripped.removed);
  }

  // Optional, opt-in: drop a leading H1 that the reader page already renders as
  // the text's title. Never on by default — see ADVISORY_RULES.
  //
  // Pass the title as a string to make this SAFE rather than merely opt-in: the
  // heading is then dropped only when it IS that title. That distinction is not
  // academic. New Advent serves each book of Clement's Stromata as one page
  // whose <h1> is `Chapter 1. Introductory.` — a real heading, not a duplicated
  // title — and an unconditional drop deletes it. Pass `true` only where a human
  // is reading the diff before it is written.
  if (options.dropLeadingHeading) {
    const at = firstContentBlock(blocks);
    const heading = at === -1 ? null : blocks[at].text.trim().match(/^#\s+(\S.*)$/);
    const wanted = typeof options.dropLeadingHeading === 'string' ? options.dropLeadingHeading : null;
    // A structurally-worded heading is content whatever the title says, so it
    // is never dropped — the backstop for the `true` form, which has no title
    // to check against.
    const structural = heading ? looksStructuralHeading(heading[1]) : false;
    if (heading && !structural && (wanted === null || sameHeading(heading[1], wanted))) {
      removed.push({
        rule: 'leading-h1',
        why: 'leading H1 duplicating the rendered title',
        blocks: 1,
        excerpt: excerpt(blocks[at].text),
      });
      blocks.splice(at, 1);
    }
  }

  // Nothing matched: hand back the input itself, so an untouched body is
  // byte-for-byte identical and a no-op run can never rewrite the corpus.
  if (removed.length === 0) {
    return { output: markdown, removed, advisories: advisoriesIn(markdown, options) };
  }

  // Removing a leading block leaves the separator that followed it, and a
  // trailing one leaves a dangling blank run. Trim the document edges only;
  // interior spacing is never touched.
  const output = blocks
    .map(b => b.text + b.sep)
    .join('')
    .replace(/^\s+/, '')
    .replace(/\s+$/, '');

  return { output, removed, advisories: advisoriesIn(output, options) };
}

/**
 * Throw if any chrome survives. This is the loud half — call it after
 * `stripChrome` so that a source whose markup changed (and whose new chrome no
 * rule yet matches) stops the run instead of shipping a poisoned body.
 *
 * @param {string} markdown
 * @param {{ source?: string, label?: string }} [options]
 */
export function assertNoChrome(markdown, options = {}) {
  const findings = detectChrome(markdown, { source: options.source });
  if (findings.length === 0) return;
  const label = options.label ? ` in ${options.label}` : '';
  const detail = findings.map(f => `  - ${f.rule}: ${f.excerpt}`).join('\n');
  throw new Error(`source-site chrome survived cleaning${label}:\n${detail}`);
}
