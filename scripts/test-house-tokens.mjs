#!/usr/bin/env node
// The new house's tokens (step 1.1): the scales agree with tokens.css, every
// theme's roles meet the building code's contrast minimums (4.5:1 text,
// 3:1 borders and focus) in both looks, light, dark and high contrast, the
// fonts follow the person, motion goes to zero, and the house guard catches
// what it should. Pure: nothing is written anywhere.
//
//   node scripts/test-house-tokens.mjs

import assert from "node:assert/strict";
import fs from "node:fs";
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

const touched = [];
globalThis.localStorage = { getItem: () => null, setItem: (k) => touched.push(k), removeItem: (k) => touched.push(k) };

const S = await import("../src/house/tokens/scales.js");
const C = await import("../src/house/tokens/contrast.js");
const R = await import("../src/house/tokens/roles.js");
const P = await import("../src/house/paint/translate.js");
const G = await import("./check-house-guard.mjs");
const { ALL_PRESETS } = await import("../src/lib/themePresets.js");
const { contrastRatio } = await import("../src/lib/contrast.js");

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log(`ok  ${name}`); };
const css = fs.readFileSync(new URL("../src/house/tokens/tokens.css", import.meta.url), "utf8");
const cssVar = (name) => {
  const m = new RegExp(`--house-${name}:\\s*([^;]+);`).exec(css);
  return m ? m[1].trim() : null;
};

// ── scales ──────────────────────────────────────────────────────────────
test("type scale: six steps, rem only, nothing under 12 px, matches tokens.css", () => {
  assert.equal(S.TYPE_SCALE.length, 6);
  for (const t of S.TYPE_SCALE) {
    assert.equal(t.rem * 16, t.px, t.token);
    assert.ok(t.px >= S.TEXT_FLOOR_PX, t.token);
    const name = t.token; // text-xs → --house-text-xs
    assert.equal(cssVar(name), `${t.rem}rem`, name);
    assert.equal(Number(cssVar(name.replace("text-", "lh-"))), t.lineHeight, name);
  }
  assert.ok(!/--house-text-[a-z0-9]+:\s*[\d.]+px/.test(css), "no px text tokens");
});

test("spacing and heights match tokens.css; heights are max(px, rem) ≥ 44 px targets", () => {
  for (const s of S.SPACE_SCALE) assert.equal(cssVar(s.token), `${s.rem}rem`, s.token);
  for (const h of S.HEIGHT_SCALE) assert.equal(cssVar(h.token), `max(${h.px}px, ${h.rem}rem)`, h.token);
  for (const h of S.HEIGHT_SCALE.filter((x) => x.token !== "h-status")) assert.ok(h.px >= S.TARGET_MIN_PX, h.token);
  assert.equal(cssVar("target"), "max(44px, 2.75rem)");
});

test("frame chrome labels stop growing at 1.3×", () => {
  assert.equal(S.FRAME_TEXT_CAP, 1.3);
  assert.equal(S.frameTextPx(14, 1), 14);
  assert.equal(S.frameTextPx(14, 2), 14 * 1.3);
  assert.equal(S.frameTextPx(14, 1.125), 14 * 1.125);
  for (const [name, rem] of [["frame-text-xs", 0.75], ["frame-text-sm", 0.875], ["frame-text-lg", 1.125], ["frame-icon", 1.5]]) {
    const px = Math.round(rem * 16 * 1.3 * 10) / 10;
    assert.equal(cssVar(name), `min(${rem}rem, ${px}px)`, name);
  }
});

test("motion goes to zero under reduced motion (OS and the app's setting)", () => {
  assert.equal(S.motionMs("base", false), 200);
  assert.equal(S.motionMs("base", true), 0);
  assert.equal(S.motionMs("nope", false), 0);
  assert.equal(cssVar("dur-base"), "200ms");
  for (const block of [/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\[data-house\]\s*\{([^}]*)\}/, /html\.a11y-reduce-motion \[data-house\]\s*\{([^}]*)\}/]) {
    const m = block.exec(css);
    assert.ok(m, String(block));
    for (const d of ["fast", "base", "slow"]) assert.match(m[1], new RegExp(`--house-dur-${d}:\\s*0ms`));
  }
  assert.equal(S.prefersReducedMotion(), false, "no window: never throws");
});

test("every rule in the token files is scoped to [data-house]", () => {
  for (const f of ["tokens.css", "look-smooth.css", "look-pixel.css"]) {
    const text = fs.readFileSync(new URL(`../src/house/tokens/${f}`, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const selectors = [...text.matchAll(/([^{}]+)\{/g)].map((m) => m[1].trim()).filter((s) => s && !s.startsWith("@"));
    assert.ok(selectors.length, f);
    for (const sel of selectors) for (const part of topLevelParts(sel)) assert.match(part, /\[data-house\]/, `${f}: ${part.trim()}`);
    assert.ok(!/!\s*important/.test(text), `${f}: no !important`);
  }
});

function topLevelParts(sel) {
  const parts = []; let depth = 0, cur = "";
  for (const ch of sel) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) { parts.push(cur); cur = ""; } else cur += ch;
  }
  return [...parts, cur];
}

// ── contrast helpers ────────────────────────────────────────────────────
test("readableOnAll keeps a readable colour and fixes one that isn't, on every background", () => {
  assert.equal(C.readableOnAll("#FFFFFF", ["#000000", "#222222"], 4.5), "#FFFFFF");
  const fixed = C.readableOnAll("#777777", ["#666666", "#888888"], 3);
  // #666 and #888 are too close for any grey to reach 3:1 on both; the best
  // one is returned, never a crash.
  assert.match(fixed, /^#[0-9A-F]{6}$/i);
  const ok = C.readableOnAll("#5577AA", ["#101418", "#1A1F26"], 4.5);
  assert.ok(C.meetsOnAll(ok, ["#101418", "#1A1F26"], 4.5), ok);
  const light = C.readableOnAll("#FFD27A", ["#FFFFFF", "#F4F4F4"], 3);
  assert.ok(C.meetsOnAll(light, ["#FFFFFF", "#F4F4F4"], 3), light);
});

test("onFill picks white or black text for a fill, at 4.5:1 wherever possible", () => {
  assert.equal(C.onFill("#1D4ED8"), "#FFFFFF");
  assert.equal(C.onFill("#FFE066"), "#000000");
  for (const fill of ["#777777", "#808080", "#3FA7D6", "#E5857A", "#9BC86A"]) {
    assert.ok(contrastRatio(C.onFill(fill), fill) >= 4.5, fill);
  }
});

// ── roles over every theme ──────────────────────────────────────────────
const ROLE_KEYS = ["page", "panel", "raised", "sunken", "text", "muted", "accent", "accentText", "onAccent", "danger", "dangerText", "onDanger", "focus", "border", "divider", "bevelLight", "bevelDark", "outline"];
const names = Object.keys(ALL_PRESETS);
test(`every theme (${names.length}) × light/dark × smooth/pixel × high contrast meets 4.5:1 text and 3:1 parts`, () => {
  let checked = 0;
  for (const name of names) for (const mode of ["light", "dark"]) for (const look of ["smooth", "pixel"]) for (const hc of [false, true]) {
    const paint = P.translatePaint({}, { device: { selectedTheme: name, themeMode: mode } });
    const before = JSON.stringify(paint);
    const t = R.houseTokens(paint, { look, highContrast: hc });
    assert.equal(JSON.stringify(paint), before, "paint not changed");
    assert.deepEqual(t.failures, [], `${name}/${mode}/${look}/hc=${hc}: ${JSON.stringify(t.failures)}`);
    for (const k of ROLE_KEYS) assert.match(t.roles[k], /^#[0-9A-F]{6}$/i, `${name}/${mode}: ${k}`);
    assert.equal(t.variant, mode);
    assert.equal(t.look, look);
    checked += 1;
  }
  assert.equal(checked, names.length * 8);
});

test("a hard-to-read custom theme is drawn readable, and says which roles moved", () => {
  const muddy = { bg: "#556655", surface: "#5A6B5A", secondary: "#607060", primary: "#6A7B6A", accent: "#6F806F", muted: "#5F705F", "text-primary": "#7A8B7A", "text-secondary": "#728372" };
  const paint = P.translatePaint({}, { device: { customColors: { light: muddy, dark: muddy }, themeMode: "dark" } });
  const t = R.houseTokens(paint, { look: "smooth" });
  assert.deepEqual(t.failures, []);
  assert.ok(t.adjusted.includes("text"));
  assert.ok(t.adjusted.includes("muted"));
  assert.equal(t.roles.page, "#556655", "the page keeps the person's colour");
  assert.equal(t.roles.panel, "#5A6B5A", "the panel keeps the person's colour");
});

test("the person's own readable colours are kept exactly", () => {
  const paint = P.translatePaint({}, { device: { selectedTheme: "cool", themeMode: "dark" } });
  const t = R.houseTokens(paint, { look: "smooth" });
  const sw = paint.tokens.swatches;
  assert.equal(t.roles.page, sw.deep);
  assert.equal(t.roles.panel, sw.panel);
  if (contrastRatio(sw.text, sw.panel) >= 4.5 && contrastRatio(sw.text, sw.deep) >= 4.5 && !t.adjusted.includes("text")) assert.equal(t.roles.text, sw.text);
});

test("CSS vars: every role and the shape and fonts, nothing else", () => {
  const paint = P.translatePaint({ ui_pixel: { corners: 4, bevel: 3 } }, { device: {} });
  const t = R.houseTokens(paint, { look: "pixel" });
  assert.equal(t.vars["--house-text"], t.roles.text);
  assert.equal(t.vars["--house-accent-text"], t.roles.accentText);
  assert.equal(t.vars["--house-corner"], "4px", "the person's corners win");
  assert.equal(t.vars["--house-bevel"], "3px", "the person's bevel wins");
  assert.equal(t.vars["--house-border-w"], "2px");
  for (const k of Object.keys(t.vars)) assert.match(k, /^--house-/);
  const smooth = R.houseTokens(P.translatePaint({}, { device: {} }), { look: "smooth" });
  assert.equal(smooth.vars["--house-corner"], "12px");
  assert.equal(smooth.vars["--house-bevel"], "0px");
  const sharp = R.houseTokens(P.translatePaint({ corner_mode: "sharp" }, { device: {} }), { look: "smooth" });
  assert.equal(sharp.vars["--house-corner"], "0px");
});

// ── fonts ───────────────────────────────────────────────────────────────
test("fonts: two roles; the pixel font only as a label, values always the body font", () => {
  const f = (device, row = {}, look = "pixel") => R.houseTokens(P.translatePaint(row, { device }), { look }).fonts;
  const none = f({});
  assert.equal(none.body, R.HOUSE_BODY_FONT);
  assert.equal(none.label, R.PIXEL_LABEL_FONT);
  assert.equal(none.value, none.body);
  assert.equal(none.labelIsPixel, true);
  assert.equal(f({}, {}, "smooth").label, R.HOUSE_BODY_FONT, "smooth: labels in the body font");
  assert.equal(f({}, { ui_pixel: { type: "plain" } }).label, R.HOUSE_BODY_FONT, "pixel with plain type");
  const dys = f({ fontFamily: "OpenDyslexic, 'Atkinson Hyperlegible', sans-serif" });
  assert.equal(dys.label, dys.body, "an easy-read body font takes the pixel font out (R2)");
  assert.equal(f({ fontFamily: "opendyslexic" }).labelIsPixel, false, "legacy key too");
  assert.equal(f({ fontFamily: "Lora, serif" }).label, R.PIXEL_LABEL_FONT, "another body font keeps pixel labels");
  assert.equal(f({ headingFont: "Lora, serif" }).label, "Lora, serif", "the person's heading font wins");
  assert.equal(f({ fontFamily: "inter" }).body, R.HOUSE_BODY_FONT, "Inter is the unchosen default (decision 3)");
});

// ── the guard ───────────────────────────────────────────────────────────
const hits = (file, text) => G.scanText(file, text).map((f) => f.id);
test("guard: fixed px text", () => {
  assert.deepEqual(hits("src/house/a.css", ".a { font-size: 13px; }"), ["px-text"]);
  assert.deepEqual(hits("src/house/a.jsx", "<p style={{ fontSize: 12 }}>"), ["px-text"]);
  assert.deepEqual(hits("src/house/a.jsx", "style={{ fontSize: \"14px\" }}"), ["px-text"]);
  assert.deepEqual(hits("src/house/a.jsx", "className=\"text-[11px]\""), ["px-text"]);
  assert.deepEqual(hits("src/house/a.css", ".a { font: 600 12px/1 serif; }"), ["px-text"]);
  assert.deepEqual(hits("src/house/a.css", ".a { font-size: var(--house-text-sm); }"), []);
  assert.deepEqual(hits("src/house/a.jsx", "style={{ fontSize: \"var(--house-text-sm)\" }}"), []);
});
test("guard: buttons, ticks, tabs and old-house controls only inside the kit", () => {
  for (const line of ["<button onClick={go}>Go</button>", "<input type=\"checkbox\" />", "<div role=\"tab\">", "import { Button } from \"@/components/ui/button\";", "<input type='radio'/>"]) {
    assert.deepEqual(hits("src/house/rooms/a.jsx", line), ["control-outside-kit"], line);
    assert.deepEqual(hits("src/house/kit/Button.jsx", line), [], `kit may: ${line}`);
  }
});
test("guard: native date/time/select outside the kit; colour pickers nowhere", () => {
  assert.deepEqual(hits("src/house/a.jsx", "<input type=\"date\" />"), ["native-date-select"]);
  assert.deepEqual(hits("src/house/a.jsx", "<select value={v}>"), ["native-date-select"]);
  assert.deepEqual(hits("src/house/kit/DateField.jsx", "<input type=\"time\" />"), []);
  assert.deepEqual(hits("src/house/kit/Colour.jsx", "<input type=\"color\" />"), ["native-colour"]);
});
test("guard: !important, x as a tick, retired verbs, the pixel font", () => {
  assert.deepEqual(hits("src/house/a.css", ".a { color: red !important; }"), ["important"]);
  assert.deepEqual(hits("src/house/a.jsx", "{checked ? \"x\" : \"\"}"), ["x-as-tick"]);
  assert.deepEqual(hits("src/house/a.jsx", "{done ? '✕' : null}"), ["x-as-tick"]);
  assert.deepEqual(hits("src/house/a.css", ".tick::after { content: \"x\"; }"), ["x-as-tick"]);
  assert.deepEqual(hits("src/house/a.jsx", "{checked ? \"✓\" : \"\"}"), []);
  assert.deepEqual(hits("src/house/kit/a.jsx", "<HouseButton rank=\"primary\">Update</HouseButton>"), ["retired-verb"]);
  assert.deepEqual(hits("src/house/kit/a.jsx", "<HouseButton rank=\"primary\">Save</HouseButton>"), []);
  assert.deepEqual(hits("src/house/a.css", ".t { font-family: 'Pixelify Sans'; }"), ["pixel-font"]);
  assert.deepEqual(hits("src/house/tokens/roles.js", "const F = \"'Pixelify Sans'\";"), []);
  assert.deepEqual(hits("src/house/a.jsx", "<button>x</button> // house-ok: test"), []);
  assert.deepEqual(hits("src/house/a.css", "/* no !important here */"), []);
});
test("guard: the new house is clean today", () => {
  const { files, findings } = G.runHouseGuard();
  assert.ok(files > 0);
  assert.deepEqual(findings, []);
});

assert.deepEqual(touched, [], "nothing written to storage");
console.log(`\n${passed} passed.`);
