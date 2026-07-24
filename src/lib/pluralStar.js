// Plural Star importer — pure parser + Symphony entity mapper.
//
// Accepts two export shapes:
//   1. Plain JSON (.json)   — one file, avatars embedded as data: URIs in
//                             top-level `avatars: { memberId: "data:image/…" }`
//   2. Structured ZIP (.zip) — { manifest.json, data.json, media/avatar-<id>.png }
//
// Both share the same `data.json` schema (top-level keys: _meta, system,
// members, frontHistory, journal, groups, chatChannels, chatMessages,
// settings, front, palettes, customMoods, customFieldDefs, noteboards,
// polls, journalTemplates, relationships, relationshipTypes,
// systemMapMembers, and — in the .json bundle — inline avatars & banners).
//
// Detection signal: `_meta.app === "Plural Star"` (JSON) or manifest.json
// containing `"app": "Plural Star"` (ZIP). Very reliable — no other plural
// tool emits that string.
//
// This file is pure functions only (parse + map + a small importAll driver).
// The React component in PluralStarFileImport.jsx wires it to actual entity
// creates + progress toasts, following the same pattern as the OpenPlural /
// Simply Plural / Octocon importers.

import { base44 } from "@/api/base44Client";
import { saveLocalImage } from "@/lib/localImageStorage";

// ─── Detection ─────────────────────────────────────────────────────────────

// Does this parsed JSON look like a Plural Star export? Returns true for
// both the plain-JSON and zip-data.json shapes (both carry _meta.app).
export function isPluralStarJson(j) {
  return !!(j && typeof j === "object" && !Array.isArray(j) &&
    j._meta && typeof j._meta === "object" &&
    String(j._meta.app || "").toLowerCase() === "plural star");
}

// ─── Parse (JSON + ZIP entry points) ───────────────────────────────────────

export async function parsePluralStarFile(file) {
  const name = (file.name || "").toLowerCase();
  const isJson = name.endsWith(".json");

  if (isJson) {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!isPluralStarJson(data)) {
      throw new Error(`This .json isn't a Plural Star export (_meta.app is "${data?._meta?.app || "unknown"}").`);
    }
    // Inline avatars → media map keyed by memberId so the mapper can look
    // them up the same way as the zip path.
    const media = new Map();
    const inline = data.avatars && typeof data.avatars === "object" ? data.avatars : {};
    for (const [memberId, dataUri] of Object.entries(inline)) {
      if (typeof dataUri === "string" && dataUri.startsWith("data:")) {
        media.set(memberId, { kind: "dataUri", value: dataUri });
      }
    }
    return { data, media };
  }

  // Otherwise: zip. manifest.json + data.json + media/*.
  const fflate = await import("fflate");
  const buf = new Uint8Array(await file.arrayBuffer());
  const unzipped = await new Promise((resolve, reject) => {
    fflate.unzip(buf, (err, files) => (err ? reject(err) : resolve(files)));
  });

  const dec = new TextDecoder("utf-8");
  const manifestEntry = unzipped["manifest.json"] || findByBasename(unzipped, "manifest.json");
  const dataEntry = unzipped["data.json"] || findByBasename(unzipped, "data.json");
  if (!dataEntry) throw new Error("No data.json found in the .zip — is this a Plural Star export?");

  let manifest = null;
  if (manifestEntry) {
    try { manifest = JSON.parse(dec.decode(manifestEntry)); } catch { /* tolerate */ }
  }
  if (manifest && String(manifest.app || "").toLowerCase() !== "plural star") {
    throw new Error(`This .zip's manifest.json says app="${manifest.app}" — not a Plural Star export.`);
  }

  const data = JSON.parse(dec.decode(dataEntry));

  // media/avatar-<memberId>.png → keyed by memberId. Blob is bytes + mime;
  // the mapper turns it into a data: URI (or saves it directly to local
  // image storage) depending on the caller's preference.
  const media = new Map();
  for (const [path, bytes] of Object.entries(unzipped)) {
    if (path.endsWith("/")) continue;
    const basename = path.replace(/^.*\//, "");
    const m = basename.match(/^avatar-([^.]+)\.(png|jpe?g|webp|gif)$/i);
    if (!m) continue;
    const memberId = m[1];
    const ext = m[2].toLowerCase();
    const mime = ext === "png" ? "image/png"
      : (ext === "jpg" || ext === "jpeg") ? "image/jpeg"
      : ext === "webp" ? "image/webp"
      : ext === "gif" ? "image/gif"
      : "application/octet-stream";
    media.set(memberId, { kind: "bytes", bytes, mime });
  }

  return { data, media };
}

function findByBasename(unzipped, basename) {
  const key = Object.keys(unzipped).find((k) => k.replace(/^.*\//, "") === basename);
  return key ? unzipped[key] : null;
}

// ─── Small helpers ─────────────────────────────────────────────────────────

function withHash(color) {
  if (!color) return "";
  const c = String(color).trim();
  if (!c) return "";
  return c.startsWith("#") ? c : `#${c}`;
}

function nowIso() {
  // Deterministic-enough — used only when a record has no explicit timestamp.
  return new Date().toISOString();
}

function isoFromMs(ms) {
  if (typeof ms !== "number" || !isFinite(ms) || ms <= 0) return null;
  const d = new Date(ms);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

// Persist a member's avatar (data URI or raw bytes) into IndexedDB and return
// a local-image://<id> URL Symphony can use as `avatar_url`. Falls back to
// returning "" when there's no media or the write fails.
async function persistAvatar(memberId, mediaEntry) {
  if (!mediaEntry) return "";
  try {
    const imageId = `pluralstar-avatar-${memberId}`;
    if (mediaEntry.kind === "dataUri") {
      await saveLocalImage(imageId, mediaEntry.value);
      return `local-image://${imageId}`;
    }
    // bytes → data URI (fast enough for a batch import; consistent with
    // how localImageStorage stores things anyway).
    const bytes = mediaEntry.bytes;
    let binary = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    const dataUri = `data:${mediaEntry.mime};base64,${btoa(binary)}`;
    await saveLocalImage(imageId, dataUri);
    return `local-image://${imageId}`;
  } catch {
    return "";
  }
}

// ─── Mappers ───────────────────────────────────────────────────────────────

// Convert Plural Star's per-member customFields array into a Symphony
// `custom_fields` object keyed by the LOCAL CustomField id. Requires the
// psFieldId → localFieldId map that the connector builds after creating
// the CustomField rows.
export function mapCustomFieldValues(psValues, localFieldByPsId) {
  const out = {};
  if (!Array.isArray(psValues)) return out;
  for (const v of psValues) {
    const psId = v?.fieldId;
    const localId = localFieldByPsId.get(psId);
    if (!localId) continue;
    if (v?.value == null || v?.value === "") continue;
    out[localId] = v.value;
  }
  return out;
}

// PS member → Alter shape. `avatarUrl` is the pre-resolved local-image://
// URL (or ""); groups is the array of LOCAL Group ids (resolved from
// PS memberships after Groups get created).
export function mapMemberToAlter(m, { avatarUrl = "", groups = [], custom_fields = {} } = {}) {
  return {
    ps_id: m.id || "",
    ps_source_id: m.sourceId || "",
    name: (m.name || "Unnamed").toString(),
    pronouns: m.pronouns || "",
    role: m.role || "",
    description: m.description || "",
    color: withHash(m.color) || "",
    avatar_url: avatarUrl,
    is_archived: m.archived === true,
    tags: Array.isArray(m.tags) ? m.tags : [],
    groups: Array.isArray(groups) ? groups : [],
    custom_fields,
  };
}

// PS group → Group. parentId is captured verbatim; the connector resolves
// it after all groups exist. `kind` in PS is "group" | "subsystem" —
// stamped through as `is_subsystem` so a later pass can promote it if
// needed (Symphony uses `is_subsystem` on Group entities).
export function mapGroupToLocalGroup(g) {
  return {
    ps_id: g.id || "",
    ps_parent_id: g.parentId || "",
    name: g.name || "Unnamed group",
    color: withHash(g.color) || "",
    is_subsystem: g.kind === "subsystem",
    sort_order: typeof g.sortOrder === "number" ? g.sortOrder : 0,
  };
}

// PS customFieldDef → CustomField. Symphony's CustomField.type is loose
// (text|date|number|url|multiselect|…); PS emits "text" | "date" | others.
// Preserve whatever PS said and let the local editor render appropriately.
export function mapCustomFieldDef(def) {
  return {
    ps_id: def.id || "",
    name: def.name || "Untitled field",
    field_type: def.type || "text",
    sort_order: typeof def.sortOrder === "number" ? def.sortOrder : 0,
  };
}

// PS frontHistory entry → one FrontingSession per memberId in memberIds.
// Symphony is per-alter (one row per fronter); PS is per-frame (one row with
// a member set). Returns null for entries with no valid alter ids or bad
// timestamps.
export function mapFrontHistoryEntry(entry, alterIdByPsId) {
  const startIso = isoFromMs(entry?.startTime);
  if (!startIso) return null;
  const endIso = entry?.endTime == null ? null : isoFromMs(entry.endTime);
  const memberIds = Array.isArray(entry?.memberIds) ? entry.memberIds : [];
  const rows = [];
  for (const psId of memberIds) {
    const alterId = alterIdByPsId.get(psId);
    if (!alterId) continue;
    rows.push({
      alter_id: alterId,
      start_time: startIso,
      end_time: endIso,
      is_active: endIso === null,
      is_primary: false, // PS has no per-member primary flag on history frames
      note: entry?.note ? JSON.stringify([{ text: entry.note, timestamp: startIso }]) : "",
      session_emotions: "",
      session_symptoms: "",
      source: "pluralstar",
    });
  }
  return rows;
}

// PS `front` (current) → active FrontingSession rows. The `primary` bucket
// is the currently-fronting set; coFront / coConscious are additional
// members that show as active but not primary. PS's "primary" is a bucket
// name, not per-member — it means "these are the primary set" — so we
// mark is_primary=true when the set contains exactly ONE member (that's a
// clean 1:1 with Symphony's single-primary concept). Otherwise no primary
// is assigned (safer than picking arbitrarily). Returns [] if no active
// front is set at all.
export function mapCurrentFront(front, alterIdByPsId) {
  if (!front || typeof front !== "object") return [];
  const startIso = isoFromMs(front.startTime) || nowIso();
  const primaryIds = Array.isArray(front.primary?.memberIds) ? front.primary.memberIds : [];
  const coFrontIds = Array.isArray(front.coFront?.memberIds) ? front.coFront.memberIds : [];
  const coConsciousIds = Array.isArray(front.coConscious?.memberIds) ? front.coConscious.memberIds : [];
  const soloPrimary = primaryIds.length === 1;
  const rows = [];
  const seen = new Set();
  const pushAlter = (psId, { isPrimary = false } = {}) => {
    if (seen.has(psId)) return;
    seen.add(psId);
    const alterId = alterIdByPsId.get(psId);
    if (!alterId) return;
    rows.push({
      alter_id: alterId,
      start_time: startIso,
      end_time: null,
      is_active: true,
      is_primary: isPrimary,
      note: "",
      session_emotions: "",
      session_symptoms: "",
      source: "pluralstar",
    });
  };
  for (const id of primaryIds) pushAlter(id, { isPrimary: soloPrimary });
  for (const id of coFrontIds) pushAlter(id);
  for (const id of coConsciousIds) pushAlter(id);
  return rows;
}

// PS journal → JournalEntry.
export function mapJournalEntry(entry, alterIdByPsId) {
  const authorIds = Array.isArray(entry?.authorIds) ? entry.authorIds : [];
  const firstAuthorLocal = authorIds.map((id) => alterIdByPsId.get(id)).find(Boolean) || null;
  const timestampIso = isoFromMs(entry?.timestamp) || nowIso();
  return {
    ps_id: entry.id || "",
    title: entry.title || "",
    content: entry.body || "",
    alter_id: firstAuthorLocal,
    date: timestampIso,
    tags: Array.isArray(entry.hashtags) ? entry.hashtags : [],
  };
}

// PS noteboard entry → AlterMessage (a note posted on someone's board).
export function mapNoteboardEntry(entry, alterIdByPsId) {
  const alterId = alterIdByPsId.get(entry?.memberId);
  if (!alterId) return null;
  return {
    ps_id: entry.id || "",
    alter_id: alterId,
    author_alter_id: alterIdByPsId.get(entry?.authorId) || null,
    content: entry.content || "",
    timestamp: isoFromMs(entry?.timestamp) || nowIso(),
  };
}

// PS relationship → AlterRelationship. Skips when either endpoint didn't
// import.
export function mapRelationship(r, alterIdByPsId) {
  const fromLocal = alterIdByPsId.get(r?.fromId);
  const toLocal = alterIdByPsId.get(r?.toId);
  if (!fromLocal || !toLocal) return null;
  return {
    ps_id: r.id || "",
    source_alter_id: fromLocal,
    target_alter_id: toLocal,
    // PS relationships use a `typeId` string that may be a preset name
    // ("rival", "friend") or a local relationship-type row id. Stamp
    // verbatim; the RelationshipTypesManager will match by name where
    // possible on next render.
    relationship_type: r.typeId || "",
  };
}

// ─── Import driver ─────────────────────────────────────────────────────────

// Run the full import. Returns per-entity counts + any warnings.
//
// Options:
//   dryRun: true → build all the mapped payloads but skip the create
//     calls; useful for the preview panel.
//   updateSystemProfile: true → also update SystemSettings.system_name
//     and system_bio from PS' `system` block.
export async function importPluralStar({ data, media }, opts = {}) {
  const { dryRun = false, updateSystemProfile = true } = opts;
  const warnings = [];
  const alterIdByPsId = new Map();
  const groupIdByPsId = new Map();
  const cfIdByPsId = new Map();
  const counts = {
    alters: 0, groups: 0, customFields: 0, frontingSessions: 0,
    activeFront: 0, journalEntries: 0, alterMessages: 0,
    relationships: 0,
  };

  // 1. Custom field definitions FIRST — alters reference them.
  const defs = Array.isArray(data.customFieldDefs) ? data.customFieldDefs : [];
  for (const def of defs) {
    const payload = mapCustomFieldDef(def);
    const psId = payload.ps_id;
    delete payload.ps_id;
    if (dryRun) { cfIdByPsId.set(psId, `dry-cf-${psId}`); counts.customFields++; continue; }
    try {
      const created = await base44.entities.CustomField.create(payload);
      cfIdByPsId.set(psId, created.id);
      counts.customFields++;
    } catch (e) { warnings.push(`Custom field "${payload.name}" failed: ${e?.message || e}`); }
  }

  // 2. Groups.
  const groups = Array.isArray(data.groups) ? data.groups : [];
  const groupPayloads = groups.map(mapGroupToLocalGroup);
  for (const g of groupPayloads) {
    const psId = g.ps_id, psParentId = g.ps_parent_id;
    const payload = { ...g }; delete payload.ps_id; delete payload.ps_parent_id;
    if (dryRun) { groupIdByPsId.set(psId, `dry-g-${psId}`); counts.groups++; continue; }
    try {
      const created = await base44.entities.Group.create(payload);
      groupIdByPsId.set(psId, created.id);
      counts.groups++;
    } catch (e) { warnings.push(`Group "${payload.name}" failed: ${e?.message || e}`); }
    // Stash the ps parent for pass 2.
    g._localId = groupIdByPsId.get(psId);
    g._psParentId = psParentId;
  }
  // Resolve group parents now that every group has a local id.
  if (!dryRun) {
    for (const g of groupPayloads) {
      if (!g._psParentId || !g._localId) continue;
      const parentLocal = groupIdByPsId.get(g._psParentId);
      if (!parentLocal) continue;
      try { await base44.entities.Group.update(g._localId, { parent: parentLocal }); } catch { /* skip */ }
    }
  }

  // 3. Members → Alters (avatars saved along the way).
  const members = Array.isArray(data.members) ? data.members : [];
  for (const m of members) {
    if (m?.isCustomFront) continue; // PS "custom fronts" are pseudo-members, not real alters
    const mediaEntry = media.get(m.id);
    const avatarUrl = dryRun ? "" : await persistAvatar(m.id, mediaEntry);
    const localGroups = (m.groupIds || []).map((gid) => groupIdByPsId.get(gid)).filter(Boolean);
    const cf = mapCustomFieldValues(m.customFields, cfIdByPsId);
    const payload = mapMemberToAlter(m, { avatarUrl, groups: localGroups, custom_fields: cf });
    const psId = payload.ps_id; delete payload.ps_id;
    if (dryRun) { alterIdByPsId.set(psId, `dry-a-${psId}`); counts.alters++; continue; }
    try {
      const created = await base44.entities.Alter.create(payload);
      alterIdByPsId.set(psId, created.id);
      counts.alters++;
    } catch (e) { warnings.push(`${payload.name} failed: ${e?.message || e}`); }
  }

  // 4. Front history. Each PS frame → one Symphony session per member.
  const history = Array.isArray(data.frontHistory) ? data.frontHistory : [];
  for (const entry of history) {
    const rows = mapFrontHistoryEntry(entry, alterIdByPsId) || [];
    for (const row of rows) {
      if (dryRun) { counts.frontingSessions++; continue; }
      try { await base44.entities.FrontingSession.create(row); counts.frontingSessions++; }
      catch (e) { warnings.push(`Front session failed: ${e?.message || e}`); }
    }
  }

  // 5. Current front (`data.front`) — the "who's fronting right now" state.
  //    Only import when there ISN'T already an active front locally, so a
  //    re-import doesn't stomp on the user's current in-app switch.
  let existingActive = 0;
  if (!dryRun) {
    try {
      const active = await base44.entities.FrontingSession.filter({ is_active: true });
      existingActive = active.length;
    } catch { /* treat as empty */ }
  }
  if (existingActive === 0) {
    const rows = mapCurrentFront(data.front, alterIdByPsId);
    for (const row of rows) {
      if (dryRun) { counts.activeFront++; continue; }
      try { await base44.entities.FrontingSession.create(row); counts.activeFront++; }
      catch (e) { warnings.push(`Active front session failed: ${e?.message || e}`); }
    }
  } else if (Array.isArray(data.front?.primary?.memberIds) && data.front.primary.memberIds.length > 0) {
    warnings.push("Skipped importing Plural Star's current front — you already have someone fronting.");
  }

  // 6. Journal.
  const journal = Array.isArray(data.journal) ? data.journal : [];
  for (const entry of journal) {
    const payload = mapJournalEntry(entry, alterIdByPsId);
    delete payload.ps_id;
    if (dryRun) { counts.journalEntries++; continue; }
    try { await base44.entities.JournalEntry.create(payload); counts.journalEntries++; }
    catch (e) { warnings.push(`Journal "${payload.title || "(untitled)"}" failed: ${e?.message || e}`); }
  }

  // 7. Noteboards → AlterMessage.
  const notes = Array.isArray(data.noteboards) ? data.noteboards : [];
  for (const n of notes) {
    const payload = mapNoteboardEntry(n, alterIdByPsId);
    if (!payload) continue;
    delete payload.ps_id;
    if (dryRun) { counts.alterMessages++; continue; }
    try { await base44.entities.AlterMessage.create(payload); counts.alterMessages++; }
    catch (e) { warnings.push(`Note failed: ${e?.message || e}`); }
  }

  // 8. Relationships. RelationshipTypes are usually empty in PS exports
  //    (PS ships built-in types), so we don't create RelationshipType
  //    rows — the typeId string is stored verbatim and matched by name
  //    downstream if the user has an equivalent local type.
  const rels = Array.isArray(data.relationships) ? data.relationships : [];
  for (const r of rels) {
    const payload = mapRelationship(r, alterIdByPsId);
    if (!payload) continue;
    delete payload.ps_id;
    if (dryRun) { counts.relationships++; continue; }
    try { await base44.entities.AlterRelationship.create(payload); counts.relationships++; }
    catch (e) { warnings.push(`Relationship failed: ${e?.message || e}`); }
  }

  // 9. System profile — only if the user has default values (never overwrite
  //    something they explicitly set).
  if (!dryRun && updateSystemProfile) {
    try {
      const settingsList = await base44.entities.SystemSettings.list();
      const settings = settingsList[0];
      if (settings && data.system) {
        const patch = {};
        const currentName = (settings.system_name || "").trim();
        if ((!currentName || currentName === "Your system" || currentName === "New system") && data.system.name) {
          patch.system_name = data.system.name;
        }
        if (!settings.system_bio && data.system.description) {
          patch.system_bio = data.system.description;
        }
        if (Object.keys(patch).length > 0) {
          await base44.entities.SystemSettings.update(settings.id, patch);
        }
      }
    } catch (e) { warnings.push(`System profile update skipped: ${e?.message || e}`); }
  }

  return { counts, warnings };
}
