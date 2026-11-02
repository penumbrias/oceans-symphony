// The only door between a mod and the person's data.
//
// A mod runs in a sandboxed frame (public/mod-host.html) that cannot reach
// the database at all. Every `symphony.*` call it makes arrives here as a
// message; ModFrame.jsx hands it to handleModCall with the installed mod's
// record. Rules enforced here, whatever the mod's code says:
//   • a mod reads and writes only ModData rows stamped with its own mod_id;
//   • it never writes anything else — no core record can be changed or
//     deleted through this file;
//   • reading core data needs the matching permission the person granted,
//     and returns a small copy with only the fields that permission names;
//   • "data:read" (symphony.appData) hands out read-only copies of only the
//     kinds of records the person ticked on the consent sheet, cleaned by
//     modDataAccess.sanitizeForMod (whispers masked, locked journals locked);
//   • "files:save" never saves on its own: the app asks the person first.

import { localEntities } from "@/api/base44Client";
import { isReadableEntity, sanitizeForMod } from "@/lib/mods/modDataAccess";

const COLLECTION_RE = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/;
const FIELD_RE = /^[A-Za-z][A-Za-z0-9_]{0,59}$/;
const RESERVED_FIELDS = new Set(["id", "mod_id", "collection", "created_date", "updated_date", "created_by"]);
const MAX_FIELDS = 100;
const MAX_RECORD_BYTES = 256 * 1024;

export class ModCallError extends Error {
  constructor(message) { super(message); this.name = "ModCallError"; }
}

function checkCollection(c) {
  if (typeof c !== "string" || !COLLECTION_RE.test(c)) {
    throw new ModCallError("Collection names are letters, numbers, - and _ (up to 40), starting with a letter.");
  }
  return c;
}

// A mod's fields, cleaned: plain JSON only, no keys the app uses itself.
function cleanFields(fields) {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    throw new ModCallError("Records must be plain objects.");
  }
  const keys = Object.keys(fields);
  if (keys.length > MAX_FIELDS) throw new ModCallError(`A record can have at most ${MAX_FIELDS} fields.`);
  const out = {};
  for (const k of keys) {
    if (RESERVED_FIELDS.has(k)) continue;
    if (!FIELD_RE.test(k)) throw new ModCallError(`"${k}" isn't a valid field name (letters, numbers and _, starting with a letter).`);
    out[k] = fields[k];
  }
  let json;
  try { json = JSON.stringify(out); } catch { throw new ModCallError("Records must be plain JSON data."); }
  if (json.length > MAX_RECORD_BYTES) throw new ModCallError("That record is too big (over 256 KB).");
  return JSON.parse(json);
}

// What the mod sees of its own row: its fields plus id and dates.
function toModRecord(row) {
  const out = { id: row.id, created_date: row.created_date, updated_date: row.updated_date };
  for (const [k, v] of Object.entries(row)) {
    if (RESERVED_FIELDS.has(k) || k.startsWith("_")) continue;
    out[k] = v;
  }
  return out;
}

async function ownRow(mod, collection, id) {
  if (typeof id !== "string" || !id) throw new ModCallError("Missing record id.");
  const row = await localEntities.ModData.get(id);
  if (!row || row.mod_id !== mod.mod_id || row.collection !== collection) {
    throw new ModCallError("No such record.");
  }
  return row;
}

function requirePermission(mod, perm) {
  if (!(mod.granted_permissions || []).includes(perm)) {
    throw new ModCallError(`This mod wasn't given "${perm}". It can be turned on in the Mods page.`);
  }
}

const APPDATA_PAGE_MAX = 500;
const APPDATA_MAX_BYTES = 4 * 1024 * 1024;
const MAX_SAVE_BYTES = 100 * 1024 * 1024;

// Every appData call re-checks: switching the mod off or taking access away
// on its card stops reads at once.
function allowedScopes(mod) {
  requirePermission(mod, "data:read");
  return (mod.data_scopes || []).filter(isReadableEntity);
}

// "Last read your records" on the mod's card. At most one write a minute.
const lastNoted = new Map();
function noteDataRead(mod) {
  const now = Date.now();
  if (now - (lastNoted.get(mod.id) || 0) < 60000) return;
  lastNoted.set(mod.id, now);
  localEntities.ModPackage.update(mod.id, { data_last_read_at: new Date(now).toISOString() }).catch(() => {});
}

const fmtBytes = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} bytes`);

const HANDLERS = {
  async "appData.collections"(mod) {
    return allowedScopes(mod);
  },
  async "appData.list"(mod, [entity, opts]) {
    if (typeof entity !== "string") throw new ModCallError("Say which records to read.");
    if (!allowedScopes(mod).includes(entity)) {
      throw new ModCallError(`This mod wasn't allowed to read "${entity.slice(0, 40)}".`);
    }
    const o = opts && typeof opts === "object" ? opts : {};
    const offset = Math.max(0, Math.floor(Number(o.offset) || 0));
    const limit = Math.min(APPDATA_PAGE_MAX, Math.max(1, Math.floor(Number(o.limit) || 100)));
    const rows = await localEntities[entity].list();
    const page = rows.slice(offset, offset + limit).map((r) => sanitizeForMod(entity, r));
    let json;
    try { json = JSON.stringify(page); } catch { throw new ModCallError("Those records couldn't be read."); }
    if (json.length > APPDATA_MAX_BYTES) throw new ModCallError("That page is too big. Ask for fewer records at a time.");
    noteDataRead(mod);
    return { total: rows.length, offset, records: JSON.parse(json) };
  },
  async "data.list"(mod, [collection, where]) {
    checkCollection(collection);
    const rows = await localEntities.ModData.filter({ mod_id: mod.mod_id, collection }, "created_date");
    let out = rows.map(toModRecord);
    if (where && typeof where === "object") {
      const pairs = Object.entries(where).filter(([k]) => !RESERVED_FIELDS.has(k) || k === "id");
      out = out.filter((r) => pairs.every(([k, v]) => r[k] === v));
    }
    return out;
  },
  async "data.get"(mod, [collection, id]) {
    checkCollection(collection);
    try { return toModRecord(await ownRow(mod, collection, id)); } catch { return null; }
  },
  async "data.create"(mod, [collection, fields]) {
    checkCollection(collection);
    const row = await localEntities.ModData.create({ ...cleanFields(fields), mod_id: mod.mod_id, collection });
    return toModRecord(row);
  },
  async "data.update"(mod, [collection, id, fields]) {
    checkCollection(collection);
    await ownRow(mod, collection, id);
    const row = await localEntities.ModData.update(id, cleanFields(fields));
    return toModRecord(row);
  },
  async "data.remove"(mod, [collection, id]) {
    checkCollection(collection);
    await ownRow(mod, collection, id);
    // A normal delete: Recent changes keeps a copy the person can restore.
    await localEntities.ModData.delete(id);
    return true;
  },
  async "alters.list"(mod) {
    requirePermission(mod, "alters:read");
    const alters = await localEntities.Alter.list();
    return alters.map((a) => ({
      id: a.id,
      name: a.name || "",
      alias: a.alias || "",
      pronouns: a.pronouns || "",
      role: a.role || "",
      color: a.color || "",
      archived: !!a.is_archived,
    }));
  },
  async "fronting.current"(mod) {
    requirePermission(mod, "fronting:read");
    const sessions = await localEntities.FrontingSession.filter({ is_active: true });
    return sessions
      .filter((s) => !s.end_time && (s.alter_id || s.primary_alter_id))
      .map((s) => ({
        alter_id: s.alter_id || s.primary_alter_id,
        is_primary: !!s.is_primary || (!s.alter_id && !!s.primary_alter_id),
        since: s.start_time || null,
      }));
  },
};

// `ui.*` calls need the screen, so ModFrame passes them in as `ui`.
export async function handleModCall(mod, method, args, ui) {
  if (!mod || !mod.enabled) throw new ModCallError("This mod is turned off.");
  const a = Array.isArray(args) ? args : [];
  if (method === "ui.toast") { ui?.toast?.(String(a[0] || "").slice(0, 200)); return true; }
  if (method === "ui.confirm") {
    // The app's own dialog: sandboxed frames can't open confirm() themselves.
    const opts = a[2] && typeof a[2] === "object" ? a[2] : {};
    return !!(await ui?.confirm?.({
      title: String(a[0] || "Are you sure?").slice(0, 120),
      body: String(a[1] || "").slice(0, 600),
      confirmLabel: String(opts.confirmLabel || "OK").slice(0, 40),
      destructive: !!opts.destructive,
    }));
  }
  if (method === "ui.openPage") {
    const page = (mod.pages || []).find((p) => p.id === a[0]);
    if (!page) throw new ModCallError("This mod has no such page.");
    ui?.openPage?.(page.id);
    return true;
  }
  if (method === "ui.saveFile") {
    requirePermission(mod, "files:save");
    const name = String(a[0] || "file").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 120) || "file";
    if (typeof Blob === "undefined" || !(a[1] instanceof Blob)) throw new ModCallError("saveFile needs file data (a Blob).");
    if (a[1].size > MAX_SAVE_BYTES) throw new ModCallError("That file is too big to save (over 100 MB).");
    // Never silent: the person sees who wants to save what, every time.
    const ok = await ui?.confirm?.({
      title: `Save a file from ${String(mod.name || "this mod").slice(0, 60)}?`,
      body: `It wants to save "${name}" (${fmtBytes(a[1].size)}) to your device. Only say yes if you asked it to.`,
      confirmLabel: "Save",
    });
    if (!ok) return "cancelled";
    const mime = String(a[2] || "").slice(0, 100);
    return (await ui?.saveFile?.(name, mime ? new Blob([a[1]], { type: mime }) : a[1])) || "failed";
  }
  const handler = Object.prototype.hasOwnProperty.call(HANDLERS, method) ? HANDLERS[method] : null;
  if (!handler) throw new ModCallError(`Unknown call "${method}".`);
  return handler(mod, a);
}
