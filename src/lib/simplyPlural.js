const SP_API_BASE = "https://api.apparyllis.com/v1";

async function spFetch(path, token) {
  // `cache: "no-store"` is load-bearing — without it, an Android WebView
  // or aggressive intermediate proxy can serve a stored response from
  // an earlier import (we've seen a report where a bio that lived on
  // SP a year ago resurfaced after a fresh-looking sync). Also send
  // Pragma + Cache-Control headers as belt-and-braces for older
  // engines that don't fully honour `cache: "no-store"`.
  const res = await fetch(`${SP_API_BASE}${path}`, {
    headers: {
      Authorization: token,
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Simply Plural API error (${res.status}): ${body}`);
  }
  return res.json();
}

export async function getSystemId(token) {
  const res = await fetch(`${SP_API_BASE}/me`, {
    headers: { Authorization: token },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Invalid Simply Plural token (${res.status}): ${body}`);
  }
  const text = await res.text();
  try {
    const obj = JSON.parse(text);
    return (obj.uid || obj.id || obj._id || text).toString().replace(/"/g, "").trim();
  } catch {
    return text.replace(/"/g, "").trim();
  }
}

export async function getSystemUser(token, systemId) {
  try {
    const data = await spFetch(`/user/${systemId}`, token);
    return data.content || data;
  } catch {
    return null;
  }
}

export async function getMembers(token, systemId) {
  const data = await spFetch(`/members/${systemId}`, token);
  return Array.isArray(data) ? data : (data.data ?? data.members ?? []);
}

export async function getFronters(token, systemId) {
  try {
    const data = await spFetch(`/fronters/${systemId}`, token);
    const members = Array.isArray(data.members) ? data.members : [];
    const custom = Array.isArray(data.custom) ? data.custom : [];
    return { members, custom };
  } catch {
    return { members: [], custom: [] };
  }
}

export async function getFrontHistory(token, systemId, startTime, endTime) {
  try {
    const start = startTime ?? 0;
    const end = endTime ?? Date.now();
    const data = await spFetch(`/frontHistory/${systemId}?startTime=${start}&endTime=${end}`, token);
    return Array.isArray(data) ? data : (data.data ?? []);
  } catch {
    return [];
  }
}

export async function getGroups(token, systemId) {
  try {
    const data = await spFetch(`/groups/${systemId}`, token);
    return Array.isArray(data) ? data : (data.data ?? []);
  } catch {
    return [];
  }
}

export async function getCustomFields(token, systemId) {
  try {
    const data = await spFetch(`/customFields/${systemId}`, token);
    return Array.isArray(data) ? data : (data.data ?? []);
  } catch {
    return [];
  }
}

export async function getPolls(token, systemId) {
  try {
    const data = await spFetch(`/polls/${systemId}`, token);
    return Array.isArray(data) ? data : (data.data ?? []);
  } catch {
    return [];
  }
}

export async function getMemberNotes(token, systemId, memberId) {
  try {
    const data = await spFetch(`/notes/${systemId}/${memberId}`, token);
    return Array.isArray(data) ? data : (data.data ?? []);
  } catch {
    return [];
  }
}

export async function getCustomFronts(token, systemId) {
  try {
    const data = await spFetch(`/customFronts/${systemId}`, token);
    return Array.isArray(data) ? data : (data.data ?? []);
  } catch {
    return [];
  }
}

function normalizeColor(raw) {
  if (!raw) return "";
  const s = raw.toString().trim();
  return s.startsWith("#") ? s : `#${s}`;
}

const SP_TYPE_MAP = {
  text: "text",
  string: "text",
  longText: "text",
  number: "number",
  boolean: "boolean",
  bool: "boolean",
};

export function spFieldType(spType) {
  return SP_TYPE_MAP[spType] || "text";
}

// SP stores avatars two ways depending on upload era:
//   - `avatarUrl`: a full CDN URL (newer uploads, web)
//   - `avatarUuid`: a bare UUID (older / mobile uploads). The full URL is
//     reconstructed as `https://spaces.apparyllis.com/avatars/{uid}/{uuid}`,
//     where `uid` is the system's id (present on member `content.uid`).
//     Reference: https://gist.github.com/lilianalillyy/1d450426eb2e642cd8584e81bdff5ef9
const SP_AVATAR_CDN_BASE = "https://spaces.apparyllis.com/avatars";

function resolveAvatarUrl(content, systemId) {
  if (!content) return "";
  if (content.avatarUrl) return content.avatarUrl;
  if (content.avatar_url) return content.avatar_url;
  const uuid = content.avatarUuid || content.avatar_uuid;
  if (uuid) {
    const owner = content.uid || systemId;
    if (owner) return `${SP_AVATAR_CDN_BASE}/${owner}/${uuid}`;
  }
  return "";
}

function remapCustomFields(spInfo, fieldIdMap) {
  if (!spInfo || typeof spInfo !== "object") return {};
  const result = {};
  for (const [spFieldId, value] of Object.entries(spInfo)) {
    const localId = fieldIdMap[spFieldId];
    if (localId !== undefined) result[localId] = value;
  }
  return result;
}

// SP's archive flag has appeared in several shapes across API versions
// and exports — sometimes a boolean on `content.archived`, sometimes
// camelCase `isArchived`, sometimes a timestamp number that means
// "last archived at" rather than "currently archived." Reading it as
// `!!c.archived` got both directions wrong in the wild (a 53-alter
// system saw active alters force-archived AND archived ones imported
// as active). Be conservative: only mark archived when we see an
// explicit truthy boolean / "true" / 1; anything else (numbers,
// undefined, null, strings) falls through to NOT archived. Better to
// under-archive (user sees too many alters and can hide them) than
// to over-archive (user thinks alters got lost).
export function readSpArchived(member) {
  const c = member?.content || member || {};
  const candidates = [c.archived, c.isArchived, member?.archived, member?.isArchived];
  for (const v of candidates) {
    if (v === true || v === "true" || v === 1) return true;
    if (v === false || v === "false" || v === 0) return false;
  }
  return false;
}

export function mapMemberToAlter(member, groupsById = {}, fieldIdMap = {}, systemId = "") {
  const spId = member.id || member._id || "";
  const c = member.content || member;

  const memberGroups = Object.values(groupsById)
    .filter((g) => {
      const gc = g.content || g;
      return Array.isArray(gc.members) && gc.members.includes(spId);
    })
    .map((g) => {
      const gc = g.content || g;
      return {
        id: g.id || g._id || "",
        name: gc.name || "",
        color: normalizeColor(gc.color),
      };
    });

  const banner = c.bannerUrl || c.banner_url || "";
  const customFields = remapCustomFields(c.info || {}, fieldIdMap);
  // SP "banner" doubles as the alter profile header in OS — surface it
  // via the `_header_image` custom-field key that ProfileTab reads.
  if (banner) customFields._header_image = banner;

  return {
    sp_id: spId,
    name: c.name || "Unknown",
    pronouns: Array.isArray(c.pronouns) ? c.pronouns.join(", ") : (c.pronouns || ""),
    description: c.desc || c.description || "",
    color: normalizeColor(c.color),
    avatar_url: resolveAvatarUrl(c, systemId),
    banner_url: banner,
    role: c.role || "",
    custom_fields: customFields,
    tags: Array.isArray(c.tags) ? c.tags : [],
    groups: memberGroups,
    is_archived: readSpArchived(member),
    birthday: c.birthday || c.birthdate || "",
  };
}

export function mapCustomFrontToAlter(customFront, systemId = "") {
  const spId = customFront.id || customFront._id || "";
  const c = customFront.content || customFront;
  const banner = c.bannerUrl || c.banner_url || "";
  const customFields = {};
  if (banner) customFields._header_image = banner;
  return {
    sp_id: spId,
    name: c.name || "Unknown",
    description: c.desc || c.description || "",
    color: normalizeColor(c.color),
    avatar_url: resolveAvatarUrl(c, systemId),
    banner_url: banner,
    custom_fields: customFields,
    tags: [],
    groups: [],
    is_archived: readSpArchived(customFront),
  };
}

// SP custom fronts often represent emotional / physical / dissociative
// states rather than identities (anxious, depressed, dissociating, in
// pain, etc). Some users prefer to track those as symptoms in Oceans
// Symphony instead of (or in addition to) bringing them in as alters.
// This mapper produces the local `Symptom` shape — a boolean-typed
// entry under the "mental" category by default, tagged with the SP id
// for dedupe on re-import.
export function mapCustomFrontToSymptom(customFront) {
  const spId = customFront.id || customFront._id || "";
  const c = customFront.content || customFront;
  return {
    sp_id: spId,
    label: c.name || "Unknown",
    category: "mental",
    type: "boolean",
    // Default to "not a positive thing" — most custom fronts represent
    // states users want to track, not celebrate. They can flip the
    // toggle after import on a per-symptom basis.
    is_positive: false,
    color: normalizeColor(c.color) || "#9333EA",
    is_default: false,
    is_archived: readSpArchived(customFront),
    order: 999,
  };
}

export function mapGroupToLocalGroup(group) {
  const spId = group.id || group._id || "";
  const c = group.content || group;

  return {
    sp_id: spId,
    name: c.name || "Unnamed Group",
    color: normalizeColor(c.color),
    description: c.desc || c.description || "",
    emoji: c.emoji || "",
    member_sp_ids: Array.isArray(c.members) ? c.members : [],
    sp_parent_id: c.parent || "",
    tags: Array.isArray(c.tags) ? c.tags : [],
    is_hidden: !!c.private,
    parent: "",
  };
}

// Maps one SP front history entry to a single FrontingSession object (or null).
// Each SP entry represents ONE member/customFront fronting.
// When custom fronts have been imported as alters (sp_id = custom front ID), their
// history entries resolve via the same alterIdBySpId lookup.
export function mapFrontHistoryEntry(entry, alterIdBySpId) {
  const spFrontId = entry.id || entry._id || "";
  const c = entry.content || entry;

  const spMemberId = c.member || "";
  if (!spMemberId) return null;

  const localAlterId = alterIdBySpId[spMemberId];
  if (!localAlterId) return null;

  const startTime = c.startTime ? new Date(c.startTime).toISOString() : null;
  if (!startTime) return null;

  const endTime = (c.endTime && c.endTime > 0) ? new Date(c.endTime).toISOString() : null;

  return {
    alter_id: localAlterId,
    // SP has no primary concept — front entries are an unordered set, not a
    // primary + co-fronters. Import everyone as a co-fronter so we don't
    // fabricate a primary the source system never tracked. The defence-in-
    // depth sweep that demoted duplicates still runs, but should now be
    // dormant. The user can promote one alter to primary manually.
    is_primary: false,
    start_time: startTime,
    end_time: endTime,
    is_active: !!c.live,
    note: c.customStatus || "",
    sp_front_id: spFrontId,
  };
}

// Maps one SP poll to a local Poll object.
// SP has two poll types:
//   custom: false — normal (yes/no + optional abstain/veto), votes: [{id, comment, vote}]
//   custom: true  — custom options [{name, color}], votes: [{id, comment, vote}] where vote=option name
export function mapSPPoll(spPoll, alterIdBySpId) {
  const spId = spPoll.id || spPoll._id || "";
  const c = spPoll.content || spPoll;

  const question = c.name || c.question || c.title || "Untitled Poll";
  const isCustomPoll = !!c.custom;
  const votesArray = Array.isArray(c.votes) ? c.votes : [];

  let options = [];
  const localVotes = {};

  if (isCustomPoll) {
    // Options are [{name, color}]; vote value is the option name
    options = Array.isArray(c.options) ? c.options.map((o) => o.name || o.label || "").filter(Boolean) : [];
    options.forEach((_, idx) => { localVotes[String(idx)] = []; });
    for (const v of votesArray) {
      const localId = alterIdBySpId[v.id];
      const optionIdx = options.indexOf(v.vote);
      if (localId && optionIdx >= 0) localVotes[String(optionIdx)].push(localId);
    }
  } else {
    // Normal poll: binary yes/no with optional abstain/veto
    options = ["Yes", "No"];
    if (c.allowAbstain) options.push("Abstain");
    if (c.allowVeto) options.push("Veto");
    options.forEach((_, idx) => { localVotes[String(idx)] = []; });

    const voteMap = { yes: 0, no: 1, abstain: 2, veto: c.allowAbstain ? 3 : 2 };
    for (const v of votesArray) {
      const localId = alterIdBySpId[v.id];
      const idx = voteMap[(v.vote || "").toLowerCase()];
      if (localId && idx !== undefined && localVotes[String(idx)]) {
        localVotes[String(idx)].push(localId);
      }
    }
  }

  return {
    sp_id: spId,
    question,
    options,
    votes: localVotes,
    is_closed: !!(c.endTime && c.endTime < Date.now()),
  };
}

// Maps one SP member note to a local AlterNote object.
export function mapSPMemberNote(spNote, localAlterId) {
  const spId = spNote.id || spNote._id || "";
  const c = spNote.content || spNote;
  const title = c.title || "";
  const body = c.note || c.text || c.body || ""; // SP field is "note"
  const content = title ? `**${title}**\n\n${body}`.trim() : body.trim();
  return {
    sp_id: spId,
    alter_id: localAlterId,
    content,
  };
}
