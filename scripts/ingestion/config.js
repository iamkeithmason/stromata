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
    name: "Proslogion",
    slug: "proslogion",
    author: "Anselm of Canterbury",
    // TODO — write 2–4 sentence editorial intro for the collection page
    description: "",
  },

  urls: [
    "https://archive.org/stream/stanselmeproslog00anseuoft/stanselmeproslog00anseuoft_djvu.txt",
  ],

  source: "archive.org",

  knownFields: {
    genre: "Meditation",

    sourceAttribution:
      "Translated from the Latin by Sidney Norton Deane.",

    provenanceNotes:
      "Text sourced from Archive.org (archive.org). Original translation public domain (1903). Accessed April 2026.",

    translationNotes:
      "Sidney Norton Deane translation. Sidney Norton Deane (1878–1943) — translation public domain. No separate translation copyright applies.",

    copyrightSafe: true,
  },
};
