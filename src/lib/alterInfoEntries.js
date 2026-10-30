// An alter's info as a list of entries (v0.295.0) — what a widget can show.
//
// The Alter info list (AlterInfo.jsx) is where information is entered; a
// widget picks entries from it by id and shows them. Editing an entry from a
// widget writes the alter's record here, on a fresh read, and changes only
// that one entry — so a widget and the list (or another device) never
// overwrite each other.
//
// Entry ids (stable, stored in widget settings):
//   bio                 the bio (description)
//   basic:<key>         name, alias, pronouns, role, first appearance
//   field:<CustomField id>   a field every alter has
//   own:<name>          one of this alter's own fields (alter_custom_fields)

import { base44 } from "@/api/base44Client";
import { extractYear, firstAppearanceOf, patchAlterCustomFields } from "@/lib/alterEntry";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";

export const FIELD_ORDER_KEY = "_field_order";

export const BIO_ENTRY = { id: "bio", label: "Bio", kind: "bio" };
export const BASIC_ENTRIES = [
  { id: "basic:name", key: "name", label: "Name", kind: "text" },
  { id: "basic:alias", key: "alias", label: "Alias", kind: "text" },
  { id: "basic:pronouns", key: "pronouns", label: "Pronouns", kind: "text" },
  { id: "basic:role", key: "role", label: "Role", kind: "text" },
  { id: "basic:birthday", key: "birthday", label: "First appearance", kind: "text" },
];

const legacyMapOf = (alter) => (alter?.alter_custom_fields && typeof alter.alter_custom_fields === "object" && !Array.isArray(alter.alter_custom_fields)
  ? alter.alter_custom_fields : {});
const ownListOf = (alter) => (Array.isArray(alter?.alter_custom_fields) ? alter.alter_custom_fields : []);

export function orderedSystemFields(alter, systemFields = []) {
  const order = alter?.custom_fields?.[FIELD_ORDER_KEY];
  if (!Array.isArray(order)) return systemFields;
  const at = Object.fromEntries(order.map((id, i) => [id, i]));
  return [...systemFields].sort((a, b) => (at[a.id] ?? 9999) - (at[b.id] ?? 9999));
}

// Every entry this alter has, in the Alter info list's order.
export function infoEntriesFor(alter, systemFields = []) {
  if (!alter) return [];
  const seen = new Set();
  const own = ownListOf(alter)
    .filter((f) => f && f.name && !seen.has(f.name) && seen.add(f.name))
    .map((f) => ({ id: `own:${f.name}`, label: f.name, kind: f.field_type || "text", own: true, ...(f.page ? { page: true } : {}) }));
  return [
    BIO_ENTRY,
    ...BASIC_ENTRIES,
    ...orderedSystemFields(alter, systemFields).map((f) => ({ id: `field:${f.id}`, label: f.name, kind: f.field_type || "text", fieldId: f.id })),
    ...own,
  ];
}

export function entryById(alter, systemFields, id) {
  return infoEntriesFor(alter, systemFields).find((e) => e.id === id) || null;
}

export function entryValue(alter, entryId) {
  if (!alter || !entryId) return "";
  if (entryId === "bio") return alter.description || "";
  if (entryId.startsWith("basic:")) {
    const key = entryId.slice(6);
    if (key === "birthday") return firstAppearanceOf(alter).birthday || "";
    return alter[key] || "";
  }
  if (entryId.startsWith("field:")) {
    const id = entryId.slice(6);
    return alter.custom_fields?.[id] ?? legacyMapOf(alter)[id] ?? "";
  }
  if (entryId.startsWith("own:")) {
    const name = entryId.slice(4);
    return ownListOf(alter).find((f) => f?.name === name)?.value ?? "";
  }
  return "";
}

// Write one entry's value onto the stored alter.
export async function writeEntry(alterId, entryId, value) {
  if (!alterId || !entryId) return null;
  if (entryId.startsWith("field:")) return patchAlterCustomFields(alterId, { [entryId.slice(6)]: value });
  if (entryId === "bio") return base44.entities.Alter.update(alterId, { description: value ?? "" });
  if (entryId.startsWith("basic:")) {
    const key = entryId.slice(6);
    if (!BASIC_ENTRIES.some((b) => b.key === key)) return null;
    if (key === "name" && !String(value || "").trim()) throw new Error("A name can't be empty");
    const patch = { [key]: value ?? "" };
    if (key === "birthday") {
      const year = extractYear(value || "");
      patch.origin_year = year ? parseInt(year, 10) : null;
    }
    return base44.entities.Alter.update(alterId, patch);
  }
  if (entryId.startsWith("own:")) {
    const name = entryId.slice(4);
    const fresh = (await base44.entities.Alter.get(alterId)) || {};
    if (fresh.alter_custom_fields && !Array.isArray(fresh.alter_custom_fields)) throw new Error("This custom field can't be saved here");
    const list = [...ownListOf(fresh)];
    const i = list.findIndex((f) => f?.name === name);
    if (i < 0) list.push({ name, value, field_type: "text" });
    else list[i] = { ...list[i], value };
    return base44.entities.Alter.update(alterId, { alter_custom_fields: list });
  }
  return null;
}

// A new entry for just this alter, made from a widget. Returns its id. An
// existing entry with the same name is reused, never duplicated.
//
// `page` (v0.322.0) marks an entry made by a Field widget's "Add a page", so
// "Every other field" leaves it to the widget that shows it as a page; it
// is still listed with the alter's custom fields in Info.
export async function addOwnEntry(alterId, { name, kind = "text", value = "", page = false }) {
  const clean = String(name || "").trim();
  if (!alterId || !clean) throw new Error("The custom field needs a name");
  const fresh = (await base44.entities.Alter.get(alterId)) || {};
  if (fresh.alter_custom_fields && !Array.isArray(fresh.alter_custom_fields)) {
    // Older Get to know me rows keep an id-keyed map here; never write over it.
    throw new Error("This profile has fields from an older version. Add the custom field for everyone instead, so nothing is written over.");
  }
  const list = [...ownListOf(fresh)];
  const same = list.find((f) => sameName(f?.name, clean));
  if (same) return `own:${same.name}`;
  list.push({ name: clean, value, field_type: kind, ...(page ? { page: true } : {}) });
  await base44.entities.Alter.update(alterId, { alter_custom_fields: list });
  return `own:${clean}`;
}

const sameName = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

// A new entry every alter has (a custom field), made from a widget. Returns
// its id. A field with the same name is reused, never duplicated.
export async function addSharedEntry({ name, kind = "text" }) {
  const clean = String(name || "").trim();
  if (!clean) throw new Error("The custom field needs a name");
  const fields = (await base44.entities.CustomField.list("order")) || [];
  const same = fields.find((f) => sameName(f?.name, clean));
  if (same) return `field:${same.id}`;
  const created = await base44.entities.CustomField.create({ name: clean, field_type: kind, order: fields.length });
  return `field:${created.id}`;
}

// ── Managing entries (v0.310.0) ──
// The Alter info list's Entries page manages entries the same ways
// Settings → Alter setup → Entries does, so nobody has to leave the
// profile to rename, hide or remove one. Every write reads fresh.

// Shared entries hidden from profiles: SystemSettings.hidden_field_ids
// (the list the older Info tab's eye toggle has always written). A hidden
// entry keeps its values; it just isn't shown by "Every other field".
export const hiddenEntryIdsOf = (settings) => (Array.isArray(settings?.hidden_field_ids) ? settings.hidden_field_ids : []);

export async function setSharedEntryHidden(fieldId, hidden) {
  const fresh = pickPrimarySystemSettings(await base44.entities.SystemSettings.list());
  const ids = hiddenEntryIdsOf(fresh).filter((id) => id !== fieldId);
  if (hidden) ids.push(fieldId);
  if (fresh?.id) return base44.entities.SystemSettings.update(fresh.id, { hidden_field_ids: ids });
  return base44.entities.SystemSettings.create({ hidden_field_ids: ids });
}

// Rename a shared entry or change its kind, for every alter. Values are
// kept by the field's id, so nothing moves.
export async function updateSharedEntry(fieldId, { name, kind }) {
  const clean = String(name || "").trim();
  if (!fieldId || !clean) throw new Error("The custom field needs a name");
  const fields = (await base44.entities.CustomField.list("order")) || [];
  if (fields.some((f) => f.id !== fieldId && sameName(f?.name, clean))) throw new Error(`There's already a custom field called “${clean}”`);
  return base44.entities.CustomField.update(fieldId, { name: clean, ...(kind ? { field_type: kind } : {}) });
}

// Rename one of this alter's own entries or change its kind, keeping its
// value. A widget that listed it by its old name shows it under "Every
// other field" until it's picked again.
export async function updateOwnEntry(alterId, oldName, { name, kind }) {
  const clean = String(name || "").trim();
  if (!alterId || !clean) throw new Error("The custom field needs a name");
  const fresh = (await base44.entities.Alter.get(alterId)) || {};
  if (fresh.alter_custom_fields && !Array.isArray(fresh.alter_custom_fields)) throw new Error("This custom field can't be changed here");
  const list = [...ownListOf(fresh)];
  const i = list.findIndex((f) => f?.name === oldName);
  if (i < 0) throw new Error("That custom field isn't there any more");
  if (list.some((f, j) => j !== i && sameName(f?.name, clean))) throw new Error(`There's already a custom field called “${clean}”`);
  list[i] = { ...list[i], name: clean, ...(kind ? { field_type: kind } : {}) };
  return base44.entities.Alter.update(alterId, { alter_custom_fields: list });
}
