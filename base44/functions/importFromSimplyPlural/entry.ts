import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const SP_API_BASE = "https://api.apparyllis.com/v1";

async function spFetch(path, token) {
  const res = await fetch(`${SP_API_BASE}${path}`, {
    headers: { Authorization: token },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Simply Plural API error (${res.status}): ${text}`);
  }
  return res.json();
}

async function getMembers(token, systemId) {
  const data = await spFetch(`/members/${systemId}`, token);
  return Array.isArray(data) ? data : (data.data ?? data.members ?? []);
}

async function getGroups(token, systemId) {
  const data = await spFetch(`/groups/${systemId}`, token);
  return Array.isArray(data) ? data : (data.data ?? []);
}

function mapMemberToAlter(member, groupsById = {}) {
  const id = member.id || member._id || "";
  const c = member.content || member;

  const rawColor = c.color || "";
  const color = rawColor
    ? rawColor.startsWith("#") ? rawColor : `#${rawColor}`
    : "";

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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sp_token, sp_system_id, mode } = await req.json();

    if (!sp_token || !sp_system_id || !mode) {
      return Response.json(
        { error: "Missing sp_token, sp_system_id, or mode" },
        { status: 400 }
      );
    }

    if (!["standard", "replace_all", "new_only"].includes(mode)) {
      return Response.json(
        { error: "Invalid mode. Must be 'standard', 'replace_all', or 'new_only'" },
        { status: 400 }
      );
    }

    const [members, groupsRaw] = await Promise.all([
      getMembers(sp_token, sp_system_id),
      getGroups(sp_token, sp_system_id),
    ]);

    if (!members || members.length === 0) {
      throw new Error("No members returned from Simply Plural. Check your token and system ID.");
    }

    // Build groups lookup
    const groupsById = {};
    groupsRaw.forEach((g) => {
      const gid = g.id || g._id;
      const gc = g.content || g;
      groupsById[gid] = {
        id: gid,
        name: gc.name || "",
        color: gc.color ? (gc.color.startsWith("#") ? gc.color : `#${gc.color}`) : "",
        parent: gc.parent || null,
        members: gc.members || [],
      };
    });

    // Handle replace_all mode
    if (mode === "replace_all") {
      const existingGroups = await base44.entities.Group.list();
      const existingAlters = await base44.entities.Alter.list();
      
      for (const g of existingGroups) {
        await base44.entities.Group.delete(g.id);
      }
      for (const a of existingAlters) {
        await base44.entities.Alter.delete(a.id);
      }
    }

    let groupsCreated = 0;
    let groupsUpdated = 0;
    let altersCreated = 0;
    let altersUpdated = 0;

    // Sync groups
    const existingGroups = await base44.entities.Group.list();
    const existingGroupsBySpId = {};
    existingGroups.forEach((g) => { if (g.sp_id) existingGroupsBySpId[g.sp_id] = g; });

    for (const g of Object.values(groupsById)) {
      const groupData = {
        sp_id: g.id,
        name: g.name,
        color: g.color,
        parent: g.parent || "",
        member_sp_ids: g.members,
      };
      const existing = existingGroupsBySpId[g.id];
      if (existing) {
        if (mode !== "new_only") {
          await base44.entities.Group.update(existing.id, groupData);
          groupsUpdated++;
        }
      } else {
        await base44.entities.Group.create(groupData);
        groupsCreated++;
      }
    }

    // Sync members
    const existingAlters = await base44.entities.Alter.list();
    const existingBySpId = {};
    existingAlters.forEach((a) => {
      if (a.sp_id) existingBySpId[a.sp_id] = a;
    });

    for (const member of members) {
      const alterData = mapMemberToAlter(member, groupsById);
      if (!alterData.sp_id) continue;
      
      const existing = existingBySpId[alterData.sp_id];
      if (existing) {
        if (mode !== "new_only") {
          await base44.entities.Alter.update(existing.id, alterData);
          altersUpdated++;
        }
      } else {
        await base44.entities.Alter.create(alterData);
        altersCreated++;
      }
    }

    return Response.json({
      success: true,
      alters: { created: altersCreated, updated: altersUpdated },
      groups: { created: groupsCreated, updated: groupsUpdated },
      mode,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});