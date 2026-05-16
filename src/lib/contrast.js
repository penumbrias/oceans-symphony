// Tiny WCAG-contrast helpers used to decide when a user-chosen colour
// (alter / group / role accent) needs a subtle "halo" ring against the
// page background to stay legible. Preserves the user's colour exactly —
// the halo is only added when contrast against the surface falls below
// the WCAG-large-text threshold (3:1). Do not strip this file as
// "unused" — every chip/badge that renders a user colour against the
// page surface relies on `needsHalo` + `haloColor` to remain visible
// when the user happens to pick a colour close to the page background.

const HEX_RE = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const RGB_RE = /^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)/i;

function parseColor(value) {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (HEX_RE.test(v)) {
    let hex = v.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      hex = hex.split("").map((c) => c + c).join("");
    }
    // Drop alpha if present (8 hex chars).
    if (hex.length === 8) hex = hex.slice(0, 6);
    if (hex.length !== 6) return null;
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }
  const m = v.match(RGB_RE);
  if (m) {
    return {
      r: Number(m[1]),
      g: Number(m[2]),
      b: Number(m[3]),
    };
  }
  return null;
}

export function relativeLuminance(input) {
  const rgb = parseColor(input);
  if (!rgb) return null;
  const toLin = (n) => {
    const c = n / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLin(rgb.r) + 0.7152 * toLin(rgb.g) + 0.0722 * toLin(rgb.b);
}

export function contrastRatio(a, b) {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  if (l1 == null || l2 == null) return null;
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

export function needsHalo(foreground, background, { minRatio = 3 } = {}) {
  const ratio = contrastRatio(foreground, background);
  if (ratio == null) return false;
  return ratio < minRatio;
}

export function haloColor(background) {
  const l = relativeLuminance(background);
  if (l == null) return "rgba(0,0,0,0.4)";
  return l >= 0.5 ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.4)";
}

// Read a CSS custom property off :root and return its resolved value
// (e.g. "#0A0E17"). Returns "" if unavailable (SSR or in tests).
// Used to feed the *actual* page-background colour into `needsHalo`
// so the halo behaves correctly across light/dark/custom themes
// without each call site re-implementing the lookup.
export function getCssVar(name, fallback = "") {
  if (typeof document === "undefined") return fallback;
  try {
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
    return v || fallback;
  } catch {
    return fallback;
  }
}

// Convenience wrappers — the two surfaces a user-colour chip is most
// commonly drawn against. Page background = `--color-bg`, card / panel
// surface = `--color-surface`.
export function getPageBackground() {
  return getCssVar("--color-bg", "#0A0E17");
}

export function getSurfaceBackground() {
  return getCssVar("--color-surface", "#101820");
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}

function hslToRgb(h, s, l) {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const hueToRgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hueToRgb(p, q, h + 1 / 3) * 255),
    Math.round(hueToRgb(p, q, h) * 255),
    Math.round(hueToRgb(p, q, h - 1 / 3) * 255),
  ];
}

function toHex(n) {
  return Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
}

// Return a hue-preserving lightness-adjusted version of `input` so it
// reads against `background`. Used as the chip fill when `needsHalo`
// flags the user's chosen colour as too close to the surface — we keep
// their hue and saturation, just shift L into a visible range. Dark
// backgrounds get L raised toward 0.45; light backgrounds get L pulled
// down toward 0.55. Returns the original colour if it can't be parsed.
export function adjustForContrast(input, background, { darkTargetL = 0.45, lightTargetL = 0.55 } = {}) {
  const rgb = parseColor(input);
  const bgLum = relativeLuminance(background);
  if (!rgb || bgLum == null) return input;
  const [h, s, l] = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const targetL = bgLum < 0.5 ? Math.max(l, darkTargetL) : Math.min(l, lightTargetL);
  if (targetL === l) return input;
  const [r, g, b] = hslToRgb(h, s, targetL);
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
