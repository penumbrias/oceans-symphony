// One way to write a home board from OUTSIDE the board canvas (v0.277.0).
//
// The canvas (ExperimentalDashboard.persist) already stamps every change a
// person makes, so the other device's older copy can't win the next sync.
// Everything else that rewrote a board — Display options background and
// widget style, presets and look-history restores, the fronter-change
// preset, setup packs, undo, reset — wrote the field directly, unstamped,
// and from whatever settings row it had cached. Those changes were quietly
// reverted by the next sync, and an old snapshot could bring a deleted
// page back (data architecture audit, chapter 13).
//
// writeBoard reads the freshest row, applies the change to the board as it
// is NOW, stamps it as a person's edit, and writes it. `machine: true` is
// for the app's own one-time tidy-ups, which must never look newer than a
// real edit.

import React from "react";
import { localEntities } from "@/api/base44Client";
import { stampBoardChanges } from "@/lib/boardStamp";
import { isBoardStore } from "@/lib/boardStore";

// The two boards: the home screen (built from widgets) and the open widget
// board one swipe away. The code still calls the home screen "classic".
export const HOME_SCREEN_FIELD = "classic_home";
export const WIDGET_BOARD_FIELD = "ui_v2_home";
export const BOARD_SETTINGS_FIELDS = [HOME_SCREEN_FIELD, WIDGET_BOARD_FIELD];

// Which board an editing sheet is working on. The canvas provides it;
// anything opened outside a canvas (the v2 frame's Display options) edits
// the widget board, which is the home page in that layout. The value is
// the settings field name for the two home boards, or a board store
// (boardStore.js, v0.289.0) for a board that lives elsewhere — a profile's
// layout. writeBoard takes either.
export const BoardFieldContext = React.createContext(WIDGET_BOARD_FIELD);
export const useBoardField = () => React.useContext(BoardFieldContext);

export async function writeBoard(rowOrId, field, change, { machine = false, extra = null } = {}) {
  if (isBoardStore(field)) return field.update(change, { machine, extra });
  const id = rowOrId && typeof rowOrId === "object" ? rowOrId.id : rowOrId;
  if (!id) throw new Error("There's no settings record to save the home screen to yet");
  if (!BOARD_SETTINGS_FIELDS.includes(field)) throw new Error(`Not a board field: ${field}`);
  const row = await localEntities.SystemSettings.get(id);
  const current = row?.[field] ?? null;
  let next = typeof change === "function" ? change(current) : change;
  if (!next || typeof next !== "object") return current;
  if (!machine) {
    if (next._seeded) { next = { ...next }; delete next._seeded; }
    next = stampBoardChanges(current, next);
  }
  await localEntities.SystemSettings.update(id, { ...(extra || {}), [field]: next });
  return next;
}

// For a patch that may hold board fields alongside other settings (undo,
// setup-pack restore points): stamps each board field against the fresh row.
export async function writeSettingsWithBoards(rowOrId, patch) {
  const id = rowOrId && typeof rowOrId === "object" ? rowOrId.id : rowOrId;
  if (!id || !patch || !Object.keys(patch).length) return;
  const row = await localEntities.SystemSettings.get(id);
  const out = { ...patch };
  for (const f of BOARD_SETTINGS_FIELDS) {
    if (!(f in out)) continue;
    // Never blank a board: a snapshot taken before a board existed holds
    // null for it, and "restoring" that would wipe the board.
    if (!out[f] || typeof out[f] !== "object") { delete out[f]; continue; }
    let next = out[f];
    if (next._seeded) { next = { ...next }; delete next._seeded; }
    out[f] = stampBoardChanges(row?.[f] ?? null, next);
  }
  if (!Object.keys(out).length) return;
  await localEntities.SystemSettings.update(id, out);
}
