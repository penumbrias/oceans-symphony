#!/usr/bin/env node
// The new house's paint translator (src/house/paint/translate.js): every
// built-in theme, a custom theme, a custom font, an empty install, pixel
// overrides, wallpapers, offers and the readability check. It must write
// nothing and never change its inputs.
//
//   node scripts/test-paint-translate.mjs

import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

const src = pathToFileURL(new URL("../src/", import.meta.url).pathname).href;
register(`data:text/javascript,${encodeURIComponent(`
  export async function resolve(spec, ctx, next) {
    if (spec.startsWith("@/")) {
      let url = ${JSON.stringify(src)} + spec.slice(2);
      if (!/\\.[a-z]+$/.test(url)) url += ".js";
      return next(url, ctx);
    }
    return next(spec, ctx);
  }
`)}`);

// Any storage write would be a bug: the translator writes nothing.
const touched = [];
globalThis.localStorage = {
  getItem: () => null,
  setItem: (k) => touched.push(k),
  removeItem: (k) => touched.push(k),
};

const P = await import("../src/house/paint/translate.js");
const { ALL_PRESETS, DEFAULT_THEME } = await import("../src/lib/themePresets.js");

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log(`ok  ${name}`); };
const HEX = /^#[0-9A-F]{6}$/i;
const frozen = (v) => JSON.stringify(v);

test("the contrast helper gives WCAG ratios", () => {
  assert.equal(P.wcagRatio("#000000", "#FFFFFF"), 21);
  assert.equal(P.wcagRatio("#777777", "#777777"), 1);
  assert.equal(P.wcagRatio("#767676", "#FFFFFF"), 4.54);
  assert.equal(P.wcagRatio("nope", "#fff"), null);
});

test("empty install: the default theme, dark, house fonts, nothing offered", () => {
  const out = P.translatePaint(null, { device: {} });
  assert.equal(out.tokens.variant, "dark");
  assert.deepEqual(out.tokens.source, { kind: "preset", name: DEFAULT_THEME });
  assert.equal(out.tokens.swatches.deep, ALL_PRESETS[DEFAULT_THEME].dark.bg);
  assert.deepEqual(out.fonts, { heading: null, body: null, easyRead: false });
  assert.equal(out.tokens.corners, null);
  assert.equal(out.wallpaper.home, null);
  assert.deepEqual(out.wallpaper.pages, {});
  assert.deepEqual(out.offers.layouts, []);
  assert.equal(out.overrides.icons, null);
  // Same from an empty object row and from readDevicePaint of empty storage.
  const again = P.translatePaint({}, { device: P.readDevicePaint(() => null) });
  assert.deepEqual(again.tokens, out.tokens);
});

const names = Object.keys(ALL_PRESETS);
test(`every built-in theme (${names.length}) maps onto all 16 swatches, both variants`, () => {
  assert.ok(names.length >= 16);
  for (const name of names) {
    for (const mode of ["light", "dark"]) {
      const out = P.translatePaint({}, { device: { selectedTheme: name, themeMode: mode } });
      assert.equal(out.tokens.variant, mode, name);
      assert.deepEqual(out.tokens.source, { kind: "preset", name });
      const sw = out.tokens.swatches;
      assert.deepEqual(Object.keys(sw).sort(), [...P.SWATCHES].sort(), `${name} has 16 swatches`);
      for (const k of P.SWATCHES) assert.match(sw[k], HEX, `${name}/${mode}/${k}`);
      const t = ALL_PRESETS[name][mode];
      for (const [old, swatch] of Object.entries(P.THEME_TO_SWATCH)) {
        if (swatch === "tab" || swatch === "deep") continue; // pixel overrides may win; none set here
        assert.equal(sw[swatch], t[old], `${name}/${mode}: ${old} → ${swatch}`);
      }
      assert.equal(sw.deep, t.bg);
      assert.equal(sw.tab, t.muted);
      // The wave defaults to the muted colour (the old default key).
      assert.equal(sw.wave, t.muted);
      // Readability entries name real pairs, with a fix that reads better.
      for (const r of out.offers.readability) {
        assert.ok(r.ratio < r.min);
        const fixed = r.fix[r.fg];
        assert.ok(P.wcagRatio(fixed, sw[r.bg]) >= r.min, `${name}/${mode}: fix for ${r.fg} reaches ${r.min}`);
      }
    }
  }
});

test("system mode follows the OS; no mode means dark", () => {
  const dev = { selectedTheme: "warm", themeMode: "system" };
  assert.equal(P.translatePaint({}, { device: { ...dev, isDarkOS: false } }).tokens.variant, "light");
  assert.equal(P.translatePaint({}, { device: { ...dev, isDarkOS: true } }).tokens.variant, "dark");
  assert.equal(P.translatePaint({}, { device: { selectedTheme: "warm" } }).tokens.variant, "dark");
});

test("a custom theme wins; a half-saved one borrows key by key", () => {
  const custom = { light: { bg: "#FAFAFA", surface: "#FFFFFF", primary: "#AA3366", secondary: "#EEEEEE", accent: "#3366AA", muted: "#DDDDDD", "text-primary": "#111111", "text-secondary": "#444444" } };
  const device = { selectedTheme: "warm", themeMode: "light", customColors: custom };
  const before = frozen(device);
  const out = P.translatePaint({}, { device });
  assert.deepEqual(out.tokens.source, { kind: "custom" });
  assert.equal(out.tokens.swatches.accent, "#AA3366");
  assert.equal(out.tokens.swatches.deep, "#FAFAFA");
  // Dark wasn't saved: it borrows the light colours rather than going blank.
  assert.equal(out.variants.dark.accent, "#AA3366");
  assert.equal(frozen(device), before, "input untouched");
  // A saved (user) preset by name.
  const saved = P.translatePaint({}, { device: { selectedTheme: "Mine", userCustomPresets: { Mine: { dark: { ...ALL_PRESETS.ocean.dark, primary: "#123456" } } } } });
  assert.deepEqual(saved.tokens.source, { kind: "saved", name: "Mine" });
  assert.equal(saved.tokens.swatches.accent, "#123456");
  // An unknown theme name falls back to the default, never blank.
  const lost = P.translatePaint({}, { device: { selectedTheme: "gone" } });
  assert.deepEqual(lost.tokens.source, { kind: "default", name: DEFAULT_THEME });
});

test("fonts: only a chosen font counts; Inter is not a choice", () => {
  const f = (device) => P.translatePaint({}, { device }).fonts;
  assert.equal(f({ fontFamily: "inter" }).body, null);
  assert.equal(f({ fontFamily: "'Inter', sans-serif" }).body, null);
  assert.equal(f({ headingFont: "default" }).heading, null);
  assert.equal(f({ fontFamily: "'Atkinson Hyperlegible', sans-serif" }).body, "'Atkinson Hyperlegible', sans-serif");
  // A custom (uploaded) font family by name.
  assert.equal(f({ fontFamily: "'My Hand', sans-serif", headingFont: "'My Hand Bold'" }).heading, "'My Hand Bold'");
  const easy = f({ fontFamily: "OpenDyslexic, 'Atkinson Hyperlegible', sans-serif", fontBeforeEasyRead: "inter" });
  assert.equal(easy.easyRead, true);
  assert.match(easy.body, /OpenDyslexic/);
  // readDevicePaint reads the real keys.
  const store = { symphony_a11y_fontFamily: "atkinson", symphony_themeMode: "light", symphony_customColors: "{bad json" };
  const dev = P.readDevicePaint((k) => store[k] ?? null);
  assert.equal(dev.fontFamily, "atkinson");
  assert.equal(dev.themeMode, "light");
  assert.equal(dev.customColors, null, "corrupt JSON is ignored, never thrown");
});

test("pixel overrides win; the old corner mode is used only without one", () => {
  const row = { ui_pixel: { outline: "#010203", titleBar: "#0A0B0C", floorTop: "#111111", floorBottom: "#222222", corners: 4, bevel: 3, type: "plain" }, corner_mode: "sharp" };
  const out = P.translatePaint(row, { device: { selectedTheme: "berry" } });
  const sw = out.tokens.swatches;
  assert.equal(sw.outline, "#010203");
  assert.equal(sw.tab, "#0A0B0C");
  assert.equal(sw.deep, "#111111");
  assert.deepEqual(out.tokens.floor, { top: "#111111", bottom: "#222222" });
  assert.equal(out.tokens.corners, 4);
  assert.equal(out.tokens.bevel, 3);
  assert.equal(out.tokens.type, "plain");
  assert.equal(out.overrides.pixel.outline, "#010203");
  assert.equal(P.translatePaint({ corner_mode: "sharp" }).tokens.corners, 0);
  assert.equal(P.translatePaint({ corner_mode: "rounded" }).tokens.corners, 12);
});

test("wave: a custom colour, a palette key, and Off", () => {
  const dev = { selectedTheme: "forest" };
  assert.equal(P.translatePaint({ wave_color_custom: "#ABCDEF" }, { device: dev }).tokens.swatches.wave, "#ABCDEF");
  assert.equal(P.translatePaint({ wave_color_key: "primary" }, { device: dev }).tokens.swatches.wave, ALL_PRESETS.forest.dark.primary);
  assert.equal(P.translatePaint({ wave_color_key: "background" }, { device: dev }).tokens.waveOff, true);
});

test("wallpapers, page backgrounds, banner and picture pass through untouched", () => {
  const row = {
    classic_home: { pages: [{ id: "p" }], background: { type: "image", url: "local-image://a" }, wallpaper: { folder: "f1", mode: "daily" }, styleMode: "glass" },
    ui_v2_home: { pages: [], background: { type: "gradient", from: "#000", to: "#fff" } },
    page_looks: { journals: { background: { type: "flat", color: "#123123" } }, junk: "x" },
    ui_v2: { homeDefault: "board", icons: { pages: { home: { iconName: "Star" } } }, barLooks: { top: { radius: 2 } } },
    system_banner_url: "local-image://b", system_banner_framing: { x: 1, y: 2, zoom: 1.5 }, system_avatar_url: "local-image://c",
    navigation_config: { bottomBar: ["home", "journals"] },
    pinned_alters_config: { levelStyles: { co: { ringColor: "#FF00FF", shape: "square" } } },
  };
  const before = frozen(row);
  const out = P.translatePaint(row, { device: {} });
  assert.equal(frozen(row), before, "row untouched");
  assert.deepEqual(out.wallpaper.home, { background: row.classic_home.background, wallpaper: row.classic_home.wallpaper });
  assert.deepEqual(out.wallpaper.board, { background: row.ui_v2_home.background });
  assert.equal(out.wallpaper.opensOn, "board");
  assert.deepEqual(out.wallpaper.pages, { journals: row.page_looks.journals });
  assert.deepEqual(out.wallpaper.banner, { url: "local-image://b", framing: { x: 1, y: 2, zoom: 1.5 }, position: null });
  assert.equal(out.wallpaper.avatar, "local-image://c");
  // Copies, not references: changing the output can't reach the record.
  out.wallpaper.home.background.url = "changed";
  assert.equal(row.classic_home.background.url, "local-image://a");
  assert.deepEqual(out.overrides.levelColours, { co: "#FF00FF" });
  assert.deepEqual(out.overrides.icons, row.ui_v2.icons);
  // Loved old layouts are offered, never applied.
  const kinds = out.offers.layouts.map((o) => o.kind).sort();
  assert.deepEqual(kinds, ["barLooks", "homeStyle", "opensOn", "pinnedTabs"]);
  assert.deepEqual(out.offers.layouts.find((o) => o.kind === "pinnedTabs").pages, ["home", "journals"]);
});

test("alter colours always win, flagged (never changed) when hard to read", () => {
  const out = P.translatePaint({}, { device: { selectedTheme: "charcoal" }, alterColors: { a1: "#FFAA00", a2: P.translatePaint({}, { device: { selectedTheme: "charcoal" } }).tokens.swatches.panel, bad: "nope" } });
  assert.deepEqual(Object.keys(out.overrides.alterColours).sort(), ["a1", "a2"]);
  const flag = out.offers.readability.find((r) => r.alterId === "a2");
  assert.ok(flag && flag.fix.halo === true && flag.ratio < 3);
  assert.ok(!out.offers.readability.some((r) => r.alterId === "a1"));
});

test("a hard-to-read custom theme is flagged with a one-tap fix", () => {
  const custom = { dark: { bg: "#202020", surface: "#262626", primary: "#2A2A2A", secondary: "#303030", accent: "#555555", muted: "#333333", "text-primary": "#3A3A3A", "text-secondary": "#2E2E2E" } };
  const out = P.translatePaint({}, { device: { customColors: custom } });
  const text = out.offers.readability.find((r) => r.fg === "text" && r.bg === "panel");
  assert.ok(text, "low-contrast text is flagged");
  assert.ok(P.wcagRatio(text.fix.text, out.tokens.swatches.panel) >= 4.5);
  assert.equal(out.tokens.swatches.text, "#3A3A3A", "the colour itself is left as chosen");
});

test("nothing was written anywhere", () => {
  assert.deepEqual(touched, []);
});

console.log(`paint translate: ${passed} tests passed (${names.length} built-in themes)`);
