/**
 * Basic SSRF guard + allowlist status. The provenance assistant may fetch ANY
 * public candidate page (not just allowlisted hosts — you assess a source to
 * decide whether to pin it), so this blocks the dangerous targets: non-http(s)
 * schemes, localhost, private/link-local/loopback IP literals, and the cloud
 * metadata endpoint. Hostname-based only (no DNS resolution) — a deliberately
 * basic guard, matching the pipeline's existing "public http(s) only" posture.
 */

import { isAllowlistedUrl } from '../sourcer/contract';

/** Private / loopback / link-local IPv4 literals + the metadata IP. */
function isPrivateIpv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if ([a, Number(m[3]), Number(m[4])].some((n) => n > 255)) return true; // malformed → treat as unsafe
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local + 169.254.169.254 metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isPrivateHostname(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h.endsWith('.local') || h.endsWith('.internal')) return true;
  // IPv6 loopback / link-local / unique-local literals (URL hosts keep brackets stripped).
  if (h === '::1' || h === '[::1]') return true;
  if (/^(\[)?(fe80|fc|fd)/i.test(h)) return true;
  return false;
}

export interface UrlCheck {
  ok: boolean;
  host: string;
  reason?: string;
}

/** Validate a candidate URL for fetching. Public http(s) only; block SSRF targets. */
export function validateCandidateUrl(raw: string): UrlCheck {
  const s = String(raw || '').trim();
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return { ok: false, host: '', reason: `not a valid URL: ${s}` };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { ok: false, host: u.hostname, reason: `only http(s) is allowed, not "${u.protocol}"` };
  }
  const host = u.hostname.toLowerCase();
  if (!host) return { ok: false, host: '', reason: 'no host in URL' };
  if (isPrivateHostname(host) || isPrivateIpv4(host)) {
    return { ok: false, host, reason: `refusing a private / loopback / metadata host: ${host}` };
  }
  return { ok: true, host };
}

/** Is this URL's host directly pinnable by the Sourcer (on its source allowlist)? */
export function isSourcerPinnable(url: string): boolean {
  return isAllowlistedUrl(url);
}
