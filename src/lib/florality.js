// Florality importer — pure parsing + normalising, no storage access.
//
// Florality hands people two exports:
//   1. "OpenPlural" JSON — { privacy|privacyBuckets, fields|customFields,
//      folders, members, polls, gallery }. Members carry folders (ids),
//      fields ({fieldId: value}) and privacy (bucket ids). No front history
//      and no notes.
//   2. The GDPR "Floralites Data Export" HTML page — one <section> per area,
//      each with its raw JSON in a <pre>. It carries what the JSON lacks:
//      front history, the current front, notes ("Entries"), each member's
//      own name AND display name, and every privacy bucket's real friend
//      permissions.
//
// Both are turned into ONE shape (normaliseFlorality*) so a single driver
// (floralityImport.js) writes them, and a member imported from one file is
// recognised when the other is imported later (`florality_id` = Florality's
// member/folder/session id, which both files share).
//
// Privacy: Florality decides who sees a member through privacy buckets.
// Symphony shares an alter with friends only when `friends_visible` is on.
// So a bucket's `friendAccess` here is:
//   false — the bucket gives friends nothing (Florality's "Complete privacy",
//           or members_view "none" in the HTML's permissions),
//   true  — the HTML says friends in it can see members,
//   null  — unknown (the JSON has no permissions).
// The import screen lets the person choose which buckets to share; nothing
// is shared unless they tick it.

// ─── Detection ─────────────────────────────────────────────────────────────

export function isFloralityJson(j) {
  if (!j || typeof j !== "object" || Array.isArray(j)) return false;
  if (!Array.isArray(j.members)) return false;
  const hasBuckets = Array.isArray(j.privacyBuckets) || Array.isArray(j.privacy);
  if (!hasBuckets) return false;
  // Florality's members carry their folders + privacy as id arrays.
  if (Array.isArray(j.folders)) return true;
  const m = j.members.find((x) => x && typeof x === "object");
  return !!m && Array.isArray(m.privacy) && Array.isArray(m.folders);
}

export function isFloralityHtml(text) {
  if (typeof text !== "string") return false;
  const head = text.slice(0, 4000).toLowerCase();
  if (!head.includes("<html") && !head.includes("<!doctype")) return false;
  return /floralit(?:es|y) (?:user )?data export/i.test(text.slice(0, 20000));
}

// ─── HTML parsing ──────────────────────────────────────────────────────────

const NAMED_ENTITIES = { quot: '"', amp: "&", lt: "<", gt: ">", apos: "'", nbsp: " " };

export function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    const v = NAMED_ENTITIES[code.toLowerCase()];
    return v === undefined ? m : v;
  });
}

// { "<section title>": parsedJson } for every section with a raw-data block.
// Tags inside <pre> are only the syntax-highlight spans; any "<" in the data
// itself is escaped as &lt;, so stripping tags before decoding is safe.
export function parseFloralityHtmlSections(html) {
  const out = {};
  const re = /<h2[^>]*>([\s\S]*?)<\/h2>[\s\S]*?<pre[^>]*>([\s\S]*?)<\/pre>/gi;
  let m;
  while ((m = re.exec(html))) {
    const title = decodeEntities(m[1].replace(/<[^>]+>/g, "")).trim();
    const raw = decodeEntities(m[2].replace(/<[^>]+>/g, ""));
    try { out[title] = JSON.parse(raw); } catch { /* a section we can't read is skipped */ }
  }
  return out;
}

// ─── Small helpers ─────────────────────────────────────────────────────────

const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (v == null ? "" : String(v)).trim();

// Florality colours arrive as a number (0 = none) or a hex string.
export function floralityColor(c) {
  if (c == null || c === "" || c === 0) return "";
  if (typeof c === "number" && Number.isFinite(c)) {
    return `#${((c >>> 0) & 0xffffff).toString(16).padStart(6, "0")}`;
  }
  const s = str(c);
  if (!s) return "";
  if (/^#?[0-9a-f]{3,8}$/i.test(s)) return s.startsWith("#") ? s : `#${s}`;
  return "";
}

// Milliseconds or an ISO string → ISO, or null.
export function toIso(v) {
  if (v == null || v === "") return null;
  const ms = typeof v === "number" ? v : Date.parse(v);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

// Only pictures we can fetch or already hold — never a relative path.
function pictureUrl(v) {
  const s = str(v);
  return /^(https?:|data:image\/)/i.test(s) ? s : "";
}

// A field value as one string. Lists become "a, b, c" (the List field type
// splits on commas).
export function fieldValueText(v) {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map(fieldValueText).filter(Boolean).join(", ");
  if (typeof v === "object") {
    if ("value" in v) return fieldValueText(v.value);
    if ("label" in v) return fieldValueText(v.label);
    if ("name" in v) return fieldValueText(v.name);
    return "";
  }
  return String(v).trim();
}

// Florality field type → the local CustomField field_type.
export function floralityFieldType(t) {
  const k = str(t).toLowerCase();
  if (["tags", "list", "multi", "multiselect", "multi_select", "select"].includes(k)) return "list";
  if (["birthday", "date"].includes(k)) return "date";
  if (["number", "integer"].includes(k)) return "number";
  if (["boolean", "checkbox", "toggle"].includes(k)) return "boolean";
  if (["markdown", "longtext", "long_text", "textarea", "richtext"].includes(k)) return "richtext";
  return "text";
}

const NO_ACCESS_RE = /complete[ _-]?privacy|no friend access|nobody|private only/i;

function bucketFromJson(b) {
  const text = `${str(b.name)} ${str(b.slug)} ${str(b.description)}`;
  return {
    id: str(b.id || b._id),
    name: str(b.name) || "Privacy bucket",
    description: str(b.description),
    friendAccess: NO_ACCESS_RE.test(text) ? false : null,
    sort: typeof b.sort === "number" ? b.sort : 0,
  };
}

function bucketFromHtml(b) {
  const perms = b.friendPermissions && typeof b.friendPermissions === "object" ? b.friendPermissions : null;
  let friendAccess = null;
  if (perms && perms.members_view != null) friendAccess = perms.members_view !== "none";
  else if (NO_ACCESS_RE.test(`${str(b.name)} ${str(b.slug)} ${str(b.description)}`)) friendAccess = false;
  return {
    id: str(b._id || b.id),
    name: str(b.name) || "Privacy bucket",
    description: str(b.description),
    friendAccess,
    sort: 0,
  };
}

function emptyModel(source) {
  return {
    source, systemName: "", buckets: [], folders: [], fields: [],
    members: [], fronts: [], notes: [], notImported: {},
  };
}

// ─── OpenPlural JSON → model ───────────────────────────────────────────────

export function normaliseFloralityJson(j) {
  const model = emptyModel("json");
  const buckets = arr(j.privacyBuckets).length ? j.privacyBuckets : arr(j.privacy);
  model.buckets = buckets.filter((b) => b && (b.id || b._id)).map(bucketFromJson);

  const fieldDefs = arr(j.customFields).length ? j.customFields : arr(j.fields);
  model.fields = fieldDefs
    .filter((f) => f && (f.id || f._id) && floralityFieldType(f.type) && str(f.type).toLowerCase() !== "separator")
    .map((f) => ({ id: str(f.id || f._id), name: str(f.name || f.label) || "Field", type: floralityFieldType(f.type) }));

  model.folders = arr(j.folders).filter((f) => f && f.id).map((f) => ({
    id: str(f.id), parentId: str(f.parentId), name: str(f.name) || "Folder",
    description: str(f.description), emoji: str(f.emoji), color: floralityColor(f.color),
    sort: typeof f.sort === "number" ? f.sort : 0,
  }));

  model.members = arr(j.members).filter((m) => m && m.id).map((m) => {
    const fieldValues = {};
    if (m.fields && typeof m.fields === "object") {
      for (const [fid, v] of Object.entries(m.fields)) {
        const text = fieldValueText(v);
        if (text) fieldValues[fid] = text;
      }
    }
    return {
      id: str(m.id),
      name: str(m.name) || "Unnamed",
      alias: str(m.displayName && m.displayName !== m.name ? m.displayName : ""),
      pronouns: str(m.pronouns),
      description: str(m.description),
      color: floralityColor(m.color),
      avatarUrl: pictureUrl(m.avatar),
      bannerUrl: pictureUrl(m.banner || m.background),
      archived: m.archived === true,
      isCustomFront: m.custom === true,
      tags: [],
      folderIds: arr(m.folders).map(str).filter(Boolean),
      bucketIds: arr(m.privacy).map(str).filter(Boolean),
      fieldValues,
    };
  });

  const n = (k) => arr(j[k]).length;
  if (n("polls")) model.notImported.polls = n("polls");
  if (n("gallery")) model.notImported.gallery = n("gallery");
  return model;
}

// ─── GDPR HTML → model ─────────────────────────────────────────────────────

export function normaliseFloralityHtml(html) {
  const s = parseFloralityHtmlSections(html);
  const model = emptyModel("html");

  // Systems — the side system's name stands in for the system name.
  const sides = arr(s.Systems?.sideSystems);
  if (sides.length === 1) model.systemName = str(sides[0].name);

  // Privacy buckets + who is in each.
  const pb = s["Privacy buckets"] || {};
  model.buckets = arr(pb.buckets).filter((b) => b && (b._id || b.id)).map(bucketFromHtml);
  const bucketsByMember = {};
  const assign = pb.assignmentsByBucket && typeof pb.assignmentsByBucket === "object" ? pb.assignmentsByBucket : {};
  for (const [bid, a] of Object.entries(assign)) {
    for (const mid of arr(a?.memberIds)) (bucketsByMember[mid] ||= []).push(bid);
  }

  // Directories (folders). The root directory isn't a folder people made.
  const dirs = s.Directories || {};
  const rootId = str(dirs.root?._id);
  const folders = arr(dirs.list).filter((d) => d && d._id && d._id !== rootId && d.parentId != null);
  model.folders = folders.map((d) => ({
    id: str(d._id), parentId: str(d.parentId) === rootId ? "" : str(d.parentId),
    name: str(d.name) || "Folder", description: str(d.description),
    emoji: /^emoji:/.test(str(d.icon)) ? str(d.icon).slice(6) : "",
    color: floralityColor(d.color), sort: 0,
  }));
  // Groups are a separate tree in Florality; they land as groups too.
  for (const g of arr(s.Groups?.list)) {
    const id = str(g?._id || g?.id);
    if (!id) continue;
    model.folders.push({
      id, parentId: str(g.parentId || g.parentGroupId), name: str(g.name) || "Group",
      description: str(g.description), emoji: /^emoji:/.test(str(g.icon)) ? str(g.icon).slice(6) : str(g.emoji),
      color: floralityColor(g.color), sort: 0, memberIds: arr(g.memberIds).map(str),
    });
  }
  const folderIds = new Set(model.folders.map((f) => f.id));

  // Custom field values per member. Florality lists them per member; the
  // field's own id (or its label) keys the local CustomField.
  const fieldsById = new Map();
  const valuesByMember = {};
  const cfbm = s.Members?.customFieldsByMember && typeof s.Members.customFieldsByMember === "object"
    ? s.Members.customFieldsByMember : {};
  for (const [mid, list] of Object.entries(cfbm)) {
    for (const item of arr(list)) {
      if (!item || typeof item !== "object") continue;
      const def = item.definition && typeof item.definition === "object" ? item.definition : {};
      const name = str(item.label || item.name || item.fieldName || def.label || def.name);
      const type = item.type || def.type;
      if (str(type).toLowerCase() === "separator") continue;
      const id = str(item.definitionId || item.fieldId || def._id || def.id || name);
      if (!id || !name) continue;
      if (!fieldsById.has(id)) fieldsById.set(id, { id, name, type: floralityFieldType(type) });
      const text = fieldValueText(item.value);
      if (text) (valuesByMember[mid] ||= {})[id] = text;
    }
  }
  model.fields = [...fieldsById.values()];

  const mapMember = (m, archived) => {
    const id = str(m._id || m.id);
    const name = str(m.name) || str(m.displayName) || "Unnamed";
    const display = str(m.displayName);
    const tags = arr(m.aboutTags).map((t) => (typeof t === "string" ? t : str(t?.label || t?.name))).map(str).filter(Boolean);
    const inFolders = [str(m.directoryId), ...arr(m.directoryIds).map(str)].filter((d) => d && folderIds.has(d));
    for (const f of model.folders) if (f.memberIds?.includes(id)) inFolders.push(f.id);
    return {
      id, name,
      alias: display && display !== name ? display : "",
      pronouns: str(m.pronouns),
      description: str(m.about || m.aboutMarkdown || m.description || m.bio),
      color: floralityColor(m.color || m.colour),
      avatarUrl: pictureUrl(m.avatarUrl),
      bannerUrl: pictureUrl(m.backgroundUrl || m.bannerUrl),
      archived: archived || m.archived === true || m.archivedAt != null,
      isCustomFront: false,
      tags,
      folderIds: [...new Set(inFolders)],
      bucketIds: bucketsByMember[id] || [],
      fieldValues: valuesByMember[id] || {},
    };
  };
  const mem = s.Members || {};
  const seenMembers = new Set();
  for (const m of arr(mem.active)) {
    const mm = mapMember(m, false);
    if (mm.id && !seenMembers.has(mm.id)) { seenMembers.add(mm.id); model.members.push(mm); }
  }
  for (const m of arr(mem.archived)) {
    const mm = mapMember(m, true);
    if (mm.id && !seenMembers.has(mm.id)) { seenMembers.add(mm.id); model.members.push(mm); }
  }

  // Front history + the current front (same session ids; keep each once).
  const fs = s["Front state"] || {};
  const sessions = new Map();
  for (const h of arr(fs.history)) if (h?.session?._id) sessions.set(h.session._id, h.session);
  for (const a of arr(fs.current?.sessions?.activeSessions)) if (a?._id && !sessions.has(a._id)) sessions.set(a._id, a);
  for (const se of sessions.values()) {
    const start = toIso(se.startedAt);
    if (!start || !se.memberId) continue;
    model.fronts.push({
      id: str(se._id), memberId: str(se.memberId), start,
      end: toIso(se.endedAt), note: str(se.note), typeKey: str(se.typeKey),
    });
  }
  model.fronts.sort((a, b) => a.start.localeCompare(b.start));

  // Notes ("Entries").
  for (const e of arr(s.Entries?.active)) {
    const id = str(e?.id || e?._id);
    const title = str(e?.title);
    const content = str(e?.content);
    if (!id || (!title && !content)) continue;
    const memberIds = [...new Set([str(e.memberId), ...arr(e.memberIds).map(str)].filter(Boolean))];
    model.notes.push({ id, title, content, createdAt: toIso(e.createdAt) || toIso(e.updatedAt), memberIds });
  }

  // What the page carries that has no home here (yet) — said, not hidden.
  const statuses = arr(s["Member statuses"]?.definitions).length;
  if (statuses) model.notImported.statuses = statuses;
  const msgs = s.Messaging?.messagesByChannelId && typeof s.Messaging.messagesByChannelId === "object"
    ? Object.values(s.Messaging.messagesByChannelId).reduce((n, l) => n + arr(l).length, 0) : 0;
  if (msgs) model.notImported.messages = msgs;
  const friends = arr(s.Friends?.accepted).length;
  if (friends) model.notImported.friends = friends;
  return model;
}

// Read a picked file into the model. Accepts the .json or the .html.
export async function parseFloralityFile(file) {
  const text = await file.text();
  if (isFloralityHtml(text)) return normaliseFloralityHtml(text);
  let j;
  try { j = JSON.parse(text); } catch { throw new Error("This file isn't a Florality export (not JSON or the data-export page)."); }
  if (!isFloralityJson(j)) throw new Error("This JSON doesn't look like a Florality export.");
  return normaliseFloralityJson(j);
}

// ─── Privacy ───────────────────────────────────────────────────────────────

// Which buckets start ticked "share with friends": none. A new alter is
// never shared without a choice (newAlterDefaults.js); the person ticks
// buckets on the import screen.
export function defaultSharedBuckets() {
  return new Set();
}

// Is a member shared with friends, given the buckets the person chose?
// Shared only when one of its buckets is chosen AND none of its buckets is
// a no-access one (privacy wins when a member is in both).
export function memberSharedWithFriends(member, sharedBucketIds, buckets) {
  const ids = member?.bucketIds || [];
  if (!ids.length) return false;
  const noAccess = new Set((buckets || []).filter((b) => b.friendAccess === false).map((b) => b.id));
  if (ids.some((id) => noAccess.has(id))) return false;
  return ids.some((id) => sharedBucketIds?.has(id));
}

// The JSON array FrontingSession.note holds.
export function frontNotePayload(note, atIso) {
  const text = str(note);
  return text ? JSON.stringify([{ text, timestamp: atIso }]) : "";
}
