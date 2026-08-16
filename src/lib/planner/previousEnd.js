// "After the last one" — the end time of the most recent activity that
// finished before a reference moment. Logging a day is mostly back-to-back
// (woke, ate, worked, …), so the natural start time of the next entry is
// the end of the previous one. One helper so the planner sheet and the
// activity log modal agree on what "last" means.
//
// Rules: only entries with a real start AND a duration (no end = nothing to
// come after); plans that haven't happened (scheduled / cancelled / skipped)
// don't count; the entry currently being edited is skipped so it can't be
// its own predecessor.
export function previousActivityEnd(activities, { before = new Date(), excludeId = null } = {}) {
  const ref = before instanceof Date ? before : new Date(before);
  let best = null;
  for (const a of activities || []) {
    if (!a?.timestamp || a.id === excludeId) continue;
    if (a.status === "scheduled" || a.status === "cancelled" || a.status === "skipped") continue;
    const mins = Number(a.actual_duration_minutes) || Number(a.duration_minutes) || 0;
    if (!mins) continue;
    const start = new Date(a.timestamp);
    if (Number.isNaN(start.getTime())) continue;
    const end = new Date(start.getTime() + mins * 60000);
    if (end > ref) continue;
    if (!best || end > best.end) best = { end, name: a.activity_name || "", id: a.id };
  }
  return best; // { end: Date, name, id } | null
}
