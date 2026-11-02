// Presentation helpers for a text's edition notes in the reader rail.

/** Provenance notes longer than this fold behind a disclosure. */
export const PROVENANCE_INLINE_MAX = 280

/** True when an attribution is nothing but a URL, which reads badly as prose. */
export function isBareUrl(value: string): boolean {
  return /^https?:\/\/\S+$/.test(value.trim())
}

/** A short, readable label for a URL: its host without "www.". */
export function hostLabel(url: string): string {
  try {
    return new URL(url.trim()).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
