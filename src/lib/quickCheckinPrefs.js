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

// Guided (the feelings wheel) or Classic (one list) — one setting for every
// feelings picker, chosen in the check-in manager (UI critique H4, v0.364.7).
// Same key and JSON format EmotionWheelPicker has always read.
export const EMOTION_PICKER_MODE_KEY = "symphony_emotion_picker_mode";
export function readEmotionPickerMode() {
  try { const v = localStorage.getItem(EMOTION_PICKER_MODE_KEY); return v ? JSON.parse(v) : "wheel"; } catch { return "wheel"; }
}
export function writeEmotionPickerMode(mode) {
  try { localStorage.setItem(EMOTION_PICKER_MODE_KEY, JSON.stringify(mode === "classic" ? "classic" : "wheel")); } catch { /* storage blocked */ }
  try { window.dispatchEvent(new Event("symphony-emotion-picker-mode")); } catch { /* no window */ }
}
