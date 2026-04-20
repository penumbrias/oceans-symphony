export const DEFAULT_SNOOZE_OPTIONS = [10, 60, 240, "tomorrow"];

export function formatSnoozeLabel(opt) {
  if (opt === "tomorrow") return "Tomorrow";
  if (opt === "next_week") return "Next week";
  if (typeof opt !== "number") return String(opt);
  if (opt < 60) return `${opt} min`;
  const h = Math.floor(opt / 60);
  const m = opt % 60;
  if (m === 0) return h === 1 ? "1 hour" : `${h} hours`;
  return `${h}h ${m}m`;
}

export function snoozeUntilDate(opt) {
  if (opt === "tomorrow") {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d.toISOString();
  }
  if (opt === "next_week") {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString();
  }
  return new Date(Date.now() + opt * 60 * 1000).toISOString();
}