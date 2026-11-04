/**
 * Era plates: one public-domain image per era, the header band on its era page.
 *
 * Each era has a default, committed with the site at public/plates/eras/<slug>.jpg
 * (a 2000×1000 crop around the image's people, 280–430 KB). The admin era form
 * can replace it by uploading to the 'plates' bucket (migration 035), which sets
 * eras.plate_url / plate_credit / plate_focus_y; those win over the default.
 *
 * Every default below was checked on 4 Nov 2026 against its holder's own
 * statement (the Met API's isPublicDomain flag; Yale's IIIF manifest rights;
 * the Rijksmuseum object page's Public Domain mark). An era with no default yet
 * (null) shows a text-only header until a plate is chosen.
 * Sourcing notes and rejected candidates: the backlog card "Make the library
 * visual at scale".
 */

export type EraPlate = {
  src: string
  /** Shown under the band: what it is, where it is held, its licence. */
  credit: string
  /** Where the object lives online, for provenance. */
  sourceUrl?: string
  /** 0–100: the vertical point kept in view when the band crops the image. */
  focusY: number
}

export const DEFAULT_ERA_PLATES: Record<string, EraPlate | null> = {
  apostolic: null,
  'ante-nicene': {
    src: '/plates/eras/ante-nicene.jpg',
    credit: 'Procession of women, baptistery of the Christian house at Dura-Europos, c. 232–45. Yale University Art Gallery. Public domain (CC0).',
    sourceUrl: 'https://artgallery.yale.edu/collections/objects/34496',
    focusY: 40,
  },
  'nicene-post-nicene': null,
  'early-medieval': null,
  'high-medieval': {
    src: '/plates/eras/high-medieval.jpg',
    credit: 'The Last Supper and the Washing of the Feet, leaf from a psalter, England, c. 1250–70. The Metropolitan Museum of Art. Public domain (CC0).',
    sourceUrl: 'https://www.metmuseum.org/art/collection/search/466370',
    focusY: 35,
  },
  'late-medieval': {
    src: '/plates/eras/late-medieval.jpg',
    credit: 'Robert Campin and workshop, Annunciation Triptych (Merode Altarpiece), detail, c. 1427–32. The Metropolitan Museum of Art, The Cloisters. Public domain (CC0).',
    sourceUrl: 'https://www.metmuseum.org/art/collection/search/470304',
    focusY: 45,
  },
  reformation: null,
  'post-reformation': {
    src: '/plates/eras/post-reformation.jpg',
    credit: 'The Library of Leiden University, engraving by Willem van Swanenburg after Jan Cornelisz. van ’t Woudt, 1610. Rijksmuseum, Amsterdam. Public domain.',
    sourceUrl: 'https://www.rijksmuseum.nl/en/collection/RP-P-1894-A-18590',
    focusY: 55,
  },
  modern: {
    src: '/plates/eras/modern.jpg',
    credit: 'Library of Christ Church, Oxford, aquatint by J. C. Stadler after Frederick Mackenzie, 1814. Rijksmuseum, Amsterdam. Public domain.',
    sourceUrl: 'https://www.rijksmuseum.nl/en/collection/RP-P-2015-26-1665',
    focusY: 78,
  },
}

export type EraPlateOverride = {
  plate_url: string | null
  plate_credit: string | null
  plate_focus_y: number | null
}

/** The plate an era page shows: an admin upload if there is one, else the default. */
export function resolveEraPlate(slug: string, override: EraPlateOverride | null): EraPlate | null {
  if (override?.plate_url) {
    return {
      src: override.plate_url,
      credit: override.plate_credit ?? '',
      focusY: override.plate_focus_y ?? 50,
    }
  }
  const fallback = DEFAULT_ERA_PLATES[slug] ?? null
  if (fallback && override?.plate_focus_y != null) return { ...fallback, focusY: override.plate_focus_y }
  return fallback
}
