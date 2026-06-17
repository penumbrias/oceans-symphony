// OpenPlural v0.1 importer — pure mappers + zip parsing helpers.
//
// OpenPlural is a portable export format (a .zip containing openplural.json +
// manifest.json + a media/ folder) produced by PluralSpace and other apps.
// This module mirrors the conventions of src/lib/simplyPlural.js: pure mapper
// functions returning the exact local entity shapes, with an `op_id` field on
// every record for dedup on re-import (the OpenPlural equivalent of SP's
// `sp_id`). The connector component (OpenPluralConnect.jsx) drives the
// create/update loop and owns all IndexedDB writes.
//
// Schema reference (verified against a real PluralSpace export):
//   members[]              {id, system_id, name, display_name, pronouns,
//                           description, color, avatar_asset_id, banner_asset_id,
//                           is_custom_front, archived, created_at, sort_order, ...}
//   groups[]               {id, name, description, color, parent_group_id, ...}
//   group_memberships[]    {id, group_id, member_id}
//   custom_fields[]        {id, name, field_type ("text"|"date"), supports_markdown, ...}
//   custom_field_values[]  {id, field_id, subject_type:"member", subject_id, value}
//   front_periods[]        {id, started_at, ended_at (null = active), note,
//                           assignments:[{member_id, front_role, note}]}
//   notes[]                {id, member_id, author_member_ids[], title, body,
//                           created_at, entry_date, ...}
//   assets[]               {id, kind, mime_type, file_name, uri ("media/<file>")}
//   relationships{types[],edges[]}  edge: {id, from_member_id, to_member_id, type_id, note}
//   systems[0]             {id, name, description, color, avatar_asset_id, banner_asset_id}

// Same normalisation as simplyPlural.js — coerce a colour to a leading "#".
export function normalizeColor(raw) {
  if (!raw) return "";
  const s = raw.toString().trim();
  if (!s) return "";
  return s.startsWith("#") ? s : `#${s}`;
}

// Map OpenPlural custom-field types to the local CustomField.field_type values.
// OpenPlural only emits "text" and "date"; the local model has no native date
// type, so dates land as text (the value is already a string anyway).
const OP_TYPE_MAP = {
  text: "text",
  date: "text",
  string: "text",
  number: "number",
  boolean: "boolean",
};

export function opFieldType(opType) {
  return OP_TYPE_MAP[opType] || "text";
}

// Build a memberId → [{id, name, color}] map from group_memberships + groups,
// mirroring the `groups` shape mapMemberToAlter writes in simplyPlural.js /
// pluralKit.js (alter.groups is an array of {id, name, color}).
export function buildMemberGroups(groups = [], groupMemberships = []) {
  const groupsById = {};
  for (const g of groups) {
    if (g && g.id) groupsById[g.id] = g;
  }
  const byMember = {};
  for (const gm of groupMemberships) {
    if (!gm || !gm.member_id || !gm.group_id) continue;
    const g = groupsById[gm.group_id];
    if (!g) continue;
    if (!byMember[gm.member_id]) byMember[gm.member_id] = [];
    byMember[gm.member_id].push({
      id: g.id,
      name: g.name || "",
      color: normalizeColor(g.color),
    });
  }
  return byMember;
}

// Build a (member_id) → { localFieldId: value } map from custom_field_values,
// remapping the OpenPlural field id to the LOCAL CustomField id via fieldIdMap.
// alter.custom_fields is keyed by local CustomField id (see InfoTab.jsx —
// `customFieldValues[field.id]`), exactly like the SP importer's remap.
// OpenPlural emits one string per (field, member) even for "multiple" fields,
// so we just take the string. If multiple values exist for the same field on
// the same member, join them so nothing is silently dropped.
export function buildMemberCustomFields(customFieldValues = [], fieldIdMap = {}) {
  const byMember = {};
  for (const v of customFieldValues) {
    if (!v || v.subject_type !== "member") continue;
    const memberId = v.subject_id;
    const localFieldId = fieldIdMap[v.field_id];
    if (!memberId || localFieldId === undefined || v.value == null) continue;
    if (!byMember[memberId]) byMember[memberId] = {};
    const existing = byMember[memberId][localFieldId];
    byMember[memberId][localFieldId] = existing
      ? `${existing}, ${v.value}`
      : String(v.value);
  }
  return byMember;
}

// Resolve a member's avatar URL from its avatar_asset_id → assets[].uri.
// Returns the relative "media/<file>" uri (the connector turns that into a
// local-image:// URI after pulling the blob out of the zip). Returns "" when
// there's no avatar or no media available (raw-JSON imports).
export function resolveAssetUri(assetId, assetsById = {}) {
  if (!assetId) return "";
  const asset = assetsById[assetId];
  return asset?.uri || "";
}

// member → Alter. Mirrors mapMemberToAlter in simplyPlural.js: same field
// names (name, pronouns, description, color, avatar_url, banner_url, role,
// custom_fields, tags, groups, is_archived), plus op_id for dedup.
//   - display_name → alias (OS distinguishes name vs alias)
//   - banner doubles as the alter profile header via the `_header_image`
//     custom-field key that ProfileTab reads (same as the SP mapper).
// avatar/banner are passed in pre-resolved (the connector resolves the asset
// uri → local image and injects the final URLs) — this keeps the mapper pure.
export function mapMemberToAlter(member, opts = {}) {
  const {
    memberGroups = [],
    customFields = {},
    avatarUrl = "",
    bannerUrl = "",
  } = opts;
  const opId = member.id || "";

  const cf = { ...customFields };
  if (bannerUrl) cf._header_image = bannerUrl;

  return {
    op_id: opId,
    name: member.name || "Unknown",
    alias: member.display_name || "",
    pronouns: member.pronouns || "",
    description: member.description || "",
    color: normalizeColor(member.color),
    avatar_url: avatarUrl,
    banner_url: bannerUrl,
    role: "",
    custom_fields: cf,
    tags: [],
    groups: memberGroups,
    is_archived: member.archived === true,
  };
}

// group → Group. Mirrors mapGroupToLocalGroup in simplyPlural.js: name, color,
// description, op_id, plus the parent id captured for the second nesting pass.
// `parent` is resolved by the connector after all groups exist (op_parent_id →
// the created parent Group's local id).
export function mapGroupToLocalGroup(group) {
  return {
    op_id: group.id || "",
    name: group.name || "Unnamed Group",
    color: normalizeColor(group.color),
    description: group.description || "",
    op_parent_id: group.parent_group_id || "",
    parent: "",
  };
}

// front_period assignment → FrontingSession (one per assignment, so a
// co-fronting period produces multiple sessions). Honors OpenPlural's explicit
// front_role: only "primary" maps to is_primary (PK/SP have no primary concept,
// but OpenPlural does). Returns null when the assignment's member didn't import.
export function mapFrontAssignment(period, assignment, alterIdByOpId) {
  const memberId = assignment?.member_id;
  if (!memberId) return null;
  const alterId = alterIdByOpId[memberId];
  if (!alterId) return null;

  const startTime = period.started_at ? new Date(period.started_at).toISOString() : null;
  if (!startTime) return null;

  const endTime = period.ended_at ? new Date(period.ended_at).toISOString() : null;

  // Compose a single op id per (period, member) so re-imports dedup exactly.
  const opFrontId = `${period.id || ""}:${memberId}`;

  return {
    alter_id: alterId,
    is_primary: assignment.front_role === "primary",
    start_time: startTime,
    end_time: endTime,
    is_active: !period.ended_at,
    note: assignment.note || period.note || "",
    source: "openplural",
    op_front_id: opFrontId,
  };
}

// note → JournalEntry. Uses the same JournalEntry fields the in-app editor /
// SwitchJournalModal write (title, content, entry_type, tags, author_alter_id,
// allowed_alter_ids). The note's member subject becomes author_alter_id (the
// alter the note is "about"/by); we also stamp a `created_date` so it lands on
// the timeline at the right time, and op_id for dedup.
export function mapNoteToJournalEntry(note, alterIdByOpId) {
  const opId = note.id || "";
  const authorAlterId = alterIdByOpId[note.member_id] || "";
  const title = (note.title || "").trim();
  const body = (note.body || "").trim();
  if (!title && !body) return null;

  // Prefer the precise created_at timestamp; fall back to entry_date (a
  // YYYY-MM-DD string) so the entry still sorts onto the right day.
  const when = note.created_at || note.entry_date || null;
  const createdDate = when ? new Date(when).toISOString() : new Date().toISOString();

  return {
    op_id: opId,
    title: title || "Imported note",
    content: body,
    entry_type: "personal",
    tags: ["imported"],
    author_alter_id: authorAlterId,
    allowed_alter_ids: [],
    created_date: createdDate,
  };
}

// relationships.edge → AlterRelationship. AlterRelationship uses alter_id_a /
// alter_id_b + relationship_type (a LABEL string) + direction (see
// RelationshipsTab / CreateRelationshipModal). relationships.types may be
// empty; the connector resolves type_id → a label via a types map and passes
// it in, falling back to "Related" when unresolved. Returns null when either
// endpoint didn't import.
export function mapRelationshipEdge(edge, alterIdByOpId, typeLabel) {
  const aId = alterIdByOpId[edge.from_member_id];
  const bId = alterIdByOpId[edge.to_member_id];
  if (!aId || !bId) return null;
  return {
    op_id: edge.id || "",
    alter_id_a: aId,
    alter_id_b: bId,
    relationship_type: typeLabel || "Related",
    direction: "a_to_b",
    notes: edge.note || "",
  };
}

// ── Zip / file parsing ───────────────────────────────────────────────────────

// Parse a user-picked OpenPlural file. Accepts either a .zip (openplural.json
// + manifest.json + media/) or a raw .json (already-extracted openplural.json,
// in which case media/avatars are unavailable). fflate is dynamically imported
// inside this guard so it stays out of the base web bundle (CLAUDE.md
// native-dep rule).
//
// Returns: { data, media } where `data` is the parsed openplural object and
// `media` is a Map of "media/<file>" uri → { bytes: Uint8Array, mime } for
// every file under media/. For raw .json, media is an empty Map.
export async function parseOpenPluralFile(file) {
  const name = (file.name || "").toLowerCase();
  const isJson = name.endsWith(".json");

  if (isJson) {
    const text = await file.text();
    const data = JSON.parse(text);
    return { data, media: new Map() };
  }

  // Treat everything else as a zip.
  const fflate = await import("fflate");
  const buf = new Uint8Array(await file.arrayBuffer());
  const unzipped = await new Promise((resolve, reject) => {
    fflate.unzip(buf, (err, files) => (err ? reject(err) : resolve(files)));
  });

  // Locate openplural.json — exact name first, then any *.json that parses as
  // an OpenPlural document (in case it's nested in a top-level folder).
  let jsonEntry = unzipped["openplural.json"];
  if (!jsonEntry) {
    const key = Object.keys(unzipped).find((k) => k.replace(/^.*\//, "") === "openplural.json");
    if (key) jsonEntry = unzipped[key];
  }
  if (!jsonEntry) {
    throw new Error("No openplural.json found in the .zip — is this an OpenPlural export?");
  }

  const decoder = new TextDecoder("utf-8");
  const data = JSON.parse(decoder.decode(jsonEntry));

  // Index media by both the in-zip path and the canonical "media/<file>" uri so
  // asset.uri lookups resolve regardless of any leading folder in the archive.
  const media = new Map();
  for (const [path, bytes] of Object.entries(unzipped)) {
    const idx = path.indexOf("media/");
    if (idx === -1) continue;
    if (path.endsWith("/")) continue; // skip directory entries
    const canonical = path.slice(idx); // "media/<file>"
    const fileName = canonical.slice("media/".length);
    if (!fileName) continue;
    const entry = { bytes, mime: mimeFromName(fileName) };
    media.set(canonical, entry);
    media.set(path, entry);
  }

  return { data, media };
}

function mimeFromName(fileName) {
  const ext = (fileName.split(".").pop() || "").toLowerCase();
  switch (ext) {
    case "png": return "image/png";
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "gif": return "image/gif";
    case "webp": return "image/webp";
    case "svg": return "image/svg+xml";
    case "avif": return "image/avif";
    default: return "application/octet-stream";
  }
}
