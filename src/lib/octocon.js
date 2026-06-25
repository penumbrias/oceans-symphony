// Octocon importer — pure mappers + file parsing.
//
// Octocon (octocon.app) exports a single JSON file:
//   alters[]  {id (int), name, description, fields:[{id, value}], color,
//              avatar_url, pronouns, proxy_name, discord_proxies}
//   fronts[]  {id, alter_id (int), time_start, time_end (null = active), comment}
//   tags[]    {id (uuid), name, description, color, alters:[alterId…],
//              parent_tag_id}   → GROUPS, nested + membership-on-the-tag
//   polls[]   (not imported)
//   user      {id, description, fields:[{id, name, type}], avatar_url}
//              → the system; `fields` is the custom-field DEFINITION list,
//                and each alter's `fields[]` carries the VALUES (keyed by def id).
//
// Avatars are remote HTTPS URLs on Octocon's CDN — there are no image blobs in
// the export, so we link them directly (they load while online). Every mapped
// record carries `octo_id` for dedup on re-import, mirroring openPlural.js's
// `op_id` and simplyPlural.js's `sp_id`. The connector (OctoconConnect.jsx)
// owns all IndexedDB writes; these mappers stay pure.

// Coerce a colour to a leading "#", same as openPlural.js / simplyPlural.js.
export function normalizeColor(raw) {
  if (!raw) return "";
  const s = raw.toString().trim();
  if (!s) return "";
  return s.startsWith("#") ? s : `#${s}`;
}

// Octocon field types → local CustomField.field_type. Octocon emits
// text / number / boolean (and occasionally date); all have local equivalents.
const OCTO_TYPE_MAP = {
  text: "text",
  string: "text",
  number: "number",
  boolean: "boolean",
  date: "date",
};
export function octoFieldType(t) {
  return OCTO_TYPE_MAP[(t || "").toString().toLowerCase()] || "text";
}

// Octocon stores group membership ON THE TAG (tag.alters = [alterId…]). Invert
// it to alterId → [{id, name, color}] so it matches the per-alter `groups`
// shape the rest of the app reads (getMemberAlters checks a.groups[].id). The
// `id` here is the OCTOCON tag id; the connector remaps it to the local Group
// id in a later pass (the local groups don't exist yet at alter-create time).
export function buildMemberGroupsFromTags(tags = []) {
  const byAlter = {};
  for (const tag of tags) {
    if (!tag || !tag.id) continue;
    const entry = { id: tag.id, name: tag.name || "", color: normalizeColor(tag.color) };
    for (const alterId of (tag.alters || [])) {
      if (alterId == null) continue;
      const key = String(alterId);
      if (!byAlter[key]) byAlter[key] = [];
      byAlter[key].push(entry);
    }
  }
  return byAlter;
}

// Octocon's `user.fields` is the field-DEFINITION list — but a real export can
// carry a VALUE on an alter whose definition was dropped from that list (a field
// the user deleted in Octocon, leaving the value stranded on the alter). Those
// ids never appear in fieldIdMap, so buildMemberCustomFields would silently skip
// them — losing user data, which the app must never do. This surfaces every
// orphan field id that has at least one non-empty value across the export as its
// own synthetic field def, so the connector can create a real CustomField for it
// and preserve the value. Named generically since the export gives no label.
// Returns [{ id, name, type }] (type always "text" — we have no type info).
export function collectOrphanFieldDefs(data) {
  const defIds = new Set((data?.user?.fields || []).map((f) => f && f.id).filter(Boolean));
  const seen = new Set();
  const orphanIds = [];
  for (const a of data?.alters || []) {
    for (const f of a?.fields || []) {
      if (!f || !f.id || defIds.has(f.id) || seen.has(f.id)) continue;
      const v = f.value;
      if (v == null || String(v).trim() === "") continue;
      seen.add(f.id);
      orphanIds.push(f.id);
    }
  }
  return orphanIds.map((id, i) => ({
    id,
    name: orphanIds.length > 1 ? `Imported field ${i + 1}` : "Imported field",
    type: "text",
  }));
}

// alter.fields ([{id, value}]) → { localFieldId: value }, remapping the Octocon
// field-definition id to the LOCAL CustomField id via fieldIdMap. Empty values
// are skipped so an alter doesn't gain a wall of blank fields. alter.custom_fields
// is keyed by local CustomField id (see InfoTab.jsx — customFieldValues[field.id]).
// Orphan fields (see collectOrphanFieldDefs) are included automatically once the
// connector has added their ids to fieldIdMap.
export function buildMemberCustomFields(alter, fieldIdMap = {}) {
  const out = {};
  for (const f of (alter?.fields || [])) {
    if (!f || !f.id) continue;
    const localId = fieldIdMap[f.id];
    if (localId === undefined) continue;
    const val = f.value;
    if (val == null || String(val).trim() === "") continue;
    out[localId] = String(val);
  }
  return out;
}

// alter → Alter. Mirrors mapMemberToAlter in openPlural.js / simplyPlural.js
// (name, pronouns, description, color, avatar_url, custom_fields, groups,
// is_archived) plus octo_id for dedup. avatarUrl + groups + customFields are
// pre-resolved by the connector so this stays pure. Octocon has no archive,
// alias, role, age, or birthday concept on an alter.
export function mapAlterToLocal(alter, opts = {}) {
  const { memberGroups = [], customFields = {}, avatarUrl = "" } = opts;
  return {
    octo_id: alter?.id != null ? String(alter.id) : "",
    name: alter?.name || "Unknown",
    pronouns: alter?.pronouns || "",
    description: alter?.description || "",
    color: normalizeColor(alter?.color),
    avatar_url: avatarUrl,
    custom_fields: { ...customFields },
    groups: Array.isArray(memberGroups) ? memberGroups : [],
    is_archived: false,
  };
}

// tag → Group. Mirrors mapGroupToLocalGroup in openPlural.js: name, color,
// description, octo_id, plus octo_parent_id captured for the nesting pass.
export function mapTagToGroup(tag) {
  return {
    octo_id: tag?.id || "",
    name: tag?.name || "Unnamed Group",
    color: normalizeColor(tag?.color),
    description: tag?.description || "",
    octo_parent_id: tag?.parent_tag_id || "",
  };
}

// front → FrontingSession. Octocon fronts are single-alter periods (no
// co-fronting, no primary concept), so is_primary is always false. time_end
// null = still active. Returns null when the front's alter didn't import.
export function mapFrontToSession(front, alterIdByOctoId) {
  const localId = alterIdByOctoId[String(front?.alter_id)];
  if (!localId) return null;
  const start = front?.time_start ? new Date(front.time_start).toISOString() : null;
  if (!start) return null;
  const end = front?.time_end ? new Date(front.time_end).toISOString() : null;
  return {
    octo_front_id: front?.id || `${front?.alter_id}:${front?.time_start}`,
    alter_id: localId,
    is_primary: false,
    start_time: start,
    end_time: end,
    is_active: !front?.time_end,
    note: front?.comment || "",
    source: "octocon",
  };
}

// poll → Poll. Octocon has two poll shapes, both flattened onto the app's Poll
// model (question + string options + index-keyed votes):
//   - type "choice": data.choices [{id, name}] are the options; each response
//     { alter_id, choice_id, comment? } is one alter's pick.
//   - type "vote":   an implicit Yes / No / Abstain (+ Veto when allow_veto)
//     poll; each response { alter_id, vote, comment? } picks one of those.
// Votes map to LOCAL alter ids via alterIdByOctoId; a voter whose alter didn't
// import becomes an anonymous "" vote so the tally is still preserved. The app's
// Poll has no per-vote comment or separate description field, so — rather than
// drop them — the Octocon description and any voter comments are folded into the
// question text (with names resolved via alterNameByOctoId). Closed state comes
// from time_end. Returns null for an unusable poll.
const OCTO_VOTE_INDEX = { yes: 0, no: 1, abstain: 2, veto: 3 };
export function mapPollToLocal(poll, opts = {}) {
  if (!poll || !poll.id) return null;
  const { alterIdByOctoId = {}, alterNameByOctoId = {} } = opts;
  const data = poll.data || {};

  let options = [];
  const choiceIdToIdx = {};
  if (poll.type === "choice" && Array.isArray(data.choices) && data.choices.length) {
    options = data.choices.map((c) => (c && c.name ? String(c.name) : "Option"));
    data.choices.forEach((c, i) => { if (c && c.id) choiceIdToIdx[c.id] = i; });
  } else {
    options = ["Yes", "No", "Abstain"];
    if (data.allow_veto) options.push("Veto");
  }

  const votes = {};
  options.forEach((_, i) => { votes[String(i)] = []; });

  const comments = [];
  for (const r of (data.responses || [])) {
    if (!r) continue;
    let idx;
    if (poll.type === "choice") idx = choiceIdToIdx[r.choice_id];
    else idx = OCTO_VOTE_INDEX[(r.vote || "").toString().toLowerCase()];
    if (idx != null && idx >= 0 && idx < options.length) {
      const localAlterId = alterIdByOctoId[String(r.alter_id)] || ""; // "" = anonymous (alter not imported)
      votes[String(idx)].push(localAlterId);
    }
    if (r.comment && String(r.comment).trim()) {
      const name = alterNameByOctoId[String(r.alter_id)] || "Someone";
      comments.push(`• ${name}: ${String(r.comment).trim()}`);
    }
  }

  const title = (poll.title || "").toString().trim();
  const desc = (poll.description || "").toString().trim();
  let question = title || desc || "Imported poll";
  if (title && desc) question = `${title}\n\n${desc}`;
  if (comments.length) question = `${question}\n\nVoter notes (from Octocon):\n${comments.join("\n")}`;

  const endMs = poll.time_end ? new Date(poll.time_end).getTime() : null;
  const isClosed = endMs && !Number.isNaN(endMs) ? endMs < Date.now() : false;

  return {
    octo_id: poll.id,
    question,
    options,
    votes,
    is_closed: isClosed,
    tally_mode: false,
    pinned_to_dashboard: false,
    created_by_alter_id: null,
  };
}

// alterId(String) → display name, for resolving poll voter comments. Built from
// the export's alters so the connector can pass it into mapPollToLocal.
export function buildAlterNameByOctoId(alters = []) {
  const out = {};
  for (const a of alters) {
    if (a && a.id != null) out[String(a.id)] = a.name || "Someone";
  }
  return out;
}

// user → a MERGE-SAFE SystemSettings patch. Fills only EMPTY identity fields —
// never clobbers a user's chosen bio / avatar. `systemAvatarUrl` is the (remote)
// avatar URL, or "" when avatars are excluded.
export function buildSystemIdentityPatch(user, existing = {}, opts = {}) {
  const { systemAvatarUrl = "" } = opts;
  if (!user || typeof user !== "object") return {};
  const patch = {};
  const isEmpty = (v) => v == null || String(v).trim() === "";

  const bio = (user.description || "").toString().trim();
  if (bio && isEmpty(existing.system_bio) && isEmpty(existing.system_description)) {
    patch.system_bio = bio;
  }
  if (systemAvatarUrl && isEmpty(existing.system_avatar_url)) {
    patch.system_avatar_url = systemAvatarUrl;
  }
  if (user.id && isEmpty(existing.octo_id)) patch.octo_id = user.id;
  return patch;
}

// Parse a user-picked Octocon export (.json). Throws if it isn't valid JSON.
export async function parseOctoconFile(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  return { data };
}

// Shape check — is this parsed object an Octocon export?
export function looksLikeOctocon(data) {
  return !!data && typeof data === "object" && Array.isArray(data.alters) &&
    ("fronts" in data || "tags" in data || "user" in data);
}
