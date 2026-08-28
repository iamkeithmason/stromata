/**
 * Read-only corpus coverage map. SELECT only — the Scout never writes to
 * Supabase. Builds published-text counts per tradition × era, plus the sets of
 * already-covered authors and works used for dedupe.
 *
 * Credentials: prefers a dedicated read-only key (SCOUT_SUPABASE_URL /
 * SCOUT_SUPABASE_KEY); falls back to the project's public URL + anon key. Grant
 * the CI secret a read-only role — this module only ever issues SELECTs, but
 * least privilege belongs at the credential too.
 */

import { createClient } from '@supabase/supabase-js';
import { BAND_WEIGHT, ERAS, TRADITIONS } from './config';
import type { CoverageMap, CoverageCell } from './types';
import { dedupeKey } from './contract';

const SUPABASE_URL = process.env.SCOUT_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY =
  process.env.SCOUT_SUPABASE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  '';

/** Canonicalise a Supabase tradition name to the Notion vocabulary. */
function canonicalTradition(name: string | null | undefined): string | null {
  if (!name) return null;
  const t = TRADITIONS.find((x) => x.canonical === name || x.aliases.includes(name));
  return t ? t.canonical : name;
}

/** Canonicalise a Supabase era label to the Notion vocabulary. */
function canonicalEra(label: string | null | undefined): string | null {
  if (!label) return null;
  const e = ERAS.find((x) => x.canonical === label || x.aliases.includes(label));
  return e ? e.canonical : label;
}

function traditionBandWeight(canonical: string): number {
  const t = TRADITIONS.find((x) => x.canonical === canonical);
  return t ? BAND_WEIGHT[t.band] : BAND_WEIGHT.low;
}

interface AuthorRow {
  id: string;
  name: string;
  death_year: number | null;
  tradition: { name: string } | { name: string }[] | null;
  era: { label: string } | { label: string }[] | null;
}

interface TextRow {
  title: string;
  published: boolean;
  author_id: string;
}

/** Supabase embeds can type as object or single-element array; normalise. */
function one<T>(rel: T | T[] | null): T | null {
  if (Array.isArray(rel)) return rel[0] ?? null;
  return rel ?? null;
}

export async function buildCoverageMap(): Promise<CoverageMap> {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error(
      'Supabase credentials missing. Set SCOUT_SUPABASE_URL + SCOUT_SUPABASE_KEY ' +
        '(or NEXT_PUBLIC_SUPABASE_URL + a read key).',
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
  });

  const { data: authorsRaw, error: authorsErr } = await supabase
    .from('authors')
    .select('id, name, death_year, tradition:traditions(name), era:eras(label)');
  if (authorsErr) throw new Error(`Supabase authors read failed: ${authorsErr.message}`);

  const { data: textsRaw, error: textsErr } = await supabase
    .from('texts')
    .select('title, published, author_id');
  if (textsErr) throw new Error(`Supabase texts read failed: ${textsErr.message}`);

  const authors = (authorsRaw ?? []) as AuthorRow[];
  const texts = (textsRaw ?? []) as TextRow[];

  const authorById = new Map<string, AuthorRow>();
  const coveredAuthors = new Set<string>();
  for (const a of authors) {
    authorById.set(a.id, a);
    if (a.name) coveredAuthors.add(a.name);
  }

  const cells: Record<string, CoverageCell> = {};
  const coveredWorks = new Set<string>();
  let totalPublished = 0;

  for (const text of texts) {
    const author = authorById.get(text.author_id);
    const authorName = author?.name ?? '';
    coveredWorks.add(dedupeKey(authorName, text.title));

    if (!text.published) continue;
    totalPublished += 1;

    const tradition = canonicalTradition(one(author?.tradition ?? null)?.name);
    const era = canonicalEra(one(author?.era ?? null)?.label);
    if (!tradition || !era) continue;

    const key = `${tradition} :: ${era}`;
    if (!cells[key]) cells[key] = { tradition, era, publishedTexts: 0 };
    cells[key].publishedTexts += 1;
  }

  // Precompute under-filled high-priority cells for the prompt: every
  // tradition × era intersection with <2 published texts, weighted by the
  // tradition's priority band + the medieval bonus, best gap first.
  const gaps: CoverageMap['gaps'] = [];
  for (const t of TRADITIONS) {
    for (const e of ERAS) {
      const key = `${t.canonical} :: ${e.canonical}`;
      const count = cells[key]?.publishedTexts ?? 0;
      if (count >= 2) continue;
      const weight =
        traditionBandWeight(t.canonical) + (e.medievalBonus ? 0.5 : 0) - count * 0.15;
      gaps.push({ tradition: t.canonical, era: e.canonical, publishedTexts: count, weight });
    }
  }
  gaps.sort((a, b) => b.weight - a.weight);

  return { cells, coveredAuthors, coveredWorks, totalPublished, gaps: gaps.slice(0, 24) };
}
