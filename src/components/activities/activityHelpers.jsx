import { parseDate } from "@/lib/dateUtils";

export const EMOTION_COLORS = [
  "#f43f5e","#ec4899","#a855f7","#3b82f6","#14b8a6",
  "#22c55e","#f59e0b","#ef4444","#8b5cf6","#06b6d4",
  "#f97316","#84cc16","#e11d48","#7c3aed","#0891b2",
];

export function emotionColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return EMOTION_COLORS[h % EMOTION_COLORS.length];
}

export function getActivityColor(act, catById = {}) {
  for (const id of (act.activity_category_ids || [])) {
    const cat = catById[id];
    if (cat?.color) return cat.color;
  }
  // Concrete hex fallback — NOT "hsl(var(--primary))": --primary is empty in this
  // theme (the app uses --color-primary), so hsl() is invalid CSS and renders
  // transparent. An uncategorised activity (e.g. a completed plan with no
  // category) would otherwise show no fill/bar at all.
  return act.color || "#8b5cf6";
}

export function getActivitiesForSlot(date, hour, minute, intervalMinutes, activities) {
  const slotStart = new Date(date);
  slotStart.setHours(hour, minute, 0, 0);
  const slotEnd = new Date(slotStart.getTime() + intervalMinutes * 60 * 1000);
  const timed = [], logged = [];
  activities.forEach(a => {
    // Quick plans are date-only; they render as overlay pills via a
    // separate layer in the grid (not in time slots), so skip them
    // entirely here — without this, a quick plan's midnight
    // timestamp would surface in the 00:00 cell.
    if (a.is_quick_plan) return;
    const actStart = parseDate(a.timestamp);
    if (a.duration_minutes) {
      const actEnd = new Date(actStart.getTime() + a.duration_minutes * 60 * 1000);
      if (actStart < slotEnd && actEnd > slotStart) timed.push(a);
    } else {
      if (actStart >= slotStart && actStart < slotEnd) logged.push(a);
    }
  });
  return { timed, logged };
}

export function getAlterIdsForSlot(date, hour, minute, intervalMinutes, frontingHistory) {
  const slotStart = new Date(date);
  slotStart.setHours(hour, minute, 0, 0);
  const slotEnd = new Date(slotStart.getTime() + intervalMinutes * 60 * 1000);
  const ids = new Set();
  frontingHistory.forEach(s => {
    const start = parseDate(s.start_time);
    const end = s.end_time ? parseDate(s.end_time) : new Date();
    if (start < slotEnd && end > slotStart) {
      // Current per-alter session shape (one row per fronter) uses `alter_id`;
      // legacy rows use `primary_alter_id` + `co_fronter_ids`. Read all three
      // so the "show alters" toggle surfaces modern sessions too (it previously
      // only read the legacy fields, so nothing ever showed).
      if (s.alter_id) ids.add(s.alter_id);
      if (s.primary_alter_id) ids.add(s.primary_alter_id);
      (s.co_fronter_ids || []).forEach(id => ids.add(id));
    }
  });
  return [...ids];
}

export function getLocationsForSlot(date, hour, minute, intervalMinutes, locationRecords) {
  const slotStart = new Date(date);
  slotStart.setHours(hour, minute, 0, 0);
  const slotEnd = new Date(slotStart.getTime() + intervalMinutes * 60 * 1000);
  return locationRecords.filter(loc => {
    const t = parseDate(loc.timestamp);
    return t >= slotStart && t < slotEnd;
  });
}

export function getEmotionsForSlot(date, hour, minute, intervalMinutes, activities, emotionCheckIns) {
  const slotStart = new Date(date);
  slotStart.setHours(hour, minute, 0, 0);
  const slotEnd = new Date(slotStart.getTime() + intervalMinutes * 60 * 1000);
  const all = [];
  emotionCheckIns.forEach(e => {
    const t = parseDate(e.timestamp);
    if (t >= slotStart && t < slotEnd) all.push(...(e.emotions || []));
  });
  activities.forEach(a => {
    const t = parseDate(a.timestamp);
    if (t >= slotStart && t < slotEnd && (a.emotions || []).length > 0) {
      all.push(...(a.emotions || []));
    }
  });
  return [...new Set(all)];
}