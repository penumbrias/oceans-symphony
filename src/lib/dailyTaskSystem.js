/**
 * Daily Task System — central config for defaults, triggers, and XP logic.
 * Templates are stored in DailyTaskTemplate entity. This file provides
 * the seed defaults and the trigger→completion map.
 */

export const DEFAULT_TASK_TEMPLATES = [
  {
    title: "Check in",
    description: "Open the app and get logged in.",
    points: 3,
    mode: "AUTO",
    is_active: true,
    sort_order: 0,
    auto_trigger: "check_in",
    nav_path: null,
  },
  {
    title: "Journal entry",
    description: "Create a journal entry today.",
    points: 6,
    mode: "AUTO",
    is_active: true,
    sort_order: 1,
    auto_trigger: "journal_entry",
    nav_path: "/journals",
  },
{
  title: "{{system}} meeting",
  description: "Gently notice any parts that want attention and what your body is feeling. No fixing, just noticing.",
  points: 4,
  mode: "AUTO",
  is_active: true,
  sort_order: 2,
  auto_trigger: "parts_checkin",
  nav_path: "/system-checkin",
},
  {
    title: "Took meds",
    description: "Take your prescribed meds.",
    points: 3,
    mode: "MANUAL",
    is_active: true,
    sort_order: 3,
    auto_trigger: null,
    nav_path: null,
  },
  {
    title: "Ate a meal",
    description: "Eat at least one meal today.",
    points: 3,
    mode: "MANUAL",
    is_active: true,
    sort_order: 4,
    auto_trigger: null,
    nav_path: null,
  },
  {
    title: "Drank water",
    description: "Stay hydrated — drink at least a few glasses.",
    points: 2,
    mode: "MANUAL",
    is_active: true,
    sort_order: 5,
    auto_trigger: null,
    nav_path: null,
  },
  {
    title: "Movement",
    description: "Any kind of movement — a walk, stretch, or exercise.",
    points: 4,
    mode: "MANUAL",
    is_active: true,
    sort_order: 6,
    auto_trigger: null,
    nav_path: null,
  },
  {
    title: "Self-care",
    description: "Did something kind for yourself today.",
    points: 3,
    mode: "MANUAL",
    is_active: true,
    sort_order: 7,
    auto_trigger: null,
    nav_path: null,
  },
];

/**
 * AUTO_TRIGGER_LABELS — human-readable labels for each auto trigger key.
 * Used in the task manager UI. The picker passes these through `applyTerms`
 * so `{{System}}` / `{{Switch}}` / etc. resolve to user terminology.
 *
 * Legacy trigger ids (`check_in`, `journal_entry`, `parts_checkin`) are kept
 * as-is so already-seeded templates and existing user data keep working.
 * New trigger ids use kebab-case for clarity. The detection engine in
 * `buildAutoCompletedTriggers` checks for both.
 */
export const AUTO_TRIGGER_LABELS = {
  check_in: "App opened (daily check-in)",
  journal_entry: "Journal entry created",
  parts_checkin: "{{System}} meeting completed",
  todo_completed: "Complete a to-do item",
  activity_logged: "Activity logged (any)",
  plan_completed: "A planned activity is completed",
  emotion_checkin_saved: "Emotion check-in saved",
  quick_checkin_saved: "Quick Check-In saved",
  status_note_saved: "Status note saved",
  location_logged: "Location logged",
  sleep_logged: "Sleep logged",
  switch_logged: "{{Switch}} logged",
  symptom_checkin_saved: "Symptom check-in saved",
  reminder_acknowledged: "Reminder acknowledged",
  backup_exported: "Backup exported",
  goal_met: "Weekly goal met",
};

export const AUTO_TRIGGER_OPTIONS = Object.entries(AUTO_TRIGGER_LABELS).map(([value, label]) => ({
  value,
  label,
}));

/**
 * Build a set of completed AUTO trigger keys from today's app data.
 *
 * This is a pure derivation function — there's no separate "fire" pipeline.
 * Pass in today's relevant entity collections and we return the set of
 * trigger keys that have been satisfied. The DailyTasks page calls this on
 * every render with fresh query data, so triggers naturally re-evaluate as
 * the user does things during the day.
 *
 * Idempotency falls out for free: a trigger either matches today or it
 * doesn't — re-firing the same event later in the day doesn't change the
 * answer. The DailyProgress write path likewise merges, never overwrites,
 * so a template that's already been marked done stays done.
 */
export function buildAutoCompletedTriggers(input = {}) {
  const {
    // Legacy boolean flags (still supported for back-compat)
    hasJournal,
    hasPartsCheckIn,
    // New flags — pass anything truthy to mark the trigger as fired today
    hasTodoCompleted,
    hasActivityLogged,
    hasPlanCompleted,
    hasEmotionCheckIn,
    hasQuickCheckIn,
    hasStatusNote,
    hasLocation,
    hasSleep,
    hasSwitch,
    hasSymptomCheckIn,
    hasReminderAcknowledged,
    hasBackupExported,
    hasGoalMet,
  } = input;

  const s = new Set();
  s.add("check_in"); // always true when viewing the app
  if (hasJournal) s.add("journal_entry");
  if (hasPartsCheckIn) s.add("parts_checkin");
  if (hasTodoCompleted) s.add("todo_completed");
  if (hasActivityLogged) s.add("activity_logged");
  if (hasPlanCompleted) s.add("plan_completed");
  if (hasEmotionCheckIn) s.add("emotion_checkin_saved");
  if (hasQuickCheckIn) s.add("quick_checkin_saved");
  if (hasStatusNote) s.add("status_note_saved");
  if (hasLocation) s.add("location_logged");
  if (hasSleep) s.add("sleep_logged");
  if (hasSwitch) s.add("switch_logged");
  if (hasSymptomCheckIn) s.add("symptom_checkin_saved");
  if (hasReminderAcknowledged) s.add("reminder_acknowledged");
  if (hasBackupExported) s.add("backup_exported");
  if (hasGoalMet) s.add("goal_met");
  return s;
}

// One-shot removal of the legacy "Card entry" daily-task template that was
// seeded by older installs. The diary-card feature it referenced no longer
// exists; the template is no longer in DEFAULT_TASK_TEMPLATES, but already-
// seeded users would otherwise keep seeing it.
const CARD_ENTRY_CLEANUP_KEY = "symphony_dailytask_cardentry_cleanup_v1";

export async function cleanupLegacyCardEntryOnce(db) {
  try {
    if (typeof localStorage !== "undefined" && localStorage.getItem(CARD_ENTRY_CLEANUP_KEY)) return;
    const templates = (await db.DailyTaskTemplate.list?.()) || [];
    for (const t of templates) {
      if (t.title === "Card entry" || t.auto_trigger === "card_entry") {
        await db.DailyTaskTemplate.delete(t.id);
      }
    }
    if (typeof localStorage !== "undefined") localStorage.setItem(CARD_ENTRY_CLEANUP_KEY, "1");
  } catch {
    // best-effort
  }
}

/**
 * Determine if a template task is completed for today.
 */
export function isTaskCompleted(template, manualCompletedIds, autoTriggers) {
  if (template.mode === "AUTO") {
    return autoTriggers.has(template.auto_trigger);
  }
  return manualCompletedIds.has(template.id);
}

/**
 * Compute total possible points from active templates.
 */
export function totalPossiblePoints(templates) {
  return templates.filter((t) => t.is_active).reduce((sum, t) => sum + (t.points || 0), 0);
}

/**
 * XP thresholds per level (cumulative). Kept for backward compat.
 */
export function getLevelFromTotalXP(totalXP) {
  let level = 1;
  let xpForNext = 100;
  let accumulated = 0;
  while (totalXP >= accumulated + xpForNext) {
    accumulated += xpForNext;
    level++;
    xpForNext = Math.round(xpForNext * 1.3);
  }
  return { level, xpIntoLevel: totalXP - accumulated, xpForNextLevel: xpForNext, totalXP };
}

export function getTodayString() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** ISO week number (Mon-based) */
function getISOWeek(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const week1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

/** Period key for a given frequency, based on current local time */
export function getPeriodKey(frequency, date) {
  const d = date ? new Date(date) : new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  if (frequency === "daily") return `${yyyy}-${mm}-${dd}`;
  if (frequency === "weekly") return `${yyyy}-W${String(getISOWeek(d)).padStart(2, "0")}`;
  if (frequency === "monthly") return `${yyyy}-${mm}`;
  if (frequency === "yearly") return `${yyyy}`;
  return `${yyyy}-${mm}-${dd}`;
}

/** Human-readable label for a period key */
export function formatPeriodKey(key) {
  if (!key) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    const d = new Date(key + "T00:00:00");
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  }
  if (/^\d{4}-W\d{2}$/.test(key)) {
    const [year, week] = key.split("-W");
    return `Week ${week}, ${year}`;
  }
  if (/^\d{4}-\d{2}$/.test(key)) {
    const [year, month] = key.split("-");
    const d = new Date(Number(year), Number(month) - 1, 1);
    return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }
  if (/^\d{4}$/.test(key)) return `Year ${key}`;
  return key;
}

/** Generate the last N period keys for a given frequency (most recent first) */
export function getRecentPeriodKeys(frequency, count = 12) {
  const keys = [];
  const d = new Date();
  for (let i = 0; i < count; i++) {
    keys.push(getPeriodKey(frequency, d));
    if (frequency === "daily") d.setDate(d.getDate() - 1);
    else if (frequency === "weekly") d.setDate(d.getDate() - 7);
    else if (frequency === "monthly") d.setMonth(d.getMonth() - 1);
    else if (frequency === "yearly") d.setFullYear(d.getFullYear() - 1);
  }
  return keys;
}

export const FREQUENCY_LABELS = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

/**
 * Replace terminology tokens in task titles/descriptions.
 * Call this wherever task titles are rendered.
 */
export function applyTerms(text, terms) {
  if (!text || !terms) return text;
  return text
    .replace(/\{\{system\}\}/g, terms.system)
    .replace(/\{\{System\}\}/g, terms.System)
    .replace(/\{\{alter\}\}/g, terms.alter)
    .replace(/\{\{Alter\}\}/g, terms.Alter)
    .replace(/\{\{front\}\}/g, terms.front)
    .replace(/\{\{Front\}\}/g, terms.Front)
    .replace(/\{\{switch\}\}/g, terms.switch)
    .replace(/\{\{Switch\}\}/g, terms.Switch);
}

// localStorage marker keys for triggers that don't leave an entity behind.
// Setting these is best-effort — failure to write a marker just means the
// trigger won't auto-fire today, which is no worse than not having the
// trigger at all.
const BACKUP_EXPORTED_KEY = "symphony_dailytask_backup_exported_v1";

export function markBackupExportedToday() {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(BACKUP_EXPORTED_KEY, getTodayString());
  } catch {
    // best-effort
  }
}

export function hasBackupExportedToday() {
  try {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(BACKUP_EXPORTED_KEY) === getTodayString();
  } catch {
    return false;
  }
}