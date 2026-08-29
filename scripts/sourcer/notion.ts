/**
 * Notion client for the Content Prospect List — READ the cleared intake and the
 * schema (reconcile-first), plus ONE optional write: a Status bump to
 * "In progress" once a prospect is staged (off by default; the CLI must opt in).
 * No other write. The Sourcer never sets `Rights cleared` or `Cleared edition
 * URL` — those are the editor's, and the Sourcer only reads them.
 *
 * Uses the 2025-09-03 data-source API this workspace exposes.
 */

import { NOTION } from './config';
import { slugFor, workFromTitle } from './contract';
import type { ClearedProspect } from './types';

const BASE = 'https://api.notion.com/v1';

// Read the token LAZILY (not into a module-level const at import time): the CLI
// loads .env.local via dotenv AFTER these modules are imported, so an
// import-time capture would be empty for local runs even when the token is set.
function notionToken(): string {
  return process.env.NOTION_TOKEN || process.env.SOURCER_NOTION_TOKEN || '';
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${notionToken()}`,
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
  if (!notionToken()) throw new Error('NOTION_TOKEN (or SOURCER_NOTION_TOKEN) is not set.');
}

// ---------------------------------------------------------------------------
// Schema (reconcile-first) — confirm the two human-owned gate fields exist.
// ---------------------------------------------------------------------------

interface NotionProp {
  type?: string;
  title?: Array<{ plain_text: string }>;
  rich_text?: Array<{ plain_text: string }>;
  select?: { name?: string };
  url?: string | null;
  checkbox?: boolean;
}

export interface SchemaSnapshot {
  propertyNames: string[];
  hasClearedEditionUrl: boolean;
  hasRightsCleared: boolean;
}

export async function fetchSchema(): Promise<SchemaSnapshot> {
  const res = await notionFetch(`/data_sources/${NOTION.dataSourceId}`, { method: 'GET' });
  if (!res.ok) throw new Error(`Notion schema fetch failed (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as { properties?: Record<string, NotionProp> };
  const props = json.properties ?? {};
  const names = Object.keys(props);
  return {
    propertyNames: names,
    hasClearedEditionUrl: names.includes(NOTION.props.clearedEditionUrl),
    hasRightsCleared: names.includes(NOTION.props.rightsCleared),
  };
}

// ---------------------------------------------------------------------------
// Read the cleared intake.
// ---------------------------------------------------------------------------

function plainText(prop: NotionProp | undefined): string {
  if (!prop) return '';
  if (prop.type === 'title') return (prop.title ?? []).map((t) => t.plain_text).join('');
  if (prop.type === 'rich_text') return (prop.rich_text ?? []).map((t) => t.plain_text).join('');
  if (prop.type === 'select') return prop.select?.name ?? '';
  if (prop.type === 'url') return prop.url ?? '';
  return '';
}

function selectName(prop: NotionProp | undefined): string | null {
  if (prop?.type === 'select') return prop.select?.name ?? null;
  return null;
}

function checkbox(prop: NotionProp | undefined): boolean {
  return prop?.type === 'checkbox' ? Boolean(prop.checkbox) : false;
}

function urlValue(prop: NotionProp | undefined): string {
  return prop?.type === 'url' ? (prop.url ?? '') : '';
}

function toProspect(id: string, pageUrl: string, p: Record<string, NotionProp>): ClearedProspect {
  const title = plainText(p[NOTION.props.title]);
  const author = plainText(p[NOTION.props.author]);
  const work = workFromTitle(title, author);
  return {
    id,
    pageUrl,
    title,
    author,
    work,
    slug: slugFor(title, author),
    tradition: selectName(p[NOTION.props.tradition]),
    era: selectName(p[NOTION.props.era]),
    genre: selectName(p[NOTION.props.genre]),
    status: plainText(p[NOTION.props.status]),
    clearedEditionUrl: urlValue(p[NOTION.props.clearedEditionUrl]).trim(),
    rightsCleared: checkbox(p[NOTION.props.rightsCleared]),
    translationNotes: plainText(p[NOTION.props.translationNotes]),
    referenceUrl: urlValue(p[NOTION.props.referenceUrl]).trim() || null,
  };
}

/**
 * The candidate intake: every row the editor has BEGUN clearing — `Rights
 * cleared` checked OR a `Cleared edition URL` present. Rows with neither are not
 * in flight and are ignored entirely (not logged). The gate then admits or
 * refuses each candidate with a discriminated reason.
 */
export async function fetchCandidateProspects(): Promise<ClearedProspect[]> {
  const out: ClearedProspect[] = [];
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
      results: Array<{ id: string; url: string; properties: Record<string, NotionProp> }>;
      has_more: boolean;
      next_cursor: string | null;
    };

    for (const page of json.results) {
      const prospect = toProspect(page.id, page.url, page.properties);
      if (prospect.rightsCleared || prospect.clearedEditionUrl) out.push(prospect);
    }

    cursor = json.has_more ? json.next_cursor ?? undefined : undefined;
  } while (cursor);

  return out;
}

// ---------------------------------------------------------------------------
// The one optional write — a Status bump (off by default).
// ---------------------------------------------------------------------------

/** Set a staged prospect's Status to "In progress". Only called when the CLI opts in. */
export async function bumpStatusInProgress(pageId: string): Promise<void> {
  assertToken();
  const res = await notionFetch(`/pages/${pageId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      properties: { [NOTION.props.status]: { select: { name: NOTION.inProgressStatus } } },
    }),
  });
  if (!res.ok) throw new Error(`Notion status bump failed (${res.status}): ${await res.text()}`);
}
