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
    const start = startTime || (Date.now() - 7 * 24 * 60 * 60 * 1000);
    const end = endTime || Date.now();
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

function normalizeColor(raw) {
  if (!raw) return "";
  const s = raw.toString().trim();
  return s.startsWith("#") ? s : `#${s}`;
}

// SP response shape: { exists, id, content: { name, color, members: [...spMemberIds], parent, ... } }
export function mapMemberToAlter(member, groupsById = {}) {
  const spId = member.id || member._id || "";
  const c = member.content || member;

  // Find which groups this member belongs to by checking content.members
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
    pronouns: Array.isArray(c.pronouns)
      ? c.pronouns.join(", ")
      : (c.pronouns || ""),
    description: c.desc || c.description || "",
    color: normalizeColor(c.color),
    avatar_url: c.avatarUrl || c.avatar_url || "",
    banner_url: c.bannerUrl || c.banner_url || "",
    role: c.role || "",
    custom_fields: c.info || {},
    tags: Array.isArray(c.tags) ? c.tags : [],
    groups: memberGroups,
    is_archived: !!c.archived,
    birthday: c.birthday || c.birthdate || "",
    pk_id: c.pkId || "",
  };
}

// SP group shape: { exists, id, content: { name, color, members: [...spMemberIds], parent, desc, emoji } }
export function mapGroupToLocalGroup(group) {
  const spId = group.id || group._id || "";
  const c = group.content || group;

  // members in SP groups are arrays of SP member IDs
  const spMemberIds = Array.isArray(c.members) ? c.members : [];

  // parent is a SP group ID — we store it for potential nested group support
  const parentSpId = c.parent || "";

  return {
    sp_id: spId,
    name: c.name || "Unnamed Group",
    color: normalizeColor(c.color),
    description: c.desc || c.description || "",
    emoji: c.emoji || "",
    sp_member_ids: spMemberIds,   // raw SP IDs, resolved to local alter_ids in import step
    sp_parent_id: parentSpId,     // raw SP parent group ID
    tags: Array.isArray(c.tags) ? c.tags : [],
    is_hidden: !!c.private,
  };
}