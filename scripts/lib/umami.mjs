/**
 * umami.mjs — shared read-only Umami Analytics access (share-token or API key).
 *
 * Umami Cloud gates its API-key API behind a paid plan; on the free tier the
 * per-website Share URL is used instead. The browser share dashboard resolves
 * and queries through the region gateway host (gateway-<region>.umami.is/api),
 * verified on the wire — this module replicates that flow. GET-only.
 *
 * Consumed by scripts/umami-report.mjs (CLI) and scripts/analytics/* (digest).
 * The caller is responsible for loading .env.local (via dotenv) first.
 */

// Parse the Cloud region + share slug from either the full share URL
// (…/analytics/<region>/share/<slug>) or a bare slug + explicit region.
export function parseShare(env = process.env) {
  const rawUrl = env.UMAMI_SHARE_URL?.trim();
  let slug = env.UMAMI_SHARE_ID?.trim() || '';
  let region = env.UMAMI_REGION?.trim() || '';
  if (rawUrl) {
    const m =
      /\/analytics\/([a-z]{2})\/share\/([^/?#]+)/i.exec(rawUrl) || /\/share\/([^/?#]+)/i.exec(rawUrl);
    if (m) {
      if (m.length === 3) {
        region ||= m[1].toLowerCase();
        slug ||= m[2];
      } else {
        slug ||= m[1];
      }
    }
  }
  return { slug, region };
}

// The share token is a JWT whose payload carries the websiteId.
export function websiteIdFromToken(token) {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).websiteId;
  } catch {
    return undefined;
  }
}

// (share-resolution URL -> matching data base) pairs, tried in order. The first
// that returns a valid { token, websiteId } wins; its base serves every query.
function shareCandidates(slug, region, apiBaseEnv) {
  const enc = encodeURIComponent(slug);
  const pairs = [];
  if (region)
    pairs.push([
      `https://gateway-${region}.umami.is/api/share/${enc}`,
      `https://gateway-${region}.umami.is/api`,
    ]);
  pairs.push([`https://gateway.umami.is/api/share/${enc}`, `https://gateway.umami.is/api`]);
  pairs.push(
    [`https://cloud.umami.is/api/share/${enc}`, `https://cloud.umami.is/api`],
    [`https://api.umami.is/v1/share/${enc}`, `https://api.umami.is/v1`]
  );
  if (apiBaseEnv) pairs.unshift([`${apiBaseEnv}/share/${enc}`, apiBaseEnv]);
  return pairs;
}

/**
 * Resolve credentials and return a read-only client:
 *   { base, headers, websiteId, via, mode, region, get(path, params) }
 * `get` substitutes `{id}` in the path with the website id, sends the auth
 * headers, and returns parsed JSON (throws with the wire detail on non-2xx).
 * Throws a descriptive Error if no credentials resolve.
 */
export async function createUmamiClient(env = process.env) {
  const apiKey = env.UMAMI_API_KEY;
  const websiteIdEnv = env.UMAMI_WEBSITE_ID;
  const apiBaseEnv = env.UMAMI_API_BASE?.replace(/\/$/, '');
  const { slug, region } = parseShare(env);

  let ctx;
  if (apiKey) {
    if (!websiteIdEnv) throw new Error('API-key mode needs UMAMI_WEBSITE_ID in .env.local.');
    const base = apiBaseEnv || `https://api.umami.is/v1${region ? `/${region}` : ''}`;
    ctx = { base, headers: { 'x-umami-api-key': apiKey }, websiteId: websiteIdEnv, via: base, mode: 'api-key', region };
  } else if (slug) {
    const tried = [];
    for (const [url, base] of shareCandidates(slug, region, apiBaseEnv)) {
      let res;
      try {
        res = await fetch(url);
      } catch (e) {
        tried.push(`${url} -> ${e.code || e.message}`);
        continue;
      }
      const raw = await res.text();
      if (!res.ok) {
        const snippet = raw.replace(/\s+/g, ' ').trim().slice(0, 180);
        tried.push(`${url} -> HTTP ${res.status}${snippet ? ` · ${snippet}` : ''}`);
        continue;
      }
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        tried.push(`${url} -> 200 but non-JSON: ${raw.slice(0, 80)}`);
        continue;
      }
      if (data?.token) {
        const websiteId = websiteIdEnv || data.websiteId || websiteIdFromToken(data.token);
        if (!websiteId) {
          tried.push(`${url} -> 200 with token but no websiteId (set UMAMI_WEBSITE_ID)`);
          continue;
        }
        ctx = {
          base,
          headers: { 'x-umami-share-token': data.token, 'x-umami-share-context': '1' },
          websiteId,
          via: url,
          mode: 'share',
          region,
        };
        break;
      }
      tried.push(`${url} -> 200 but no token in response`);
    }
    if (!ctx) {
      throw new Error(
        `Could not resolve the share slug "${slug}"` +
          (region ? ` (region "${region}")` : ' (no region set)') +
          ' at any known endpoint.\nTried:\n  ' +
          tried.join('\n  ') +
          '\n\nChecks:\n' +
          '  - Is the Share URL enabled in Umami (Websites -> Edit -> Share URL)?\n' +
          '  - Set UMAMI_SHARE_URL to the full share link so the region is parsed,\n' +
          '    or set UMAMI_REGION (eu | us). Pin the working base with UMAMI_API_BASE.'
      );
    }
  } else {
    throw new Error(
      'No Umami credentials found. Set UMAMI_SHARE_URL or UMAMI_SHARE_ID (free tier),\n' +
        'or UMAMI_API_KEY (paid plan) in .env.local. See .env.example for details.'
    );
  }

  ctx.get = async (pathname, params = {}) => {
    const url = new URL(`${ctx.base}/${pathname.replace(/^\//, '')}`.replace('{id}', ctx.websiteId));
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
    const res = await fetch(url, { headers: ctx.headers });
    const body = await res.text();
    if (!res.ok) throw new Error(`GET ${url.pathname}${url.search} -> HTTP ${res.status}\n${body.slice(0, 400)}`);
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  };
  return ctx;
}

// Time-window helpers shared by the CLI and the digest (Unix-ms startAt/endAt).
export function rangeToWindow(range = '7d', now = Date.now()) {
  const map = { '24h': 864e5, '7d': 7 * 864e5, '30d': 30 * 864e5, '90d': 90 * 864e5 };
  if (range === 'today') {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return { startAt: d.getTime(), endAt: now };
  }
  if (range === 'all') return { startAt: Date.parse('2025-01-01T00:00:00Z'), endAt: now };
  const span = map[range];
  if (!span) return null;
  return { startAt: now - span, endAt: now };
}
