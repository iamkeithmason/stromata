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
    name: "Confessions",
    slug: "confessions",
    author: "Augustine of Hippo",
    // TODO — write 2–4 sentence editorial intro for the collection page
    description: "",
  },

  urls: [
    "https://www.newadvent.org/fathers/110101.htm", // Book 1
    "https://www.newadvent.org/fathers/110102.htm", // Book 2
    "https://www.newadvent.org/fathers/110103.htm", // Book 3
    "https://www.newadvent.org/fathers/110104.htm", // Book 4
    "https://www.newadvent.org/fathers/110105.htm", // Book 5
    "https://www.newadvent.org/fathers/110106.htm", // Book 6
    "https://www.newadvent.org/fathers/110107.htm", // Book 7
  ],

  source: "newadvent",

  knownFields: {
    genre: "Confession",

    sourceAttribution:
      "Translated by J.G. Pilkington. From Nicene and Post-Nicene Fathers, Vol. 1. Edited by Philip Schaff. Buffalo, NY: Christian Literature Publishing Co., 1887.",

    provenanceNotes:
      "Text sourced from New Advent (newadvent.org). Original translation public domain (pre-1900). Accessed April 2026.",

    translationNotes:
      "J.G. Pilkington translation, 1887. J.G. Pilkington (1821–1870) — translation public domain. No separate translation copyright applies.",

    // Cyril of Jerusalem d. c.386. Gifford translation 1894. Both clear.
    copyrightSafe: true,
  },
};
