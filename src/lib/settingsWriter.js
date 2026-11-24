// One writer for the SystemSettings row (new house step 0.4, v0.381).
//
// SystemSettings used to be written straight from ~46 UI files, many of them
// spreading a CACHED copy of a nested field (`{ ...settingsRow.ui_v2, x }`).
// Two quick changes then undid each other: the second write carried the
// first one's stale picture of ui_v2 and put the old value back. Some of
// them also called `SystemSettings.create` when their cached row was empty,
// which could leave a second settings row beside the real one.
//
// writeSettings(change, opts) fixes both:
//   - it reads the row FRESH (pickPrimarySystemSettings — never `[0]`);
//   - writes are serialised through one queue, so each sees the last;
//   - an object patch merges key by key: for the nested look fields in
//     MERGE_FIELDS (ui_v2, ui_pixel, theme…), only the sub-keys in the
//     patch change and every other sub-key (including ones this version
//     doesn't know) is kept. A sub-key set to `undefined` is removed.
//     Every other top-level field is replaced, as `update` always did;
//   - a FUNCTION patch, `(fresh) => patch`, is called with the fresh row
//     inside the queue. It computed from the truth, so what it returns is
//     written as is (whole field values — return the full nested object);
//   - it never creates a second row: `create: true` creates ONLY when the
//     database holds no settings row at all, checked inside the queue;
//   - board fields (classic_home / ui_v2_home) go through boardWriter's
//     rules: stamped as a person's edit and never blanked;
//   - it writes through the entity proxy, so `_ft` field times and sync
//     work as before, then invalidates ["systemSettings"].
//
// It changes no stored shape: the same fields get the same values a correct
// direct write would have given them.

import { localEntities } from "@/api/base44Client";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";
import { BOARD_SETTINGS_FIELDS, writeSettingsWithBoards } from "@/lib/boardWriter";
import { stampBoardChanges } from "@/lib/boardStamp";
import { queryClientInstance } from "@/lib/query-client";

// Nested settings objects whose callers patch single sub-keys.
export const MERGE_FIELDS = [
  "ui_v2",
  "ui_pixel",
  "theme",
  "pinned_alters_config",
  "page_looks",
  "notification_prefs",
];
const MERGE = new Set(MERGE_FIELDS);

const isPlainObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);

// Pure: the patch that will be written, given the fresh row. Exported for
// the tests. `replace` lists merge fields the caller wants swapped whole.
export function mergeSettingsPatch(row, patch, { replace = [] } = {}) {
  const out = {};
  if (!isPlainObject(patch)) return out;
  const swap = new Set(replace);
  for (const [field, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (MERGE.has(field) && !swap.has(field) && isPlainObject(value)) {
      const next = isPlainObject(row?.[field]) ? { ...row[field] } : {};
      for (const [k, v] of Object.entries(value)) {
        if (v === undefined) delete next[k];
        else next[k] = v;
      }
      out[field] = next;
    } else {
      out[field] = value;
    }
  }
  return out;
}

// Never blank a board; drop the canvas-only `_seeded` marker.
function boardsSafeForCreate(patch) {
  const out = { ...patch };
  for (const f of BOARD_SETTINGS_FIELDS) {
    if (!(f in out)) continue;
    if (!isPlainObject(out[f])) { delete out[f]; continue; }
    let next = out[f];
    if (next._seeded) { next = { ...next }; delete next._seeded; }
    out[f] = stampBoardChanges(null, next);
  }
  return out;
}

let chain = Promise.resolve();
function enqueue(fn) {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}

// Wait for every queued write (tests, and anything that must read after).
export function settingsWritesSettled() {
  return chain;
}

async function doWrite(change, { create = false, replace = [], invalidate = true, queryClient = null } = {}) {
  const Entity = localEntities.SystemSettings;
  const fresh = pickPrimarySystemSettings(await Entity.list());
  const isFn = typeof change === "function";
  const raw = isFn ? change(fresh || {}) : change;
  if (!isPlainObject(raw)) return null;
  const out = isFn
    ? Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined))
    : mergeSettingsPatch(fresh, raw, { replace });
  if (!Object.keys(out).length) return null;

  let id = fresh?.id || null;
  if (!id) {
    // Only when there is truly no row. A stale-cache caller that thought
    // the row was missing lands in the branch above and updates it.
    if (!create) return null;
    const safe = boardsSafeForCreate(out);
    if (!Object.keys(safe).length) return null;
    const created = await Entity.create(safe);
    id = created?.id || null;
  } else if (BOARD_SETTINGS_FIELDS.some((f) => f in out)) {
    await writeSettingsWithBoards(id, out);
  } else {
    await Entity.update(id, out);
  }
  if (invalidate) {
    try { (queryClient || queryClientInstance).invalidateQueries({ queryKey: ["systemSettings"] }); }
    catch { /* no query client (tests, workers) */ }
  }
  return { id, patch: out };
}

// The one settings writer. Returns `{ id, patch }`, or null when nothing
// was written (empty patch, or no row and `create` not asked for). Throws
// what the database throws, so callers can toast.
export function writeSettings(change, opts = {}) {
  return enqueue(() => doWrite(change, opts));
}

// Shorthand for one nested look field: writeLookField("ui_pixel", { corners: 2 }).
export function writeLookField(field, subPatch, opts = {}) {
  return writeSettings({ [field]: subPatch || {} }, opts);
}
