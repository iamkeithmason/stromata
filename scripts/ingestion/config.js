/**
 * config.js — Stromata ingestion config
 *
 * Swap this file's contents for each new source.
 * The script (fetch-texts.mjs) reads this and does the rest.
 *
 * source options: newadvent | ccel | gutenberg | wikisource | generic
 */

export default {
  collection: {
    name: "On the Priesthood",
    slug: "on-the-priesthood-chrysostom",
    author: "John Chrysostom",
    description: "",
  },
  urls: [
    "https://www.newadvent.org/fathers/21011.htm",
    "https://www.newadvent.org/fathers/21012.htm",
    "https://www.newadvent.org/fathers/21013.htm",
    "https://www.newadvent.org/fathers/21014.htm",
    "https://www.newadvent.org/fathers/21015.htm",
    "https://www.newadvent.org/fathers/21016.htm",
  ],
  source: "newadvent",
  knownFields: {
    genre: "Dialogue",
    sourceAttribution: "Translated by W.R.W. Stephens (NPNF Series I, Vol. IX).",
    provenanceNotes: "Text sourced from New Advent (newadvent.org). Accessed June 2026.",
    translationNotes: "W.R.W. Stephens (1839–1902). Translation published 1889; copyright expired.",
    copyrightSafe: true,
  },
};
