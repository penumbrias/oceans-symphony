// Merge one alter profile into another — the cleanup tool for duplicated
// profiles (e.g. a re-import that didn't match and doubled the roster).
//
// Semantics (user-data invariant: nothing is ever lost):
//   1. The TARGET keeps every field it already has. Fields the target left
//      empty are filled from the source; tags + groups are unioned;
//      custom_fields merge with the target winning per-key.
//   2. EVERY reference to the source's id anywhere in the database —
//      fronting sessions (incl. legacy primary/co-fronter shapes and ids
//      inside JSON-string payloads), check-ins, journals, notes, messages,
//      relationships, group memberships, chat authorship, lineage events —
//      is re-pointed at the target via replaceIdReferences.
//   3. Only then is the (now reference-free) source profile deleted.
//   4. Self-relationships produced by the merge (source↔target rows) are
//      removed — a profile can't relate to itself.
//
// Never called automatically: merging is always an explicit, user-confirmed
// action from the profile's Options tab.

import { localEntities } from "@/api/base44Client";
import { replaceIdReferences } from "./localDb";

const isEmpty = (v) =>
  v == null ||
  (typeof v === "string" && v.trim() === "") ||
  (Array.isArray(v) && v.length === 0);

const unionArrays = (a = [], b = []) => {
  const out = [...(Array.isArray(a) ? a : [])];
  const seen = new Set(out.map((x) => (typeof x === "string" ? x.toLowerCase() : x)));
  for (const x of Array.isArray(b) ? b : []) {
    const key = typeof x === "string" ? x.toLowerCase() : x;
    if (!seen.has(key)) { seen.add(key); out.push(x); }
  }
  return out;
};

export async function mergeAlterInto(sourceId, targetId) {
  if (!sourceId || !targetId) throw new Error("Both profiles are required");
  if (sourceId === targetId) throw new Error("Can't merge a profile into itself");

  const source = await localEntities.Alter.get(sourceId);
  const target = await localEntities.Alter.get(targetId);
  if (!source) throw new Error("The profile being merged no longer exists");
  if (!target) throw new Error("The destination profile no longer exists");

  // 1. Fill-empty field merge (target wins; unions for tags/groups).
  const SKIP_FIELDS = new Set(["id", "created_date", "updated_date", "created_by"]);
  const patch = {};
  for (const [field, value] of Object.entries(source)) {
    if (SKIP_FIELDS.has(field) || isEmpty(value)) continue;
    if (field === "tags" || field === "groups") {
      patch[field] = unionArrays(target[field], value);
      continue;
    }
    if (field === "custom_fields" && typeof value === "object" && !Array.isArray(value)) {
      patch.custom_fields = { ...value, ...(target.custom_fields || {}) };
      continue;
    }
    if (isEmpty(target[field])) patch[field] = value;
  }
  if (Object.keys(patch).length > 0) {
    await localEntities.Alter.update(targetId, patch);
  }

  // 2. Re-point every reference BEFORE deleting, so an interruption can never
  //    leave history dangling on a deleted profile.
  const repointed = await replaceIdReferences(sourceId, targetId, { skipEntities: ["Alter"] });

  // 3. Delete the now reference-free duplicate.
  await localEntities.Alter.delete(sourceId);

  // 4. Drop self-relationships created by the rewrite (source↔target pairs).
  try {
    const rels = await localEntities.AlterRelationship.list();
    for (const r of rels) {
      if (r && r.source_alter_id === targetId && r.target_alter_id === targetId) {
        await localEntities.AlterRelationship.delete(r.id);
      }
    }
  } catch { /* relationship cleanup is best-effort */ }

  return { repointed, mergedName: source.name || "", intoName: target.name || "" };
}
