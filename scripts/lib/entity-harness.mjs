// A test harness for the lib write paths (docs/house/write-paths.md).
//
// Loads the REAL entity proxy (src/lib/localDb.js) over an in-memory
// preview database, so a test exercises the same create / update / trash /
// restore code the app runs: `_ft` stamps, trash batches and all. Nothing
// touches IndexedDB or disk (preview mode is memory-only by design).
//
//   import { setupEntities } from "./lib/entity-harness.mjs";
//   const h = await setupEntities({ stubs: { "@/lib/logCommands": "export ..." } });
//   const { createJournalEntry } = await import("../src/lib/journalEntry.js");
//
// `stubs` replaces modules a writer imports but a test doesn't need
// (React components, UI dialogs). Keys are the import specifiers.

import { register } from "node:module";
import { pathToFileURL } from "node:url";

let registered = false;

export async function setupEntities({ stubs = {} } = {}) {
  if (!registered) {
    registered = true;
    const src = pathToFileURL(new URL("../../src/", import.meta.url).pathname).href;
    const STUBS = {
      "@/components/shared/ConfirmDialog": "export const confirm = async () => true; export default {};",
      "sonner": "export const toast = Object.assign(() => {}, { success() {}, error() {}, info() {}, warning() {} });",
      ...stubs,
    };
    register(`data:text/javascript,${encodeURIComponent(`
      const STUBS = ${JSON.stringify(STUBS)};
      const SRC = ${JSON.stringify(src)};
      export async function resolve(spec, ctx, next) {
        if (STUBS[spec]) return { url: "data:text/javascript," + encodeURIComponent(STUBS[spec]), shortCircuit: true };
        if (spec.startsWith("@/")) {
          const base = SRC + spec.slice(2);
          if (/\\.[a-z]+$/.test(base)) return next(base, ctx);
          try { return await next(base + ".js", ctx); } catch { return next(base + ".jsx", ctx); }
        }
        if (spec.startsWith(".") && ctx.parentURL?.startsWith(SRC) && !/\\.[a-z]+$/.test(spec)) {
          try { return await next(spec + ".js", ctx); } catch { /* fall through */ }
        }
        return next(spec, ctx);
      }
    `)}`);
    const store = new Map();
    globalThis.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear(),
    };
    if (!globalThis.window) globalThis.window = globalThis;
    if (!globalThis.addEventListener) globalThis.addEventListener = () => {};
    if (!globalThis.removeEventListener) globalThis.removeEventListener = () => {};
    if (!globalThis.dispatchEvent) globalThis.dispatchEvent = () => true;
    if (!globalThis.Event) globalThis.Event = class { constructor(t) { this.type = t; } };
    if (!globalThis.CustomEvent) globalThis.CustomEvent = class { constructor(t, o) { this.type = t; this.detail = o?.detail; } };
  }
  const db = await import("../../src/lib/localDb.js");
  db.setPreviewDb({});
  const { localEntities } = await import("../../src/api/base44Client.js");
  return {
    db,
    E: localEntities,
    reset: () => db.setPreviewDb({}),
    // The raw row as stored, trashed or not (the proxy hides trashed rows).
    raw: (entity, id) => db.getFullDbDump()?.[entity]?.[id] || null,
    rows: (entity) => Object.values(db.getFullDbDump()?.[entity] || {}),
    // What a test sees as "the fields the app wrote": the bookkeeping the
    // proxy adds is taken out so a record can be compared with the old
    // page's payload.
    written: (rec) => {
      if (!rec) return rec;
      const { id: _i, created_date: _c, updated_date: _u, created_by: _b, _ft: _f, ...rest } = rec;
      return rest;
    },
  };
}

// The tiny runner every write-path test uses.
export function runner() {
  const tests = [];
  let passed = 0;
  return {
    test: (name, fn) => tests.push([name, fn]),
    async run() {
      for (const [name, fn] of tests) {
        try { await fn(); passed++; console.log(`ok  ${name}`); }
        catch (e) { console.error(`FAIL ${name}\n  ${e?.stack || e}`); process.exitCode = 1; }
      }
      console.log(`${passed}/${tests.length} passed`);
    },
  };
}
