// Pure recurrence cadence helpers (no entity access, so node scripts can
// import them). planCreate expands a series with these; the Repeat UIs
// read the interval list and per-interval caps from here so every editor
// offers the same options.
//
// Occurrences are always computed from the FIRST occurrence (offset n),
// never by stepping from the previous one — so a Feb 29 yearly plan lands
// on Feb 28 in non-leap years and back on Feb 29 in the next leap year
// (date-fns addYears clamps to the month's last day). Same for monthly
// plans on the 31st.

import { addDays, addWeeks, addMonths, addYears } from "date-fns";

export const RECURRENCE_INTERVALS = Object.freeze(["none", "daily", "weekly", "biweekly", "monthly", "yearly"]);

// Yearly plans (birthdays, anniversaries) can run for up to 100 years;
// every other cadence keeps its long-standing 52-occurrence cap.
export function maxOccurrences(interval) {
  return interval === "yearly" ? 100 : 52;
}

export function clampOccurrenceCount(interval, n) {
  const v = Number.isFinite(n) ? Math.floor(n) : 1;
  return Math.max(1, Math.min(maxOccurrences(interval), v));
}

// The nth occurrence (0 = the first) of a series starting at `dt`.
export function advanceOccurrence(dt, n, interval) {
  if (interval === "daily") return addDays(dt, n);
  if (interval === "weekly") return addWeeks(dt, n);
  if (interval === "biweekly") return addWeeks(dt, n * 2);
  if (interval === "monthly") return addMonths(dt, n);
  if (interval === "yearly") return addYears(dt, n);
  return dt;
}

export function expandOccurrences(start, interval, count) {
  if (!interval || interval === "none") return [start];
  return Array.from(
    { length: clampOccurrenceCount(interval, count || 1) },
    (_, i) => advanceOccurrence(start, i, interval),
  );
}
