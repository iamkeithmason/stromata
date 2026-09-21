/**
 * Tests for the leading-H1 verdict.
 *
 * Every case here is a real row from the corpus as it stood on 2026-09-21, and
 * the ones that matter are the near-misses: a heading that contains the title
 * but is a chapter head, a heading that names the same work in Latin, a heading
 * that is simply the first line of the text. Getting any of them wrong deletes
 * content from a published page, so they are pinned by example rather than by
 * describing the rule.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leadingH1Verdict, leadingHeading, KEEP_LEADING_H1, DROP_LEADING_H1 } from './leading-h1.mjs';

const text = (slug, title, heading) => ({
  slug,
  title,
  body: heading === null ? 'Straight into the prose.' : `# ${heading}\n\nThe body proper.`,
});

test('a heading identical to the title goes', () => {
  const v = leadingH1Verdict(text('tractate-1-john-11-5', 'Tractate 1 (John 1:1-5)', 'Tractate 1 (John 1:1-5)'));
  assert.equal(v.drop, true);
  assert.equal(v.why, 'heading is the title');
});

test('a heading that names the same work differently goes', () => {
  // The corpus writes the same work both ways, and one of them is the title.
  // These all resolve on the name test alone — no slug knowledge needed.
  for (const [title, heading] of [
    ['The City of God, Book I', 'The City of God (Book I)'],
    ['Apology (Apologeticus)', 'Apology'],
    ['Conference 1: On the Goal or End of the Monk', 'Conference 1'],
    ['Epistle of Barnabas', 'The Epistle of Barnabas'],
  ]) {
    const v = leadingH1Verdict(text('x', title, heading));
    assert.equal(v.drop, true, `should drop ${JSON.stringify(heading)} under ${JSON.stringify(title)}`);
  }
});

test('a structural heading stays even when it contains the title', () => {
  // The case that makes rule order load-bearing. `Of Patience` is the title;
  // the heading contains it, and is a chapter head.
  const v = leadingH1Verdict(
    text('of-patience', 'Of Patience', "Chapter 1\\. Of Patience Generally; And Tertullian's Own Unworthiness to Treat of It"),
  );
  assert.equal(v.drop, false);
  assert.equal(v.why, 'structural heading');
});

test('the structural veto covers the forms the corpus actually uses', () => {
  for (const heading of [
    'Chapter 1. Introductory.',
    'Caput I.— Basilidis Sententiam de Continentia Et Nuptiis Refutat.',
    'Section 1',
    'Preface',
    'Preface to the First Edition',
    'Prologue',
    'Part One',
    'Argument',
  ]) {
    const v = leadingH1Verdict(text('x', 'Some Work', heading));
    assert.equal(v.drop, false, `should keep ${JSON.stringify(heading)}`);
    assert.equal(v.why, 'structural heading');
  }
});

test('the keep-list wins over the name test', () => {
  // Ignatius's letters open `Greeting` — content, and nothing structural about
  // the word. Only a list can save it.
  const v = leadingH1Verdict(text('the-epistle-of-ignatius-to-the-romans', 'The Epistle of Ignatius to the Romans', 'Greeting'));
  assert.equal(v.drop, false);
  assert.equal(v.why, 'keep-list');

  // The Didache's heading is the work's manuscript title — a different name,
  // so the name test would not take it anyway, but the list makes it explicit.
  assert.equal(
    leadingH1Verdict(text('the-didache', 'The Didache', "The Lord's Teaching Through the Twelve Apostles to the Nations.")).why,
    'keep-list',
  );
});

test('words that name a whole text here are NOT structural', () => {
  // Tractate / Conference / Dialogue / Epistle / Book each title a text in this
  // corpus rather than a division of one, so the veto must not cover them or
  // 144 duplicated titles stay put.
  assert.equal(leadingH1Verdict(text('x', 'Conference 1: On the Goal or End of the Monk', 'Conference 1')).drop, true);
  assert.equal(leadingH1Verdict(text('x', 'Tractate 5 (John 1:33)', 'Tractate 5 (John 1:33)')).drop, true);
});

test('a name no string test can connect needs the reviewed drop-list', () => {
  // "Contra Faustum, Book I" and "Reply to Faustus, Book I" share no substring.
  // Without the list the rule must keep it — that is the honest default...
  const latin = text('x', 'Reply to Faustus, Book I', 'Contra Faustum, Book I');
  assert.equal(leadingH1Verdict(latin).drop, false);
  assert.equal(leadingH1Verdict(latin).why, 'heading does not name the work');

  // ...and with the real slug, the reviewed list decides.
  for (const [slug, title, heading] of [
    ['contra-faustum-book-i', 'Reply to Faustus, Book I', 'Contra Faustum, Book I'],
    ['on-illustrious-men-de-viris-illustribu-jerome', 'On Illustrious Men / De Viris Illustribus', 'De Viris Illustribus (On Illustrious Men)'],
    ['the-paedagogus-book-ii', 'The Paedagogus, Book II', 'The Instructor (Book II)'],
  ]) {
    const v = leadingH1Verdict(text(slug, title, heading));
    assert.equal(v.drop, true, `should drop ${JSON.stringify(heading)} for ${slug}`);
    assert.equal(v.why, 'reviewed: heading is the work under another name');
  }

  // A drop-list entry that the name test already covers is harmless — it just
  // never gets consulted. `on-the-holy-spirit-great`'s title carries the Latin
  // in parentheses, so the substring test resolves it first.
  const early = leadingH1Verdict(text('on-the-holy-spirit-great', 'On the Holy Spirit (De Spiritu Sancto)', 'De Spiritu Sancto'));
  assert.equal(early.drop, true);
  assert.equal(early.why, 'heading is a variant of the title');
});

test('the drop-list cannot override a structural heading or the keep-list', () => {
  // Order still holds: a reviewed slug whose heading turns out to be a chapter
  // head is kept, so a later re-fetch that changes the body cannot be silently
  // truncated by a list written against the old one.
  const v = leadingH1Verdict(text('contra-faustum-book-i', 'Reply to Faustus, Book I', 'Chapter 1. Of the Manichean error'));
  assert.equal(v.drop, false);
  assert.equal(v.why, 'structural heading');
});

test('a heading unrelated to the title stays, and says so', () => {
  for (const [title, heading] of [
    ['Morning Devotions', 'A Short Prayer to be Said every Morning.'],
    // A heading that is a division word but not on the veto list still stays,
    // because it does not name the work — belt and braces.
    ['Secular Authority: To What Extent It Should Be Obeyed', 'Letter of Dedication'],
  ]) {
    const v = leadingH1Verdict(text('x', title, heading));
    assert.equal(v.drop, false, `should keep ${JSON.stringify(heading)} under ${JSON.stringify(title)}`);
    assert.equal(v.why, 'heading does not name the work');
  }
});

test("Cyprian's two numberings: the heading goes, by reviewed decision not by rule", () => {
  // The name test cannot connect "Epistle 62" to "Epistle 63 to Caecilius" —
  // correctly, since they are different numbers. Without the slug it stays.
  assert.equal(
    leadingH1Verdict(text('x', 'Epistle 63 to Caecilius (on the cup of the Lord)', 'Epistle 62')).drop,
    false,
  );
  // With it, the reviewed list decides: the title carries the modern
  // Hartel/CSEL number, the heading the older ANF one, and leaving a bare
  // conflicting number in the body sends a cross-checking reader to a
  // different letter entirely.
  for (const [slug, title, heading] of [
    ['epistle-63-to-caecilius-carthage', 'Epistle 63 to Caecilius (on the cup of the Lord)', 'Epistle 62'],
    ['epistle-64-to-fidus-carthage', 'Epistle 64 to Fidus (on infant baptism)', 'Epistle 58'],
    ['epistle-73-to-jubaianus-carthage', 'Epistle 73 to Jubaianus (on the baptism of heretics)', 'Epistle 72'],
    ['epistle-75-carthage', 'Epistle 75 (Firmilian to Cyprian)', 'Epistle 74'],
  ]) {
    const v = leadingH1Verdict(text(slug, title, heading));
    assert.equal(v.drop, true, `${slug} should drop`);
    assert.equal(v.why, 'reviewed: heading is the work under another name');
  }
});

test('a body with no leading heading yields no verdict', () => {
  const v = leadingH1Verdict(text('x', 'Some Work', null));
  assert.equal(v.drop, false);
  assert.equal(v.heading, undefined);
  assert.equal(leadingHeading('## Chapter 2\n\nBody.'), null, 'an H2 is not a leading H1');
  assert.equal(leadingHeading(''), null);
  assert.equal(leadingHeading(undefined), null);
});

test('a heading further down the body is not the leading heading', () => {
  assert.equal(leadingHeading('An opening paragraph.\n\n# A heading partway through'), null);
});

test('missing title or slug never produces a drop', () => {
  assert.equal(leadingH1Verdict({ body: '# Something\n\nBody.' }).drop, false);
  assert.equal(leadingH1Verdict({ slug: 'x', title: '', body: '# Something\n\nBody.' }).drop, false);
  assert.equal(leadingH1Verdict(null).drop, false);
});

test('every keep-list slug is kebab-case, so a typo cannot silently never match', () => {
  for (const slug of KEEP_LEADING_H1) {
    assert.match(slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${slug} is not a slug`);
  }
});

test('the two judgement lists do not overlap', () => {
  // A slug on both would resolve by rule order rather than by intent, which is
  // the kind of thing nobody notices until a text loses its heading.
  for (const slug of KEEP_LEADING_H1) {
    assert.ok(
      !DROP_LEADING_H1.some(pattern => pattern.test(slug)),
      `${slug} is on the keep-list and matched by the drop-list`,
    );
  }
});
