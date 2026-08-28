/**
 * Notion client for the Content Prospect List — READ (schema + existing rows
 * for dedupe) and exactly ONE write (create a provisional proposal row). No
 * update, no delete. The single create is what the PreToolUse hook gates.
 *
 * Uses the 2025-09-03 data-source API this workspace exposes. The Score property
 * is a read-only formula (Value ÷ (Complexity + Effort)) and is NEVER written.
 */

import {
  GENERATED_BY,
  NOTION,
  PROVISIONAL_STATUS,
  PROVENANCE_CAVEAT,
} from './config';
import { dedupeKey, translationNotesWithCaveat } from './contract';
import type { ExistingProspect, ScoredProposal } from './types';

const TOKEN = process.env.NOTION_TOKEN || process.env.SCOUT_NOTION_TOKEN || '';
const BASE = 'https://api.notion.com/v1';

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${TOKEN}`,
    'Notion-Version': NOTION.apiVersion,
    'Content-Type': 'application/json',
  };
}

async function notionFetch(path: string, init: RequestInit, attempt = 0): Promise<Response> {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: headers() });
  if ((res.status === 429 || res.status >= 500) && attempt < 4) {
    const wait = Math.min(2000 * 2 ** attempt, 16000);
    await new Promise((r) => setTimeout(r, wait));
    return notionFetch(path, init, attempt + 1);
  }
  return res;
}

export function assertToken(): void {
  if (!TOKEN) throw new Error('NOTION_TOKEN (or SCOUT_NOTION_TOKEN) is not set.');
}

// ---------------------------------------------------------------------------
// Read: schema (reconcile-first) + existing rows (dedupe)
// ---------------------------------------------------------------------------

export interface SchemaSnapshot {
  traditionOptions: string[];
  eraOptions: string[];
  genreOptions: string[];
  statusOptions: string[];
  propertyNames: string[];
}

interface NotionProp {
  type?: string;
  title?: Array<{ plain_text: string }>;
  rich_text?: Array<{ plain_text: string }>;
  select?: { name?: string; options?: Array<{ name: string }> };
}

export async function fetchSchema(): Promise<SchemaSnapshot> {
  const res = await notionFetch(`/data_sources/${NOTION.dataSourceId}`, { method: 'GET' });
  if (!res.ok) throw new Error(`Notion schema fetch failed (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as { properties?: Record<string, NotionProp> };
  const props = json.properties ?? {};
  const opts = (name: string): string[] =>
    (props[name]?.select?.options ?? []).map((o) => o.name);

  return {
    traditionOptions: opts(NOTION.props.tradition),
    eraOptions: opts(NOTION.props.era),
    genreOptions: opts(NOTION.props.genre),
    statusOptions: opts(NOTION.props.status),
    propertyNames: Object.keys(props),
  };
}

function plainText(prop: NotionProp | undefined): string {
  if (!prop) return '';
  if (prop.type === 'title') return (prop.title ?? []).map((t) => t.plain_text).join('');
  if (prop.type === 'rich_text') return (prop.rich_text ?? []).map((t) => t.plain_text).join('');
  if (prop.type === 'select') return prop.select?.name ?? '';
  return '';
}

export async function fetchExistingProspects(): Promise<ExistingProspect[]> {
  const out: ExistingProspect[] = [];
  let cursor: string | undefined;

  do {
    const body: Record<string, unknown> = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const res = await notionFetch(`/data_sources/${NOTION.dataSourceId}/query`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Notion query failed (${res.status}): ${await res.text()}`);
    const json = (await res.json()) as {
      results: Array<{ properties: Record<string, NotionProp> }>;
      has_more: boolean;
      next_cursor: string | null;
    };

    for (const page of json.results) {
      const p = page.properties;
      const title = plainText(p[NOTION.props.title]);
      const author = plainText(p[NOTION.props.author]);
      const status = plainText(p[NOTION.props.status]);
      const work = title.includes('—') ? title.split('—').slice(1).join('—').trim() : title;
      out.push({ title, author, status, dedupeKey: dedupeKey(author || title, work) });
    }

    cursor = json.has_more ? json.next_cursor ?? undefined : undefined;
  } while (cursor);

  return out;
}

// ---------------------------------------------------------------------------
// Write: the single create
// ---------------------------------------------------------------------------

function richText(str: string): Array<{ text: { content: string } }> {
  const chunks: Array<{ text: { content: string } }> = [];
  let s = str;
  while (s.length > 1900) {
    chunks.push({ text: { content: s.slice(0, 1900) } });
    s = s.slice(1900);
  }
  chunks.push({ text: { content: s } });
  return chunks;
}

/** Editorial notes: rationale, discovery, the score line, taxonomy markers, dedupe key, provenance stamp. */
export function editorialNotes(p: ScoredProposal, runDate: string): string {
  const lines = [
    `Rationale: ${p.rationale}`,
    `Discovery: ${p.discoveryNote}${p.tier1 ? ' (Tier-1 search-driver)' : ''}`,
    `Scored: Value ${p.value} · Complexity ${p.complexity} · Effort ${p.effort} · Score ${p.score.toFixed(3)}`,
    ...p.taxonomyNotes,
    `Dedupe key: ${p.dedupeKey}`,
    `Generated by ${GENERATED_BY} · ${runDate}`,
  ];
  return lines.join('\n');
}

function firstHttpUrl(urls: string[]): string | null {
  const u = urls.find((x) => /^https?:\/\//i.test(x.trim()));
  return u ? u.trim() : null;
}

/**
 * Build the create payload's `properties`. Exported and pure so a test can
 * assert the read-only Score property is never present. Tradition/Era are
 * written only when resolved to a value; otherwise the field is left blank and
 * the needs-editorial reason lives in Editorial notes.
 */
export function buildProperties(p: ScoredProposal, runDate: string): Record<string, unknown> {
  const props: Record<string, unknown> = {
    [NOTION.props.title]: { title: richText(p.title) },
    [NOTION.props.author]: { rich_text: richText(p.author) },
    [NOTION.props.status]: { select: { name: PROVISIONAL_STATUS } },
    [NOTION.props.value]: { number: p.value },
    [NOTION.props.complexity]: { number: p.complexity },
    [NOTION.props.effort]: { number: p.effort },
    [NOTION.props.editorialNotes]: { rich_text: richText(editorialNotes(p, runDate)) },
    [NOTION.props.translationNotes]: { rich_text: richText(translationNotesWithCaveat(p.translationNotes)) },
  };

  if (p.resolvedTradition) props[NOTION.props.tradition] = { select: { name: p.resolvedTradition } };
  if (p.era) props[NOTION.props.era] = { select: { name: p.era } };
  if (p.genre) props[NOTION.props.genre] = { select: { name: p.genre } };
  const url = firstHttpUrl(p.candidateSources);
  if (url) props[NOTION.props.referenceUrl] = { url };

  return props;
}

export interface CreateResult {
  id: string;
  url: string;
}

/** Create ONE provisional proposal row. */
export async function createProspect(p: ScoredProposal, runDate: string): Promise<CreateResult> {
  assertToken();

  const body = {
    parent: { type: 'data_source_id', data_source_id: NOTION.dataSourceId },
    properties: buildProperties(p, runDate),
    children: [
      {
        object: 'block',
        type: 'callout',
        callout: {
          icon: { type: 'emoji', emoji: '🔎' },
          rich_text: richText(`${PROVENANCE_CAVEAT} — ${GENERATED_BY}, ${runDate}.`),
        },
      },
    ],
  };

  const res = await notionFetch('/pages', { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Notion create failed (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as { id: string; url: string };
  return { id: json.id, url: json.url };
}
