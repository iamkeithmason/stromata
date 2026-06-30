/**
 * archive-ocr-config.mjs
 * Configuration for clean-archive-ocr.mjs.
 */

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

export default {
  'anselm-proslogion': ANSELM_PROSLOGION,
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
