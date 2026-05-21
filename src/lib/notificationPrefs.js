import { toast } from "sonner";

// Persisted preferences for the in-app toast / notification surface.
// Stored on SystemSettings.notification_prefs to keep the schema simple.
//
// Why monkey-patch instead of wrapping every call site:
// ~50 components already import { toast } from "sonner" directly.
// Wrapping would mean updating every one (and missing a few). Sonner's
// `toast` is a singleton object with methods on it — overriding the
// methods is stable: any future caller, regardless of when they
// imported the module, sees the patched method.
//
// Errors are intentionally non-disable-able. If something fails, the
// user needs to know.

const DEFAULTS = Object.freeze({
  showSuccess: true,
  showInfo: true,
  showWarning: true,
  durationMs: 4000,
  position: "top-center",
});

const ALLOWED_POSITIONS = ["top-left", "top-center", "top-right", "bottom-left", "bottom-center", "bottom-right"];

export function readNotificationPrefs(systemSettings) {
  const raw = systemSettings?.notification_prefs;
  if (!raw || typeof raw !== "object") return { ...DEFAULTS };
  return {
    showSuccess: raw.showSuccess !== false,
    showInfo: raw.showInfo !== false,
    showWarning: raw.showWarning !== false,
    durationMs: typeof raw.durationMs === "number" && raw.durationMs >= 500 && raw.durationMs <= 20000
      ? raw.durationMs
      : DEFAULTS.durationMs,
    position: ALLOWED_POSITIONS.includes(raw.position) ? raw.position : DEFAULTS.position,
  };
}

export { DEFAULTS as NOTIFICATION_DEFAULTS };

// Mutable cache the patched toast methods read on every call.
// Updated by NotificationConfigurator below whenever prefs change.
const activePrefs = { ...DEFAULTS };

export function setActivePrefs(prefs) {
  Object.assign(activePrefs, prefs);
}

// Patch toast.success/info/warning once. Calls to a disabled type
// become silent no-ops. toast.error is left untouched — the user can't
// turn errors off.
let patched = false;
export function installNotificationFilter() {
  if (patched) return;
  patched = true;
  const realSuccess = toast.success.bind(toast);
  const realInfo = toast.info ? toast.info.bind(toast) : null;
  const realWarning = toast.warning ? toast.warning.bind(toast) : null;
  toast.success = (...args) => {
    if (!activePrefs.showSuccess) return null;
    return realSuccess(...args);
  };
  if (realInfo) {
    toast.info = (...args) => {
      if (!activePrefs.showInfo) return null;
      return realInfo(...args);
    };
  }
  if (realWarning) {
    toast.warning = (...args) => {
      if (!activePrefs.showWarning) return null;
      return realWarning(...args);
    };
  }
}
