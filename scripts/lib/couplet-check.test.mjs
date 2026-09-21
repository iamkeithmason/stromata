import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normaliseWord,
  finalWord,
  plausibleWord,
  rime,
  rhymes,
  checkCouplets,
} from './couplet-check.mjs';

// Every couplet below is real. The sound ones were read off the page images of
// the 1743 Psychomachia (bim_eighteenth-century_psychomachia-the-war-of_
// prudentius_1743, leaves 14 and 26); the broken ones are exactly what the
// Archive.org djvu OCR produced for those same lines. Inventing fixtures would
// let the checker pass on text the real scan fails, which is the whole thing
// this suite exists to stop.

test('normaliseWord folds the long s and the elision apostrophe', () => {
  assert.equal(normaliseWord('beſtow’d'), 'bestowd');
  assert.equal(normaliseWord("flatt'ring"), 'flattring');
  assert.equal(normaliseWord('State;'), 'state');
});

test('finalWord skips trailing punctuation and single-letter specks', () => {
  assert.equal(finalWord('And bring full man, full deity to light.'), 'light');
  // A signature mark left on the line by the scanner. What matters is that
  // the junk is reported rather than skipped over in favour of `flame`.
  assert.equal(finalWord('Or roll’d in whirling vortices of flame : E M4'), 'm');
  assert.equal(plausibleWord(finalWord('Or roll’d in whirling vortices of flame : E M4')), false);
  assert.equal(finalWord('Soon as che gentle- minded queen beheld |'), 'beheld');
});

test('plausibleWord rejects OCR wreckage and accepts real endings', () => {
  assert.equal(plausibleWord('light'), true);
  assert.equal(plausibleWord('quelld'), true);
  // Real words with heavy consonant clusters. Every one of these was reported
  // as wreckage by an earlier, stricter rule; all four are in the poem.
  assert.equal(plausibleWord('constrain'), true);
  assert.equal(plausibleWord('overthrows'), true);
  assert.equal(plausibleWord('oerthrown'), true);
  assert.equal(plausibleWord('oerspreads'), true);
  // Digits and consonant runs: the endings the scan actually produced.
  assert.equal(plausibleWord('m4'), false);
  assert.equal(plausibleWord(''), false);
  assert.equal(plausibleWord('ks'), false);
});

test('rime drops the silent terminal e before reducing', () => {
  // `state` must reduce on its a, not on the mute letter after it.
  assert.notEqual(rime('state'), rime('the'));
  assert.equal(rime('state'), rime('fate'));
});

test('rhymes accepts the couplets the 1743 actually prints', () => {
  // Leaf 14, straight rhymes.
  assert.equal(rhymes('cleaves', 'receives'), true);
  assert.equal(rhymes("bestow'd", "flow'd"), true);
  assert.equal(rhymes('shine', 'line'), true);
  assert.equal(rhymes('path', 'death'), true);
  // Leaf 26.
  assert.equal(rhymes('breath', 'death'), true);
  assert.equal(rhymes('grass', 'pass'), true);
  assert.equal(rhymes('horse', 'force'), true);
});

test('rhymes is permissive enough for eighteenth-century ears', () => {
  // These are printed as rhymes in this text. A checker strict enough to
  // reject them would be wrong about the poem, not about the transcription.
  assert.equal(rhymes('seat', 'State'), true);
  assert.equal(rhymes('unite', 'light'), true);
});

test('a repeated end-word is not a rhyme', () => {
  // Nearly always a transcription that emitted the same line twice.
  assert.equal(rhymes('death', 'death'), false);
});

test('checkCouplets separates wreckage from mere non-rhyme', () => {
  // The staged djvu text for leaf 14, with its three dropped lines, beside
  // what the page actually prints.
  const broken = [
    'A new alliance is commenc’d with heav’n,',
    'vnd’rous conception where extremes unite,',
    'And bring full man, full deity to licht.',
    'Beat teeth, and tongue promiscuous down her 15 Cie',
  ];
  const report = checkCouplets(broken, { offset: 246 });

  // `15 Cie` is the kind of line that is always a fault — caught on the
  // numeral, which is nowhere near the line ending.
  assert.equal(report.garbled.length, 1);
  assert.equal(report.garbled[0].line, 249);
  assert.equal(report.garbled[0].reason, 'digits');

  // And the couplet it sits in is not also counted as a non-rhyme.
  assert.ok(report.noRhyme.every((f) => f.line !== 248));
});

test('checkCouplets scores a clean page near the top of its range', () => {
  // Leaf 26 as the page actually prints it: ten sound couplets.
  const sound = [
    'Which FRAUD, a sister of th’ infernal train,',
    'Mischievous open’d on th’ embattled plain;',
    'That, in the conflicts formidable hour,',
    'The rushing ranks it might at once devour;',
    'And, least some eye the cavern shou’d explore,',
    'With rods, and branches she had bridg’d it o’er,',
    'Then cover’d all with tufts of verdant grass,',
    'That none shou’d hesitate the gulph to pass:',
    'Safe from the lists the queen of meekness stay’d,',
    'Nor once approach’d the ambush that was laid,',
    'From no surmisings in a fearful mind,',
    'Of dark contrivances by FRAUD design’d:',
    'But PRIDE, high-thron’d upon her fiery horse,',
    'Drives forward blindly, with impetuous force,',
    'Brooks no delay, nor at the danger stops,',
    'And down the pit a pond’rous ruin drops:',
    'Pitch’d on her head, with sudden loss of breath,',
    'The steed incumbent presses her to death.',
  ];
  const report = checkCouplets(sound);
  assert.equal(report.garbled.length, 0);
  assert.equal(report.pairs, 9);
  assert.ok(
    report.rhymeRate >= 0.88,
    `a sound page should score high, got ${report.rhymeRate}`,
  );
});

test('the same page from the djvu OCR scores worse than from the image', () => {
  // This is the comparison the whole exercise turns on, so it is asserted
  // rather than eyeballed: the staged text must not look as good as the page.
  const fromImage = [
    'A new alliance is commenc’d with heav’n,',
    'A God to flesh, and flesh to God is giv’n:',
    'Wond’rous conception! where extremes unite,',
    'And bring full man, full deity to light.',
    'Yet to the form divine no weakness cleaves,',
    'But man new graces, and new strength receives;',
    'For after all the heav’nly gifts bestow’d,',
    'The spring of bounty undiminish’d flow’d;',
  ];
  const fromDjvu = [
    'A new alliance is commenc’d with heav’n,',
    'vnd’rous conception where extremes unite,',
    'And bring full man, full deity to licht.',
    'Yet to the form divine no weakness cleaves,',
    'But man new graces, and new strength receives;',
    'For after all the heav’nly gifts bestow’d,',
    'Still in the God unfaded glories shine,',
    'Our nature brighten, and exalt our line,',
  ];
  assert.ok(
    checkCouplets(fromImage).rhymeRate > checkCouplets(fromDjvu).rhymeRate,
    'the page image should transcribe to a better-rhyming text than the djvu OCR',
  );
});

test('a triplet does not throw the rest of the poem out of phase', () => {
  // Eighteenth-century couplet verse drops into a triplet every so often, and
  // this printing braces them in the margin. A fixed pairing would count the
  // triplet as one bad couplet AND mis-pair everything after it; the whole
  // point of resynchronising is that the two sound couplets following still
  // read as sound.
  const withTriplet = [
    'Still in the God unfaded glories shine,',   // triplet
    'Our nature brighten, and exalt our line,',  //   (braced in the 1743)
    'He still the same, but we become divine.',  //
    'Here lies my safety, here I put my trust,',
    'And hence my triumph, O infernal LUST;',
    'Thou art the way to hell; thy flatt’ring path',
    'Leads to the chambers of eternal Death;',
  ];
  const report = checkCouplets(withTriplet);
  assert.equal(report.triplets.length, 1);
  assert.equal(report.triplets[0].line, 1);
  assert.equal(report.noRhyme.length, 0, 'nothing after the triplet should de-phase');
  assert.equal(report.rhymeRate, 1);
});

test('the vowel-class rule is exercised by pairs only it can pass', () => {
  // Regression guard. This branch was dead for its whole first life: it
  // compared the class-encoded rime and stripped the encoding with a regex
  // that left an empty string, so it never fired. Nothing caught it, because
  // the only fixture aimed at it (seat/State) also passes on the exact-rime
  // path. These two pairs match on NEITHER of the earlier paths — different
  // rimes, different three-letter tails — so if this rule breaks again, this
  // test is what fails.
  assert.notEqual(rime('applyd'), rime('guide'));
  assert.notEqual('lyd'.slice(-3), 'ide'.slice(-3));
  assert.equal(rhymes("apply'd", 'Guide'), true);

  assert.notEqual(rime('lead'), rime('seed'));
  assert.equal(rhymes('lead', 'seed'), true);
});
