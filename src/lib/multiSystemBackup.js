// Pure transforms for multi-system backup (P5).
//
// mergeSystemsAsGroups() flattens several systems' entity dumps into ONE
// system's dump, where each source system becomes a Group named after that
// system, holding that system's members. Used when exporting to a format that
// can't represent multiple systems (or as a general "flatten everything into
// one" option).
//
// Ids CAN collide: two systems created from the same backup share every
// record id, and a plain merge let one silently overwrite the other in the
// file (audit 2026-10-01, H3). A later system's record whose id is already
// taken by DIFFERENT content gets a fresh id, and every reference to it
// inside that system is rewritten (the same whole-string swap
// replaceIdReferences uses — ids are UUIDs). Identical records (built-in
// defaults) are kept once. SystemSettings is a singleton: the merged file
// carries one row, the open system's.

function genGroupId() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* fall through */ }
  return `grp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

// systemsData: [{ name, color?, data: { Alter:{id:rec}, Group:{...}, ... } }]
// Returns a single combined dump in the same { EntityName: { id: record } } shape.
// Re-key until stable: swapping a re-keyed id into a record that was
// identical in both systems makes it differ, so it needs its own id too —
// one pass dropped those (review 2026-10-01, M6). One generic token regex
// plus a Map lookup keeps this linear on large files.
const ID_TOKEN = /[A-Za-z0-9_-]{16,}/g;
function rekeyCollisions(data, combined) {
  let current = data;
  const everRemapped = new Set();
  for (let pass = 0; pass < 6; pass++) {
    const remap = new Map();
    for (const [entity, recs] of Object.entries(current)) {
      if (entity.startsWith("__") || entity === "SystemSettings" || !recs || typeof recs !== "object") continue;
      const taken = combined[entity] || {};
      for (const [id, rec] of Object.entries(recs)) {
        if (!(id in taken) || everRemapped.has(id)) continue;
        if (JSON.stringify(taken[id]) === JSON.stringify(rec)) continue;
        if (id.length >= 16) remap.set(id, genGroupId());
      }
    }
    if (!remap.size) break;
    for (const id of remap.keys()) everRemapped.add(id);
    current = JSON.parse(JSON.stringify(current).replace(ID_TOKEN, (m) => remap.get(m) || m));
  }
  return current;
}

export function mergeSystemsAsGroups(systemsData) {
  const combined = {};
  const now = new Date().toISOString();
  const addColl = (entity, recs) => {
    if (!recs || typeof recs !== "object") return;
    if (!combined[entity]) combined[entity] = {};
    for (const [id, rec] of Object.entries(recs)) {
      if (!(id in combined[entity])) combined[entity][id] = rec;
    }
  };
  // The open system's settings row (else the first system's) is the one row.
  const list = (systemsData || []).filter(Boolean);
  const settingsFrom = Math.max(0, list.findIndex((x) => x.active));

  for (const [idx, sys] of list.entries()) {
    const data = rekeyCollisions((sys && sys.data) || {}, combined);
    const alters = (data.Alter && typeof data.Alter === "object") ? data.Alter : {};
    const memberIds = Object.keys(alters);

    // One Group per source system, named after it, holding its members.
    const groupId = genGroupId();
    if (!combined.Group) combined.Group = {};
    combined.Group[groupId] = {
      id: groupId,
      name: (sys && sys.name) || "System",
      color: (sys && sys.color) || null,
      parent: "",
      member_sp_ids: [...memberIds],
      created_date: now,
      updated_date: now,
    };

    // Merge this system's alters, appending the system-group to each one's groups.
    if (memberIds.length) {
      if (!combined.Alter) combined.Alter = {};
      for (const [aid, alter] of Object.entries(alters)) {
        const groups = Array.isArray(alter.groups) ? [...alter.groups, groupId] : [groupId];
        combined.Alter[aid] = { ...alter, groups };
      }
    }

    // Merge every other entity collection as-is.
    for (const [entity, recs] of Object.entries(data)) {
      if (entity === "Alter") continue;
      // Reserved per-device keys (the preferences mirror) aren't entity
      // collections and don't belong in a merged multi-system blob.
      if (typeof entity === "string" && entity.startsWith("__")) continue;
      if (entity === "SystemSettings" && idx !== settingsFrom) continue;
      addColl(entity, recs);
    }
  }

  return combined;
}

// Reconcile a multi-system backup's systems against the systems that currently
// exist, matching by NAME (the backup format carries no stable per-system id).
// Greedy multiset match: each backup system "covers" one existing system of the
// same name. Returns the existing systems that are NOT covered by the backup —
// i.e. the ones a "Replace all" import would otherwise silently drop. The UI
// asks the user whether to keep or clear these.
//
//   importedSystems: [{ name, ... }]      (from the backup)
//   existingSystems: [{ id, name, ... }]  (listSystems())
// -> existingSystems[] not represented in the backup by name.
export function computeUnmatchedExistingSystems(importedSystems, existingSystems) {
  const remaining = new Map();
  for (const imp of importedSystems || []) {
    const name = (imp && imp.name) || "";
    remaining.set(name, (remaining.get(name) || 0) + 1);
  }
  const unmatched = [];
  for (const s of existingSystems || []) {
    const name = (s && s.name) || "";
    const c = remaining.get(name) || 0;
    if (c > 0) remaining.set(name, c - 1); // covered by a backup system
    else unmatched.push(s);
  }
  return unmatched;
}
