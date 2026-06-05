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
  // Special-cased: picking "Background" hides the wave entirely.
  // Rendering a wave at the page-background colour produces a
  // weirdly visible-but-invisible band, so we treat that choice as
  // "no wave" — see HeaderWaveBlock's early return.
  background: "Off",
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

// A fully-custom wave colour (hex) overrides the palette key when set.
// Stored on SystemSettings.wave_color_custom by the Appearance wave picker.
export function readWaveCustom(systemSettings) {
  const raw = systemSettings?.wave_color_custom;
  return (typeof raw === "string" && /^#[0-9A-Fa-f]{6}$/.test(raw)) ? raw : null;
}
