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
    title: "Card entry",
    description: "Save a daily or weekly card entry.",
    points: 5,
    mode: "AUTO",
    is_active: true,
    sort_order: 2,
    auto_trigger: "card_entry",
    nav_path: "/diary",
  },
  {
    title: "Parts check-in",
    description: "Gently notice any parts that want attention and what your body is feeling. No fixing, just noticing.",
    points: 4,
    mode: "AUTO",
    is_active: true,
    sort_order: 3,
    auto_trigger: "parts_checkin",
    nav_path: "/system-checkin",
  },
  {
    title: "Took meds",
    description: "Take your prescribed meds.",
    points: 3,
    mode: "MANUAL",
    is_active: true,
    sort_order: 4,
    auto_trigger: null,
    nav_path: null,
  },
  {
    title: "Ate a meal",
    description: "Eat at least one meal today.",
    points: 3,
    mode: "MANUAL",
    is_active: true,
    sort_order: 5,
    auto_trigger: null,
    nav_path: null,
  },
  {
    title: "Drank water",
    description: "Stay hydrated — drink at least a few glasses.",
    points: 2,
    mode: "MANUAL",
    is_active: true,
    sort_order: 6,
    auto_trigger: null,
    nav_path: null,
  },
  {
    title: "Movement",
    description: "Any kind of movement — a walk, stretch, or exercise.",
    points: 4,
    mode: "MANUAL",
    is_active: true,
    sort_order: 7,
    auto_trigger: null,
    nav_path: null,
  },
  {
    title: "Self-care",
    description: "Did something kind for yourself today.",
    points: 3,
    mode: "MANUAL",
    is_active: true,
    sort_order: 8,
    auto_trigger: null,
    nav_path: null,
  },
];

/**
 * AUTO_TRIGGER_LABELS — human-readable labels for each auto trigger key.
 * Used in the task manager UI.
 */
export const AUTO_TRIGGER_LABELS = {
  check_in: "App opened (daily check-in)",
  journal_entry: "Journal entry created",
  card_entry: "Diary card created",
  parts_checkin: "Parts check-in completed",
};

export const AUTO_TRIGGER_OPTIONS = Object.entries(AUTO_TRIGGER_LABELS).map(([value, label]) => ({
  value,
  label,
}));

/**
 * Build a set of completed AUTO trigger keys from today's app data.
 */
export function buildAutoCompletedTriggers({ hasJournal, hasDiaryCard, hasPartsCheckIn }) {
  const s = new Set();
  s.add("check_in"); // always true when viewing the app
  if (hasJournal) s.add("journal_entry");
  if (hasDiaryCard) s.add("card_entry");
  if (hasPartsCheckIn) s.add("parts_checkin");
  return s;
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