/**
 * The provenance sidecar — provenance.yml, written by COPYING the editor's
 * clearance record VERBATIM. The Sourcer synthesises nothing here; it transcribes
 * the human clearance and stamps a literal line saying exactly that. Copyright
 * and translation-rights judgement remain the editor's — this file is a record,
 * not a decision.
 */

import { PROVENANCE_STAMP, SOURCER_VERSION } from './config';
import { yamlEntry, yamlList } from './yaml';
import type { ClearanceRecord } from './types';

export interface ProvenanceContext {
  fetchedAt: string; // ISO timestamp
  fetchedUrls: string[]; // every actual URL fetched, in order (djvu-preferred)
}

/** Render provenance.yml from a clearance record. Values are the editor's, verbatim. */
export function renderProvenanceYaml(record: ClearanceRecord, ctx: ProvenanceContext): string {
  const lines = [
    '# provenance.yml — copied verbatim from the human clearance record.',
    `# ${PROVENANCE_STAMP}`,
    '',
    yamlEntry('cleared_edition_url', record.clearedEditionUrl),
    yamlEntry('fetched_url', ctx.fetchedUrls[0] ?? ''),
    ...(ctx.fetchedUrls.length > 1 ? [yamlList('fetched_parts', ctx.fetchedUrls)] : []),
    yamlEntry('translator', record.translator),
    yamlEntry('edition_year', record.editionYear),
    yamlEntry('publication_year', record.publicationYear),
    yamlEntry('pd_basis', record.pdBasis),
    yamlEntry('ocr_source', record.ocrSource),
    yamlEntry('fetched_at', ctx.fetchedAt),
    yamlEntry('sourcer_version', SOURCER_VERSION),
    yamlEntry('provenance_note', PROVENANCE_STAMP),
    '',
  ];
  return lines.join('\n');
}
