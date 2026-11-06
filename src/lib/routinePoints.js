// Points and levels on Routines are the person's choice (UI critique H5,
// v0.364.9).
//
// Streaks punish gaps, and gaps are what amnesia, crises and dormancy
// make. So:
//  - Points, levels and XP show only when the person wants them
//    (`SystemSettings.points_and_levels`). Someone who already earned
//    points before this shipped keeps seeing them until they choose;
//    someone new is asked once, on the Routines page, and sees none until
//    they say yes.
//  - There is no streak and no "Best". What shows instead is gap-proof:
//    "N days you showed up this month", and nothing at all when N is 0.
// Points are still worked out and saved either way, so turning them on
// later shows everything earned so far.

import { format } from "date-fns";

export const POINTS_SETTING = "points_and_levels";
// When the choice shipped. Points earned before it mean an existing user.
export const POINTS_CHOICE_SHIPPED = Date.parse("2026-11-06T06:00:00Z");

const earned = (p) => (Number(p?.xp_earned) || 0) > 0
  || (Array.isArray(p?.completed_template_ids) && p.completed_template_ids.length > 0);

// true / false once the person chose, null before.
export function pointsChoice(settings) {
  const v = settings?.[POINTS_SETTING];
  return v === true || v === false ? v : null;
}

export function earnedPointsBefore(progress = [], cutoff = POINTS_CHOICE_SHIPPED) {
  return (progress || []).some((p) => {
    if (!((Number(p?.xp_earned) || 0) > 0)) return false;
    const t = Date.parse(p.created_date || (p.date ? `${p.date}T12:00:00` : ""));
    return Number.isFinite(t) && t < cutoff;
  });
}

export function pointsShown(settings, progress = []) {
  const c = pointsChoice(settings);
  return c === null ? earnedPointsBefore(progress) : c;
}

// Days this calendar month with at least one routine done. Never a chain:
// a missed day takes nothing away.
export function daysShownUpThisMonth(progress = [], now = new Date()) {
  const month = format(now, "yyyy-MM");
  const days = new Set();
  for (const p of progress || []) {
    if (p?.frequency && p.frequency !== "daily") continue;
    if (typeof p?.date === "string" && p.date.startsWith(month) && earned(p)) days.add(p.date);
  }
  return days.size;
}

export function shownUpText(n) {
  if (!(n > 0)) return null;
  return `${n} day${n === 1 ? "" : "s"} you showed up this month`;
}
