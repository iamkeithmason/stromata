/**
 * aggregate.mjs — pure join/rollup logic for the analytics digest.
 *
 * Umami records events keyed by SLUG (text-open -> text=<slug>); Supabase knows
 * what each slug MEANS (title, author, themes, era, tradition, genre). These
 * functions join the two and roll opens up along each dimension Umami cannot
 * group by. No I/O — fully unit-testable with plain objects.
 */

// Map -> array of { label, value } sorted by value desc (ties: label asc).
export function rank(map, limit = Infinity) {
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || String(a.label).localeCompare(String(b.label)))
    .slice(0, limit);
}

function add(map, key, n) {
  if (key === undefined || key === null || key === '') return;
  map.set(key, (map.get(key) || 0) + n);
}

/**
 * @param {object} input
 * @param {{slug:string,count:number}[]} input.textOpens      text-open by text slug
 * @param {{slug:string,count:number}[]} input.collectionOpens collection-open by slug
 * @param {{surface:string,count:number}[]} input.fromAttribution text-open by `from`
 * @param {object} input.db
 *   - textsBySlug:     Map slug -> { id, title, author_id, genre_id }
 *   - authorsById:     Map id -> { name, tradition_id, era_id }
 *   - traditionsById:  Map id -> name
 *   - erasById:        Map id -> label
 *   - genresById:      Map id -> name
 *   - themesByTextId:  Map text_id -> string[] (theme names)
 *   - collectionsBySlug: Map slug -> { name }
 */
export function buildDigest({ textOpens = [], collectionOpens = [], fromAttribution = [], db }) {
  const byTheme = new Map();
  const byAuthor = new Map();
  const byEra = new Map();
  const byTradition = new Map();
  const byGenre = new Map();
  const topTexts = [];
  const unmatchedTexts = [];
  let matchedOpens = 0;
  let totalTextOpens = 0;

  for (const { slug, count } of textOpens) {
    totalTextOpens += count;
    const text = db.textsBySlug.get(slug);
    if (!text) {
      unmatchedTexts.push({ slug, count });
      continue;
    }
    matchedOpens += count;
    const author = text.author_id != null ? db.authorsById.get(text.author_id) : undefined;
    const authorName = author?.name || '(unknown author)';
    const eraLabel = author?.era_id != null ? db.erasById.get(author.era_id) : undefined;
    const traditionName = author?.tradition_id != null ? db.traditionsById.get(author.tradition_id) : undefined;
    const genreName = text.genre_id != null ? db.genresById.get(text.genre_id) : undefined;
    const themes = db.themesByTextId.get(text.id) || [];

    topTexts.push({ slug, count, title: text.title, author: authorName, themes });
    add(byAuthor, authorName, count);
    add(byEra, eraLabel, count);
    add(byTradition, traditionName, count);
    add(byGenre, genreName, count);
    for (const theme of themes) add(byTheme, theme, count);
  }

  const collections = [];
  const unmatchedCollections = [];
  for (const { slug, count } of collectionOpens) {
    const c = db.collectionsBySlug?.get(slug);
    if (c) collections.push({ slug, count, name: c.name });
    else unmatchedCollections.push({ slug, count });
  }

  topTexts.sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug));
  collections.sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug));

  return {
    topTexts,
    byTheme: rank(byTheme),
    byAuthor: rank(byAuthor),
    byEra: rank(byEra),
    byTradition: rank(byTradition),
    byGenre: rank(byGenre),
    collections,
    fromAttribution: [...fromAttribution]
      .map((f) => ({ label: f.surface, value: f.count }))
      .sort((a, b) => b.value - a.value || String(a.label).localeCompare(String(b.label))),
    unmatchedTexts: unmatchedTexts.sort((a, b) => b.count - a.count),
    unmatchedCollections: unmatchedCollections.sort((a, b) => b.count - a.count),
    totals: {
      totalTextOpens,
      matchedOpens,
      unmatchedOpens: totalTextOpens - matchedOpens,
      distinctTextsOpened: topTexts.length,
    },
  };
}
