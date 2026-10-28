// THE writers for an alter's own record (roadmap step 4):
//
//   • createAlter     — the "new alter" sheet (v0.279.11)
//   • saveAlterEdits  — the profile editor's Save (v0.279.11)
//   • deleteAlter     — every delete button (v0.279.8)
//
// saveAlterEdits writes only what the person changed, onto a FRESH read
// of the record. The profile editor loads its form once when the page
// opens; saving that whole snapshot used to put back anything written in
// the meantime — custom-field values typed on the Info tab, Get to know me
// answers, a sync from another device — so their edits were silently
// undone. custom_fields merges key by key for the same reason.
//
// The delete (v0.279.8):
// The edit sheet, the profile tab and the options tab each had their own
// delete button; only the alter row went to the trash, so restoring an
// alter brought back an empty board with its notes and relationships gone
// for good after the purge. Now one batch carries the alter and what
// belongs only to them, and restoring the batch puts it all back at once:
//
//   • AlterNote      — notes on their profile (alter_id)
//   • AlterMessage   — their board (alter_id) and their private inbox
//                      (to_alter_id); messages they wrote elsewhere stay
//   • AlterRelationship — every relationship with them on either end
//   • ProfileBoard   — the layout of their profile page (v0.289.0)
//
// Group memberships are left as they are: readers only list alters that
// exist, so a trashed alter drops out of every group, and comes back in on
// restore. Fronting history and check-ins keep the alter's id.

import { base44 } from "@/api/base44Client";
import { withTrashBatch } from "@/lib/localDb";
import { setAlterGroups } from "@/lib/groupMembership";

// A 4-digit year out of a free-form "first appeared" string, so the
// integer origin_year (lineage, timeline) follows whatever was typed.
export function extractYear(str) {
  if (!str) return "";
  const m = String(str).match(/\b(1[89]\d{2}|20\d{2}|21\d{2})\b/);
  return m ? m[1] : "";
}

// The single "first appeared" field backs both birthday (display) and
// origin_year; seed each from the other when only one was ever stored.
export function firstAppearanceOf(alter) {
  let birthday = alter?.birthday || "";
  let originYear = alter?.origin_year ? String(alter.origin_year) : "";
  if (!birthday && originYear) birthday = originYear;
  if (!originYear && birthday) originYear = extractYear(birthday);
  return { birthday, origin_year: originYear };
}

const toRecord = (form) => ({
  ...form,
  origin_year: form.origin_year ? parseInt(form.origin_year, 10) : null,
});

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export async function createAlter(form, { groupIds = [] } = {}) {
  if (!form?.name?.trim()) throw new Error("Name is required");
  // A new record carries only what was filled in — empty form slots
  // (e.g. profile_song: null) aren't written onto it.
  const filled = Object.fromEntries(
    Object.entries(toRecord(form)).filter(([, v]) => v !== null && v !== undefined && v !== "")
  );
  // New alters start on the garden profile layout (v0.297.0) — the info
  // widgets. Older app versions ignore the flag and show the classic page.
  const created = await base44.entities.Alter.create({ profile_layout: "garden", ...filled, is_archived: false });
  if (groupIds.length && created?.id) {
    try {
      await setAlterGroups({ alterId: created.id, groupIds });
    } catch { /* the alter is saved; groups can be set from the profile */ }
  }
  return created;
}

export async function saveAlterEdits({ alterId, baseline, form }) {
  if (!form?.name?.trim()) throw new Error("Name is required");
  const before = toRecord(baseline || {});
  const after = toRecord(form);
  const fresh = (await base44.entities.Alter.get(alterId)) || {};
  const patch = {};
  for (const key of Object.keys(after)) {
    if (key === "custom_fields") continue;
    if (!same(after[key], before[key])) patch[key] = after[key];
  }
  // custom_fields: only the keys this editor changed, onto what's stored now.
  const cfBefore = before.custom_fields || {};
  const cfAfter = after.custom_fields || {};
  const cfKeys = new Set([...Object.keys(cfBefore), ...Object.keys(cfAfter)]);
  const changed = [...cfKeys].filter((k) => !same(cfAfter[k], cfBefore[k]));
  if (changed.length) {
    const cf = { ...(fresh.custom_fields || {}) };
    for (const k of changed) {
      if (k in cfAfter) cf[k] = cfAfter[k];
      else delete cf[k];
    }
    patch.custom_fields = cf;
  }
  if (!Object.keys(patch).length) return fresh;
  return base44.entities.Alter.update(alterId, patch);
}

// Change a few of the alter's own top-level fields (the avatar, its
// rotation…) and nothing else. custom_fields go through
// patchAlterCustomFields; the name can't be blanked here.
export async function setAlterFields(alterId, patch) {
  if (!alterId || !patch || typeof patch !== "object") return null;
  const clean = { ...patch };
  delete clean.custom_fields;
  delete clean.id;
  if ("name" in clean && !String(clean.name || "").trim()) throw new Error("A name can't be empty");
  if (!Object.keys(clean).length) return null;
  return base44.entities.Alter.update(alterId, clean);
}

// Change some custom_fields keys (undefined removes one) on a fresh read,
// leaving every other key exactly as stored.
export async function patchAlterCustomFields(alterId, changes) {
  const fresh = (await base44.entities.Alter.get(alterId)) || {};
  const cf = { ...(fresh.custom_fields || {}) };
  for (const [k, v] of Object.entries(changes || {})) {
    if (v === undefined) delete cf[k];
    else cf[k] = v;
  }
  return base44.entities.Alter.update(alterId, { custom_fields: cf });
}

// A new sub-system this alter owns: a group with them as its owner
// (subsystemUtils). The pencil form and the Alter info list both use it.
export async function createOwnedSubsystem(alter, name) {
  if (!alter?.id) throw new Error("No alter");
  return base44.entities.Group.create({
    name,
    color: alter.color || "#8b5cf6",
    parent: "",
    member_sp_ids: [],
    owner_alter_id: alter.id,
  });
}

// Every screen that shows this alter (the list, the profile, pickers).
export function refreshAlter(queryClient, alterId) {
  queryClient?.invalidateQueries({ queryKey: ["alters"] });
  if (alterId) queryClient?.invalidateQueries({ queryKey: ["alter", alterId] });
}

async function safeFilter(entity, query) {
  try { return (await base44.entities[entity].filter(query)) || []; } catch { return []; }
}

export async function deleteAlter(alter) {
  if (!alter?.id) return;
  const id = alter.id;
  await withTrashBatch(async () => {
    const [notes, board, inbox, relA, relB, relSrc, relTgt, layouts] = await Promise.all([
      safeFilter("AlterNote", { alter_id: id }),
      safeFilter("AlterMessage", { alter_id: id }),
      safeFilter("AlterMessage", { to_alter_id: id }),
      safeFilter("AlterRelationship", { alter_id_a: id }),
      safeFilter("AlterRelationship", { alter_id_b: id }),
      // Imported relationships use the other pair of names.
      safeFilter("AlterRelationship", { source_alter_id: id }),
      safeFilter("AlterRelationship", { target_alter_id: id }),
      safeFilter("ProfileBoard", { owner_type: "alter", owner_id: id }),
    ]);
    const seen = new Set();
    const dependents = [
      ...notes.map((r) => ["AlterNote", r]),
      ...[...board, ...inbox].map((r) => ["AlterMessage", r]),
      ...[...relA, ...relB, ...relSrc, ...relTgt].map((r) => ["AlterRelationship", r]),
      ...layouts.map((r) => ["ProfileBoard", r]),
    ].filter(([entity, r]) => {
      const key = `${entity}:${r.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    // The alter first: if anything after it fails, the person still sees
    // the delete they asked for and the rest stays visible, never lost.
    await base44.entities.Alter.delete(id);
    for (const [entity, r] of dependents) {
      try { await base44.entities[entity].delete(r.id); } catch { /* stays visible */ }
    }
  });
}
