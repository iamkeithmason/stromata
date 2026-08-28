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

// Normalise the URL defensively: a pasted secret often carries a trailing
// slash or newline, and either turns the REST path into "//rest/v1/…", which
// Supabase rejects with "Invalid path specified in request URL". Trim
// whitespace, and strip any trailing slash or an accidentally-included
// /rest/v1 suffix so createClient builds a clean base.
const SUPABASE_URL = (process.env.SCOUT_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '')
  .trim()
  .replace(/\/+$/, '')
  .replace(/\/rest\/v1$/, '');
const SUPABASE_KEY = (
  process.env.SCOUT_SUPABASE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  ''
).trim();

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
  tradition_id: number | null;
  era_id: number | null;
}

interface TextRow {
  title: string;
  published: boolean;
  author_id: string;
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

  // Plain reads joined in JS — no PostgREST relationship embeds, so the query
  // can't fail on FK-relationship resolution and stays robust to schema tweaks.
  const [traditionsRes, erasRes, authorsRes, textsRes] = await Promise.all([
    supabase.from('traditions').select('id, name'),
    supabase.from('eras').select('id, label'),
    supabase.from('authors').select('id, name, death_year, tradition_id, era_id'),
    supabase.from('texts').select('title, published, author_id'),
  ]);

  for (const [label, res] of [
    ['traditions', traditionsRes],
    ['eras', erasRes],
    ['authors', authorsRes],
    ['texts', textsRes],
  ] as const) {
    if (res.error) throw new Error(`Supabase ${label} read failed: ${res.error.message}`);
  }

  const traditionNameById = new Map<number, string>();
  for (const t of (traditionsRes.data ?? []) as Array<{ id: number; name: string }>) {
    traditionNameById.set(t.id, t.name);
  }
  const eraLabelById = new Map<number, string>();
  for (const e of (erasRes.data ?? []) as Array<{ id: number; label: string }>) {
    eraLabelById.set(e.id, e.label);
  }

  const authors = (authorsRes.data ?? []) as AuthorRow[];
  const texts = (textsRes.data ?? []) as TextRow[];

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

    const tradition = canonicalTradition(
      author?.tradition_id != null ? traditionNameById.get(author.tradition_id) : null,
    );
    const era = canonicalEra(author?.era_id != null ? eraLabelById.get(author.era_id) : null);
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
