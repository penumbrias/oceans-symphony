// Turning a classic profile into the garden layout (v0.297.0) — the pure
// half. No imports beyond profileBoard.js, so
// scripts/test-profile-board.mjs runs it under plain node.
//
// A classic bio is one record field holding blocks (text, a picture beside
// text, a picture, a gallery, a divider, raw HTML). Converting lays those
// blocks out as widgets that move freely:
//   • the first text becomes the Bio entry (the description field); each
//     later text becomes an entry of the alter's own ("Bio 2", "Bio 3"…),
//     each shown by an Info widget;
//   • a picture or gallery becomes a Media widget (and joins their
//     Pictures);
//   • a picture beside text becomes a Media widget beside an Info widget;
//   • a divider stays a divider.
// The original bio is kept on the record (`bio_before_conversion`) and the
// whole step can be undone (profileConvertRun.js).

import { GARDEN_ALTER_PROFILE_PAGES, profilePageId, seedProfileBoard } from "./profileBoard.js";

const hasText = (html) => !!String(html || "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();

// blocks (from htmlToBlocks) → parts in page order.
//   { kind: "text", html } | { kind: "media", items, arrange } |
//   { kind: "side", html, item, imageFirst } | { kind: "divider" }
export function planFromBlocks(blocks) {
  const parts = [];
  for (const b of Array.isArray(blocks) ? blocks : []) {
    if (!b || typeof b !== "object") continue;
    if (b.type === "text" || b.type === "raw") {
      if (hasText(b.content) || /<img|<iframe|<video/i.test(b.content || "")) parts.push({ kind: "text", html: b.content });
    } else if (b.type === "img-solo") {
      if (b.src) parts.push({ kind: "media", items: [{ src: b.src, kind: "image", caption: "" }], arrange: "slideshow" });
    } else if (b.type === "gallery") {
      const items = (b.images || []).filter((i) => i?.src).map((i) => ({ src: i.src, kind: "image", caption: "" }));
      if (items.length) parts.push({ kind: "media", items, arrange: "grid" });
    } else if (b.type === "img-left" || b.type === "img-right") {
      const item = b.src ? { src: b.src, kind: "image", caption: "" } : null;
      if (item && hasText(b.text)) parts.push({ kind: "side", html: b.text, item, imageFirst: b.type === "img-left" });
      else if (item) parts.push({ kind: "media", items: [item], arrange: "slideshow" });
      else if (hasText(b.text)) parts.push({ kind: "text", html: b.text });
    } else if (b.type === "divider") {
      parts.push({ kind: "divider" });
    }
  }
  // A divider at either end separates nothing.
  while (parts[0]?.kind === "divider") parts.shift();
  while (parts.length && parts[parts.length - 1].kind === "divider") parts.pop();
  return parts;
}

export const picturesOfParts = (parts) => parts.flatMap((p) => (p.kind === "media" ? p.items : p.kind === "side" ? [p.item] : []))
  .map((i) => i.src).filter((src, i, all) => src && all.indexOf(src) === i);

// The entry names texts after the first get, never one the alter already
// has.
export function entryNamesFor(count, takenNames = []) {
  const taken = new Set(takenNames);
  const names = [];
  let n = 2;
  while (names.length < count) {
    const name = `Bio ${n}`;
    if (!taken.has(name)) names.push(name);
    n += 1;
  }
  return names;
}

// The widgets for the parts, top to bottom from `y`. Texts are read off
// `textEntryIds` (bio, own:Bio 2, …) in order.
export function widgetsForParts(parts, textEntryIds, { y = 0, idPrefix = "conv" } = {}) {
  const out = [];
  let t = 0;
  let n = 0;
  const id = () => `${idPrefix}_${n += 1}`;
  const info = (entryId, span, x = 0) => ({
    instanceId: id(), widgetId: "info", span, pos: { x, y }, mode: "normal",
    settings: { entries: [entryId], layout: "plain" },
  });
  const media = (p, span, x = 0) => ({
    instanceId: id(), widgetId: "media", span, pos: { x, y }, mode: "normal",
    settings: { items: p.items || [p.item], arrange: p.arrange || "slideshow", fit: "contain", autoFit: false },
  });
  for (const p of parts) {
    if (p.kind === "text") {
      out.push(info(textEntryIds[t++] || "bio", { cols: 12, rows: 2 }));
      y += 2;
    } else if (p.kind === "media") {
      out.push(media(p, { cols: 12, rows: p.arrange === "grid" ? 3 : 4 }));
      y += p.arrange === "grid" ? 3 : 4;
    } else if (p.kind === "side") {
      const pic = media(p, { cols: 4, rows: 3 }, p.imageFirst ? 0 : 8);
      const txt = info(textEntryIds[t++] || "bio", { cols: 8, rows: 3 }, p.imageFirst ? 4 : 0);
      out.push(...(p.imageFirst ? [pic, txt] : [txt, pic]));
      y += 3;
    } else if (p.kind === "divider") {
      out.push({ instanceId: id(), widgetId: "divider", span: { cols: 12, rows: 1 }, pos: { x: 0, y }, mode: "normal", settings: {} });
      y += 1;
    }
  }
  return { widgets: out, height: y };
}

const isBioWidget = (w) => w?.widgetId === "profile_bio"
  || (w?.widgetId === "info" && Array.isArray(w.settings?.entries) && w.settings.entries.length === 1 && w.settings.entries[0] === "bio");
const isGardenPictures = (w) => w?.widgetId === "media" && w.settings?.source === "pictures";

// The board after converting. `base` is what the profile shows now (its own
// layout, the type's default, or null for the seed). Every bio widget is
// replaced by the parts' widgets, everything below moves down to make room;
// with no bio widget anywhere they go on the first page under the header.
// When the parts show pictures, a garden "their Pictures" widget is left
// out so the pictures don't show twice.
export function convertBoard(base, record, newWidgets) {
  const board = base && typeof base === "object"
    ? JSON.parse(JSON.stringify(base))
    : seedProfileBoard({ ...record, profile_layout: "garden" }, "alter");
  delete board._seeded;
  const showsPictures = newWidgets.some((w) => w.widgetId === "media");
  const height = newWidgets.reduce((m, w) => Math.max(m, (w.pos?.y || 0) + (w.span?.rows || 1)), 0);
  // Put the new widgets at row `at` of a page, moving everything at or
  // below `from` down by `shift`.
  const insert = (widgets, at, from, shift, suffix) => [
    ...widgets.map((w) => ((w.pos?.y || 0) >= from ? { ...w, pos: { ...w.pos, y: (w.pos?.y || 0) + shift } } : w)),
    ...newWidgets.map((w) => ({ ...w, instanceId: `${w.instanceId}${suffix}`, pos: { x: w.pos?.x || 0, y: at + (w.pos?.y || 0) } })),
  ];
  let placed = false;
  board.pages = (board.pages || []).map((page, pageIndex) => {
    let widgets = Array.isArray(page.widgets) ? page.widgets : [];
    if (showsPictures) widgets = widgets.filter((w) => !isGardenPictures(w));
    const bios = widgets.filter(isBioWidget).sort((a, b) => (b.pos?.y || 0) - (a.pos?.y || 0));
    if (!bios.length) return { ...page, widgets };
    let out = widgets.filter((w) => !isBioWidget(w));
    // Bottom-most first, so each insert only moves what is below it.
    bios.forEach((bio, i) => {
      const at = bio.pos?.y || 0;
      const rows = bio.span?.rows || 2;
      out = insert(out, at, at + rows, Math.max(0, height - rows), pageIndex || i ? `_${pageIndex}_${i}` : "");
    });
    placed = true;
    return { ...page, widgets: out };
  });
  if (!placed && board.pages.length) {
    const first = board.pages[0];
    const header = (first.widgets || []).find((w) => w.widgetId === "profile_header");
    const at = header ? (header.pos?.y || 0) + (header.span?.rows || 2) : 0;
    first.widgets = insert(first.widgets || [], at, at, height, "");
  }
  if (!board.defaultPageId) board.defaultPageId = profilePageId(GARDEN_ALTER_PROFILE_PAGES[0].tab);
  return board;
}

