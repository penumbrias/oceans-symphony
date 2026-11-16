// Florality import driver — writes the model from florality.js.
//
// Additive only: nothing already here is changed or removed. Every record
// carries `florality_id` (Florality's own id), so importing the same file
// again — or the JSON after the HTML — adds only what's new.
//
// Write paths (CLAUDE.md): alters through createAlter, group membership
// through setGroupMembers, fronts as history unless the person opts in
// (openFrontsAtExport.js), session notes as the JSON array FrontingSession
// expects.

import { base44 } from "@/api/base44Client";
import { withBatch } from "@/lib/localDb";
import { createAlter } from "@/lib/alterEntry";
import { setGroupMembers, addGroupMember } from "@/lib/groupMembership";
import { settleOpenFront, createLiveFrontGate } from "@/lib/openFrontsAtExport";
import { memberSharedWithFriends, frontNotePayload } from "@/lib/florality";

const lower = (s) => String(s || "").trim().toLowerCase();

// How many members the file still has fronting (for the opt-in's count).
export function countOpenFloralityFronts(model) {
  return new Set((model?.fronts || []).filter((f) => !f.end).map((f) => f.memberId)).size;
}

// opts:
//   dryRun                 — count only, write nothing
//   sharedBucketIds        — Set of bucket ids the person chose to share
//   bucketsAsGroups        — keep each used privacy bucket as a group
//   includeFronts, includeNotes
//   makeOpenFrontsCurrent  — open fronts become live (never for someone
//                            already fronting here)
export function importFlorality(model, opts = {}) {
  if (opts.dryRun) return importInner(model, opts);
  return withBatch(() => importInner(model, opts));
}

async function importInner(model, opts) {
  const {
    dryRun = false, sharedBucketIds = new Set(), bucketsAsGroups = true,
    includeFronts = true, includeNotes = true, makeOpenFrontsCurrent = false,
  } = opts;
  const warnings = [];
  const counts = {
    alters: 0, existingAlters: 0, shared: 0, groups: 0, customFields: 0,
    frontingSessions: 0, liveFronts: 0, journalEntries: 0, alterNotes: 0,
  };
  const E = base44.entities;
  const safeList = async (name) => { try { return (await E[name].list()) || []; } catch { return []; } };

  const [alters, groups, customFields] = await Promise.all([safeList("Alter"), safeList("Group"), safeList("CustomField")]);
  const alterByFl = new Map(alters.filter((a) => a.florality_id).map((a) => [a.florality_id, a.id]));
  const groupByFl = new Map(groups.filter((g) => g.florality_id).map((g) => [g.florality_id, g]));

  // 1. Custom fields — reuse one with the same Florality id or name.
  const fieldLocalId = new Map();
  for (const f of model.fields || []) {
    const existing = customFields.find((c) => c.florality_id === f.id) || customFields.find((c) => lower(c.name) === lower(f.name));
    if (existing) { fieldLocalId.set(f.id, existing.id); continue; }
    counts.customFields++;
    if (dryRun) { fieldLocalId.set(f.id, `dry-${f.id}`); continue; }
    try {
      const created = await E.CustomField.create({ name: f.name, field_type: f.type, florality_id: f.id });
      fieldLocalId.set(f.id, created.id);
    } catch (e) { warnings.push(`Field "${f.name}" failed: ${e?.message || e}`); }
  }

  // 2. Folders (and Florality groups) → groups. Parents resolved after.
  const newGroups = [];
  for (const f of model.folders || []) {
    if (groupByFl.has(f.id)) continue;
    counts.groups++;
    if (dryRun) continue;
    try {
      const created = await E.Group.create({
        name: f.name, description: f.description || "", color: f.color || "",
        ...(f.emoji ? { emoji: f.emoji } : {}), florality_id: f.id,
      });
      groupByFl.set(f.id, created);
      newGroups.push({ folder: f, group: created });
    } catch (e) { warnings.push(`Group "${f.name}" failed: ${e?.message || e}`); }
  }
  for (const { folder, group } of newGroups) {
    const parent = folder.parentId && groupByFl.get(folder.parentId);
    if (!parent || parent.id === group.id) continue;
    try { await E.Group.update(group.id, { parent: parent.id }); } catch { /* stays top-level */ }
  }

  // 3. Privacy buckets someone is in → groups under one "privacy" parent,
  //    so the person can see who was where. A no-access bucket's group
  //    hides its members from friends for good measure.
  const usedBuckets = (model.buckets || []).filter((b) => (model.members || []).some((m) => m.bucketIds.includes(b.id)));
  if (bucketsAsGroups && usedBuckets.length) {
    const parentKey = "privacy-buckets";
    let parent = groupByFl.get(parentKey);
    if (!parent) {
      counts.groups++;
      if (!dryRun) {
        try {
          parent = await E.Group.create({ name: "Florality privacy buckets", description: "Who was in which privacy bucket in Florality.", florality_id: parentKey });
          groupByFl.set(parentKey, parent);
        } catch (e) { warnings.push(`Privacy group failed: ${e?.message || e}`); }
      }
    }
    for (const b of usedBuckets) {
      const key = `bucket:${b.id}`;
      if (groupByFl.has(key)) continue;
      counts.groups++;
      if (dryRun) continue;
      try {
        const created = await E.Group.create({
          name: b.name, description: b.description || "",
          ...(parent ? { parent: parent.id } : {}),
          ...(b.friendAccess === false ? { hide_from_friends: true } : {}),
          florality_id: key,
        });
        groupByFl.set(key, created);
        newGroups.push({ folder: { id: key }, group: created });
      } catch (e) { warnings.push(`Privacy group "${b.name}" failed: ${e?.message || e}`); }
    }
  }

  // 4. Members → alters.
  const newAlterIds = new Set();
  for (const m of model.members || []) {
    if (alterByFl.has(m.id)) { counts.existingAlters++; continue; }
    const shared = memberSharedWithFriends(m, sharedBucketIds, model.buckets);
    if (dryRun) { counts.alters++; if (shared) counts.shared++; alterByFl.set(m.id, `dry-${m.id}`); continue; }
    const custom_fields = {};
    for (const [fid, v] of Object.entries(m.fieldValues || {})) {
      const local = fieldLocalId.get(fid);
      if (local && v) custom_fields[local] = v;
    }
    if (m.bannerUrl) custom_fields._header_image = m.bannerUrl;
    try {
      const created = await createAlter({
        name: m.name, alias: m.alias, pronouns: m.pronouns, description: m.description,
        color: m.color, avatar_url: m.avatarUrl, banner_url: m.bannerUrl,
        tags: m.tags.length ? m.tags : undefined,
        custom_fields: Object.keys(custom_fields).length ? custom_fields : undefined,
        is_archived: m.archived,
        florality_id: m.id,
        friends_visible: shared,
      });
      if (m.archived && created?.id) await E.Alter.update(created.id, { is_archived: true });
      alterByFl.set(m.id, created.id);
      newAlterIds.add(created.id);
      counts.alters++;
      if (shared) counts.shared++;
    } catch (e) { warnings.push(`${m.name} failed: ${e?.message || e}`); }
  }

  // 5. Group membership — new groups get their members set; existing ones
  //    only gain the newly imported alters.
  if (!dryRun) {
    const membersOf = new Map();
    const push = (key, flMemberId) => {
      const id = alterByFl.get(flMemberId);
      if (!id) return;
      if (!membersOf.has(key)) membersOf.set(key, new Set());
      membersOf.get(key).add(id);
    };
    for (const m of model.members || []) {
      for (const fid of m.folderIds) push(fid, m.id);
      if (bucketsAsGroups) for (const bid of m.bucketIds) push(`bucket:${bid}`, m.id);
    }
    const isNew = new Set(newGroups.map((g) => g.group.id));
    for (const [key, ids] of membersOf) {
      const group = groupByFl.get(key);
      if (!group) continue;
      try {
        if (isNew.has(group.id)) await setGroupMembers({ group, alterIds: [...ids] });
        else for (const id of ids) if (newAlterIds.has(id)) await addGroupMember({ group, alterId: id });
      } catch (e) { warnings.push(`Group members for "${group.name}" failed: ${e?.message || e}`); }
    }
  }

  // 6. Front history.
  if (includeFronts && (model.fronts || []).length) {
    const existing = dryRun ? [] : await safeList("FrontingSession");
    const seen = new Set(existing.map((s) => s.florality_front_id).filter(Boolean));
    const gate = createLiveFrontGate(existing, makeOpenFrontsCurrent);
    const closeAt = new Date().toISOString();
    for (const f of model.fronts) {
      if (seen.has(f.id)) continue;
      const alterId = alterByFl.get(f.memberId);
      if (!alterId) continue;
      const open = !f.end;
      const makeLive = open && gate.allow(alterId);
      const { end_time, is_active } = settleOpenFront(f.start, { open, end: f.end, makeLive, closeAt });
      const session = gate.record({
        alter_id: alterId,
        is_primary: f.typeKey === "primary",
        start_time: f.start,
        end_time,
        is_active,
        ...(open && !is_active ? { florality_open_at_export: true } : {}),
        note: frontNotePayload(f.note, f.start),
        session_emotions: "",
        session_symptoms: "",
        source: "florality",
        florality_front_id: f.id,
        ...(f.typeKey ? { florality_front_type: f.typeKey } : {}),
      });
      counts.frontingSessions++;
      if (is_active) counts.liveFronts++;
      if (dryRun) continue;
      try { await E.FrontingSession.create(session); seen.add(f.id); }
      catch (e) { warnings.push(`Front session failed: ${e?.message || e}`); }
    }
  }

  // 7. Notes: about one member → that alter's notes; otherwise a journal.
  if (includeNotes && (model.notes || []).length) {
    const [journals, notes] = dryRun ? [[], []] : await Promise.all([safeList("JournalEntry"), safeList("AlterNote")]);
    const seen = new Set([...journals, ...notes].map((r) => r.florality_id).filter(Boolean));
    for (const n of model.notes) {
      if (seen.has(n.id)) continue;
      const alterIds = n.memberIds.map((id) => alterByFl.get(id)).filter(Boolean);
      const when = n.createdAt || new Date().toISOString();
      if (alterIds.length === 1 && n.memberIds.length === 1) {
        counts.alterNotes++;
        if (dryRun) continue;
        try {
          await E.AlterNote.create({
            alter_id: alterIds[0],
            content: n.title ? `**${n.title}**\n\n${n.content}`.trim() : n.content,
            timestamp: when,
            florality_id: n.id,
          });
        } catch (e) { warnings.push(`Note failed: ${e?.message || e}`); }
        continue;
      }
      counts.journalEntries++;
      if (dryRun) continue;
      try {
        await E.JournalEntry.create({
          title: n.title || "Florality note",
          content: n.content,
          entry_type: "personal",
          tags: ["imported"],
          author_alter_id: alterIds[0] || null,
          co_author_alter_ids: alterIds.slice(1),
          entry_date: when,
          florality_id: n.id,
        });
      } catch (e) { warnings.push(`Journal failed: ${e?.message || e}`); }
    }
  }

  return { counts, warnings };
}
