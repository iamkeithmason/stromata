/**
 * Read-only corpus view. SELECT only — the Sourcer never writes Supabase. Builds
 * the dedupe sets (covered works + slugs) and the author lookup the entry gate
 * needs (author existence + death year for the copyright / author-missing check).
 *
 * Credentials: a dedicated READ-ONLY key is expected (SOURCER_SUPABASE_URL /
 * SOURCER_SUPABASE_KEY). The whole module only ever issues SELECTs; least
 * privilege belongs at the credential too. Grant a SELECT-only Postgres role,
 * NOT service_role.
 */

import { createClient } from '@supabase/supabase-js';
import { authorKey, dedupeKey } from './contract';
import type { CorpusAuthor, CorpusView } from './types';

const SUPABASE_URL = (process.env.SOURCER_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '')
  .trim()
  .replace(/\/+$/, '')
  .replace(/\/rest\/v1$/, '');
const SUPABASE_KEY = (
  process.env.SOURCER_SUPABASE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  ''
).trim();

interface AuthorRow {
  id: string;
  name: string;
  death_year: number | null;
}
interface TextRow {
  title: string;
  slug: string | null;
  author_id: string;
}
interface CollectionRow {
  slug: string | null;
}

export function hasCredentials(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

/**
 * Build the read-only corpus view. Reads authors + texts (+ collection slugs),
 * joined in JS (no PostgREST embeds, so it can't fail on FK-relationship
 * resolution). Every query is a SELECT.
 */
export async function buildCorpusView(): Promise<CorpusView> {
  if (!hasCredentials()) {
    throw new Error(
      'Supabase read credentials missing. Set SOURCER_SUPABASE_URL + SOURCER_SUPABASE_KEY ' +
        '(a read-only key), or NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
  });

  const [authorsRes, textsRes, collectionsRes] = await Promise.all([
    supabase.from('authors').select('id, name, death_year'),
    supabase.from('texts').select('title, slug, author_id'),
    supabase.from('collections').select('slug'),
  ]);

  for (const [label, res] of [
    ['authors', authorsRes],
    ['texts', textsRes],
    ['collections', collectionsRes],
  ] as const) {
    if (res.error) throw new Error(`Supabase ${label} read failed: ${res.error.message}`);
  }

  const authors = (authorsRes.data ?? []) as AuthorRow[];
  const texts = (textsRes.data ?? []) as TextRow[];
  const collections = (collectionsRes.data ?? []) as CollectionRow[];

  const authorNameById = new Map<string, string>();
  const authorsByKey = new Map<string, CorpusAuthor>();
  for (const a of authors) {
    authorNameById.set(a.id, a.name);
    if (a.name) authorsByKey.set(authorKey(a.name), { name: a.name, deathYear: a.death_year });
  }

  const coveredWorks = new Set<string>();
  const coveredSlugs = new Set<string>();
  for (const t of texts) {
    const name = authorNameById.get(t.author_id) ?? '';
    coveredWorks.add(dedupeKey(name, t.title));
    if (t.slug) coveredSlugs.add(t.slug.toLowerCase());
  }
  for (const c of collections) {
    if (c.slug) coveredSlugs.add(c.slug.toLowerCase());
  }

  return {
    coveredWorks,
    coveredSlugs,
    authorsByKey,
    totalTexts: texts.length,
  };
}
