/**
 * archive-ocr-config.mjs
 * Configuration for clean-archive-ocr.mjs.
 */

// ---------------------------------------------------------------------------
// Footnote-marker stripping (see footnote-strip.mjs)
//
// The canonical marker set and the global on/off toggle live here. Any per-
// source config below may override them with its own `footnoteMarkers` array
// or `stripFootnoteMarkers: false`, exactly like the other per-source rules.
// ---------------------------------------------------------------------------

export const DEFAULT_FOOTNOTE_MARKERS = ['^', '*', '†', '‡', '§', '¶'];
export const STRIP_FOOTNOTE_MARKERS = true;

const ANSELM_PROSLOGION = {
  sourceFile: 'scripts/ingestion/sources/anselm-proslogium-1903.md',
  startLandmark: "ANSELM'S  PROSLOGIUM",
  endLandmark: "ANSELM'S  MONOLOGIUM",
  slug: 'anselm-proslogion',
  title: 'Proslogion',
  author: 'Anselm of Canterbury',
  genre: 'Meditation',
  sourceAttribution: 'Translated from the Latin by Sidney Norton Deane (Open Court Publishing, Chicago, 1903).',
  provenanceNotes: 'Text sourced from Archive.org scan of the 1903 Open Court edition. Proslogion only; all other works and editorial apparatus excluded. Accessed April 2026.',
  translationNotes: 'Sidney Norton Deane (1878-1943). Translation first published 1903 - public domain. No separate translation copyright applies.',
  editorialNotes: 'Chapters I-XXVI. The ontological argument appears in Chapters II-IV. Chapter heading summaries preserved in italics.',

  // Exact string replacements applied to raw text before any other cleaning
  manualCorrections: {
    // Chapter II opening - "understand-\] \ning" page-break artefact
    'understand-\\]\n ing  to  faith,': 'understanding to faith,',
    // Chapter VII
    'who  if.  thus  canablo': 'who is thus capable',
    // Chapter IX heading artefact
    'PROSL\\*GIUM': 'PROSLOGIUM',
    // Chapter XXVI
    'thy  Sen  :': 'thy Son:',
    // Chapter I - "bread" OCR'd as "read"
    'the  read  of  angels': 'the bread of angels',
    // Preface - spurious quote mark
    '"been  copied': 'been copied',
    // Preface - "its.elf  ajone"
    'jts.elf  ajone': 'itself alone',
    // "for their, existence" - stray comma
    'for  their,\nexistence': 'for their existence',
    // Monologium typo
    'Monologiuni': 'Monologium',
  },

  // Regex replacements for multi-line garbled passages
  // Each entry: [regexString, replacement, flags]
  regexCorrections: [
    // Chapter II garbled opening: "Anjd^ \ndeed..." through "does not understand it to exist."
    [
      'Anjd\\^ \\ndeed,[\\s\\S]+?does  not  understand  it  to  exist\\.',
      'And indeed, we believe that thou art a being than which nothing greater can be conceived. Or is there no such nature, since the fool hath said in his heart, there is no God? (Psalms xiv. 1). But, at any rate, this very fool, when he hears of this being of which I speak — a being than which nothing greater can be conceived — understands what he hears, and what he understands is in his understanding; although he does not understand it to exist.',
      's'
    ],
    // Chapter II garbled ontological argument core
    [
      "inthejin\\^.e\\.r\\^tajidjng,[\\s\\S]+?w\\^ncl\\^s\\^\\^greaten  '[\\\\\\*'•]+",
      'in the understanding, at least, than which nothing greater can be conceived. For, when he hears of this, he understands it. And whatever is understood, exists in the understanding. And assuredly that, than which nothing greater can be conceived, cannot exist in the understanding alone. For, suppose it exists in the understanding alone: then it can be conceived to exist in reality; which is greater.',
      's'
    ],
    // Chapter I end: garbled "I believe in order to understand"
    [
      'but\\),JWlnub\\^jieye  in  orderwtowJ1\\^\\^i£JC•J \\nstand\\.  For  this  also  I  believe, — that  unless  I  be-\\n\\n\\nleved,  1  should  not  understand\\.',
      'but I believe in order to understand. For this also I believe — that unless I believed, I should not understand.',
      's'
    ],
    // "unapiv^V\nproachable" scan border splitting "unapproachable"
    [
      'unapiv\\^V\\\\\\*\\s*\\nproachable',
      'unapproachable',
      's'
    ],
    // "writ" + page header + "ings." at preface page break → "writings."
    [
      'writ-?\\s*\\nPROSLOGIUM\\.\\s*\\n+ings\\.',
      'writings.',
      's'
    ],
    // "And thou too, O Lord, how long? How long, O %Jt\n Lord" artefact
    [
      'How  long,  O  %Jt\\s*\\nLord,',
      'How long, O Lord,',
      's'
    ],
    // ", H\n\nL" scan border artefact in preface
    [
      ',  \\\\\\*  H\\s*\\nL\\s*\\n',
      ' ',
      's'
    ],
    // "An Ex\nample" → "An Example"
    [
      'An  Ex\\s*\\nample',
      'An Example',
      's'
    ],
    // "j/->" inline artefact before words
    [
      'j/>\\s*',
      '',
      'g'
    ],
    // "\\] \n" artefact (scan bracket noise at line end)
    [
      '\\\\\\]\\s*\\n',
      '\n',
      'g'
    ],
  ],

  pageHeaderPatterns: [
    '^PROSLOGIUM\\.\\s*\\d+\\s*$',
    '^ANSELM\\.\\s*\\d+\\s*$',
    '^PROSLOGIUM\\.$',
    '^[\\*\\s]+$',
    '^iv\\^V[\\\\\\*]+$',
    '^[A-Z\\*\\^\\|]{1,3}$',
  ],

  keptHeadings: ['CHAPTER', 'PREFACE'],
};

const CHRYSOSTOM_ON_THE_PRIESTHOOD = {
  sourceFile: 'scripts/ingestion/sources/on-the-priesthood-chrysostom-raw.txt',
  startLandmark: 'TREATISE \n\nON THE PRIESTHOOD',
  endLandmark: 'AN EXHORTATION TO THEODORE',
  slug: 'on-the-priesthood-chrysostom',
  title: 'On the Priesthood',
  author: 'John Chrysostom',
  genre: 'Dialogue',
  sourceAttribution: 'Translated by W.R.W. Stephens (NPNF Series I, Vol. IX, Christian Literature Company, 1889).',
  provenanceNotes: 'Text sourced from Archive.org scan of NPNF Series I, Vol. IX (identifier: OnThePriesthood.AsceticTreatises.SelectHomiliesAndLetters.HomiliesOn). Accessed June 2026.',
  translationNotes: 'W.R.W. Stephens (1839–1902). Translation published 1889; copyright expired.',
  editorialNotes: 'Six books in dialogue form between Chrysostom and his friend Basil. Books I–VI included. The work was written c. 386 AD.',
  splitBy: 'book',
  manualCorrections: {
    'BOOKI': 'BOOK I',
    'BOOKII': 'BOOK II',
    'BOOKIII': 'BOOK III',
    'BOOKIV': 'BOOK IV',
    'BOOKV': 'BOOK V',
    'BOOKVI': 'BOOK VI',
  },
  regexCorrections: [],
  pageHeaderPatterns: [
    '^\\d+\\s*$',
    '^ON THE PRIESTHOOD\\.?\\s*\\d*\\s*$',
    '^CHRYSOSTOM\\.?\\s*\\d*\\s*$',
    '^[A-Z][A-Z\\s\\.]{0,40}\\s+\\d+\\s*$',
  ],
  keptHeadings: ['BOOK', 'CHAPTER', 'CONTENTS'],
};

const GREGORY_PASTORAL_RULE = {
  sourceFile: 'scripts/ingestion/sources/pastoral-rule-gregory-raw.txt',
  startLandmark: 'THE \n\nBOOK OF PASTORAL RULE',
  endLandmark: 'REGISTER OF THE EPISTLES OF SAINT',
  slug: 'pastoral-rule-gregory',
  title: 'Book of Pastoral Rule',
  author: 'Gregory the Great',
  genre: 'Rule',
  sourceAttribution: 'Translated by James Barmby (NPNF Series II, Vol. XII, Christian Literature Company, 1895).',
  provenanceNotes: 'Text sourced from Archive.org scan of NPNF Series II, Vol. XII (identifier: LeoTheGreat.GregoryTheGreat). Accessed June 2026.',
  translationNotes: 'James Barmby (1835–1887). Translation published 1895; copyright expired.',
  editorialNotes: 'Four parts: Part I (on the qualifications of the pastor), Part II (on the life of the pastor), Part III (on pastoral instruction — the longest section), Part IV (on humility after good works). Written by Gregory c. 590 AD.',
  splitBy: 'part',
  manualCorrections: {
    'PARTI': 'PART I',
    'PARTII': 'PART II',
    'PARTIII': 'PART III',
    'PARTIV': 'PART IV',
  },
  regexCorrections: [],
  pageHeaderPatterns: [
    '^\\d+\\s*$',
    '^BOOK OF PASTORAL RULE\\.?\\s*\\d*\\s*$',
    '^GREGORY\\.?\\s*\\d*\\s*$',
    '^[A-Z][A-Z\\s\\.]{0,40}\\s+\\d+\\s*$',
  ],
  keptHeadings: ['PART', 'CHAPTER', 'PREFACE', 'PROLOGUE'],
};

const JOHN_OF_DAMASCUS_EXPOSITION = {
  sourceFile: 'scripts/ingestion/sources/exposition-orthodox-faith-raw.txt',
  startLandmark: 'AN  EXACT  EXPOSITION',
  endLandmark: null,
  slug: 'exposition-orthodox-faith',
  title: 'Exposition of the Orthodox Faith',
  author: 'John of Damascus',
  genre: 'Treatise',
  sourceAttribution: 'Translated by S.D.F. Salmond (NPNF Series II, Vol. IX, Christian Literature Company, 1899).',
  provenanceNotes: 'Text sourced from Archive.org scan (identifier: AnExactExpositionOfTheOrthodoxFaith). Accessed June 2026.',
  translationNotes: 'S.D.F. Salmond (1838–1905). Translation published 1899; copyright expired.',
  editorialNotes: 'Four books covering theology proper, cosmology, anthropology, and eschatology. Written by John of Damascus c. 730 AD as the third part of his Fount of Knowledge.',
  splitBy: 'book',
  manualCorrections: {
    'Io  MAN  HATH  SEEN': 'No man hath seen',
  },
  regexCorrections: [
    ['BOOK\\s+ONE', 'BOOK I', 'g'],
    ['BOOK\\s+TWO', 'BOOK II', 'g'],
    ['BOOK\\s+THREE', 'BOOK III', 'g'],
    ['BOOK\\s+FOUR', 'BOOK IV', 'g'],
  ],
  pageHeaderPatterns: [
    '^\\d+\\s*$',
    '^EXPOSITION OF THE ORTHODOX FAITH\\.?\\s*\\d*\\s*$',
    '^JOHN OF DAMASCUS\\.?\\s*\\d*\\s*$',
    '^ORTHODOX\\s+(FAITH|TAITH)\\s*[:\\.]\\s*BOOK.+$',
    '^[A-Z][A-Z\\s\\.]{0,40}\\s+\\d+\\s*$',
  ],
  keptHeadings: ['BOOK', 'CHAPTER'],
};

/**
 * The first VERSE text to come through this pipeline, hence `verse: true` —
 * without it the cleaner's paragraph rejoin turns 1,900 lines of heroic
 * couplets into a wall of prose, and does it silently.
 *
 * The 1743 is the only public-domain English Psychomachia there is. Prudentius
 * (d. c.413) falls outside both ANF and NPNF, so the usual 19th-century route
 * does not exist; R. Martin Pope's 1905 volume is the Hymns only, and every
 * 20th-century edition (Thomson's Loeb, Eagan's Fathers of the Church) is in
 * copyright. Published 1743, so public domain on any test.
 *
 * It is a British Library eighteenth-century scan, which sets the cleanup:
 * the long s is on roughly half the lines, 18th-century printing puts a
 * CATCHWORD (the next page's first word) at the foot of every page, and the
 * OCR scatters marginalia and plate noise between stanzas.
 */
// Staged from the scan's _djvu.XML, not its _djvu.txt — see
// extract-djvu-xml.mjs. The .txt of this item merges couplets two to a line,
// orphans every run-over, splices page numbers into the middle of lines, and
// on several pages delivers the lines out of order. All of that is layout the
// XML still has and the .txt threw away.
const PRUDENTIUS_PSYCHOMACHIA = {
  xmlFile: 'scripts/ingestion/sources/psychomachia-prudentius-raw.xml',
  // Scan-image indices, inclusive. 0–1 are the board and title page; 2 opens
  // the translator's verse preface on Abraham; 73 is the rear endpaper.
  pages: [2, 72],
  slug: 'psychomachia-prudentius',
  title: 'Psychomachia: The War of the Soul',
  author: 'Prudentius',
  genre: 'Poem',
  verse: true,
  // Poem, not Hymn. Hymn was the vocabulary's only verse genre until
  // migration 028 added this one, and an allegorical epic in heroic couplets
  // filed as a hymn would have sat beside the Cathemerinon in every genre
  // listing and told the reader something false about what they were opening.
  // NOTE: run supabase/migrations/028_poem_genre.sql before importing, or
  // pipeline-import.mjs skips the text with "genre \"Poem\" not found".
  archiveId: 'bim_eighteenth-century_psychomachia-the-war-of_prudentius_1743',
  themes: ['spiritual-warfare', 'virtue', 'vice', 'humility', 'conscience'],
  // Honest rather than flattering. The arrangement is sound — every line is a
  // line, in order, with the furniture gone — but the letters inside them come
  // from a British Library microfilm scan, and the review file lists 59 places
  // where the scan appears to have dropped a line outright.
  ocrQuality: 'low',
  noteDraft:
    "Luxury arrives at the battlefield in a chariot, scattering violets and rose-petals at the Christian ranks, and very nearly wins — until Sobriety lifts the cross before the horses' eyes and the whole gaudy equipage goes over. Prudentius composed the Psychomachia around 400, and with it the personified Virtues and Vices that medieval Europe carved into a thousand porches and cathedral fronts. The allegory is stranger, and a great deal bloodier, than its reputation. This is the anonymous 1743 English version, which turns the Latin hexameters into heroic couplets and fights all seven combats at full length.",
  sourceAttribution:
    'Anonymous English verse translation, printed 1743 as "Psychomachia; the war of the soul: or, the battle of the virtues, and vices. Translated from Aur. Prudentius Clemens."',
  provenanceNotes:
    'Text sourced from the Archive.org scan of the 1743 London edition (identifier: bim_eighteenth-century_psychomachia-the-war-of_prudentius_1743). Accessed September 2026.',
  translationNotes:
    'Anonymous, published 1743 — public domain by publication date. No 19th-century public-domain English translation exists: Prudentius (c.348–c.413) appears in neither the Ante-Nicene nor the Nicene and Post-Nicene Fathers, R. Martin Pope\'s 1905 volume translates the Hymns only, and the modern editions (H. J. Thomson, Loeb; Sister M. Clement Eagan, Fathers of the Church) remain in copyright.',
  editorialNotes:
    'The founding allegory of the Christian inner life: seven single combats between personified Virtues and Vices, fought for possession of the soul. Its imagery shaped medieval art and literature for a thousand years. The 1743 renders it in heroic couplets — a real translation, close enough to track line by line, not the loose paraphrase it has sometimes been dismissed as.',
  // The printed section headings, each keyed to however the scanner mangled
  // it. Named one at a time rather than matched by a pattern: a heading is the
  // one place where a wrong reading silently restructures the whole text.
  headings: [
    ['PSTCHOMACHI', 'The War of the Soul'],
    // The printer set the title over two lines; the heading above now says
    // it in full, so the tail would only repeat it. null drops the line.
    ['WAR of the SOUL', null],
    ['COMBAT of FAITH', 'The Combat of Faith and Idolatry'],
    ['COMBAT of CHa8TITY', 'The Combat of Chastity and Lust'],
    ['TheConaTofPaTiBNGE', 'The Combat of Patience and Wrath'],
    ['COMBAT of PrIDE', 'The Combat of Pride and Humility'],
    ['Combat of LUXURY', 'The Combat of Luxury and Sobriety'],
    // The scan lost the second half of this heading — it breaks off at "Li-",
    // and the review file flags the gap. Completing a hyphenated heading from
    // its own first syllable is a different act from guessing at verse.
    ['Conpar 7 AVARICE', 'The Combat of Avarice and Liberality'],
    ['Combat of CONCORD', 'The Combat of Concord and Discord'],
  ],
  manualCorrections: {
    // The decorated drop-capital that opens each section is set as an outsize
    // initial the OCR reads as a stray mark or not at all. Restoring it is
    // mechanical — the word is unambiguous from its own tail.
    "AzRaM's Life we see a Plan": "In ABRAM's Life we see a Plan",
  },
  regexCorrections: [
    // The long s, where the scanner recognised it AS a long s. Roughly half
    // the lines carry one and every occurrence is a plain s, so this single
    // rule is the difference between readable and not.
    ['\u017f', 's', 'g'],
  ],

  // The long s where the scanner read it as an `f` instead — the same letter,
  // missed — plus the other misreadings. Each is named individually, because
  // the obvious shortcut does not work: you cannot decide these from the text
  // itself. Asking which f-words have an s-form elsewhere in the corpus
  // proposes `for`->`sor`, `fight`->`sight`, `fame`->`same` and
  // `before`->`besore`, because the scan ALSO misreads s as f, so both
  // spellings of everything are attested. The rule looks principled and is
  // confidently wrong. So: only words that are not English at all with the f,
  // and whose s-form the sense of the line confirms.
  wordFixes: {
    fide: 'side', whofe: 'whose', breaft: 'breast', luft: 'lust',
    ftrike: 'strike', miftress: 'mistress', noife: 'noise', hoft: 'host',
    despife: 'despise', "afsail'd": "assail'd", defigns: 'designs',
    defires: 'desires', infidious: 'insidious', fink: 'sink',
    fuccour: 'succour', fing: 'sing', fave: 'save', folid: 'solid',
    chriftian: 'christian', earneft: 'earnest', cafe: 'case', fubdue: 'subdue',
    domeffick: 'domestick', domeftick: 'domestick', myfick: 'mystick',
    unfruigful: 'unfruitful', inaftive: 'inactive', alfailing: 'assailing',
    ficly: 'fitly', fructure: 'structure', ftripling: 'stripling',
    meaneft: 'meanest', priefts: 'priests', prieftly: 'priestly',
    highpriefts: 'high priests', fince: 'since', deftitute: 'destitute',
    ffrutting: 'strutting', studioufly: 'studiously', datkfome: 'darksome',
    filence: 'silence', oppofite: 'opposite', attrafted: 'attracted',
    effeft: 'effect', senfible: 'sensible', flumber: 'slumber',
    "furnifh'd": "furnish'd", "furnist'd": "furnish'd", vifible: 'visible',
    ftrufture: 'structure', infinuating: 'insinuating', faftion: 'faction',
    "reafsum'd": "reassum'd", surmifings: 'surmisings', flaughter: 'slaughter',
    misjfve: 'missive', filken: 'silken', filver: 'silver',
    mifchief: 'mischief', guilgful: 'guileful', scofs: 'scoffs',
    vindiftive: 'vindictive', incellefiual: 'intellectual',
    oftentations: 'ostentatious', fmple: 'simple', fesus: 'Jesus',
    cracifed: 'crucified', fibver: 'silver', defild: "defil'd",

    // Not the long s — letters the scanner simply misread, each confirmed
    // against the sense and the rhyme of its own couplet.
    // Decorated drop-capitals the scanner missed. Restored only where the
    // surviving letters leave one possible word.
    'IRS T,': 'FIRST,', 'TEXT to the field': 'NEXT to the field',
    'HEN Ric came': 'WHEN Ric came', "a time's last period": "In time's last period",
    "proy'd": "prov'd", anpler: 'ampler', impatt: 'impart',
    'ty pify': 'typify', wbilst: 'whilst', "amarz'd": "amaz'd",
    '2yeen': 'queen', speQacle: 'spectacle', "trangress'd": "transgress'd",
    "say'd": "sav'd", ofthe: 'of the', ofa: 'of a', 'ot faith': 'of Faith', "paith's": "Faith's", lor: 'Lot',
    "sopow's": "Sodom's",
  },
};

export default {
  'anselm-proslogion': ANSELM_PROSLOGION,
  'prudentius-psychomachia': PRUDENTIUS_PSYCHOMACHIA,
  'chrysostom-on-the-priesthood': CHRYSOSTOM_ON_THE_PRIESTHOOD,
  'gregory-pastoral-rule': GREGORY_PASTORAL_RULE,
  'john-of-damascus-exposition': JOHN_OF_DAMASCUS_EXPOSITION,

  // Template for new entries:
  // 'new-text-key': {
  //   sourceFile: 'scripts/ingestion/sources/filename.md',
  //   startLandmark: 'EXACT STRING WHERE TEXT BEGINS',
  //   endLandmark: 'EXACT STRING WHERE NEXT WORK BEGINS',
  //   slug: 'author-short-title',
  //   title: 'Full Title',
  //   author: 'Author Name',
  //   genre: 'Treatise',
  //   sourceAttribution: 'Translated by X (Publisher, Year).',
  //   provenanceNotes: 'Text sourced from Archive.org scan of...',
  //   translationNotes: '',
  //   editorialNotes: '',
  //   manualCorrections: {},
  //   regexCorrections: [],
  //   pageHeaderPatterns: [],
  //   keptHeadings: ['CHAPTER', 'PREFACE'],
  // },
};
