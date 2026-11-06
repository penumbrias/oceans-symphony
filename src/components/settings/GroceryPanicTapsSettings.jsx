import { base44 } from "@/api/base44Client";

// The quick-taps setting behind Quick jump (Settings → Data & privacy →
// Quick jump, QuickJumpSettings.jsx, is its only control).
//
// User-configurable tap count for the grocery-list panic cover. The
// gesture lives in `useTripleTapPanic` — three quick pointerdowns on
// any non-input element open the grocery list as a privacy overlay.
// On phones with rapid double-tap-to-zoom or accessibility settings,
// the default of 3 sometimes fires accidentally, so we let users set
// it higher or turn the gesture off entirely.
//
// Persisted on SystemSettings.panic_taps_required:
//   0 (or null/undefined) = default of 3 taps
//   2..6  = explicit tap count
//   "off" = gesture disabled

export const DEFAULT_PANIC_TAPS = 3;
export function readPanicTapsSetting(systemSettings) {
  const raw = systemSettings?.panic_taps_required;
  if (raw === "off") return "off";
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 2 && n <= 6) return n;
  return DEFAULT_PANIC_TAPS;
}

// One writer for the setting.
export async function writePanicTapsSetting(value, { settings, qc }) {
  if (settings?.id) await base44.entities.SystemSettings.update(settings.id, { panic_taps_required: value });
  else await base44.entities.SystemSettings.create({ panic_taps_required: value });
  qc?.invalidateQueries({ queryKey: ["systemSettings"] });
}
