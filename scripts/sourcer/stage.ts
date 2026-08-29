/**
 * Bundle assembly — writes the editor-facing sidecars (provenance.yml,
 * metadata.yml, SOURCER.md) into content/staging/<slug>/ and reports which of
 * the six canonical files are present. raw.txt / body.md / ocr-report.md are
 * produced by the fetch and runner steps; this step completes the bundle and
 * writes nothing outside staging (writeStaged re-asserts the confinement).
 */

import { BUNDLE_FILES, SOURCER_VERSION, STAGING_ROOT } from './config';
import { renderProvenanceYaml } from './provenance';
import { renderMetadataYaml } from './metadata';
import { bundleDir, bundlePath, presentBundleFiles, writeStaged } from './staging';
import type {
  ClearanceRecord,
  ClearedProspect,
  DetectionSummary,
  ProposedMetadata,
  StagedBundle,
} from './types';

export interface StageInput {
  prospect: ClearedProspect;
  clearanceRecord: ClearanceRecord;
  fetchedAt: string;
  /** Every fetched part URL, in order (part 1 first). */
  resolvedUrls: string[];
  meta: ProposedMetadata;
  detection: DetectionSummary | null;
}

function renderSourcerMd(input: StageInput, present: string[]): string {
  const { prospect, meta, detection } = input;
  const l: string[] = [];
  l.push(`# Sourcer draft — ${prospect.title}`);
  l.push('');
  l.push(`- **Author:** ${prospect.author}`);
  l.push(`- **Slug:** \`${prospect.slug}\``);
  l.push(`- **Pinned edition:** ${input.clearanceRecord.clearedEditionUrl}`);
  l.push(
    `- **Fetched:** ${input.resolvedUrls[0] ?? '—'}` +
      (input.resolvedUrls.length > 1 ? ` (+${input.resolvedUrls.length - 1} more part(s))` : '') +
      ` (${input.fetchedAt})`,
  );
  l.push(`- **Prospect:** ${prospect.pageUrl}`);
  l.push(`- **Staged by:** ${SOURCER_VERSION}`);
  l.push('');
  l.push('This is a **draft bundle for review**. Nothing here is published or in the database.');
  l.push('The deterministic clean has been applied to `body.md`; every risky correction is left');
  l.push('un-applied in `ocr-report.md` for you to accept/reject.');
  l.push('');

  if (meta.flags.length) {
    l.push('## ⚑ Flags');
    l.push('');
    for (const f of meta.flags) l.push(`- ${f}`);
    l.push('');
  }

  l.push('## Proposed metadata (confirm before import)');
  l.push('');
  l.push(`- Genre: ${meta.genre ?? '_none proposed_'}`);
  l.push(`- Themes: ${meta.themes.length ? meta.themes.join(', ') : '_none proposed_'}`);
  l.push(`- OCR quality: ${meta.ocrQuality}`);
  l.push(`- Collection shape: **${meta.collection.shape}** — ${meta.collection.rationale}`);
  if (meta.collection.parts.length) {
    for (const p of meta.collection.parts) l.push(`  ${p.order}. ${p.title}${p.note ? ` — ${p.note}` : ''}`);
  }
  l.push('');

  if (detection) {
    l.push('## Detection summary (see `ocr-report.md`)');
    l.push('');
    l.push(`- Scanno flags: ${detection.scannoCount}`);
    l.push(`- Orphaned footnote markers: ${detection.footnoteOrphans}`);
    l.push(`- Suspect Greek runs: ${detection.greekFlags}`);
    l.push(`- Near-homographs to choose: ${detection.homographs}`);
    l.push('');
  }

  l.push('## Bundle files');
  l.push('');
  for (const f of Object.values(BUNDLE_FILES)) {
    l.push(`- ${present.includes(f) ? '☑' : '☐'} \`${f}\``);
  }
  l.push('');

  l.push('## Next steps (editor)');
  l.push('');
  l.push('1. Review `body.md` and edit `ocr-report.md`, then run');
  l.push(`   \`node scripts/detect-scannos.mjs --apply-reviewed=${STAGING_ROOT}/${prospect.slug}/${BUNDLE_FILES.ocrReport}\`.`);
  l.push('2. Confirm the proposed genre / themes / collection structure in `metadata.yml`.');
  if (meta.flags.some((f) => f.startsWith('author-missing')))
    l.push('3. Create the author record (admin Wikipedia lookup) before import — flagged above.');
  l.push('4. Move the reviewed text into the normal import path and publish from the admin UI.');
  l.push('');
  return l.join('\n');
}

/**
 * Write provenance.yml, metadata.yml, and SOURCER.md; return the bundle
 * descriptor with the present-file list and any flags. raw/body/report must
 * already exist from the fetch + runner steps.
 */
export function stageDraft(repoRoot: string, input: StageInput): StagedBundle {
  const { prospect } = input;

  writeStaged(
    repoRoot,
    bundlePath(repoRoot, prospect.slug, BUNDLE_FILES.provenance),
    renderProvenanceYaml(input.clearanceRecord, {
      fetchedAt: input.fetchedAt,
      fetchedUrls: input.resolvedUrls,
    }),
  );

  writeStaged(
    repoRoot,
    bundlePath(repoRoot, prospect.slug, BUNDLE_FILES.metadata),
    renderMetadataYaml(input.meta),
  );

  const present = presentBundleFiles(repoRoot, prospect.slug);
  // SOURCER.md is written last so its checklist reflects the other five files.
  writeStaged(
    repoRoot,
    bundlePath(repoRoot, prospect.slug, BUNDLE_FILES.summary),
    renderSourcerMd(input, [...present, BUNDLE_FILES.summary]),
  );

  return {
    slug: prospect.slug,
    dir: bundleDir(repoRoot, prospect.slug),
    files: presentBundleFiles(repoRoot, prospect.slug),
    flags: input.meta.flags,
  };
}
