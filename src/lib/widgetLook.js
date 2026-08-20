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
  "accent", "bg", "bgOpacity", "bgImage", "bgSize", "textColor", "padding", "shadow", "css",
  "padTop", "padRight", "padBottom", "padLeft",
  // Effects the user can build themselves — the same ones the built-in
  // styles use, so nothing is reserved for presets.
  "gradFrom", "gradTo", "gradAngle", "blur",
  // Translucency belongs to each COLOUR, not to the widget as a whole:
  // a gradient that fades to transparent, a solid box with ghosted text,
  // a border you can see through. Kept as separate keys so the colour
  // picker stays a plain hex field (the native picker has no alpha).
  "accentOpacity", "textOpacity", "borderOpacity", "gradFromOpacity", "gradToOpacity",
];

// An explicit "this style turns the effect OFF" value, as distinct from
// "this style doesn't say" (unset = inherit). Without it a preset can add
// a gradient but never take one away.
export const OFF = "none";

export const SHADOW_PRESETS = {
  none: "none",
  soft: "0 2px 10px rgb(0 0 0 / 0.18)",
  hard: "4px 4px 0 var(--v2-accent)",
  glow: "0 0 14px color-mix(in srgb, var(--v2-accent) 55%, transparent)",
  inset: "inset 0 1px 6px rgb(0 0 0 / 0.25)",
};

export const BORDER_STYLES = ["solid", "dashed", "dotted", "double", "none"];

const isSet = (v) => v !== undefined && v !== null && v !== "";

// Fold a colour and its own opacity into one CSS colour. color-mix keeps
// the stored value a plain hex, so the picker and the hex field still work.
function withAlpha(color, pct) {
  if (!isSet(color) || color === OFF) return color;
  const n = Number(pct);
  if (!isSet(pct) || !Number.isFinite(n) || n >= 100) return color;
  return `color-mix(in srgb, ${color} ${Math.max(0, n)}%, transparent)`;
}

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
  if (isSet(look.accent)) {
    const a = withAlpha(look.accent, look.accentOpacity);
    s["--v2-accent"] = a; s["--color-primary"] = a;
  }
  if (isSet(look.font)) s.fontFamily = look.font;
  if (isSet(look.fontScale)) s.fontSize = `${look.fontScale}%`;
  if (isSet(look.textColor)) {
    // Plain inheritance only reaches unclassed text — nearly everything in a
    // widget carries text-foreground / text-muted-foreground, which win over
    // `color`. These two vars feed the [data-widget-content] remaps in
    // index.css so classed text follows too (muted = same hue, softened).
    const tc = withAlpha(look.textColor, look.textOpacity);
    s.color = tc;
    s["--v2-text"] = tc;
    // Muted text keeps its own softening on top of whatever the user chose.
    const mutedPct = isSet(look.textOpacity) ? Math.round(Number(look.textOpacity) * 0.72) : 72;
    s["--v2-text-muted"] = `color-mix(in srgb, ${look.textColor} ${mutedPct}%, transparent)`;
  }
  if (isSet(look.padding)) s["--v2-pad"] = `${look.padding}px`;
  // Per-side spacing (Advanced) — each overrides the uniform padding on
  // its side only; unset sides keep following --v2-pad.
  if (isSet(look.padTop)) s["--v2-pad-t"] = `${look.padTop}px`;
  if (isSet(look.padRight)) s["--v2-pad-r"] = `${look.padRight}px`;
  if (isSet(look.padBottom)) s["--v2-pad-b"] = `${look.padBottom}px`;
  if (isSet(look.padLeft)) s["--v2-pad-l"] = `${look.padLeft}px`;
  if (isSet(look.bg)) s["--v2-widget-bg"] = withAlpha(look.bg, look.bgOpacity);
  if (isSet(look.bgImage)) {
    // The image sits on the wrapper and shows through the box, so it can
    // sit behind an icon AND its name (the encapsulating-frame ask).
    s.backgroundImage = `url("${resolveImage(look.bgImage)}")`;
    s.backgroundSize = look.bgSize || "cover";
    s.backgroundPosition = "center";
    s.backgroundRepeat = look.bgSize === "repeat" ? "repeat" : "no-repeat";
    s.borderRadius = "var(--v2-radius, 8px)";
  }
  if (isSet(look.borderColor)) s["--v2-border-color"] = withAlpha(look.borderColor, look.borderOpacity);
  if (isSet(look.borderStyle)) s["--v2-border-style"] = look.borderStyle;
  if (isSet(look.shadow)) s["--v2-shadow"] = SHADOW_PRESETS[look.shadow] ?? look.shadow;
  // A gradient layers OVER the flat background colour, so the two combine
  // rather than one silently winning. Each stop carries its own opacity, so
  // a gradient can fade out to nothing instead of only between two solids.
  if (look.gradFrom === OFF || look.gradTo === OFF) {
    s["--v2-widget-gradient"] = "none";
  } else if (isSet(look.gradFrom) && isSet(look.gradTo)) {
    const angle = isSet(look.gradAngle) ? Number(look.gradAngle) : 135;
    const from = withAlpha(look.gradFrom, look.gradFromOpacity);
    const to = withAlpha(look.gradTo, look.gradToOpacity);
    s["--v2-widget-gradient"] = `linear-gradient(${angle}deg, ${from}, ${to})`;
  }
  if (isSet(look.blur) && Number(look.blur) > 0) s["--v2-widget-blur"] = `blur(${Number(look.blur)}px)`;
  return s;
}

// ── What a style covers ────────────────────────────────────────────
// A saved style doesn't have to be a whole look. You can save just the
// shape, or just the colours, and apply it over anything without
// disturbing the rest. So every style needs to say what it touches.
//
// `required` is what a group must set to genuinely COVER that dimension.
// Anything outside `required` is a modifier (an opacity, an angle) that
// only means something alongside its colour, so it doesn't gate coverage.
export const LOOK_GROUPS = [
  {
    id: "shape", label: "Shape & spacing",
    keys: ["radius", "borderW", "borderStyle", "padding", "shadow"],
    required: ["radius", "borderW", "padding", "shadow"],
  },
  {
    id: "type", label: "Font & text size",
    keys: ["font", "fontScale"],
    required: ["font", "fontScale"],
  },
  {
    id: "colour", label: "Colours",
    keys: ["accent", "accentOpacity", "bg", "bgOpacity", "textColor", "textOpacity", "borderColor", "borderOpacity"],
    required: ["accent", "bg", "textColor", "borderColor"],
  },
  {
    id: "effects", label: "Gradient & blur",
    keys: ["gradFrom", "gradTo", "gradAngle", "gradFromOpacity", "gradToOpacity", "blur", "bgImage", "bgSize"],
    // A style that says "no gradient" (the OFF sentinel) covers this just
    // as much as one that sets a gradient — both decide what you get.
    required: ["gradFrom", "gradTo", "blur"],
  },
  {
    id: "css", label: "Custom CSS",
    keys: ["css"],
    required: ["css"],
  },
];

export function groupCovered(look = {}, group) {
  return group.required.every((k) => isSet(look[k]));
}

// Which dimensions this style decides, and which it leaves to whatever
// the widget already had. A style covering everything needs no caveat;
// anything less gets a marker and this list behind it.
export function lookCoverage(look = {}) {
  const covers = LOOK_GROUPS.filter((g) => groupCovered(look, g));
  const leaves = LOOK_GROUPS.filter((g) => !groupCovered(look, g));
  return { covers, leaves, complete: leaves.length === 0 };
}

// Build the look to SAVE: the chosen groups, filled from what the widget
// actually looks like right now rather than only the keys it happens to
// store. Saving "colours" off a widget that inherits its background from
// the page style should still capture that background — otherwise the
// preset silently covers less than the name says.
export function lookForGroups(resolved = {}, own = {}, groupIds = [], live = {}) {
  const out = {};
  for (const g of LOOK_GROUPS) {
    if (!groupIds.includes(g.id)) continue;
    for (const k of g.keys) {
      // What the widget stores, then what its style resolves to, then what
      // it actually renders as. Without the last one a style saved off a
      // widget that inherits everything would set nothing at all.
      const v = isSet(own[k]) ? own[k] : isSet(resolved[k]) ? resolved[k] : live[k];
      if (isSet(v)) out[k] = v;
    }
    // "No gradient" / "no custom CSS" are complete answers, not silence —
    // record them explicitly so the style genuinely decides that dimension
    // (and so a style the user marked as covering everything reads as
    // covering everything, rather than wearing a star for a blank field).
    if (g.id === "effects") {
      if (!isSet(out.gradFrom) || !isSet(out.gradTo)) { out.gradFrom = OFF; out.gradTo = OFF; }
      if (!isSet(out.blur)) out.blur = 0;
    }
    if (g.id === "css" && !isSet(out.css)) out.css = OFF;
  }
  return out;
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

// ── Classic themes → widget looks ──────────────────────────────────
// The classic Appearance page's themes (built-in presets AND the user's
// saved ones) translate into the widget look shape, so a look you already
// designed for the whole app can be applied to a single widget (owner
// request: "custom theme presets from the classic UI need to be migrated
// and translated into this section of the style preset").
//
// Mapping: the widget's box sits ON the page, so `surface` is its
// background, `primary` its accent + border tint, and text-primary its
// text. Fonts ride along when the preset carries one.
export function themeToLook(preset, isDark = true) {
  if (!preset) return null;
  const c = (isDark ? preset.dark : preset.light) || preset.light || preset.dark;
  if (!c) return null;
  const look = {};
  if (c.surface) look.bg = c.surface;
  if (c["text-primary"]) look.textColor = c["text-primary"];
  if (c.primary) {
    look.accent = c.primary;
    look.borderColor = c.primary;
  }
  if (preset.font) look.font = preset.font;
  return look;
}


// ── Bar looks ──────────────────────────────────────────────────────
// The same look object, applied to a CHROME BAR (top bar, tab strip,
// quick-action row, sidebar rail, active bubble, pinned bar). Bars paint
// their own background/border directly (they aren't widget boxes), so on
// top of the CSS variables this also sets the paint properties, with the
// bar's default veil when the user hasn't chosen a background.
export function barLookStyle(uiV2, barId, { veil = true } = {}) {
  const look = (uiV2 && uiV2.barLooks && uiV2.barLooks[barId]) || {};
  const s = lookToStyle(look);
  const bg = s["--v2-widget-bg"];
  if (bg) s.backgroundColor = bg;
  else if (veil) s.background = "var(--color-bg)";
  const grad = s["--v2-widget-gradient"];
  if (grad && grad !== "none" && !s.backgroundImage) s.backgroundImage = grad;
  if (s["--v2-shadow"]) s.boxShadow = s["--v2-shadow"];
  return s;
}
