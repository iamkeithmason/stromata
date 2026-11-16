/**
 * Site canvas: the drawing half. Renders a graph from site-canvas.mjs into one
 * self-contained HTML page: page screenshots laid out on a pan-and-zoom board,
 * with lines between them weighted by clicks. No framework and no network
 * fetches beyond Google Fonts, so the file opens locally and publishes as a
 * claude.ai artifact unchanged.
 *
 * Generic on purpose: everything project-specific (the palette, title, data
 * notes) arrives through `meta`. Images arrive as data URIs keyed by node id and
 * width mode ('phone' | 'desktop'); a node without one shows a placeholder.
 *
 * `fragment: true` leaves out <!doctype>/<html>/<head>/<body>, for hosts (the
 * Artifact tool) that wrap the page in their own skeleton.
 */

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

export function renderCanvasHtml(graph, images, meta, { fragment = false } = {}) {
  const data = { graph, images, meta: { ...meta, palette: undefined } }
  // </script> inside JSON would end the script element early.
  const json = JSON.stringify(data).replace(/</g, '\\u003c')
  const p = meta.palette
  const tokens = pal => Object.entries(pal).map(([k, v]) => `--${k}: ${v};`).join(' ')

  const head = `<title>${esc(meta.title)}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;1,400&family=Courier+Prime&display=swap">
<style>
/* A board of pages, read left to right as a reader moves deeper into the site:
   ways in, then lists, then entity pages, then the reader. Lines are reader clicks. */
:root { ${tokens(p.light)}
  --serif: "EB Garamond", Georgia, serif;
  --mono: "Courier Prime", ui-monospace, monospace; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ${tokens(p.dark)} color-scheme: dark; } }
:root[data-theme="dark"] { ${tokens(p.dark)} color-scheme: dark; }
html, body { height: 100%; }
body { margin: 0; background: var(--paper); color: var(--ink); font: 16px/1.45 var(--serif); overflow: hidden;
  display: flex; flex-direction: column; }
body::before { content: ""; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); z-index: 10; background: var(--paper); }
button { font: inherit; color: inherit; }
:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }

.bar { flex: none; display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 20px;
  padding-block: 12px 10px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px));
  border-bottom: 1px solid var(--rule); background: var(--paper); position: relative; z-index: 3; }
.bar h1 { margin: 0; font-weight: 400; font-size: 1.35rem; letter-spacing: 0.18em; text-transform: uppercase; text-wrap: balance; }
.bar h1 span { color: var(--gold-ink); letter-spacing: 0.04em; text-transform: none; font-style: italic; }
.sub { color: var(--ink-mute); font-size: 0.95rem; min-width: 0; flex: 1 1 22rem; }
.controls { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.seg { display: inline-flex; border: 1px solid var(--rule); border-radius: 999px; overflow: hidden; }
.seg button, .zoom button, .key-toggle { background: transparent; border: 0; padding: 0 14px; min-height: 36px; cursor: pointer; font-size: 0.9rem; }
.seg button[aria-pressed="true"] { background: var(--ink); color: var(--paper); }
.zoom { display: inline-flex; border: 1px solid var(--rule); border-radius: 999px; }
.zoom button { padding: 0 12px; font-family: var(--mono); }
.key-toggle { border: 1px solid var(--rule); border-radius: 999px; }

.stage { flex: 1; position: relative; overflow: hidden; touch-action: none; cursor: grab;
  background-color: var(--paper);
  background-image: radial-gradient(var(--rule-soft) 1px, transparent 1.2px); background-size: 24px 24px; }
.stage.dragging { cursor: grabbing; }
.world { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
svg.edges { position: absolute; left: 0; top: 0; overflow: visible; pointer-events: none; }
.edge path.hit { stroke: transparent; fill: none; pointer-events: stroke; cursor: pointer; }
.edge path.line { fill: none; stroke: var(--gold); stroke-linecap: round; }
.edge.none path.line { stroke: var(--ink-faint); stroke-dasharray: 5 6; }
.edge.zero path.line { stroke: var(--ink-faint); stroke-dasharray: 2 6; }
.edge.on path.line { stroke: var(--accent); }
.edge.dim { opacity: 0.18; }
.edge text { font: 13px var(--mono); fill: var(--ink); }
.edge rect.pill { fill: var(--paper); stroke: var(--gold-rule); }
.edge.on rect.pill { stroke: var(--accent); }
.edge.none text, .edge.zero text { fill: var(--ink-mute); }
marker path { fill: var(--gold); }
marker.on path { fill: var(--accent); }
marker.none path { fill: var(--ink-faint); }

.node { position: absolute; display: flex; flex-direction: column; gap: 8px; cursor: pointer; }
.node .cap { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
.node .label { font-size: 1.05rem; line-height: 1.2; }
.node .route { font: 11px var(--mono); color: var(--ink-mute); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.node .shot { border: 1px solid var(--rule); background: var(--paper-deep); overflow: hidden; box-shadow: 0 1px 0 var(--rule-soft), 0 12px 28px -18px var(--shadow); }
.node .shot img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top; }
.node .shot .missing { height: 100%; display: grid; place-items: center; padding: 16px; text-align: center; color: var(--ink-mute); font-size: 0.9rem; }
.node.on .shot { border-color: var(--accent); outline: 2px solid var(--accent); }
.node.dim { opacity: 0.35; }
.node .tally { font: 12px var(--mono); color: var(--gold-ink); }

.panel { position: absolute; z-index: 2; background: var(--paper); border: 1px solid var(--rule);
  box-shadow: 0 18px 40px -24px var(--shadow); padding: 14px 16px 16px; overflow: auto; max-height: calc(100% - 24px); }
.panel h2 { margin: 0 0 4px; font-weight: 500; font-size: 1.15rem; text-wrap: balance; }
.panel .kicker { font: 11px var(--mono); letter-spacing: 0.08em; text-transform: uppercase; color: var(--gold-ink); margin: 0 0 6px; }
.panel p { margin: 6px 0; }
.panel table { width: 100%; border-collapse: collapse; font-size: 0.95rem; }
.panel td { padding: 4px 0; border-top: 1px solid var(--rule-soft); vertical-align: top; }
.panel td.n { text-align: right; font-family: var(--mono); font-variant-numeric: tabular-nums; padding-left: 12px; }
.panel code { font: 0.85em var(--mono); }
.panel .close { position: absolute; top: 6px; right: 6px; border: 0; background: transparent; min-width: 36px; min-height: 36px; cursor: pointer; font-size: 1.2rem; color: var(--ink-mute); }
.muted { color: var(--ink-mute); }
#detail { right: max(12px, env(safe-area-inset-right, 0px)); top: 12px; width: min(340px, calc(100% - 24px)); }
#key { left: max(12px, env(safe-area-inset-left, 0px)); bottom: 12px; width: min(380px, calc(100% - 24px)); max-height: 60%; }
#key h3 { margin: 12px 0 2px; font-size: 1rem; font-weight: 500; }
.swatches { display: grid; grid-template-columns: 44px 1fr; gap: 6px 10px; align-items: center; margin: 8px 0; font-size: 0.95rem; }
.swatches svg { width: 44px; height: 12px; }
@media (max-width: 560px) {
  #detail, #key { left: max(8px, env(safe-area-inset-left, 0px)); right: max(8px, env(safe-area-inset-right, 0px)); width: auto; top: auto; bottom: max(8px, env(safe-area-inset-bottom, 0px)); max-height: 55%; }
}
@media (prefers-reduced-motion: no-preference) { .world.ease { transition: transform 240ms cubic-bezier(.2,.7,.2,1); } }
</style>`

  const body = `<header class="bar">
  <h1>${esc(meta.heading)} <span>${esc(meta.subheading)}</span></h1>
  <div class="sub" id="sub"></div>
  <div class="controls">
    <div class="seg" role="group" aria-label="Screenshot width">
      <button type="button" id="mode-phone" aria-pressed="true">Phone 390</button>
      <button type="button" id="mode-desktop" aria-pressed="false">Desktop 1440</button>
    </div>
    <div class="zoom" role="group" aria-label="Zoom">
      <button type="button" id="zoom-out" aria-label="Zoom out">&minus;</button>
      <button type="button" id="zoom-fit">Fit</button>
      <button type="button" id="zoom-in" aria-label="Zoom in">+</button>
    </div>
    <button type="button" class="key-toggle" id="key-toggle" aria-expanded="true" aria-controls="key">Key</button>
  </div>
</header>
<main class="stage" id="stage" aria-label="Site canvas: drag to move, scroll or pinch to zoom, tap a page or line for detail">
  <div class="world" id="world"><svg class="edges" id="edges" aria-hidden="true"></svg></div>
  <aside class="panel" id="detail" hidden aria-live="polite"></aside>
  <aside class="panel" id="key"></aside>
</main>
<script id="canvas-data" type="application/json">${json}</script>
<script>
${CLIENT_JS}
</script>`

  if (fragment) return `${head}\n${body}\n`
  return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${head}\n</head>\n<body>\n${body}\n</body>\n</html>\n`
}

// The page's own script. Plain ES2019, no dependencies.
const CLIENT_JS = String.raw`
(function () {
  var D = JSON.parse(document.getElementById('canvas-data').textContent);
  var G = D.graph, IM = D.images, M = D.meta;
  var stage = document.getElementById('stage'), world = document.getElementById('world'), svg = document.getElementById('edges');
  var detail = document.getElementById('detail'), key = document.getElementById('key');
  var NS = 'http://www.w3.org/2000/svg';
  var SIZES = { phone: { w: 230, ratio: 844 / 390, gx: 210, gy: 70 }, desktop: { w: 400, ratio: 900 / 1440, gx: 230, gy: 70 } };
  var CAP = 54; // caption band above each shot
  var mode = 'phone', view = { x: 0, y: 0, k: 1 }, selected = null, rects = {};
  try { var saved = localStorage.getItem('site-canvas-mode'); if (saved === 'desktop') mode = 'desktop'; } catch (e) {}

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n) { return n == null ? 'no data' : n.toLocaleString('en-GB'); }
  var maxCount = G.edges.reduce(function (m, e) { return Math.max(m, e.count || 0); }, 0);
  var nodeById = {}; G.nodes.forEach(function (n) { nodeById[n.id] = n; });

  // ── Header line ──
  var sub = document.getElementById('sub');
  sub.textContent = G.hasClicks
    ? 'Lines show reader clicks between page types, ' + M.periodLabel + '. Rendered ' + M.rendered + '.'
    : 'Click counts unavailable (' + (M.clickError || 'not requested') + '). Lines show possible routes only. Rendered ' + M.rendered + '.';

  // ── Nodes ──
  var nodeEls = {};
  G.nodes.forEach(function (n) {
    var el = document.createElement('div');
    el.className = 'node'; el.tabIndex = 0; el.setAttribute('role', 'button');
    el.setAttribute('aria-label', n.label + ', ' + n.route);
    el.addEventListener('click', function (ev) { if (!moved) select({ node: n.id }); ev.stopPropagation(); });
    el.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); select({ node: n.id }); } });
    world.appendChild(el); nodeEls[n.id] = el;
  });
  function tally(id) {
    var out = 0, inn = 0, known = G.hasClicks;
    G.edges.forEach(function (e) { if (e.count == null) return; if (e.source === id && e.target !== id) out += e.count; if (e.target === id && e.source !== id) inn += e.count; });
    return known ? { out: out, inn: inn } : null;
  }
  function drawNodes() {
    var S = SIZES[mode], h = Math.round(S.w * S.ratio);
    G.nodes.forEach(function (n) {
      var x = n.col * (S.w + S.gx), y = n.row * (h + CAP + S.gy) - (n.row % 2 ? 0 : 0);
      rects[n.id] = { x: x, y: y, w: S.w, h: h + CAP, imgTop: y + CAP };
      var el = nodeEls[n.id], src = IM[n.id] && IM[n.id][mode], t = tally(n.id);
      el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.width = S.w + 'px';
      el.innerHTML = '<div class="cap" style="height:' + (CAP - 8) + 'px"><div style="min-width:0"><div class="label">' + esc(n.label) + '</div><div class="route">' + esc(n.route) + '</div></div>' +
        (t ? '<div class="tally" title="clicks in / out">' + fmt(t.inn) + '&thinsp;in<br>' + fmt(t.out) + '&thinsp;out</div>' : '') + '</div>' +
        '<div class="shot" style="height:' + h + 'px">' + (src ? '<img alt="' + esc(n.label) + ' at ' + (mode === 'phone' ? '390' : '1440') + 'px" src="' + src + '">' : '<div class="missing">No screenshot yet. Run the screens render with --png.</div>') + '</div>';
    });
  }

  // ── Edges ──
  function width(e) { if (!e.count) return 1.6; return 2 + 12 * Math.sqrt(e.count / (maxCount || 1)); }
  function cls(e) { return e.count == null ? 'none' : e.count === 0 ? 'zero' : 'some'; }
  function bez(p0, c0, c1, p1, t) {
    var u = 1 - t;
    return { x: u*u*u*p0.x + 3*u*u*t*c0.x + 3*u*t*t*c1.x + t*t*t*p1.x, y: u*u*u*p0.y + 3*u*u*t*c0.y + 3*u*t*t*c1.y + t*t*t*p1.y };
  }
  function geometry(e) {
    var a = rects[e.source], b = rects[e.target], A = nodeById[e.source], B = nodeById[e.target];
    if (e.source === e.target) {
      var cx = a.x + a.w / 2, top = a.y - 2;
      var p0 = { x: cx - 46, y: top }, p1 = { x: cx + 46, y: top };
      var c0 = { x: cx - 110, y: top - 150 }, c1 = { x: cx + 110, y: top - 150 };
      return { d: 'M' + p0.x + ',' + p0.y + ' C' + c0.x + ',' + c0.y + ' ' + c1.x + ',' + c1.y + ' ' + p1.x + ',' + p1.y, mid: bez(p0, c0, c1, p1, 0.5) };
    }
    var fwd = B.col > A.col || (B.col === A.col && B.row > A.row);
    // Forward lines leave the right edge high; backward lines leave the left edge low,
    // so a pair of pages linked both ways never shares a track.
    var sy = a.imgTop + (a.h - (a.imgTop - a.y)) * (fwd ? 0.30 : 0.62);
    var ty = b.imgTop + (b.h - (b.imgTop - b.y)) * (fwd ? 0.30 : 0.62);
    var p0 = fwd ? { x: a.x + a.w, y: sy } : { x: a.x, y: sy };
    var p1 = fwd ? { x: b.x - 10, y: ty } : { x: b.x + b.w + 10, y: ty };
    var dx = Math.max(80, Math.abs(p1.x - p0.x) * 0.45) * (fwd ? 1 : -1);
    var c0 = { x: p0.x + dx, y: p0.y }, c1 = { x: p1.x - dx, y: p1.y };
    return { d: 'M' + p0.x + ',' + p0.y + ' C' + c0.x + ',' + c0.y + ' ' + c1.x + ',' + c1.y + ' ' + p1.x + ',' + p1.y, mid: bez(p0, c0, c1, p1, 0.5) };
  }
  function drawEdges() {
    svg.innerHTML = '<defs>' + ['some', 'none', 'on'].map(function (c) {
      return '<marker id="arrow-' + c + '" class="' + c + '" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z"/></marker>';
    }).join('') + '</defs>';
    var ordered = G.edges.slice().sort(function (a, b) { return (a.count || 0) - (b.count || 0); });
    ordered.forEach(function (e) {
      var g = document.createElementNS(NS, 'g'), geo = geometry(e), c = cls(e);
      g.setAttribute('class', 'edge ' + c); g.dataset.id = e.id;
      var w = width(e), m = c === 'some' ? 'some' : 'none';
      g.innerHTML = '<path class="line" d="' + geo.d + '" stroke-width="' + w + '" marker-end="url(#arrow-' + m + ')"/>' +
        '<path class="hit" d="' + geo.d + '" stroke-width="' + Math.max(18, w + 10) + '"/>';
      var label = fmt(e.count), lw = label.length * 7.9 + 14;
      g.innerHTML += '<rect class="pill" x="' + (geo.mid.x - lw / 2) + '" y="' + (geo.mid.y - 11) + '" width="' + lw + '" height="22" rx="11"/>' +
        '<text x="' + geo.mid.x + '" y="' + (geo.mid.y + 4.5) + '" text-anchor="middle">' + esc(label) + '</text>';
      g.querySelector('.hit').addEventListener('click', function (ev) { if (!moved) select({ edge: e.id }); ev.stopPropagation(); });
      g.querySelector('.hit').style.pointerEvents = 'stroke';
      svg.appendChild(g);
    });
  }

  // ── Selection and detail ──
  function select(s) { selected = s; paintSelection(); showDetail(); }
  function paintSelection() {
    var focusNodes = null, focusEdges = null;
    if (selected && selected.edge) { var e = G.edges.filter(function (x) { return x.id === selected.edge; })[0]; focusEdges = [e.id]; focusNodes = [e.source, e.target]; }
    if (selected && selected.node) {
      focusNodes = [selected.node]; focusEdges = [];
      G.edges.forEach(function (e) { if (e.source === selected.node || e.target === selected.node) { focusEdges.push(e.id); focusNodes.push(e.source, e.target); } });
    }
    Object.keys(nodeEls).forEach(function (id) {
      nodeEls[id].classList.toggle('on', !!selected && selected.node === id);
      nodeEls[id].classList.toggle('dim', !!focusNodes && focusNodes.indexOf(id) < 0);
    });
    svg.querySelectorAll('.edge').forEach(function (g) {
      var on = !!focusEdges && focusEdges.indexOf(g.dataset.id) >= 0;
      g.classList.toggle('on', on && !!selected.edge);
      g.classList.toggle('dim', !!focusEdges && !on);
      var line = g.querySelector('.line');
      if (on && selected.edge && !g.classList.contains('none')) line.setAttribute('marker-end', 'url(#arrow-on)');
      else line.setAttribute('marker-end', 'url(#arrow-' + (g.classList.contains('some') ? 'some' : 'none') + ')');
    });
  }
  function partsTable(parts) {
    return '<table>' + parts.map(function (p) { return '<tr><td><code>' + esc(p.from) + '</code></td><td class="n">' + fmt(p.count) + '</td></tr>'; }).join('') + '</table>';
  }
  function showDetail() {
    if (!selected) { detail.hidden = true; return; }
    var h = '<button type="button" class="close" id="detail-close" aria-label="Close detail">&times;</button>';
    if (selected.edge) {
      var e = G.edges.filter(function (x) { return x.id === selected.edge; })[0];
      var A = nodeById[e.source], B = nodeById[e.target];
      h += '<p class="kicker">' + esc(e.event) + '</p><h2>' + esc(A.label) + (e.source === e.target ? ' &#8635; another' : ' &rarr; ' + esc(B.label)) + '</h2>' +
        '<p>' + (e.count == null ? 'No click data for this line.' : fmt(e.count) + ' clicks, ' + esc(M.periodLabel) + '.') + '</p>' +
        '<p class="muted">By the surface the click came from:</p>' + partsTable(e.parts);
    } else {
      var n = nodeById[selected.node], t = tally(n.id);
      h += '<p class="kicker">' + esc(n.route) + '</p><h2>' + esc(n.label) + '</h2><p>' + esc(n.note) + '</p>';
      if (t) h += '<p>' + fmt(t.inn) + ' clicks arrived from other pages on the canvas; ' + fmt(t.out) + ' left for them.</p>';
      var outs = G.edges.filter(function (e) { return e.source === n.id; });
      if (outs.length) h += '<p class="muted">Routes out of this page:</p><table>' + outs.map(function (e) {
        return '<tr><td>' + esc(e.source === e.target ? 'another ' + n.label.toLowerCase() : nodeById[e.target].label) + ' <span class="muted">(' + esc(e.event) + ')</span></td><td class="n">' + fmt(e.count) + '</td></tr>';
      }).join('') + '</table>';
    }
    detail.innerHTML = h; detail.hidden = false;
    document.getElementById('detail-close').addEventListener('click', function () { select(null); });
  }

  // ── Key ──
  function drawKey() {
    var swatch = function (c, w) { return '<svg viewBox="0 0 44 12" aria-hidden="true"><line x1="2" y1="6" x2="42" y2="6" stroke="var(--' + c + ')" stroke-width="' + w + '" stroke-linecap="round"' + (c === 'ink-faint' ? ' stroke-dasharray="5 6"' : '') + '/></svg>'; };
    var h = '<button type="button" class="close" id="key-close" aria-label="Hide key">&times;</button><p class="kicker">Key</p>' +
      '<div class="swatches">' + swatch('gold', 9) + '<span>Clicks; thicker means more</span>' + swatch('gold', 2) + '<span>A few clicks</span>' +
      swatch('ink-faint', 1.6) + '<span>Route exists, no clicks counted</span></div>' +
      '<p class="muted">Tap a page or a line for detail. Drag to move; scroll or pinch to zoom.</p>';
    if (G.offCanvas.length) {
      h += '<h3>Clicks from pages not on the canvas</h3><table>' + G.offCanvas.map(function (o) {
        return '<tr><td><code>' + esc(o.from) + '</code> <span class="muted">' + esc(o.event) + '</span></td><td class="n">' + fmt(o.count) + '</td></tr>';
      }).join('') + '</table>';
    }
    if (G.unknown.length) {
      h += '<h3>Values outside the recorded vocabulary</h3><table>' + G.unknown.map(function (o) {
        return '<tr><td><code>' + esc(o.from) + '</code> <span class="muted">' + esc(o.event) + '</span></td><td class="n">' + fmt(o.count) + '</td></tr>';
      }).join('') + '</table>';
    }
    if (G.coverage.length) {
      h += '<h3>How much of each event the lines account for</h3><table>' + G.coverage.map(function (c) {
        return '<tr><td><code>' + esc(c.event) + '</code></td><td class="n">' + fmt(c.attributed) + ' of ' + fmt(c.total) + '</td></tr>';
      }).join('') + '</table>';
    }
    (M.notes || []).forEach(function (n) { h += '<p class="muted">' + esc(n) + '</p>'; });
    key.innerHTML = h;
    document.getElementById('key-close').addEventListener('click', function () { setKey(false); });
  }
  var keyToggle = document.getElementById('key-toggle');
  function setKey(on) { key.hidden = !on; keyToggle.setAttribute('aria-expanded', String(on)); try { localStorage.setItem('site-canvas-key', on ? '1' : '0'); } catch (e) {} if (rects && Object.keys(rects).length) fit(true); }
  keyToggle.addEventListener('click', function () { setKey(key.hidden); });

  // ── Pan and zoom ──
  function apply(ease) { world.classList.toggle('ease', !!ease); world.style.transform = 'translate(' + view.x + 'px,' + view.y + 'px) scale(' + view.k + ')'; }
  function bounds() {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    Object.keys(rects).forEach(function (id) { var r = rects[id]; x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y - 170); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); });
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  function fit(ease) {
    // On a wide screen the open key sits beside the board, so fit into the space right of it.
    var b = bounds(), H = stage.clientHeight, pad = 28;
    var left = (!key.hidden && stage.clientWidth > 900) ? key.offsetWidth + 24 : 0, W = stage.clientWidth - left;
    view.k = Math.min((W - pad * 2) / b.w, (H - pad * 2) / b.h, 1.2);
    view.x = left + (W - b.w * view.k) / 2 - b.x * view.k; view.y = (H - b.h * view.k) / 2 - b.y * view.k; apply(ease);
  }
  function zoomAt(f, cx, cy, ease) {
    var k = Math.min(3, Math.max(0.08, view.k * f)); f = k / view.k;
    view.x = cx - (cx - view.x) * f; view.y = cy - (cy - view.y) * f; view.k = k; apply(ease);
  }
  document.getElementById('zoom-in').addEventListener('click', function () { zoomAt(1.25, stage.clientWidth / 2, stage.clientHeight / 2, true); });
  document.getElementById('zoom-out').addEventListener('click', function () { zoomAt(0.8, stage.clientWidth / 2, stage.clientHeight / 2, true); });
  document.getElementById('zoom-fit').addEventListener('click', function () { fit(true); });
  stage.addEventListener('wheel', function (ev) {
    ev.preventDefault(); var r = stage.getBoundingClientRect();
    zoomAt(Math.exp(-ev.deltaY * (ev.ctrlKey ? 0.01 : 0.0015)), ev.clientX - r.left, ev.clientY - r.top);
  }, { passive: false });
  var pts = {}, last = null, moved = false, startPt = null;
  function inPanel(t) { return t.closest && t.closest('.panel'); }
  stage.addEventListener('pointerdown', function (ev) {
    if (inPanel(ev.target)) return;
    pts[ev.pointerId] = { x: ev.clientX, y: ev.clientY }; moved = false; startPt = { x: ev.clientX, y: ev.clientY };
    last = null; stage.classList.add('dragging');
  });
  window.addEventListener('pointermove', function (ev) {
    if (!pts[ev.pointerId]) return;
    var prev = pts[ev.pointerId]; pts[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
    if (Math.abs(ev.clientX - startPt.x) + Math.abs(ev.clientY - startPt.y) > 6) moved = true;
    var ids = Object.keys(pts);
    if (ids.length === 2) {
      var a = pts[ids[0]], b = pts[ids[1]], d = Math.hypot(a.x - b.x, a.y - b.y), r = stage.getBoundingClientRect();
      if (last) zoomAt(d / last, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      last = d;
    } else if (ids.length === 1) { view.x += ev.clientX - prev.x; view.y += ev.clientY - prev.y; apply(); }
  });
  function up(ev) { delete pts[ev.pointerId]; last = null; if (!Object.keys(pts).length) stage.classList.remove('dragging'); }
  window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  stage.addEventListener('click', function (ev) { if (!moved && !inPanel(ev.target) && selected) select(null); });

  // ── Width mode ──
  function setMode(m) {
    mode = m;
    document.getElementById('mode-phone').setAttribute('aria-pressed', String(m === 'phone'));
    document.getElementById('mode-desktop').setAttribute('aria-pressed', String(m === 'desktop'));
    try { localStorage.setItem('site-canvas-mode', m); } catch (e) {}
    drawNodes(); drawEdges(); paintSelection(); fit(false);
  }
  document.getElementById('mode-phone').addEventListener('click', function () { setMode('phone'); });
  document.getElementById('mode-desktop').addEventListener('click', function () { setMode('desktop'); });

  drawKey();
  var keyPref = null; try { keyPref = localStorage.getItem('site-canvas-key'); } catch (e) {}
  setKey(keyPref === null ? stage.clientWidth > 900 : keyPref === '1');
  setMode(mode);
  window.addEventListener('resize', function () { fit(false); });
})();
`
