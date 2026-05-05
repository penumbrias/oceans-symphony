const SP_API_BASE = "https://api.apparyllis.com/v1";

async function spFetch(path, token) {
  const res = await fetch(`${SP_API_BASE}${path}`, {
    headers: { Authorization: token },
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

function remapCustomFields(spInfo, fieldIdMap) {
  if (!spInfo || typeof spInfo !== "object") return {};
  const result = {};
  for (const [spFieldId, value] of Object.entries(spInfo)) {
    const localId = fieldIdMap[spFieldId];
    if (localId !== undefined) result[localId] = value;
  }
  return result;
}

export function mapMemberToAlter(member, groupsById = {}, fieldIdMap = {}) {
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

  return {
    sp_id: spId,
    name: c.name || "Unknown",
    pronouns: Array.isArray(c.pronouns) ? c.pronouns.join(", ") : (c.pronouns || ""),
    description: c.desc || c.description || "",
    color: normalizeColor(c.color),
    avatar_url: c.avatarUrl || c.avatar_url || "",
    banner_url: c.bannerUrl || c.banner_url || "",
    role: c.role || "",
    custom_fields: remapCustomFields(c.info || {}, fieldIdMap),
    tags: Array.isArray(c.tags) ? c.tags : [],
    groups: memberGroups,
    is_archived: !!c.archived,
    birthday: c.birthday || c.birthdate || "",
    pk_id: c.pkId || "",
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
// `custom` (boolean) = true means it's a custom front, not a member — skip those.
export function mapFrontHistoryEntry(entry, alterIdBySpId) {
  const spFrontId = entry.id || entry._id || "";
  const c = entry.content || entry;

  if (c.custom) return null; // custom fronts don't map to alters

  const spMemberId = c.member || "";
  if (!spMemberId) return null;

  const localAlterId = alterIdBySpId[spMemberId];
  if (!localAlterId) return null;

  const startTime = c.startTime ? new Date(c.startTime).toISOString() : null;
  if (!startTime) return null;

  const endTime = (c.endTime && c.endTime > 0) ? new Date(c.endTime).toISOString() : null;

  return {
    alter_id: localAlterId,
    is_primary: true, // SP has no primary concept; treat all imported sessions as primary
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
