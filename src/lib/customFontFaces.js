// Applies uploaded custom fonts to the page via a single injected <style>
// tag of @font-face rules, one per stored CustomFont record. Kept separate
// from the IndexedDB CRUD (localFontStorage.js) the same way fontPacks.js
// is kept separate from image CRUD.

import { getAllLocalFonts } from "./localFontStorage";

const STYLE_ID = "symphony-custom-fonts";
const FORMAT_CSS = { ttf: "truetype", otf: "opentype", woff: "woff", woff2: "woff2" };

// Stable, collision-proof synthetic family name — sidesteps sanitizing
// arbitrary user filenames into valid CSS font-family identifiers, and
// can't collide with any bundled/Google font name.
export function customFontFamilyCss(id) {
  return `"symphony-custom-${id}", sans-serif`;
}

function buildFontFaceCss(records, fontsById) {
  return records.map((r) => {
    const dataUrl = fontsById[r.id];
    if (!dataUrl) return "";
    const fmt = FORMAT_CSS[r.format] || "woff2";
    return `@font-face { font-family: "symphony-custom-${r.id}"; src: url("${dataUrl}") format("${fmt}"); font-display: swap; }`;
  }).join("\n");
}

// Re-fetches CustomFont records + their bytes and rewrites the injected
// style tag. Best-effort/non-blocking — safe to call from a post-boot
// effect, after an upload, or after a delete. Returns the records so
// callers can reuse them instead of a second query.
export async function refreshCustomFontFaces() {
  const { base44 } = await import("@/api/base44Client");
  const records = await base44.entities.CustomFont.list();
  const fontsById = await getAllLocalFonts();
  let styleEl = document.getElementById(STYLE_ID);
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = STYLE_ID;
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = buildFontFaceCss(records, fontsById);
  return records;
}
