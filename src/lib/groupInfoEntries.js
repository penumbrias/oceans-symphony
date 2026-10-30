// A group's info as a list of entries (v0.322.0) — the group side of
// alterInfoEntries.js, so the Field widget can show a group's text too.
//
// Entry ids (stable, stored in widget settings):
//   bio            the group's description
//   own:<name>     one of the group's own entries — pages like "Purpose"
//                  or "History" added from a Field widget. Kept on the
//                  group as `info_fields: [{ name, value, field_type }]`.
//
// Every write reads the group fresh and changes only that one entry, so a
// widget, the group's edit form and another device never overwrite each
// other's text.

import { base44 } from "@/api/base44Client";

export const GROUP_BIO_ENTRY = { id: "bio", label: "Description", kind: "bio" };

const ownListOf = (group) => (Array.isArray(group?.info_fields) ? group.info_fields : []);
const sameName = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

export function groupEntriesFor(group) {
  if (!group) return [];
  const seen = new Set();
  const own = ownListOf(group)
    .filter((f) => f && f.name && !seen.has(f.name) && seen.add(f.name))
    .map((f) => ({ id: `own:${f.name}`, label: f.name, kind: f.field_type || "richtext", own: true }));
  return [GROUP_BIO_ENTRY, ...own];
}

export function groupEntryValue(group, entryId) {
  if (!group || !entryId) return "";
  if (entryId === "bio") return group.description || "";
  if (entryId.startsWith("own:")) {
    const name = entryId.slice(4);
    return ownListOf(group).find((f) => f?.name === name)?.value ?? "";
  }
  return "";
}

const freshGroup = async (groupId) => (await base44.entities.Group.get(groupId)) || null;

export async function writeGroupEntry(groupId, entryId, value) {
  if (!groupId || !entryId) return null;
  if (entryId === "bio") return base44.entities.Group.update(groupId, { description: value ?? "" });
  if (entryId.startsWith("own:")) {
    const name = entryId.slice(4);
    const fresh = await freshGroup(groupId);
    if (!fresh) throw new Error("That group isn't here any more");
    const list = [...ownListOf(fresh)];
    const i = list.findIndex((f) => f?.name === name);
    if (i < 0) list.push({ name, value, field_type: "richtext" });
    else list[i] = { ...list[i], value };
    return base44.entities.Group.update(groupId, { info_fields: list });
  }
  return null;
}

// A new entry for this group, made from a widget. Returns its id. An entry
// with the same name is reused, never duplicated.
export async function addGroupOwnEntry(groupId, { name, kind = "richtext", value = "" }) {
  const clean = String(name || "").trim();
  if (!groupId || !clean) throw new Error("The page needs a name");
  const fresh = await freshGroup(groupId);
  if (!fresh) throw new Error("That group isn't here any more");
  const list = [...ownListOf(fresh)];
  const same = list.find((f) => sameName(f?.name, clean));
  if (same) return `own:${same.name}`;
  list.push({ name: clean, value, field_type: kind });
  await base44.entities.Group.update(groupId, { info_fields: list });
  return `own:${clean}`;
}
