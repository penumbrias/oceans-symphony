// Backup health — the ONE record of "when did this data last get out of
// the device, and did the last attempt work?"
//
// Before this, auto-backup swallowed failures (console.warn, return false)
// and only remembered its last SUCCESS in a localStorage key that a device
// cleaner erases — so a user could have months of silently failing
// backups and a "last backup" that pointed at nothing. Silent backup
// failure is the one remaining way a storage wipe could still hurt.
//
// This module:
//   • records every attempt (auto or manual, success or failure, reason)
//   • keeps that record in an allow-listed key → mirrored into the DB blob
//     (localSettingsMirror), so a localStorage wipe can't erase the history
//   • evaluates health into a small set of states the UI can show
//
// It is deliberately tiny and dependency-free so both the home notice
// stack and Settings can read it without pulling in the export machinery.

export const BACKUP_HEALTH_KEY = "symphony_backup_health_v1";
const MAX_EVENTS = 20;
const CHANGE_EVENT = "symphony-backup-health-changed";

function read() {
  try {
    const raw = localStorage.getItem(BACKUP_HEALTH_KEY);
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v === "object" ? v : { events: [] };
  } catch { return { events: [] }; }
}
function write(state) {
  try { localStorage.setItem(BACKUP_HEALTH_KEY, JSON.stringify(state)); } catch { /* quota / off */ }
  try { window.dispatchEvent(new Event(CHANGE_EVENT)); } catch { /* SSR */ }
}

// kind: "auto" | "manual" | "recovery"; ok: boolean; detail: short reason
// / destination string. Never throws.
export function recordBackupAttempt({ kind = "manual", ok, detail = "", partial = false } = {}) {
  try {
    const st = read();
    const ev = { at: new Date().toISOString(), kind, ok: !!ok, partial: !!partial, detail: String(detail || "").slice(0, 160) };
    st.events = [ev, ...(Array.isArray(st.events) ? st.events : [])].slice(0, MAX_EVENTS);
    if (ok) st.lastOkAt = ev.at;
    write(st);
  } catch { /* never surface */ }
}

// The user explicitly acknowledged the current warning (snooze until the
// state changes or 3 days pass).
export function snoozeBackupWarning(days = 3) {
  const st = read();
  st.snoozedUntil = new Date(Date.now() + days * 86400000).toISOString();
  write(st);
}

// Health evaluation.
//   level: "ok" | "none" | "stale" | "failing" | "off"
//   - off:      auto-backup mode is "off" AND no manual backup in 30 days
//   - none:     never backed up (no lastOkAt anywhere)
//   - failing:  the most recent attempts (≥2 consecutive) failed
//   - stale:    last success older than max(2× interval, 7 days) with auto
//               on, or older than 30 days without it
//   - ok:       otherwise
export function evaluateBackupHealth({ mode = "auto", intervalDays = 0, legacyLastAt = null } = {}) {
  const st = read();
  const events = Array.isArray(st.events) ? st.events : [];
  const lastOk = st.lastOkAt || legacyLastAt || null;
  const lastOkMs = lastOk ? Date.parse(lastOk) : NaN;
  const daysSince = Number.isFinite(lastOkMs) ? (Date.now() - lastOkMs) / 86400000 : null;

  let consecutiveFails = 0;
  for (const e of events) { if (e.ok) break; consecutiveFails++; }
  const lastFail = events.find((e) => !e.ok) || null;

  const snoozed = st.snoozedUntil && Date.parse(st.snoozedUntil) > Date.now();

  let level = "ok";
  if (consecutiveFails >= 2) level = "failing";
  else if (daysSince == null) level = mode === "off" ? "off" : "none";
  else {
    const autoOn = mode !== "off" && intervalDays > 0;
    const staleAfter = autoOn ? Math.max(intervalDays * 2, 7) : 30;
    if (daysSince > staleAfter) level = mode === "off" ? "off" : "stale";
  }
  // A backup that succeeded but knowingly left things out (only the active
  // system; media over the size limit) is "partial": healthy on time, but
  // the user must be told what's not in it.
  const lastOkEvent = events.find((e) => e.ok) || null;
  const partial = !!lastOkEvent?.partial;
  return { level, daysSince, lastOkAt: lastOk, consecutiveFails, lastFailDetail: lastFail?.detail || "", lastFailAt: lastFail?.at || null, snoozed, events, partial, partialDetail: partial ? lastOkEvent.detail : "" };
}

export const BACKUP_HEALTH_CHANGE_EVENT = CHANGE_EVENT;
