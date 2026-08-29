// Setup packs — shareable home-screen/theme bundles ("like downloading a
// texture pack"). Three independent types, combinable per export and
// re-choosable per import:
//
//   layout       — which widgets sit on a page, where, at what size/mode
//   widgetStyles — the user's named widget looks (colours, fonts, borders…)
//   uiTheme      — the Display-options state (tokens, bars, bar looks)
//
// HARD RULE: a pack NEVER carries personal data. Sanitizers below strip
// every settings key that references the user's own records (journals,
// groups, symptoms, contacts, maps…) and every local image reference
// (local-image:// ids are meaningless — and private — outside this device).
// The export/import UI shows the full pack JSON for review before anything
// leaves or lands.
//
// Saved packs live in SystemSettings.ui_v2_setup_packs (rides backups).

import { LOOK_KEYS } from "@/lib/widgetLook";
import { V2_TOKEN_DEFS } from "@/lib/uiV2";
import { findFreeCell } from "@/lib/experimentalHome";
import { getAccessibilitySettings, setAccessibilityFontFamily, setAccessibilityHeadingFont } from "@/lib/useAccessibility";

export const PACK_FORMAT = "symphony_setup_pack";
export const PACK_VERSION = 1;

// Widget-settings keys that point at the USER'S OWN records or content.
// Anything listed is dropped from layout exports. Kept conservative and
// explicit — new personal keys must be added here when widgets grow them.
const PERSONAL_SETTING_KEYS = new Set([
  "journal", "boards", "groupId", "symptomIds", "appIds", "links", "label",
  "mapId", "layerId", "targetId", "song", "pinnedAvatars", "avatarOverride",
  "notebookAlters", "alterId", "contactIds",
]);

// TWO local-image shapes exist: the canonical "/local-image/<id>"
// (createLocalImageUrl, service-worker interceptable) and the legacy
// "local-image://<id>". Only the legacy one was ever matched here, so
// modern image paths sailed straight through packs — meaningless on the
// receiving device, and a device reference in something meant to carry
// none.
const localImageId = (v) => {
  if (typeof v !== "string") return null;
  if (v.startsWith("/local-image/")) return decodeURIComponent(v.slice("/local-image/".length));
  if (v.startsWith("local-image://")) return v.slice("local-image://".length);
  return null;
};
const isLocalRef = (v) => typeof v === "string" && (localImageId(v) !== null || v.startsWith("folder://") || v.startsWith("data:"));

// Deep-scrub: drop any local-image:// / folder:// / data: string anywhere
// in a nested look object (board background layers etc.) while keeping
// plain colours/numbers.
// imageRefs (optional): when present, a device image reference is KEPT
// as an archive-relative pack-image://N and its id recorded, instead of
// being dropped. That is the whole difference between a pack that
// carries pictures and one that can't.
function packImageRef(value, imageRefs) {
  const id = imageRefs ? localImageId(value) : null;
  if (!id) return null;
  let i = imageRefs.indexOf(id);
  if (i === -1) { imageRefs.push(id); i = imageRefs.length - 1; }
  return `${PACK_IMAGE_PREFIX}${i}`;
}

function scrubLocalRefs(value, imageRefs = null) {
  if (isPackImageRef(value)) return value;
  const mapped = packImageRef(value, imageRefs);
  if (mapped) return mapped;
  if (isLocalRef(value)) return undefined;
  if (Array.isArray(value)) return value.map((v) => scrubLocalRefs(v, imageRefs)).filter((v) => v !== undefined);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const c = scrubLocalRefs(v, imageRefs);
      if (c !== undefined) out[k] = c;
    }
    return out;
  }
  return value;
}

// Per-widget appearance keys (colours, fonts, borders…) plus the saved-style
// reference. A LAYOUT export carries them only when the user opts in — "my
// widget layout export included colours I never asked to share" (owner).
const LOOK_SETTING_KEYS = new Set([...LOOK_KEYS, "style"]);

function sanitizeSettings(settings = {}, { includeLook = false, widgetId = null, dropped = null, imageRefs = null } = {}) {
  const out = {};
  for (const [k, v] of Object.entries(settings)) {
    // App shortcuts: targetId names an APP PAGE (nav-catalogue slug),
    // not a user record — stripping it shipped dead "Missing shortcut"
    // tiles. Every other widget's targetId stays stripped (could be a
    // record id).
    if (k === "targetId" && widgetId === "app_shortcut" && typeof v === "string" && !/^[0-9a-f-]{30,}$/i.test(v)) { out[k] = v; continue; }
    if (PERSONAL_SETTING_KEYS.has(k)) continue;
    if (!includeLook && LOOK_SETTING_KEYS.has(k)) continue;
    if (isPackImageRef(v)) { out[k] = v; continue; }
    const mappedImg = packImageRef(v, imageRefs);
    if (mappedImg) { out[k] = mappedImg; continue; }
    if (isLocalRef(v)) { if (dropped) dropped.images += 1; continue; }
    if (v && typeof v === "object") continue; // nested structures are where ids hide
    out[k] = v;
  }
  return out;
}

function sanitizeLook(look = {}) {
  const out = {};
  for (const [k, v] of Object.entries(look)) {
    if (isLocalRef(v)) continue;
    out[k] = v;
  }
  return out;
}

// ── Builders ───────────────────────────────────────────────────────
export function buildLayoutType(home, { includeLook = false, userStyles = [], imageRefs = null } = {}) {
  // Pictures are files on ONE device (local-image:// ids mean nothing
  // anywhere else), so they never travel. Counting what got dropped
  // turns that from a nasty surprise on the other end into something
  // both sides are told about up front.
  const dropped = { images: 0 };
  const pages = (home?.pages || []).map((p) => ({
    layoutMode: p.layoutMode || "flow",
    widgets: (p.widgets || []).map((w) => ({
      widgetId: w.widgetId,
      span: w.span || null,
      pos: w.pos || null,
      mode: w.mode || "normal",
      settings: sanitizeSettings(w.settings || {}, { includeLook, widgetId: w.widgetId, dropped, imageRefs }),
    })),
  }));
  const wallpaperRef = packImageRef(home?.wallpaper?.url, imageRefs);
  if (!wallpaperRef && (isLocalRef(home?.wallpaper?.url) || home?.wallpaper?.folder)) dropped.images += 1;
  const out = { pages, grid: home?.grid || null };
  if (dropped.images) out.omittedImages = dropped.images;
  // Appearance is only real if the styles it references travel too: a
  // widget styled via a saved style ("user:<id>") carries just the ref —
  // bundle the referenced definitions so layout+appearance is
  // self-contained even when "Widget styles" isn't ticked.
  if (includeLook) {
    const refIds = new Set();
    for (const p of pages) for (const w of p.widgets) {
      const st = w.settings?.style;
      if (typeof st === "string" && st.startsWith("user:")) refIds.add(st.slice(5));
    }
    const bundled = (userStyles || []).filter((st) => refIds.has(st.id))
      .map((st) => ({ id: st.id, label: st.label, look: sanitizeLook(st.look || {}) }));
    if (bundled.length) out.styles = bundled;
  }
  // Board-level surface: the page background (gradient layers — image
  // urls scrubbed) and the board style, carried only with appearance —
  // without them a themed board arrived as bare widgets on a default
  // ground (owner screenshots).
  if (includeLook) {
    const rawLook = { styleMode: home?.styleMode || null, background: home?.background || null };
    const rawStr = JSON.stringify(rawLook) || "";
    const scrubbed = scrubLocalRefs(rawLook, imageRefs);
    // Only count what actually got dropped — anything mapped into the
    // archive is travelling, not missing.
    const stillMissing = (JSON.stringify(scrubbed) || "").match(/local-image:\/\/|\/local-image\/|folder:\/\//g) || [];
    const before = (rawStr.match(/local-image:\/\/|\/local-image\/|folder:\/\/|data:image/g) || []).length;
    const omitted = imageRefs ? stillMissing.length : before;
    if (omitted) { dropped.images += omitted; }
    out.look = scrubbed;
    // The wallpaper only travels with the pictures.
    if (wallpaperRef) out.wallpaper = { url: wallpaperRef };
    if (dropped.images) out.omittedImages = dropped.images; else delete out.omittedImages;
  }
  return out;
}

export function buildWidgetStylesType(userStyles = []) {
  return userStyles.map((s) => ({ id: s.id, label: s.label, look: sanitizeLook(s.look || {}) }));
}

export function buildUiThemeType(uiV2Raw = {}, appTheme = null, { imageRefs = null } = {}) {
  // The stored ui_v2 object minus anything device/personal: icon image
  // overrides (local images) are stripped; named lucide icons survive.
  const clone = JSON.parse(JSON.stringify(uiV2Raw || {}));
  if (clone.icons) {
    for (const group of Object.values(clone.icons)) {
      if (!group || typeof group !== "object") continue;
      for (const [id, icon] of Object.entries(group)) {
      if (!icon || typeof icon !== "object" || !isLocalRef(icon.imageUrl)) continue;
        const mapped = packImageRef(icon.imageUrl, imageRefs);
        if (mapped) group[id] = { ...icon, imageUrl: mapped };
        else delete group[id];
      }
    }
  }
  if (clone.barLooks) {
    for (const [barId, look] of Object.entries(clone.barLooks)) {
      clone.barLooks[barId] = sanitizeLook(look || {});
    }
  }
  delete clone.activeDockPos;
  delete clone.enabled;
  // The base colour scheme (theme mode + selected theme + custom colour
  // overrides) — plain hex values, applied via ThemeContext on import.
  if (appTheme) {
    // Fonts: the app-wide text faces live in the accessibility store
    // (font family + heading font) and ThemeContext (selectedFont) —
    // font NAMES only, never font files, so an uploaded custom font
    // falls back on the importing device. Sizes/contrast stay home:
    // accessibility settings belong to the user, not the theme.
    let a11y = {};
    try { a11y = getAccessibilitySettings() || {}; } catch { /* SSR */ }
    clone.appTheme = scrubLocalRefs({
      selectedTheme: appTheme.selectedTheme || null,
      themeMode: appTheme.themeMode || null,
      customColors: appTheme.customColors || null,
      selectedFont: appTheme.selectedFont || null,
      fontFamily: a11y.fontFamily || null,
      headingFont: a11y.headingFont || null,
    });
  }
  return clone;
}

export function buildPack({ title, layout = null, widgetStyles = null, uiTheme = null }) {
  const types = {};
  if (layout) types.layout = layout;
  if (widgetStyles) types.widgetStyles = widgetStyles;
  if (uiTheme) types.uiTheme = uiTheme;
  return {
    __format: PACK_FORMAT,
    __version: PACK_VERSION,
    title: String(title || "My setup").slice(0, 60),
    created: new Date().toISOString(),
    types,
  };
}

// ── Parse / summarize ──────────────────────────────────────────────
export function parsePack(text) {
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error("Not valid JSON."); }
  if (parsed?.__format !== PACK_FORMAT || !parsed.types || typeof parsed.types !== "object") {
    throw new Error("Not a Symphony setup pack.");
  }
  return parsed;
}

export function summarizePack(pack) {
  const t = pack?.types || {};
  const parts = [];
  if (t.layout) {
    const n = (t.layout.pages || []).reduce((s, p) => s + (p.widgets?.length || 0), 0);
    const styled = layoutHasLook(t.layout) || !!t.layout.look;
    parts.push(`Layout: ${t.layout.pages?.length || 0} page(s), ${n} widget(s)${styled ? " · appearance included" : " · appearance NOT included (tick \"Include widget appearance\" when sharing)"}`);
  }
  if (t.widgetStyles) parts.push(`Widget styles: ${t.widgetStyles.length} (${t.widgetStyles.map((s) => s.label).join(", ").slice(0, 80)})`);
  if (t.uiTheme) parts.push("UI theme: Display-options state (bars, tokens, looks)");
  return parts;
}

// Safety re-check on IMPORT too — a hand-edited pack could smuggle refs.
export function packLooksSafe(pack) {
  // pack-image://N is archive-relative and names no device or account —
  // unlike local-image:// (this device's store) or an inline data:image.
  const raw = JSON.stringify(pack.types || {}).split(PACK_IMAGE_PREFIX).join("");
  return !/local-image:\/\/|\/local-image\/|data:image|"secret"|"userId"/.test(raw);
}

// ── Applying a pack ────────────────────────────────────────────────
// ONE implementation for the import sheet AND the Presets section's
// saved-pack rows (rule: reuse, don't fork). Layout lands as NEW pages,
// styles merge by label (clashes skipped), uiTheme REPLACES ui_v2.
export function buildApplyPatch({ pack, which = {}, savePreset = false, settingsRow, imageMap = null }) {
  // Images arrived in the archive and were saved to this device first;
  // every pack-image:// reference becomes that local picture here.
  const t = imageMap && Object.keys(imageMap).length
    ? applyImageMap(pack?.types || {}, imageMap)
    : (pack?.types || {});
  const patch = {};
  // Styles first: layout widgets reference saved styles BY ID, and the
  // merge assigns new ids — the map lets the layout rewrite its refs
  // (unmapped refs used to dangle, so styled widgets fell back to
  // default on import — owner screenshots).
  const styleIdMap = {};
  {
    const incomingStyles = [
      ...(which.widgetStyles && t.widgetStyles ? t.widgetStyles : []),
      // Styles bundled inside the layout (referenced by its widgets)
      // ride whenever the layout's appearance is applied.
      ...(which.layout && !which.stripLayoutLook && Array.isArray(t.layout?.styles) ? t.layout.styles : []),
    ];
    if (incomingStyles.length) {
      const existing = Array.isArray(settingsRow?.ui_v2_styles) ? settingsRow.ui_v2_styles : [];
      const byLabel = Object.fromEntries(existing.map((s) => [s.label, s.id]));
      const merged = [...existing];
      for (const st of incomingStyles) {
        if (styleIdMap[st.id]) continue;
        if (byLabel[st.label]) { styleIdMap[st.id] = byLabel[st.label]; continue; }
        const id = `s_${Date.now().toString(36)}_${merged.length}`;
        styleIdMap[st.id] = id;
        byLabel[st.label] = id;
        merged.push({ id, label: st.label, look: st.look || {} });
      }
      patch.ui_v2_styles = merged;
    }
  }
  if (which.layout && t.layout) {
    const cur = JSON.parse(JSON.stringify(settingsRow?.ui_v2_home || {}));
    if (!Array.isArray(cur.pages)) cur.pages = [];
    // Placement (owner spec): "new" appends the pack's pages as NEW pages
    // (the safe default); "merge" pours the widgets into the current page
    // (positions dropped so the untangle pass seats them); "replace" swaps
    // the current page's widgets for the pack's first page (extra pack
    // pages still append as new).
    const placement = which.layoutPlacement === "merge" || which.layoutPlacement === "replace"
      ? which.layoutPlacement : "new";
    const packPages = t.layout.pages || [];
    // GRID TRANSLATION. A widget's pos/span are cells, not pixels, so a
    // board built on an 8-column / 40px grid dropped onto a 4-column /
    // 80px one lands scrambled and overlapping — the pack carried the
    // grid all along and the importer ignored it (owner screenshots).
    // Scale instead of adopting the pack's grid outright: grid is
    // board-wide, and an import must not re-flow the user's OTHER pages.
    const packGrid = t.layout.grid || null;
    const tgtCols = cur.grid?.phoneCols || 4;
    const tgtRowPx = cur.grid?.rowPx || 80;
    const srcCols = packGrid?.phoneCols || tgtCols;
    const srcRowPx = packGrid?.rowPx || tgtRowPx;
    const colK = tgtCols / (srcCols || tgtCols);
    // Taller target rows mean FEWER of them for the same height.
    const rowK = srcRowPx / (tgtRowPx || srcRowPx);
    const needsScale = Math.abs(colK - 1) > 0.01 || Math.abs(rowK - 1) > 0.01;
    const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
    const scaleWidget = (w) => {
      if (!needsScale) return w;
      const cols = clamp(Math.round((w.span?.cols || 1) * colK), 1, tgtCols);
      const rows = Math.max(1, Math.round((w.span?.rows || 1) * rowK));
      const next = { ...w, span: { ...(w.span || {}), cols, rows } };
      if (w.pos && Number.isFinite(parseInt(w.pos.x, 10))) {
        next.pos = {
          x: clamp(Math.round(w.pos.x * colK), 0, Math.max(0, tgtCols - cols)),
          y: Math.max(0, Math.round((w.pos.y || 0) * rowK)),
        };
      }
      return next;
    };
    // stripLayoutLook: the importer wants the ARRANGEMENT but not the
    // pack's baked-in widget appearance — keep their own styling.
    const cleanSettings = (settings = {}) => {
      let out = settings;
      if (which.stripLayoutLook) {
        out = Object.fromEntries(Object.entries(out).filter(([k]) => !LOOK_SETTING_KEYS.has(k)));
      } else if (typeof out.style === "string" && out.style.startsWith("user:")) {
        const mapped = styleIdMap[out.style.slice(5)];
        out = { ...out };
        if (mapped) out.style = `user:${mapped}`;
        else delete out.style; // unresolvable foreign ref — don't dangle
      }
      return out;
    };
    const mkWidgets = (p, pi, { dropPos = false } = {}) => (p.widgets || []).map((w, i) => {
      const scaled = scaleWidget({ ...w, span: w.span || { cols: 4, rows: 2 } });
      return {
        instanceId: `imp_${Date.now().toString(36)}_${pi}_${i}`,
        widgetId: scaled.widgetId, span: scaled.span,
        pos: dropPos ? null : (scaled.pos || null), mode: scaled.mode || "normal",
        settings: cleanSettings(scaled.settings || {}),
      };
    });
    const targetIdx = Math.max(0, cur.pages.findIndex((p) => p.id === which.currentPageId));
    if (placement === "new" || !cur.pages.length) {
      for (const [pi, p] of packPages.entries()) {
        cur.pages.push({ layoutMode: p.layoutMode || "free", widgets: mkWidgets(p, pi) });
      }
    } else if (placement === "merge") {
      // Each incoming widget lands in the NEXT FREE CELL — the exact
      // helper the widget drawer uses (findFreeCell, positions are
      // {x, y}), accumulating so they also can't overlap each other.
      // v0.208.4 wrote {col, row} positions, which every reader treats
      // as (0,0) — the "they all overlay" report.
      const target = cur.pages[targetIdx];
      const gridCols = cur.grid?.phoneCols || 4;
      const hasPos = (w) => w.pos && Number.isFinite(parseInt(w.pos.x, 10)) && Number.isFinite(parseInt(w.pos.y, 10));
      // Existing widgets WITHOUT positions (seeded/flow-era pages) are
      // seated first in their flow order so the block lands below what
      // the user actually sees.
      const seated = [];
      for (const w of target.widgets || []) {
        seated.push(hasPos(w) ? w : { ...w, pos: findFreeCell(seated, gridCols, w.span || { cols: 1, rows: 1 }) });
      }
      // The imported layout is a RIGID BLOCK (owner spec): its internal
      // arrangement — including deliberate gaps — is preserved exactly;
      // only the whole block's vertical offset changes, landing below
      // the page's existing content. Pack widgets without positions get
      // seated within the block first (relative space), never scattered.
      let baseY = 0;
      for (const w of seated) baseY = Math.max(baseY, (w.pos?.y || 0) + (w.span?.rows || 1));
      for (const [pi, p] of packPages.entries()) {
        const block = mkWidgets(p, pi); // keep the pack's own positions
        const placed = block.filter(hasPos);
        for (const w of block) {
          if (!hasPos(w)) { w.pos = findFreeCell(placed, gridCols, w.span || { cols: 1, rows: 1 }); placed.push(w); }
        }
        const minY = block.length ? Math.min(...block.map((w) => w.pos.y)) : 0;
        let blockBottom = baseY;
        for (const w of block) {
          w.pos = { x: w.pos.x, y: w.pos.y - minY + baseY };
          blockBottom = Math.max(blockBottom, w.pos.y + (w.span?.rows || 1));
          seated.push(w);
        }
        baseY = blockBottom; // multi-page packs stack block after block
      }
      target.widgets = seated;
    } else {
      const first = packPages[0];
      if (first) {
        cur.pages[targetIdx] = {
          ...cur.pages[targetIdx],
          layoutMode: first.layoutMode || "free",
          widgets: mkWidgets(first, 0),
        };
      }
      for (const [pi, p] of packPages.slice(1).entries()) {
        cur.pages.push({ layoutMode: p.layoutMode || "free", widgets: mkWidgets(p, pi + 1) });
      }
    }
    // Board-level surface from the pack (background layers, board style)
    // — only when appearance is wanted.
    if (t.layout.look && !which.stripLayoutLook) {
      if (t.layout.look.background && typeof t.layout.look.background === "object") cur.background = t.layout.look.background;
      if (typeof t.layout.look.styleMode === "string") cur.styleMode = t.layout.look.styleMode;
    }
    // The wallpaper only exists in packs that carried their images, and
    // by here its reference is already the re-hosted local picture.
    if (t.layout.wallpaper?.url && !which.stripLayoutLook) {
      cur.wallpaper = { ...(cur.wallpaper || {}), url: t.layout.wallpaper.url };
    }
    patch.ui_v2_home = cur;
  }
  if (which.uiTheme && t.uiTheme) {
    const cur = settingsRow?.ui_v2 || {};
    // MERGE the ticked parts over what's there — importing a font must
    // not silently wipe the user's bars. Tokens merge key by key, so an
    // unticked group keeps its current values.
    const sel = filterUiThemeParts(t.uiTheme, which.themeParts);
    const next = { ...cur };
    if (sel.tokens) next.tokens = { ...(cur.tokens || {}), ...sel.tokens };
    for (const k of ["bars", "barLooks", "icons", "commandKeys", "appsView", "dockPos", "topBar"]) {
      if (sel[k] !== undefined) next[k] = sel[k];
    }
    next.enabled = cur.enabled === true;
    // appTheme is transport-only: it belongs to ThemeContext, which the
    // importing component applies itself (see SetupPackSheet/Presets).
    delete next.appTheme;
    if (cur.activeDockPos !== undefined) next.activeDockPos = cur.activeDockPos;
    patch.ui_v2 = next;
  }
  if (savePreset) {
    const packs = Array.isArray(settingsRow?.ui_v2_setup_packs) ? settingsRow.ui_v2_setup_packs : [];
    patch.ui_v2_setup_packs = [
      ...packs,
      { id: `p_${Date.now().toString(36)}`, title: pack.title || "Imported pack", created: pack.created || null, types: t },
    ].slice(-24);
  }
  return patch;
}

// Does a layout type carry per-widget appearance (exported with
// "Include widget appearance")? Drives the import-side choice.
export function layoutHasLook(layoutType) {
  for (const p of layoutType?.pages || []) {
    for (const w of p.widgets || []) {
      for (const k of Object.keys(w.settings || {})) if (LOOK_SETTING_KEYS.has(k)) return true;
    }
  }
  return false;
}

// Apply a pack's app theme via the documented EXTERNAL-UPDATE path:
// write the theme keys to localStorage, then fire the reload event
// ThemeContext listens for. Calling the context setters raced the
// ui_v2 effect's own reload dispatch (AppLayout cleanup) — the reload
// re-read the OLD localStorage values and reverted the change.
export function applyAppTheme(at) {
  if (!at) return false;
  try {
    if (at.selectedTheme) localStorage.setItem("symphony_selectedTheme", at.selectedTheme);
    if (at.themeMode) localStorage.setItem("symphony_themeMode", at.themeMode);
    if (at.customColors?.light && at.customColors?.dark) {
      localStorage.setItem("symphony_customColors", JSON.stringify(at.customColors));
    } else {
      localStorage.removeItem("symphony_customColors");
    }
    if (at.selectedFont) localStorage.setItem("symphony_selectedFont", at.selectedFont);
    window.dispatchEvent(new CustomEvent("symphony-theme-storage-change"));
    // Accessibility-store fonts apply live through their own setters.
    try {
      if (at.fontFamily) setAccessibilityFontFamily(at.fontFamily);
      if (at.headingFont) setAccessibilityHeadingFont(at.headingFont);
    } catch { /* non-fatal */ }
    return true;
  } catch { return false; }
}

// Save a pack file: native → silent MediaStore save into
// Downloads/Oceans Symphony (the backup exporter's path — the owner
// wanted device storage, not a share-to-Drive sheet); anything else →
// the shared shareFile chain (Save As / anchor / share sheet).
export async function savePackFile(blob, filename) {
  const { isNative } = await import("@/lib/platform");
  if (isNative()) {
    try {
      const { saveBlobToPublicDownloads } = await import("@/lib/nativeMediaStoreSave");
      const res = await saveBlobToPublicDownloads({ blob, filename, mimeType: "application/json", subdir: "Oceans Symphony" });
      if (res?.result === "filesystem") return { result: "downloaded", location: res.location || "Downloads/Oceans Symphony" };
    } catch { /* fall through to the share chain */ }
  }
  const { shareFile } = await import("@/lib/shareFile");
  return shareFile({ blob, filename, title: "Oceans Symphony setup pack", dialogTitle: "Save setup pack", prefer: "download" });
}

// ── What a pack actually contains, in the app's own words ──────────
// The import screen lists every setting a pack would change, grouped
// the way the user meets them, with the VALUE spelled out — a pack is
// not something anyone should have to accept blind.
const TOKEN_BY_ID = Object.fromEntries((V2_TOKEN_DEFS || []).map((d) => [d.id, d]));
// Which theme group each token belongs to. Colours and fonts are named
// explicitly; everything else is sizing/layout.
const COLOUR_TOKENS = new Set(["accent"]);
const FONT_TOKENS = new Set(["bodyStyle", "headerStyle", "headerScale"]);

export const THEME_PARTS = ["colors", "fonts", "sizes", "bars"];
export const THEME_PART_LABELS = {
  colors: "Colours & theme",
  fonts: "Fonts & text",
  sizes: "Sizes & spacing",
  bars: "Bars, keys & icons",
};

const tokenLabel = (id) => TOKEN_BY_ID[id]?.label || id;
const partOfToken = (id) => (COLOUR_TOKENS.has(id) ? "colors" : FONT_TOKENS.has(id) ? "fonts" : "sizes");

// Human-readable value for one token/setting.
function describeValue(id, v) {
  if (Array.isArray(v)) return v.length ? v.join(", ") : "none";
  const def = TOKEN_BY_ID[id];
  if (def?.type === "select") {
    const opt = (def.options || []).find((o) => o.v === v);
    if (opt) return opt.label;
  }
  if (def?.type === "range") return `${v}${def.unit || ""}`;
  if (typeof v === "boolean") return v ? "on" : "off";
  return String(v);
}

// Every change a pack's uiTheme would make, grouped by THEME_PARTS.
// [{ part, label, value, isColor }]
export function describeUiTheme(uiTheme = {}) {
  const rows = [];
  for (const [id, v] of Object.entries(uiTheme.tokens || {})) {
    if (v === undefined || v === null || v === "") continue;
    rows.push({ part: partOfToken(id), label: tokenLabel(id), value: describeValue(id, v), isColor: TOKEN_BY_ID[id]?.type === "color" });
  }
  const at = uiTheme.appTheme || {};
  if (at.selectedTheme) rows.push({ part: "colors", label: "Colour theme", value: at.selectedTheme });
  if (at.themeMode) rows.push({ part: "colors", label: "Light / dark", value: at.themeMode });
  if (at.customColors) rows.push({ part: "colors", label: "Custom palette", value: "included" });
  if (at.selectedFont) rows.push({ part: "fonts", label: "Theme font", value: at.selectedFont });
  if (at.fontFamily) rows.push({ part: "fonts", label: "Body font", value: at.fontFamily });
  if (at.headingFont && at.headingFont !== "default") rows.push({ part: "fonts", label: "Heading font", value: at.headingFont });
  if (uiTheme.bars) {
    const on = Object.entries(uiTheme.bars).filter(([, v]) => v).map(([k]) => k);
    rows.push({ part: "bars", label: "Bars shown", value: on.length ? on.join(", ") : "none" });
  }
  if (Array.isArray(uiTheme.commandKeys)) rows.push({ part: "bars", label: "Quick-action keys", value: `${uiTheme.commandKeys.length} keys` });
  if (uiTheme.barLooks && Object.values(uiTheme.barLooks).some((l) => l && Object.keys(l).length)) {
    rows.push({ part: "bars", label: "Per-bar looks", value: "included" });
  }
  if (uiTheme.icons && Object.values(uiTheme.icons).some((g) => g && Object.keys(g).length)) {
    rows.push({ part: "bars", label: "Icon choices", value: "included" });
  }
  if (uiTheme.appsView) rows.push({ part: "bars", label: "Apps view", value: uiTheme.appsView });
  if (uiTheme.dockPos) rows.push({ part: "bars", label: "Floating bar position", value: "included" });
  return rows;
}

// Split a uiTheme down to only the parts the user ticked.
export function filterUiThemeParts(uiTheme = {}, parts) {
  const want = new Set(parts || THEME_PARTS);
  const out = {};
  const tokens = {};
  for (const [id, v] of Object.entries(uiTheme.tokens || {})) {
    if (want.has(partOfToken(id))) tokens[id] = v;
  }
  if (Object.keys(tokens).length) out.tokens = tokens;
  if (want.has("bars")) {
    for (const k of ["bars", "barLooks", "icons", "commandKeys", "appsView", "dockPos", "topBar"]) {
      if (uiTheme[k] !== undefined) out[k] = uiTheme[k];
    }
  }
  const at = uiTheme.appTheme || null;
  if (at && (want.has("colors") || want.has("fonts"))) {
    const next = {};
    if (want.has("colors")) {
      if (at.selectedTheme) next.selectedTheme = at.selectedTheme;
      if (at.themeMode) next.themeMode = at.themeMode;
      next.customColors = at.customColors || null;
    }
    if (want.has("fonts")) {
      if (at.selectedFont) next.selectedFont = at.selectedFont;
      if (at.fontFamily) next.fontFamily = at.fontFamily;
      if (at.headingFont) next.headingFont = at.headingFont;
    }
    if (Object.keys(next).length) out.appTheme = next;
  }
  return out;
}

// ── Safety net: the setup you had BEFORE an import ─────────────────
// Importing replaces things. Snapshot the whole current setup first and
// keep it as a pack, so "put it back" is always one tap — no user
// should have to reconstruct a board from memory.
// VERBATIM, and deliberately NOT a pack. Two reasons: a share pack is
// sanitized (personal widget settings — which journal, which board —
// are stripped), so restoring from one would quietly lose them; and a
// restore point holds exactly those personal references, so it must
// never sit in the shareable packs list where it could be sent to
// someone. It lives in its own field, ui_v2_restore_point.
export function buildRestorePoint({ settingsRow, appTheme, title = "import" }) {
  return {
    title: `Before ${title}`,
    created: new Date().toISOString(),
    ui_v2_home: settingsRow?.ui_v2_home ? JSON.parse(JSON.stringify(settingsRow.ui_v2_home)) : null,
    ui_v2_home_desktop: settingsRow?.ui_v2_home_desktop ? JSON.parse(JSON.stringify(settingsRow.ui_v2_home_desktop)) : null,
    ui_v2_styles: Array.isArray(settingsRow?.ui_v2_styles) ? JSON.parse(JSON.stringify(settingsRow.ui_v2_styles)) : [],
    ui_v2: settingsRow?.ui_v2 ? JSON.parse(JSON.stringify(settingsRow.ui_v2)) : null,
    appTheme: appTheme ? { ...appTheme } : null,
  };
}

// Put everything back exactly as it was. Returns the SystemSettings
// patch; the caller applies point.appTheme through applyAppTheme.
export function restorePatchFrom(point) {
  if (!point) return null;
  const patch = {};
  if (point.ui_v2_home) patch.ui_v2_home = point.ui_v2_home;
  if (point.ui_v2_home_desktop) patch.ui_v2_home_desktop = point.ui_v2_home_desktop;
  if (Array.isArray(point.ui_v2_styles)) patch.ui_v2_styles = point.ui_v2_styles;
  if (point.ui_v2) patch.ui_v2 = point.ui_v2;
  return patch;
}

// ── Images ─────────────────────────────────────────────────────────
// Pictures live in this device's image store, so a plain pack can only
// drop them. A .zip CAN carry them: the JSON keeps pack-relative
// references (pack-image://N) and the archive holds the files, which
// keeps the rule that a pack's JSON never contains device ids intact.
//
// These are the pictures the BOARD uses — wallpaper, widget icons,
// background layers, bar/nav icons. Alter avatars and the asset library
// are not part of a pack and never travel. The sender sees exactly what
// is going out (thumbnails in the share sheet) and can leave them out.
export const PACK_IMAGE_PREFIX = "pack-image://";
const isPackImageRef = (v) => typeof v === "string" && v.startsWith(PACK_IMAGE_PREFIX);

// Walk any structure, swapping local-image:// refs for pack-image://N and
// recording the originals in order. Returns the rewritten copy.
function mapImageRefs(value, refs) {
  const localId = localImageId(value);
  if (localId) {
    const id = localId;
    let idx = refs.indexOf(id);
    if (idx === -1) { refs.push(id); idx = refs.length - 1; }
    return `${PACK_IMAGE_PREFIX}${idx}`;
  }
  if (Array.isArray(value)) return value.map((v) => mapImageRefs(v, refs));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = mapImageRefs(v, refs);
    return out;
  }
  return value;
}

// Every image id a board+theme would need, in pack-reference order.
export function collectPackImages({ home, uiV2 }) {
  const refs = [];
  mapImageRefs({ home: home || null, uiV2: uiV2 || null }, refs);
  return refs;
}

// Kept for callers that already hold a built pack: re-map any device
// references still inside it (none, once the builders run with
// imageRefs) and report what the archive must contain.
export function withPackImages(pack, { home, uiV2 } = {}) {
  const refs = [];
  const types = mapImageRefs(pack.types || {}, refs);
  const extra = collectPackImages({ home, uiV2 });
  for (const id of extra) if (!refs.includes(id)) refs.push(id);
  return { pack: { ...pack, types }, sourceIds: refs };
}

// Load the referenced images and build the .zip: pack.json + images/N.
export async function buildPackZip(pack, sourceIds) {
  const { getLocalImage } = await import("@/lib/localImageStorage");
  const { zipSync, strToU8 } = await import("fflate");
  const files = { "pack.json": strToU8(JSON.stringify(pack, null, 2)) };
  const meta = [];
  for (let i = 0; i < sourceIds.length; i++) {
    const rec = await getLocalImage(sourceIds[i]);
    const blob = rec instanceof Blob ? rec : rec?.blob instanceof Blob ? rec.blob : null;
    const dataUrl = typeof rec === "string" ? rec : typeof rec?.data === "string" ? rec.data : null;
    let bytes = null, mime = "image/png";
    if (blob) { bytes = new Uint8Array(await blob.arrayBuffer()); mime = blob.type || mime; }
    else if (dataUrl && dataUrl.startsWith("data:")) {
      mime = dataUrl.slice(5, dataUrl.indexOf(";")) || mime;
      const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      const bin = atob(b64);
      bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    }
    if (!bytes) continue; // a missing picture just doesn't travel
    const ext = (mime.split("/")[1] || "png").replace(/[^a-z0-9]/gi, "");
    files[`images/${i}.${ext}`] = bytes;
    meta.push({ i, mime });
  }
  files["pack.json"] = strToU8(JSON.stringify({ ...pack, imageFiles: meta }, null, 2));
  return zipSync(files, { level: 6 });
}

// Read a .zip back: the pack plus { N: dataUrl } for its images.
export async function parsePackZip(bytes) {
  const { unzipSync, strFromU8 } = await import("fflate");
  const files = unzipSync(new Uint8Array(bytes));
  const jsonBytes = files["pack.json"];
  if (!jsonBytes) throw new Error("That zip isn't a setup pack (no pack.json).");
  const pack = parsePack(strFromU8(jsonBytes));
  const images = {};
  for (const [name, data] of Object.entries(files)) {
    const m = name.match(/^images\/(\d+)\.([a-z0-9]+)$/i);
    if (!m) continue;
    const mime = (pack.imageFiles || []).find((f) => String(f.i) === m[1])?.mime || `image/${m[2]}`;
    let bin = "";
    for (let i = 0; i < data.length; i++) bin += String.fromCharCode(data[i]);
    images[m[1]] = `data:${mime};base64,${btoa(bin)}`;
  }
  return { pack, images };
}

// Save a pack's images into THIS device's store and return the map from
// pack reference to a real local-image:// url.
export async function rehostPackImages(images) {
  if (!images || !Object.keys(images).length) return {};
  const { saveLocalImage, createLocalImageUrl } = await import("@/lib/localImageStorage");
  const map = {};
  for (const [idx, dataUrl] of Object.entries(images)) {
    const id = `imp_${Date.now().toString(36)}_${idx}_${Math.random().toString(36).slice(2, 7)}`;
    try {
      await saveLocalImage(id, dataUrl);
      map[`${PACK_IMAGE_PREFIX}${idx}`] = createLocalImageUrl(id);
    } catch { /* one picture failing must not sink the import */ }
  }
  return map;
}

// Swap pack-image:// references for the freshly saved local ones.
export function applyImageMap(value, map) {
  if (isPackImageRef(value)) return map[value] || "";
  if (Array.isArray(value)) return value.map((v) => applyImageMap(v, map));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = applyImageMap(v, map);
    return out;
  }
  return value;
}

// ── Compact share code ─────────────────────────────────────────────
// "OSPACK1.<base64url(deflate(json))>" — a 7KB pack becomes a ~2KB
// single-line string that pastes cleanly into a chat message. Falls
// back to plain JSON where CompressionStream isn't available; the
// decoder accepts both.
const PACK_CODE_PREFIX = "OSPACK1.";
const PACK_CODE_PREFIX_V2 = "OSPACK2.";

// ── Key tokenisation (OSPACK2) ─────────────────────────────────────
// The pack JSON's KEYS are the bulk of its raw bytes — the same forty-odd
// field names repeated per widget. Deflate already dictionary-compresses
// them, but swapping each for a two-char token first still shrinks the
// final code ~15–25%. Purely reversible renaming of KNOWN keys: values
// (the user's actual choices) are never touched, unknown keys pass
// through untouched, and a real key that happens to start with "~" is
// escaped to "~~key" so nothing can collide. OSPACK1 codes decode
// forever; older app versions can't read OSPACK2 codes — re-export there.
const PACK_KEY_DICT = [
  "instanceId", "widgetId", "settings", "span", "cols", "rows", "mode",
  "pos", "pages", "widgets", "label", "layoutMode", "types", "layout",
  "widgetStyles", "uiTheme", "title", "created", "style", "grid",
  "phoneCols", "rowPx", "wallpaper", "drawer", "folders", "defaultPageId",
  "styleMode", "actionBar", "altersBar", "enabled", "position",
  "collapsed", "look", "tokens", "bars", "icons", "commandKeys",
  "appTheme", "colors", "background", "border", "radius", "shadow",
  "opacity", "color", "image", "url", "name", "value", "version",
  "buttonIds", "visibleTo", "visibleMode", "userStyles", "imageRefs",
];
const TOKEN_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const keyToToken = new Map(PACK_KEY_DICT.map((k, i) => [k, `~${TOKEN_ALPHABET[Math.floor(i / TOKEN_ALPHABET.length)] || ""}${TOKEN_ALPHABET[i % TOKEN_ALPHABET.length]}`]));
const tokenToKey = new Map([...keyToToken].map(([k, t]) => [t, k]));

function mapKeys(value, mapKey) {
  if (Array.isArray(value)) return value.map((v) => mapKeys(v, mapKey));
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) out[mapKey(k)] = mapKeys(v, mapKey);
  return out;
}
const tokenizeKeys = (obj) => mapKeys(obj, (k) => keyToToken.get(k) || (k.startsWith("~") ? `~~${k.slice(1)}` : k));
const detokenizeKeys = (obj) => mapKeys(obj, (k) => {
  if (k.startsWith("~~")) return `~${k.slice(2)}`;
  return tokenToKey.get(k) || k;
});
const b64uEncode = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64uDecode = (str) => {
  const b = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};
// The text a person actually pastes to a friend: what it is, what's in
// it, and what to do with it — a bare base64 blob reads as something
// you should not paste anywhere (owner: "the code looks super
// suspicious").
export function formatShareMessage(pack, code) {
  const t = pack?.types || {};
  const bits = [];
  if (t.layout) bits.push(`layout (${(t.layout.pages || []).reduce((n, p) => n + (p.widgets?.length || 0), 0)} widgets)`);
  if (t.widgetStyles?.length) bits.push(`${t.widgetStyles.length} widget style${t.widgetStyles.length === 1 ? "" : "s"}`);
  if (t.uiTheme) bits.push("theme");
  return [
    `🌊 Oceans Symphony setup pack — "${pack?.title || "My setup"}"`,
    `Includes: ${bits.join(" · ") || "nothing"}`,
    "",
    "To use it: open Oceans Symphony → home screen settings → Presets → Setup packs → Import, and paste this whole message.",
    "It only changes how the app looks. It carries no personal data.",
    "",
    code,
  ].join("\n");
}

export async function encodePackCompact(pack) {
  const json = JSON.stringify(pack);
  if (typeof CompressionStream === "undefined") return json;
  try {
    const tokenized = JSON.stringify(tokenizeKeys(pack));
    const stream = new Blob([tokenized]).stream().pipeThrough(new CompressionStream("deflate"));
    const buf = new Uint8Array(await new Response(stream).arrayBuffer());
    return PACK_CODE_PREFIX_V2 + b64uEncode(buf);
  } catch { return json; }
}
export async function decodePackText(text) {
  const raw = String(text || "").trim();
  // The share message wraps the code in a human explanation, and chat
  // apps add quotes/newlines — find the code wherever it ended up
  // rather than demanding a bare blob. Both generations decode: v2 adds
  // the key detokenisation pass, v1 codes keep working forever.
  const m2 = raw.match(new RegExp(PACK_CODE_PREFIX_V2.replace(".", "\\.") + "([A-Za-z0-9_-]+)"));
  if (m2) {
    const bytes = b64uDecode(m2[1]);
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
    const json = await new Response(stream).text();
    return JSON.stringify(detokenizeKeys(JSON.parse(json)));
  }
  const m = raw.match(new RegExp(PACK_CODE_PREFIX.replace(".", "\\.") + "([A-Za-z0-9_-]+)"));
  if (!m) return raw;
  const bytes = b64uDecode(m[1]);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
  return await new Response(stream).text();
}

// A stored pack row back into a shareable file body.
export function packToJson(stored) {
  return JSON.stringify({
    __format: PACK_FORMAT, __version: PACK_VERSION,
    title: stored.title || "My setup", created: stored.created || null, types: stored.types || {},
  }, null, 2);
}
