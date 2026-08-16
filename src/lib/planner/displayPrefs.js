// Planner display preferences — the same localStorage keys the classic
// Activity Tracker's grid used, so a user's clock format / row height /
// week start carry over instead of resetting when they move to the planner
// (and both surfaces stay in agreement).
import { useCallback, useEffect, useState } from "react";

export const LS_ROW_H = "symphony_act_row_h";          // px per hour
export const LS_TIME_FMT = "symphony_act_time_fmt";     // "24" | "ampm"
export const LS_WEEK_START = "symphony_act_week_start"; // 0 = Sunday, 1 = Monday
export const LS_DAY_W = "symphony_act_col_w";           // px per day column (classic key)

export const HOUR_PX_DEFAULT = 44;
export const HOUR_PX_MIN = 20;
export const HOUR_PX_MAX = 160;
export const DAY_PX_DEFAULT = 74;
export const DAY_PX_MIN = 44;
export const DAY_PX_MAX = 320;

const CHANGE_EVENT = "symphony-planner-prefs-changed";

function read(key, fallback) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage off */ }
  try { window.dispatchEvent(new Event(CHANGE_EVENT)); } catch { /* SSR */ }
}

export function getPlannerPrefs() {
  const rowH = Number(read(LS_ROW_H, HOUR_PX_DEFAULT));
  const colW = Number(read(LS_DAY_W, DAY_PX_DEFAULT));
  const ws = Number(read(LS_WEEK_START, 1));
  return {
    hourPx: Number.isFinite(rowH) ? Math.max(HOUR_PX_MIN, Math.min(HOUR_PX_MAX, rowH)) : HOUR_PX_DEFAULT,
    dayPx: Number.isFinite(colW) && colW > 0 ? Math.max(DAY_PX_MIN, Math.min(DAY_PX_MAX, colW)) : DAY_PX_DEFAULT,
    timeFmt: read(LS_TIME_FMT, "24") === "ampm" ? "ampm" : "24",
    weekStartsOn: ws === 0 ? 0 : 1,
  };
}

export function setPlannerPref(key, value) {
  if (key === "hourPx") write(LS_ROW_H, Math.round(Math.max(HOUR_PX_MIN, Math.min(HOUR_PX_MAX, Number(value) || HOUR_PX_DEFAULT))));
  else if (key === "dayPx") write(LS_DAY_W, Math.round(Math.max(DAY_PX_MIN, Math.min(DAY_PX_MAX, Number(value) || DAY_PX_DEFAULT))));
  else if (key === "timeFmt") write(LS_TIME_FMT, value === "ampm" ? "ampm" : "24");
  else if (key === "weekStartsOn") write(LS_WEEK_START, Number(value) === 0 ? 0 : 1);
}

// Live-updating hook: every planner instance (page + widgets) re-renders
// when any of them changes a preference.
// `overrides` = per-instance settings (a widget's own config fields) that
// beat the shared preference when set — a widget configured for a Monday
// week must show a Monday week even if the page pref says Sunday. Unset /
// empty override fields fall through to the shared value.
export function usePlannerPrefs(overrides) {
  const [prefs, setPrefs] = useState(getPlannerPrefs);
  useEffect(() => {
    const refresh = () => setPrefs(getPlannerPrefs());
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  const set = useCallback((key, value) => setPlannerPref(key, value), []);
  const merged = applyOverrides(prefs, overrides);
  return [merged, set];
}

export function applyOverrides(prefs, o) {
  if (!o) return prefs;
  const out = { ...prefs };
  if (o.weekStartsOn !== undefined && o.weekStartsOn !== null && o.weekStartsOn !== "") {
    out.weekStartsOn = Number(o.weekStartsOn) === 0 ? 0 : 1;
  }
  if (o.timeFmt === "12" || o.timeFmt === "ampm") out.timeFmt = "ampm";
  else if (o.timeFmt === "24") out.timeFmt = "24";
  const h = Number(o.hourPx ?? o.rowH);
  if (Number.isFinite(h) && h > 0) out.hourPx = Math.max(HOUR_PX_MIN, Math.min(HOUR_PX_MAX, h));
  const w = Number(o.dayPx ?? o.colW);
  if (Number.isFinite(w) && w > 0) out.dayPx = Math.max(DAY_PX_MIN, Math.min(DAY_PX_MAX, w));
  return out;
}

// "09:30" or "9:30am" from minutes-since-midnight, per the clock preference.
export function formatClock(minutes, fmt) {
  const whole = Math.round(minutes);
  const h = Math.floor(whole / 60) % 24;
  const m = whole % 60;
  if (fmt !== "ampm") return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  const period = h < 12 ? "am" : "pm";
  const hh = h % 12 || 12;
  return `${hh}:${String(m).padStart(2, "0")}${period}`;
}

// The hour gutter label — compact: "09" / "9am".
export function formatHourLabel(hour, fmt) {
  if (fmt !== "ampm") return String(hour).padStart(2, "0");
  const period = hour < 12 ? "am" : "pm";
  return `${hour % 12 || 12}${period}`;
}
