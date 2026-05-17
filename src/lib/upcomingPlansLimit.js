/**
 * User-configurable cap on how many Upcoming Plans the dashboard widget
 * (and its other surfaces) renders. Two modes:
 *
 *   - "count"   — show the next N plans, 3 <= N <= 25.
 *   - "window"  — show plans whose timestamp falls within a chosen
 *                 window from now ("next 24 hours", "this week", etc.).
 *
 * Persisted in localStorage so the user can switch modes without
 * losing the value of the inactive mode.
 *
 * Defaults mirror the previous hardcoded behaviour: count mode with
 * N = 5 (which is exactly what UpcomingPlans.jsx used to default to
 * before this setting existed). Any existing user who never opens the
 * setting will keep seeing the same thing they always have.
 */

export const LIMIT_MODE_KEY    = "upcoming_plans_limit_mode";
export const LIMIT_COUNT_KEY   = "upcoming_plans_limit_count";
export const LIMIT_WINDOW_KEY  = "upcoming_plans_limit_window";

export const MODE_COUNT  = "count";
export const MODE_WINDOW = "window";

export const COUNT_MIN = 3;
export const COUNT_MAX = 25;
export const DEFAULT_COUNT = 5;
export const DEFAULT_WINDOW_ID = "2_weeks";

// Hard ceiling applied in window mode so a year-long window with a huge
// plan list can't accidentally render thousands of rows.
export const WINDOW_MODE_HARD_CAP = 50;

const DAY_MS = 24 * 60 * 60 * 1000;

export const WINDOW_OPTIONS = [
  { id: "24_hours", label: "Next 24 hours",  ms: 1  * DAY_MS },
  { id: "3_days",   label: "Next 3 days",    ms: 3  * DAY_MS },
  { id: "week",     label: "This week",      ms: 7  * DAY_MS },
  { id: "2_weeks",  label: "Next 2 weeks",   ms: 14 * DAY_MS },
  { id: "month",    label: "Next month",     ms: 30 * DAY_MS },
  { id: "3_months", label: "Next 3 months",  ms: 90 * DAY_MS },
];

function safeRead(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const v = window.localStorage.getItem(key);
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}

function safeWrite(key, value) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // localStorage might be unavailable (private browsing, quota); silently
    // ignore — the setting just won't persist, but the UI still works.
  }
}

export function getLimitMode() {
  const raw = safeRead(LIMIT_MODE_KEY, MODE_COUNT);
  return raw === MODE_WINDOW ? MODE_WINDOW : MODE_COUNT;
}

export function setLimitMode(mode) {
  safeWrite(LIMIT_MODE_KEY, mode === MODE_WINDOW ? MODE_WINDOW : MODE_COUNT);
}

export function getLimitCount() {
  const raw = safeRead(LIMIT_COUNT_KEY, String(DEFAULT_COUNT));
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return DEFAULT_COUNT;
  if (n < COUNT_MIN) return COUNT_MIN;
  if (n > COUNT_MAX) return COUNT_MAX;
  return n;
}

export function setLimitCount(n) {
  const clamped = Math.max(COUNT_MIN, Math.min(COUNT_MAX, parseInt(n, 10) || DEFAULT_COUNT));
  safeWrite(LIMIT_COUNT_KEY, clamped);
}

export function getLimitWindowId() {
  const raw = safeRead(LIMIT_WINDOW_KEY, DEFAULT_WINDOW_ID);
  return WINDOW_OPTIONS.find(w => w.id === raw)?.id || DEFAULT_WINDOW_ID;
}

export function setLimitWindowId(id) {
  const match = WINDOW_OPTIONS.find(w => w.id === id);
  safeWrite(LIMIT_WINDOW_KEY, match ? match.id : DEFAULT_WINDOW_ID);
}

export function getLimitWindowMs() {
  const id = getLimitWindowId();
  return WINDOW_OPTIONS.find(w => w.id === id)?.ms ?? WINDOW_OPTIONS.find(w => w.id === DEFAULT_WINDOW_ID).ms;
}

/**
 * Resolve the active limit config in one call. Returns:
 *   { mode: "count", count: N }
 *   { mode: "window", windowMs: N, windowId: "...", windowLabel: "..." }
 */
export function getActiveLimit() {
  const mode = getLimitMode();
  if (mode === MODE_WINDOW) {
    const id = getLimitWindowId();
    const opt = WINDOW_OPTIONS.find(w => w.id === id);
    return { mode, windowMs: opt.ms, windowId: opt.id, windowLabel: opt.label };
  }
  return { mode, count: getLimitCount() };
}
