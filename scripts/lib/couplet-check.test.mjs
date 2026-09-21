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
