// "Last time…" and the phone's "Open" list (new house step 2.2, plan §3
// "Everything and Last time… on Home after a gap"; building code §2: the
// phone has no open-page tabs, it has the "Open" list in ⋯ and Last time…).
//
// Runtime state on this device, like the desktop's open-page tabs: the last
// few pages visited and when the app was last in use. Not a preference, so
// not backed up, and losing it loses nothing (it never holds a record, only
// paths the person can reach again from Everything). Pure functions here;
// the frame does the reading and writing. Tested in scripts/test-house-phone.mjs.

export const HOUSE_RECENT_KEY = "symphony_house_recent_v1";
export const RECENT_MAX = 8;
export const LAST_TIME_GAP_MS = 4 * 60 * 60 * 1000; // four hours away

const okPath = (p) => typeof p === "string" && p.startsWith("/") && !p.startsWith("//") && p.length < 400;

export function readRecent(raw) {
  try {
    const v = JSON.parse(raw || "null");
    if (v && typeof v === "object") {
      const recent = (Array.isArray(v.recent) ? v.recent : [])
        .filter((r) => r && okPath(r.path) && Number.isFinite(Number(r.at)))
        .map((r) => ({ path: r.path, at: Number(r.at) }))
        .slice(0, RECENT_MAX);
      const at = Number.isFinite(Number(v.at)) ? Number(v.at) : (recent[0]?.at || 0);
      return { v: 1, at, recent };
    }
  } catch { /* unreadable runtime state: start again */ }
  return { v: 1, at: 0, recent: [] };
}

/** A page was opened: it goes to the front of the list (once). */
export function recordVisit(state, path, now = Date.now()) {
  if (!okPath(path)) return state;
  const recent = [{ path, at: now }, ...state.recent.filter((r) => r.path !== path)].slice(0, RECENT_MAX);
  return { v: 1, at: now, recent };
}

/** The app is in use (or being left): remember when. */
export function touch(state, now = Date.now()) {
  return { ...state, at: now };
}

/**
 * After a gap, where the person was: the newest page that isn't Home.
 * `state` is what was stored BEFORE this visit. Null when there was no gap
 * or nowhere to go back to.
 */
export function lastTimeFrom(state, now = Date.now(), gap = LAST_TIME_GAP_MS) {
  if (!state || !state.at || now - state.at < gap) return null;
  const last = state.recent.find((r) => r.path !== "/" && !r.path.startsWith("/?"));
  return last ? { path: last.path, at: last.at, away: now - state.at } : null;
}

/** "3 hours", "yesterday", "4 days": how long the person was away. */
export function awayWords(ms) {
  const h = Math.round(ms / 3600000);
  if (h < 24) return `${Math.max(1, h)} hour${h === 1 ? "" : "s"}`;
  const d = Math.round(h / 24);
  if (d === 1) return "a day";
  return `${d} days`;
}
