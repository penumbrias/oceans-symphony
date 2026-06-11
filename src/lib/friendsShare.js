// Live encrypted member-list share (Phase 4). Ties together privacy levels
// (what each friend may see) + E2E crypto (encrypt per friend) + the relay
// (store/fetch blobs). The relay only ever holds ciphertext.
//
// Strain rules: avatar-free (no heavy image data), field-capped, fetched
// on-demand (not in the friends poll), and pushed only when you ask / on the
// Friends page. Bios are stripped to plain text and length-capped.

import { base44 } from "@/api/base44Client";
import { getLocalIdentity, FRIENDS_API_BASE, fetchFriendsList } from "@/lib/friendsApi";
import { getPrivacyLevels, resolveVisibleAlters } from "@/lib/privacyLevels";
import { encryptForRecipients, decryptEnvelope, isCryptoAvailable } from "@/lib/friendsCrypto";

function stripHtml(html) {
  if (!html) return "";
  if (typeof document !== "undefined") {
    const d = document.createElement("div");
    d.innerHTML = html;
    return (d.textContent || "").trim();
  }
  return String(html).replace(/<[^>]+>/g, "").trim();
}

// Build the lightweight, field-stripped payload one friend may see. `id` is
// always included as a stable row key — it's a random local id, not PII — so
// name-stripped members still render as a stable "Member" row on the friend's
// side. NO avatars (live share stays light).
export function buildSharePayload({ alters, levels, visibility, groupsById = {} }) {
  const visible = resolveVisibleAlters({ alters, levels, visibility });
  return visible.map(({ alter, fields }) => {
    const o = { id: alter.id };
    if (fields.has("name")) o.name = alter.name || "";
    if (fields.has("pronouns")) o.pronouns = alter.pronouns || "";
    if (fields.has("role")) o.role = alter.role || "";
    if (fields.has("age") && alter.age != null && alter.age !== "") o.age = alter.age;
    if (fields.has("color")) o.color = alter.color || "";
    if (fields.has("bio")) o.bio = stripHtml(alter.description || "").slice(0, 2000);
    if (fields.has("groups")) {
      o.groups = (Array.isArray(alter.groups) ? alter.groups : []).map((id) => groupsById[id]).filter(Boolean);
    }
    if (fields.has("customFields") && alter.alter_custom_fields) {
      o.customFields = Object.entries(alter.alter_custom_fields)
        .filter(([, v]) => v != null && String(v).trim() !== "")
        .map(([k, v]) => [k, stripHtml(String(v)).slice(0, 500)]);
    }
    return o;
  });
}

// Recompute + push the per-friend encrypted member share. Best-effort; skips
// friends who haven't published a key yet. Deletes a friend's blob when nothing
// is shared with them.
export async function pushAlterShares() {
  if (!isCryptoAvailable()) return false;
  const id = await getLocalIdentity();
  if (!id?.userId || !id?.secret) return false;

  const data = await fetchFriendsList().catch(() => null);
  const friends = data?.friends || [];
  if (!friends.length) return false;

  const [alters, settingsList, groups] = await Promise.all([
    base44.entities.Alter.list().catch(() => []),
    base44.entities.SystemSettings.list().catch(() => []),
    base44.entities.Group.list().catch(() => []),
  ]);
  const levels = getPrivacyLevels(settingsList[0]);
  const groupsById = Object.fromEntries((groups || []).map((g) => [g.id, g.name || "Group"]));
  const perFriendVisibility = id.perFriendVisibility || {};

  const perFriend = {};
  for (const f of friends) {
    const vis = perFriendVisibility[f.userId] || {};
    const payload = buildSharePayload({ alters, levels, visibility: vis, groupsById });
    if (!payload.length || !f.publicKey) {
      perFriend[f.userId] = null; // delete: nothing to share, or no key to encrypt to
      continue;
    }
    try {
      const theirPub = JSON.parse(f.publicKey);
      perFriend[f.userId] = await encryptForRecipients(JSON.stringify(payload), [{ id: f.userId, publicKeyJwk: theirPub }]);
    } catch {
      perFriend[f.userId] = null;
    }
  }

  try {
    const res = await fetch(`${FRIENDS_API_BASE}/update-alters`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: id.userId, secret: id.secret, perFriend }),
    });
    return res.ok;
  } catch { return false; }
}

// Fetch + decrypt the member list a given friend shared with me. Returns an
// array of member objects, or null if nothing's shared / undecryptable.
export async function fetchFriendShare(friendUserId) {
  if (!isCryptoAvailable()) return null;
  const id = await getLocalIdentity();
  if (!id?.userId || !id?.secret) return null;
  try {
    const res = await fetch(`${FRIENDS_API_BASE}/get-alters?userId=${encodeURIComponent(id.userId)}&secret=${encodeURIComponent(id.secret)}&friendId=${encodeURIComponent(friendUserId)}`);
    if (!res.ok) return null;
    const { envelope } = await res.json();
    if (!envelope) return null;
    const json = await decryptEnvelope(envelope);
    if (!json) return null;
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}
