import { loadExtraFontsIfInstalled } from "./fontPacks";

const LS_FONT_SIZE     = "symphony_a11y_fontSize";
const LS_REDUCE_MOTION = "symphony_a11y_reduceMotion";
const LS_HIGH_CONTRAST = "symphony_a11y_highContrast";
const LS_LARGE_TOUCH   = "symphony_a11y_largeTouch";
const LS_NAV_HEIGHT    = "symphony_a11y_navHeight";
const LS_FONT_FAMILY   = "symphony_a11y_fontFamily";
const LS_HEADING_FONT  = "symphony_a11y_headingFont";
// Master "Accessibility mode" — a low-vision LAYOUT reconfiguration (single-
// column reflow, larger targets, wrap-don't-truncate, condensed chrome), gated
// in CSS by `html.a11y-mode`. Independent of the text-size slider.
const LS_A11Y_MODE     = "symphony_a11y_mode";

const FONT_CLASSES  = ["a11y-text-xs3", "a11y-text-xs2", "a11y-text-xs", "a11y-text-sm", "a11y-text-lg", "a11y-text-xl", "a11y-text-xl2", "a11y-text-xl3", "a11y-text-xl4", "a11y-text-xl5"];
const TOUCH_CLASSES = ["a11y-touch-comfortable", "a11y-touch-large"];

const NAV_HEIGHTS = {
  compact:      "44px",
  default:      "56px",
  tall:         "68px",
  "extra-tall": "80px",
};

// Existing short-key users stay working
const LEGACY_FONT_MAP = {
  inter:    "'Inter', sans-serif",
  system:   "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  atkinson: "'Atkinson Hyperlegible', sans-serif",
  nunito:   "'Nunito', sans-serif",
};

export const APP_FONT_OPTIONS = [
  // UI-optimised / accessible
  { label: "Inter",                  value: "'Inter', sans-serif",                          legacy: "inter",    category: "ui" },
  { label: "System font",            value: "system-ui, -apple-system, sans-serif",         legacy: "system",   category: "ui" },
  { label: "Atkinson Hyperlegible",  value: "'Atkinson Hyperlegible', sans-serif",          legacy: "atkinson", category: "ui" },
  { label: "Nunito",                 value: "'Nunito', sans-serif",                         legacy: "nunito",   category: "ui" },
  { label: "Poppins",                value: "Poppins, sans-serif",                                              category: "ui" },
  { label: "Raleway",                value: "Raleway, sans-serif",                                              category: "ui" },
  { label: "Noto Sans",              value: "'Noto Sans', sans-serif",                                          category: "ui" },
  // Serif
  { label: "Playfair Display",       value: "'Playfair Display', serif",                                        category: "serif" },
  { label: "Lora",                   value: "Lora, serif",                                                      category: "serif" },
  { label: "Merriweather",           value: "Merriweather, serif",                                              category: "serif" },
  { label: "Noto Serif",             value: "'Noto Serif', serif",                                              category: "serif" },
  { label: "Amiri",                  value: "Amiri, serif",                                                     category: "serif" },
  // Handwriting
  { label: "Caveat",                 value: "Caveat, cursive",                                                  category: "handwriting" },
  { label: "Dancing Script",         value: "'Dancing Script', cursive",                                        category: "handwriting" },
  { label: "Pacifico",               value: "Pacifico, cursive",                                               category: "handwriting" },
  { label: "Satisfy",                value: "Satisfy, cursive",                                                 category: "handwriting" },
  // Monospace
  { label: "Fira Code",              value: "'Fira Code', monospace",                                           category: "mono" },
  { label: "Space Mono",             value: "'Space Mono', monospace",                                          category: "mono" },
  // Display / decorative
  { label: "Righteous",              value: "Righteous, cursive",                                               category: "display" },
  { label: "Lobster",                value: "Lobster, cursive",                                                 category: "display" },
  { label: "Bungee",                 value: "Bungee, display",                                                  category: "display" },
  { label: "Orbitron",               value: "Orbitron, sans-serif",                                             category: "display" },
  // Cultural / multilingual
  { label: "Nanum Gothic",           value: "'Nanum Gothic', sans-serif",                                       category: "other" },
  { label: "Sawarabi Mincho",        value: "'Sawarabi Mincho', serif",                                         category: "other" },
  { label: "Tajawal",                value: "Tajawal, sans-serif",                                              category: "other" },
  // Fun (affects readability)
  { label: "VT323",                  value: "VT323, monospace",                                                 category: "fun" },
  { label: "Press Start 2P",         value: "'Press Start 2P', cursive",                                        category: "fun" },
];

// Optional extra fonts — NOT bundled into the app. Downloaded on demand
// from Google Fonts only when the user opts in (Settings → Appearance →
// "Extra fonts"), so they don't bloat the install for people who don't
// want them. See src/lib/fontPacks.js for the loader. The families here
// must match the ones requested in that file's Google Fonts URL.
export const EXTRA_FONT_OPTIONS = [
  { label: "Quicksand",          value: "Quicksand, sans-serif",          category: "ui" },
  { label: "Comfortaa",          value: "Comfortaa, sans-serif",          category: "ui" },
  { label: "Josefin Sans",       value: "'Josefin Sans', sans-serif",     category: "ui" },
  { label: "Work Sans",          value: "'Work Sans', sans-serif",        category: "ui" },
  { label: "EB Garamond",        value: "'EB Garamond', serif",           category: "serif" },
  { label: "Bitter",             value: "Bitter, serif",                  category: "serif" },
  { label: "Indie Flower",       value: "'Indie Flower', cursive",        category: "handwriting" },
  { label: "Shadows Into Light", value: "'Shadows Into Light', cursive",  category: "handwriting" },
  { label: "Patrick Hand",       value: "'Patrick Hand', cursive",        category: "handwriting" },
  { label: "Permanent Marker",   value: "'Permanent Marker', cursive",    category: "handwriting" },
  { label: "JetBrains Mono",     value: "'JetBrains Mono', monospace",    category: "mono" },
  { label: "Bebas Neue",         value: "'Bebas Neue', sans-serif",       category: "display" },
  { label: "Abril Fatface",      value: "'Abril Fatface', serif",         category: "display" },
  { label: "Bangers",            value: "Bangers, cursive",               category: "fun" },
];

export const FONT_CATEGORY_LABELS = {
  ui:          "UI & Accessible",
  serif:       "Serif",
  handwriting: "Handwriting",
  mono:        "Monospace",
  display:     "Display",
  other:       "Multilingual",
  fun:         "Fun (affects readability)",
};

/** Returns the CSS font-family string for a stored value (handles legacy short keys). */
export function resolveFontCss(value) {
  return LEGACY_FONT_MAP[value] || value || "'Inter', sans-serif";
}

/** Find the matching font option (bundled OR optional extra) for a stored value. */
export function findFontOption(storedValue) {
  return [...APP_FONT_OPTIONS, ...EXTRA_FONT_OPTIONS].find(
    f => f.value === storedValue || (f.legacy && f.legacy === storedValue)
  ) || APP_FONT_OPTIONS[0];
}

function applyFontSize(value) {
  const el = document.documentElement;
  FONT_CLASSES.forEach(c => el.classList.remove(c));
  if (value && value !== "default") el.classList.add(`a11y-text-${value}`);
}

function applyReduceMotion(enabled) {
  document.documentElement.classList.toggle("a11y-reduce-motion", !!enabled);
}

function applyHighContrast(enabled) {
  document.documentElement.classList.toggle("a11y-high-contrast", !!enabled);
}

function applyA11yMode(enabled) {
  document.documentElement.classList.toggle("a11y-mode", !!enabled);
}

function applyLargeTouch(value) {
  const el = document.documentElement;
  TOUCH_CLASSES.forEach(c => el.classList.remove(c));
  if (value && value !== "default") el.classList.add(`a11y-touch-${value}`);
}

function applyNavHeight(value) {
  const h = NAV_HEIGHTS[value] || NAV_HEIGHTS.default;
  document.documentElement.style.setProperty("--bottom-nav-height", h);
}

function applyFontFamily(value) {
  // Accepts either a legacy short key ("inter") or a CSS font-family string
  const css = LEGACY_FONT_MAP[value] || value || "'Inter', sans-serif";
  document.documentElement.style.setProperty("--font-sans", css);
}

// 10 heading-font choices spanning sans / serif / handwriting / display.
// `value` is "default" (use --font-display from CSS) or a CSS font-family
// string; saving anything else falls back to default.
export const HEADING_FONT_OPTIONS = [
  { label: "Default (DM Serif Display)", value: "default",                               category: "ui" },
  // UI / Accessible
  { label: "Inter",                 value: "'Inter', sans-serif",                        category: "ui" },
  { label: "System font",           value: "system-ui, -apple-system, sans-serif",       category: "ui" },
  { label: "Atkinson Hyperlegible", value: "'Atkinson Hyperlegible', sans-serif",        category: "ui" },
  { label: "Nunito",                value: "'Nunito', sans-serif",                       category: "ui" },
  { label: "Poppins",               value: "Poppins, sans-serif",                        category: "ui" },
  { label: "Raleway",               value: "Raleway, sans-serif",                        category: "ui" },
  { label: "Noto Sans",             value: "'Noto Sans', sans-serif",                    category: "ui" },
  // Serif
  { label: "DM Serif Display",      value: "'DM Serif Display', serif",                  category: "serif" },
  { label: "Playfair Display",      value: "'Playfair Display', serif",                  category: "serif" },
  { label: "Lora",                  value: "Lora, serif",                                category: "serif" },
  { label: "Merriweather",          value: "Merriweather, serif",                        category: "serif" },
  { label: "Noto Serif",            value: "'Noto Serif', serif",                        category: "serif" },
  { label: "Amiri",                 value: "Amiri, serif",                               category: "serif" },
  // Handwriting
  { label: "Caveat",                value: "Caveat, cursive",                            category: "handwriting" },
  { label: "Dancing Script",        value: "'Dancing Script', cursive",                  category: "handwriting" },
  { label: "Pacifico",              value: "Pacifico, cursive",                          category: "handwriting" },
  { label: "Satisfy",               value: "Satisfy, cursive",                           category: "handwriting" },
  // Monospace
  { label: "Fira Code",             value: "'Fira Code', monospace",                     category: "mono" },
  { label: "Space Mono",            value: "'Space Mono', monospace",                    category: "mono" },
  // Display / decorative
  { label: "Righteous",             value: "Righteous, cursive",                         category: "display" },
  { label: "Lobster",               value: "Lobster, cursive",                           category: "display" },
  { label: "Bungee",                value: "Bungee, display",                            category: "display" },
  { label: "Orbitron",              value: "Orbitron, sans-serif",                       category: "display" },
  // Cultural / multilingual
  { label: "Nanum Gothic",          value: "'Nanum Gothic', sans-serif",                 category: "other" },
  { label: "Sawarabi Mincho",       value: "'Sawarabi Mincho', serif",                   category: "other" },
  { label: "Tajawal",               value: "Tajawal, sans-serif",                        category: "other" },
  // Fun
  { label: "VT323",                 value: "VT323, monospace",                           category: "fun" },
  { label: "Press Start 2P",        value: "'Press Start 2P', cursive",                  category: "fun" },
];

function applyHeadingFont(value) {
  const el = document.documentElement;
  if (!value || value === "default") {
    el.style.removeProperty("--font-display");
    return;
  }
  el.style.setProperty("--font-display", value);
}

export function initAccessibility() {
  applyFontSize(localStorage.getItem(LS_FONT_SIZE) || "default");
  applyReduceMotion(localStorage.getItem(LS_REDUCE_MOTION) === "true");
  applyHighContrast(localStorage.getItem(LS_HIGH_CONTRAST) === "true");
  applyA11yMode(localStorage.getItem(LS_A11Y_MODE) === "true");
  applyLargeTouch(localStorage.getItem(LS_LARGE_TOUCH) || "default");
  applyNavHeight(localStorage.getItem(LS_NAV_HEIGHT) || "default");
  applyFontFamily(localStorage.getItem(LS_FONT_FAMILY) || "inter");
  applyHeadingFont(localStorage.getItem(LS_HEADING_FONT) || "default");
  // If the user previously opted into the optional extra-font pack, re-inject
  // its stylesheet so their chosen extra font keeps rendering after launch.
  loadExtraFontsIfInstalled();
}

export function getAccessibilitySettings() {
  return {
    fontSize:    localStorage.getItem(LS_FONT_SIZE)    || "default",
    reduceMotion:localStorage.getItem(LS_REDUCE_MOTION) === "true",
    highContrast:localStorage.getItem(LS_HIGH_CONTRAST) === "true",
    a11yMode:    localStorage.getItem(LS_A11Y_MODE)     === "true",
    largeTouch:  localStorage.getItem(LS_LARGE_TOUCH)  || "default",
    navHeight:   localStorage.getItem(LS_NAV_HEIGHT)   || "default",
    fontFamily:  localStorage.getItem(LS_FONT_FAMILY)  || "inter",
    headingFont: localStorage.getItem(LS_HEADING_FONT) || "default",
  };
}

export function setAccessibilityHeadingFont(value) {
  if (!value || value === "default") {
    localStorage.removeItem(LS_HEADING_FONT);
  } else {
    localStorage.setItem(LS_HEADING_FONT, value);
  }
  applyHeadingFont(value);
}

export function setAccessibilityFontSize(value) {
  localStorage.setItem(LS_FONT_SIZE, value);
  applyFontSize(value);
}

export function setAccessibilityReduceMotion(enabled) {
  localStorage.setItem(LS_REDUCE_MOTION, String(enabled));
  applyReduceMotion(enabled);
}

export function setAccessibilityHighContrast(enabled) {
  localStorage.setItem(LS_HIGH_CONTRAST, String(enabled));
  applyHighContrast(enabled);
}

export function setAccessibilityMode(enabled) {
  localStorage.setItem(LS_A11Y_MODE, String(enabled));
  applyA11yMode(enabled);
}

export function setAccessibilityLargeTouch(value) {
  localStorage.setItem(LS_LARGE_TOUCH, value);
  applyLargeTouch(value);
}

export function setAccessibilityNavHeight(value) {
  localStorage.setItem(LS_NAV_HEIGHT, value);
  applyNavHeight(value);
}

export function setAccessibilityFontFamily(value) {
  localStorage.setItem(LS_FONT_FAMILY, value);
  applyFontFamily(value);
}
