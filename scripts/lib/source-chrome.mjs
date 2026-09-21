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
 *   kind: 'block' — drop every block that matches
 *   kind: 'tail'  — drop the first matching block and everything after it
 *   kind: 'head'  — drop the first matching block and everything before it
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
    // "Home > Fathers of the Church > <work> > <part>". Structural rather than
    // site-named: a block *opening* with `Home >` is a breadcrumb, never a
    // sentence — prose that happens to say "Fathers of the Church" is untouched
    // because the rule is anchored to that opening.
    structural: true,
    match: new RegExp(`^Home${WS}*>${WS}*Fathers of the Church${WS}*>`),
    why: 'New Advent breadcrumb trail',
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

  // --- Project Gutenberg ----------------------------------------------------
  {
    id: 'gutenberg-header',
    source: 'gutenberg',
    kind: 'head',
    match: /^\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG/i,
    why: 'Project Gutenberg header boilerplate',
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

  const blockRules = rules.filter(r => r.kind === 'block');
  blocks = blocks.filter(block => {
    const text = block.text.trim();
    if (!text) return true;
    const hit = blockRules.find(r => r.match.test(text));
    if (!hit) return true;
    removed.push({ rule: hit.id, why: hit.why, blocks: 1, excerpt: excerpt(text) });
    return false;
  });

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
