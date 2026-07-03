// Pure transforms for multi-system backup (P5).
//
// mergeSystemsAsGroups() flattens several systems' entity dumps into ONE
// system's dump, where each source system becomes a Group named after that
// system, holding that system's members. Used when exporting to a format that
// can't represent multiple systems (or as a general "flatten everything into
// one" option). UUID-keyed records across systems don't collide, so other
// entity types are merged as-is.

function genGroupId() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* fall through */ }
  return `grp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

// systemsData: [{ name, color?, data: { Alter:{id:rec}, Group:{...}, ... } }]
// Returns a single combined dump in the same { EntityName: { id: record } } shape.
export function mergeSystemsAsGroups(systemsData) {
  const combined = {};
  const now = new Date().toISOString();
  const addColl = (entity, recs) => {
    if (!recs || typeof recs !== "object") return;
    if (!combined[entity]) combined[entity] = {};
    Object.assign(combined[entity], recs);
  };

  for (const sys of systemsData || []) {
    const data = (sys && sys.data) || {};
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
