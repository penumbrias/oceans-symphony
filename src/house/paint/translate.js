// The paint translator (new house step 0.5).
//
// Old look in, new-house tokens out. PURE: it reads the settings row and the
// device's look preferences it is handed, and writes nothing — no record, no
// localStorage, no settings field. The old fields stay exactly as they are
// and keep driving the old frame (plan.md section 5, team/anchor.md 3.1).
//
//   translatePaint(settingsRow, { device, alterColors, defaultBottomBar })
//     → { tokens, variants, fonts, wallpaper, overrides, offers }
//
// - tokens: the 16 swatches of board 07 for the variant that is showing
//   (light or dark), plus corners / bevel / type / floor / wave.
// - variants: the same swatches for both light and dark.
// - fonts: { heading, body } — a font only counts as the person's own when
//   they chose it (decision 3: the shipped default, Inter, is NOT a choice);
//   null means "use the house default".
// - wallpaper: home and widget-board backgrounds and wallpapers, per-page
//   backgrounds, the system banner and picture — passed through as they are.
// - overrides: what always wins over the house look: the pixel overrides
//   (already folded into tokens), alter colours, front-level colours, icons.
// - offers: loved old layouts offered back ONCE as a card, never applied,
//   plus `readability` — colour pairs that are hard to read, each with a
//   suggested fix the person can accept with one tap.
//
// `device` holds the look preferences that live in localStorage, not on the
// settings row; readDevicePaint(getItem) builds it.

import { ALL_PRESETS, DEFAULT_THEME } from "@/lib/themePresets";
import { contrastRatio, adjustForContrast } from "@/lib/contrast";
import { readPixelLook } from "@/lib/pixelLook";
import { readWaveColorKey, readWaveCustom } from "@/lib/waveColorKey";
import { DEFAULT_CONFIG } from "@/utils/navigationConfig";

// Board 07's swatches, in its order.
export const SWATCHES = Object.freeze([
  "outline", "deep", "panel", "raised", "bevelLight", "wave", "text", "text2",
  "accent", "accent2", "good", "warning", "bevel", "tab", "info", "note",
]);

// The old theme's 8 colours → the swatch each one fills.
export const THEME_TO_SWATCH = Object.freeze({
  bg: "deep",
  surface: "panel",
  secondary: "raised",
  primary: "accent",
  accent: "accent2",
  muted: "tab",
  "text-primary": "text",
  "text-secondary": "text2",
});

// The house's own state colours (board 07). They have no old equivalent, so
// they keep these and are contrast-checked against the panel.
export const HOUSE_STATE_COLOURS = Object.freeze({
  dark: { good: "#9BC86A", warning: "#E5857A", info: "#5AA3CC", note: "#F2E3B0" },
  light: { good: "#3F7A2A", warning: "#B0453A", info: "#2C6E99", note: "#8A6A1F" },
});

// The old wave palette keys → the theme colour they name.
const WAVE_KEY_TO_THEME = Object.freeze({
  background: "bg", surface: "surface", primary: "primary", secondary: "secondary",
  accent: "accent", muted: "muted", text: "text-primary", "text-2nd": "text-secondary",
});

// What a contrast check asks of each pair (WCAG: 4.5 for text, 3 for parts).
export const READABILITY_PAIRS = Object.freeze([
  { fg: "text", bg: "panel", min: 4.5 },
  { fg: "text", bg: "deep", min: 4.5 },
  { fg: "text2", bg: "panel", min: 4.5 },
  { fg: "accent", bg: "panel", min: 3 },
  { fg: "good", bg: "panel", min: 3 },
  { fg: "warning", bg: "panel", min: 3 },
  { fg: "info", bg: "panel", min: 3 },
  { fg: "note", bg: "panel", min: 3 },
]);

// Fonts that are the shipped default, so not the person's choice.
const UNCHOSEN_BODY = new Set(["", "inter", "'Inter', sans-serif", "Inter"]);
const UNCHOSEN_HEADING = new Set(["", "default"]);

const HEX6 = /^#[0-9a-f]{6}$/i;
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

// ── tiny colour maths ──────────────────────────────────────────────────
function toRgb(hex) {
  if (typeof hex !== "string" || !HEX.test(hex.trim())) return null;
  let h = hex.trim().slice(1);
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  h = h.slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
const toHex = (rgb) => `#${rgb.map((n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
// `a` moved toward `b` by t (0..1).
export function mix(a, b, t) {
  const x = toRgb(a), y = toRgb(b);
  if (!x || !y) return a || b || null;
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
}

// The WCAG contrast ratio of two colours, rounded to 2 places (null when
// either isn't a colour). Uses contrast.js, the app's one WCAG helper.
export function wcagRatio(a, b) {
  const r = contrastRatio(a, b);
  return r == null ? null : Math.round(r * 100) / 100;
}

// ── device preferences (localStorage) ─────────────────────────────────
// Builds `device` from a getItem function. Never throws.
export function readDevicePaint(getItem, { isDarkOS = true } = {}) {
  const get = (k) => { try { return getItem(k); } catch { return null; } };
  const json = (k) => { try { const v = JSON.parse(get(k)); return v ?? null; } catch { return null; } };
  return {
    themeMode: get("symphony_themeMode") || null,
    selectedTheme: get("symphony_selectedTheme") || null,
    customColors: json("symphony_customColors"),
    userCustomPresets: json("symphony_userCustomPresets"),
    fontFamily: get("symphony_a11y_fontFamily"),
    headingFont: get("symphony_a11y_headingFont"),
    fontBeforeEasyRead: get("symphony_a11y_fontBeforeEasyRead"),
    isDarkOS,
  };
}

// Which variant was showing: the person's mode, the OS for "system", and
// dark when nothing is saved (the app's own default).
export function showingVariant(device = {}) {
  const mode = device.themeMode;
  if (mode === "light") return "light";
  if (mode === "system") return device.isDarkOS === false ? "light" : "dark";
  return "dark";
}

// The 8 old colours for each variant, and where they came from.
// `houseDefault`: the theme to use when the person never picked one (the
// new house passes "pixel", the mockups' palette); a pick always wins.
function themeColours(device = {}, houseDefault = null) {
  const custom = isObj(device.customColors) ? device.customColors : null;
  const userPresets = isObj(device.userCustomPresets) ? device.userCustomPresets : {};
  const fallback = houseDefault && ALL_PRESETS[houseDefault] ? houseDefault : DEFAULT_THEME;
  const name = device.selectedTheme || fallback;
  let theme = null;
  let source;
  if (custom && (isObj(custom.light) || isObj(custom.dark))) {
    theme = custom; source = { kind: "custom" };
  } else if (ALL_PRESETS[name]) {
    theme = ALL_PRESETS[name]; source = { kind: "preset", name };
  } else if (isObj(userPresets[name])) {
    theme = userPresets[name]; source = { kind: "saved", name };
  } else {
    theme = ALL_PRESETS[fallback]; source = { kind: "default", name: fallback };
  }
  if (houseDefault && !device.selectedTheme && !(custom && (isObj(custom.light) || isObj(custom.dark)))) source = { kind: "default", name: fallback };
  const base = ALL_PRESETS[fallback];
  const pick = (v) => {
    // A variant the theme lacks borrows the other one, then the default
    // theme, key by key, so a half-saved custom theme still paints.
    const other = v === "dark" ? "light" : "dark";
    const out = {};
    for (const key of Object.keys(THEME_TO_SWATCH)) {
      const c = [theme?.[v]?.[key], theme?.[other]?.[key], base[v][key]].find((x) => typeof x === "string" && HEX.test(x));
      out[key] = c;
    }
    return out;
  };
  return { light: pick("light"), dark: pick("dark"), source };
}

function swatchesFor(colours, variant, settingsRow, px, houseDefaultTheme = false) {
  const s = {};
  for (const [key, sw] of Object.entries(THEME_TO_SWATCH)) s[sw] = colours[key];
  // Edges are derived: the outline darker than the floor, the bevels lifted
  // from the panel toward the text colour.
  s.outline = mix(s.deep, "#000000", 0.55);
  s.bevel = mix(s.panel, s.text, 0.22);
  s.bevelLight = mix(s.panel, s.text, 0.12);
  Object.assign(s, HOUSE_STATE_COLOURS[variant]);
  // The header wave: a custom colour, else the palette key it names. The
  // "Off" key (background) keeps the floor colour and says the wave is off.
  const waveCustom = readWaveCustom(settingsRow);
  const waveKey = readWaveColorKey(settingsRow);
  s.wave = waveCustom || colours[WAVE_KEY_TO_THEME[waveKey]] || colours.muted;
  // The house's own default palette: the mockups' wave is the second
  // accent (the periwinkle), unless the person set a wave of their own.
  if (houseDefaultTheme && !waveCustom && !settingsRow?.wave_color_key) s.wave = colours.accent;
  // Pixel overrides are newer and explicit, so they win.
  if (px.outline) s.outline = px.outline;
  if (px.titleBar) { s.tab = px.titleBar; s.titleBar = px.titleBar; }
  if (px.floorTop) s.deep = px.floorTop;
  return s;
}

// A suggested colour for `fg` that reads on `bg`. contrast.js's
// adjustForContrast keeps the hue but always moves away from the
// background's side, which can't work on a mid-tone background; then the
// nearest of "toward black" / "toward white" that reaches `min` wins.
export function suggestReadable(fg, bg, min) {
  const kept = adjustForContrast(fg, bg, { minRatio: min });
  if ((contrastRatio(kept, bg) ?? 0) >= min) return kept;
  let best = kept, bestRatio = contrastRatio(kept, bg) ?? 0;
  for (let t = 0.05; t <= 1.0001; t += 0.05) {
    for (const end of ["#000000", "#FFFFFF"]) {
      const c = mix(fg, end, t);
      const r = contrastRatio(c, bg) ?? 0;
      if (r >= min) return c;
      if (r > bestRatio) { best = c; bestRatio = r; }
    }
  }
  return best;
}

function readabilityFor(swatches, variant) {
  const out = [];
  for (const { fg, bg, min } of READABILITY_PAIRS) {
    const ratio = wcagRatio(swatches[fg], swatches[bg]);
    if (ratio == null || ratio >= min) continue;
    out.push({ variant, fg, bg, ratio, min, fix: { [fg]: suggestReadable(swatches[fg], swatches[bg], min) } });
  }
  return out;
}

// ── the board backgrounds ─────────────────────────────────────────────
function boardPaint(board) {
  if (!isObj(board)) return null;
  const out = {};
  if (board.background !== undefined) out.background = clone(board.background);
  if (board.wallpaper !== undefined) out.wallpaper = clone(board.wallpaper);
  return Object.keys(out).length ? out : null;
}

// ── the translator ────────────────────────────────────────────────────
export function translatePaint(settingsRow, opts = {}) {
  const row = isObj(settingsRow) ? settingsRow : {};
  const device = isObj(opts.device) ? opts.device : {};
  const px = readPixelLook(row);
  const variant = showingVariant(device);
  const colours = themeColours(device, opts.houseDefault || null);
  const houseDefaultTheme = !!opts.houseDefault && colours.source.kind === "default";

  const variants = {
    light: swatchesFor(colours.light, "light", row, px, houseDefaultTheme),
    dark: swatchesFor(colours.dark, "dark", row, px, houseDefaultTheme),
  };
  const swatches = variants[variant];

  // Corners: the pixel override, else the old corner mode when the person
  // set one ("sharp" is square, "rounded" the app's 12px), else the house's.
  let corners = px.corners ?? null;
  if (corners == null && row.corner_mode === "sharp") corners = 0;
  else if (corners == null && row.corner_mode === "rounded") corners = 12;

  const tokens = {
    variant,
    swatches,
    corners,
    bevel: px.bevel ?? null,
    type: px.type === "plain" ? "plain" : null,
    floor: px.floorTop || px.floorBottom ? { top: px.floorTop || swatches.deep, bottom: px.floorBottom || px.floorTop || swatches.deep } : null,
    waveOff: !readWaveCustom(row) && readWaveColorKey(row) === "background",
    source: colours.source,
  };

  // Fonts: only a font the person chose (decision 3).
  const body = typeof device.fontFamily === "string" && !UNCHOSEN_BODY.has(device.fontFamily.trim()) ? device.fontFamily : null;
  const heading = typeof device.headingFont === "string" && !UNCHOSEN_HEADING.has(device.headingFont.trim()) ? device.headingFont : null;
  const fonts = {
    heading,
    body,
    // Easy-read mode on: the body font is the easy-read one, and the font
    // to go back to is kept for the person, never applied here.
    easyRead: !!device.fontBeforeEasyRead,
  };

  // Wallpapers and backgrounds pass through as they are.
  const uiV2 = isObj(row.ui_v2) ? row.ui_v2 : {};
  const pages = {};
  if (isObj(row.page_looks)) {
    for (const [id, look] of Object.entries(row.page_looks)) if (isObj(look)) pages[id] = clone(look);
  }
  const wallpaper = {
    opensOn: uiV2.homeDefault === "board" ? "board" : "home",
    home: boardPaint(row.classic_home),
    board: boardPaint(row.ui_v2_home),
    pages,
    banner: row.system_banner_url ? {
      url: row.system_banner_url,
      framing: clone(row.system_banner_framing) ?? null,
      position: row.system_banner_position ?? null,
    } : null,
    avatar: row.system_avatar_url || null,
  };

  // What always wins over the house look.
  const pinned = isObj(row.pinned_alters_config) ? row.pinned_alters_config : {};
  const levelColours = {};
  if (isObj(pinned.levelStyles)) {
    for (const [id, st] of Object.entries(pinned.levelStyles)) {
      const c = isObj(st) ? (st.ringColor || st.color) : null;
      if (typeof c === "string" && c) levelColours[id] = c;
    }
  }
  const alterColours = {};
  for (const [id, c] of Object.entries(isObj(opts.alterColors) ? opts.alterColors : {})) {
    if (typeof c === "string" && HEX.test(c)) alterColours[id] = c;
  }
  const overrides = {
    pixel: Object.fromEntries(["outline", "titleBar", "floorTop", "floorBottom", "corners", "bevel", "type"].filter((k) => px[k] != null).map((k) => [k, px[k]])),
    alterColours,
    levelColours,
    icons: isObj(uiV2.icons) ? clone(uiV2.icons) : null,
    appsIcon: uiV2.appsIcon || null,
    frontButtonIcon: clone(row.front_button_icon) ?? null,
  };

  // Offers: shown once as a card, applied only on a yes.
  const layouts = [];
  const nav = isObj(row.navigation_config) ? row.navigation_config : {};
  const defaultBottom = Array.isArray(opts.defaultBottomBar) ? opts.defaultBottomBar : DEFAULT_CONFIG.bottomBar;
  if (Array.isArray(nav.bottomBar) && nav.bottomBar.length && JSON.stringify(nav.bottomBar) !== JSON.stringify(defaultBottom)) {
    layouts.push({ id: "pin-bottom-bar", kind: "pinnedTabs", pages: [...nav.bottomBar] });
  }
  for (const [field, which] of [["classic_home", "home"], ["ui_v2_home", "board"]]) {
    const style = isObj(row[field]) ? row[field].styleMode : null;
    if (typeof style === "string" && style && style !== "current") {
      layouts.push({ id: `style-${which}`, kind: "homeStyle", board: which, style });
    }
  }
  if (isObj(uiV2.barLooks) && Object.keys(uiV2.barLooks).length) {
    layouts.push({ id: "bar-looks", kind: "barLooks", bars: Object.keys(uiV2.barLooks) });
  }
  if (uiV2.homeDefault === "board") layouts.push({ id: "open-on-board", kind: "opensOn", board: "board" });

  const readability = [...readabilityFor(variants[variant], variant)];
  for (const [id, c] of Object.entries(alterColours)) {
    const ratio = wcagRatio(c, swatches.panel);
    // An alter's colour is never changed; the house draws a halo instead.
    if (ratio != null && ratio < 3) readability.push({ variant, alterId: id, fg: "alter", bg: "panel", ratio, min: 3, fix: { halo: true } });
  }

  return { tokens, variants, fonts, wallpaper, overrides, offers: { layouts, readability } };
}
