// The house's Reminders room, the pure parts (scripts/test-house-reminders.mjs
// runs them): the editor's address, the list filter, the room's words. The
// form itself (defaults, kinds, the save data, the "when" words) is shared
// with the old editor in src/lib/reminderForm.js.

// ── The editor's address ─────────────────────────────────────────────
// /reminders?edit=<id> opens that reminder, /reminders?new=1 a new one, so
// the phone's Back closes the editor and a link can open one.
export function editorOf(search) {
  const q = new URLSearchParams(search || "");
  const id = q.get("edit");
  if (id) return { mode: "edit", id };
  if (q.get("new") === "1") return { mode: "new", id: null };
  return null;
}
export function editorHref(r) {
  return r?.id ? `/reminders?edit=${encodeURIComponent(r.id)}` : "/reminders?new=1";
}

// ── The list filter ─────────────────────────────────────────────────
// "all" | "system" | "per_alter" | an alter's id (the old Manage filter).
export function filterReminders(reminders, value) {
  const list = reminders || [];
  if (!value || value === "all") return list;
  if (value === "system") return list.filter((r) => !r.alter_id);
  if (value === "per_alter") return list.filter((r) => !!r.alter_id);
  return list.filter((r) => r.alter_id === value);
}
export function filterOptions(terms) {
  return [
    { value: "all", label: "All" },
    { value: "system", label: `${terms.System}-wide` },
    { value: "per_alter", label: `Per ${terms.alter}` },
  ];
}
/** The alters that have reminders tied to them (for "For …"). */
export function scopedAlterIds(reminders) {
  return [...new Set((reminders || []).filter((r) => r.alter_id).map((r) => r.alter_id))];
}

// ── Words ────────────────────────────────────────────────────────────
/** The quiet-hours words in the list's title bar: "quiet 10 PM to 8 AM", or "". */
export function quietWords(quiet, clock) {
  if (!quiet?.enabled) return "";
  return `quiet ${clock(quiet.start || "22:00")} to ${clock(quiet.end || "08:00")}`;
}

/** Who a reminder is for, as the list shows it. */
export function whoWords(r, alter, { terms, formatAlter }) {
  if (!r?.alter_id) return "everyone";
  if (!alter) return `one ${terms.alter}`;
  if (alter.is_archived) return `archived ${terms.alter}`;
  return `${formatAlter(alter)}${r.alter_scope === "when_fronting" ? ` · when ${terms.fronting}` : ""}`;
}

/** Is the reminder on (paused ones and those tied to an archived one are off)? */
export function reminderOn(r, alter) {
  return !!r?.is_active && !alter?.is_archived;
}

/** The status line: "5 reminders · 4 on · 2 due". */
export function statusWords({ reminders = [], onCount = 0, dueCount = 0 }) {
  const n = reminders.length;
  const parts = [`${n} ${n === 1 ? "reminder" : "reminders"}`, `${onCount} on`];
  if (dueCount) parts.push(`${dueCount} due`);
  return parts.join(" · ");
}

/** "now", "8:00 AM, 1 h ago", or "until 9:30 AM" for a snoozed one. */
export function dueWhenWords(instance, { now = Date.now(), clockOf }) {
  if (instance?.status === "snoozed" && instance.snoozed_until) return `snoozed until ${clockOf(new Date(instance.snoozed_until))}`;
  const t = instance?.fired_at || instance?.scheduled_for;
  if (!t) return "";
  const ms = now - new Date(t).getTime();
  if (ms < 60000) return "now";
  const mins = Math.round(ms / 60000);
  const ago = mins < 60 ? `${mins} min ago` : mins < 1440 ? `${Math.round(mins / 60)} h ago` : `${Math.round(mins / 1440)} d ago`;
  return `${clockOf(new Date(t))}, ${ago}`;
}

export const HANDLED_WORDS = { acted: "Done", dismissed: "Dismissed", auto_resolved: "Cleared itself", snoozed: "Snoozed" };

/** An event's "when" split for the date and time fields, and joined back. */
export function eventParts(iso) {
  if (!iso) return { day: null, time: null };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { day: null, time: null };
  const p = (n) => String(n).padStart(2, "0");
  return { day: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, time: `${p(d.getHours())}:${p(d.getMinutes())}` };
}
export function eventIso(day, time) {
  if (!day) return null;
  const [y, m, dd] = day.split("-").map(Number);
  const [h, mi] = String(time || "09:00").split(":").map(Number);
  return new Date(y, m - 1, dd, h || 0, mi || 0, 0, 0).toISOString();
}
