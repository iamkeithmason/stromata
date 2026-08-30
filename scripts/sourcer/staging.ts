/**
 * Staging filesystem helpers — the ONLY tree the Sourcer writes into. Every
 * write goes through `writeStaged`, which re-asserts the content/staging/
 * confinement (defence in depth alongside the PreToolUse path hook). A write
 * that resolves anywhere else throws before touching the disk.
 */

import fs from 'fs';
import path from 'path';
import { BUNDLE_FILES, STAGING_ROOT } from './config';
import { isWithinStaging, stagingRootAbs } from './contract';

export function bundleDir(repoRoot: string, slug: string): string {
  return path.resolve(repoRoot, STAGING_ROOT, slug);
}

export function bundlePath(repoRoot: string, slug: string, filename: string): string {
  return path.join(bundleDir(repoRoot, slug), filename);
}

/** Assert a target path is within staging, or throw a discriminated error. */
export function assertWithinStaging(repoRoot: string, target: string): string {
  if (!isWithinStaging(repoRoot, target)) {
    throw new Error(
      `refused: write target "${target}" is outside the staging root ${stagingRootAbs(repoRoot)}`,
    );
  }
  return path.isAbsolute(target) ? path.resolve(target) : path.resolve(repoRoot, target);
}

/** Write a file into staging, creating parent dirs. Throws if outside staging. */
export function writeStaged(repoRoot: string, target: string, content: string): string {
  const abs = assertWithinStaging(repoRoot, target);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
  return abs;
}

export function readStaged(repoRoot: string, slug: string, filename: string): string | null {
  const p = bundlePath(repoRoot, slug, filename);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

export function bundleExists(repoRoot: string, slug: string): boolean {
  return fs.existsSync(bundleDir(repoRoot, slug));
}

/**
 * Remove a single prospect's staged bundle (`content/staging/<slug>/`), so a
 * corrected pin can be re-sourced without the immutable `raw.txt` / already-staged
 * guards blocking it. Guarded twice: the slug must be a safe single segment, and
 * the resolved directory must be within staging. Returns true iff it deleted a
 * directory. Never touches anything outside content/staging/.
 */
export function clearStagedBundle(repoRoot: string, slug: string): boolean {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(slug)) return false; // rejects slashes + traversal
  const dir = bundleDir(repoRoot, slug);
  if (!isWithinStaging(repoRoot, dir) || !fs.existsSync(dir)) return false;
  fs.rmSync(dir, { recursive: true, force: true });
  return true;
}

/** Which of the six canonical bundle files are present on disk. */
export function presentBundleFiles(repoRoot: string, slug: string): string[] {
  const dir = bundleDir(repoRoot, slug);
  if (!fs.existsSync(dir)) return [];
  return Object.values(BUNDLE_FILES).filter((f) => fs.existsSync(path.join(dir, f)));
}
