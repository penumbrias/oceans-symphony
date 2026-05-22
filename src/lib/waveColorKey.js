// User-pickable palette key for the header wave's fill colour.
// Lives on SystemSettings.wave_color_key and is read by both the
// renderer (HeaderWaveBlock) and the picker UI (in
// AdvancedAppearanceNew). Stored as a string slug rather than an
// HTML colour value so the user can switch palettes without the
// wave going stale.
//
// Allowed keys mirror the Custom Colours grid in Appearance:
//   background, surface, primary, secondary, accent, muted,
//   text (== --color-text-primary), text-2nd (== --color-text-secondary).

export const WAVE_COLOR_KEYS = Object.freeze([
  "background",
  "surface",
  "primary",
  "secondary",
  "accent",
  "muted",
  "text",
  "text-2nd",
]);

export const WAVE_COLOR_LABELS = Object.freeze({
  background: "Background",
  surface:    "Surface",
  primary:    "Primary",
  secondary:  "Secondary",
  accent:     "Accent",
  muted:      "Muted",
  text:       "Text",
  "text-2nd": "Text 2nd",
});

export const DEFAULT_WAVE_COLOR_KEY = "muted";

export function readWaveColorKey(systemSettings) {
  const raw = systemSettings?.wave_color_key;
  if (typeof raw === "string" && WAVE_COLOR_KEYS.includes(raw)) return raw;
  return DEFAULT_WAVE_COLOR_KEY;
}
