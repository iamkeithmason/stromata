/**
 * A tiny, dependency-free YAML scalar/emitter helper. The Sourcer only writes
 * flat maps and short ordered lists into the sidecars, so a full YAML library is
 * unwarranted (no new dependencies). Strings are block-scalar-escaped when they
 * carry newlines or YAML-significant characters.
 */

/** Emit a single scalar value safely. */
export function yamlScalar(value: string | number | boolean | null): string {
  if (value === null) return 'null';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  const s = String(value);
  if (s === '') return '""';
  if (s.includes('\n')) {
    // Literal block scalar; indent each line by 2 under the key.
    const indented = s.replace(/\n/g, '\n  ');
    return `|-\n  ${indented}`;
  }
  // Quote when it could be misparsed (leading/trailing space, special leads, colons, #).
  if (/^[\s>|&*!%@`"']/.test(s) || /:\s|\s#|^[-?]/.test(s) || /[:#]$/.test(s) || /^(true|false|null|~|yes|no)$/i.test(s)) {
    return JSON.stringify(s);
  }
  return s;
}

/** Emit `key: value` for a flat map entry. */
export function yamlEntry(key: string, value: string | number | boolean | null): string {
  const scalar = yamlScalar(value);
  if (scalar.startsWith('|-')) return `${key}: ${scalar}`;
  return `${key}: ${scalar}`;
}

/** Emit a `key:` followed by an indented block-list of scalars. */
export function yamlList(key: string, items: Array<string | number>): string {
  if (items.length === 0) return `${key}: []`;
  const lines = items.map((i) => `  - ${yamlScalar(i as string | number)}`);
  return `${key}:\n${lines.join('\n')}`;
}
