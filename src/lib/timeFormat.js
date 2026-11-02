// 12-hour (standard) or 24-hour (military) clock — one app-wide preference.
// Set in Settings → Reminders & time → Clock. Stored in localStorage and listed in
// BACKUP_LS_KEYS so it rides backups and the local settings mirror.
import { useSyncExternalStore } from "react";

export const TIME_FORMAT_KEY = "symphony_time_format_v1";
const EVENT = "symphony-time-format-changed";

export function getTimeFormat() {
  try { return localStorage.getItem(TIME_FORMAT_KEY) === "24" ? "24" : "12"; } catch { return "12"; }
}

export function setTimeFormat(v) {
  try { localStorage.setItem(TIME_FORMAT_KEY, v === "24" ? "24" : "12"); } catch { /* storage off */ }
  // The planner grid has its own clock switch; choosing the app-wide clock
  // sets it too, so the two don't disagree. (It can still be changed there.)
  try { localStorage.setItem("symphony_act_time_fmt", v === "24" ? "24" : "ampm"); } catch { /* storage off */ }
  try { window.dispatchEvent(new Event(EVENT)); } catch { /* no window */ }
}

const subscribe = (cb) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener("storage", cb); };
};

// Re-renders the caller when the preference changes.
export function useTimeFormat() {
  return useSyncExternalStore(subscribe, getTimeFormat, () => "12");
}

// Drop-in for toLocaleTimeString: pass any Intl options, the hour cycle follows the preference.
export function formatTime(date, opts = { hour: "2-digit", minute: "2-digit" }, format = getTimeFormat()) {
  return new Date(date).toLocaleTimeString([], { ...opts, hour12: format !== "24" });
}

// date-fns pattern for the person's clock. Write patterns the 12-hour way
// ("h:mm a", "h:mmaaa", "h a"); on a 24-hour clock they become "HH:mm" /
// "HH:00". Everything else in the pattern is left as it is.
export function clockPattern(pattern, format = getTimeFormat()) {
  if (format !== "24") return pattern;
  return String(pattern)
    .replace(/h:mm ?a{1,5}/g, "HH:mm")
    .replace(/\bh a{1,5}\b/g, "HH:00");
}

// Spread into any toLocaleTimeString / Intl options: `{ hour: "numeric", minute: "2-digit", ...clockOpts() }`.
export const clockOpts = (format = getTimeFormat()) => ({ hour12: format !== "24" });
