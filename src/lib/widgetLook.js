// A widget's "look" — the whole visual layer, in one plain object.
//
// The same shape does double duty: it's what a single widget stores in its
// own settings, AND it's what a saved style stores. So "make this widget
// look like that" and "save this look as a style I can reuse" are the same
// data moving between two places, not two parallel systems.
//
// Everything here is emitted as CSS custom properties on the widget's own
// wrapper, so the app-wide settings apply by default and a widget departs
// from them only where the user said so — inheritance does the work.
//
// `css` is raw CSS the user wrote. It's scoped to the widget (or to every
// widget using the style) by an attribute selector, so it can't leak into
// the rest of the app. Style elements can't execute script, and this is
// the user's own device and their own text — the same trust boundary as
// their journal entries.

export const LOOK_KEYS = [
  "font", "fontScale", "radius", "borderW", "borderColor", "borderStyle",
  "accent", "bg", "bgImage", "bgSize", "textColor", "padding", "shadow", "css",
];

export const SHADOW_PRESETS = {
  none: "none",
  soft: "0 2px 10px rgb(0 0 0 / 0.18)",
  hard: "4px 4px 0 var(--v2-accent)",
  glow: "0 0 14px color-mix(in srgb, var(--v2-accent) 55%, transparent)",
  inset: "inset 0 1px 6px rgb(0 0 0 / 0.25)",
};

export const BORDER_STYLES = ["solid", "dashed", "dotted", "double", "none"];

const isSet = (v) => v !== undefined && v !== null && v !== "";

// Pull just the look out of a widget's settings (settings also carry
// non-visual things like `label`, `journal`, `appIds`).
export function pickLook(settings = {}) {
  const out = {};
  for (const k of LOOK_KEYS) if (isSet(settings[k])) out[k] = settings[k];
  return out;
}

// A saved style underneath, the widget's own overrides on top.
export function mergeLook(base = {}, override = {}) {
  const out = { ...base };
  for (const k of LOOK_KEYS) if (isSet(override[k])) out[k] = override[k];
  if (isSet(base.css) && isSet(override.css)) out.css = `${base.css}\n${override.css}`;
  return out;
}

// The look is emitted as CSS VARIABLES on the widget wrapper; the widget's
// visible box (a v2 Section, an app tile) consumes them. Setting border /
// shadow / background as direct properties on the wrapper was the earlier
// mistake — the wrapper has no border of its own and sits behind the box,
// so those settings computed fine and rendered as nothing.
export function lookToStyle(look = {}, resolveImage = (u) => u) {
  const s = {};
  if (isSet(look.radius)) { s["--v2-radius"] = `${look.radius}px`; s["--radius"] = `${look.radius}px`; }
  if (isSet(look.borderW)) s["--v2-border-w"] = `${look.borderW}px`;
  // Re-declaring the APP token (--color-primary) at widget scope is what
  // makes accent reach everything inside that already follows the theme
  // (bg-primary, the breathing circle, buttons) — same trick as --radius.
  if (isSet(look.accent)) { s["--v2-accent"] = look.accent; s["--color-primary"] = look.accent; }
  if (isSet(look.font)) s.fontFamily = look.font;
  if (isSet(look.fontScale)) s.fontSize = `${look.fontScale}%`;
  if (isSet(look.textColor)) {
    // Plain inheritance only reaches unclassed text — nearly everything in a
    // widget carries text-foreground / text-muted-foreground, which win over
    // `color`. These two vars feed the [data-widget-content] remaps in
    // index.css so classed text follows too (muted = same hue, softened).
    s.color = look.textColor;
    s["--v2-text"] = look.textColor;
    s["--v2-text-muted"] = `color-mix(in srgb, ${look.textColor} 72%, transparent)`;
  }
  if (isSet(look.padding)) s["--v2-pad"] = `${look.padding}px`;
  if (isSet(look.bg)) s["--v2-widget-bg"] = look.bg;
  if (isSet(look.bgImage)) {
    // The image sits on the wrapper and shows through the box, so it can
    // sit behind an icon AND its name (the encapsulating-frame ask).
    s.backgroundImage = `url("${resolveImage(look.bgImage)}")`;
    s.backgroundSize = look.bgSize || "cover";
    s.backgroundPosition = "center";
    s.backgroundRepeat = look.bgSize === "repeat" ? "repeat" : "no-repeat";
    s.borderRadius = "var(--v2-radius, 8px)";
  }
  if (isSet(look.borderColor)) s["--v2-border-color"] = look.borderColor;
  if (isSet(look.borderStyle)) s["--v2-border-style"] = look.borderStyle;
  if (isSet(look.shadow)) s["--v2-shadow"] = SHADOW_PRESETS[look.shadow] ?? look.shadow;
  return s;
}

// ── Saved styles (SystemSettings.ui_v2_styles) ─────────────────────
export function resolveUserStyles(stored) {
  if (!Array.isArray(stored)) return [];
  return stored
    .filter((s) => s && typeof s === "object" && typeof s.id === "string" && s.id)
    .map((s) => ({
      id: s.id,
      label: typeof s.label === "string" ? s.label.slice(0, 40) : "Style",
      look: pickLook(s.look || {}),
    }));
}

export const USER_STYLE_PREFIX = "user:";
export const isUserStyle = (id) => typeof id === "string" && id.startsWith(USER_STYLE_PREFIX);
export const userStyleId = (id) => (isUserStyle(id) ? id.slice(USER_STYLE_PREFIX.length) : null);

export function newStyleId() {
  return `s_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
