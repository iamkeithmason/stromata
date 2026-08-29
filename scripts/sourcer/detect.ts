/**
 * The detection pass — the separation principle in code. It DETECTS the risky,
 * probabilistic OCR classes and emits a tiered, editor-editable report; it
 * NEVER changes the text. Detection and correction stay in separate passes, and
 * only detection runs here.
 *
 *   - character-substitution scannos → detect-scannos.mjs (corpus-frequency),
 *     formatted so the editor can accept/reject/edit per item and feed the
 *     existing `detect-scannos --apply-reviewed` round-trip.
 *   - orphaned footnote markers surviving the deterministic strip → listed.
 *   - garbled polytonic Greek → listed.
 *   - theologically-loaded near-homographs → ALTERNATIVES offered with the
 *     stakes noted (e.g. ἀγένητος vs ἀγέννητος), proposed, never applied.
 *
 * OCR-quality (`high|medium|low`) is estimated deterministically from artefact
 * density.
 */

import { STAGING_ROOT, BUNDLE_FILES } from './config';
import {
  detectScannos,
  formatScannoReport,
  type CorpusIndex,
  type ScannoFlag,
} from './pipeline-adapters';
import type {
  DetectionResult,
  FootnoteOrphan,
  GreekFlag,
  HomographChoice,
  OcrQuality,
} from './types';

const SUPERSCRIPT_DIGITS = '¹²³⁰⁴⁵⁶⁷⁸⁹';
const GREEK_RE = /[Ͱ-Ͽἀ-῿]/;

/** Theologically-loaded near-homographs. Alternatives are OFFERED, never applied. */
const HOMOGRAPH_PAIRS: Array<{ forms: string[]; stakes: string }> = [
  {
    forms: ['ἀγένητος', 'ἀγέννητος'],
    stakes:
      'ἀγένητος (ingenerate/uncreated) vs ἀγέννητος (unbegotten) — the double-ν turns on the ' +
      'Nicene/Arian distinction; the editor must confirm which the source prints.',
  },
  {
    forms: ['ὁμοούσιος', 'ὁμοιούσιος'],
    stakes:
      'ὁμοούσιος (consubstantial) vs ὁμοιούσιος (of like substance) — the iota is the whole ' +
      'homoousian controversy; do not normalise one to the other.',
  },
  {
    forms: ['γενητός', 'γεννητός'],
    stakes: 'γενητός (originate/created) vs γεννητός (begotten) — a christological distinction.',
  },
];

// ---------------------------------------------------------------------------
// Individual detectors (pure).
// ---------------------------------------------------------------------------

/** Superscript digits or bracketed numeric markers that survived the strip. */
export function detectFootnoteOrphans(body: string): FootnoteOrphan[] {
  const orphans: FootnoteOrphan[] = [];
  const lines = body.split('\n');
  const supRe = new RegExp(`[${SUPERSCRIPT_DIGITS}]`);
  const bracketRe = /\[\^?\d{1,3}\]/;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const sup = line.match(supRe);
    const br = line.match(bracketRe);
    const hit = sup ?? br;
    if (hit) {
      orphans.push({
        line: i + 1,
        marker: hit[0],
        context: line.trim().slice(0, 120),
      });
    }
  }
  return orphans;
}

/**
 * Suspect polytonic Greek: a Greek-bearing run that also carries a Unicode
 * replacement char, a standalone combining mark, or Latin letters mixed into a
 * Greek word (all classic OCR damage). Reported, never reconstructed.
 */
export function detectGreek(body: string): GreekFlag[] {
  const flags: GreekFlag[] = [];
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!GREEK_RE.test(line)) continue;
    let note = '';
    if (line.includes('�')) note = 'contains a Unicode replacement character (lost glyph)';
    else if (/[Ͱ-Ͽἀ-῿][A-Za-z]|[A-Za-z][Ͱ-Ͽἀ-῿]/.test(line))
      note = 'Latin letters fused into a Greek word (OCR mix)';
    else if (/[̀-ͯ]{2,}/.test(line)) note = 'stacked combining diacritics';
    if (note) {
      flags.push({ line: i + 1, text: line.trim().slice(0, 120), note });
    }
  }
  return flags;
}

/** Presence of a known theological near-homograph → offer the alternative. */
export function detectHomographs(body: string): HomographChoice[] {
  const out: HomographChoice[] = [];
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    for (const pair of HOMOGRAPH_PAIRS) {
      const present = pair.forms.find((f) => lines[i].includes(f));
      if (present) {
        out.push({
          line: i + 1,
          word: present,
          alternatives: pair.forms.filter((f) => f !== present),
          stakes: pair.stakes,
        });
      }
    }
  }
  return out;
}

function wordCount(body: string): number {
  const m = body.match(/[\p{L}\p{N}]+/gu);
  return m ? m.length : 0;
}

/** Estimate OCR quality from artefact density (scannos + orphans per word). */
export function estimateOcrQuality(
  scannoCount: number,
  orphanCount: number,
  words: number,
): { quality: OcrQuality; density: number } {
  if (words === 0) return { quality: 'medium', density: 0 };
  const density = (scannoCount + orphanCount) / words;
  let quality: OcrQuality;
  if (density < 0.004) quality = 'high';
  else if (density < 0.02) quality = 'medium';
  else quality = 'low';
  return { quality, density };
}

// ---------------------------------------------------------------------------
// The full detection pass.
// ---------------------------------------------------------------------------

export async function runDetection(
  body: string,
  slug: string,
  opts: { corpus: CorpusIndex | null; allowlist: Set<string> },
): Promise<DetectionResult> {
  const bodyRelPath = `${STAGING_ROOT}/${slug}/${BUNDLE_FILES.body}`;

  let scannoReport = '';
  let scannoCount = 0;
  if (opts.corpus) {
    const flags: ScannoFlag[] = (await detectScannos(body, { corpus: opts.corpus, allowlist: opts.allowlist, slug })).map(
      (f) => ({ ...f, file: bodyRelPath }),
    );
    scannoCount = flags.length;
    scannoReport = await formatScannoReport(flags, { corpus: opts.corpus, minTier: 3 });
  } else {
    scannoReport =
      '# (No corpus-frequency index found — scanno detection skipped.\n' +
      '#  Build it with: node scripts/build-corpus-index.mjs, then re-run the Sourcer.)\n';
  }

  const footnoteOrphans = detectFootnoteOrphans(body);
  const greekFlags = detectGreek(body);
  const homographs = detectHomographs(body);
  const { quality, density } = estimateOcrQuality(scannoCount, footnoteOrphans.length, wordCount(body));

  return {
    slug,
    scannoReport,
    scannoCount,
    footnoteOrphans,
    greekFlags,
    homographs,
    ocrQuality: quality,
    artefactDensity: density,
  };
}

// ---------------------------------------------------------------------------
// Report rendering — apply-reviewed compatible scanno rows + advisory sections.
// ---------------------------------------------------------------------------

/**
 * Render ocr-report.md. The scanno section is the raw detect-scannos report
 * (its `skip | file | line | …` rows feed `detect-scannos --apply-reviewed`).
 * The advisory sections use bullet lists (no 7-pipe rows) so they are ignored by
 * the apply parser — they are detected-not-corrected findings for the editor.
 */
export function renderOcrReport(result: DetectionResult): string {
  const lines: string[] = [];
  lines.push(`# OCR review report — ${result.slug}`);
  lines.push('');
  lines.push('Detection only — the Sourcer changed nothing below. Each class is a proposal for');
  lines.push('you to accept, reject, or edit. Nothing here has been applied to body.md.');
  lines.push('');
  lines.push(
    `Estimated OCR quality: **${result.ocrQuality}** (artefact density ${result.artefactDensity.toFixed(4)}).`,
  );
  lines.push('');

  lines.push('## 1. Character-substitution scannos (apply-reviewed compatible)');
  lines.push('');
  lines.push('Edit a row\'s ACTION to `fix` / `allow`, then run:');
  lines.push('`node scripts/detect-scannos.mjs --apply-reviewed=content/staging/' + result.slug + '/ocr-report.md`');
  lines.push('');
  lines.push('```');
  lines.push(result.scannoReport.trimEnd());
  lines.push('```');
  lines.push('');

  lines.push('## 2. Orphaned footnote markers (advisory — not auto-removed)');
  lines.push('');
  if (result.footnoteOrphans.length === 0) {
    lines.push('_None surviving the deterministic strip._');
  } else {
    for (const o of result.footnoteOrphans) {
      lines.push(`- line ${o.line}: \`${o.marker}\` — ${o.context}`);
    }
  }
  lines.push('');

  lines.push('## 3. Garbled polytonic Greek (advisory — reconstruct by hand)');
  lines.push('');
  if (result.greekFlags.length === 0) {
    lines.push('_No suspect Greek runs detected._');
  } else {
    for (const g of result.greekFlags) {
      lines.push(`- line ${g.line}: ${g.note} — \`${g.text}\``);
    }
  }
  lines.push('');

  lines.push('## 4. Near-homographs (choose — alternatives offered, never applied)');
  lines.push('');
  if (result.homographs.length === 0) {
    lines.push('_No known theological near-homographs present._');
  } else {
    for (const h of result.homographs) {
      lines.push(`- line ${h.line}: \`${h.word}\` — alternative(s): ${h.alternatives.map((a) => '`' + a + '`').join(', ')}`);
      lines.push(`  - ${h.stakes}`);
    }
  }
  lines.push('');

  return lines.join('\n');
}
