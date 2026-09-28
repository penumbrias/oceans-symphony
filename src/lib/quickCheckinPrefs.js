// Per-device Quick Check-In preferences kept in localStorage (both keys are
// in BACKUP_LS_KEYS, so they survive a cache clear and ride backups).

export const QCI_SLIDER_ENABLED_KEY = "symphony_quickcheckin_slider_enabled_v1";
export const QCI_SLIDER_SYMPTOM_KEY = "symphony_quickcheckin_slider_symptom_v1";

export function readQuickCheckinSliderEnabled() {
  try { return localStorage.getItem(QCI_SLIDER_ENABLED_KEY) !== "0"; } catch { return true; }
}

export function writeQuickCheckinSliderEnabled(on) {
  try { localStorage.setItem(QCI_SLIDER_ENABLED_KEY, on ? "1" : "0"); } catch { /* storage blocked */ }
}
