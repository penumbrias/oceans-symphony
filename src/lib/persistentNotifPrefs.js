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
