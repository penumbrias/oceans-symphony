import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const SP_API_BASE = "https://api.apparyllis.com/v1";

async function spFetch(path, token, method = "GET", body = null) {
  const opts = {
    method,
    headers: { Authorization: token },
  };
  if (body) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${SP_API_BASE}${path}`, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Simply Plural API error (${res.status}): ${text}`);
  }
  return res.json();
}

function alterToMemberPayload(alter) {
  return {
    name: alter.name,
    pronouns: alter.pronouns ? alter.pronouns.split(",").map(p => p.trim()).filter(p => p) : [],
    desc: alter.description || "",
    color: alter.color ? alter.color.replace("#", "") : "",
    avatarUrl: alter.avatar_url || "",
    role: alter.role || "",
    archived: alter.is_archived || false,
  };
}

function groupToGroupPayload(group) {
  return {
    name: group.name,
    color: group.color ? group.color.replace("#", "") : "",
    parent: group.parent || null,
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

    if (!["standard", "new_only"].includes(mode)) {
      return Response.json(
        { error: "Invalid mode. Must be 'standard' or 'new_only'" },
        { status: 400 }
      );
    }

    const alters = await base44.entities.Alter.list();
    const groups = await base44.entities.Group.list();

    let created = 0;
    let updated = 0;
    let groupsCreated = 0;
    let groupsUpdated = 0;

    // Export groups first
    for (const group of groups) {
      try {
        if (group.sp_id) {
          // Update existing group
          if (mode === "standard") {
            await spFetch(`/group/${group.sp_id}`, sp_token, "PATCH", groupToGroupPayload(group));
            groupsUpdated++;
          }
        } else {
          // Create new group
          const groupPayload = groupToGroupPayload(group);
          const result = await spFetch("/group", sp_token, "POST", groupPayload);
          if (result.id || result._id) {
            await base44.entities.Group.update(group.id, { sp_id: result.id || result._id });
            groupsCreated++;
          }
        }
      } catch (e) {
        console.error(`Failed to sync group ${group.id}:`, e.message);
      }
    }

    // Export alters/members
    for (const alter of alters) {
      try {
        if (alter.sp_id) {
          // Update existing member
          if (mode === "standard") {
            await spFetch(`/member/${alter.sp_id}`, sp_token, "PATCH", alterToMemberPayload(alter));
            updated++;
          }
        } else {
          // Create new member
          const memberPayload = alterToMemberPayload(alter);
          const result = await spFetch("/member", sp_token, "POST", memberPayload);
          if (result.id || result._id) {
            await base44.entities.Alter.update(alter.id, { sp_id: result.id || result._id });
            created++;
          }
        }
      } catch (e) {
        console.error(`Failed to sync alter ${alter.id}:`, e.message);
      }
    }

    return Response.json({
      success: true,
      alters: { created, updated },
      groups: { created: groupsCreated, updated: groupsUpdated },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});