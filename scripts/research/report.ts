/**
 * Render the advisory report for the operator. Terminal-friendly. It surfaces the
 * verdict, the evidence, and a paste-ready `Translation notes` line — but never
 * decides anything. The final `Rights cleared` tick is always the human's.
 */

import type { ResearchResult } from './types';

export function renderReport(result: ResearchResult): string {
  const a = result.assessment;
  const badge = a.verdict === 'SAFE' ? '✅ SAFE' : '⛔ HOLD';
  const l: string[] = [];

  l.push(`# Provenance assessment — ${badge} (confidence: ${a.confidence})`);
  l.push('');
  l.push(`Source: ${result.url}`);
  l.push(
    `Host: ${result.host} — ${result.allowlisted ? 'on the Sourcer allowlist (directly pinnable)' : 'NOT on the Sourcer allowlist (find an allowlisted copy to pin)'}`,
  );
  l.push('');
  l.push(`Work:       ${a.work}`);
  l.push(`Author:     ${a.author}`);
  l.push(`Translator: ${a.translator ?? '—'}`);
  l.push(`Edition:    ${a.edition ?? '—'}`);
  l.push(`Publisher:  ${a.publisher ?? '—'}`);
  l.push(`Published:  ${a.publicationYear ?? '—'}${a.translatorDeathYear ? ` (translator d.${a.translatorDeathYear})` : ''}`);
  if (a.matchedEdition) l.push(`Matches:    ${a.matchedEdition}`);
  l.push('');
  if (a.distinctivePhrase) {
    l.push('Fingerprint phrase (verify this appears verbatim in the body):');
    l.push(`  “${a.distinctivePhrase}”`);
    l.push('');
  }
  l.push('Reasoning:');
  l.push(`  ${a.reasoning}`);
  l.push('');
  if (a.copyrightRisk) {
    l.push(`⚠ Copyright risk: ${a.copyrightRisk}`);
    l.push('');
  }
  l.push('Paste-ready Translation notes:');
  l.push(`  ${a.translationNotes}`);
  l.push('');
  l.push('---');
  if (a.verdict === 'SAFE') {
    l.push('This is ADVISORY. Confirm the fingerprint phrase yourself, then — if you agree —');
    l.push('pin the (allowlisted) edition and tick `Rights cleared`. The tick is yours to make.');
  } else {
    l.push('HOLD — do not clear this source. Set the prospect Status to `Rights unclear` and');
    l.push('record the reason above. Look for a confirmed pre-1929 public-domain edition instead.');
  }
  l.push('');
  return l.join('\n');
}
