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
  // /me returns either a plain string UID or a JSON object with uid field
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
    // Returns { custom: [...], members: [...] }
    const members = Array.isArray(data.members) ? data.members : [];
    const custom = Array.isArray(data.custom) ? data.custom : [];
    return { members, custom };
  } catch {
    return { members: [], custom: [] };
  }
}

export async function getFrontHistory(token, systemId, startTime, endTime) {
  try {
    const start = startTime || (Date.now() - 7 * 24 * 60 * 60 * 1000); // last 7 days
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

export function mapMemberToAlter(member, groupsById = {}) {
  const id = member.id || member._id || "";
  const c = member.content || member;

  const rawColor = c.color || "";
  const color = rawColor
    ? rawColor.startsWith("#") ? rawColor : `#${rawColor}`
    : "";

  // Find which groups this member belongs to
  const memberGroups = Object.values(groupsById)
    .filter((g) => Array.isArray(g.members) && g.members.includes(id))
    .map((g) => ({
      id: g.id,
      name: g.name,
      color: g.color ? (g.color.startsWith("#") ? g.color : `#${g.color}`) : "",
    }));

  return {
    sp_id: id,
    name: c.name || "Unknown",
    pronouns: Array.isArray(c.pronouns)
      ? c.pronouns.join(", ")
      : (c.pronouns || ""),
    description: c.desc || c.description || "",
    color,
    avatar_url: c.avatarUrl || c.avatar_url || "",
    role: c.role || "",
    custom_fields: c.info || {},
    tags: Array.isArray(c.tags) ? c.tags : [],
    groups: memberGroups,
    is_archived: !!c.archived,
  };
}