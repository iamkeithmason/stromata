/**
 * fetch-texts.mjs — Stromata text ingestion script
 *
 * Fetches public domain theological texts from clean digital sources,
 * strips site chrome, converts to markdown, and writes files ready
 * for editorial review and admin entry.
 *
 * Usage:
 *   node scripts/ingestion/fetch-texts.mjs
 *   CONFIG_PATH=/path/to/other-config.js node scripts/ingestion/fetch-texts.mjs
 *
 * By default the config is ./config.js next to this script. Set the CONFIG_PATH
 * env var to point at a different config file — this lets several fetches run
 * concurrently in one checkout, each with its own config (and its own output
 * dir, keyed by collection.slug), without racing on the shared config.js.
 *
 * To use for a new source:
 *   1. Edit config.js — swap the URLs, author, collection, and knownFields
 *   2. Set `source` to: newadvent | ccel | gutenberg | wikisource | wittenberg | generic
 *   3. Run the script
 *   4. Review _review-summary.md, then fill TODOs in each .md file
 *
 * Dependencies (add to devDependencies if not present):
 *   npm install --save-dev cheerio turndown
 */

import * as cheerio from "cheerio";
import TurndownService from "turndown";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";
import { generateNoteWithCritic } from "../lib/note-prompt.mjs";
import { stripChrome, assertNoChrome } from "../lib/source-chrome.mjs";

// Load config — CONFIG_PATH env var (relative to cwd, or absolute) overrides the
// default ./config.js next to this script, so concurrent runs can each use their own.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = process.env.CONFIG_PATH
  ? path.resolve(process.env.CONFIG_PATH)
  : path.join(__dirname, "config.js");
const config = (await import(configPath)).default;

// ---------------------------------------------------------------------------
// Anthropic client (API key from env — optional; ingest continues without it)
// ---------------------------------------------------------------------------

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

async function generateNoteDraft(title, authorName, markdown) {
  if (!anthropic) {
    console.warn("  ⚠ ANTHROPIC_API_KEY not set — skipping note_draft generation");
    return "";
  }
  try {
    // Shared critic loop + anti-formula + truncation guards (scripts/lib/note-prompt.mjs).
    // No sibling notes at ingestion time — the batch backfill de-clusters later.
    const { note } = await generateNoteWithCritic({
      anthropic,
      title,
      author: authorName,
      body: markdown,
      log: (msg) => console.log(msg),
    });
    return note;
  } catch (err) {
    console.warn(`  ⚠ Claude API error for "${title}": ${err.message} — note_draft left empty`);
    return "";
  }
}

// ---------------------------------------------------------------------------
// Turndown setup
// ---------------------------------------------------------------------------

const td = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
});

// Drop non-content tags entirely so their contents never leak into the body.
// MediaWiki injects <style> TemplateStyles blocks inside the article; without
// this they flatten into the markdown as raw CSS (.mw-parser-output {…}).
td.remove(["style", "script", "link", "noscript", "head"]);

// Keep italics and bold; strip footnote back-links (↩ etc.)
td.addRule("stripFootnoteBacklinks", {
  filter: (node) =>
    node.nodeName === "A" &&
    node.getAttribute("href")?.startsWith("#") &&
    /[↩↑▲^]/.test(node.textContent),
  replacement: () => "",
});

// Strip all links
td.addRule("stripAllLinks", {
  filter: "a",
  replacement: (content) => content,
});

// ---------------------------------------------------------------------------
// Source-specific cheerio selectors
// ---------------------------------------------------------------------------

const SOURCE_SELECTORS = {
  newadvent: {
    content: "body",
    strip: [
      "table:first-of-type", // nav table at top
      ".support-box",
      'a[href*="gumroad"]',
      'p:has(a[href*="gumroad"])',
      "table:last-of-type", // footer table
    ],
    // New Advent main text is the <h1> title + <h2> chapters + <p> body.
    // Everything else is site chrome: desktop/mobile headers, nav, breadcrumb,
    // and ad placeholders interspersed between chapters. Strip by container.
    extractFn: ($) => {
      // Site chrome containers (desktop header w/ logo+tabs+A–Z index, mobile
      // logo, breadcrumb). These wrap the leading "A B C … Z", the logo image,
      // and the "Home > Fathers … > Title" crumb. NB: #springfield2 is the main
      // content column (it holds the <h1> + chapters) — never remove it.
      $("#capitalcity, #mobilecity, .scrollmenu, #mi5").remove();
      // Ad placeholder divs (empty, but appear both as top/bottom banners and
      // between chapters — remove so no stray markup survives).
      $('[class*="catholicadnet"], [class*="CMtag"], [id*="728x90"]').remove();
      // Support/donation paragraphs (gumroad) + footer nav paragraph.
      $("p").each((_, el) => {
        const text = $(el).text();
        if (
          text.includes("Please help support") ||
          text.includes("gumroad") ||
          text.includes("instant download") ||
          text.includes("ADVERTISE WITH NEW ADVENT") ||
          text.includes("New Advent LLC") ||
          text.includes("Immaculate Heart of Mary")
        ) {
          $(el).remove();
        }
      });
      // Footer links ("CONTACT US" | "ADVERTISE WITH NEW ADVENT") and the
      // "Copyright © … New Advent LLC" line (a contactus link inside a <b>) —
      // remove the nearest block they sit in, in case the wording changes.
      $('a[href*="contactus.htm"], a[href*="cleanmedia.net"]').each((_, el) => {
        $(el).closest("p, center, b, strong").remove();
      });
      // Remove the "About this page" section (New Advent editorial footer block)
      $("h2").each((_, el) => {
        if ($(el).text().trim() === "About this page") {
          let next = $(el).next();
          while (next.length) {
            const toRemove = next;
            next = next.next();
            toRemove.remove();
          }
          $(el).remove();
        }
      });
      return $("body").html() || "";
    },
  },

  ccel: {
    extractFn: ($) => {
      $(".breadcrumb, .chapter-nav, .citation, nav, header, footer").remove();
      return ($("#main").html() || $(".content").html() || $("body").html() || "");
    },
  },

  gutenberg: {
    extractFn: ($) => {
      const html = $("body").html() || "";
      // Strip Project Gutenberg header/footer boilerplate
      const start = html.indexOf("*** START OF");
      const end = html.indexOf("*** END OF");
      if (start !== -1 && end !== -1) {
        return html.slice(html.indexOf("</p>", start) + 4, end);
      }
      // Fallback: strip known PG chrome
      $("#pg-header, #pg-footer, .pgheader, .pgfooter").remove();
      return $("body").html() || "";
    },
  },

  wikisource: {
    extractFn: ($) => {
      $(
        "style, script, link, .ws-noexport, .navigation-template, nav, .mw-editsection, " +
          ".noprint, .wst-header, .wst-pagebreak, .mw-references-wrap, .reflist, sup.reference"
      ).remove();
      $("[style]").removeAttr("style"); // drop inline style attrs (mw layout hints)
      return $("#mw-content-text").html() || $("body").html() || "";
    },
  },

  wittenberg: {
    // Project Wittenberg (projectwittenberg.org) — static HTML unchanged since
    // ~2013, no semantic containers at all (no <nav>/<header>/<article>, no id
    // or class on the chrome). Masthead, page nav and translator/contact credit
    // are plain <center>/<font>/<p>/<h2-4> elements interleaved with the text,
    // so — like New Advent's ad paragraphs — they're matched by their text
    // content rather than by a selector. scripts/lib/source-chrome.mjs carries
    // the markdown-level backstop, including one tell (the "Published in:"
    // citation label) that this DOM pass cannot isolate at all: the source
    // nests it as an unclosed <p> inside an unclosed <p>, which merges the
    // label with the citation text that follows it before cheerio ever sees
    // two separate nodes.
    extractFn: ($) => {
      $("img[src*='w4.gif'], img[alt='pwimage']").remove();
      // Unwrap <center> from inside heading tags first — turndown's heading
      // rule renders an empty "#### " marker with the real title text spilling
      // out as a separate paragraph when a <center> is the heading's sole
      // child, which is how every title on this site is marked up.
      $("h1, h2, h3, h4").find("center").each((_, el) => {
        $(el).replaceWith($(el).contents());
      });
      // Masthead: a heading reading only "Project Wittenberg" / "PROJECT
      // WITTENBERG", sometimes followed by a bare underscore rule from a <br>.
      $("h1, h2, h3, h4").each((_, el) => {
        const text = $(el).text().replace(/\s+/g, " ").trim();
        if (/^project wittenberg(\s+_+)?$/i.test(text)) $(el).remove();
      });
      // The work's own title/subtitle heading, repeated verbatim at the top
      // of EVERY page of a multi-page work (confirmed on the Small Catechism:
      // book-1.html through book-appx.html all restate it before their own
      // chapter heading). Detected structurally — a heading immediately
      // followed by a "Translated by" heading — rather than by this work's
      // specific title text, so it generalises to any future Wittenberg work
      // built from the same template. Must run before the translator-heading
      // removal below, since it depends on that heading still being present
      // to look ahead to. scripts/lib/source-chrome.mjs carries a matching
      // markdown-level rule (wittenberg-work-title-header) for healing
      // already-imported bodies, which is necessarily title-specific since it
      // has no DOM to look ahead in.
      $("h1, h2, h3, h4").each((_, el) => {
        const next = $(el).next("h1, h2, h3, h4");
        if (next.length && /^translated by\s/i.test(next.text().replace(/\s+/g, " ").trim())) {
          $(el).remove();
        }
      });
      // The header-form translator credit itself ("Translated by NAME /
      // DATE"), and the site's internal edition/catalogue code that
      // sometimes follows it ("(Version 1.1 …) / PW# 001-003-002Ea") — both
      // real provenance, but already captured in translation_notes at Stage
      // 2, so repeating them in the body is pure duplication.
      $("h1, h2, h3, h4").each((_, el) => {
        const text = $(el).text().replace(/\s+/g, " ").trim();
        if (/^translated by\s/i.test(text)) $(el).remove();
      });
      $("center, p").each((_, el) => {
        const text = $(el).text().replace(/\s+/g, " ").trim();
        if (/PW#\s*[\w-]+/i.test(text)) $(el).remove();
      });
      // The site's `<hr noshade>` page dividers — always template furniture
      // bracketing chrome that is itself already stripped above, never a
      // meaningful divider within the actual translated text.
      $("hr").remove();
      // "To: <link> - <link> - Project Wittenberg" nav trail — top and bottom
      // of every page, and between chapters of a multi-page work. Short,
      // dash-joined, no sentence punctuation, and always names the project —
      // real prose mentioning it reads as a sentence, not a link list.
      $("center, p, font").each((_, el) => {
        const text = $(el).text().replace(/\s+/g, " ").trim();
        if (/project wittenberg/i.test(text) && text.length < 150 && !/[.!?]/.test(text)) {
          $(el).remove();
        }
      });
      // Translator/licence credit ("...for Project Wittenberg by <name>, and is
      // in the public domain...") and the site's standing contact block that
      // follows it (Walther Library / Concordia Theological Seminary / address
      // & phone) — real provenance, but it belongs in translation_notes, not
      // the reading body.
      $("p, center").each((_, el) => {
        const text = $(el).text().replace(/\s+/g, " ").trim();
        if (
          /for project wittenberg by/i.test(text) ||
          (/walther library/i.test(text) && /concordia theological seminary/i.test(text)) ||
          (/surface mail:/i.test(text) && /phone:/i.test(text))
        ) {
          $(el).remove();
        }
      });
      return $("body").html() || "";
    },
  },

  generic: {
    extractFn: ($) => {
      $("nav, header, footer, aside, script, style").remove();
      return (
        $("article").html() ||
        $("main").html() ||
        $("body").html() ||
        ""
      );
    },
  },
};

// ---------------------------------------------------------------------------
// Theme vocabulary (for review summary prompts)
// ---------------------------------------------------------------------------

const THEME_VOCABULARY = {
  "Interior Life": ["Prayer", "Repentance", "Contemplation", "Humility", "Suffering", "Spiritual Warfare", "Desire", "Rest"],
  "Christian Life": ["Vocation", "Community", "Hospitality", "Fasting", "Poverty", "Obedience", "Marriage", "Work"],
  "Doctrine": ["Trinity", "Christology", "Pneumatology", "Salvation", "Eschatology", "Creation", "Scripture", "Providence"],
  "The Church": ["Liturgy", "Sacraments", "Ministry", "Monasticism", "Preaching", "Tradition"],
  "Moral & Ethical": ["Justice", "Virtue", "Vice", "Death", "Conscience"],
};

const ALL_THEMES = Object.values(THEME_VOCABULARY).flat();
const ALL_GENRES = [
  "Homily", "Sermon", "Letter", "Treatise", "Essay", "Meditation",
  "Rule", "Prayer", "Catechesis", "Commentary", "Dialogue", "Hymn", "Poem",
  "Confession", "Hagiography", "Apology", "Exegesis",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function extractTitle(markdown, url) {
  // Try first # heading
  const headingMatch = markdown.match(/^#\s+(.+)$/m);
  if (headingMatch) return headingMatch[1].trim();
  // Fallback: last segment of URL
  return path.basename(url, path.extname(url));
}

function generateFrontmatter(title, index, cfg, noteDraft = "", suggestedThemes = []) {
  const slug = slugify(title);
  const themeList = ALL_THEMES.join(", ");
  const genreList = ALL_GENRES.join(", ");
  const escapedDraft = noteDraft.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ");

  // Map suggested theme names → controlled-vocab slugs, keep only valid ones (cap 6),
  // so import gets a real starting set instead of an empty list to fill by hand.
  const validThemeSlugs = new Set(ALL_THEMES.map(slugify));
  const themeSlugs = [...new Set(suggestedThemes.map(slugify))]
    .filter((s) => validThemeSlugs.has(s))
    .slice(0, 6);
  const themesLine = themeSlugs.length
    ? `themes: [${themeSlugs.join(", ")}]`
    : `themes: []  # TODO — choose from: ${themeList}`;

  // Omitted entirely (not written as an empty string) when unset, so
  // parseFrontmatter() leaves data.license undefined and the importer treats
  // the text as public domain by default — the same convention as every
  // other optional field here.
  const licenseLine = cfg.knownFields.license
    ? `license: "${cfg.knownFields.license}"\n`
    : "";

  return `---
title: "${title}"
slug: "${slug}"
author: "${cfg.collection.author}"
genre: "${cfg.knownFields.genre || "# TODO — choose from: " + genreList}"
${themesLine}
collection: "${cfg.collection.slug}"
collection_order: ${index + 1}
source_attribution: "${cfg.knownFields.sourceAttribution || "# TODO"}"
provenance_notes: "${cfg.knownFields.provenanceNotes || "# TODO — note original source URL and access date"}"
translation_notes: "${cfg.knownFields.translationNotes || "# TODO — confirm translator death date and translation copyright status"}"
ocr_quality: "high"
published: false
copyright_safe: ${cfg.knownFields.copyrightSafe ?? true}
${licenseLine}note_draft: "${escapedDraft}"
---

<!-- EDITORIAL INTRO — write 2–4 sentences here explaining what this text is and why it matters. This appears above the text on the reader page. -->

`;
}

// Naïve theme suggestion based on keyword presence in text
function suggestThemes(markdown) {
  const lower = markdown.toLowerCase();
  const suggestions = [];

  const keywordMap = {
    Prayer: ["prayer", "pray", "intercession"],
    Repentance: ["repentance", "repent", "penance", "confession of sin"],
    Contemplation: ["contemplat", "mystical", "vision of god"],
    Humility: ["humility", "humble", "humiliat"],
    Suffering: ["suffering", "affliction", "tribulation", "martyrdom"],
    Baptism: ["baptism", "baptize", "font", "water"],
    Sacraments: ["sacrament", "eucharist", "communion", "lord's supper", "chrism"],
    Liturgy: ["liturgy", "liturgical", "worship", "rite", "anaphora"],
    Christology: ["christ", "incarnation", "two natures", "son of god"],
    Trinity: ["trinity", "father, son", "holy spirit", "triune"],
    Salvation: ["salvation", "saved", "redemption", "forgiveness"],
    Scripture: ["scripture", "gospel", "epistle", "old testament", "new testament"],
    Doctrine: ["doctrine", "creed", "orthodox", "heresy"],
    Ministry: ["bishop", "presbyter", "deacon", "ordination", "clergy"],
    Tradition: ["tradition", "fathers", "council", "church teaching"],
  };

  for (const [theme, keywords] of Object.entries(keywordMap)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      suggestions.push(theme);
    }
  }

  return suggestions.slice(0, 6); // cap at 6 suggestions
}

function suggestGenre(markdown, knownGenre) {
  if (knownGenre) return { genre: knownGenre, confidence: "known" };

  const lower = markdown.toLowerCase();
  if (lower.includes("catechumen") || lower.includes("baptismal instruction")) {
    return { genre: "Catechesis", confidence: "high" };
  }
  if (lower.includes("my dear brethren") || lower.includes("beloved")) {
    return { genre: "Homily", confidence: "medium" };
  }
  if (lower.includes("dear") && lower.includes("grace and peace")) {
    return { genre: "Letter", confidence: "medium" };
  }
  return { genre: "Treatise", confidence: "low — review manually" };
}

// ---------------------------------------------------------------------------
// Fetch and process a single URL
// ---------------------------------------------------------------------------

async function fetchAndProcess(url, index, cfg) {
  console.log(`[${index + 1}/${cfg.urls.length}] Fetching: ${url}`);

  let html;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Stromata/1.0 (personal research tool; thestromata.com)" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (err) {
    console.error(`  ✗ Failed: ${err.message}`);
    return null;
  }

  const $ = cheerio.load(html);
  const source = cfg.source || "generic";
  const selector = SOURCE_SELECTORS[source] || SOURCE_SELECTORS.generic;

  let contentHtml;
  try {
    contentHtml = selector.extractFn($);
  } catch (err) {
    console.warn(`  ⚠ Extraction warning: ${err.message} — falling back to body`);
    contentHtml = $("body").html() || "";
  }

  const rawMarkdown = td.turndown(contentHtml || "");
  // Prefer the prospect's clean title for single-text fetches; fall back to the
  // scraped page title for multi-chapter works, where each page has its own.
  // Read the title BEFORE cleaning: extractTitle() reads the page's <h1>, which
  // the chrome pass may drop as a duplicate of the rendered title.
  const title =
    cfg.urls.length === 1 && cfg.collection.name
      ? cfg.collection.name
      : extractTitle(rawMarkdown, url);
  const slug = slugify(title);

  // Second line of defence against site chrome. The cheerio selectors above are
  // the primary one, but they fail silently when a source renames a wrapper —
  // and a selector that quietly stops matching is how a nav bar, a logo and a
  // breadcrumb ended up in fourteen bodies in September 2026. Strip whatever
  // survived to markdown, then assert: a tell this module does not yet know
  // about aborts the page rather than being written to disk.
  // Deliberately NOT filtered by `source`: every rule names its own site (or is
  // structurally unmistakable), so running all of them costs nothing and still
  // catches a New Advent page fetched under the `generic` profile.
  const { output: markdown, removed, advisories } = stripChrome(rawMarkdown, {
    // New Advent pages open with an <h1>, and where that h1 is the page title
    // the reader renders it above the body anyway — so it is a duplicate and
    // goes. Passing the title rather than `true` is what keeps that safe: on a
    // per-chapter page (each book of Clement's Stromata is one) the h1 is
    // `Chapter 1. Introductory.`, real content that an unconditional drop
    // would delete. It is removed only when it IS the title just resolved.
    dropLeadingHeading: source === "newadvent" || source === "wittenberg" ? title : false,
  });
  for (const r of removed) {
    console.log(`  ✂ stripped ${r.rule} (${r.why})`);
  }
  for (const a of advisories) {
    console.warn(`  ⚠ ${a.rule}: ${a.why} — ${a.excerpt}`);
  }
  try {
    assertNoChrome(markdown, { label: url });
  } catch (err) {
    console.error(`  ✗ ${err.message}`);
    console.error("    The source's markup has probably changed. Fix the selectors in");
    console.error("    SOURCE_SELECTORS (or add a rule to scripts/lib/source-chrome.mjs)");
    console.error("    before re-running — this page was NOT written.");
    return null;
  }

  const noteDraft = await generateNoteDraft(title, cfg.collection.author, markdown);

  const suggestedThemes = suggestThemes(markdown);
  const frontmatter = generateFrontmatter(title, index, cfg, noteDraft, suggestedThemes);
  const fullContent = frontmatter + markdown;

  console.log(`  ✓ "${title}" (${markdown.length} chars)`);

  return { title, slug, markdown, fullContent, url, index };
}

// ---------------------------------------------------------------------------
// Generate review summary
// ---------------------------------------------------------------------------

function generateReviewSummary(results, cfg) {
  const lines = [
    `# Review Summary — ${cfg.collection.name}`,
    ``,
    `Generated: ${new Date().toISOString().slice(0, 10)}  `,
    `Author: ${cfg.collection.author}  `,
    `Source: ${cfg.source}  `,
    `Texts: ${results.length}`,
    ``,
    `---`,
    ``,
    `## Editorial checklist`,
    ``,
    `For each text below:`,
    `- [ ] Confirm or correct the title`,
    `- [ ] Confirm genre (suggested below)`,
    `- [ ] Review and trim theme suggestions to 3–5 most accurate`,
    `- [ ] Write editorial intro (2–4 sentences) in the .md file`,
    `- [ ] Set collection_order if sequence differs from fetch order`,
    `- [ ] Confirm translation_notes and source_attribution are accurate`,
    ``,
    `---`,
    ``,
  ];

  for (const r of results) {
    if (!r) continue;
    const themes = suggestThemes(r.markdown);
    const { genre, confidence } = suggestGenre(r.markdown, cfg.knownFields?.genre);

    lines.push(`## ${r.index + 1}. ${r.title}`);
    lines.push(``);
    lines.push(`**File:** \`${r.slug}.md\`  `);
    lines.push(`**Source:** ${r.url}  `);
    lines.push(`**Genre suggestion:** ${genre} _(${confidence})_  `);
    lines.push(`**Theme suggestions:** ${themes.length ? themes.join(", ") : "none detected — review manually"}`);
    lines.push(``);
    lines.push(`_Rationale:_ Keywords found in text suggest ${themes.slice(0, 3).join(", ")} as primary themes. Confirm against the full controlled vocabulary.`);
    lines.push(``);
    lines.push(`---`);
    lines.push(``);
  }

  lines.push(`## Collection description`);
  lines.push(``);
  lines.push(`\`\`\``);
  lines.push(`${cfg.collection.description || "# TODO — write 2–4 sentence editorial introduction for the collection page"}`);
  lines.push(`\`\`\``);

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const outputDir = path.join(__dirname, "output", config.collection.slug);
  await fs.mkdir(outputDir, { recursive: true });

  const results = [];

  for (let i = 0; i < config.urls.length; i++) {
    const result = await fetchAndProcess(config.urls[i], i, config);
    results.push(result);

    if (result) {
      const filePath = path.join(outputDir, `${result.slug}.md`);
      await fs.writeFile(filePath, result.fullContent, "utf8");
      console.log(`  → Written: ${filePath}`);
    }

    // Polite delay between requests
    if (i < config.urls.length - 1) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  const summary = generateReviewSummary(results, config);
  const summaryPath = path.join(outputDir, "_review-summary.md");
  await fs.writeFile(summaryPath, summary, "utf8");

  const succeeded = results.filter(Boolean).length;
  console.log(`\nDone. ${succeeded}/${config.urls.length} texts fetched.`);
  console.log(`Output: ${outputDir}`);
  console.log(`Start here: ${summaryPath}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
