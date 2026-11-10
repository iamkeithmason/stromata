// Fixtures are real rows from the 10 Nov 2026 audit (production, read-only), trimmed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  proposeEdition, reconcileCollections, isResolved, acceptLlmFields, readNames, findTranslators,
  findVolume, findSeriesMentions, findYears, romanToInt, clean, canonicaliseTranslators,
} from './edition-parse.mjs';

const row = (o) => ({
  slug: 'x', title: 'X', author: { name: 'Someone', death_year: 400 },
  source_attribution: null, translation_notes: null, provenance_notes: null, ...o,
});

// ── Clean cases ───────────────────────────────────────────────────────────────

test('Thelwall, ANF 3', () => {
  const p = proposeEdition(row({
    author: { name: 'Tertullian', death_year: 220 },
    source_attribution: 'Ante-Nicene Fathers, Vol. 3. Translated by S. Thelwall. Christian Literature Publishing Co., 1885.',
  }));
  assert.equal(p.series_key, 'ANF');
  assert.equal(p.volume, 3);
  assert.deepEqual(p.translators, ['S. Thelwall']);
  assert.equal(p.publication_year, 1885);
  assert.equal(p.is_translation, true);
  assert.equal(p.confidence, 'high');
  assert.ok(isResolved(p));
});

test('Dods, NPNF1 2', () => {
  const p = proposeEdition(row({
    author: { name: 'Augustine of Hippo', death_year: 430 },
    source_attribution: 'Translated by Marcus Dods (NPNF, Series I, Vol. II).',
    translation_notes: 'NPNF1 vol. 2 translation by Marcus Dods, 1871/1887; public domain. Author d. 430.',
  }));
  assert.equal(p.series_key, 'NPNF1');
  assert.equal(p.method.series_key, 'pattern');
  assert.equal(p.volume, 2);
  assert.equal(p.translator_display, 'Marcus Dods');
  assert.equal(p.publication_year, 1887, 'the later of "1871/1887" is the NPNF reprint the row cites');
  assert.deepEqual(p.reasons, []);
});

test('Gifford, NPNF2 7', () => {
  const p = proposeEdition(row({
    author: { name: 'Cyril of Jerusalem', death_year: 386 },
    source_attribution: 'Translated by Edwin Hamilton Gifford. From Nicene and Post-Nicene Fathers, Second Series, Vol. 7. Edited by Philip Schaff and Henry Wace. Buffalo, NY: Christian Literature Publishing Co., 1894.',
  }));
  assert.equal(p.series_key, 'NPNF2');
  assert.equal(p.volume, 7);
  assert.equal(p.translator_display, 'Edwin Hamilton Gifford');
  assert.equal(p.publication_year, 1894);
  assert.equal(p.place, 'Buffalo, NY');
  assert.equal(p.publisher, 'Christian Literature Publishing Co.');
  assert.ok(!p.reasons.includes('translator_is_editor'), 'Schaff as editor is not a translator credit');
});

test('Jacobs, Philadelphia Luther II', () => {
  const p = proposeEdition(row({
    author: { name: 'Martin Luther', death_year: 1546 },
    source_attribution: 'Translated by C. M. Jacobs, in Works of Martin Luther: With Introductions and Notes, Vol. II (Philadelphia: A. J. Holman Company, 1915).',
    translation_notes: "Author died 1546. Jacobs' 1915 Philadelphia Edition translation, confirmed public domain.",
  }));
  assert.equal(p.series_key, 'LUTHER_PHILA');
  assert.equal(p.volume, 2);
  assert.deepEqual(p.translators, ['C.M. Jacobs']);
  assert.equal(p.publication_year, 1915);
  assert.equal(p.place, 'Philadelphia');
  assert.equal(p.publisher, 'A. J. Holman Company');
});

// ── Known cases from the audit ────────────────────────────────────────────────

test('Tractates on John: "18888" is year_suspect, not a year', () => {
  const p = proposeEdition(row({
    author: { name: 'Augustine of Hippo', death_year: 430 },
    source_attribution: 'Translated by John Gibb. From Nicene and Post-Nicene Fathers, First Series, Vol. 7 ed. Philip Schaff. Christian Literature Publishing Co., 18888. Revised for New Advent by Kevin Knight.',
  }));
  assert.ok(p.reasons.includes('year_suspect'));
  assert.equal(p.publication_year, null);
  assert.equal(p.series_key, 'NPNF1');
  assert.equal(p.volume, 7);
  assert.equal(p.translator_display, 'John Gibb');
});

test('Irenaeus fragments: "Philip Schaff et al." on ANF is translator_is_editor', () => {
  const p = proposeEdition(row({
    author: { name: 'Irenaeus of Lyons', death_year: 202 },
    source_attribution: 'Translated by Philip Schaff et al. From Ante-Nicene Fathers, Vol. I. Edited by Alexander Roberts and James Donaldson. (Buffalo, NY: Christian Literature Publishing Co., 1885.)',
  }));
  assert.equal(p.series_key, 'ANF');
  assert.equal(p.volume, 1);
  assert.ok(p.reasons.includes('translator_is_editor'));
  assert.equal(p.confidence, 'low');
});

test('Confessions: NPNF with no series number infers NPNF1 from the author', () => {
  const p = proposeEdition(row({
    author: { name: 'Augustine of Hippo', death_year: 430 },
    source_attribution: 'Translated by J.G. Pilkington. From Nicene and Post-Nicene Fathers, Vol. 1. Edited by Philip Schaff. Buffalo, NY: Christian Literature Publishing Co., 1887.',
  }));
  assert.equal(p.series_key, 'NPNF1');
  assert.equal(p.method.series_key, 'inferred');
  assert.equal(p.confidence, 'medium');
  assert.equal(p.volume, 1);
});

test('NPNF with no series number, non-Augustine author, infers NPNF2', () => {
  const p = proposeEdition(row({
    author: { name: 'Jerome', death_year: 420 },
    source_attribution: 'Translated by W.H. Fremantle. From Nicene and Post-Nicene Fathers, Vol. 6.',
  }));
  assert.equal(p.series_key, 'NPNF2');
  assert.equal(p.method.series_key, 'inferred');
});

test('Chrysostom Homily 24 on 1 Corinthians: NPNF1 Vol. 12', () => {
  const p = proposeEdition(row({
    author: { name: 'John Chrysostom', death_year: 407 },
    source_attribution: 'Translated by Talbot W. Chambers. From Nicene and Post-Nicene Fathers, Series I, Vol. 12. Edited by Philip Schaff. Buffalo, NY: Christian Literature Publishing Co., 1889.',
  }));
  assert.equal(p.series_key, 'NPNF1');
  assert.equal(p.method.series_key, 'pattern');
  assert.equal(p.volume, 12);
  assert.equal(p.translator_display, 'Talbot W. Chambers');
});

test('Psychomachia: an NPNF mention that rules NPNF out is series_false_positive_suspect', () => {
  const p = proposeEdition(row({
    author: { name: 'Prudentius', death_year: 413 },
    source_attribution: 'Anonymous English verse translation, printed 1743 as "Psychomachia; the war of the soul".',
    translation_notes: 'Anonymous, published 1743 — public domain by publication date. No 19th-century public-domain English translation exists: Prudentius (c.348–c.413) appears in neither the Ante-Nicene nor the Nicene and Post-Nicene Fathers, R. Martin Pope\'s 1905 volume translates the Hymns only.',
  }));
  assert.equal(p.series_key, null);
  assert.ok(p.reasons.includes('series_false_positive_suspect'));
  assert.equal(p.publication_year, 1743);
});

test('Stromata: ANF cited with no volume, translator via alias; siblings share series', () => {
  const sib = (slug, sa) => ({
    slug, collection_slug: 'the-stromata',
    proposal: proposeEdition(row({ slug, author: { name: 'Clement of Alexandria', death_year: 215 }, source_attribution: sa })),
  });
  const items = [
    sib('the-stromata-book-i', 'Roberts-Donaldson translation. Via New Advent, Fathers of the Church (newadvent.org/fathers/02101.htm). Public domain.'),
    sib('the-stromata-book-ii', 'Roberts-Donaldson translation. Via New Advent. Public domain.'),
  ];
  items[0].proposal.series_key ??= null;
  for (const it of items) {
    assert.deepEqual(it.proposal.translators, ['Alexander Roberts', 'James Donaldson']);
    assert.equal(it.proposal.method.translators, 'alias');
  }
});

test('Letters of Ignatius: ANF Vol. 1 with no translator is translator_missing', () => {
  const p = proposeEdition(row({
    author: { name: 'Ignatius of Antioch', death_year: 108 },
    source_attribution: 'Ante-Nicene Fathers, Vol. 1 (1885), revised for New Advent by Kevin Knight',
  }));
  assert.equal(p.series_key, 'ANF');
  assert.equal(p.volume, 1);
  assert.equal(p.publication_year, 1885);
  assert.ok(p.reasons.includes('translator_missing'));
  assert.ok(!isResolved(p));
});

test('Volume forms: "Vol. 2", "Vol. II", "Vol. 9\\." and "Vol. X — Additional Volume"', () => {
  const v = sa => findVolume(clean(sa), findSeriesMentions(clean(sa))[0]);
  assert.equal(v('Ante-Nicene Fathers, Vol. 2').volume, 2);
  assert.equal(v('Ante-Nicene Fathers, Vol. II').volume, 2);
  assert.equal(v('Nicene and Post-Nicene Fathers, Series I, Vol. 9\\. ed. Philip Schaff').volume, 9);
  const add = v('Translated by Allan Menzies (ANF, Vol. X — Additional Volume).');
  assert.equal(add.volume, 10);
  assert.equal(add.additional, true);
  assert.equal(romanToInt('XIV'), 14);
});

test('Blank provenance on all three columns is no_provenance_text', () => {
  for (const slug of ['treatise-on-the-practical-life', 'on-the-thoughts', 'the-martyrdom-of-ignatius', 'on-prayer', 'homily-50-on-matthew', 'confession', 'institutes-of-polity-civil-and-ecclesiastical']) {
    const p = proposeEdition(row({ slug, source_attribution: null, translation_notes: '', provenance_notes: '  ' }));
    assert.deepEqual(p.reasons, ['no_provenance_text'], slug);
    assert.ok(!isResolved(p));
  }
});

test('Sermon of the Wolf: a 2014 translator is modern_translation_check', () => {
  const p = proposeEdition(row({
    author: { name: 'Wulfstan the Homilist', death_year: 1023 },
    translation_notes: 'Translated by Stephen M. Lewis, February 2014',
  }));
  assert.equal(p.translator_display, 'Stephen M. Lewis');
  assert.equal(p.publication_year, 2014);
  assert.ok(p.reasons.includes('modern_translation_check'));
});

test('Other series: Library of the Fathers, Parker Society, Creeds of Christendom, TCL/SPCK', () => {
  const lf = proposeEdition(row({ author: { name: 'Ephrem the Syrian', death_year: 373 }, source_attribution: 'Translated by John Brande Morris, in Select Works of S. Ephrem the Syrian (Oxford: John Henry Parker, 1847), Library of the Fathers vol. 41.' }));
  assert.equal(lf.series_key, 'LIB_FATHERS');
  assert.equal(lf.volume, 41);
  assert.equal(lf.publication_year, 1847);

  const lf2 = proposeEdition(row({ author: { name: 'Augustine of Hippo', death_year: 430 }, source_attribution: '*Translated by H. M. Wilkins. From* Library of the Fathers of the Holy Catholic Church, *Vol. V. Oxford: John Henry Parker, 1853.*' }));
  assert.equal(lf2.series_key, 'LIB_FATHERS');
  assert.equal(lf2.volume, 5);
  assert.deepEqual(lf2.translators, ['H.M. Wilkins']);

  const parker = proposeEdition(row({ author: { name: 'Edmund Grindal', death_year: 1583 }, source_attribution: 'From The Remains of Edmund Grindal, Parker Society, ed. William Nicholson. Cambridge University Press, 1843.', translation_notes: 'Original English composition, not a translation.' }));
  assert.equal(parker.series_key, 'PARKER');
  assert.equal(parker.is_translation, false);
  assert.ok(parker.reasons.includes('original_english'));
  assert.ok(isResolved(parker));

  const creeds = proposeEdition(row({ author: { name: 'Martin Bucer', death_year: 1551 }, source_attribution: 'From Philip Schaff, The Creeds of Christendom, Vol. III (New York: Harper & Brothers, 1877).' }));
  assert.equal(creeds.series_key, 'SCHAFF_CREEDS');
  assert.equal(creeds.volume, 3);

  const tcl = proposeEdition(row({ author: { name: 'Irenaeus of Lyons', death_year: 202 }, source_attribution: 'Translated by J. Armitage Robinson. Translations of Christian Literature, Series IV: Oriental Texts. London: SPCK, 1920.' }));
  assert.equal(tcl.series_key, 'TCL_SPCK');
  assert.equal(tcl.translator_display, 'J. Armitage Robinson');
  assert.equal(tcl.publisher, 'SPCK');
  assert.equal(tcl.publication_year, 1920);
});

test('Original English works are is_translation: false, by statement or by lifetime edition', () => {
  const wesley = proposeEdition(row({ author: { name: 'John Wesley', death_year: 1791 }, source_attribution: 'From The Sermons of John Wesley, Sermon 37.', translation_notes: 'Original English composition, not a translation.' }));
  assert.equal(wesley.is_translation, false);
  assert.equal(wesley.method.is_translation, 'pattern');
  const herbert = proposeEdition(row({ author: { name: 'George Herbert', death_year: 1633 }, source_attribution: 'A Priest to the Temple, written c. 1632.' }));
  assert.equal(herbert.is_translation, false);
  assert.equal(herbert.method.is_translation, 'inferred');
  assert.equal(herbert.confidence, 'medium');
});

test('A bare URL attribution is url_only', () => {
  const p = proposeEdition(row({ source_attribution: 'https://archive.org/details/memoirsremainsof00grey/page/5/mode/2up' }));
  assert.ok(p.reasons.includes('url_only'));
});

// ── Translator parsing ────────────────────────────────────────────────────────

test('readNames survives initials, joins, parentheticals and trailing clauses', () => {
  assert.deepEqual(readNames('S. Thelwall (ANF, Vol. III).').names, ['S. Thelwall']);
  assert.deepEqual(readNames('C.A. Heurtley (NPNF2 Vol. XI).').names, ['C.A. Heurtley']);
  assert.deepEqual(readNames('J. Armitage Robinson. Ante-Nicene Fathers, Vol. 9').names, ['J. Armitage Robinson']);
  assert.deepEqual(readNames('E.W. Watson and L. Pullan, NPNF Second Series Vol. 9').names, ['E.W. Watson', 'L. Pullan']);
  assert.deepEqual(readNames('Marcus Dods & George Reith (ANF).').names, ['Marcus Dods', 'George Reith']);
  assert.deepEqual(readNames('W.H. Fremantle, G. Lewis, and W.G. Martley. From Nicene').names, ['W.H. Fremantle', 'G. Lewis', 'W.G. Martley']);
  assert.deepEqual(readNames('W. H. Fremantle (with G. Lewis & W. G. Martley).').names, ['W. H. Fremantle', 'G. Lewis', 'W. G. Martley']);
  assert.deepEqual(readNames('Benjamin Thorpe, in Ancient Laws and Institutes').names, ['Benjamin Thorpe']);
  assert.deepEqual(readNames('Robert E. Smith (1994) for Project Wittenberg.').names, ['Robert E. Smith']);
  assert.deepEqual(readNames('H. de Romestin. From Nicene').names, ['H. de Romestin']);
  assert.deepEqual(readNames('Rev. John Henry Richards. Latin text').names, ['John Henry Richards']);
  assert.deepEqual(readNames('Dom Hugh Connolly, O.S.B., in').names, ['Hugh Connolly']);
  const etal = readNames('Philip Schaff et al. From Ante-Nicene');
  assert.deepEqual(etal.names, ['Philip Schaff']);
  assert.equal(etal.etAl, true);
});

test('findTranslators: forward and backward cues', () => {
  assert.deepEqual(findTranslators('Translated by Peter Holmes. From Ante-Nicene Fathers, Vol. 3.').names, ['Peter Holmes']);
  assert.deepEqual(findTranslators('Translated from the Latin by Sidney Norton Deane.').names, ['Sidney Norton Deane']);
  assert.deepEqual(findTranslators('The Great Didactic, trans. M. W. Keatinge (London: Adam and Charles Black, 1896)').names, ['M. W. Keatinge']);
  assert.deepEqual(findTranslators('Gifford translation, 1894. Edwin Hamilton Gifford (1820–1905).').names, ['Gifford']);
  assert.deepEqual(findTranslators('Melmoth/Bosanquet translation (revised), via Georgetown.').names, ['Melmoth', 'Bosanquet']);
  assert.deepEqual(findTranslators('Works of Martin Luther: Adolph Spaeth, L.D. Reed, Henry Eyster Jacobs, et al., Trans. & Eds. (Philadelphia: A. J. Holman Company, 1915)').names, ['Adolph Spaeth', 'L.D. Reed', 'Henry Eyster Jacobs']);
});

test('Alias map: Wallis, Roberts & Donaldson, Fremantle spacing', () => {
  assert.deepEqual(canonicaliseTranslators(['R. E. Wallis']).names, ['Robert Ernest Wallis']);
  assert.deepEqual(canonicaliseTranslators(['Roberts', 'Donaldson']).names, ['Alexander Roberts', 'James Donaldson']);
  assert.deepEqual(canonicaliseTranslators(['Roberts-Donaldson']).names, ['Alexander Roberts', 'James Donaldson']);
  assert.deepEqual(canonicaliseTranslators(['W. H. Fremantle']).names, ['W.H. Fremantle']);
});

test('findYears skips lifespans, death years, access dates and "pre-1900"', () => {
  const ys = findYears('J.G. Pilkington (1821–1870) translation, 1887. Author d. 430. Public domain (pre-1900). Accessed September 2026.');
  assert.deepEqual(ys.map(y => y.year), [1887]);
});

// ── Collections ───────────────────────────────────────────────────────────────

test('Collections: blank parts inherit from agreeing siblings; dissenters are collection_mixed', () => {
  const mk = (slug, sa) => ({ slug, collection_slug: 'c', proposal: proposeEdition(row({ slug, author: { name: 'Augustine of Hippo', death_year: 430 }, source_attribution: sa })) });
  const items = [
    mk('a', 'Translated by John Gibb and James Innes (NPNF, Series I, Vol. VII).'),
    mk('b', 'Translated by John Gibb and James Innes (NPNF, Series I, Vol. VII).'),
    mk('c', 'Translated by John Gibb (NPNF, Series I, Vol. VII).'),
    mk('d', 'From New Advent.'),
  ];
  const report = reconcileCollections(items);
  const d = items[3].proposal;
  assert.equal(d.series_key, 'NPNF1');
  assert.equal(d.method.series_key, 'inherited_from_collection');
  assert.equal(d.volume, 7);
  assert.ok(items[2].proposal.reasons.includes('collection_mixed'));
  assert.ok(!items[0].proposal.reasons.includes('collection_mixed'));
  assert.equal(report[0].mixed[0].field, 'translator_display');
});

// ── LLM guard ─────────────────────────────────────────────────────────────────

test('LLM fields are accepted only with verbatim evidence that contains the value', () => {
  const r = row({ provenance_notes: 'Benjamin Thorpe\'s 1844 translation (The Homilies of the Anglo-Saxon Church), which is public domain.' });
  const { accepted, rejected } = acceptLlmFields(r, {
    translator_display: { value: 'Benjamin Thorpe', evidence: "Benjamin Thorpe's 1844 translation" },
    publication_year: { value: 1844, evidence: "Benjamin Thorpe's 1844 translation" },
    publisher: { value: 'Ælfric Society', evidence: 'printed for the Ælfric Society' }, // not in the text
    place: { value: 'London', evidence: 'The Homilies of the Anglo-Saxon Church' }, // value not in evidence
  });
  assert.deepEqual(Object.keys(accepted).sort(), ['publication_year', 'translator_display']);
  assert.deepEqual(rejected.map(x => x.field).sort(), ['place', 'publisher']);
});

test('Pass 1 is deterministic', () => {
  const r = row({ source_attribution: 'Translated by Marcus Dods (NPNF, Series I, Vol. II).' });
  assert.deepEqual(proposeEdition(r), proposeEdition(r));
});

test('Sourced entries: values must appear in the verbatim citation; editor entries need a note', async () => {
  const { checkSourcedEntry } = await import('./edition-parse.mjs');
  const cite = 'Translated by William Wilson. From Ante-Nicene Fathers, Vol. 2. Edited by Alexander Roberts, James Donaldson, and A. Cleveland Coxe. (Buffalo, NY: Christian Literature Publishing Co., 1885.)';
  const { ok, refused } = checkSourcedEntry({
    basis: 'source', source_url: 'https://www.newadvent.org/fathers/02101.htm', citation: cite,
    fields: { translator_display: 'William Wilson', volume: 2, publication_year: 1885, publisher: 'Christian Literature Publishing Co.', place: 'London' },
  });
  assert.deepEqual(Object.keys(ok).sort(), ['publication_year', 'publisher', 'translator_display', 'volume']);
  assert.deepEqual(refused.map(r => r.field), ['place']);
  assert.equal(checkSourcedEntry({ basis: 'source', citation: cite, fields: { volume: 2 } }).refused.length, 1, 'no source_url');
  assert.equal(checkSourcedEntry({ basis: 'editor', fields: { volume: 4 } }).refused.length, 1, 'no note');
  assert.deepEqual(checkSourcedEntry({ basis: 'editor', note: 'confirmed', fields: { volume: 4 } }).ok, { volume: 4 });
});
