// Scratch pad settings for this device: the ruleset, any tuning, colour
// and trails. Durable through BACKUP_LS_KEYS (backups + the in-database
// settings mirror). Everything read back is re-clamped.

import { clampRules, presetById, DEFAULT_PRESET } from "./particles";

export const SCRATCHPAD_PREFS_KEY = "symphony_scratchpad_v1";
export const COLOR_MODES = ["theme", "speed", "age"];

export function readScratchpadPrefs() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(SCRATCHPAD_PREFS_KEY) || "null"); } catch { raw = null; }
  const preset = presetById(raw?.presetId);
  const trails = Number(raw?.trails);
  return {
    presetId: preset.id,
    rules: raw?.rules ? clampRules(raw.rules) : clampRules(preset.rules),
    color: COLOR_MODES.includes(raw?.color) ? raw.color : "speed",
    trails: Number.isFinite(trails) ? Math.min(0.9, Math.max(0, trails)) : 0.6,
  };
}

export function writeScratchpadPrefs(prefs) {
  try { localStorage.setItem(SCRATCHPAD_PREFS_KEY, JSON.stringify(prefs)); } catch { /* non-fatal */ }
}

export { DEFAULT_PRESET };
