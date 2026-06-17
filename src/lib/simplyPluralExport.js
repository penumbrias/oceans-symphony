// Simply Plural export-file exporter — the inverse of src/lib/simplyPlural.js
// (the SP *importer*). Produces a single JSON object shaped exactly like a real
// Simply Plural data export: top-level keys are Mongo collections (arrays of
// FLAT docs — NOT the live API's `{ content: … }` wrapper), every doc carries a
// 24-hex Mongo-ObjectId-style `_id`, the system `uid` (one value reused
// everywhere), and `lastOperationTime` (epoch ms).
//
// This is the file PluralSpace's "SimplyPlural Export File" importer reads, and
// the same shape Simply Plural itself re-imports. It is JSON-only: SP exports
// carry NO media, so avatars only travel as http(s) URLs (a local-image:// URI
// cannot be a URL → it's dropped, and a warning is emitted). For images, use the
// OpenPlural export instead.
//
// Round-trip / identity:
//   • Every record reuses its local `sp_id` when it has one (records that came
//     in via the SP importer), so re-importing into SP / PluralSpace keeps the
//     same identity, and re-importing into Oceans Symphony dedups on sp_id.
//   • A single system `uid` is reused across every collection. We reuse an
//     existing `sp_system_id` from SystemSettings (or any record's stored sp uid)
//     when present, else mint one — so a re-import lands under the same system.
//
// Resilience: each collection is built inside its own try/catch so one bad row
// (or a whole bad collection) degrades to an empty array + a warning rather than
// aborting the export. We always emit the FULL set of top-level keys SP knows
// about (empty array where we have no clean source) so PluralSpace's importer
// never chokes on a missing key.

import { shareFile } from "@/lib/shareFile";
import { getPrivacyLevels } from "@/lib/privacyLevels";

// ── id helpers ───────────────────────────────────────────────────────────────

// 24 lowercase hex chars — the shape of a Mongo ObjectId, which is what SP uses
// for every `_id`. We don't need the timestamp/counter structure of a real
// ObjectId (SP doesn't decode it), just 12 random bytes rendered as hex.
function objectId() {
  const bytes = new Uint8Array(12);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}

// A valid SP `_id` is exactly 24 lowercase hex. Reuse a stored sp id only when
// it already conforms; otherwise mint a fresh one (a non-conforming stored id
// — e.g. a PluralKit short id or a local UUID — would be rejected by SP).
function isObjectId(value) {
  return typeof value === "string" && /^[0-9a-f]{24}$/.test(value);
}

// Prefer the record's existing sp_id (round-trip), else a fresh ObjectId.
function idFor(record, spField = "sp_id") {
  const stored = record && record[spField];
  return isObjectId(stored) ? stored : objectId();
}

// System uid. SP uids are 28-char Firebase-style strings; we mint a base62-ish
// string of that length when we don't have one to reuse.
function genUid() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const len = 28;
  const out = new Array(len);
  const rand = new Uint8Array(len);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(rand);
  } else {
    for (let i = 0; i < len; i++) rand[i] = Math.floor(Math.random() * 256);
  }
  for (let i = 0; i < len; i++) out[i] = alphabet[rand[i] % alphabet.length];
  return out.join("");
}

// ── value helpers ──────────────────────────────────────────────────────────

function toEpochMs(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

// SP colours are stored as `#rrggbb` on members/customFields/buckets, but groups
// in the export use 8-hex ARGB without a `#` (e.g. "ffffffff"). We keep whatever
// the OS record stored, only ensuring a leading `#` for the member/field shape.
function withHash(raw) {
  if (!raw) return "";
  const s = String(raw).trim();
  if (!s) return "";
  return s.startsWith("#") ? s : `#${s}`;
}

// Only http(s) URLs survive an SP export (no media payload). local-image://,
// /local-image/, data:, and blob: can't be represented → return "" so the
// caller can count it as a dropped avatar.
function httpUrlOnly(url) {
  if (!url) return "";
  const s = String(url).trim();
  return /^https?:\/\//i.test(s) ? s : "";
}

// First proxy tag / alias → SP's `pkId` slot (SP stores a single PK id string).
function firstProxyTag(alter) {
  if (Array.isArray(alter?.proxy_tags) && alter.proxy_tags.length) {
    const p = alter.proxy_tags[0];
    if (typeof p === "string") return p;
    if (p && typeof p === "object") {
      return [p.prefix, p.suffix].filter(Boolean).join("text") || "";
    }
  }
  return alter?.alias || "";
}

// SP custom-field type enum (observed in real exports): 0=text, 1=color, 5=date.
// Everything else (number/boolean/richtext/…) degrades to text(0) — SP renders
// the stringified value fine.
function spFieldTypeInt(localType) {
  switch (localType) {
    case "color": return 1;
    case "date": return 5;
    default: return 0;
  }
}

// A custom-field key on alter.custom_fields is the LOCAL CustomField id; OS also
// uses `_`-prefixed internal keys (e.g. _header_image, _bg_color) that aren't
// real fields — those are skipped.
function isInternalFieldKey(key) {
  return !key || key.startsWith("_");
}

// ── builder ──────────────────────────────────────────────────────────────────

// Pure / synchronous. Returns the plain SP-shaped object plus a small
// { counts, warnings } summary. No image fetching (avatars are URL-only).
//
// Inputs (all arrays except systemSettings which is also an array — [0]-ish is
// read for the system identity):
//   alters, groups, customFields, frontingSessions, privacyLevels, systemSettings
export function buildSimplyPluralExport({
  alters = [],
  groups = [],
  customFields = [],
  frontingSessions = [],
  privacyLevels = null,
  systemSettings = [],
} = {}) {
  const now = Date.now();
  const warnings = [];

  // Run a collection builder in isolation: a thrown error becomes [] + a
  // warning, so one bad collection never kills the whole export.
  function safe(label, fn, fallback = []) {
    try {
      return fn();
    } catch (e) {
      console.warn(`[SP export] ${label} failed:`, e?.message || e);
      warnings.push(`Couldn't export ${label} (${e?.message || "unknown error"}).`);
      return fallback;
    }
  }

  // ── System identity (drives users[0] + the shared uid) ──
  const settings = systemSettings.find((r) => r && (
    (r.system_name && String(r.system_name).trim()) ||
    (r.system_bio && String(r.system_bio).trim()) ||
    (r.system_description && String(r.system_description).trim()) ||
    (r.sp_system_id && String(r.sp_system_id).trim())
  )) || systemSettings[0] || {};

  // One uid for the whole export. Prefer an SP system id we already hold (so a
  // re-import lands under the same SP system), then any sp_uid carried on a
  // record, else mint one.
  const uid = (() => {
    if (settings.sp_system_id && String(settings.sp_system_id).trim()) {
      return String(settings.sp_system_id).trim();
    }
    const carrier = [...alters, ...groups].find((r) => r && r.sp_uid && String(r.sp_uid).trim());
    if (carrier) return String(carrier.sp_uid).trim();
    return genUid();
  })();

  const systemName = (settings.system_name && String(settings.system_name).trim()) || "My System";
  const systemDesc = settings.system_bio || settings.system_description || "";
  const systemColor = withHash(settings.system_color || settings.theme_color || "") || "#000000";
  const systemAvatar = httpUrlOnly(settings.system_avatar_url || "");
  if (settings.system_avatar_url && !systemAvatar) {
    warnings.push("System avatar isn't a web URL, so it isn't included (SP exports carry no images — use the OpenPlural export for avatars).");
  }

  // ── customFields[] + users[0].fields (shared _id per field) ──
  // fieldExportIdByOsId: OS CustomField.id → exported _id, used to remap
  // member.info keys below.
  const fieldExportIdByOsId = {};
  const usersFields = {};
  const exportedCustomFields = safe("custom fields", () => {
    const out = [];
    customFields.forEach((cf, index) => {
      if (!cf || !cf.id) return;
      const fid = idFor(cf);
      fieldExportIdByOsId[cf.id] = fid;
      const typeInt = spFieldTypeInt(cf.field_type);
      out.push({
        _id: fid,
        uid,
        name: cf.name || "Unnamed Field",
        order: String(typeof cf.order === "number" ? cf.order : index),
        type: typeInt,
        supportMarkdown: null,
        buckets: [],
        oid: uid,
        lastOperationTime: now,
      });
      // users[0].fields mirrors the catalogue, keyed by the same _id.
      usersFields[fid] = {
        name: cf.name || "Unnamed Field",
        order: typeof cf.order === "number" ? cf.order : index,
        private: false,
        preventTrusted: false,
        type: typeInt,
      };
    });
    return out;
  });

  // ── privacyBuckets[] (from privacy levels) + levelIdToBucketId ──
  const levels = Array.isArray(privacyLevels)
    ? privacyLevels
    : getPrivacyLevels(settings);
  const levelIdToBucketId = {};
  const privacyBuckets = safe("privacy buckets", () => {
    const out = [];
    (levels || []).forEach((lvl, index) => {
      if (!lvl || !lvl.id) return;
      const bid = isObjectId(lvl.sp_bucket_id) ? lvl.sp_bucket_id : objectId();
      levelIdToBucketId[lvl.id] = bid;
      out.push({
        _id: bid,
        uid,
        name: lvl.name || `Level ${typeof lvl.number === "number" ? lvl.number : index}`,
        icon: "🔒",
        rank: String(typeof lvl.number === "number" ? lvl.number : index),
        desc: "",
        color: "#1998A8",
      });
    });
    return out;
  });

  // ── members[] (+ memberExportIdByAlterId for groups/frontHistory) ──
  const memberExportIdByAlterId = {};
  let droppedMemberAvatars = 0;
  const members = safe("members", () => {
    const out = [];
    alters.forEach((alter) => {
      if (!alter || !alter.id) return;
      const mid = idFor(alter);
      memberExportIdByAlterId[alter.id] = mid;

      // info: remap each non-internal custom-field key (OS CustomField id) to
      // the exported field _id, copying the stringified value.
      const info = {};
      const cfMap = alter.custom_fields && typeof alter.custom_fields === "object"
        ? alter.custom_fields
        : {};
      for (const [key, value] of Object.entries(cfMap)) {
        if (isInternalFieldKey(key)) continue;
        const exportedFieldId = fieldExportIdByOsId[key];
        if (!exportedFieldId) continue;
        if (value == null || value === "") continue;
        info[exportedFieldId] = String(value);
      }

      // buckets: map the alter's privacy level ids → exported bucket _ids.
      const buckets = [];
      const alterLevels = Array.isArray(alter.privacy_levels) ? alter.privacy_levels : [];
      for (const lvlId of alterLevels) {
        const bid = levelIdToBucketId[lvlId];
        if (bid) buckets.push(bid);
      }

      const avatar = httpUrlOnly(alter.avatar_url || "");
      if (alter.avatar_url && !avatar) droppedMemberAvatars++;

      out.push({
        _id: mid,
        name: alter.name || "Unknown",
        pronouns: alter.pronouns || "",
        color: withHash(alter.color || "") || "#0e0713",
        desc: alter.description || "",
        avatarUrl: avatar,
        avatarUuid: "",
        // SP members have no "archived" flag in the export shape — surface an
        // archived alter as private so it isn't shared, while still travelling
        // as a member (data preserved). preventTrusted mirrors private.
        private: alter.is_archived === true,
        preventTrusted: alter.is_archived === true,
        supportDescMarkdown: true,
        pkId: firstProxyTag(alter) || "",
        info,
        buckets,
        frame: {},
        uid,
        lastOperationTime: now,
      });
    });
    return out;
  });
  if (droppedMemberAvatars > 0) {
    warnings.push(`${droppedMemberAvatars} ${droppedMemberAvatars === 1 ? "avatar isn't" : "avatars aren't"} web URLs, so they aren't included (use the OpenPlural export for images).`);
  }

  // ── groups[] ──
  // groupExportIdByOsId for parent resolution; members[] = exported member _ids
  // of alters whose alter.groups[].id === this OS group's local id (mirrors
  // getMemberAlters' alter-side check; member_sp_ids points at sp ids we don't
  // re-emit here, so the alter.groups side is the authoritative local link).
  const groupExportIdByOsId = {};
  const exportedGroups = safe("groups", () => {
    const out = [];
    groups.forEach((group) => {
      if (!group || !group.id) return;
      const gid = idFor(group);
      groupExportIdByOsId[group.id] = gid;
    });
    groups.forEach((group) => {
      if (!group || !group.id) return;
      const gid = groupExportIdByOsId[group.id];

      // parent: an OS group's `parent` holds another LOCAL Group id (or
      // ""/"root" for top-level). Subsystems use owner_alter_id (no group
      // parent) → "root". Resolve to the parent's exported _id when it maps.
      let parent = "root";
      const osParent = group.parent;
      if (osParent && osParent !== "root" && groupExportIdByOsId[osParent]) {
        parent = groupExportIdByOsId[osParent];
      }

      // members: alters that link to this group via alter.groups.
      const memberIds = [];
      for (const alter of alters) {
        if (!alter || !alter.id) continue;
        const mid = memberExportIdByAlterId[alter.id];
        if (!mid) continue;
        const refs = Array.isArray(alter.groups) ? alter.groups : [];
        const inGroup = refs.some((r) => {
          const rid = typeof r === "string" ? r : (r && (r.id || r.sp_id));
          return rid === group.id || (group.sp_id && rid === group.sp_id);
        });
        if (inGroup) memberIds.push(mid);
      }

      out.push({
        _id: gid,
        parent,
        name: group.name || "Unnamed Group",
        color: withHash(group.color || "") || "#ffffff",
        desc: group.description || "",
        emoji: group.emoji || "",
        private: group.is_hidden === true,
        preventTrusted: group.is_hidden === true,
        supportDescMarkdown: true,
        members: memberIds,
        buckets: [],
        uid,
        lastOperationTime: now,
      });
    });
    return out;
  });

  // ── frontHistory[] ──
  const frontHistory = safe("front history", () => {
    const out = [];
    for (const session of frontingSessions) {
      if (!session) continue;
      const osAlterId = session.alter_id || session.primary_alter_id;
      if (!osAlterId) continue;
      const memberId = memberExportIdByAlterId[osAlterId];
      if (!memberId) continue; // alter didn't export → skip
      const startTime = toEpochMs(session.start_time);
      if (startTime == null) continue;
      const endTime = toEpochMs(session.end_time);
      const isActive = session.is_active === true || (!session.end_time && endTime == null);
      out.push({
        _id: idFor(session, "sp_front_id"),
        custom: false,
        startTime,
        // SP uses 0 (not null) for an open/active front.
        endTime: endTime == null ? 0 : endTime,
        member: memberId,
        live: isActive,
        customStatus: "",
        uid,
        lastOperationTime: now,
      });
    }
    return out;
  });

  // ── users[0] (exactly one doc = the system) ──
  const users = [{
    _id: uid,
    uid,
    username: systemName,
    desc: systemDesc || "",
    color: systemColor,
    avatarUrl: systemAvatar,
    avatarUuid: "",
    isAsystem: true,
    supportDescMarkdown: true,
    frame: {},
    lastOperationTime: now,
    fields: usersFields,
  }];

  // Full set of top-level collection keys SP emits. Populate what we have;
  // empty arrays for everything we have no clean SP-shaped source for (we do
  // NOT fabricate chat / comments / polls / reminders / events).
  const doc = {
    members,
    groups: exportedGroups,
    customFields: exportedCustomFields,
    frontHistory,
    frontStatuses: [],
    channels: [],
    channelCategories: [],
    chatMessages: [],
    comments: [],
    notes: [],
    boardMessages: [],
    polls: [],
    privacyBuckets,
    users,
    automatedReminders: [],
    repeatedReminders: [],
    events: [],
  };

  const counts = {
    members: members.length,
    groups: exportedGroups.length,
    customFields: exportedCustomFields.length,
    frontHistory: frontHistory.length,
    privacyBuckets: privacyBuckets.length,
  };

  return { doc, systemName, uid, counts, warnings };
}

// Slugify a system name for the filename. Mirrors openPluralExport.systemNameSlug.
export function systemNameSlug(name) {
  return (name || "system")
    .replace(/[^a-z0-9]+/gi, "-")
    .toLowerCase()
    .replace(/^-|-$/g, "") || "system";
}

// Build the SP-shaped object, JSON-stringify it into a Blob, and hand it to
// shareFile for download/share. Returns the shareFile result + counts + warnings
// so the UI can toast a summary.
export async function exportSimplyPluralFile(entities = {}) {
  const { doc, systemName, counts, warnings } = buildSimplyPluralExport(entities);
  const json = JSON.stringify(doc, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const filename = `${systemNameSlug(systemName)}-simplyplural.json`;
  const shareResult = await shareFile({
    blob,
    filename,
    title: `${systemName} — Simply Plural export`,
    dialogTitle: "Save Simply Plural export",
    prefer: "download",
  });
  return { shareResult, filename, counts, warnings };
}
