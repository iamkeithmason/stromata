/**
 * fetch-texts.mjs — Stromata text ingestion script
 *
 * Fetches public domain theological texts from clean digital sources,
 * strips site chrome, converts to markdown, and writes files ready
 * for editorial review and admin entry.
 *
 * Usage:
 *   node scripts/ingestion/fetch-texts.mjs
 *
 * To use for a new source:
 *   1. Edit config.js — swap the URLs, author, collection, and knownFields
 *   2. Set `source` to: newadvent | ccel | gutenberg | wikisource | generic
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
import { NOTE_PROMPT } from "../lib/note-prompt.mjs";

// Load config from same directory
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = (await import(path.join(__dirname, "config.js"))).default;

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
  const userMessage = [
    `Title: ${title}`,
    `Author: ${authorName}`,
    "",
    markdown.slice(0, 3000),
  ].join("\n");
  try {
    const message = await anthropic.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 400,
      system: NOTE_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });
    return trimToCompleteSentence(message.content[0].text.trim());
  } catch (err) {
    console.warn(`  ⚠ Claude API error for "${title}": ${err.message} — note_draft left empty`);
    return "";
  }
}

function trimToCompleteSentence(text) {
  const lastEnd = Math.max(text.lastIndexOf("."), text.lastIndexOf("!"), text.lastIndexOf("?"));
  if (lastEnd === -1) return text;
  return text.slice(0, lastEnd + 1).trim();
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
    // New Advent main text starts after the breadcrumb h1
    extractFn: ($) => {
      // Remove nav/header tables and footer
      $("table").first().remove();
      $("table").last().remove();
      // Remove support/donation paragraphs
      $("p").each((_, el) => {
        const text = $(el).text();
        if (
          text.includes("Please help support") ||
          text.includes("gumroad") ||
          text.includes("instant download")
        ) {
          $(el).remove();
        }
      });
      // Remove the "About this page" section
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
  "Rule", "Prayer", "Catechesis", "Commentary", "Dialogue", "Hymn",
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
note_draft: "${escapedDraft}"
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

  const markdown = td.turndown(contentHtml || "");
  // Prefer the prospect's clean title for single-text fetches; fall back to the
  // scraped page title for multi-chapter works, where each page has its own.
  const title =
    cfg.urls.length === 1 && cfg.collection.name
      ? cfg.collection.name
      : extractTitle(markdown, url);
  const slug = slugify(title);

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
