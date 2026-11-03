// Quick jump (v0.345.0) — what the quick-taps gesture opens.
//
// The gesture used to always open the grocery / notes panel as a privacy
// cover. Now the person picks where it goes:
//   lists  — the notes & lists panel (the old behaviour, and the default,
//            so nobody's gesture changes until they choose)
//   page   — any page or exact spot in the app (a journal, a goal, the
//            Soundscape in full screen…) — doubles as quick navigation
//   image  — a picture or gif shown full screen (one from Assets)
//
// "Lock behind it" (only with a password set): the jump puts a gate behind
// what it opened. Leaving it — closing the panel or picture, or moving off
// the page — locks the app and asks for the password again. The lock
// preference is the panel's old lock-on-close key, so a person who had
// that on keeps it.
//
// Stored on SystemSettings.quick_jump { target, path, label, image_url }.
// The gate itself lives in sessionStorage so a reload on the gated page
// keeps it, and it is cleared the moment it locks (otherwise unlocking
// would land straight back on a tripped gate).

import { clearSession } from "@/lib/localDb";
import { isEncryptionEnabled } from "@/lib/storageMode";

export const QUICK_JUMP_TARGETS = ["lists", "page", "image"];
export const LOCK_PREF_KEY = "grocery_lock_on_close_v1";
const GATE_KEY = "symphony_quick_jump_gate_v1";
const LAST_PAGE_KEY = "symphony_quick_jump_last_page_v1";

// The Soundscape opened straight into its full-screen visual.
export const SOUNDSCAPE_FOCUS_PATH = "/grounding?view=soundscape&focus=1";

export function readQuickJump(settings) {
  const raw = settings?.quick_jump;
  const target = QUICK_JUMP_TARGETS.includes(raw?.target) ? raw.target : "lists";
  return {
    target,
    path: typeof raw?.path === "string" && raw.path.startsWith("/") ? raw.path : "",
    label: typeof raw?.label === "string" ? raw.label : "",
    image_url: typeof raw?.image_url === "string" ? raw.image_url : "",
  };
}

// What the gesture actually does with these settings — a page or picture
// target that was never filled in falls back to the lists panel.
export function effectiveTarget(jump) {
  if (jump.target === "page" && jump.path) return "page";
  if (jump.target === "image" && jump.image_url) return "image";
  return "lists";
}

export function readLockPref() {
  try { return localStorage.getItem(LOCK_PREF_KEY) === "true"; } catch { return false; }
}
export function writeLockPref(on) {
  try { localStorage.setItem(LOCK_PREF_KEY, on ? "true" : "false"); } catch { /* storage off */ }
  window.dispatchEvent(new CustomEvent("os-quick-jump-lock-changed", { detail: { on: !!on } }));
}
// The lock only means something when there is a password to ask for.
export const lockActive = () => readLockPref() && isEncryptionEnabled();

// ── The gate ────────────────────────────────────────────────────────────
export function armGate(path) {
  try { sessionStorage.setItem(GATE_KEY, path); } catch { /* storage off */ }
}
export function readGate() {
  try { return sessionStorage.getItem(GATE_KEY) || ""; } catch { return ""; }
}
export function clearGate() {
  try { sessionStorage.removeItem(GATE_KEY); } catch { /* storage off */ }
}
// Only the page itself counts — tabs and filters (?tab=…) can change while
// the person stays on it.
export const pathOnly = (p) => String(p || "").split(/[?#]/)[0] || "/";

// Locks the app: forget the key, reload into the unlock screen.
export function lockNow() {
  clearGate();
  try { clearSession(); } catch { /* ignore */ }
  window.location.reload();
}

// ── The page the person was on before Settings ─────────────────────────
// So "use the page I was just on" can pick an exact spot (a goal page, a
// journal entry) without a second picker for every kind of record.
export function rememberLastPage(location) {
  const full = `${location.pathname}${location.search || ""}`;
  if (pathOnly(full).toLowerCase().startsWith("/settings")) return;
  try { sessionStorage.setItem(LAST_PAGE_KEY, full); } catch { /* storage off */ }
}
export function readLastPage() {
  try { return sessionStorage.getItem(LAST_PAGE_KEY) || ""; } catch { return ""; }
}

// ── Firing ──────────────────────────────────────────────────────────────
// `navigate` is react-router's. Returns what it opened.
export function fireQuickJump(settings, navigate) {
  const jump = readQuickJump(settings);
  const target = effectiveTarget(jump);
  const lock = lockActive();
  if (target === "page") {
    if (lock) armGate(jump.path);
    navigate(jump.path);
    return "page";
  }
  if (target === "image") {
    window.dispatchEvent(new CustomEvent("os-quick-jump-image", { detail: { url: jump.image_url } }));
    return "image";
  }
  // source: "panic" lets the panel show its first-time explainer.
  window.dispatchEvent(new CustomEvent("open-grocery-list", { detail: { source: "panic" } }));
  return "lists";
}
