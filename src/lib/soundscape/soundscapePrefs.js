// Soundscape settings for this device: the last sound, timer, focus
// options and the person's own saved sounds. Durable through
// BACKUP_LS_KEYS (backups + the in-database settings mirror). Everything
// read back is re-clamped, so an edited or old value can't get past the
// safety limits.

import { BREATHING_PATTERNS, BREATHING_PACE_OPTIONS } from "@/utils/groundingDefaults";
import { clampParams, presetById, DEFAULT_PRESET_ID } from "./soundMath";
import { clampFractal, DEFAULT_FRACTAL } from "./fractals";

export const SOUNDSCAPE_PREFS_KEY = "symphony_soundscape_v1";
export const VISUALS = ["calm", "layers", "stars", "fractal", "detailed"];
export const FOCUS_MODES = ["visuals", "both", "breathing"];
export const TIMER_OPTIONS = [null, 5, 10, 15, 20, 30, 45, 60, 90];
// The visual's preview window height on the Soundscape screen (px).
export const PREVIEW_HEIGHT = { min: 96, max: 560, initial: 144 };
const clampHeight = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(Math.min(PREVIEW_HEIGHT.max, Math.max(PREVIEW_HEIGHT.min, n))) : PREVIEW_HEIGHT.initial;
};

const DEFAULTS = {
  presetId: DEFAULT_PRESET_ID,
  params: presetById(DEFAULT_PRESET_ID).params,
  timer: null,
  keepPlaying: true,
  visual: "calm",
  starSpeed: "cruise",
  previewHeight: PREVIEW_HEIGHT.initial,
  fractal: DEFAULT_FRACTAL,
  fractalPresetId: "drifting_julia",
  focus: { mode: "visuals", pattern: "Resonant breathing", pace: "1.25", distractionFree: false },
  saved: [],
};

export function readSoundscapePrefs() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(SOUNDSCAPE_PREFS_KEY) || "null"); } catch { raw = null; }
  if (!raw || typeof raw !== "object") return structuredClone(DEFAULTS);
  const f = raw.focus && typeof raw.focus === "object" ? raw.focus : {};
  return {
    presetId: typeof raw.presetId === "string" ? raw.presetId : DEFAULTS.presetId,
    params: clampParams(raw.params),
    timer: TIMER_OPTIONS.includes(raw.timer) ? raw.timer : null,
    keepPlaying: raw.keepPlaying !== false,
    visual: VISUALS.includes(raw.visual) ? raw.visual : "calm",
    starSpeed: ["drift", "cruise", "warp"].includes(raw.starSpeed) ? raw.starSpeed : "cruise",
    previewHeight: clampHeight(raw.previewHeight),
    fractal: clampFractal(raw.fractal),
    fractalPresetId: typeof raw.fractalPresetId === "string" ? raw.fractalPresetId : DEFAULTS.fractalPresetId,
    focus: {
      // "visuals" | "both" | "breathing". Older saves had breathing: bool.
      mode: FOCUS_MODES.includes(f.mode) ? f.mode : (f.breathing ? "both" : "visuals"),
      pattern: BREATHING_PATTERNS[f.pattern] ? f.pattern : DEFAULTS.focus.pattern,
      pace: BREATHING_PACE_OPTIONS.some((o) => o.value === f.pace) ? f.pace : DEFAULTS.focus.pace,
      distractionFree: !!f.distractionFree,
    },
    saved: Array.isArray(raw.saved)
      ? raw.saved
          .filter((s) => s && typeof s.id === "string" && typeof s.name === "string")
          .map((s) => ({ id: s.id, name: s.name.slice(0, 60), params: clampParams(s.params) }))
      : [],
  };
}

export function writeSoundscapePrefs(prefs) {
  try { localStorage.setItem(SOUNDSCAPE_PREFS_KEY, JSON.stringify(prefs)); } catch { /* non-fatal */ }
}
