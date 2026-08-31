/**
 * OSIS book id → human-readable display name.
 *
 * The parser (bible-passage-reference-parser) emits OSIS ids like "1Cor" or
 * "Sir"; the UI wants "1 Corinthians" / "Sirach". Covers the 66-book
 * Protestant canon plus the apocryphal / deuterocanonical books the Fathers
 * cite frequently. Anything not listed falls back to a readable form derived
 * from the OSIS id, so an unmapped book never surfaces as a raw id.
 */
const OSIS_DISPLAY_NAMES: Record<string, string> = {
  // Torah
  Gen: 'Genesis', Exod: 'Exodus', Lev: 'Leviticus', Num: 'Numbers', Deut: 'Deuteronomy',
  // History
  Josh: 'Joshua', Judg: 'Judges', Ruth: 'Ruth',
  '1Sam': '1 Samuel', '2Sam': '2 Samuel', '1Kgs': '1 Kings', '2Kgs': '2 Kings',
  '1Chr': '1 Chronicles', '2Chr': '2 Chronicles',
  Ezra: 'Ezra', Neh: 'Nehemiah', Esth: 'Esther',
  // Wisdom & poetry
  Job: 'Job', Ps: 'Psalms', Prov: 'Proverbs', Eccl: 'Ecclesiastes', Song: 'Song of Songs',
  // Major prophets
  Isa: 'Isaiah', Jer: 'Jeremiah', Lam: 'Lamentations', Ezek: 'Ezekiel', Dan: 'Daniel',
  // Minor prophets
  Hos: 'Hosea', Joel: 'Joel', Amos: 'Amos', Obad: 'Obadiah', Jonah: 'Jonah', Mic: 'Micah',
  Nah: 'Nahum', Hab: 'Habakkuk', Zeph: 'Zephaniah', Hag: 'Haggai', Zech: 'Zechariah', Mal: 'Malachi',
  // Gospels & Acts
  Matt: 'Matthew', Mark: 'Mark', Luke: 'Luke', John: 'John', Acts: 'Acts',
  // Pauline epistles
  Rom: 'Romans', '1Cor': '1 Corinthians', '2Cor': '2 Corinthians', Gal: 'Galatians',
  Eph: 'Ephesians', Phil: 'Philippians', Col: 'Colossians',
  '1Thess': '1 Thessalonians', '2Thess': '2 Thessalonians',
  '1Tim': '1 Timothy', '2Tim': '2 Timothy', Titus: 'Titus', Phlm: 'Philemon',
  // General epistles & Revelation
  Heb: 'Hebrews', Jas: 'James', '1Pet': '1 Peter', '2Pet': '2 Peter',
  '1John': '1 John', '2John': '2 John', '3John': '3 John', Jude: 'Jude', Rev: 'Revelation',
  // Apocrypha / deuterocanon
  Tob: 'Tobit', Jdt: 'Judith', Wis: 'Wisdom of Solomon', Sir: 'Sirach', Bar: 'Baruch',
  '1Macc': '1 Maccabees', '2Macc': '2 Maccabees', '3Macc': '3 Maccabees', '4Macc': '4 Maccabees',
  '1Esd': '1 Esdras', '2Esd': '2 Esdras', PrMan: 'Prayer of Manasseh',
  Sus: 'Susanna', Bel: 'Bel and the Dragon', EpJer: 'Letter of Jeremiah',
  PrAzar: 'Prayer of Azariah', SgThree: 'Song of the Three Young Men',
  AddEsth: 'Additions to Esther', Ps151: 'Psalm 151',
}

/**
 * Fallback for an OSIS id not in the table: split a leading number off and
 * space out internal capitals ("2Xyz" → "2 Xyz"), so the result is at least
 * readable rather than a bare id.
 */
function fallbackName(osis: string): string {
  return osis
    .replace(/^([1-4])(?=[A-Za-z])/, '$1 ')   // "1Cor" → "1 Cor"
    .replace(/([a-z])([A-Z])/g, '$1 $2')       // "AddEsth" → "Add Esth"
}

export function displayBookName(osis: string): string {
  return OSIS_DISPLAY_NAMES[osis] ?? fallbackName(osis)
}
