/**
 * Notion client for the Content Prospect List — READ (schema + existing rows
 * for dedupe) and exactly ONE write (create a provisional proposal row). No
 * update, no delete. The single create is what the PreToolUse hook gates.
 *
 * Talks to the Notion REST API directly rather than via a broad MCP server, so
 * the write surface is exactly one function and nothing wider can be inherited.
 * Uses the 2025-09-03 data-source API that this workspace exposes.
 */

import {
  GENERATED_BY,
  NOTION,
  PROVENANCE_CAVEAT,
  PROVISIONAL_STATUS,
} from './config';
import { dedupeKey } from './contract';
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
  if (!TOKEN) {
    throw new Error('NOTION_TOKEN (or SCOUT_NOTION_TOKEN) is not set.');
  }
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

/**
 * Fetch the live data-source schema so the run reconciles against reality
 * before writing. Surfaces mismatches (a renamed property, a provisional Status
 * option that doesn't exist yet) rather than blindly POSTing.
 */
/** The subset of a Notion property value's shape this client reads. */
interface NotionProp {
  type?: string;
  title?: Array<{ plain_text: string }>;
  rich_text?: Array<{ plain_text: string }>;
  select?: { name?: string; options?: Array<{ name: string }> };
}

export async function fetchSchema(): Promise<SchemaSnapshot> {
  const res = await notionFetch(`/data_sources/${NOTION.dataSourceId}`, { method: 'GET' });
  if (!res.ok) {
    throw new Error(`Notion schema fetch failed (${res.status}): ${await res.text()}`);
  }
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

/** Read every existing prospect row (paginated) for dedupe. */
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
    if (!res.ok) {
      throw new Error(`Notion query failed (${res.status}): ${await res.text()}`);
    }
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
      // Derive the work from the "Author — Work" title when possible.
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

/** Split a long string into ≤1900-char rich_text chunks (Notion caps at 2000). */
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

function editorialNotes(p: ScoredProposal, runDate: string): string {
  return [
    `Rationale: ${p.rationale}`,
    `Discovery: ${p.discoveryNote}`,
    `ICE (agent, 1–5): impact ${p.impact} · confidence ${p.confidence} · ease ${p.ease} · tier1 ${p.tier1}`,
    `Scored: Value ${p.value} · Complexity ${p.complexity} · Effort ${p.effort} ` +
      `[tradition weight ${p.traditionWeight}, medieval bonus ${p.medievalBonus}, ICE ${p.iceScore}]`,
    `Candidate sources: ${p.candidateSources.join(' | ')}`,
    `Dedupe key: ${p.dedupeKey}`,
    PROVENANCE_CAVEAT,
    `Generated by ${GENERATED_BY} · ${runDate}`,
  ].join('\n');
}

function translationNotes(p: ScoredProposal): string {
  return `Copyright flag: ${p.copyrightFlag} — ${p.copyrightReason}. Triage hint only; not clearance.`;
}

function firstHttpUrl(urls: string[]): string | null {
  const u = urls.find((x) => /^https?:\/\//i.test(x.trim()));
  return u ? u.trim() : null;
}

export interface CreateResult {
  id: string;
  url: string;
}

/**
 * Create ONE provisional proposal row. Status is always stamped
 * PROVISIONAL_STATUS here — the agent cannot set it — and Notion auto-creates
 * that select option on first use, keeping agent rows filterable.
 */
export async function createProspect(p: ScoredProposal, runDate: string): Promise<CreateResult> {
  assertToken();

  const props: Record<string, unknown> = {
    [NOTION.props.title]: { title: richText(p.title) },
    [NOTION.props.author]: { rich_text: richText(p.author) },
    [NOTION.props.tradition]: { select: { name: p.tradition } },
    [NOTION.props.era]: { select: { name: p.era } },
    [NOTION.props.status]: { select: { name: PROVISIONAL_STATUS } },
    [NOTION.props.value]: { number: p.value },
    [NOTION.props.complexity]: { number: p.complexity },
    [NOTION.props.effort]: { number: p.effort },
    [NOTION.props.editorialNotes]: { rich_text: richText(editorialNotes(p, runDate)) },
    [NOTION.props.translationNotes]: { rich_text: richText(translationNotes(p)) },
  };

  if (p.genre) props[NOTION.props.genre] = { select: { name: p.genre } };
  const url = firstHttpUrl(p.candidateSources);
  if (url) props[NOTION.props.referenceUrl] = { url };

  const body = {
    parent: { type: 'data_source_id', data_source_id: NOTION.dataSourceId },
    properties: props,
    // A visible caveat block on the page body, so opening the row shows it is
    // an unverified agent proposal even before the notes are read.
    children: [
      {
        object: 'block',
        type: 'callout',
        callout: {
          icon: { type: 'emoji', emoji: '🔎' },
          rich_text: richText(
            `${PROVENANCE_CAVEAT} — ${GENERATED_BY}, ${runDate}.`,
          ),
        },
      },
    ],
  };

  const res = await notionFetch('/pages', { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) {
    throw new Error(`Notion create failed (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as { id: string; url: string };
  return { id: json.id, url: json.url };
}
