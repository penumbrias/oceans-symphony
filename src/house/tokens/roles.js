// The new house's colour roles and fonts, from the person's paint (step 1.1).
// PURE: paint in (translatePaint's result), roles out. Writes nothing.
//
//   houseTokens(paint, { look, highContrast }) →
//     { look, variant, roles, fonts, shape, vars, failures, adjusted }
//
// - roles: page, panel, raised, sunken, text, muted, accent, accentText,
//   onAccent, danger, dangerText, onDanger, focus, border, divider,
//   bevelLight, bevelDark, outline, wave, good, info, note.
// - vars: the CSS custom properties to set on the [data-house] root.
// - failures: promised pairs still under their minimum (should be empty).
// - adjusted: roles the house drew in a readable shade instead of the
//   person's exact colour, for the sample page to say so.

import { mix } from "@/house/paint/translate";
import { readableOnAll, onFill, roleFailures, worstRatio as worst } from "@/house/tokens/contrast";
import { CONTRAST } from "@/house/tokens/scales";

// The one place the pixel font is named (building code §7, §9). It is used
// only in the label role, never below text-sm and never for values.
export const PIXEL_LABEL_FONT = "'Pixelify Sans', 'Atkinson Hyperlegible', sans-serif";
// The house's body font when the person hasn't chosen one (decision 3).
export const HOUSE_BODY_FONT = "'Inter', 'Atkinson Hyperlegible', system-ui, sans-serif";

// Legacy short keys the old font picker stored (useAccessibility.js).
const LEGACY_FONTS = {
  inter: "'Inter', sans-serif",
  system: "system-ui, -apple-system, sans-serif",
  atkinson: "'Atkinson Hyperlegible', sans-serif",
  opendyslexic: "OpenDyslexic, 'Atkinson Hyperlegible', sans-serif",
  nunito: "'Nunito', sans-serif",
};
const fontCss = (v) => (v ? LEGACY_FONTS[v] || v : null);
// Body fonts chosen for reading ease: with one of these, labels use it too,
// so a person who picked OpenDyslexic sees no pixel letters (board 33, R2).
const EASY_READ = /opendyslexic|atkinson|lexend|comic/i;

// High contrast (Accessibility → High contrast) replaces the paint with
// fixed colours, as the old house does (index.css html.a11y-high-contrast).
const HIGH_CONTRAST = {
  dark: { page: "#000000", panel: "#000000", raised: "#1A1A1A", sunken: "#000000", text: "#FFFFFF", muted: "#E0E0E0", accent: "#7DB3FF", danger: "#FF8A80", border: "#FFFFFF", outline: "#FFFFFF" },
  light: { page: "#FFFFFF", panel: "#FFFFFF", raised: "#F0F0F0", sunken: "#FFFFFF", text: "#000000", muted: "#2A2A2A", accent: "#1D4ED8", danger: "#B00020", border: "#000000", outline: "#000000" },
};

// Shape per look. `corners` px from the person's paint win over these.
export const LOOK_SHAPE = Object.freeze({
  smooth: { corner: 12, cornerSmall: 8, border: 1, bevel: 0, iconStroke: 2, iconCap: "round" },
  pixel: { corner: 0, cornerSmall: 0, border: 2, bevel: 2, iconStroke: 2, iconCap: "square" },
});

export function houseLook(look) {
  return look === "pixel" ? "pixel" : "smooth";
}

function buildRoles(sw, variant, highContrast) {
  const dark = variant === "dark";
  if (highContrast) {
    const hc = HIGH_CONTRAST[dark ? "dark" : "light"];
    return { ...hc, divider: hc.border, bevelLight: hc.border, bevelDark: hc.border, wave: hc.accent, good: dark ? "#9BE07A" : "#1E5E14", info: hc.accent, note: hc.text };
  }
  const page = sw.deep;
  const panel = sw.panel;
  const raised = sw.raised || mix(panel, sw.text, 0.08);
  // Fields sit a step below the panel, toward the floor; when the floor and
  // the panel are the same colour, a step toward black (dark) or grey (light).
  const sunken = page && page.toUpperCase() !== String(panel).toUpperCase()
    ? mix(panel, page, 0.6)
    : mix(panel, "#000000", dark ? 0.25 : 0.05);
  return {
    page, panel, raised, sunken,
    text: sw.text,
    muted: sw.text2,
    accent: sw.accent,
    danger: sw.warning,
    border: mix(panel, sw.text, 0.45),
    divider: mix(panel, sw.text, 0.18),
    bevelLight: sw.bevelLight,
    bevelDark: sw.outline,
    outline: sw.outline,
    wave: sw.wave,
    good: sw.good,
    info: sw.info,
    note: sw.note,
  };
}

// Make every promised pair readable, keeping the person's colours wherever
// they already read.
function enforce(r) {
  const out = { ...r };
  const adjusted = [];
  const fix = (key, from, bgs, min) => {
    const next = readableOnAll(from, bgs, min);
    if (next !== r[key] && key in r) adjusted.push(key);
    out[key] = next;
  };
  fix("text", r.text, [r.page, r.panel, r.raised, r.sunken], CONTRAST.text);
  fix("muted", r.muted, [r.page, r.panel, r.sunken], CONTRAST.text);
  fix("accent", r.accent, [r.page, r.panel], CONTRAST.part);
  out.accentText = readableOnAll(out.accent, [r.page, r.panel], CONTRAST.text);
  out.dangerText = readableOnAll(r.danger, [r.page, r.panel], CONTRAST.text);
  fix("danger", r.danger, [r.page, r.panel], CONTRAST.part);
  out.onAccent = onFill(out.accent, CONTRAST.text);
  out.onDanger = onFill(out.danger, CONTRAST.text);
  fix("border", r.border, [r.page, r.panel, r.sunken], CONTRAST.part);
  // The focus ring: the accent when it reads at 3:1 on both page and panel,
  // else the text colour (which always does).
  out.focus = readableOnAll(out.accent, [r.page, r.panel], CONTRAST.focus);
  if (worst(out.focus, [r.page, r.panel]) < CONTRAST.focus) out.focus = out.text;
  // A filled button whose text can't reach 4.5:1 on the accent (a rare
  // mid-tone) gets a deeper or lighter fill instead.
  if (worst(out.onAccent, [out.accent]) < CONTRAST.text) {
    out.accent = readableOnAll(out.accent, [out.onAccent], CONTRAST.text);
    adjusted.push("accent");
  }
  return { roles: out, adjusted: [...new Set(adjusted)] };
}
function buildFonts(fonts, look, lookType) {
  const body = fontCss(fonts?.body) || HOUSE_BODY_FONT;
  const heading = fontCss(fonts?.heading);
  const bodyIsEasyRead = !!fonts?.easyRead || EASY_READ.test(fonts?.body || "");
  let label;
  if (heading) label = heading; // the person's own heading font wins
  else if (bodyIsEasyRead) label = body; // no pixel letters for an easy-read pick
  else if (look === "pixel" && lookType !== "plain") label = PIXEL_LABEL_FONT;
  else label = body;
  return {
    body,
    label,
    // Times, dates, numbers and codes: always the body font (board E4).
    value: body,
    labelIsPixel: label === PIXEL_LABEL_FONT,
  };
}

export function houseTokens(paint, { look, highContrast = false } = {}) {
  const l = houseLook(look);
  const variant = paint?.tokens?.variant === "light" ? "light" : "dark";
  const sw = paint?.tokens?.swatches || {};
  const { roles, adjusted } = enforce(buildRoles(sw, variant, !!highContrast));
  const base = LOOK_SHAPE[l];
  const shape = { ...base };
  if (Number.isFinite(paint?.tokens?.corners)) {
    shape.corner = paint.tokens.corners;
    shape.cornerSmall = Math.min(base.cornerSmall || paint.tokens.corners, paint.tokens.corners);
  }
  if (l === "pixel" && Number.isFinite(paint?.tokens?.bevel)) shape.bevel = paint.tokens.bevel;
  const fonts = buildFonts(paint?.fonts, l, paint?.tokens?.type);

  const vars = {};
  for (const [k, v] of Object.entries(roles)) if (v) vars[`--house-${kebab(k)}`] = v;
  vars["--house-corner"] = `${shape.corner}px`;
  vars["--house-corner-sm"] = `${shape.cornerSmall}px`;
  vars["--house-border-w"] = `${shape.border}px`;
  vars["--house-bevel"] = `${shape.bevel}px`;
  vars["--house-icon-stroke"] = String(shape.iconStroke);
  vars["--house-font-body"] = fonts.body;
  vars["--house-font-label"] = fonts.label;
  vars["--house-font-value"] = fonts.value;

  return { look: l, variant, highContrast: !!highContrast, roles, fonts, shape, vars, failures: roleFailures(roles), adjusted };
}

function kebab(s) {
  return s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}
