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

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

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
