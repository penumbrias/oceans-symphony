#!/usr/bin/env node
// The house's System map room (board 02-SystemMap, board 11-SystemMapPhone):
// what the address means (?view=, the map/layer/solo landing), how the room
// words what's on the map (status line, canvas line, Viewing chip,
// relationships), the tools' keys, the overview's sums, and that the room is
// drawn only on /system-map, the old page is gated, both frames mount it,
// the phone runs it edge to edge with its tools in the bottom bar, it writes
// only through the inner world's write paths (the one canvas,
// InnerWorldMapV2 → useInnerWorld → innerWorldModel), and its classes don't
// clash with the kit's or another room's. Pure: nothing is written anywhere.
//
//   node scripts/test-house-map.mjs

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const M = await import("../src/house/map/mapModel.js");
const S = await import("../src/lib/houseSwitch.js");

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test("the address: ?view= old and new, Accessibility mode, the links back", () => {
  assert.equal(M.mapViewOf("?view=inner"), "inner");
  assert.equal(M.mapViewOf("?view=canvas"), "inner");
  assert.equal(M.mapViewOf("?view=analytics"), "together", "the old page's analytics map is Who fronts together");
  assert.equal(M.mapViewOf("?view=together"), "together");
  assert.equal(M.mapViewOf("?view=list"), "list");
  assert.equal(M.mapViewOf(""), "inner", "board 02 opens on the inner world");
  assert.equal(M.mapViewOf("", { a11y: true }), "list", "Accessibility mode opens on the text list");
  assert.equal(M.mapViewOf("?view=inner", { a11y: true }), "inner", "an asked-for view wins");
  assert.equal(M.mapViewOf("?view=zzz"), "inner");
  assert.equal(M.mapViewOf(null), "inner");
  for (const v of M.MAP_VIEWS) assert.equal(M.mapViewOf(M.mapViewHref(v).slice("/system-map".length)), v, `${v} round-trips`);
});

test("deep links: which map and layer, alone or not", () => {
  assert.deepEqual(M.mapLanding("?view=inner&map=m1&layer=l2&solo=1"), { mapId: "m1", layerId: "l2", solo: true });
  assert.deepEqual(M.mapLanding("?view=inner"), { mapId: null, layerId: null, solo: false });
  assert.deepEqual(M.mapLanding("?layer=l2&solo=0"), { mapId: null, layerId: "l2", solo: false });
});

test("board 02's words: status line, zoom, canvas line, Viewing chip", () => {
  const s = M.statusWords({ mapName: "Inner World", layerName: "Ground floor", cursor: { x: 12.4, y: 99.6 }, placed: 3, total: 7, rels: 1, viewOnly: true, scale: 1.25, snap: true, snapPx: 20 });
  assert.deepEqual(s.left, ["Inner World / Ground floor", "x 12 y 100", "3 of 7 placed", "1 relationship line", "Viewing only"]);
  assert.deepEqual(s.right, ["Zoom 125%", "Snap to 20 px"]);
  const e = M.statusWords({ placed: 0, total: 0, rels: 2, scale: "x", snap: false });
  assert.deepEqual(e.left, ["Map / No layer", "0 of 0 placed", "2 relationship lines"]);
  assert.deepEqual(e.right, ["Zoom 100%", "Snap off"]);
  const terms = { alter: "part" };
  assert.deepEqual(M.canvasLine({ tool: "place", placingName: "Ash", layerName: "Garden" }), { kind: "tool", text: "Tap the map where Ash goes on Garden." });
  assert.equal(M.canvasLine({ tool: "link", linkFromName: "Ash", terms }).text, "Tap the part to link with Ash.", "the person's word for alter");
  assert.equal(M.canvasLine({ tool: "link", terms }).text, "Link: tap the first part.");
  assert.equal(M.canvasLine({ soloName: "Garden" }).kind, "solo");
  assert.equal(M.canvasLine({ backdropCount: 2, backdropLocked: true, layerName: "Garden" }).text, "Backdrop: 2 pictures on Garden (locked)");
  assert.equal(M.canvasLine({}), null);
  assert.deepEqual(M.viewingWords({ layers: [{ name: "Ground floor", is_visible: true }, { name: "Attic", is_visible: false }, { name: "Garden", is_visible: true }] }), { lead: "Viewing", names: "Ground floor, Garden" });
  assert.deepEqual(M.viewingWords({ layers: [], soloName: "Attic" }), { lead: "Only", names: "Attic" });
  assert.equal(M.viewingWords({ layers: [] }).names, "no layers");
  assert.equal(M.relModeWords("selected"), "the picked one's");
  assert.equal(M.relModeWords("none"), "hidden");
  assert.equal(M.relModeWords("all"), "all");
});

test("relationships in words, with direction and custom labels", () => {
  const names = { a: "Ash", b: "River" };
  const nameOf = (id) => names[id];
  assert.equal(M.relationshipWords({ alter_id_a: "a", alter_id_b: "b", relationship_type: "Protects" }, nameOf), "Ash → River (Protects)");
  assert.equal(M.relationshipWords({ alter_id_a: "a", alter_id_b: "b", direction: "b_to_a", relationship_type: "Protects" }, nameOf), "River → Ash (Protects)");
  assert.equal(M.relationshipWords({ alter_id_a: "a", alter_id_b: "b", direction: "bidirectional", relationship_type: "Custom", custom_label: "Twins" }, nameOf), "Ash ↔ River (Twins)");
  assert.equal(M.relationshipWords({ alter_id_a: "a", alter_id_b: "zz" }, nameOf), "Ash → ? (Related)");
  assert.equal(M.relationshipWords(null), "");
});

test("the tools' keys: plain keys only, never while typing or in a dialog", () => {
  const el = (tag, extra = {}) => ({ tagName: tag, closest: () => null, ...extra });
  assert.equal(M.mapKeyAction({ key: "p", target: el("DIV") }), "place");
  assert.equal(M.mapKeyAction({ key: "V", target: el("DIV") }), "move", "case doesn't matter");
  assert.equal(M.mapKeyAction({ key: "Escape", target: el("DIV") }), "cancel");
  assert.equal(M.mapKeyAction({ key: "=", target: el("DIV") }), "zoomIn");
  assert.equal(M.mapKeyAction({ key: "k", ctrlKey: true, target: el("DIV") }), null, "Ctrl+K is Search");
  assert.equal(M.mapKeyAction({ key: "p", metaKey: true, target: el("DIV") }), null);
  assert.equal(M.mapKeyAction({ key: "p", target: el("INPUT") }), null);
  assert.equal(M.mapKeyAction({ key: "p", target: el("TEXTAREA") }), null);
  assert.equal(M.mapKeyAction({ key: "p", target: el("DIV", { isContentEditable: true }) }), null);
  assert.equal(M.mapKeyAction({ key: "p", target: el("DIV", { closest: () => ({}) }) }), null, "a dialog or menu keeps its keys");
  assert.equal(M.mapKeyAction({ key: "q", target: el("DIV") }), null);
  assert.equal(M.mapKeyAction(null), null);
});

test("the overview fits everything shown and the screen's frame, and clicks back to the world", () => {
  const g = M.overviewGeometry({
    locations: [{ x: 0, y: 0, width: 400, height: 200, layer_id: "L1" }, { x: 5000, y: 5000, width: 10, height: 10, layer_id: "hidden" }],
    placements: [{ x: 100, y: 100, alter_id: "a", layer_id: "L1" }, { x: 9, y: 9, alter_id: "gone", layer_id: "L1" }],
    shownLayerIds: new Set(["L1"]),
    colourOf: (id) => (id === "a" ? "#ff0000" : undefined),
    transform: { x: 0, y: 0, scale: 1 }, canvas: { w: 400, h: 200 }, W: 160, H: 80,
  });
  assert.equal(g.boxes.length, 1, "only the shown layer's places");
  assert.equal(g.dots.length, 1, "a placement of someone not on the map isn't drawn");
  assert.equal(g.dots[0].c, "#ff0000");
  assert.ok(g.boxes[0].x >= 0 && g.boxes[0].x + g.boxes[0].w <= 160.001 && g.boxes[0].y + g.boxes[0].h <= 80.001, "fits the box");
  const w = g.toWorld(g.dots[0].x, g.dots[0].y);
  assert.ok(Math.abs(w.x - 100) < 1e-6 && Math.abs(w.y - 100) < 1e-6, "a click maps back to the world");
  const empty = M.overviewGeometry({});
  assert.ok(Number.isFinite(empty.view.w) && empty.boxes.length === 0, "an empty map still draws the screen's frame");
});

test("the map room is drawn by the house only on /system-map; the old page is gated", () => {
  assert.equal(S.houseMapRoom("/system-map"), true);
  assert.equal(S.houseMapRoom("/system-map/"), true);
  assert.ok(!S.houseMapRoom("/system-mapx"));
  assert.ok(!S.houseMapRoom("/location/abc"), "a place's profile stays the old page");
  assert.equal(S.houseRebuiltRoom("/system-map"), true);
  assert.match(read("src/App.jsx"), /path="\/system-map" element=\{<HouseRoomGate><SystemMapPage \/><\/HouseRoomGate>\}/);
});

test("both frames mount the room; the phone runs it edge to edge with its tools in the bar", () => {
  for (const f of ["src/house/frame/HouseFrame.jsx", "src/house/phone/HousePhoneFrame.jsx"]) {
    const t = read(f);
    assert.ok(t.includes("house/map/HouseMap"), `${f} loads the room`);
    assert.ok(/<HouseMap /.test(t), `${f} mounts it`);
  }
  const phone = read("src/house/phone/HousePhoneFrame.jsx");
  assert.ok(/\|\| mapRoom( \|\| analyticsRoom)?( \|\| remindersRoom)?( \|\| friendsRoom)? \? "px-0"/.test(phone), "the phone runs it edge to edge");
  assert.ok(/roomTools = [^;]*mapRoom/.test(phone), "the phone frame reads the room's tools");
  assert.ok(/ownDocks[^;]*mapRoom/.test(read("src/house/frame/HouseFrame.jsx")), "the room draws its own side panels");
  const room = read("src/house/map/HouseMap.jsx");
  assert.ok(room.includes("useRoomTools") && /bar:/.test(room), "board 11's Move · Place · Room · Link · Layers live in the frame's bar");
  for (const w of ["Move", "Place", "Room", "Link", "Layers"]) assert.ok(room.includes(`>${w}</Button>`), `the bar has ${w}`);
  assert.ok(!/position:\s*fixed/.test(read("src/house/map/map.css")), "nothing floats over scrolling content");
});

test("one canvas: the room draws around InnerWorldMapV2, which keeps every write", () => {
  const room = read("src/house/map/HouseMap.jsx");
  assert.ok(/renderHouse=\{/.test(room), "the room hands the canvas its chrome");
  assert.ok(room.includes("useSystemMapData"), "the room and the old page read the same data");
  assert.ok(room.includes("InnerWorldListView") && room.includes("RelationshipsPanel"), "the list and the relationships are the old ones");
  const v2 = read("src/components/systemmap/InnerWorldMapV2.jsx");
  assert.ok(/return renderHouse\(\{/.test(v2), "the canvas hands the room its api");
  assert.ok(v2.includes("useInnerWorld"), "the canvas writes through useInnerWorld");
  assert.ok(read("src/hooks/useInnerWorld.js").includes("innerWorldModel"), "which is the inner world model");
  assert.ok(/export function useSystemMapData/.test(read("src/pages/SystemMap.jsx")), "the old page shares its reads");
});

test("the room writes only through the inner world's write paths", () => {
  const dir = "src/house/map";
  const files = readdirSync(new URL(`../${dir}`, import.meta.url)).filter((f) => /\.jsx?$/.test(f)).map((f) => `${dir}/${f}`);
  assert.ok(files.length >= 2);
  for (const f of files) {
    const text = read(f).replace(/\/\/.*$/gm, "");
    assert.ok(!/\.(create|update|delete|bulkDelete|bulkCreate)\(/.test(text), `${f} writes a record directly`);
    assert.ok(!/localStorage\.(setItem|removeItem)/.test(text), `${f} keeps state in localStorage`);
    assert.ok(!/(localEntities|base44)\b/.test(text), `${f} reaches the entity layer itself`);
    assert.ok(!/innerWorldModel|useInnerWorld/.test(text), `${f} calls the model itself instead of the canvas's api`);
    assert.ok(!/writeSettings\(|writeBoard\(/.test(text), `${f} writes settings itself`);
  }
});

test("hmp- classes are the room's own and the CSS is the room's", () => {
  const dir = new URL("../src/house/", import.meta.url);
  const others = [];
  for (const d of readdirSync(dir)) {
    let fs = []; try { fs = readdirSync(new URL(`${d}/`, dir)); } catch { continue; }
    for (const f of fs) if (f.endsWith(".css") && !(d === "map" && f === "map.css")) others.push(`src/house/${d}/${f}`);
  }
  others.push("src/house/kit/frame/frameKit.css");
  for (const f of others) {
    let t = ""; try { t = read(f); } catch { continue; }
    assert.ok(!/\.hmp-|\.hmp\b/.test(t), `${f} has no hmp- classes`);
  }
  const css = read("src/house/map/map.css");
  assert.ok(!/!important/.test(css));
  assert.ok(!/font-size:\s*\d+px/.test(css), "no px font sizes");
  assert.ok(!/(outline|border|box-shadow)[^;]*\b2px\b/.test(css.replace(/:focus-visible[^}]*}/g, "")), "edges are the thin pixel line, never a hard 2px");
  for (const sel of css.replace(/\/\*[\s\S]*?\*\//g, "").split("}").map((r) => r.split("{")[0]).filter((s) => s.trim() && !s.includes("@media"))) {
    for (const part of sel.split(/,(?![^(]*\))/)) assert.ok(/\.hmp[-\s.[:]|\.hmp$|\.hmp\b/.test(part), `"${part.trim()}" styles something outside the room`);
  }
  assert.ok(read("src/house/map/HouseMap.jsx").includes("map/map.css"), "the room imports its CSS (the phone needs it)");
  assert.ok(/\[data-house\]\.hmp \{[^}]*background: var\(--house-page\)/.test(css), "the room paints the page");
  assert.ok(/\.hmp-phonecol \{[^}]*padding: [^;]*var\(--house-space-2/.test(css), "the phone keeps the slim gutter");
});

test("tour anchors the room adds have steps", () => {
  const tour = read("src/components/onboarding/FeatureTour.jsx");
  const room = read("src/house/map/HouseMap.jsx");
  for (const a of ["system-map-views", "system-map-maps", "system-map-tools", "system-map-layers", "system-map-info"]) {
    assert.ok(room.includes(`data-tour="${a}"`), `the room has ${a}`);
    assert.ok(tour.includes(`"${a}"`), `the tour has a step for ${a}`);
  }
  assert.ok(room.includes('data-tour="system-map-canvas"'), "the room keeps the old anchor system-map-canvas");
});

let failed = 0;
for (const t of tests) {
  try { await t.fn(); console.log(`ok   ${t.name}`); }
  catch (e) { failed += 1; console.log(`FAIL ${t.name}\n     ${e.message}`); }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
if (failed) process.exit(1);
