/**
 * Tests for clearStagedBundle (the --refresh mechanism) — it removes exactly one
 * prospect's staged bundle, and refuses any slug that could escape staging.
 * Uses a throwaway temp repo root; no network.
 *
 * Run: npx tsx --test scripts/sourcer/staging.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { clearStagedBundle } from './staging';
import { STAGING_ROOT } from './config';

function tempRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sourcer-refresh-'));
}
function makeBundle(repo: string, slug: string): string {
  const dir = path.join(repo, STAGING_ROOT, slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'raw.txt'), 'book i');
  return dir;
}

test('clearStagedBundle removes exactly the named bundle', () => {
  const repo = tempRepo();
  const dir = makeBundle(repo, 'on-x-author');
  const other = makeBundle(repo, 'keep-me');
  assert.equal(clearStagedBundle(repo, 'on-x-author'), true);
  assert.equal(fs.existsSync(dir), false);
  assert.equal(fs.existsSync(other), true); // siblings untouched
  fs.rmSync(repo, { recursive: true, force: true });
});

test('clearStagedBundle returns false for a bundle that does not exist', () => {
  const repo = tempRepo();
  assert.equal(clearStagedBundle(repo, 'never-staged'), false);
  fs.rmSync(repo, { recursive: true, force: true });
});

test('clearStagedBundle refuses slugs that could escape staging', () => {
  const repo = tempRepo();
  // A sentinel outside staging that must never be deleted.
  const outside = path.join(repo, 'content', 'published');
  fs.mkdirSync(outside, { recursive: true });
  for (const bad of ['..', '../published', 'a/b', '/etc', '.', '']) {
    assert.equal(clearStagedBundle(repo, bad), false, bad);
  }
  assert.equal(fs.existsSync(outside), true);
  fs.rmSync(repo, { recursive: true, force: true });
});
