// OpenPlural v0.1 exporter — the inverse of src/lib/openPlural.js (the
// importer). Produces a portable .zip (manifest.json + openplural.json +
// media/) that other OpenPlural apps (PluralSpace, etc.) can read, and that
// re-imports cleanly into Oceans Symphony itself: the importer dedups on
// `op_id`, so every record we write reuses the local record's existing
// `op_id` when it has one (records that came in via an OpenPlural import) and
// mints a fresh `crypto.randomUUID()` otherwise. Round-trip invariant:
//   export → re-import reproduces the data (matched on op_id, never
//   duplicated).
//
// Field-name mapping is the exact inverse of openPlural.js's mappers — see the
// per-section comments. The builder is pure (no IDB writes); image bytes are
// resolved separately in exportOpenPluralZip so buildOpenPluralDocument can be
// unit-tested without the browser image stack.

import { resolveImageUrl } from "@/lib/imageUrlResolver";
import { shareFile } from "@/lib/shareFile";
import { APP_VERSION } from "@/lib/appVersion";

const OPENPLURAL_VERSION = "0.1";
const EXPORTER_VERSION = "0.1";
const PRODUCER_APP = "Oceans Symphony";
const PRODUCER_APP_ID = "oceans-symphony";

// Stable id helper: prefer an existing op_id (so re-import dedups onto the same
// record), else a fresh UUID. crypto.randomUUID exists in every supported
// browser + the Capacitor WebView; fall back to a manual v4 for very old
// environments / test runners.
function genId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // RFC4122-ish fallback — only hit when crypto.randomUUID is unavailable.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function idFor(record) {
  return (record && record.op_id) ? record.op_id : genId();
}

function toIso(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function nowIso() {
  return new Date().toISOString();
}

// Inverse of openPlural.js's `field_type` mapping (opFieldType): the local
// CustomField.field_type is already one of text/number/boolean, and OpenPlural
// v0.1 understands exactly those (plus "date", which we never emit).
function exportFieldType(localType) {
  if (localType === "number") return "number";
  if (localType === "boolean") return "boolean";
  return "text";
}

// Slugify a system name for the .zip filename. Mirrors AlterExportModal's
// fileBase().
export function systemNameSlug(name) {
  return (name || "system")
    .replace(/[^a-z0-9]+/gi, "-")
    .toLowerCase()
    .replace(/^-|-$/g, "") || "system";
}

// Pick the file extension for an asset from its URL / mime so the media/<file>
// name is sensible (the importer reads mime from the extension via mimeFromName).
function extFromUrlOrMime(url, mime) {
  const m = (mime || "").toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("gif")) return "gif";
  if (m.includes("webp")) return "webp";
  if (m.includes("svg")) return "svg";
  if (m.includes("avif")) return "avif";
  // Fall back to the data-URL / path extension.
  const head = (url || "").slice(0, 40).toLowerCase();
  if (head.startsWith("data:image/")) {
    const slash = head.indexOf("/");
    const semi = head.indexOf(";");
    if (slash >= 0 && semi > slash) {
      const sub = head.slice(slash + 1, semi);
      if (sub === "jpeg") return "jpg";
      if (sub) return sub;
    }
  }
  const clean = (url || "").split("?")[0];
  const dot = clean.lastIndexOf(".");
  if (dot >= 0 && dot > clean.length - 6) return clean.slice(dot + 1).toLowerCase();
  return "png";
}

function mimeFromExt(ext) {
  switch ((ext || "").toLowerCase()) {
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

// Build the OpenPlural document (pure). Returns { doc, assets } where `assets`
// is a list of { assetId, sourceUrl, fileName, mime, kind } describing every
// image we referenced from a member/system avatar or banner; exportOpenPluralZip
// resolves each sourceUrl to bytes and writes media/<fileName>. The doc's
// assets[] entries are pre-built here (with the same ids + uris) and trimmed in
// exportOpenPluralZip if their bytes can't be resolved.
//
// Inputs (all arrays, defaulting to []):
//   alters, groups, customFields, frontingSessions, journalEntries,
//   alterNotes, relationships, systemSettings (the SystemSettings list — [0] is
//   read for the system identity), chatChannels, chatCategories, chatMessages
//   (the system-chat entities).
export function buildOpenPluralDocument({
  alters = [],
  groups = [],
  customFields = [],
  frontingSessions = [],
  journalEntries = [],
  alterNotes = [],
  relationships = [],
  systemSettings = [],
  chatChannels = [],
  chatCategories = [],
  chatMessages = [],
} = {}) {
  const exportedAt = nowIso();

  // Accumulator for every image we want in media/. Keyed by sourceUrl so the
  // same image referenced twice (e.g. an avatar reused) only produces one asset.
  const assetByUrl = new Map(); // sourceUrl → { assetId, fileName, mime, kind }
  const pendingAssets = []; // ordered list for media resolution

  function referenceAsset(sourceUrl, kind) {
    if (!sourceUrl) return null;
    if (assetByUrl.has(sourceUrl)) return assetByUrl.get(sourceUrl).assetId;
    const assetId = genId();
    const ext = extFromUrlOrMime(sourceUrl, "");
    const mime = mimeFromExt(ext);
    const fileName = `${assetId}.${ext}`;
    const entry = { assetId, sourceUrl, fileName, mime, kind };
    assetByUrl.set(sourceUrl, entry);
    pendingAssets.push(entry);
    return assetId;
  }

  // ── System identity → systems[0] ──
  // Read the same fields useSystemIdentity / Settings.jsx use.
  const settings = systemSettings.find((r) => r && (
    (r.system_name && String(r.system_name).trim()) ||
    (r.system_description && String(r.system_description).trim()) ||
    (r.system_bio && String(r.system_bio).trim()) ||
    (r.system_avatar_url && String(r.system_avatar_url).trim())
  )) || systemSettings[0] || {};

  const systemId = settings.op_id || genId();
  const systemName = (settings.system_name && settings.system_name.trim()) || "My System";
  const systemDescription = settings.system_bio || settings.system_description || "";
  const systemColor = settings.system_color || settings.theme_color || null;
  const systemAvatarAssetId = referenceAsset(settings.system_avatar_url || "", "avatar");
  const systemBannerAssetId = referenceAsset(settings.system_banner_url || "", "banner");

  // Terminology → extensions.terminology, so a round-trip (and other apps that
  // understand it) can fill empty term fields. Only emit terms the user has
  // actually customised (a non-empty term_* field on SystemSettings).
  const termFields = {
    system: settings.term_system,
    alter: settings.term_alter,
    switch: settings.term_switch,
    front: settings.term_front,
    fronting: settings.term_fronting,
    fronter: settings.term_fronter,
    switching: settings.term_switching,
  };
  const terminology = {};
  for (const [key, val] of Object.entries(termFields)) {
    if (val && String(val).trim()) terminology[key] = String(val).trim();
  }
  const systemExtensions = Object.keys(terminology).length > 0 ? { terminology } : {};

  const systems = [{
    id: systemId,
    name: systemName,
    description: systemDescription || "",
    color: systemColor || null,
    avatar_asset_id: systemAvatarAssetId,
    banner_asset_id: systemBannerAssetId,
    archived: false,
    privacy: { visibility: "private" },
    source_refs: [],
    extensions: systemExtensions,
  }];

  // ── Taxonomy accumulator (roles + tags) ──
  // OpenPlural represents role + tags as taxonomy_terms (deduped by kind+name)
  // referenced from taxonomy_assignments. Inverse of buildMemberTaxonomy:
  // alter.role → a kind:"role" term; each alter.tags[] entry → a kind:"tag"
  // term. Terms are shared across members (dedup), assignments link them.
  const taxonomyTerms = [];
  const taxonomyAssignments = [];
  const termIdByKindName = {}; // `${kind}:${nameLower}` → term id
  function referenceTerm(kind, name) {
    const clean = (name || "").toString().trim();
    if (!clean) return null;
    const key = `${kind}:${clean.toLowerCase()}`;
    let id = termIdByKindName[key];
    if (!id) {
      id = genId();
      termIdByKindName[key] = id;
      taxonomyTerms.push({
        id,
        system_id: systemId,
        kind,
        name: clean,
        color: null,
        source_refs: [],
        extensions: {},
      });
    }
    return id;
  }
  function assignTerm(termId, memberId) {
    if (!termId || !memberId) return;
    taxonomyAssignments.push({
      id: genId(),
      term_id: termId,
      subject_type: "member",
      subject_id: memberId,
      source_refs: [],
      extensions: {},
    });
  }

  // ── Alters → members ──
  // Inverse of mapMemberToAlter: name, display_name←alias, pronouns,
  // description, color, avatar_asset_id←avatar_url, banner_asset_id←
  // banner_url||custom_fields._header_image, archived←is_archived,
  // proxy_tags←alias, age←age, birthday←birthday. role/tags → taxonomy.
  const memberIdByAlterId = {}; // local Alter.id → exported member id
  const members = [];
  alters.forEach((alter, index) => {
    if (!alter || !alter.id) return;
    const memberId = idFor(alter);
    memberIdByAlterId[alter.id] = memberId;

    const avatarAssetId = referenceAsset(alter.avatar_url || "", "avatar");
    // Banner: the dedicated banner_url field, else the `_header_image`
    // custom-field key the importer uses to round-trip the profile header.
    const headerImage = alter.custom_fields && alter.custom_fields._header_image;
    const bannerSource = alter.banner_url || headerImage || "";
    const bannerAssetId = referenceAsset(bannerSource, "banner");

    // proxy_tags from alias (PluralKit-style {prefix, suffix}); age + birthday
    // pass through. birthday is emitted as the spec object when set.
    const alias = (alter.alias || "").toString().trim();
    const proxyTags = alias ? [{ prefix: alias, suffix: null }] : [];
    const ageRaw = alter.age;
    const age = (ageRaw != null && String(ageRaw).trim() !== "") ? String(ageRaw).trim() : null;
    const birthdayRaw = (alter.birthday || "").toString().trim();
    const birthday = birthdayRaw
      ? { value: birthdayRaw, precision: "day", year_visible: true }
      : null;

    members.push({
      id: memberId,
      system_id: systemId,
      name: alter.name || "Unknown",
      display_name: alter.alias || null,
      pronouns: alter.pronouns || null,
      description: alter.description || null,
      color: alter.color || null,
      avatar_asset_id: avatarAssetId,
      banner_asset_id: bannerAssetId,
      is_custom_front: false,
      archived: alter.is_archived === true,
      created_at: toIso(alter.created_date) || exportedAt,
      sort_order: index,
      proxy_tags: proxyTags,
      age,
      birthday,
      privacy: { visibility: "private" },
      source_refs: [],
      extensions: {},
    });

    // role → kind:"role" taxonomy term; tags[] → kind:"tag" terms.
    const roleId = referenceTerm("role", alter.role);
    if (roleId) assignTerm(roleId, memberId);
    const alterTags = Array.isArray(alter.tags) ? alter.tags : [];
    for (const tag of alterTags) {
      const tagId = referenceTerm("tag", tag);
      if (tagId) assignTerm(tagId, memberId);
    }
  });

  // ── Groups → groups ──
  // Inverse of mapGroupToLocalGroup. OS Group.parent stores a LOCAL Group id
  // (or "root"/empty for top-level); subsystems use owner_alter_id (no group
  // parent). Build groupIdByOsId first, then resolve parent_group_id in a
  // second pass.
  const groupIdByOsId = {}; // local Group.id → exported group id
  const exportedGroups = [];
  groups.forEach((group, index) => {
    if (!group || !group.id) return;
    const gId = idFor(group);
    groupIdByOsId[group.id] = gId;
    exportedGroups.push({
      id: gId,
      system_id: systemId,
      name: group.name || "Unnamed Group",
      description: group.description || null,
      color: group.color || null,
      parent_group_id: null, // resolved below
      sort_order: index,
      source_refs: [],
      extensions: {},
      _osParent: group.parent, // scratch — stripped below
    });
  });
  for (const eg of exportedGroups) {
    const osParent = eg._osParent;
    delete eg._osParent;
    // "root"/empty → top-level; a real local group id → its exported id;
    // anything else (owner_alter_id subsystem, orphan) → null per spec.
    if (osParent && osParent !== "root" && groupIdByOsId[osParent]) {
      eg.parent_group_id = groupIdByOsId[osParent];
    } else {
      eg.parent_group_id = null;
    }
  }

  // ── group_memberships ──
  // alter.groups is [{id, name, color}] where id is the LOCAL Group id. Emit a
  // membership per (alter, group) pair, deduped, skipping unresolved sides.
  const groupMemberships = [];
  const seenMembership = new Set();
  for (const alter of alters) {
    if (!alter || !alter.id) continue;
    const memberId = memberIdByAlterId[alter.id];
    if (!memberId) continue;
    const groupRefs = Array.isArray(alter.groups) ? alter.groups : [];
    for (const ref of groupRefs) {
      const osGroupId = ref && (typeof ref === "object" ? ref.id : ref);
      if (!osGroupId) continue;
      const exportedGroupId = groupIdByOsId[osGroupId];
      if (!exportedGroupId) continue;
      const key = `${exportedGroupId}:${memberId}`;
      if (seenMembership.has(key)) continue;
      seenMembership.add(key);
      groupMemberships.push({
        id: genId(),
        group_id: exportedGroupId,
        member_id: memberId,
        source_refs: [],
        extensions: {},
      });
    }
  }

  // ── CustomField → custom_fields ──
  // Inverse of opFieldType. Build fieldIdByOsId (local CustomField.id →
  // exported field id) so custom_field_values can remap.
  const fieldIdByOsId = {};
  const exportedCustomFields = [];
  customFields.forEach((cf, index) => {
    if (!cf || !cf.id) return;
    const fId = idFor(cf);
    fieldIdByOsId[cf.id] = fId;
    exportedCustomFields.push({
      id: fId,
      system_id: systemId,
      name: cf.name || "Unnamed Field",
      field_type: exportFieldType(cf.field_type),
      supports_markdown: false,
      sort_order: typeof cf.order === "number" ? cf.order : index,
      privacy: { visibility: "public" },
      source_refs: [],
      extensions: {},
    });
  });

  // ── custom_field_values ──
  // alter.custom_fields is keyed by LOCAL CustomField id → value. Skip keys
  // starting with "_" (OS-internal, e.g. _header_image — handled as a banner
  // asset). Skip keys that don't map to a real exported field.
  const customFieldValues = [];
  for (const alter of alters) {
    if (!alter || !alter.id) continue;
    const memberId = memberIdByAlterId[alter.id];
    if (!memberId) continue;
    const cfMap = alter.custom_fields && typeof alter.custom_fields === "object"
      ? alter.custom_fields
      : {};
    for (const [key, value] of Object.entries(cfMap)) {
      if (!key || key.startsWith("_")) continue;
      const exportedFieldId = fieldIdByOsId[key];
      if (!exportedFieldId) continue;
      if (value == null || value === "") continue;
      customFieldValues.push({
        id: null,
        field_id: exportedFieldId,
        subject_type: "member",
        subject_id: memberId,
        value: String(value),
        source_refs: [],
        extensions: {},
      });
    }
  }

  // ── FrontingSession → front_periods ──
  // Inverse of mapFrontAssignment: one period per session, single assignment.
  // Legacy rows: alter_id || primary_alter_id. front_role from is_primary.
  const frontPeriods = [];
  for (const session of frontingSessions) {
    if (!session) continue;
    const osAlterId = session.alter_id || session.primary_alter_id;
    if (!osAlterId) continue;
    const memberId = memberIdByAlterId[osAlterId];
    if (!memberId) continue; // alter didn't export
    const startedAt = toIso(session.start_time);
    if (!startedAt) continue;
    frontPeriods.push({
      id: genId(),
      system_id: systemId,
      source_kind: "interval",
      started_at: startedAt,
      ended_at: toIso(session.end_time) || null,
      note: null,
      assignments: [{
        member_id: memberId,
        front_role: session.is_primary ? "primary" : "secondary",
        note: null,
        source_refs: [],
      }],
      source_refs: [],
      extensions: {},
    });
  }

  // ── JournalEntry + AlterNote → notes ──
  // JournalEntry: member_id←author_alter_id, body←content, note_kind:"journal".
  // AlterNote: member_id←alter_id, body←content, note_kind:"note" (a per-member
  // profile note). Both carry `pinned` and stamp note_kind under
  // extensions.openplural so the importer routes them back to the right target.
  const notes = [];
  for (const je of journalEntries) {
    if (!je || !je.id) continue;
    const noteId = idFor(je);
    const authorMemberId = memberIdByAlterId[je.author_alter_id] || null;
    const createdAt = toIso(je.created_date) || exportedAt;
    const updatedAt = toIso(je.updated_date) || createdAt;
    const entryDate = createdAt.slice(0, 10); // YYYY-MM-DD
    notes.push({
      id: noteId,
      system_id: systemId,
      member_id: authorMemberId,
      author_member_ids: [authorMemberId].filter(Boolean),
      title: je.title || "",
      body: je.content || "",
      created_at: createdAt,
      updated_at: updatedAt,
      entry_date: entryDate,
      pinned: je.pinned === true,
      visibility: "private",
      source_refs: [],
      // `kind` kept for back-compat with the prior exporter; openplural.note_kind
      // is the spec-canonical location the importer reads.
      extensions: { kind: "journal", openplural: { note_kind: "journal" } },
    });
  }
  for (const an of alterNotes) {
    if (!an || !an.id) continue;
    const memberId = memberIdByAlterId[an.alter_id] || null;
    if (!memberId) continue; // alter didn't export — drop the orphan note
    const noteId = idFor(an);
    const createdAt = toIso(an.created_date) || exportedAt;
    const updatedAt = toIso(an.updated_date) || createdAt;
    const entryDate = createdAt.slice(0, 10);
    notes.push({
      id: noteId,
      system_id: systemId,
      member_id: memberId,
      author_member_ids: [memberId],
      title: "",
      body: an.content || "",
      created_at: createdAt,
      updated_at: updatedAt,
      entry_date: entryDate,
      pinned: an.pinned === true,
      visibility: "private",
      source_refs: [],
      extensions: { kind: "note", openplural: { note_kind: "note" } },
    });
  }

  // ── AlterRelationship → relationships{types,edges} ──
  // Inverse of mapRelationshipEdge: from_member_id←alter_id_a,
  // to_member_id←alter_id_b. relationship_type is a LABEL string locally;
  // synthesize one type per distinct label and reference its id from edges.
  const relTypeIdByLabel = {};
  const relationshipTypes = [];
  const relationshipEdges = [];
  for (const rel of relationships) {
    if (!rel) continue;
    const aId = memberIdByAlterId[rel.alter_id_a];
    const bId = memberIdByAlterId[rel.alter_id_b];
    if (!aId || !bId) continue; // endpoint didn't export
    const label = (rel.relationship_type === "Custom"
      ? (rel.custom_label || "Custom")
      : rel.relationship_type) || "Related";
    let typeId = relTypeIdByLabel[label];
    if (!typeId) {
      typeId = genId();
      relTypeIdByLabel[label] = typeId;
      relationshipTypes.push({ id: typeId, system_id: systemId, name: label });
    }
    relationshipEdges.push({
      id: idFor(rel),
      system_id: systemId,
      from_member_id: aId,
      to_member_id: bId,
      type_id: typeId,
      note: rel.notes || "",
    });
  }

  // ── System chat → chat.{conversations, messages, categories} ──
  // OS SystemChatChannel → conversation (kind:"channel"); SystemChatCategory →
  // a chat.categories[] extension entry (OpenPlural v0.1 has no first-class chat
  // category, so we carry it as an extension and reference it from the
  // conversation's extensions.category_id). SystemChatMessage → chat.messages[].
  // Soft-deleted messages (deleted_at set) are skipped. Author resolves through
  // memberIdByAlterId; a null author (system message) stays null. reply_to_id is
  // remapped to the exported message id. Whisper metadata + private-channel
  // members + sort order ride along in extensions so a round-trip restores them.
  const chatCategories2 = [];
  const conversationIdByChannelId = {}; // local channel id → exported conversation id
  const chatCategoryIdByLocalId = {};   // local category id → exported category id

  for (const cat of chatCategories) {
    if (!cat || !cat.id) continue;
    const catId = idFor(cat);
    chatCategoryIdByLocalId[cat.id] = catId;
    chatCategories2.push({
      id: catId,
      system_id: systemId,
      name: cat.name || "",
      color: cat.color || null,
      // parent resolved in a second pass once every category has an exported id.
      parent_category_id: null,
      sort_order: typeof cat.sort_order === "number" ? cat.sort_order : 0,
      source_refs: [],
      extensions: {
        collapsed: cat.collapsed === true,
        _osParent: cat.parent_category_id || null, // scratch — stripped below
      },
    });
  }
  for (const ec of chatCategories2) {
    const osParent = ec.extensions._osParent;
    delete ec.extensions._osParent;
    ec.parent_category_id = (osParent && chatCategoryIdByLocalId[osParent])
      ? chatCategoryIdByLocalId[osParent]
      : null;
  }

  const conversations = [];
  chatChannels.forEach((channel, index) => {
    if (!channel || !channel.id) return;
    const convId = idFor(channel);
    conversationIdByChannelId[channel.id] = convId;
    const exportedCatId = channel.category_id
      ? (chatCategoryIdByLocalId[channel.category_id] || null)
      : null;
    // Private-channel member ids → exported member ids (drop any that didn't export).
    const memberAlterIds = Array.isArray(channel.member_alter_ids) ? channel.member_alter_ids : [];
    const exportedMemberIds = memberAlterIds
      .map((id) => memberIdByAlterId[id])
      .filter(Boolean);
    conversations.push({
      id: convId,
      system_id: systemId,
      name: channel.name || "",
      description: channel.description || null,
      kind: "channel",
      source_refs: [],
      extensions: {
        category_id: exportedCatId,
        color: channel.color || null,
        sort_order: typeof channel.sort_order === "number" ? channel.sort_order : index,
        is_archived: channel.is_archived === true,
        is_private: channel.is_private === true,
        member_member_ids: exportedMemberIds,
      },
    });
  });

  // Message id map (built first so reply_to_id can point at exported ids even
  // when a reply precedes its parent in iteration order).
  const liveMessages = chatMessages.filter((m) => m && m.id && !m.deleted_at);
  const messageIdByLocalId = {}; // local message id → exported message id
  for (const msg of liveMessages) {
    messageIdByLocalId[msg.id] = idFor(msg);
  }

  const chatMessages2 = [];
  for (const msg of liveMessages) {
    const convId = conversationIdByChannelId[msg.channel_id];
    if (!convId) continue; // channel didn't export (deleted / archived-only) — drop the orphan
    // Author: prefer the single author_alter_id, then the first of author_alter_ids.
    const osAuthorId = msg.author_alter_id
      || (Array.isArray(msg.author_alter_ids) ? msg.author_alter_ids[0] : null)
      || null;
    const authorMemberId = osAuthorId ? (memberIdByAlterId[osAuthorId] || null) : null;
    // All co-authors → exported member ids (multi-speaker signposts).
    const authorMemberIds = (Array.isArray(msg.author_alter_ids) ? msg.author_alter_ids : [])
      .map((id) => memberIdByAlterId[id])
      .filter(Boolean);
    const mentionedMemberIds = (Array.isArray(msg.mentioned_alter_ids) ? msg.mentioned_alter_ids : [])
      .map((id) => memberIdByAlterId[id])
      .filter(Boolean);
    const whisperMemberIds = (Array.isArray(msg.whisper_to_ids) ? msg.whisper_to_ids : [])
      .map((id) => memberIdByAlterId[id])
      .filter(Boolean);
    chatMessages2.push({
      id: messageIdByLocalId[msg.id],
      conversation_id: convId,
      author_member_id: authorMemberId,
      body: msg.content || "",
      created_at: toIso(msg.timestamp) || exportedAt,
      edited_at: toIso(msg.edited_at),
      reply_to_id: msg.reply_to_id ? (messageIdByLocalId[msg.reply_to_id] || null) : null,
      source_refs: [],
      extensions: {
        is_whisper: msg.is_whisper === true,
        whisper_to_member_ids: whisperMemberIds,
        author_member_ids: authorMemberIds,
        mentioned_member_ids: mentionedMemberIds,
      },
    });
  }

  // ── assets[] (built from referenced images; bytes resolved by caller) ──
  const assets = pendingAssets.map((a) => ({
    id: a.assetId,
    kind: a.kind,
    mime_type: a.mime,
    file_name: a.fileName,
    size_bytes: 0, // filled in once bytes are resolved
    sha256: null,
    uri: `media/${a.fileName}`,
    source_refs: [],
    extensions: {},
  }));

  const doc = {
    openplural_version: OPENPLURAL_VERSION,
    exported_at: exportedAt,
    producer: {
      app: PRODUCER_APP,
      app_version: APP_VERSION,
      exporter_version: EXPORTER_VERSION,
      app_id: PRODUCER_APP_ID,
    },
    capabilities: { modules: ["relationships", "taxonomy", "notes", "chat"] },
    systems,
    members,
    groups: exportedGroups,
    group_memberships: groupMemberships,
    taxonomy_terms: taxonomyTerms,
    taxonomy_assignments: taxonomyAssignments,
    custom_fields: exportedCustomFields,
    custom_field_values: customFieldValues,
    notes,
    assets,
    front_periods: frontPeriods,
    front_events: [],
    front_comments: [],
    chat: {
      conversations,
      messages: chatMessages2,
      categories: chatCategories2,
      attachments: [],
      reactions: [],
    },
    relationships: { types: relationshipTypes, edges: relationshipEdges },
    polls: { polls: [] },
    boards: { posts: [] },
    reminders: null,
    habits: null,
    proxy: null,
    sharing: null,
    safety: null,
    extensions: {},
    warnings: [],
  };

  return {
    doc,
    systemName,
    // pendingAssets carries the source URLs the caller resolves to bytes.
    assets: pendingAssets,
  };
}

// Resolve one image URL (local-image://, /local-image/, http, data:) to raw
// bytes. Mirrors AlterExportModal.resolveToDataUrl but returns a Uint8Array +
// the resolved mime so we can write real image bytes into the zip. Returns null
// when the image can't be resolved — the caller drops the asset rather than
// failing the whole export.
async function resolveImageBytes(sourceUrl) {
  try {
    const resolved = await resolveImageUrl(sourceUrl);
    if (!resolved) return null;
    const res = await fetch(resolved);
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (!buf || buf.length === 0) return null;
    const mime = res.headers.get("content-type") || "";
    return { bytes: buf, mime };
  } catch (e) {
    console.warn("[OpenPlural export] image resolve failed", sourceUrl, e?.message || e);
    return null;
  }
}

// Build the full export: resolve asset bytes, assemble the zip files object,
// zip via fflate (dynamically imported, native-dep rule), and return a Blob.
// Returns { blob, doc, systemName, assetsWritten, assetsSkipped }.
export async function buildOpenPluralZipBlob(entities = {}) {
  const { doc, systemName, assets } = buildOpenPluralDocument(entities);

  // Resolve every referenced image to bytes. Keep the assets[] entries whose
  // bytes resolved; for any that fail, drop the asset and null out the
  // referencing *_asset_id so the document stays consistent.
  const files = {};
  const resolvedAssetIds = new Set();
  let assetsWritten = 0;
  let assetsSkipped = 0;

  for (const asset of assets) {
    const result = await resolveImageBytes(asset.sourceUrl);
    if (!result || !result.bytes) {
      assetsSkipped++;
      continue;
    }
    files[`media/${asset.fileName}`] = result.bytes;
    resolvedAssetIds.add(asset.assetId);
    // Update the doc's asset entry with the real size + a refined mime if the
    // server reported one.
    const docAsset = doc.assets.find((a) => a.id === asset.assetId);
    if (docAsset) {
      docAsset.size_bytes = result.bytes.length;
      if (result.mime && result.mime.startsWith("image/")) docAsset.mime_type = result.mime;
    }
    assetsWritten++;
  }

  // Drop unresolved assets from the manifest and null their references.
  if (assetsSkipped > 0) {
    const drop = (id) => id && !resolvedAssetIds.has(id) ? null : id;
    doc.assets = doc.assets.filter((a) => resolvedAssetIds.has(a.id));
    for (const m of doc.members) {
      m.avatar_asset_id = drop(m.avatar_asset_id);
      m.banner_asset_id = drop(m.banner_asset_id);
    }
    for (const s of doc.systems) {
      s.avatar_asset_id = drop(s.avatar_asset_id);
      s.banner_asset_id = drop(s.banner_asset_id);
    }
  }

  const manifest = {
    export_date: doc.exported_at,
    system_name: systemName,
    format_version: OPENPLURAL_VERSION,
    producer: PRODUCER_APP,
  };

  const encoder = new TextEncoder();
  files["manifest.json"] = encoder.encode(JSON.stringify(manifest, null, 2));
  files["openplural.json"] = encoder.encode(JSON.stringify(doc, null, 2));

  // Dynamic import keeps fflate out of the base bundle path until export runs.
  const { zipSync } = await import("fflate");
  const zipped = zipSync(files, { level: 6 });
  // zipSync returns a Uint8Array view; copy to a fresh ArrayBuffer slice so the
  // Blob owns contiguous bytes regardless of the view's byteOffset.
  const blob = new Blob([zipped.slice()], { type: "application/zip" });

  return { blob, doc, systemName, assetsWritten, assetsSkipped };
}

// Convenience: build the zip and hand it to shareFile for download/share.
// Returns the shareFile result plus the counts, so the UI can toast.
export async function exportOpenPluralZip(entities = {}) {
  const { blob, systemName, assetsWritten, assetsSkipped, doc } =
    await buildOpenPluralZipBlob(entities);
  const filename = `${systemNameSlug(systemName)}-openplural.zip`;
  const shareResult = await shareFile({
    blob,
    filename,
    title: `${systemName} — OpenPlural export`,
    dialogTitle: "Save OpenPlural export",
    prefer: "download",
  });
  return {
    shareResult,
    filename,
    assetsWritten,
    assetsSkipped,
    counts: {
      members: doc.members.length,
      groups: doc.groups.length,
      customFields: doc.custom_fields.length,
      fronts: doc.front_periods.length,
      notes: doc.notes.length,
      relationships: doc.relationships.edges.length,
      chatChannels: doc.chat.conversations.length,
      chatMessages: doc.chat.messages.length,
    },
  };
}
