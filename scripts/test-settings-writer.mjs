#!/usr/bin/env node
// The one settings writer (src/lib/settingsWriter.js): fresh read, key-by-key
// merge, one queue, never a second settings row, boards never blanked.
//
//   node scripts/test-settings-writer.mjs

import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

const src = pathToFileURL(new URL("../src/", import.meta.url).pathname).href;
register(`data:text/javascript,${encodeURIComponent(`
  // An in-memory SystemSettings table stands in for IndexedDB. Reads and
  // writes take a tick each, like the real proxy, so races can happen.
  const STUBS = {
    "@/api/base44Client": \`
      const tick = () => new Promise((r) => setTimeout(r, 1));
      const rows = globalThis.__rows = new Map();
      globalThis.__creates = 0;
      let n = 0;
      const copy = (v) => JSON.parse(JSON.stringify(v));
      const SystemSettings = {
        async list() { await tick(); return [...rows.values()].map(copy); },
        async get(id) { await tick(); return rows.has(id) ? copy(rows.get(id)) : null; },
        async update(id, patch) {
          await tick();
          const cur = rows.get(id);
          if (!cur) throw new Error("no row " + id);
          const ft = { ...(cur._ft || {}) };
          for (const k of Object.keys(patch)) ft[k] = Date.now();
          rows.set(id, { ...cur, ...copy(patch), _ft: ft });
          return copy(rows.get(id));
        },
        async create(data) {
          await tick();
          globalThis.__creates += 1;
          const id = "s" + (++n);
          rows.set(id, { id, ...copy(data) });
          return copy(rows.get(id));
        },
      };
      export const localEntities = { SystemSettings };
      export const base44 = { entities: localEntities };
    \`,
    "@/lib/query-client": "export const queryClientInstance = { invalidateQueries: (q) => { globalThis.__invalidated = (globalThis.__invalidated || 0) + 1; } };",
  };
  export async function resolve(spec, ctx, next) {
    if (STUBS[spec]) return { url: "data:text/javascript," + encodeURIComponent(STUBS[spec]), shortCircuit: true };
    if (spec.startsWith("@/")) {
      let url = ${JSON.stringify(src)} + spec.slice(2);
      if (!/\\.[a-z]+$/.test(url)) url += ".js";
      return next(url, ctx);
    }
    return next(spec, ctx);
  }
`)}`);

const W = await import("../src/lib/settingsWriter.js");
const { localEntities } = await import("@/api/base44Client");
const rows = globalThis.__rows;
const reset = (seed) => { rows.clear(); globalThis.__creates = 0; for (const r of seed || []) rows.set(r.id, structuredClone(r)); };
const row = (id = "main") => rows.get(id);

let passed = 0;
const test = async (name, fn) => { await fn(); passed += 1; console.log(`ok  ${name}`); };

await test("pure merge: only patched sub-keys change, unknown sub-keys kept", () => {
  const fresh = { ui_v2: { a: 1, future: { x: 1 } }, ui_pixel: { corners: 2 } };
  const out = W.mergeSettingsPatch(fresh, { ui_v2: { b: 2, a: undefined }, corner_mode: "sharp" });
  assert.deepEqual(out, { ui_v2: { future: { x: 1 }, b: 2 }, corner_mode: "sharp" });
  assert.deepEqual(fresh.ui_v2, { a: 1, future: { x: 1 } }, "input untouched");
  assert.deepEqual(W.mergeSettingsPatch(fresh, { ui_pixel: { bevel: 1 } }, { replace: ["ui_pixel"] }), { ui_pixel: { bevel: 1 } });
  // A non-merge field is replaced whole, as update always did.
  assert.deepEqual(W.mergeSettingsPatch({ terms: { a: 1 } }, { terms: { b: 2 } }), { terms: { b: 2 } });
});

await test("two rapid look changes both stick", async () => {
  reset([{ id: "main", system_name: "Us", ui_v2: { density: "cozy" }, ui_pixel: {} }]);
  await Promise.all([
    W.writeSettings({ ui_v2: { dockPos: { side: "left" } } }),
    W.writeSettings({ ui_v2: { activeDockPos: { side: "right", topPct: 40 } } }),
    W.writeLookField("ui_pixel", { corners: 4 }),
    W.writeLookField("ui_pixel", { bevel: 2 }),
  ]);
  assert.deepEqual(row().ui_v2, { density: "cozy", dockPos: { side: "left" }, activeDockPos: { side: "right", topPct: 40 } });
  assert.deepEqual(row().ui_pixel, { corners: 4, bevel: 2 });
  assert.ok(row()._ft.ui_v2 && row()._ft.ui_pixel, "written through the proxy (field times stamped)");
  assert.ok(globalThis.__invalidated >= 4, "[systemSettings] invalidated");
});

await test("the old direct pattern loses a change (why the writer exists)", async () => {
  reset([{ id: "main", ui_v2: {} }]);
  const cached = structuredClone(row());
  await Promise.all([
    localEntities.SystemSettings.update("main", { ui_v2: { ...cached.ui_v2, a: 1 } }),
    localEntities.SystemSettings.update("main", { ui_v2: { ...cached.ui_v2, b: 2 } }),
  ]);
  assert.deepEqual(row().ui_v2, { b: 2 }, "the first change was undone");
});

await test("a stale-cache caller doesn't clobber a newer field", async () => {
  reset([{ id: "main", ui_v2: { commandKeys: ["a"] }, ui_pixel: { corners: 0 } }]);
  const stale = structuredClone(row());
  await W.writeSettings({ ui_v2: { commandKeys: ["a", "b"] } });   // newer change elsewhere
  await W.writeLookField("ui_pixel", { corners: 6 });
  // The stale caller only says what it changes.
  await W.writeSettings({ ui_v2: { homeDefault: stale.ui_v2.homeDefault === "board" ? "classic" : "board" } });
  assert.deepEqual(row().ui_v2, { commandKeys: ["a", "b"], homeDefault: "board" });
  assert.equal(row().ui_pixel.corners, 6);
  // Function form computes from the fresh row inside the queue.
  await W.writeSettings((fresh) => ({ ui_v2: { ...fresh.ui_v2, altersBar: { enabled: true } } }));
  assert.deepEqual(row().ui_v2.commandKeys, ["a", "b"]);
  assert.equal(row().ui_v2.altersBar.enabled, true);
});

await test("singleton: writes the real row, never creates a second", async () => {
  // A boot stub sits beside the real row; the writer picks the real one.
  reset([{ id: "stub" }, { id: "main", system_name: "Us" }]);
  await W.writeSettings({ corner_mode: "sharp" });
  assert.equal(row("main").corner_mode, "sharp");
  assert.equal(row("stub").corner_mode, undefined);
  // create:true with a row present updates, never creates.
  await Promise.all([1, 2, 3].map((i) => W.writeSettings({ board_snap: i === 3 ? false : true }, { create: true })));
  assert.equal(globalThis.__creates, 0);
  assert.equal(row("main").board_snap, false);
  // No row at all: without create nothing is written; with create, exactly one row even when racing.
  reset([]);
  assert.equal(await W.writeSettings({ corner_mode: "sharp" }), null);
  assert.equal(rows.size, 0);
  await Promise.all([
    W.writeSettings({ ui_v2: { homeDefault: "board" } }, { create: true }),
    W.writeSettings({ front_button_icon: { iconName: "star" } }, { create: true }),
  ]);
  assert.equal(rows.size, 1);
  assert.equal(globalThis.__creates, 1);
  const only = [...rows.values()][0];
  assert.equal(only.ui_v2.homeDefault, "board");
  assert.deepEqual(only.front_button_icon, { iconName: "star" });
});

await test("boards: stamped through boardWriter and never blanked", async () => {
  const board = { pages: [{ id: "p1", widgets: [] }] };
  reset([{ id: "main", system_name: "Us", classic_home: board }]);
  await W.writeSettings({ classic_home: null, ui_v2: { x: 1 } });
  assert.deepEqual(row().classic_home, board, "a null board is never written");
  assert.equal(row().ui_v2.x, 1);
  await W.writeSettings({ classic_home: { ...board, background: { type: "flat" }, _seeded: true } });
  assert.equal(row().classic_home._seeded, undefined);
  assert.ok(row().classic_home._lt, "a look change on the board is stamped");
});

await test("a failing write rejects for its caller and doesn't jam the queue", async () => {
  reset([{ id: "main", system_name: "Us" }]);
  await assert.rejects(W.writeSettings(() => { throw new Error("boom"); }));
  await W.writeSettings({ corner_mode: "rounded" });
  assert.equal(row().corner_mode, "rounded");
});

console.log(`settings writer: ${passed} tests passed`);
