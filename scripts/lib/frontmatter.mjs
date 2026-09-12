/**
 * frontmatter.mjs — shared flat-YAML frontmatter parser for the pipeline.
 *
 * The pipeline's frontmatter is flat `key: value` YAML with no nesting, so a
 * hand-rolled parser avoids adding a dependency. Extracted here so the Stage 5a
 * importer (pipeline-import.mjs) and any out-of-band importer (e.g. the
 * MCP-orchestrated import used when no service-role key is present) parse
 * staged output identically — one source of truth for the frontmatter contract.
 */

export function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: raw.trim() };

  const [, frontmatterBlock, rest] = match;
  const data = {};

  for (const line of frontmatterBlock.split('\n')) {
    const m = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (!m) continue;
    const [, key, rawValue] = m;
    // Strip inline YAML comments (two or more spaces + # + rest of line).
    // Two-space minimum avoids stripping # inside content like URLs.
    const cleanValue = rawValue.trim().replace(/\s{2,}#.*$/, '').trim();
    data[key] = parseValue(cleanValue);
  }

  const body = stripEditorialIntroPlaceholder(rest.trim());
  return { data, body };
}

function parseValue(value) {
  if (value === '') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+$/.test(value)) return Number(value);

  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map(v => stripQuotes(v.trim()));
  }

  return stripQuotes(value);
}

function stripQuotes(value) {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return value;
}

function stripEditorialIntroPlaceholder(body) {
  return body
    .replace(/<!--\s*EDITORIAL INTRO[\s\S]*?-->\n?/, '')
    .trim();
}
