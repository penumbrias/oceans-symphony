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
import { findFreeCell } from "@/lib/experimentalHome";

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

const isLocalRef = (v) => typeof v === "string" && (v.startsWith("local-image://") || v.startsWith("folder://") || v.startsWith("data:"));

// Per-widget appearance keys (colours, fonts, borders…) plus the saved-style
// reference. A LAYOUT export carries them only when the user opts in — "my
// widget layout export included colours I never asked to share" (owner).
const LOOK_SETTING_KEYS = new Set([...LOOK_KEYS, "style"]);

function sanitizeSettings(settings = {}, { includeLook = false } = {}) {
  const out = {};
  for (const [k, v] of Object.entries(settings)) {
    if (PERSONAL_SETTING_KEYS.has(k)) continue;
    if (!includeLook && LOOK_SETTING_KEYS.has(k)) continue;
    if (isLocalRef(v)) continue;
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
export function buildLayoutType(home, { includeLook = false } = {}) {
  const pages = (home?.pages || []).map((p) => ({
    layoutMode: p.layoutMode || "flow",
    widgets: (p.widgets || []).map((w) => ({
      widgetId: w.widgetId,
      span: w.span || null,
      pos: w.pos || null,
      mode: w.mode || "normal",
      settings: sanitizeSettings(w.settings || {}, { includeLook }),
    })),
  }));
  return { pages, grid: home?.grid || null };
}

export function buildWidgetStylesType(userStyles = []) {
  return userStyles.map((s) => ({ id: s.id, label: s.label, look: sanitizeLook(s.look || {}) }));
}

export function buildUiThemeType(uiV2Raw = {}) {
  // The stored ui_v2 object minus anything device/personal: icon image
  // overrides (local images) are stripped; named lucide icons survive.
  const clone = JSON.parse(JSON.stringify(uiV2Raw || {}));
  if (clone.icons) {
    for (const group of Object.values(clone.icons)) {
      if (!group || typeof group !== "object") continue;
      for (const [id, icon] of Object.entries(group)) {
        if (icon && typeof icon === "object" && isLocalRef(icon.imageUrl)) delete group[id];
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
    parts.push(`Layout: ${t.layout.pages?.length || 0} page(s), ${n} widget(s)`);
  }
  if (t.widgetStyles) parts.push(`Widget styles: ${t.widgetStyles.length} (${t.widgetStyles.map((s) => s.label).join(", ").slice(0, 80)})`);
  if (t.uiTheme) parts.push("UI theme: Display-options state (bars, tokens, looks)");
  return parts;
}

// Safety re-check on IMPORT too — a hand-edited pack could smuggle refs.
export function packLooksSafe(pack) {
  const raw = JSON.stringify(pack.types || {});
  return !/local-image:\/\/|data:image|"secret"|"userId"/.test(raw);
}

// ── Applying a pack ────────────────────────────────────────────────
// ONE implementation for the import sheet AND the Presets section's
// saved-pack rows (rule: reuse, don't fork). Layout lands as NEW pages,
// styles merge by label (clashes skipped), uiTheme REPLACES ui_v2.
export function buildApplyPatch({ pack, which = {}, savePreset = false, settingsRow }) {
  const t = pack?.types || {};
  const patch = {};
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
    const mkWidgets = (p, pi, { dropPos = false } = {}) => (p.widgets || []).map((w, i) => ({
      instanceId: `imp_${Date.now().toString(36)}_${pi}_${i}`,
      widgetId: w.widgetId, span: w.span || { cols: 4, rows: 2 },
      pos: dropPos ? null : (w.pos || null), mode: w.mode || "normal", settings: w.settings || {},
    }));
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
    patch.ui_v2_home = cur;
  }
  if (which.widgetStyles && t.widgetStyles) {
    const existing = Array.isArray(settingsRow?.ui_v2_styles) ? settingsRow.ui_v2_styles : [];
    const have = new Set(existing.map((s) => s.label));
    const merged = [...existing];
    for (const s of t.widgetStyles) {
      if (have.has(s.label)) continue;
      merged.push({ id: `s_${Date.now().toString(36)}_${merged.length}`, label: s.label, look: s.look || {} });
    }
    patch.ui_v2_styles = merged;
  }
  if (which.uiTheme && t.uiTheme) {
    const cur = settingsRow?.ui_v2 || {};
    patch.ui_v2 = { ...t.uiTheme, enabled: cur.enabled === true };
    if (cur.activeDockPos !== undefined) patch.ui_v2.activeDockPos = cur.activeDockPos;
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

// A stored pack row back into a shareable file body.
export function packToJson(stored) {
  return JSON.stringify({
    __format: PACK_FORMAT, __version: PACK_VERSION,
    title: stored.title || "My setup", created: stored.created || null, types: stored.types || {},
  }, null, 2);
}
