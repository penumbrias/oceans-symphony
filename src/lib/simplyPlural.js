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

// Fetch all notes for a system (notes are per-member in SP)
export async function getNotes(token, systemId) {
  try {
    const data = await spFetch(`/notes/${systemId}`, token);
    return Array.isArray(data) ? data : (data.data ?? []);
  } catch {
    return [];
  }
}

function normalizeColor(raw) {
  if (!raw) return "";
  return raw.startsWith("#") ? raw : `#${raw}`;
}

export function mapMemberToAlter(member, groupsById = {}) {
  const id = member.id || member._id || "";
  const c = member.content || member;

  // Find which groups this member belongs to
  const memberGroups = Object.values(groupsById)
    .filter((g) => {
      const gc = g.content || g;
      return Array.isArray(gc.members) && gc.members.includes(id);
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
    sp_id: id,
    name: c.name || "Unknown",
    pronouns: Array.isArray(c.pronouns)
      ? c.pronouns.join(", ")
      : (c.pronouns || ""),
    description: c.desc || c.description || "",
    color: normalizeColor(c.color),
    avatar_url: c.avatarUrl || c.avatar_url || "",
    banner_url: c.bannerUrl || c.banner_url || "",
    role: c.role || "",
    // SP uses 'info' for custom field values
    custom_fields: c.info || {},
    tags: Array.isArray(c.tags) ? c.tags : [],
    groups: memberGroups,
    is_archived: !!c.archived,
    // Additional SP fields
    birthday: c.birthday || c.birthdate || "",
    // 'pkId' links to a PluralKit member if the system uses both
    pk_id: c.pkId || "",
  };
}

export function mapGroupToLocalGroup(group, memberSpIds = []) {
  const id = group.id || group._id || "";
  const c = group.content || group;

  // SP stores group members as an array of member IDs
  const spMemberIds = Array.isArray(c.members) ? c.members : [];

  return {
    sp_id: id,
    name: c.name || "Unnamed Group",
    color: normalizeColor(c.color),
    description: c.desc || c.description || "",
    // We store the raw SP member IDs here; the import step resolves these
    // to local alter IDs after alters are imported
    sp_member_ids: spMemberIds,
    tags: Array.isArray(c.tags) ? c.tags : [],
    is_hidden: !!c.private,
  };
}

export function mapNoteToAlterNote(note, alterIdBySpId = {}) {
  const c = note.content || note;
  const spMemberId = c.member || c.memberId || "";

  return {
    sp_id: note.id || note._id || "",
    alter_id: alterIdBySpId[spMemberId] || null,
    sp_member_id: spMemberId,
    title: c.title || "",
    note: c.note || c.text || c.body || "",
    is_private: !!c.private,
    created_date: c.lastOperationTime
      ? new Date(c.lastOperationTime).toISOString()
      : new Date().toISOString(),
  };
}