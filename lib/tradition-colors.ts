/**
 * Tradition → ground colour.
 *
 * The maroon/ink hues used for book covers and tradition labels. Kept in one
 * place so the reading page's "About the author" tradition label and the
 * BookCover ground read from a single source of truth.
 */
export const TRADITION_COLORS: Record<string, string> = {
  'early-church':        '#7A6147',
  'patristic':           '#5A2A2A',
  'eastern-orthodox':    '#2C3A4A',
  'roman-catholic':      '#3D2E20',
  'anglican':            '#3D5167',
  'reformed':            '#2C3E2E',
  'lutheran':            '#3A3825',
  'radical-reformation': '#5A3A2A',
  'methodist':           '#2E3A4A',
  'ecumenical':          '#3D3D35',
  'imperial':            '#2C2E4A',
  'oriental-orthodox':   '#3A2E20',
}

export const FALLBACK_TRADITION_COLOR = '#3D5167'

/** Resolve a tradition slug to its ground colour, falling back to slate. */
export function traditionColor(slug: string | null | undefined): string {
  return TRADITION_COLORS[slug ?? ''] ?? FALLBACK_TRADITION_COLOR
}
