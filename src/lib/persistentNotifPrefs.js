// Per-device on/off toggles for the persistent (ongoing) status
// notifications — current fronters, symptoms logged today, and the
// running-activity logger. These are Android-only ongoing notifications
// that live in the tray and update while the app is running; the toggles
// are intentionally device-local (not synced / not backed up), like the
// native reminder logs, because they map to OS notification slots that
// only mean anything on the installing device.

const KEYS = {
  fronters: "symphony_persist_notif_fronters_v1",
  symptoms: "symphony_persist_notif_symptoms_v1",
  activity: "symphony_persist_notif_activity_v1",
};

// Fired whenever a toggle changes so the watcher hook re-syncs immediately.
export const PERSIST_NOTIF_EVENT = "symphony-persist-notif-prefs-changed";

export const PERSIST_NOTIF_TYPES = ["fronters", "symptoms", "activity"];

export function getPersistNotifPref(type) {
  try {
    return localStorage.getItem(KEYS[type]) === "1";
  } catch {
    return false;
  }
}

export function getAllPersistNotifPrefs() {
  return {
    fronters: getPersistNotifPref("fronters"),
    symptoms: getPersistNotifPref("symptoms"),
    activity: getPersistNotifPref("activity"),
    frontOpts: getFrontNotifOptions(),
  };
}

export function setPersistNotifPref(type, val) {
  try {
    localStorage.setItem(KEYS[type], val ? "1" : "0");
    window.dispatchEvent(new Event(PERSIST_NOTIF_EVENT));
  } catch {
    /* storage unavailable — toggle just won't persist */
  }
}

// ── "Who's fronting" notification options (owner, 2026-10-01) ─────────
// How each alter is written in it, and which front levels stay out of it.
//   label        "name" | "alias" | "emoji" — the default for everyone
//   perAlter     { [alterId]: "name" | "alias" | "emoji" } — overrides
//   hiddenLevels [levelId] — sessions at these levels aren't listed
// A user preference (unlike the on/off switches above, which map to this
// device's OS notification slots), so it's in BACKUP_LS_KEYS.
export const FRONT_NOTIF_OPTS_KEY = "symphony_persist_notif_fronters_opts_v1";
export const FRONT_NOTIF_LABELS = ["name", "alias", "emoji"];

export function getFrontNotifOptions() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(FRONT_NOTIF_OPTS_KEY) || "null"); } catch { raw = null; }
  const o = raw && typeof raw === "object" ? raw : {};
  return {
    label: FRONT_NOTIF_LABELS.includes(o.label) ? o.label : "name",
    perAlter: o.perAlter && typeof o.perAlter === "object" ? o.perAlter : {},
    hiddenLevels: Array.isArray(o.hiddenLevels) ? o.hiddenLevels.filter((x) => typeof x === "string") : [],
  };
}

export function setFrontNotifOptions(patch) {
  const next = { ...getFrontNotifOptions(), ...patch };
  try {
    localStorage.setItem(FRONT_NOTIF_OPTS_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(PERSIST_NOTIF_EVENT));
  } catch { /* storage unavailable */ }
  return next;
}

// The text for one alter. Alias or emoji fall back to the name when the
// alter doesn't have one.
export function frontNotifLabel(alter, opts) {
  if (!alter) return "";
  const name = (alter.name || "").trim() || "?";
  const mode = (opts?.perAlter && FRONT_NOTIF_LABELS.includes(opts.perAlter[alter.id])) ? opts.perAlter[alter.id] : opts?.label;
  if (mode === "emoji") return (alter.emoji || "").trim() || name;
  if (mode === "alias") {
    const alias = alter.use_emoji_as_alias && alter.emoji ? String(alter.emoji).trim() : (alter.alias || "").trim();
    return alias || name;
  }
  return name;
}
