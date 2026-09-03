// Server-side: read the Sourcer's staged review bundles (content/staging/<slug>/)
// for the read-only admin viewer. This module only ever reads — the Sourcer
// itself is the only writer of this tree, and nothing here mutates it.

import { promises as fs } from 'fs'
import path from 'path'
import { readQueue } from '@/lib/pipeline/queue'

export const STAGING_ROOT = path.join(process.cwd(), 'content', 'staging')

// The bundle files worth showing an editor. raw.txt (the immutable pre-clean
// capture) is deliberately excluded — it's the same source material as body.md
// with none of the cleanup, so it adds size without adding review value.
export const BUNDLE_FILES = ['SOURCER.md', 'metadata.yml', 'body.md', 'ocr-report.md', 'provenance.yml'] as const

export interface StagedBundleSummary {
  slug: string
  title: string
  author: string
  genre: string | null
  themes: string[]
  ocrQuality: string | null
  collectionShape: string | null
  flags: string[]
  stagedAt: string | null
  /**
   * Status of this bundle's entry in the pipeline queue (scripts/ingestion/prospect-queue.json),
   * keyed by slug — null until the bridge step (stage-to-output.mjs --write-queue) runs.
   */
  bridgeStatus: string | null
}

const SLUG_RE = /^[a-z0-9-]+$/

function scalar(yaml: string, key: string): string | null {
  const m = yaml.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'));
  if (!m) return null;
  const v = m[1].trim();
  if (v === '' || v === 'null') return null;
  return v.replace(/^"(.*)"$/, '$1');
}

function blockList(yaml: string, key: string): string[] {
  const m = yaml.match(new RegExp(`^${key}:\\s*\\n((?:\\s+-.*\\n?)*)`, 'm'));
  if (!m) return [];
  return m[1]
    .split('\n')
    .map(l => l.replace(/^\s*-\s*/, '').trim())
    .filter(Boolean)
    .map(v => v.replace(/^"(.*)"$/, '$1'));
}

/** Minimal reader for the flat/list shape `renderMetadataYaml` (scripts/sourcer/metadata.ts) emits. */
export function parseStagedMetadata(yaml: string): Omit<StagedBundleSummary, 'stagedAt' | 'bridgeStatus'> {
  const collectionBlock = yaml.match(/^proposed_collection:\s*\n([\s\S]*?)(?=\n\S|\n*$)/m)?.[1] ?? '';
  return {
    slug: scalar(yaml, 'slug') ?? '',
    title: scalar(yaml, 'title') ?? '',
    author: scalar(yaml, 'author') ?? '',
    genre: scalar(yaml, 'proposed_genre'),
    themes: blockList(yaml, 'proposed_themes'),
    ocrQuality: scalar(yaml, 'proposed_ocr_quality'),
    collectionShape: collectionBlock.match(/^\s*shape:\s*(.*)$/m)?.[1]?.trim() ?? null,
    flags: blockList(yaml, 'flags'),
  };
}

/** List every staged bundle's summary, for the admin overview list. */
export async function listStagedBundles(): Promise<StagedBundleSummary[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(STAGING_ROOT);
  } catch {
    return [];
  }

  // Cross-reference the pipeline queue so a bridged/imported bundle shows its
  // real progress instead of always looking un-actioned.
  const bridgeStatusBySlug = new Map<string, string>();
  try {
    const queue = await readQueue();
    for (const p of queue.prospects) {
      const key = p.collection_slug || p.id;
      if (key) bridgeStatusBySlug.set(key, p.status);
    }
  } catch {
    /* queue unreadable — leave every bridgeStatus null */
  }

  const bundles = await Promise.all(
    entries.filter(e => SLUG_RE.test(e)).map(async (slug): Promise<StagedBundleSummary | null> => {
      const dir = path.join(STAGING_ROOT, slug);
      try {
        const stat = await fs.stat(dir);
        if (!stat.isDirectory()) return null;
        const metaPath = path.join(dir, 'metadata.yml');
        const [yaml, metaStat] = await Promise.all([fs.readFile(metaPath, 'utf8'), fs.stat(metaPath)]);
        return {
          ...parseStagedMetadata(yaml),
          slug,
          stagedAt: metaStat.mtime.toISOString(),
          bridgeStatus: bridgeStatusBySlug.get(slug) ?? null,
        };
      } catch {
        return null; // an in-progress or malformed bundle — skip rather than crash the page
      }
    })
  );

  return bundles
    .filter((b): b is StagedBundleSummary => b !== null)
    .sort((a, b) => (b.stagedAt ?? '').localeCompare(a.stagedAt ?? ''));
}

/** Read the reviewable files of one staged bundle, path-confined to STAGING_ROOT/<slug>. */
export async function readBundleFiles(slug: string): Promise<{ name: string; content: string }[]> {
  if (!SLUG_RE.test(slug)) throw new Error('Invalid slug.');
  const dir = path.resolve(STAGING_ROOT, slug);
  if (dir !== path.join(STAGING_ROOT, slug)) throw new Error('Path escapes the staging directory.');

  const files: { name: string; content: string }[] = [];
  for (const name of BUNDLE_FILES) {
    try {
      files.push({ name, content: await fs.readFile(path.join(dir, name), 'utf8') });
    } catch {
      /* file not present in this bundle — skip it */
    }
  }
  return files;
}
