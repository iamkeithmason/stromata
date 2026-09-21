/**
 * leading-h1.mjs — deciding whether a body's opening heading is a duplicate title
 *
 * The reader page renders `<h1>{text.title}</h1>` above the body, so a body that
 * opens with its own `# Title` shows the title twice. 333 texts in the corpus do.
 * But a body that opens with `# Chapter 1. Introductory.` or `# Greeting` is
 * opening with *content*, and removing that loses something real.
 *
 * Telling those apart is a judgement, which is why it lives here and not in
 * `source-chrome.mjs` — that module removes only what is mechanically certain.
 * The judgement is encoded three ways, in this order:
 *
 *   1. an explicit keep-list, for the handful a rule cannot reach;
 *   2. a structural veto — a heading that names a division of the work is
 *      content, whatever it resembles;
 *   3. a name test — drop only when the heading names the work itself, either
 *      identically or as a variant (`Apology` under `Apology (Apologeticus)`,
 *      `Contra Faustum, Book I` under `Reply to Faustus, Book I`).
 *
 * Order matters. `Of Patience` is the title of a Tertullian treatise whose first
 * heading is `Chapter 1. Of Patience Generally; And Tertullian's Own
 * Unworthiness to Treat of It` — it *contains* the title, so the name test would
 * take it. The structural veto runs first, so it stays.
 */

import { looksStructuralHeading } from './source-chrome.mjs';

/**
 * Texts whose opening heading is real content even though the name test would
 * take it. Two kinds:
 *
 *   - the heading is part of the text — Ignatius's letters all open `Greeting`,
 *     `prayers` opens with the first prayer's own title;
 *   - the heading is the work's *other* name, and losing it loses information:
 *     the Didache is headed with its manuscript title, "The Lord's Teaching
 *     Through the Twelve Apostles to the Nations".
 *
 * Established by reading all 333 candidates on 2026-09-21. Structural cases
 * (`Chapter 1.`, `Section 1`, `Preface`) are deliberately absent — the veto
 * catches those on shape, so they need no entry, and neither will the next text
 * like them.
 */
export const KEEP_LEADING_H1 = new Set([
  'the-epistle-of-ignatius-to-polycarp',
  'the-epistle-of-ignatius-to-the-ephesians',
  'the-epistle-of-ignatius-to-the-philadelphians',
  'the-epistle-of-ignatius-to-the-romans',
  'the-epistle-of-ignatius-to-the-smyrnaeans',
  'the-epistle-of-ignatius-to-the-trallians',
  'prayers',
  'directions-right-singing-psalms-roberts',
  'canons-of-aelfric-pastoral-epistle',
  'letter-146-evangelus-jerome',
  'the-didache',
  'the-epistle-to-diognetus',
]);

/**
 * Texts whose opening heading names the same work under a name no string test
 * can connect to the title — a Latin title against an English one, a different
 * translator's rendering. `Contra Faustum, Book I` and `Reply to Faustus, Book
 * I` share no substring; only knowing the works does.
 *
 * These are reviewed individually, same as the keep-list, and listed as regexes
 * only where a whole numbered family was read at once. A slug that is on
 * neither list and fails the name test is reported, not dropped — the tool
 * removes what it can prove and hands back the rest.
 */
export const DROP_LEADING_H1 = [
  /^contra-faustum-book-/,          // heading "Contra Faustum, Book N" vs title "Reply to Faustus, Book N"
  /^on-merit-and-forgiveness-book-/, // heading carries the longer original title
  /^the-paedagogus-book-/,          // heading "The Instructor (Book N)"
  /^eranistes-dialogue-/,           // heading "Dialogue N"
  /^on-illustrious-men-/,           // heading "De Viris Illustribus (On Illustrious Men)"
  /^on-the-holy-spirit-great$/,     // heading "De Spiritu Sancto"
  /^canons-of-the-synod-of-gangra$/, // heading "Synod of Gangra (4th Century)"
  /^second-epistle-of-clement$/,    // heading 'The "Second Epistle" of St. Clement'
  /^the-first-epistle-of-clement-to-the-corinthians$/, // heading "Letter to the Corinthians (Clement)"

  // Cyprian's letters carry two numberings. The titles here use the modern
  // Hartel/CSEL sequence that scholarship cites ("Cyprian Ep. 63"); the ANF
  // translation these bodies follow uses the older Oxford sequence, and New
  // Advent's page title — which became the body heading — is that older number.
  //
  // A bare `# Epistle 62` under the title `Epistle 63 to Caecilius` is worse
  // than untidy: New Advent also has an `Epistle 63`, which in the ANF sequence
  // is a DIFFERENT letter, so a reader cross-checking the heading lands on the
  // wrong text. The number stays in translation_notes, where it is labelled.
  /^epistle-63-to-caecilius-carthage$/,   // ANF 62
  /^epistle-64-to-fidus-carthage$/,       // ANF 58
  /^epistle-73-to-jubaianus-carthage$/,   // ANF 72
  /^epistle-75-carthage$/,                // ANF 74
];

/**
 * Compare two names the way a reader would, ignoring everything that is not a
 * letter or digit. `The City of God (Book I)` and `The City of God, Book I` are
 * the same name; the corpus writes the same work both ways.
 */
const nameKey = (str) => String(str ?? '').replace(/[^a-z0-9]/gi, '').toLowerCase();

/** The body's opening `# ` heading, or null. */
export function leadingHeading(body) {
  return String(body ?? '').match(/^#[ \t]+(\S[^\n]*)/)?.[1]?.trim() ?? null;
}

/**
 * Should this text's opening heading be removed?
 *
 * @param {{ slug?: string, title?: string, body?: string }} text
 * @returns {{ drop: boolean, why?: string, heading?: string }} — `why` is
 *   populated either way, so a dry run can be read rather than trusted.
 */
export function leadingH1Verdict(text) {
  const heading = leadingHeading(text?.body);
  if (!heading) return { drop: false };
  if (KEEP_LEADING_H1.has(text.slug)) return { drop: false, why: 'keep-list', heading };
  if (looksStructuralHeading(heading)) return { drop: false, why: 'structural heading', heading };

  const h = nameKey(heading);
  const t = nameKey(text.title);
  if (!h || !t) return { drop: false, why: 'nothing to compare', heading };
  if (h === t) return { drop: true, why: 'heading is the title', heading };
  if (h.includes(t) || t.includes(h)) {
    return { drop: true, why: 'heading is a variant of the title', heading };
  }
  if (DROP_LEADING_H1.some(pattern => pattern.test(text.slug ?? ''))) {
    return { drop: true, why: 'reviewed: heading is the work under another name', heading };
  }
  return { drop: false, why: 'heading does not name the work', heading };
}
