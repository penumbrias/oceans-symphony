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
  alter_added: "New {{Alter}} added",
  note_added_to_alter: "Note added to an {{alter}}",
  bulletin_posted: "Bulletin posted",
  bulletin_comment_made: "Comment posted on a bulletin",
  poll_voted: "Voted on a poll",
  task_created: "To-do created",
  goal_created: "Activity goal created",
  group_created: "{{Alter}} group created",
  system_change_event_logged: "{{System}} change event logged (fusion/split/etc.)",
  mention_acknowledged: "@mention acknowledged",
  friend_added: "Friend added",
  quick_action_used: "Quick action used",
  theme_changed: "Theme color changed",
  terms_customized: "Custom terms edited",
  tour_completed: "Feature tour completed",
  reflection_saved: "Learn-module reflection saved",
  grounding_technique_used: "Grounding technique used",
  daily_task_completed: "Any daily task completed (meta)",
  streak_milestone_hit: "Streak milestone reached (every 7 days)",
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
    // Phase-2 expansion (v0.17.18)
    hasAlterAdded,
    hasNoteAddedToAlter,
    hasBulletinPosted,
    hasBulletinCommentMade,
    hasPollVoted,
    hasTaskCreated,
    hasGoalCreated,
    hasGroupCreated,
    hasSystemChangeEventLogged,
    hasMentionAcknowledged,
    hasFriendAdded,
    hasQuickActionUsed,
    hasThemeChanged,
    hasTermsCustomized,
    hasTourCompleted,
    hasReflectionSaved,
    hasGroundingTechniqueUsed,
    hasDailyTaskCompleted,
    hasStreakMilestoneHit,
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
  if (hasAlterAdded) s.add("alter_added");
  if (hasNoteAddedToAlter) s.add("note_added_to_alter");
  if (hasBulletinPosted) s.add("bulletin_posted");
  if (hasBulletinCommentMade) s.add("bulletin_comment_made");
  if (hasPollVoted) s.add("poll_voted");
  if (hasTaskCreated) s.add("task_created");
  if (hasGoalCreated) s.add("goal_created");
  if (hasGroupCreated) s.add("group_created");
  if (hasSystemChangeEventLogged) s.add("system_change_event_logged");
  if (hasMentionAcknowledged) s.add("mention_acknowledged");
  if (hasFriendAdded) s.add("friend_added");
  if (hasQuickActionUsed) s.add("quick_action_used");
  if (hasThemeChanged) s.add("theme_changed");
  if (hasTermsCustomized) s.add("terms_customized");
  if (hasTourCompleted) s.add("tour_completed");
  if (hasReflectionSaved) s.add("reflection_saved");
  if (hasGroundingTechniqueUsed) s.add("grounding_technique_used");
  if (hasDailyTaskCompleted) s.add("daily_task_completed");
  if (hasStreakMilestoneHit) s.add("streak_milestone_hit");
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

// Generic helpers for the rest of the marker-driven triggers (v0.17.18).
// Each follows the same daily-string-equality pattern: write today's date
// when the event fires, compare to today's date when deriving the trigger.
function makeTodayMarker(key) {
  return {
    mark() {
      try {
        if (typeof localStorage === "undefined") return;
        localStorage.setItem(key, getTodayString());
      } catch { /* best-effort */ }
    },
    has() {
      try {
        if (typeof localStorage === "undefined") return false;
        return localStorage.getItem(key) === getTodayString();
      } catch { return false; }
    },
  };
}

const POLL_VOTED_MARKER = makeTodayMarker("symphony_dailytask_poll_voted_v1");
export const markPollVotedToday = POLL_VOTED_MARKER.mark;
export const hasPollVotedToday = POLL_VOTED_MARKER.has;

const MENTION_ACK_MARKER = makeTodayMarker("symphony_dailytask_mention_acknowledged_v1");
export const markMentionAcknowledgedToday = MENTION_ACK_MARKER.mark;
export const hasMentionAcknowledgedToday = MENTION_ACK_MARKER.has;

const FRIEND_ADDED_MARKER = makeTodayMarker("symphony_dailytask_friend_added_v1");
export const markFriendAddedToday = FRIEND_ADDED_MARKER.mark;
export const hasFriendAddedToday = FRIEND_ADDED_MARKER.has;

const QUICK_ACTION_MARKER = makeTodayMarker("symphony_dailytask_quick_action_used_v1");
export const markQuickActionUsedToday = QUICK_ACTION_MARKER.mark;
export const hasQuickActionUsedToday = QUICK_ACTION_MARKER.has;

const THEME_CHANGED_MARKER = makeTodayMarker("symphony_dailytask_theme_changed_v1");
export const markThemeChangedToday = THEME_CHANGED_MARKER.mark;
export const hasThemeChangedToday = THEME_CHANGED_MARKER.has;

const TERMS_CUSTOMIZED_MARKER = makeTodayMarker("symphony_dailytask_terms_customized_v1");
export const markTermsCustomizedToday = TERMS_CUSTOMIZED_MARKER.mark;
export const hasTermsCustomizedToday = TERMS_CUSTOMIZED_MARKER.has;

const TOUR_COMPLETED_MARKER = makeTodayMarker("symphony_dailytask_tour_completed_v1");
export const markTourCompletedToday = TOUR_COMPLETED_MARKER.mark;
export const hasTourCompletedToday = TOUR_COMPLETED_MARKER.has;

const GROUNDING_USED_MARKER = makeTodayMarker("symphony_dailytask_grounding_used_v1");
export const markGroundingTechniqueUsedToday = GROUNDING_USED_MARKER.mark;
export const hasGroundingTechniqueUsedToday = GROUNDING_USED_MARKER.has;

const DAILY_TASK_COMPLETED_MARKER = makeTodayMarker("symphony_dailytask_daily_task_completed_v1");
export const markDailyTaskCompletedToday = DAILY_TASK_COMPLETED_MARKER.mark;
export const hasDailyTaskCompletedToday = DAILY_TASK_COMPLETED_MARKER.has;

// Streak milestone uses a richer marker — we store the milestone value
// the user has been credited with for today, so flipping back below the
// milestone (e.g. by editing an old DailyProgress row) and then re-hitting
// it the same day doesn't double-fire. The trigger is satisfied today iff
// the stored value matches the current milestone value.
const STREAK_MILESTONE_KEY = "symphony_dailytask_streak_milestone_v1";

export function markStreakMilestoneHitToday(milestone) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(
      STREAK_MILESTONE_KEY,
      JSON.stringify({ date: getTodayString(), milestone }),
    );
  } catch { /* best-effort */ }
}

export function hasStreakMilestoneHitToday() {
  try {
    if (typeof localStorage === "undefined") return false;
    const raw = localStorage.getItem(STREAK_MILESTONE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return parsed?.date === getTodayString();
  } catch { return false; }
}