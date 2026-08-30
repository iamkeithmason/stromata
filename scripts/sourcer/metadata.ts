/**
 * The proposed metadata stub — metadata.yml. EVERYTHING here is marked
 * `proposed:` and requires the editor's confirmation; nothing is applied. The
 * agent reasons the genre, theme candidates, and collection-structure proposal;
 * this module validates them against the controlled vocabularies (invalid values
 * are dropped, themes capped at 6) and renders the sidecar.
 *
 * Tradition/Era are deliberately absent — they are author-level and edited on the
 * prospect, not here.
 */

import { MAX_THEMES, isGenre, isThemeSlug } from './vocab';
import { yamlEntry, yamlList, yamlScalar } from './yaml';
import type { CollectionProposal, OcrQuality, ProposedMetadata } from './types';

export interface MetadataBase {
  slug: string;
  title: string;
  author: string;
  ocrQuality: OcrQuality;
  flags: string[];
}

/** Raw, agent-proposed metadata (validated below before it becomes a bundle). */
export interface AgentMetadataProposal {
  genre?: string | null;
  themes?: string[];
  collection?: {
    shape?: string;
    rationale?: string;
    parts?: Array<{ order?: number; title?: string; note?: string }>;
  };
}

const COLLECTION_SHAPES = new Set(['single', 'collection', 'excerpt']);

function sanitizeCollection(raw: AgentMetadataProposal['collection']): CollectionProposal {
  const shape = raw?.shape && COLLECTION_SHAPES.has(raw.shape) ? (raw.shape as CollectionProposal['shape']) : 'single';
  const rationale = (raw?.rationale ?? '').trim() || 'Not assessed — defaulting to a single text.';
  const parts = Array.isArray(raw?.parts)
    ? raw.parts
        .map((p, i) => ({
          order: Number.isFinite(p?.order) ? Number(p.order) : i + 1,
          title: (p?.title ?? '').trim(),
          note: (p?.note ?? '').trim() || undefined,
        }))
        .filter((p) => p.title !== '')
        .sort((a, b) => a.order - b.order)
    : [];
  // A 'single' proposal never carries parts.
  return { shape, rationale, parts: shape === 'single' ? [] : parts };
}

/** Validate + normalise an agent proposal into a ProposedMetadata. */
export function validateProposedMetadata(
  raw: AgentMetadataProposal,
  base: MetadataBase,
): ProposedMetadata {
  const genre = raw.genre && isGenre(raw.genre) ? raw.genre : null;

  const seen = new Set<string>();
  const themes: string[] = [];
  for (const t of raw.themes ?? []) {
    const slug = String(t).trim().toLowerCase();
    if (isThemeSlug(slug) && !seen.has(slug)) {
      seen.add(slug);
      themes.push(slug);
      if (themes.length >= MAX_THEMES) break;
    }
  }

  return {
    slug: base.slug,
    title: base.title,
    author: base.author,
    genre,
    themes,
    ocrQuality: base.ocrQuality,
    collection: sanitizeCollection(raw.collection),
    flags: base.flags,
  };
}

/** Render metadata.yml. Everything is under a `proposed:` framing. */
export function renderMetadataYaml(meta: ProposedMetadata): string {
  const lines: string[] = [
    '# metadata.yml — PROPOSED. Every value below requires editorial confirmation',
    '# before import. The Sourcer proposes; nothing here has been applied.',
    '# (Tradition / Era are author-level — edit them on the prospect, not here.)',
    '',
    yamlEntry('slug', meta.slug),
    yamlEntry('title', meta.title),
    yamlEntry('author', meta.author),
    '',
    yamlEntry('proposed_genre', meta.genre),
    yamlList('proposed_themes', meta.themes),
    yamlEntry('proposed_ocr_quality', meta.ocrQuality),
    '',
    'proposed_collection:',
    `  shape: ${yamlScalar(meta.collection.shape)}`,
    `  rationale: ${yamlScalar(meta.collection.rationale)}`,
  ];

  if (meta.collection.parts.length === 0) {
    lines.push('  parts: []');
  } else {
    lines.push('  parts:');
    for (const p of meta.collection.parts) {
      lines.push(`    - order: ${p.order}`);
      lines.push(`      title: ${yamlScalar(p.title)}`);
      if (p.note) lines.push(`      note: ${yamlScalar(p.note)}`);
    }
  }

  lines.push('');
  lines.push(yamlList('flags', meta.flags));
  lines.push('');
  return lines.join('\n');
}
