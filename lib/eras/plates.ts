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
 * the Rijksmuseum object page's Public Domain mark). All nine eras have one; an
 * era set to null would show a text-only header until a plate is chosen.
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
  apostolic: {
    src: '/plates/eras/apostolic.jpg',
    credit: 'Six Apostles (John, Peter, Paul, Andrew shown), tempera and gold on wood, Spanish (Oña) Painter, c. 1500. The Metropolitan Museum of Art. Public domain (CC0).',
    sourceUrl: 'https://www.metmuseum.org/art/collection/search/437741',
    focusY: 40,
  },
  'ante-nicene': {
    src: '/plates/eras/ante-nicene.jpg',
    credit: 'Procession of women, baptistery of the Christian house at Dura-Europos, c. 232–45. Yale University Art Gallery. Public domain (CC0).',
    sourceUrl: 'https://artgallery.yale.edu/collections/objects/34496',
    focusY: 40,
  },
  'nicene-post-nicene': {
    src: '/plates/eras/nicene-post-nicene.jpg',
    credit: 'Emperor Justinian and Bishop Maximian with their retinue, mosaic in San Vitale, Ravenna, c. 547; albumen print by Fratelli Alinari, c. 1875–1900. Rijksmuseum, Amsterdam. Public domain.',
    sourceUrl: 'https://www.rijksmuseum.nl/en/collection/RP-F-00-8320',
    focusY: 35,
  },
  'early-medieval': {
    src: '/plates/eras/early-medieval.jpg',
    credit: 'Plaque with scenes at Emmaus, ivory, Carolingian, c. 850–900. The Metropolitan Museum of Art, The Cloisters. Public domain (CC0).',
    sourceUrl: 'https://www.metmuseum.org/art/collection/search/471970',
    focusY: 50,
  },
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
  reformation: {
    src: '/plates/eras/reformation.jpg',
    credit: 'Book printing (Impressio librorum), from Nova Reperta, workshop of Philips Galle after Jan van der Straet, c. 1589–93. Rijksmuseum, Amsterdam. Public domain.',
    sourceUrl: 'https://www.rijksmuseum.nl/en/collection/RP-P-1904-1031',
    focusY: 50,
  },
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

/**
 * Arch plates: the era's plate behind the initial of an author with no portrait.
 *
 * Every lancet arch for a portrait-less author shows a small, darkened copy of
 * their era's default plate, with the initial in the frame's gold. The copies
 * live at public/plates/eras/arch/<slug>.jpg (960×480, 45–90 KB, made by
 * scripts/build-era-arch-plates.sh); the 2000×1000 originals are too heavy to
 * sit behind every card. An admin-uploaded era plate is not used here: it is a
 * full-size file, and the arch would fetch it on every card.
 *
 * An author with no era (or an era with no plate) keeps the plain vellum arch.
 */
export function eraArchPlate(eraSlug: string | null | undefined): string | null {
  if (!eraSlug || !DEFAULT_ERA_PLATES[eraSlug]) return null
  return `/plates/eras/arch/${eraSlug}.jpg`
}

/** FNV-1a: a small, stable hash, so a crop is the same on every render. */
function hash(seed: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export type ArchCrop = { x: number; y: number; zoom: number }

/**
 * Where in its era's plate an author's arch looks. The arch shows about a
 * quarter of the plate's width, so a row of same-era authors would repeat one
 * window if every arch used the centre. The author's slug picks the window:
 * x across 8–92%, a little zoom (1–1.35), and y near the plate's own focus so
 * the window stays on the people the plate was cropped around.
 */
export function archPlateCrop(seed: string, eraSlug: string): ArchCrop {
  const h = hash(seed)
  const focusY = DEFAULT_ERA_PLATES[eraSlug]?.focusY ?? 50
  const x = 8 + (h % 1000) / 999 * 84
  const zoom = 1 + ((h >>> 10) % 100) / 99 * 0.35
  const dy = (((h >>> 17) % 100) / 99 - 0.5) * 20
  const y = Math.min(100, Math.max(0, focusY + dy))
  const round = (n: number) => Math.round(n * 10) / 10
  return { x: round(x), y: round(y), zoom: Math.round(zoom * 100) / 100 }
}
