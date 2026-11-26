// The reminder editor's form, in one place (pure: no React, no entities).
//
// Both houses edit a Reminder through this: the old editor
// (ReminderEditorModal + its pixel layout) and the new house's Reminders
// room (src/house/reminders/). The defaults a new reminder starts with, what
// each trigger kind starts as, the option lists, the data handed to
// saveReminder (src/lib/reminderEntry.js) and the words a reminder's "when"
// is summed up in all live here, so the two houses can never drift apart.
//
// scripts/test-house-reminders.mjs pins the behaviour.

export const CATEGORIES = ["check_in", "habit", "meds", "grounding", "appointment", "custom"];
export const CATEGORY_LABELS = {
  check_in: "Check in", habit: "Habit", meds: "Meds",
  grounding: "Grounding", appointment: "Appointment", custom: "Other",
};
export const TRIGGER_TYPES = ["scheduled", "interval", "contextual", "event"];
export const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

export const CONTEXTUAL_ON_BASE = [
  { value: "no_front_update", labelKey: "front" },
  { value: "emotion_logged", label: "Emotion logged" },
  { value: "alter_fronts", labelKey: "alter" },
  { value: "symptom_logged", label: "Symptom logged" },
  { value: "sleep_ended", label: "After sleep ends" },
];
export const AUTO_RESOLVE_ON_BASE = [
  { value: "check_in", label: "Check-in saved" },
  { value: "symptom_checkin", label: "Symptom logged" },
  { value: "activity", label: "Activity logged" },
  { value: "front_update", labelKey: "front" },
];
// How far back a "clears itself" rule looks, by default, for each kind.
export const DEFAULT_LOOKBACK = { check_in: 120, front_update: 240, symptom_checkin: 60, activity: 60 };

export const DISTRESS_EMOTIONS = ["anxious", "overwhelmed", "panic", "scared", "terrified", "crisis", "unsafe", "dissociated", "numb", "frozen"];
export const BASE_EMOTIONS = ["happy", "content", "calm", "grateful", "hopeful", "excited", "proud", "loved", "safe", "sad", "anxious", "overwhelmed", "angry", "scared", "frustrated", "ashamed", "guilty", "lonely", "confused", "dissociated", "numb", "depressed", "panic", "terrified", "crisis", "unsafe", "frozen", "tired", "bored", "curious"];

export const getActionTypeOptions = (terms) => [
  { value: "open_check_in",        label: "Check in" },
  { value: "open_grounding",       label: "Grounding exercise" },
  { value: "open_set_front",       label: `Set who's ${terms.fronting}` },
  { value: "open_journal",         label: "Open journal" },
  { value: "open_diary",           label: "Open Check-In Log" },
  { value: "open_symptom_check_in",label: "Log a symptom" },
  { value: "open_system_map",      label: `View ${terms.system} map` },
  { value: "open_timeline",        label: "View timeline" },
  { value: "open_todo",            label: "View to-do list" },
  { value: "log_symptom",          label: "Log a specific symptom" },
  { value: "dismiss",              label: "Dismiss" },
  { value: "open_route",           label: "Other page…" },
];
export const MAX_INLINE_ACTIONS = 3;
export const PRE_ALERT_OPTIONS = [15, 60, 1440];
export const preAlertLabel = (opt) => (opt === 15 ? "15 min" : opt === 60 ? "1 hour" : opt === 1440 ? "1 day" : `${opt} min`);

// ── Snooze ───────────────────────────────────────────────────────────
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

/** A snooze length typed as a number and a unit, in minutes (null if unreadable). */
export function snoozeMinutes(amount, unit = "minutes") {
  const n = parseInt(amount, 10);
  if (!n || n < 1) return null;
  return unit === "hours" ? n * 60 : n;
}

// What a reminder's schedule starts as when its trigger type is picked.
export const TRIGGER_DEFAULTS = {
  scheduled: { times: ["09:00"], days: [0, 1, 2, 3, 4, 5, 6] },
  interval: { every_minutes: 60, after_last: "fire" },
  contextual: { on: "no_front_update", threshold_minutes: 120 },
  event: { when: null, pre_alerts: [] },
};

export const DEFAULT_FORM = {
  title: "",
  body: "",
  category: "custom",
  trigger_type: "scheduled",
  trigger_config: { times: ["09:00"], days: [0, 1, 2, 3, 4, 5, 6] },
  // Push ON by default — closed-app OS notifications are the whole point of
  // a reminder. Both delivery paths (OS pre-schedule + FCM relay) skip any
  // reminder without "push", so an in-app-only default meant reminders never
  // reached the tray. Users can untick Push per-reminder to keep it quiet.
  delivery_channels: ["in_app", "push"],
  alter_id: null,
  alter_scope: null,
  alter_scope_catchup: false,
  inline_actions: [],
  auto_resolve_rule: null,
  quiet_hours_respect: true,
  snooze_options: DEFAULT_SNOOZE_OPTIONS,
  is_active: true,
};

/** The form an editor opens with: the reminder over the defaults, or the defaults. */
export function formFromReminder(existing) {
  return existing ? { ...DEFAULT_FORM, ...existing } : { ...DEFAULT_FORM };
}

// ── The "when should this fire?" kinds ────────────────────────────────
// Each kind is a trigger type, or the contextual trigger's "on".
export function reminderKindOf(form) {
  if (form?.trigger_type === "contextual") return `ctx:${form.trigger_config?.on || "no_front_update"}`;
  return form?.trigger_type || "scheduled";
}

/** The kinds, in the person's words, in the order the editors show them. */
export function reminderKinds(terms) {
  return [
    { id: "scheduled", label: "At set times" },
    { id: "interval", label: "Every so often" },
    { id: "ctx:emotion_logged", label: "Feeling logged" },
    { id: "ctx:symptom_logged", label: "Symptom logged" },
    { id: "ctx:alter_fronts", label: `${terms.Alter} ${terms.fronts}` },
    { id: "ctx:sleep_ended", label: "After sleep ends" },
    { id: "ctx:no_front_update", label: "No update for" },
    { id: "event", label: "On a date" },
  ];
}

/** Picking a kind: the trigger type and the schedule it starts as. */
export function kindPatch(id) {
  if (String(id).startsWith("ctx:")) {
    const on = id.slice(4);
    return { trigger_type: "contextual", trigger_config: on === "no_front_update" ? { ...TRIGGER_DEFAULTS.contextual } : { on } };
  }
  return { trigger_type: id, trigger_config: TRIGGER_DEFAULTS[id] };
}

// ── Saving ───────────────────────────────────────────────────────────
/** Why the form can't be saved yet, or null. */
export function reminderFormProblem(form) {
  if (!String(form?.title || "").trim()) return "Title is required";
  if (!(form?.delivery_channels || []).length) return "Choose at least one delivery channel";
  return null;
}

/**
 * What saveReminder is handed. `pushOn`: whether push is really on for this
 * device (isPushEnabled). A push-only reminder on a device with push off
 * also gets the in-app banner, so it still shows while the app is open.
 */
export function reminderSaveData(form, { hasAutoResolve, pushOn = true } = {}) {
  let channels = form.delivery_channels || [];
  if (channels.includes("push") && !channels.includes("in_app") && !pushOn) channels = [...channels, "in_app"];
  return {
    ...form,
    delivery_channels: channels,
    alter_id: form.alter_id || null,
    alter_scope: form.alter_id ? (form.alter_scope || "always") : null,
    alter_scope_catchup: form.alter_id && form.alter_scope === "when_fronting" ? (form.alter_scope_catchup || false) : false,
    auto_resolve_rule: hasAutoResolve ? form.auto_resolve_rule : null,
  };
}

// ── Who it's for: the heads-ups ──────────────────────────────────────
// `nameOf(alter)` names an alter (the old editor passes its raw name).
export function alterScopeWarnings(form, alters, terms, nameOf = (a) => a?.name) {
  const out = [];
  const selected = (alters || []).find((a) => a.id === form.alter_id);
  const triggerAlterId = form.trigger_config?.alter_id;
  const selName = selected ? nameOf(selected) : null;
  if (form.alter_id && form.alter_scope === "when_fronting" && form.trigger_type === "contextual"
    && form.trigger_config?.on === "alter_fronts" && triggerAlterId === form.alter_id) {
    out.push(`Heads-up: this reminder is already tied to ${selName || `this ${terms.alter}`}'s ${terms.fronting} via the trigger — the "when ${terms.fronting}" scope is redundant here. You can leave it or switch to "Always active".`);
  }
  if (form.alter_id && form.trigger_type === "contextual" && form.trigger_config?.on === "alter_fronts"
    && triggerAlterId && triggerAlterId !== form.alter_id) {
    const triggerAlter = (alters || []).find((a) => a.id === triggerAlterId);
    out.push(`This reminder is tied to ${selName || `one ${terms.alter}`} but triggers when ${(triggerAlter && nameOf(triggerAlter)) || `another ${terms.alter}`} ${terms.fronts} — is that intentional?`);
  }
  if (form.alter_id && form.alter_scope === "when_fronting" && form.trigger_type === "event") {
    out.push(`This event reminder will skip if ${selName || `this ${terms.alter}`} isn't ${terms.fronting} at the event time. Consider "Always active" instead if you don't want to miss it.`);
  }
  return out;
}

// ── Words ────────────────────────────────────────────────────────────
/** "22:00" on the person's clock, given a formatter of a Date. */
export function hhmmWords(hhmm, fmt) {
  const [h, m] = String(hhmm || "").split(":").map(Number);
  if (!Number.isFinite(h)) return hhmm || "";
  const d = new Date(2000, 0, 1, h, Number.isFinite(m) ? m : 0, 0, 0);
  return fmt ? fmt(d) : `${String(h).padStart(2, "0")}:${String(Number.isFinite(m) ? m : 0).padStart(2, "0")}`;
}

/** "Every day", "Weekdays", "Mon and Thu", "Mon, Wed and Fri". */
export function daysWords(days) {
  const set = [...new Set((days || ALL_DAYS).map(Number))].filter((d) => d >= 0 && d <= 6).sort();
  if (set.length === 7) return "Every day";
  if (set.length === 0) return "No days picked";
  if (set.join() === "1,2,3,4,5") return "Weekdays";
  if (set.join() === "0,6") return "Weekends";
  const names = set.map((d) => DAYS[d]);
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function minutesWords(mins) {
  const n = Number(mins) || 0;
  if (n < 60) return `${n} min`;
  if (n % 60 === 0) return `${n / 60} h`;
  return `${Math.floor(n / 60)} h ${n % 60} min`;
}

/**
 * A reminder's "when" in one line, in the person's words: "Every day at
 * 9:00 AM", "30 min after a feeling is logged", "No {front} update for 4 h".
 * `clock(hhmm)` writes a time on the person's clock; `dateWords(iso)` a date.
 */
export function reminderWhenWords(r, { terms, alterName, clock = (t) => hhmmWords(t), dateWords } = {}) {
  const cfg = r?.trigger_config || {};
  const after = (what) => (cfg.delay_minutes ? `${minutesWords(cfg.delay_minutes)} after ${what}` : `When ${what}`);
  switch (r?.trigger_type) {
    case "scheduled": {
      const times = (cfg.times || []).map(clock).join(", ") || "—";
      return `${daysWords(cfg.days)} at ${times}`;
    }
    case "interval": {
      const every = `Every ${minutesWords(cfg.every_minutes || 60)}`;
      const w = cfg.active_window;
      const win = w?.start && w?.end ? `, ${clock(w.start)} to ${clock(w.end)}` : "";
      return `${every}${cfg.after_last === "check_in" ? " after the last check-in" : ""}${win}`;
    }
    case "contextual":
      switch (cfg.on) {
        case "emotion_logged": return after(cfg.matches?.length ? "a matching feeling is logged" : "a feeling is logged");
        case "symptom_logged": return after("a symptom is logged");
        case "alter_fronts": return after(`${alterName || `any ${terms?.alter || "alter"}`} ${terms?.fronts || "fronts"}`);
        case "sleep_ended": return cfg.delay_minutes ? `${minutesWords(cfg.delay_minutes)} after sleep ends` : "When sleep ends";
        case "no_front_update":
        default: return `No ${terms?.front || "front"} update for ${minutesWords(cfg.threshold_minutes || 120)}`;
      }
    case "event": {
      if (!cfg.when) return "On a date (not set yet)";
      const pre = (cfg.pre_alerts || []).length ? `, heads-up ${cfg.pre_alerts.map(preAlertLabel).join(", ")} before` : "";
      return `On ${dateWords ? dateWords(cfg.when) : new Date(cfg.when).toLocaleString()}${pre}`;
    }
    default: return r?.trigger_type || "";
  }
}

/** "a check-in is saved" — what a "clears itself" rule waits for, or "off". */
export function resolveWords(rule, terms, on = true) {
  if (!on || !rule) return "off";
  if (rule.on === "check_in") return "a check-in is saved";
  if (rule.on === "front_update") return `the ${terms?.front || "front"} is updated`;
  if (rule.on === "symptom_checkin") return "a symptom is logged";
  if (rule.on === "activity") return "an activity is logged";
  return "on";
}

// ── The inbox ────────────────────────────────────────────────────────
/**
 * The inbox's two lists: `due` (fired, pending or snoozed, newest first)
 * and `handled` (acted, dismissed or cleared in the last 7 days, newest
 * first, at most 10).
 */
export function inboxBuckets(instances, now = Date.now()) {
  const list = instances || [];
  const due = list
    .filter((i) => i.status === "snoozed" || ["fired", "pending"].includes(i.status))
    .sort((a, b) => new Date(b.fired_at || b.scheduled_for) - new Date(a.fired_at || a.scheduled_for));
  const since = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const handled = list
    .filter((i) => ["acted", "dismissed", "auto_resolved"].includes(i.status) && (i.updated_date || i.created_date) >= since)
    .sort((a, b) => new Date(b.updated_date || b.created_date) - new Date(a.updated_date || a.created_date))
    .slice(0, 10);
  return { due, handled };
}

// The buttons a fired reminder offers: its own, or its category's one.
export const CATEGORY_DEFAULT_ACTIONS = {
  check_in: { label: "Check In", action_type: "open_check_in" },
  grounding: { label: "Open Grounding", action_type: "open_grounding" },
};
export function effectiveActionsFor(reminder) {
  if ((reminder?.inline_actions || []).length > 0) return reminder.inline_actions;
  const d = CATEGORY_DEFAULT_ACTIONS[reminder?.category];
  return d ? [d] : [];
}

/** The page a reminder button opens, or null (a sheet, or nothing). */
export function actionRoute(action) {
  switch (action?.action_type) {
    case "open_grounding": return "/grounding";
    case "open_journal": return "/journals";
    case "open_diary": return "/checkin-log";
    case "open_system_map": return "/system-map";
    case "open_timeline": return "/timeline";
    case "open_todo": return "/todo";
    case "open_route": {
      const p = action.payload?.path;
      return p && p !== "/" ? p : null;
    }
    default: return null;
  }
}

/** The notification deep link /reminders?act=<instance>&action=<type>, or null. */
export function reminderDeepLink(search) {
  const q = new URLSearchParams(search || "");
  const instanceId = q.get("act");
  const actionType = q.get("action");
  if (!instanceId || !actionType) return null;
  return { instanceId, actionType, status: actionType === "dismiss" ? "dismissed" : "acted" };
}
