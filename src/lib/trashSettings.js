// The trash's recovery window and time lock, as pure functions so the
// sync/merge test scripts can run them in node (v0.278.0). See trash.js.

export const DAY_MS = 24 * 3600 * 1000;
export const DEFAULT_TRASH_DAYS = 30;
export const TRASH_DAY_CHOICES = [7, 14, 30, 60, 90, 180, 365, 0];
// A weakening change made under the lock waits at least this long, even
// when the window is "never empty by itself".
const MIN_LOCK_WAIT_DAYS = 30;

const cleanDays = (d) => (Number.isFinite(d) && d >= 0 ? Math.round(d) : DEFAULT_TRASH_DAYS);

const sortKeys = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

// "Longer" in the protective sense: 0 (never) beats any number of days.
const isLonger = (a, b) => (a === 0 ? b !== 0 : b !== 0 && a > b);

// The settings in force now: a pending change whose time has come is
// applied. Never throws.
export function resolveTrashSettings(raw, now = Date.now()) {
  const r = raw && typeof raw === "object" ? raw : {};
  let days = cleanDays(r.days);
  let lock = r.lock === true;
  let pending = r.pending && typeof r.pending === "object" ? r.pending : null;
  if (pending && Date.parse(pending.effective_at) <= now) {
    if ("days" in pending) days = cleanDays(pending.days);
    if ("lock" in pending) lock = pending.lock === true;
    pending = null;
  }
  return { days, lock, pending };
}

// The value to save when the person asks for `want` ({ days?, lock? }).
// Under the lock, the weakening parts wait out the current window.
export function changeTrashSettings(raw, want, now = Date.now()) {
  const cur = resolveTrashSettings(raw, now);
  const next = { days: cur.days, lock: cur.lock };
  const later = { ...(cur.pending || {}) };
  delete later.effective_at;
  const lockedNow = cur.lock;

  if ("days" in want) {
    const d = cleanDays(want.days);
    if (d === cur.days) delete later.days;
    else if (isLonger(d, cur.days) || !lockedNow) { next.days = d; delete later.days; }
    else later.days = d;
  }
  if ("lock" in want) {
    if (want.lock === true) { next.lock = true; delete later.lock; }
    else if (!lockedNow) next.lock = false;
    else later.lock = false;
  }
  // A newly queued weakening waits a full window from now; an unchanged
  // queue keeps its date (so lengthening something else doesn't delay it).
  const waitDays = Math.max(cur.days || 0, MIN_LOCK_WAIT_DAYS);
  const prevLater = { ...(cur.pending || {}) };
  delete prevLater.effective_at;
  const same = JSON.stringify(sortKeys(prevLater)) === JSON.stringify(sortKeys(later));
  const pending = Object.keys(later).length
    ? { ...later, effective_at: same && cur.pending?.effective_at ? cur.pending.effective_at : new Date(now + waitDays * DAY_MS).toISOString() }
    : null;
  return { days: next.days, lock: next.lock, pending };
}

// What a delete confirm says instead of "This can't be undone".
export const TRASH_HINT = "You can put it back from the trash in Recent Changes.";
export const TRASH_HINT_MANY = "You can put them back from the trash in Recent Changes.";
