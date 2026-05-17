// Activity lifecycle status helpers.
//
// Activities went from a binary "is_planned vs logged" view (where
// is_planned was just `timestamp > Date.now()`) to first-class lifecycle
// states. The enum values are persisted on Activity records; legacy
// records have no `status` field and default to either "logged" (past
// timestamp) or "scheduled" (future timestamp) when read.
//
// Status enum:
//   "logged"     — past activity captured after the fact. Terminal.
//   "scheduled"  — future plan, not yet acted on. Mutable.
//   "done"       — a scheduled plan the user marked completed.
//   "partial"    — a scheduled plan partly completed; may carry
//                  actual_duration_minutes when the user entered one.
//   "skipped"    — a scheduled plan the user chose to skip.
//   "cancelled"  — a scheduled plan that no longer applies.
//
// Rescheduling does NOT introduce a "rescheduled" status. Instead the
// record's timestamp is mutated and a row is appended to
// reschedule_history; the status stays "scheduled".

export const ACTIVITY_STATUSES = Object.freeze({
  LOGGED: "logged",
  SCHEDULED: "scheduled",
  DONE: "done",
  PARTIAL: "partial",
  SKIPPED: "skipped",
  CANCELLED: "cancelled",
});

export const ALL_STATUSES = Object.freeze([
  ACTIVITY_STATUSES.LOGGED,
  ACTIVITY_STATUSES.SCHEDULED,
  ACTIVITY_STATUSES.DONE,
  ACTIVITY_STATUSES.PARTIAL,
  ACTIVITY_STATUSES.SKIPPED,
  ACTIVITY_STATUSES.CANCELLED,
]);

// True for statuses that are terminal — no further lifecycle action
// other than Undo (where supported). Used by the popover to gate which
// buttons appear.
const RESOLVED_STATUSES = new Set([
  ACTIVITY_STATUSES.DONE,
  ACTIVITY_STATUSES.PARTIAL,
  ACTIVITY_STATUSES.SKIPPED,
  ACTIVITY_STATUSES.CANCELLED,
]);

// Read-side default: legacy records (created before lifecycle landed)
// have no `status` field. Treat past-dated ones as "logged" and
// future-dated ones as "scheduled". Never mutates the record — this is
// only a derived view. The on-disk record only gains a `status` field
// when the user explicitly acts on it.
export function statusFor(activity) {
  if (!activity) return null;
  if (activity.status && ALL_STATUSES.includes(activity.status)) {
    return activity.status;
  }
  const ts = activity.timestamp ? new Date(activity.timestamp).getTime() : 0;
  return ts > Date.now() ? ACTIVITY_STATUSES.SCHEDULED : ACTIVITY_STATUSES.LOGGED;
}

export function isResolved(activity) {
  return RESOLVED_STATUSES.has(statusFor(activity));
}

export function isScheduled(activity) {
  return statusFor(activity) === ACTIVITY_STATUSES.SCHEDULED;
}

// Minutes that should count toward "actual time spent" rollups
// (tally panel, analytics, etc.). Scheduled / skipped / cancelled
// contribute zero; partial uses actual_duration_minutes when the user
// supplied one, else the heuristic half-of-planned.
export function countableMinutes(activity) {
  const status = statusFor(activity);
  const planned = Number(activity?.duration_minutes) || 0;
  if (status === ACTIVITY_STATUSES.LOGGED || status === ACTIVITY_STATUSES.DONE) {
    return planned;
  }
  if (status === ACTIVITY_STATUSES.PARTIAL) {
    const actual = Number(activity?.actual_duration_minutes);
    if (Number.isFinite(actual) && actual > 0) return actual;
    return planned > 0 ? planned / 2 : 0;
  }
  // scheduled / skipped / cancelled
  return 0;
}

// Optional: minutes the user PLANNED to spend (regardless of outcome).
// Used by surfaces that want to surface "planned time" alongside actual.
export function plannedMinutes(activity) {
  return Number(activity?.duration_minutes) || 0;
}

// True if this is an unresolved past-time plan — i.e. still scheduled
// but the timestamp has slid into the past beyond the grace window.
// One-hour grace so a plan that JUST passed doesn't immediately nag.
export function isPastTimeScheduled(activity, graceMs = 60 * 60 * 1000) {
  if (statusFor(activity) !== ACTIVITY_STATUSES.SCHEDULED) return false;
  const ts = activity?.timestamp ? new Date(activity.timestamp).getTime() : 0;
  return ts > 0 && ts < Date.now() - graceMs;
}

// Status flag used to figure out which actions to expose in the
// lifecycle popover. Logged is terminal with no lifecycle actions —
// the standard Edit/Delete UI applies there.
export function nextValidStatuses(currentStatus) {
  if (currentStatus === ACTIVITY_STATUSES.SCHEDULED) {
    return [
      ACTIVITY_STATUSES.DONE,
      ACTIVITY_STATUSES.PARTIAL,
      ACTIVITY_STATUSES.SKIPPED,
      ACTIVITY_STATUSES.CANCELLED,
    ];
  }
  if (RESOLVED_STATUSES.has(currentStatus)) {
    return [ACTIVITY_STATUSES.SCHEDULED];
  }
  return [];
}

// Pretty labels for the popover and any tooltips. Kept in one place so
// future translation work has one stop. (User-terminology — system /
// alter / fronting — is unaffected by these strings.)
export const STATUS_LABELS = Object.freeze({
  logged: "Logged",
  scheduled: "Scheduled",
  done: "Done",
  partial: "Partial",
  skipped: "Skipped",
  cancelled: "Cancelled",
});

// Visual-treatment knobs consumed by the week grid and day/month views.
// The hue always comes from the user's category colour — these knobs
// only modulate opacity / dashed borders / decorations.
//
// `fillOpacity`  — applied to the block/pill fill.
// `dashed`       — render a 1px dashed outline instead of a solid fill.
// `strike`       — strike through the text label.
// `corner`       — short label drawn in the top-right corner (✓, ½, ×).
// `showXCenter`  — overlay a centred X icon (used for cancelled).
export function visualForStatus(status) {
  switch (status) {
    case ACTIVITY_STATUSES.SCHEDULED:
      return { fillOpacity: 0.5, dashed: true, strike: false, corner: null, showXCenter: false };
    case ACTIVITY_STATUSES.DONE:
      return { fillOpacity: 1, dashed: false, strike: false, corner: "✓", showXCenter: false };
    case ACTIVITY_STATUSES.PARTIAL:
      return { fillOpacity: 0.8, dashed: false, strike: false, corner: "½", showXCenter: false };
    case ACTIVITY_STATUSES.SKIPPED:
      return { fillOpacity: 0.3, dashed: false, strike: true, corner: "×", showXCenter: false };
    case ACTIVITY_STATUSES.CANCELLED:
      return { fillOpacity: 0.25, dashed: false, strike: false, corner: null, showXCenter: true };
    case ACTIVITY_STATUSES.LOGGED:
    default:
      return { fillOpacity: 1, dashed: false, strike: false, corner: null, showXCenter: false };
  }
}

// Append a reschedule-history entry. Pure — returns a new array.
export function appendRescheduleEntry(history, fromIso, toIso) {
  const safe = Array.isArray(history) ? history : [];
  return [
    ...safe,
    {
      from: fromIso,
      to: toIso,
      rescheduled_at: new Date().toISOString(),
    },
  ];
}

// One-time read-side backfill marker. Keyed in localStorage so we only
// run the pass once. Idempotent — re-running is safe because the inner
// loop never overwrites an existing `status` field.
const BACKFILL_KEY = "activity_status_backfill_v1";

export function hasRunBackfill() {
  try {
    return localStorage.getItem(BACKFILL_KEY) === "1";
  } catch {
    return false;
  }
}

export function markBackfillDone() {
  try { localStorage.setItem(BACKFILL_KEY, "1"); } catch { /* non-fatal */ }
}
