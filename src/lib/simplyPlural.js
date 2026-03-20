const SP_API_BASE = "https://api.apparyllis.com/v1";

export async function getSystemId(token) {
  const res = await fetch(`${SP_API_BASE}/me`, {
    headers: { Authorization: token },
  });
  if (!res.ok) throw new Error("Invalid Simply Plural token");
  const text = await res.text();
  return text.replace(/"/g, "");
}

export async function getMembers(token, systemId) {
  const res = await fetch(`${SP_API_BASE}/members/${systemId}`, {
    headers: { Authorization: token },
  });
  if (!res.ok) throw new Error("Failed to fetch members");
  return res.json();
}

export function mapMemberToAlter(member) {
  const content = member.content || member;
  return {
    sp_id: member.id || member._id,
    name: content.name || "Unknown",
    pronouns: content.pronouns || "",
    description: content.desc || "",
    color: content.color || "",
    avatar_url: content.avatarUrl || "",
    role: content.role || "",
    custom_fields: content.info || {},
    is_archived: content.archived || false,
  };
}