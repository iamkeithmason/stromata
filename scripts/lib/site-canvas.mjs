/**
 * Site canvas: the judgement half. Turns screens-manifest pages that carry a
 * `canvas` position and `links` into a graph of nodes and edges, and weighs each
 * edge with click counts when they are available. Pure and unit-tested
 * (site-canvas.test.mjs); scripts/screens/canvas.mjs does the I/O.
 *
 * Nothing here knows about Stromata or Umami. The vocabulary check is passed in
 * (`isSurface`) and click counts arrive as plain numbers, so the module lifts
 * into another project unchanged.
 *
 * Manifest shape, per page:
 *   "canvas": { "col": 0, "row": 0, "label": "Optional node label" }
 *   "links": [{ "to": "<page name>", "event": "text-open", "from": ["surface", …] }]
 *
 * A link says: clicks of `event` carrying any of these `from` values travel from
 * this page to `to`. Each (event, from) pair may appear in one link only, or its
 * clicks would be counted on two edges.
 */

export function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/** The manifest pages that sit on the canvas. */
export function canvasPages(pages) {
  return pages.filter(p => p.canvas)
}

/**
 * Check the manifest's canvas data. Returns a list of problems in plain words;
 * an empty list means the canvas can be drawn.
 */
export function validateCanvas(pages, isSurface = () => true) {
  const errors = []
  const onCanvas = canvasPages(pages)
  const names = new Set(onCanvas.map(p => p.name))
  const seenPairs = new Map()
  const seenCells = new Map()

  if (onCanvas.length === 0) errors.push('No manifest page has a `canvas` position.')

  for (const p of onCanvas) {
    const { col, row } = p.canvas
    if (!Number.isInteger(col) || !Number.isInteger(row) || col < 0 || row < 0) {
      errors.push(`${p.name}: canvas needs whole-number col and row, 0 or more.`)
    } else {
      const cell = `${col},${row}`
      if (seenCells.has(cell)) errors.push(`${p.name}: shares canvas cell ${cell} with ${seenCells.get(cell)}.`)
      else seenCells.set(cell, p.name)
    }
  }

  for (const p of pages) {
    if (!p.links) continue
    if (!p.canvas) {
      errors.push(`${p.name}: has links but no canvas position.`)
      continue
    }
    for (const [i, link] of p.links.entries()) {
      const where = `${p.name} link ${i + 1}`
      if (!names.has(link.to)) errors.push(`${where}: "${link.to}" is not a page on the canvas.`)
      if (!link.event || typeof link.event !== 'string') errors.push(`${where}: needs an event name.`)
      if (!Array.isArray(link.from) || link.from.length === 0) {
        errors.push(`${where}: needs at least one \`from\` value.`)
        continue
      }
      for (const f of link.from) {
        if (!isSurface(f)) errors.push(`${where}: "${f}" is not a recorded \`from\` value.`)
        const pair = `${link.event} · ${f}`
        if (seenPairs.has(pair)) errors.push(`${where}: ${pair} is already counted by ${seenPairs.get(pair)}.`)
        else seenPairs.set(pair, where)
      }
    }
  }
  return errors
}

/**
 * Build the graph. `clicks` is null when no counts could be read, or
 *   { range: '30d', events: { [event]: { total: n, byFrom: { [from]: n } } } }
 * A link whose event is missing from `clicks.events` gets count null ("no
 * data"), never 0: a silent zero would read as "nobody clicked".
 */
export function buildGraph(pages, clicks, isSurface = () => true) {
  const onCanvas = canvasPages(pages)
  const nodes = onCanvas.map(p => ({
    id: slugify(p.name),
    name: p.name,
    label: p.canvas.label || p.name,
    route: p.route,
    note: p.note || '',
    col: p.canvas.col,
    row: p.canvas.row,
  }))
  const idOf = Object.fromEntries(onCanvas.map(p => [p.name, slugify(p.name)]))

  const linked = new Set()
  const edges = []
  for (const p of onCanvas) {
    for (const link of p.links || []) {
      const data = clicks?.events?.[link.event]
      const parts = link.from.map(from => {
        linked.add(`${link.event}\u0000${from}`)
        return { from, count: data ? (data.byFrom[from] ?? 0) : null }
      })
      const count = data ? parts.reduce((s, x) => s + x.count, 0) : null
      edges.push({
        id: `${idOf[p.name]}--${link.event}--${idOf[link.to]}`,
        source: idOf[p.name],
        target: idOf[link.to],
        event: link.event,
        parts,
        count,
      })
    }
  }

  // Clicks the canvas cannot place: surfaces on pages not drawn yet, and values
  // nobody has recorded in the vocabulary (a typo in the JSX, usually).
  const offCanvas = []
  const unknown = []
  const coverage = []
  const events = [...new Set(edges.map(e => e.event))]
  for (const event of events) {
    const data = clicks?.events?.[event]
    if (!data) continue
    let attributed = 0
    for (const [from, count] of Object.entries(data.byFrom)) {
      attributed += count
      if (linked.has(`${event}\u0000${from}`)) continue
      ;(isSurface(from) ? offCanvas : unknown).push({ event, from, count })
    }
    coverage.push({ event, attributed, total: data.total ?? null })
  }
  const byCount = (a, b) => b.count - a.count || a.from.localeCompare(b.from)
  offCanvas.sort(byCount)
  unknown.sort(byCount)

  return { nodes, edges, offCanvas, unknown, coverage, range: clicks?.range ?? null, hasClicks: Boolean(clicks) }
}
