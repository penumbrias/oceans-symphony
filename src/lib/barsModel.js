// One truth for the bars (owner, 2026-10-01: "so many different areas where
// the various bars can be edited … unclear what impacts what"). Every
// surface that shows, hides, places or styles a bar reads and writes
// through here, and every gear opens the ONE editor — Display options →
// Bars — at that bar's section (openBarsEditor).
//
// The bars are this DEVICE's chrome, so they live in ui_v2, which never
// syncs (syncLook.js). The pinned bar used to be split across four places:
//   ui_v2_home.altersBar        placement (board field — syncs since 0.249.0)
//   ui_v2_home.altersBar.look   a widget-style look from the board's sheet
//   ui_v2.barLooks.alters       the Display options look (only partly applied)
//   ui_v2.classicBars.alters    a second on/off switch under the classic chrome
// It now lives in ui_v2.altersBar + ui_v2.barLooks.alters. Older records
// are read as-is until the first change, which copies them across; the old
// fields are never deleted (user data rule).
//
// Show/hide is mode-aware: under the new UI a bar's switch is ui_v2.bars.*,
// under the classic chrome it is ui_v2.classicBars.* — one switch per bar
// whichever chrome is on screen.

import { resolveUiV2 } from "./uiV2.js";

export const PINNED_POSITIONS = ["top", "bottom", "left", "right"];

const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

function legacyBar(row) { return obj(obj(row?.ui_v2_home).altersBar); }

// Placement of the pinned bar: { enabled, position, mode, attached,
// collapsed, bubble }.
export function readPinnedBar(row) {
  const raw = obj(row?.ui_v2);
  const src = raw.altersBar ? obj(raw.altersBar) : legacyBar(row);
  return {
    enabled: src.enabled === true,
    position: PINNED_POSITIONS.includes(src.position) ? src.position : "bottom",
    mode: src.mode === "bubble" ? "bubble" : "bar",
    attached: src.attached === true,
    collapsed: src.collapsed === true,
    bubble: src.bubble && typeof src.bubble === "object" ? src.bubble : null,
  };
}

// The pinned bar's look: the old board-sheet look underneath until the
// record is moved across, the Display options look on top. Raw (not the
// resolved barLooks) so no field a user set is dropped.
export function pinnedBarLook(row) {
  const raw = obj(row?.ui_v2);
  const own = obj(obj(raw.barLooks).alters);
  if (raw.altersBar) return own;
  return { ...obj(legacyBar(row).look), ...own };
}

// The ui_v2 value with the pinned bar moved across (no-op once it has).
function migratedUiV2(row) {
  const raw = obj(row?.ui_v2);
  if (raw.altersBar) return raw;
  const legacy = legacyBar(row);
  const { look, ...placement } = legacy;
  const barLooks = obj(raw.barLooks);
  return {
    ...raw,
    altersBar: { ...placement },
    barLooks: { ...barLooks, alters: { ...obj(look), ...obj(barLooks.alters) } },
  };
}

// SystemSettings patch that changes the pinned bar's placement.
export function pinnedBarPatch(row, patch) {
  const ui = migratedUiV2(row);
  return { ui_v2: { ...ui, altersBar: { ...ui.altersBar, ...patch } } };
}

// SystemSettings patch that changes the pinned bar's look (merge; a key
// set to undefined clears it). `replace` swaps the whole look.
export function pinnedBarLookPatch(row, patch, { replace = false } = {}) {
  const ui = migratedUiV2(row);
  const barLooks = obj(ui.barLooks);
  const next = replace ? { ...patch } : { ...obj(barLooks.alters), ...patch };
  for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
  return { ui_v2: { ...ui, barLooks: { ...barLooks, alters: next } } };
}

// ── Show / hide ────────────────────────────────────────────────────────
// Bar ids: top · tabs · actions · alters · rail · wave.
export function isV2Chrome(row, uiV2Enabled) {
  return uiV2Enabled && resolveUiV2(row?.ui_v2).enabled === true;
}

// Which bars can be switched under this chrome. The new UI's top bar
// carries the recovery paths, so it is never switched off there; the side
// rail and wave only exist in the new UI.
export function switchableBars(v2Chrome) {
  return v2Chrome ? ["tabs", "actions", "alters", "rail", "wave"] : ["top", "tabs", "actions", "alters"];
}

export function barShown(row, id, v2Chrome) {
  const ui = resolveUiV2(row?.ui_v2);
  if (id === "alters") {
    const on = readPinnedBar(row).enabled;
    return v2Chrome ? on : on && ui.classicBars.alters;
  }
  if (v2Chrome) return id === "top" ? true : ui.bars[id] !== false;
  if (id === "top") return ui.classicBars.top;
  if (id === "tabs") return ui.classicBars.bottom;
  // Under the classic chrome the quick-actions bar needs both switches.
  if (id === "actions") return ui.classicBars.actions && ui.bars.actions;
  return false;
}

export function barShownPatch(row, id, on, v2Chrome) {
  const raw = obj(row?.ui_v2);
  if (id === "alters") {
    const p = pinnedBarPatch(row, { enabled: !!on, collapsed: false });
    if (!v2Chrome && on) p.ui_v2.classicBars = { ...obj(raw.classicBars), alters: true };
    return p;
  }
  if (v2Chrome) {
    if (id === "top") return null;
    return { ui_v2: { ...raw, bars: { ...obj(raw.bars), [id]: !!on } } };
  }
  const key = id === "tabs" ? "bottom" : id;
  if (!["top", "bottom", "actions"].includes(key)) return null;
  const next = { ...raw, classicBars: { ...obj(raw.classicBars), [key]: !!on } };
  if (key === "actions" && on) next.bars = { ...obj(raw.bars), actions: true };
  return { ui_v2: next };
}

// ── The one editor ─────────────────────────────────────────────────────
// Opens Display options with Bars → <barId> unfolded. SubSection reads its
// open state from sessionStorage on mount (os_sub_<key>). While a home
// board is being edited its own drawer IS Display options, so the request
// goes there instead of stacking a second sheet.
export const BAR_SECTION_KEYS = {
  top: "edit-bar-top", tabs: "edit-bar-bottom", actions: "edit-bar-actions",
  alters: "edit-bar-alters", rail: "edit-bar-side",
};
const OTHER_SECTIONS = ["edit-size", "edit-colors", "edit-presets"];

export function openBarsEditor(barId = null) {
  try {
    const set = (k, v) => sessionStorage.setItem(`os_sub_${k}`, v);
    set("edit-bars", "1");
    for (const k of OTHER_SECTIONS) set(k, "0");
    for (const [id, k] of Object.entries(BAR_SECTION_KEYS)) {
      if (barId) set(k, id === barId ? "1" : "0");
    }
    // The Bars section scrolls this bar's part into view on mount.
    if (barId) sessionStorage.setItem("os_bars_focus", barId);
  } catch { /* storage off — the sheet still opens */ }
  let editing = null;
  try {
    const e = window.__osEditing || {};
    editing = Object.keys(e).find((scope) => e[scope]) || null;
  } catch { /* none */ }
  if (editing) window.dispatchEvent(new CustomEvent(`${editing}-home-settings`, { detail: { barId } }));
  else window.dispatchEvent(new CustomEvent("os-open-display-options", { detail: { barId } }));
}
