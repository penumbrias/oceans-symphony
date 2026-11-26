// The house's System map room: the pure rules (tested by
// scripts/test-house-map.mjs). What the address means, how the room words
// what's on the map, the tools' keys and the overview's sums. Nothing here
// reads or writes a record.

export const MAP_VIEWS = Object.freeze(["inner", "together", "list"]);

// The old page's address: ?view=inner (every link into the inner world
// uses it) and nothing for the "who fronts together" map. The house adds
// ?view=list for the text list. With no ?view the house opens on the inner
// world (board 02's title), or on the list when Accessibility mode is on,
// as the old page's inner world did.
export function mapViewOf(search, { a11y = false } = {}) {
  let v = null;
  try { v = new URLSearchParams(search || "").get("view"); } catch { /* bad search */ }
  if (v === "inner" || v === "canvas") return "inner";
  if (v === "analytics" || v === "together") return "together";
  if (v === "list") return "list";
  return a11y ? "list" : "inner";
}

/** The address of a view (the one-visit map/layer/solo landing is left behind). */
export function mapViewHref(view) {
  if (view === "together") return "/system-map?view=analytics";
  if (view === "list") return "/system-map?view=list";
  return "/system-map?view=inner";
}

/** The deep link a place or a widget opens with: which map and layer, alone or not. */
export function mapLanding(search) {
  let q;
  try { q = new URLSearchParams(search || ""); } catch { q = new URLSearchParams(); }
  return { mapId: q.get("map") || null, layerId: q.get("layer") || null, solo: q.get("solo") === "1" };
}

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Board 02's status line, left to right. */
export function statusWords({ mapName, layerName, cursor, placed, total, rels, viewOnly, scale, snap, snapPx }) {
  const left = [
    `${mapName || "Map"} / ${layerName || "No layer"}`,
    cursor ? `x ${Math.round(cursor.x)} y ${Math.round(cursor.y)}` : null,
    `${placed} of ${total} placed`,
    `${plural(rels, "relationship line")}`,
    viewOnly ? "Viewing only" : null,
  ].filter(Boolean);
  const right = [zoomWords(scale), snap ? `Snap to ${snapPx} px` : "Snap off"];
  return { left, right };
}

export function zoomWords(scale) {
  const s = Number(scale);
  return `Zoom ${Number.isFinite(s) ? Math.round(s * 100) : 100}%`;
}

/** The line over the canvas: what the tool is waiting for, or the backdrop. */
export function canvasLine({ tool, placingName, linkFromName, layerName, soloName, backdropCount = 0, backdropLocked = false, terms = {} }) {
  const alter = terms.alter || "alter";
  if (tool === "place" && placingName) return { kind: "tool", text: `Tap the map where ${placingName} goes on ${layerName || "this layer"}.` };
  if (tool === "place") return { kind: "tool", text: `Pick who to place, then tap the map.` };
  if (tool === "link" && linkFromName) return { kind: "tool", text: `Tap the ${alter} to link with ${linkFromName}.` };
  if (tool === "link") return { kind: "tool", text: `Link: tap the first ${alter}.` };
  if (soloName) return { kind: "solo", text: `Only ${soloName} is showing.` };
  if (backdropCount > 0) return { kind: "backdrop", text: `Backdrop: ${plural(backdropCount, "picture")} on ${layerName || "this layer"}${backdropLocked ? " (locked)" : ""}` };
  return null;
}

/** What "Relationship lines" shows: everyone's, the picked one's, or none. */
export function relModeWords(mode) {
  if (mode === "selected") return "the picked one's";
  if (mode === "none") return "hidden";
  return "all";
}

/** The phone canvas's chip: "Viewing | Ground floor, Garden". */
export function viewingWords({ layers = [], soloName }) {
  if (soloName) return { lead: "Only", names: soloName };
  const shown = layers.filter((l) => l.is_visible).map((l) => l.name || "Layer");
  return { lead: "Viewing", names: shown.length ? shown.join(", ") : "no layers" };
}

// The studio's keys (board 02's tool column). Only plain keys: a modifier
// is the browser's or the frame's (Ctrl+K is Search).
export const MAP_KEYS = Object.freeze({
  v: "move", p: "place", l: "addPlace", r: "link", b: "addPicture", g: "snap",
  "+": "zoomIn", "=": "zoomIn", "-": "zoomOut", "0": "reset", f: "fit", escape: "cancel",
});

export function mapKeyAction(e) {
  if (!e || e.ctrlKey || e.metaKey || e.altKey) return null;
  const t = e.target;
  const tag = String(t?.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select" || t?.isContentEditable) return null;
  if (t?.closest?.('[role="dialog"], [role="menu"], [role="listbox"]')) return null;
  return MAP_KEYS[String(e.key || "").toLowerCase()] || null;
}

// ── The overview (board 02's bottom-right box) ─────────────────────────
// Boxes for the places and pictures on the shown layers, dots for who's
// placed, and the frame of what's on screen, fitted into W×H.
export function overviewGeometry({ locations = [], images = [], placements = [], shownLayerIds, colourOf = () => null, transform = { x: 0, y: 0, scale: 1 }, canvas = { w: 800, h: 600 }, W = 160, H = 88 }) {
  const shown = (l) => !shownLayerIds || shownLayerIds.has(l);
  const boxes = [
    ...images.filter((im) => shown(im.layer_id)).map((im) => ({ x: im.x ?? 0, y: im.y ?? 0, w: im.width || 200, h: im.height || 150, c: null })),
    ...locations.filter((l) => shown(l.layer_id)).map((l) => ({ x: l.x ?? 0, y: l.y ?? 0, w: l.width || 200, h: l.height || 150, c: l.color || "#6366f1" })),
  ];
  const dots = placements.filter((p) => shown(p.layer_id) && colourOf(p.alter_id) !== undefined)
    .map((p) => ({ x: p.x ?? 0, y: p.y ?? 0, c: colourOf(p.alter_id) || "#8b5cf6" }));
  const scale = Number(transform.scale) > 0 ? Number(transform.scale) : 1;
  const view = { x: -(transform.x || 0) / scale, y: -(transform.y || 0) / scale, w: (canvas.w || 800) / scale, h: (canvas.h || 600) / scale };
  const all = [...boxes, ...dots.map((d) => ({ x: d.x, y: d.y, w: 1, h: 1 })), view];
  const minX = Math.min(...all.map((b) => b.x)), minY = Math.min(...all.map((b) => b.y));
  const maxX = Math.max(...all.map((b) => b.x + b.w)), maxY = Math.max(...all.map((b) => b.y + b.h));
  const k = Math.min(W / Math.max(1, maxX - minX), H / Math.max(1, maxY - minY));
  const ox = (W - (maxX - minX) * k) / 2, oy = (H - (maxY - minY) * k) / 2;
  const sx = (x) => ox + (x - minX) * k, sy = (y) => oy + (y - minY) * k;
  return {
    W, H,
    boxes: boxes.map((b) => ({ x: sx(b.x), y: sy(b.y), w: Math.max(2, b.w * k), h: Math.max(2, b.h * k), c: b.c })),
    dots: dots.map((d) => ({ x: sx(d.x), y: sy(d.y), c: d.c })),
    view: { x: sx(view.x), y: sy(view.y), w: view.w * k, h: view.h * k },
    /** The world point under a click in the overview. */
    toWorld: (ux, uy) => ({ x: minX + (ux - ox) / k, y: minY + (uy - oy) / k }),
  };
}

/** A relationship in words: "Ash → River (protects)". */
export function relationshipWords(rel, nameOf = (id) => id) {
  if (!rel) return "";
  const a = nameOf(rel.alter_id_a) || "?";
  const b = nameOf(rel.alter_id_b) || "?";
  const arrow = rel.direction === "bidirectional" ? "↔" : "→";
  const [from, to] = rel.direction === "b_to_a" ? [b, a] : [a, b];
  const label = rel.relationship_type === "Custom" ? (rel.custom_label || "Custom") : (rel.relationship_type || "Related");
  return `${from} ${arrow} ${to} (${label})`;
}
