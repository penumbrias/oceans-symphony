const SP_API_BASE = "https://api.apparyllis.com/v1";

export async function getSystemId(token) {
  const res = await fetch(`${SP_API_BASE}/me`, {
    headers: { Authorization: token },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Invalid Simply Plural token (${res.status}): ${body}`);
  }
  const text = await res.text();
  return text.replace(/"/g, "");
}

export async function getMembers(token, systemId) {
  const res = await fetch(`${SP_API_BASE}/members/${systemId}`, {
    headers: { Authorization: token },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to fetch members (${res.status}): ${body}`);
  }
  const data = await res.json();
  // API may return array directly or wrapped in a data field
  return Array.isArray(data) ? data : (data.data ?? data.members ?? []);
}

export function mapMemberToAlter(member) {
  // Simply Plural returns { id, content: { ... } } or flat objects
  const id = member.id || member._id || "";
  const content = member.content || member;
  return {
    sp_id: id,
    name: content.name || "Unknown",
    pronouns: content.pronouns || "",
    description: content.desc || content.description || "",
    color: content.color ? (content.color.startsWith("#") ? content.color : `#${content.color}`) : "",
    avatar_url: content.avatarUrl || content.avatar_url || "",
    role: content.role || "",
    custom_fields: content.info || {},
    is_archived: content.archived || false,
  };
}