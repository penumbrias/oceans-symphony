// Open to-dos with a scheduled time or due date, shaped like Activity
// records so the planner's calendars (week/day grid, month, year) can draw them (moved out of the old
// activity tracker page). Read-only stand-ins: they carry `_isTask` +
// `_task` so a tap routes to the to-do instead of the activity details, and
// nothing ever writes them back as activities.

export function tasksAsCalendarItems(tasks = []) {
  return (tasks || [])
    .filter((t) => t && !(t.completed || t.is_complete) && (t.scheduled_at || t.due_date))
    .map((t) => {
      // scheduled_at is always a full ISO; due_date can be a bare
      // YYYY-MM-DD (form) or a full ISO (imports) — string-concatenating
      // "T08:00:00" onto the full ISO once produced Invalid Date and a crash.
      let ts;
      if (t.scheduled_at) ts = new Date(t.scheduled_at);
      else if (typeof t.due_date === "string" && !t.due_date.includes("T")) ts = new Date(`${t.due_date}T08:00:00`);
      else ts = new Date(t.due_date);
      if (Number.isNaN(ts.getTime())) return null;
      return {
        id: `task-${t.id}`,
        _isTask: true,
        _task: t,
        // Only a due date, no time: the week grid shows it in the day's
        // untimed strip rather than as a block at a made-up 08:00.
        _dueOnly: !t.scheduled_at,
        timestamp: ts.toISOString(),
        activity_name: t.title,
        activity_category_ids: t.activity_category_ids || [],
        duration_minutes: t.scheduled_at ? 60 : null,
        is_planned: ts.getTime() > Date.now(),
        is_critical: !!t.is_urgent,
        color: t.is_urgent ? "#f59e0b" : "#6366f1",
        fronting_alter_ids: [],
      };
    })
    .filter(Boolean);
}
