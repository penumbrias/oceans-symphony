// Fronts that were still OPEN (no end time) when another app's export file
// was made. Shared by every one-time file importer (Octocon, OpenPlural,
// Ampersand, Simply Plural).
//
// A file can be days or weeks old by the time it's imported, so making its
// open fronts live silently put people in front that the user never picked
// (bug report: "other people appeared logged as fronting that I didn't
// select"). The rule every importer follows:
//
//   - By default an open front is kept as HISTORY that ends at the import
//     time (never before it started), and the importer tags it
//     `<source>_open_at_export: true` so it can be told apart from a front
//     that really ended then.
//   - Only when the user opts in (the "Also mark the N … still fronting in
//     this file as fronting now" checkbox) does it stay live — and never for
//     an alter already fronting here, or already made live earlier in the
//     same import (that would duplicate them in the current front).

// Resolve the end / active state of one imported front.
//   startIso  — the front's start (ISO string)
//   open      — the file has it still open
//   end       — the file's end time (ISO or null) — used as-is when present
//   makeLive  — caller decided this one may become a current front
//   closeAt   — the import time (ISO / Date); defaults to now
// Returns { end_time, is_active, open }.
export function settleOpenFront(startIso, { open, end = null, makeLive = false, closeAt } = {}) {
  if (!open) return { end_time: end || null, is_active: false, open: false };
  if (makeLive) return { end_time: null, is_active: true, open: true };
  if (end) return { end_time: end, is_active: false, open: true };
  const at = closeAt ? new Date(closeAt) : new Date();
  const startMs = new Date(startIso).getTime();
  // Never end before it started (a clock-skewed export).
  const endDate = Number.isFinite(startMs) && !(at.getTime() >= startMs) ? new Date(startMs) : at;
  return { end_time: endDate.toISOString(), is_active: false, open: true };
}

// Tracks who is fronting HERE (from the existing sessions) plus anyone the
// import has already made live, so an open front is only made live when the
// user opted in AND that alter isn't fronting yet. Also tracks whether a
// primary is already set, so a file's "primary" can't create a second one.
//
//   const gate = createLiveFrontGate(existingSessions, makeOpenFrontsCurrent);
//   const live = gate.allow(localAlterId);          // before mapping
//   … map the session with makeLive: live …
//   gate.record(session);                           // after mapping
export function createLiveFrontGate(existingSessions, enabled) {
  const activeAlterIds = new Set();
  let hasPrimary = false;
  for (const s of existingSessions || []) {
    if (!s || !s.is_active) continue;
    const id = s.alter_id || s.primary_alter_id;
    if (id) activeAlterIds.add(id);
    if (s.is_primary || (s.primary_alter_id && !s.alter_id)) hasPrimary = true;
  }
  return {
    allow(localAlterId) {
      return !!enabled && !!localAlterId && !activeAlterIds.has(localAlterId);
    },
    // A live session that claims primary while someone here is already
    // primary is demoted to a co-front (never two primaries).
    record(session) {
      if (!session || !session.is_active) return session;
      if (session.is_primary) {
        if (hasPrimary) session.is_primary = false;
        else hasPrimary = true;
      }
      if (session.alter_id) activeAlterIds.add(session.alter_id);
      return session;
    },
  };
}

// How many distinct alters the file has still fronting. `keyOf(item)`
// returns the source alter id of an open front, or null for a closed one.
export function countOpenFrontAlters(items, keyOf) {
  const ids = new Set();
  for (const it of items || []) {
    const k = keyOf(it);
    if (k != null && k !== "") ids.add(String(k));
  }
  return ids.size;
}
