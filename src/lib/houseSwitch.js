// "Try the new house" (new house, step 2.1): the per-device switch, and the
// one size rule the frame is chosen by.
//
// This file is the ONLY new-house code in the main bundle, and it is tiny on
// purpose: AppLayout reads the switch and the size class here, and only when
// both say so does it lazily load src/house/ (the frame and the kit). With
// the switch off, nothing of src/house is downloaded or run.
//
// The switch is a device preference, like the theme: it lives in
// localStorage under HOUSE_SWITCH_KEY and is listed in BACKUP_LS_KEYS
// (src/lib/backupKeys.js). That makes it durable (the settings mirror puts it
// back after an Android cache clear) and lets it ride along in a backup the
// way every other look preference does. It never touches a record or a
// settings row: both houses read and write the same records through the same
// save paths, so switching back shows everything as it was. Preview Mode
// leaves it alone (previewMode.js only stashes theme and font keys), so the
// switch is remembered in and out of the example system.
//
// Writes "1" or "0", never removes the key, so the mirror can't resurrect an
// old value over a deliberate "off".

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";

export const HOUSE_SWITCH_KEY = "symphony_new_house_v1";
export const HOUSE_SWITCH_EVENT = "symphony-house-switch";

export function parseHouseSwitch(raw) {
  return raw === "1";
}

export function readHouseSwitch(storage) {
  try {
    const s = storage || (typeof localStorage !== "undefined" ? localStorage : null);
    return parseHouseSwitch(s ? s.getItem(HOUSE_SWITCH_KEY) : null);
  } catch { return false; }
}

/** Turn the new house on or off on this device. Returns false if storage refused. */
export function setHouseSwitch(on, storage) {
  try {
    const s = storage || localStorage;
    s.setItem(HOUSE_SWITCH_KEY, on ? "1" : "0");
  } catch { return false; }
  try { window.dispatchEvent(new CustomEvent(HOUSE_SWITCH_EVENT, { detail: { on: !!on } })); } catch { /* no window */ }
  return true;
}

function subscribe(cb) {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e) => { if (!e || e.key == null || e.key === HOUSE_SWITCH_KEY) cb(); };
  window.addEventListener(HOUSE_SWITCH_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(HOUSE_SWITCH_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** The switch, kept live (this tab and other tabs). */
export function useHouseSwitch() {
  return useSyncExternalStore(subscribe, () => readHouseSwitch(), () => false);
}

// ── Three sizes of the same house (building code §4) ─────────────────────
// Effective width = viewport width ÷ text scale, so 1280 px at 200% text is
// laid out as 640 and large text reflows instead of squeezing. A phone held
// sideways (touch pointer, under 480 tall) is a phone.
export const HOUSE_PHONE_BELOW = 640;
export const HOUSE_FULL_FROM = 1024;

export function houseSizeClass({ width, height = 800, textScale = 1, coarse = false }) {
  const scale = Number(textScale) > 0 ? Number(textScale) : 1;
  const eff = Number(width) / scale;
  if (!(eff >= HOUSE_PHONE_BELOW) || (coarse && Number(height) < 480)) return "phone";
  if (eff < HOUSE_FULL_FROM) return "compact";
  return "full";
}

export function readHouseSize() {
  if (typeof window === "undefined") return "full";
  let textScale = 1;
  let coarse = false;
  try { textScale = (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16) / 16; } catch { /* default */ }
  try { coarse = window.matchMedia("(pointer: coarse)").matches; } catch { /* default */ }
  return houseSizeClass({ width: window.innerWidth, height: window.innerHeight, textScale, coarse });
}

/** "phone" | "compact" | "full", kept live through resizes and text-size changes. */
// `enabled` false (the switch is off): no listeners at all, so the old
// house pays nothing for the new one.
export function useHouseSizeClass(enabled = true) {
  const [size, setSize] = useState(readHouseSize);
  useEffect(() => {
    if (!enabled) return undefined;
    const on = () => setSize(readHouseSize());
    on();
    window.addEventListener("resize", on);
    let mo;
    try {
      // The text size is a class (and style) on <html>.
      mo = new MutationObserver(on);
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
    } catch { /* no DOM */ }
    return () => { window.removeEventListener("resize", on); mo?.disconnect(); };
  }, [enabled]);
  return size;
}

// ── Support over old dialogs (building code §14) ───────────────────────
// When the new house arrives at a Support page, the frame announces it, and
// every old dialog, sheet or confirm still open closes the way its own
// close button would (so a draft it keeps is kept). Only the frame sends
// this, so the old house never closes a dialog because of it.
export const HOUSE_SUPPORT_EVENT = "symphony-house-support";

export function announceSupportJump() {
  try { window.dispatchEvent(new CustomEvent(HOUSE_SUPPORT_EVENT)); } catch { /* no window */ }
}

/** An old dialog root: close (as its own close would) when the house goes to Support. */
export function useCloseOnSupportJump(open, onOpenChange) {
  const ref = useRef(onOpenChange);
  ref.current = onOpenChange;
  useEffect(() => {
    if (!open) return undefined;
    const on = () => { try { ref.current?.(false); } catch { /* the dialog's own close failed: leave it open */ } };
    window.addEventListener(HOUSE_SUPPORT_EVENT, on);
    return () => window.removeEventListener(HOUSE_SUPPORT_EVENT, on);
  }, [open]);
}

// ── The house's own Home room (the approved mockups, boards 01 and 08) ──
// With the new house on, "/" is the house's Home room: its pages are
// Today · Me · Plans, picked with ?page=. The person's own home screen and
// widget board (the old Dashboard) stay one tab away as ?page=board, so no
// board, widget or layout is lost. On the Home room the old Dashboard still
// mounts, but only for the dialogs it hosts (Quick Check-In, ?action= links,
// the welcome steps, notifications…), never its board.
export const HOUSE_HOME_PAGES = Object.freeze(["today", "me", "plans", "board"]);

export function houseHomePage(search) {
  let p = null;
  try { p = new URLSearchParams(search || "").get("page"); } catch { /* bad search */ }
  return HOUSE_HOME_PAGES.includes(p) ? p : "today";
}

/** Is this the house's Home room (not the person's old board)? */
export function isHouseHomeRoom(pathname, search) {
  return pathname === "/" && houseHomePage(search) !== "board";
}

// ── The house's own Support rooms (plan step 3.1, "the fire exit") ───────
// With the new house on, these four routes are drawn by the house itself
// (src/house/support/, boards 15, 38, 39, 40 and 41) and the old page is not
// mounted: `HouseRoomGate` wraps each old page's route element and draws
// nothing while the house is on. With the switch off the old pages run
// exactly as before. Exact paths only (/unblend/questions stays old).
export const HOUSE_SUPPORT_ROOMS = Object.freeze({
  "/grounding": "support",
  "/unblend": "unblend",
  "/safety-plan": "safety",
  "/emergency": "emergency",
});

/** The Support room the house draws for this path, or null. */
export function houseSupportRoom(pathname) {
  const p = String(pathname || "").replace(/\/+$/, "") || "/";
  return Object.prototype.hasOwnProperty.call(HOUSE_SUPPORT_ROOMS, p) ? HOUSE_SUPPORT_ROOMS[p] : null;
}

/** An old page's route element: drawn only while the new house is off. */
export function HouseRoomGate({ children }) {
  const on = useHouseSwitch();
  return on ? null : children;
}

// ── The house's Timeline room (plan step 3.3, boards 01, 08 and 09) ─────
// With the new house on, /timeline is drawn by the house itself
// (src/house/timeline/): the layered timeline over a day, six hours or a
// week, with Info and Layers. The old page is not mounted (HouseRoomGate);
// with the switch off it runs exactly as before.
export function houseTimelineRoom(pathname) {
  const p = String(pathname || "").replace(/\/+$/, "") || "/";
  return p === "/timeline";
}

// ── The house's Planner room (plan step 5.1, boards 04 and 48) ───────────
// With the new house on, /planner is drawn by the house itself
// (src/house/planner/): the week with Day · Week · Month · Year · Plans
// list and Insights, the month, the categories, this week, goals and the
// plans that need a decision. The old page is not mounted (HouseRoomGate);
// with the switch off it runs exactly as before.
export function housePlannerRoom(pathname) {
  const p = String(pathname || "").replace(/\/+$/, "") || "/";
  return p === "/planner";
}

// ── The house's Alters room (boards 03 and 12) ──────────────────────────
// With the new house on, /Home (the alters directory, NOT the home screen)
// and /alter/:id (a profile) are drawn by the house itself
// (src/house/alters/). The old pages are not mounted (HouseRoomGate); the
// person's own profile layout stays reachable inside the room ("Your own
// layout"). With the switch off both run exactly as before.
export function houseAltersRoom(pathname) {
  const p = String(pathname || "").replace(/\/+$/, "") || "/";
  if (p === "/Home") return "directory";
  if (/^\/alter\/[^/]+$/.test(p)) return "profile";
  return null;
}

// ── The house's Write room (boards 05 and 14) ───────────────────────────
// With the new house on, /journals and /chat are drawn by the house itself
// (src/house/write/). The old pages are not mounted (HouseRoomGate); with
// the switch off both run exactly as before.
export function houseWriteRoom(pathname) {
  const p = String(pathname || "").replace(/\/+$/, "") || "/";
  if (p === "/journals") return "journals";
  if (p === "/chat") return "chat";
  return null;
}

// ── The house's Notebook room (boards 18, 19 and 20) ────────────────────
// With the new house on, /goals (the Notebook: pages, notes & lists, flash
// cards) is drawn by the house itself (src/house/notebook/). The old page
// is not mounted (HouseRoomGate); the person's own boards (the Notebook's
// front board, a page's own layout, the Notes & lists board) stay
// reachable inside the room. /notes still redirects to /goals?notes=1.
// With the switch off the old page runs exactly as before.
export function houseNotebookRoom(pathname) {
  const p = String(pathname || "").replace(/\/+$/, "") || "/";
  return p === "/goals";
}

// ── The house's Settings room (board 07, board 10's shell) ─────────────
// With the new house on, /settings is drawn by the house itself
// (src/house/settings/): the section list with Find, the open page in the
// middle, the live Preview beside the look pages; on a phone the list
// drills into each page. The pages' own contents are the old settings
// components (one catalogue, settingsPages.jsx). The old page is not
// mounted (HouseRoomGate); with the switch off it runs exactly as before.
export function houseSettingsRoom(pathname) {
  const p = String(pathname || "").replace(/\/+$/, "") || "/";
  return p === "/settings";
}

// ── The house's System map room (boards 02 and 11) ──────────────────────
// With the new house on, /system-map (the inner world, Who fronts together
// and the list of places) is drawn by the house itself (src/house/map/),
// around the one inner-world canvas. Place profiles (/location/:id) stay
// the old page in the frame. The old page is not mounted (HouseRoomGate);
// with the switch off it runs exactly as before.
export function houseMapRoom(pathname) {
  const p = String(pathname || "").replace(/\/+$/, "") || "/";
  return p === "/system-map";
}

// ── The house's Analytics room (board 06) ─────────────────────────────
// With the new house on, /analytics is drawn by the house itself
// (src/house/analytics/): the range toolbar, the board of panels (Fronting
// time, Feelings by day, Who fronts together, Symptoms, Sleep, Noticed) and
// "Look closer" doors into the old page's five views, drawn inside the room
// on their old addresses (?tab=, ?alter=). The old page is not mounted
// (HouseRoomGate); with the switch off it runs exactly as before.
export function houseAnalyticsRoom(pathname) {
  const p = String(pathname || "").replace(/\/+$/, "") || "/";
  return p === "/analytics";
}

// ── The house's Reminders room (boards 23 and 24) ──────────────────────
// With the new house on, /reminders is drawn by the house itself
// (src/house/reminders/): Due now, Your reminders and the reminder editor
// (on a phone, Inbox · Manage and the editor on its own address,
// ?edit=<id> or ?new=1). The old page is not mounted (HouseRoomGate); with
// the switch off it runs exactly as before.
export function houseRemindersRoom(pathname) {
  const p = String(pathname || "").replace(/\/+$/, "") || "/";
  return p === "/reminders";
}

/** Is this route one of the rooms the house has rebuilt (not an old page in the frame)? */
export function houseRebuiltRoom(pathname) {
  return !!houseSupportRoom(pathname) || houseTimelineRoom(pathname) || housePlannerRoom(pathname) || !!houseAltersRoom(pathname) || !!houseWriteRoom(pathname) || houseNotebookRoom(pathname) || houseSettingsRoom(pathname) || houseMapRoom(pathname) || houseAnalyticsRoom(pathname) || houseRemindersRoom(pathname);
}

// ── The house's check-in sheets (boards 16, 17 and 47) ─────────────────
// Quick check-in, "Who feels …?" and Set front are old dialogs opened from
// many places (the Home room, the old Dashboard host, the check-in log, the
// timeline, the frames). With the new house on, the frames wrap everything
// in the house's sheet look (src/house/checkin/HouseSheets.jsx, loaded with
// the frames) and each sheet reads it here: the board's layout, the house's
// paint on its portaled root, and the house's own pieces (the phone header).
// Outside the house there is no provider, so the hook returns null and every
// sheet draws exactly as it did. This stays a bare context so nothing of
// src/house reaches the old house's bundle.
export const HouseSheetContext = createContext(null);

/** The house's sheet look while the new house is on, else null. */
export function useHouseSheet() {
  return useContext(HouseSheetContext);
}
