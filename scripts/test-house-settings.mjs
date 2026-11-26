#!/usr/bin/env node
// The house's Settings room (board 07-Settings, board 10-Inspector's shell,
// board 08-Phone's language): what the address means (the hash, the old
// hashes, ?section=), how the room words a page, Find, and that the room is
// drawn only on /settings, the old page is gated, both frames mount it, the
// phone runs it edge to edge with its tools in ⋯, it writes only through
// the existing writers, the old page and the room share one catalogue, and
// its classes don't clash with the kit's or another room's. Pure: nothing
// is written anywhere.
//
//   node scripts/test-house-settings.mjs

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

// "@/…" imports (the look model reads the paint translator).
const srcUrl = pathToFileURL(new URL("../src/", import.meta.url).pathname).href;
register(`data:text/javascript,${encodeURIComponent(`
  export async function resolve(spec, ctx, next) {
    if (spec.startsWith("@/")) {
      let url = ${JSON.stringify(srcUrl)} + spec.slice(2);
      if (!/\\.[a-z]+$/.test(url)) url += ".js";
      return next(url, ctx);
    }
    return next(spec, ctx);
  }
`)}`);

const M = await import("../src/house/settings/settingsModel.js");
const S = await import("../src/lib/houseSwitch.js");

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// The old catalogue's legacy map, read from its source (the file is JSX).
const pagesSrc = read("src/components/settings/settingsPages.jsx");
const legacyBlock = pagesSrc.slice(pagesSrc.indexOf("export const LEGACY_HASHES"), pagesSrc.indexOf("};", pagesSrc.indexOf("export const LEGACY_HASHES")));
const LEGACY = Object.fromEntries([...legacyBlock.matchAll(/["']?([\w-]+)["']?\s*:\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]));

const GROUPS = [
  { id: "you", label: "You", pages: [{ id: "setup", label: "Setup", hint: "What's set up", render: () => null }, { id: "profile", label: "Profile", render: () => null }] },
  { id: "look", label: "Look", pages: [{ id: "display", label: "Display options", hint: "Fonts", action: () => {} }, { id: "accessibility", label: "Accessibility", hint: "Low vision", render: () => null }] },
  { id: "about", label: "About", pages: [{ id: "bug-report", label: "Found a bug?", action: () => {} }] },
];

test("the address: a page, an old hash, a group, ?section=, nothing", () => {
  assert.deepEqual(M.settingsTarget({ hash: "" }), { kind: "home" });
  assert.deepEqual(M.settingsTarget({ hash: "#display", legacy: LEGACY }), { kind: "page", id: "display" });
  assert.deepEqual(M.settingsTarget({ hash: "#system", legacy: LEGACY }), { kind: "page", id: "profile" }, "an old accordion id lands on its page");
  assert.deepEqual(M.settingsTarget({ hash: "#recent-updates", legacy: LEGACY }), { kind: "page", id: "whats-new" });
  assert.deepEqual(M.settingsTarget({ hash: "#appearance", legacy: LEGACY }), { kind: "group", groupId: "look" });
  assert.deepEqual(M.settingsTarget({ hash: "#group:data", legacy: LEGACY }), { kind: "group", groupId: "data" });
  assert.deepEqual(M.settingsTarget({ hash: "", search: "?section=appearance", legacy: LEGACY }), { kind: "group", groupId: "look" }, "?section= is read as a hash");
  assert.deepEqual(M.settingsTarget({ hash: "#profile-songs", search: "?sm=profile%3Aalter%3Ax", legacy: LEGACY }), { kind: "page", id: "profile-songs" }, "the hash wins over other params");
  assert.deepEqual(M.settingsTarget({ hash: "#%20display%20" }), { kind: "page", id: "display" });
});

test("pages are found, opened or run, and worded as board 07 words them", () => {
  const f = M.findPage(GROUPS, "accessibility");
  assert.equal(f.group.id, "look");
  assert.equal(M.findPage(GROUPS, "nope"), null);
  assert.equal(M.findPage(GROUPS, ""), null);
  assert.equal(M.rowOpensPage(f.page), true);
  assert.equal(M.rowOpensPage(GROUPS[2].pages[0]), false, "an action row runs, it doesn't open a page");
  assert.equal(M.hrefFor({ id: "device-sync" }), "/settings#device-sync");
  assert.equal(M.pageHeading(f.group, f.page), "Look: Accessibility");
  assert.equal(M.pageHeading(null, null), "Settings");
  assert.equal(M.pageAside({ id: "display", hint: "Fonts" }), "every change shows live");
  assert.equal(M.pageAside(GROUPS[0].pages[0]), "What's set up");
  assert.ok(M.isLookPage("display") && M.isLookPage("accessibility") && !M.isLookPage("terms"));
  assert.equal(M.versionWords("0.390.0", "alpha"), "v0.390.0 alpha");
  assert.equal(M.versionWords("1.0.0", ""), "v1.0.0");
});

test("Find words and the phone's remembered list", () => {
  assert.equal(M.countPages(GROUPS), 5);
  assert.equal(M.findWords("", 5, 5), "5 settings");
  assert.equal(M.findWords("zzz", 0, 5), 'No settings match "zzz"');
  assert.equal(M.findWords("back", 2, 5), '2 of 5 settings match "back"');
  M.rememberList({ scroll: 120, query: "font" });
  assert.deepEqual(M.takeList(), { scroll: 120, query: "font" });
  assert.equal(M.takeList(), null, "taken once");
});

test("the Settings room is drawn by the house only on /settings; the old page is gated", () => {
  assert.equal(S.houseSettingsRoom("/settings"), true);
  assert.equal(S.houseSettingsRoom("/settings/"), true);
  assert.ok(!S.houseSettingsRoom("/settingsx"));
  assert.ok(!S.houseSettingsRoom("/"));
  assert.equal(S.houseRebuiltRoom("/settings"), true);
  assert.match(read("src/App.jsx"), /path="\/settings" element=\{<HouseRoomGate><Settings \/><\/HouseRoomGate>\}/);
});

test("both frames mount the room; the phone runs it edge to edge with its tools in ⋯", () => {
  for (const f of ["src/house/frame/HouseFrame.jsx", "src/house/phone/HousePhoneFrame.jsx"]) {
    const t = read(f);
    assert.ok(t.includes("house/settings/HouseSettings"), `${f} loads the room`);
    assert.ok(/<HouseSettings /.test(t), `${f} mounts it`);
  }
  const phone = read("src/house/phone/HousePhoneFrame.jsx");
  assert.ok(/\|\| settingsRoom( \|\| mapRoom)?( \|\| analyticsRoom)?( \|\| remindersRoom)? \? "px-0"/.test(phone), "the phone runs it edge to edge");
  assert.ok(/roomTools = [^;]*settingsRoom/.test(phone), "the phone frame reads the room's tools");
  assert.ok(/ownDocks[^;]*settingsRoom/.test(read("src/house/frame/HouseFrame.jsx")), "the room draws its own side panels");
  const room = read("src/house/settings/HouseSettings.jsx");
  assert.ok(room.includes("useRoomTools"), "the phone's backup doors live in ⋯");
  assert.ok(room.includes("PixelBack") && room.includes('rank="secondary"'), "the drill-in's back is the square pixel button");
  assert.ok(!/position:\s*fixed/.test(read("src/house/settings/settings.css")), "nothing floats over scrolling content");
});

test("one catalogue: the old page and the room build the same pages, search and links", () => {
  const room = read("src/house/settings/HouseSettings.jsx");
  const old = read("src/pages/Settings.jsx");
  for (const fn of ["buildSettingsGroups", "filterSettingsGroups", "LEGACY_HASHES"]) {
    assert.ok(room.includes(fn), `the room uses ${fn}`);
  }
  assert.ok(old.includes("buildSettingsGroups") && old.includes("filterSettingsGroups"), "the old page still does");
  assert.ok(room.includes("PageTutorialsControls") && old.includes("PageTutorialsControls"), "one Tour page for both");
  for (const k of ["openRescue", "openBugReport", "openFeedbackSurvey", "renderTour"]) assert.ok(room.includes(k), `the room hands the catalogue ${k}`);
  assert.ok(room.includes("DataRescuePanel") && room.includes("BugReportModal") && room.includes("FeedbackSurveyModal"), "every action a page can run has its host");
  const look = read("src/house/settings/DisplayLook.jsx");
  assert.ok(room.includes("DisplayLookPage") && look.includes("<UiEditSheet tab={tab} scopeless renderTabs"), "Display options' other tabs are the one UiEditSheet, under the house's tab strip");
  assert.ok(/renderTabs \? renderTabs\(/.test(read("src/components/v2/UiEditSheet.jsx")), "without the house the sheet draws its own TabBar");
});

test("the room writes only through the existing writers", () => {
  const dir = "src/house/settings";
  const files = readdirSync(new URL(`../${dir}`, import.meta.url)).filter((f) => /\.jsx?$/.test(f)).map((f) => `${dir}/${f}`);
  for (const f of files) {
    const text = read(f).replace(/\/\/.*$/gm, "");
    assert.ok(!/\.(create|update|delete|bulkDelete|bulkCreate)\(/.test(text), `${f} writes a record directly`);
    assert.ok(!/localStorage\.(setItem|removeItem)/.test(text), `${f} keeps state in localStorage`);
    assert.ok(!/writeSettings\(|writeLookField\(|writeBoard\(/.test(text), `${f} writes settings itself (the pages do, through their writers)`);
    assert.ok(!/base44\.entities\.\w+\.(?!list\(|filter\()\w+\(/.test(text), `${f} calls the entity layer for anything but a read`);
  }
  const room = read(`${dir}/HouseSettings.jsx`);
  assert.ok(room.includes("runAutoBackupNow") && room.includes("DataBackupRestore") && room.includes("ImportDataSection"), "backups go through the old backup paths");
});

test("hst- classes are the room's own and the CSS is the room's", () => {
  const others = [
    "src/house/kit/frame/frameKit.css", "src/house/kit/panels.css", "src/house/kit/kit.css", "src/house/kit/pixel.css",
    "src/house/alters/alters.css", "src/house/write/write.css", "src/house/planner/planner.css", "src/house/home/home.css",
    "src/house/day/day.css", "src/house/checkin/checkin.css", "src/house/support/support.css", "src/house/frame/frame.css",
    "src/house/phone/phone.css", "src/house/notebook/notebook.css", "src/house/map/map.css",
  ];
  for (const f of others) {
    let t = ""; try { t = read(f); } catch { continue; }
    assert.ok(!/\.hst-|\.hst\b/.test(t), `${f} has no hst- classes`);
  }
  const css = read("src/house/settings/settings.css");
  assert.ok(!/!important/.test(css));
  assert.ok(!/font-size:\s*\d+px/.test(css), "no px font sizes");
  assert.ok(!/(outline|border)[^;]*:\s*2px solid/.test(css.replace(/:focus-visible[^}]*}/g, "")), "edges are the thin pixel line, never a hard 2px");
  for (const sel of css.replace(/\/\*[\s\S]*?\*\//g, "").split("}").map((r) => r.split("{")[0]).filter((s) => s.trim() && !s.includes("@media"))) {
    for (const part of sel.split(/,(?![^(]*\))/)) assert.ok(/\.hst[-\s.[]|\.hst$|\.hst\b/.test(part), `"${part.trim()}" styles something outside the room`);
  }
  assert.ok(read("src/house/settings/HouseSettings.jsx").includes("settings/settings.css"), "the room imports its CSS (the phone needs it)");
  assert.ok(/\.hst--phone \{[^}]*padding: 0 var\(--house-space-2/.test(css) && /\[data-house\]\.hst \{[^}]*background: var\(--house-page\)/.test(css), "the phone paints the page with the slim gutter");
});

test("tour anchors the room adds have steps", () => {
  const tour = read("src/components/onboarding/FeatureTour.jsx");
  const room = read("src/house/settings/HouseSettings.jsx") + read("src/house/settings/DisplayLook.jsx");
  for (const a of ["settings-preview", "settings-display-inspector", "settings-backup-actions", "settings-look"]) {
    assert.ok(room.includes(`data-tour="${a}"`), `the room has ${a}`);
    assert.ok(tour.includes(`"${a}"`), `the tour has a step for ${a}`);
  }
  for (const a of ["settings-side-panel", "settings-quick-nav", "settings-content"]) assert.ok(room.includes(`data-tour="${a}"`), `the room keeps the old anchor ${a}`);
});

// ── Display options → Look (board 07's "Appearance: the look") ─────────
const L = await import("../src/house/settings/lookModel.js");
const PX = await import("../src/lib/pixelLook.js");
const T = await import("../src/house/paint/translate.js");
const R = await import("../src/house/tokens/roles.js");

test("Look: every swatch of board 07 is saved somewhere that already drives the look", () => {
  assert.deepEqual(L.LOOK_SWATCHES.map((s) => s.key), [...T.SWATCHES]);
  const where = Object.fromEntries(L.LOOK_SWATCHES.map((s) => [s.key, L.swatchTarget(s.key, {})]));
  assert.deepEqual(where.outline, { kind: "pixel", key: "outline" });
  assert.deepEqual(where.tab, { kind: "pixel", key: "titleBar" });
  assert.deepEqual(where.deep, { kind: "theme", key: "bg" });
  assert.deepEqual(L.swatchTarget("deep", { floorTop: "#101010" }), { kind: "pixel", key: "floorTop" }, "a floor colour is what shows, so it is what changes");
  assert.deepEqual(where.accent, { kind: "theme", key: "primary" });
  assert.deepEqual(where.accent2, { kind: "theme", key: "accent" });
  assert.deepEqual(where.wave, { kind: "wave" });
  for (const k of ["bevel", "bevelLight", "good", "warning", "info", "note"]) assert.deepEqual(where[k], { kind: "house", key: k });
  for (const s of L.LOOK_SWATCHES) assert.ok(where[s.key], `${s.key} has a home`);
});

test("Look: a theme colour change keeps the other seven as the house shows them", () => {
  const base = { light: { bg: "#fff", primary: "#111" }, dark: { bg: "#000", primary: "#222" } };
  const d = L.themeDraft(null, base, "dark", "primary", "#E8A65D");
  assert.equal(d.dark.primary, "#E8A65D");
  assert.equal(d.dark.bg, "#000");
  assert.deepEqual(d.light, base.light);
  const d2 = L.themeDraft({ dark: { bg: "#123456" } }, base, "dark", "primary", "#abcdef");
  assert.equal(d2.dark.bg, "#123456", "saved custom colours win over the base");
  assert.deepEqual(L.nextHouseSwatches({ good: "#00ff00" }, "note", "#ffffff"), { good: "#00ff00", note: "#ffffff" });
  assert.deepEqual(L.nextHouseSwatches({ good: "#00ff00" }, "good", ""), {});
});

test("Look: the new ui_pixel keys read safely and default to today's look", () => {
  assert.deepEqual(PX.readPixelLook({}).swatches, undefined);
  const px = PX.readPixelLook({ ui_pixel: { line: 9, icons: "classic", wave: "smooth", guide: "hidden", swatches: { good: "#00AA00", bad: "#000", note: "nope" } } });
  assert.equal(px.line, 4, "clamped");
  assert.equal(px.icons, "classic");
  assert.equal(px.wave, "smooth");
  assert.equal(px.guide, "hidden");
  assert.deepEqual(px.swatches, { good: "#00AA00" }, "only known keys with real colours");
  const junk = PX.readPixelLook({ ui_pixel: { line: "x", icons: "weird", wave: "zigzag", guide: "big", swatches: [1] } });
  for (const k of ["line", "icons", "wave", "guide", "swatches"]) assert.equal(junk[k], undefined, `${k} ignores junk`);
});

test("Look: the house draws what the person set, and nothing changes when they set nothing", () => {
  const plain = T.translatePaint({}, { device: {}, houseDefault: "pixel" });
  const plainVars = R.houseTokens(plain, { look: "pixel" }).vars;
  for (const v of ["--house-px-line", "--house-px-bevel", "--house-px-corner", "--house-icon-cap"]) assert.equal(plainVars[v], undefined, `${v} is left to pixel.css`);
  assert.equal(plain.tokens.waveShape, "stepped");
  assert.equal(plain.tokens.guide, "shown");
  const row = { ui_pixel: { line: 2, bevel: 3, corners: 4, icons: "classic", wave: "off", swatches: { good: "#00AA00", bevel: "#123456" } } };
  const p = T.translatePaint(row, { device: {}, houseDefault: "pixel" });
  const t = R.houseTokens(p, { look: "pixel" });
  assert.equal(t.vars["--house-px-line"], "2px");
  assert.equal(t.vars["--house-px-bevel"], "3px");
  assert.equal(t.vars["--house-px-corner"], "4px");
  assert.equal(t.vars["--house-icon-cap"], "round");
  assert.equal(p.tokens.waveOff, true);
  assert.equal(p.tokens.swatches.good, "#00AA00");
  assert.equal(t.roles.bevelRaised, "#123456", "the bevel swatch is the button bevel");
  // The house's own wave choice wins over the old "Off".
  const on = T.translatePaint({ wave_color_key: "background", ui_pixel: { wave: "smooth" } }, { device: {}, houseDefault: "pixel" });
  assert.equal(on.tokens.waveOff, false);
  assert.equal(on.tokens.waveShape, "smooth");
  assert.equal(T.translatePaint({ wave_color_key: "background" }, { device: {} }).tokens.waveOff, true, "without a house choice the old Off still counts");
  assert.equal(L.waveChoice(on), "smooth");
  // Smooth look: the pixel edges stay off.
  assert.equal(R.houseTokens(p, { look: "smooth" }).vars["--house-px-line"], undefined);
});

test("Look: Reset clears the paint keys and can put every one back", () => {
  const { clear, undo } = L.lookResetPatch({ line: 2, wave: "off", guide: "small", statusBar: false, swatches: { good: "#0f0" } });
  for (const k of L.LOOK_RESET_PIXEL_KEYS) assert.ok(k in clear && clear[k] === undefined, `${k} is cleared`);
  assert.ok(!("guide" in clear) && !("statusBar" in clear), "Penumblob and the bars are not paint");
  assert.deepEqual(undo, { line: 2, wave: "off", swatches: { good: "#0f0" } });
});

test("Look: fonts list the house's own defaults, and the room writes through the look writer", () => {
  const opts = [{ id: "'Inter', sans-serif", label: "Inter" }, { id: "x", label: "X" }];
  const body = L.houseBodyOptions(opts);
  assert.equal(body[0].id, L.HOUSE_BODY_DEFAULT_ID);
  assert.ok(!body.some((o) => o.label === "Inter"), "Inter reads as not chosen in the house, so it isn't offered as a choice");
  assert.ok(L.isUnchosenBody("inter") && !L.isUnchosenBody("x"));
  assert.equal(L.houseHeadingOptions(opts, "pixel")[0].label, "Pixelify Sans (house)");
  const look = read("src/house/settings/DisplayLook.jsx");
  assert.ok(look.includes("@/lib/houseLookWrites") && look.includes("usePixelLook"), "writes go through houseLookWrites / usePixelLook");
  assert.ok(!/type=["']color["']/.test(look), "never the browser's colour input");
  assert.ok(look.includes("ColorPicker"), "the app's own colour picker");
  assert.ok(look.includes("stashAndClearCustomColors"), "Reset keeps the colours as a preset");
});

let failed = 0;
for (const t of tests) {
  try { await t.fn(); console.log(`ok   ${t.name}`); }
  catch (e) { failed += 1; console.log(`FAIL ${t.name}\n     ${e.message}`); }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
if (failed) process.exit(1);
