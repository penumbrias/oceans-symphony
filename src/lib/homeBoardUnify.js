// One home board per device (v0.248.0).
//
// From v0.99.0 every device kept TWO v2 home boards on its settings row:
// `ui_v2_home` (phone-size screens) and `ui_v2_home_desktop` (≥1024px).
// That split existed because one settings row was shared by every device
// through sync — without it, arranging the desktop rearranged the phone.
// Since 0.243.x each device's look and layout is its own (syncLook.js),
// so the split only caused trouble: "use the other device's appearance"
// and backups put the computer's board in a slot the phone never shows
// (owner report, 2026-10-01). The grid already adapts to the width
// (4 / 8 / 12 columns), so one board works on any screen.
//
// Folding: the device keeps the board it SHOWS right now (wide screen →
// the desktop board, otherwise the phone board) as `ui_v2_home`. The other
// one is never thrown away — it becomes a saved preset ("Desktop board
// (saved Oct 1, 2026)") the person can apply or delete themselves, and the
// settings update itself also lands in Recent changes.
//
// Runs whenever a row still carries a desktop board: at boot, and after an
// import or "use another device's appearance" brings an older one in.

import { localEntities } from "@/api/base44Client";
import { isWideScreen } from "@/lib/homePresetParts";

export const RETIRED_DESKTOP_FIELD = "ui_v2_home_desktop";
const PRESETS_KEY = "symphony_userCustomPresets";

const isBoard = (b) => !!b && typeof b === "object";
const realBoard = (b) => isBoard(b) && !b._seeded;

// Pure: what to do with one settings row. null = nothing to do.
//   { patch, keep: { kind: "desktop" | "phone", board } | null }
export function planBoardUnify(row, { wide }) {
  if (!row || !isBoard(row[RETIRED_DESKTOP_FIELD])) {
    // A stray non-object value (null is the folded state) needs no work.
    return row && row[RETIRED_DESKTOP_FIELD] != null && !isBoard(row[RETIRED_DESKTOP_FIELD])
      ? { patch: { [RETIRED_DESKTOP_FIELD]: null }, keep: null }
      : null;
  }
  const desk = row[RETIRED_DESKTOP_FIELD];
  const phone = isBoard(row.ui_v2_home) ? row.ui_v2_home : null;
  // A phone that never had a board of its own shows the desktop one after
  // folding rather than a fresh starter.
  const showDesk = wide || !realBoard(phone);
  const shown = showDesk ? desk : phone;
  const other = showDesk ? phone : desk;
  const keep = realBoard(other) && JSON.stringify(other) !== JSON.stringify(shown)
    ? { kind: showDesk ? "phone" : "desktop", board: other }
    : null;
  return { patch: { ui_v2_home: shown, [RETIRED_DESKTOP_FIELD]: null }, keep };
}

function presetName(kind, existing, now = new Date()) {
  const date = now.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const base = `${kind === "desktop" ? "Desktop" : "Phone"} board (saved ${date})`;
  let name = base;
  for (let n = 2; existing[name]; n++) name = `${base} ${n}`;
  return name;
}

// Save a board as a whole-board preset (the legacy `uiV2Home` shape every
// preset apply path understands). Throws if storage refuses — the caller
// must then NOT fold, so the board stays where it was.
function savePreset(kind, board) {
  const raw = localStorage.getItem(PRESETS_KEY);
  let presets = {};
  try { presets = raw ? JSON.parse(raw) || {} : {}; } catch { presets = {}; }
  const name = presetName(kind, presets);
  presets[name] = { uiV2Home: JSON.parse(JSON.stringify(board)) };
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  // Read back: a quota error can fail silently on some WebViews.
  const back = JSON.parse(localStorage.getItem(PRESETS_KEY) || "{}");
  if (!back[name]) throw new Error("preset not saved");
  try { window.dispatchEvent(new Event("symphony-theme-storage-change")); } catch { /* no window */ }
  return name;
}

// Fold every settings row that still has a desktop board. Returns the
// names of presets created. Never throws.
export async function unifyHomeBoards({ wide = isWideScreen() } = {}) {
  const saved = [];
  try {
    const rows = await localEntities.SystemSettings.list();
    for (const row of rows || []) {
      const plan = planBoardUnify(row, { wide });
      if (!plan) continue;
      if (plan.keep) {
        try { saved.push(savePreset(plan.keep.kind, plan.keep.board)); }
        catch { continue; } // couldn't keep it → leave this row untouched
      }
      await localEntities.SystemSettings.update(row.id, plan.patch);
    }
  } catch { /* best-effort; runs again next boot */ }
  return saved;
}
