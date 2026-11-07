// Medications — the pure maths (no storage), shared by the write path
// (medications.js), the widgets, the refill reminders and the tests
// (scripts/test-medications.mjs). See medications.js for the record shapes.

export const DEFAULT_REMIND_DAYS = 7;
const DAY_MS = 86_400_000;

// ── Days and times ───────────────────────────────────────────────────

const pad = (n) => String(n).padStart(2, "0");
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const isDayKey = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
export const isTime = (s) => typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
// A day key read as local midnight (never `new Date("YYYY-MM-DD")`, which is UTC).
export const dayStart = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (date, n) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
export const slotKey = (day, time) => `${day}T${time}`;
export const slotDate = (slot) => {
  const [day, time] = String(slot).split("T");
  const d = dayStart(day);
  const [h, m] = time.split(":").map(Number);
  d.setHours(h, m, 0, 0);
  return d;
};

export const medTimes = (med) => (Array.isArray(med?.times) ? med.times.filter(isTime) : []).sort();
export const isScheduled = (med) => !!med && !med.as_needed && medTimes(med).length > 0;
export const isActiveMed = (med) => !!med && !med.is_archived && !med.trashed_at;
export const unitsPerDose = (med) => {
  const n = Number(med?.units_per_dose);
  return Number.isFinite(n) && n > 0 ? n : 1;
};

// Is the course running on this day? (No start = always started; no end =
// ongoing.)
export function onCourse(med, key) {
  if (isDayKey(med?.start_date) && key < med.start_date) return false;
  if (isDayKey(med?.end_date) && key > med.end_date) return false;
  return true;
}

// "Ends in 4 days" / "Ended 2 days ago" / "Ends today" for a time-limited
// course; null when it has no end.
export function courseLabel(med, now = new Date()) {
  if (!isDayKey(med?.end_date)) return null;
  const days = Math.round((dayStart(med.end_date) - dayStart(dayKey(now))) / DAY_MS);
  if (days > 1) return `Course ends in ${days} days`;
  if (days === 1) return "Course ends tomorrow";
  if (days === 0) return "Course ends today";
  return days === -1 ? "Course ended yesterday" : `Course ended ${-days} days ago`;
}

// ── Today's doses ────────────────────────────────────────────────────

const doseFor = (doses, medId, slot) => (doses || []).find((d) => d && d.medication_id === medId && d.slot === slot && !d.trashed_at);

// Every scheduled dose on a day, with what happened to it:
// [{ med, time, slot, at: Date, dose|null, state: "taken"|"skipped"|"due"|"later" }]
export function dosesOnDay(meds = [], doses = [], { now = new Date(), day = dayKey(now) } = {}) {
  const out = [];
  for (const med of meds) {
    if (!isActiveMed(med) || !isScheduled(med) || !onCourse(med, day)) continue;
    for (const time of medTimes(med)) {
      const slot = slotKey(day, time);
      const at = slotDate(slot);
      const dose = doseFor(doses, med.id, slot);
      const state = dose ? dose.status : (at <= now ? "due" : "later");
      out.push({ med, time, slot, at, dose: dose || null, state });
    }
  }
  return out.sort((a, b) => a.at - b.at || String(a.med.name).localeCompare(String(b.med.name)));
}

// As-needed doses taken on a day, per medication id.
export function asNeededTakenOn(doses = [], day = dayKey()) {
  const out = new Map();
  for (const d of doses || []) {
    if (!d || d.trashed_at || d.slot || d.status !== "taken") continue;
    if (dayKey(new Date(d.timestamp)) !== day) continue;
    out.set(d.medication_id, [...(out.get(d.medication_id) || []), d]);
  }
  return out;
}

// For the "Took meds" routine: every scheduled dose today is marked taken
// (and there was at least one).
export function allScheduledTakenToday(meds = [], doses = [], now = new Date()) {
  const today = dosesOnDay(meds, doses, { now });
  return today.length > 0 && today.every((x) => x.state === "taken");
}

// ── Supply ───────────────────────────────────────────────────────────

// How many scheduled doses fell between the refill and now (inclusive of
// the refill day, only the times already passed today).
function scheduledSince(med, fromKey, now) {
  const times = medTimes(med);
  if (!times.length) return 0;
  let count = 0;
  const today = dayKey(now);
  for (let d = dayStart(fromKey); dayKey(d) <= today; d = addDays(d, 1)) {
    const key = dayKey(d);
    if (!onCourse(med, key)) continue;
    for (const t of times) if (slotDate(slotKey(key, t)) <= now) count++;
    if (count > 100_000) break;
  }
  return count;
}

function unitsTakenSince(med, doses, sinceMs) {
  return (doses || [])
    .filter((d) => d && !d.trashed_at && d.medication_id === med.id && d.status === "taken" && new Date(d.timestamp).getTime() >= sinceMs)
    .reduce((sum, d) => sum + (Number(d.amount) > 0 ? Number(d.amount) : unitsPerDose(med)), 0);
}

export const countBy = (med) => (med?.count_by === "doses" || med?.count_by === "schedule"
  ? med.count_by
  : (isScheduled(med) ? "schedule" : "doses"));

// What's left and when it runs out. null when the refill details aren't
// filled in. { remaining, perDay|null, daysLeft|null, runOut: Date|null,
//   low: bool, remindAt: Date|null }
export function supplyOf(med, doses = [], now = new Date()) {
  const qty = Number(med?.refill_quantity);
  if (!isDayKey(med?.last_refill_date) || !Number.isFinite(qty) || qty <= 0) return null;
  const per = unitsPerDose(med);
  const since = dayStart(med.last_refill_date).getTime();
  const used = countBy(med) === "schedule"
    ? scheduledSince(med, med.last_refill_date, now) * per
    : unitsTakenSince(med, doses, since);
  const remaining = Math.max(0, Math.round((qty - used) * 100) / 100);

  let perDay = null;
  if (isScheduled(med)) perDay = medTimes(med).length * per;
  else {
    // As needed: the average over the last 14 days (or since the refill).
    const from = Math.max(since, now.getTime() - 14 * DAY_MS);
    const days = Math.max(1, (now.getTime() - from) / DAY_MS);
    const units = unitsTakenSince(med, doses, from);
    perDay = units > 0 ? units / days : null;
  }
  const daysLeft = perDay ? Math.floor(remaining / perDay) : null;
  const runOut = daysLeft != null ? addDays(now, daysLeft) : null;
  const remindDays = remindDaysOf(med);
  const low = remaining <= 0 || (daysLeft != null && daysLeft <= remindDays);
  // Course ending before the supply does → no refill needed.
  const courseEndsFirst = runOut && isDayKey(med.end_date) && dayStart(med.end_date) < runOut;
  let remindAt = null;
  if (med.refill_reminder && runOut && !courseEndsFirst) {
    remindAt = addDays(runOut, -remindDays);
    remindAt.setHours(10, 0, 0, 0);
  }
  return { remaining, perDay, daysLeft, runOut, low: low && !courseEndsFirst, remindAt, courseEndsFirst: !!courseEndsFirst };
}

export function remindDaysOf(med) {
  const n = parseInt(med?.refill_remind_days, 10);
  return Number.isFinite(n) && n >= 0 && n <= 60 ? n : DEFAULT_REMIND_DAYS;
}

const fmtNum = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10));
export function supplyLabel(supply) {
  if (!supply) return null;
  if (supply.remaining <= 0) return "Run out";
  if (supply.daysLeft == null) return `${fmtNum(supply.remaining)} left`;
  const days = supply.daysLeft === 1 ? "1 day" : `${supply.daysLeft} days`;
  return `${fmtNum(supply.remaining)} left · about ${days}`;
}

