// The Groups room's pure helpers (board 26-Groups): which group the address
// names, which page of it is open, the tree's rows, the header's line and
// the words the room shows. Nothing here reads or writes a record; every
// tree walk goes through src/lib/groupTree.js (cycle-guarded), every member
// list through getMemberAlters (the group's own order).

import { flattenGroupTree, ancestorIds, childGroups, indexGroups, wouldNest, resolvedParentId } from "@/lib/groupTree";
import { getMemberAlters } from "@/lib/subsystemUtils";

/** "list" on /groups, "group" on /group/:id, else null. */
export function groupsRoomOf(pathname) {
  const p = String(pathname || "").replace(/\/+$/, "") || "/";
  if (p === "/groups") return "list";
  if (/^\/group\/[^/]+$/.test(p)) return "group";
  return null;
}

/** The group id in /group/:id (decoded), or null. */
export function groupIdOf(pathname) {
  const m = String(pathname || "").match(/^\/group\/([^/]+)\/?$/);
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch { return m[1]; }
}

/** A group by its id OR an imported sp_id (alter.groups stores either). */
export function findGroup(groups, id) {
  if (id == null || id === "") return null;
  return (groups || []).find((g) => String(g.id) === String(id) || (g.sp_id && String(g.sp_id) === String(id))) || null;
}

// ── The pages of a group (board 26: Profile · Board · Journal · Notes) ──
export const GROUP_TABS = ["profile", "board", "journal", "notes"];
export const MORE_GROUP_TABS = ["fronting"];
// ?view= opens the old page inside the room: its Info form, or its own layout.
export const OLD_VIEWS = ["info", "layout"];

/**
 * Which page the address asks for. Every ?tab= the old profile understood
 * lands somewhere: its four pages and Fronting by name, anything else (a
 * page the person added to their own layout) opens their layout.
 */
export function groupPageOf(search) {
  const q = new URLSearchParams(search || "");
  const view = q.get("view");
  if (OLD_VIEWS.includes(view)) return view;
  if (view === "manage") return "manage";
  const tab = q.get("tab");
  if (!tab) return "profile";
  if (GROUP_TABS.includes(tab) || MORE_GROUP_TABS.includes(tab)) return tab;
  return "layout";
}

/** The address of a group page (the room keeps ?tab= like the old profile). */
export function groupHref(id, page = "profile") {
  const base = `/group/${encodeURIComponent(id)}`;
  if (!page || page === "profile") return base;
  if (OLD_VIEWS.includes(page)) return `${base}?view=${page}`;
  return `${base}?tab=${page}`;
}

// ── The tree (the left panel) ──
/**
 * The rows the tree shows, in the groups' own order: every group (none is
 * buried — a broken or looping parent shows at the top), minus the ones
 * under a folded group. While searching, every match shows flat with its
 * path, so a group deep in the tree is still found.
 */
export function treeRows(groups, { folded = new Set(), query = "" } = {}) {
  const all = flattenGroupTree(groups || [], { sort: "order" });
  const byId = indexGroups(groups || []);
  const kids = new Set();
  for (const g of groups || []) {
    const p = resolvedParentId(g, byId);
    if (p && p !== g.id) kids.add(p);
  }
  const needle = String(query || "").trim().toLowerCase();
  if (needle) {
    return all
      .filter((g) => (g.name || "").toLowerCase().includes(needle))
      .map((g) => ({
        g, depth: 0, hasKids: false, open: false,
        path: ancestorIds(g, byId).map((id) => byId[id]?.name || "?").reverse().join(" / "),
      }));
  }
  return all
    .filter((g) => !ancestorIds(g, byId).some((id) => folded.has(id)))
    .map((g) => ({ g, depth: Math.min(g._depth || 0, 8), hasKids: kids.has(g.id), open: !folded.has(g.id), path: "" }));
}

/** The groups a group could move into: the top level, then every group that wouldn't loop. */
export function moveTargets(groups, ids) {
  const moving = ids || [];
  return [
    { id: "", label: "Top level", _depth: 0 },
    ...flattenGroupTree(groups || []).filter((g) => !moving.includes(g.id) && !moving.some((id) => wouldNest(groups, id, g.id)))
      .map((g) => ({ id: g.id, label: g.name || "Untitled group", color: g.color, _depth: g._depth || 0 })),
  ];
}

/** May `dragId` be dropped onto `targetId` ("" = the top level)? */
export function canDrop(groups, dragId, targetId) {
  if (!dragId || dragId === targetId) return false;
  const byId = indexGroups(groups || []);
  const g = byId[dragId];
  if (!g) return false;
  if ((resolvedParentId(g, byId) || "") === (targetId || "")) return false; // already there
  return !wouldNest(groups, dragId, targetId || "");
}

// ── Words ──
export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** The sub-system word in the person's terms ("subsystem", "subcrew"…). */
export function subTermOf(terms = {}) {
  const sys = terms.system || "system";
  return sys === "system" ? "subsystem" : `sub${sys}`;
}

/** Header line (board 26): "Subsystem · root: Juniper · inside Inner world", or "4 alters · inside…". */
export function headerLine(group, { owner = null, parent = null, memberCount = 0, terms = {}, formatAlter = (a) => a?.name } = {}) {
  const parts = [];
  if (owner) parts.push(cap(subTermOf(terms)), `root: ${formatAlter(owner)}`);
  else parts.push(`${memberCount} ${memberCount === 1 ? terms.alter || "alter" : terms.alters || "alters"}`);
  if (parent) parts.push(`inside ${parent.name || "Untitled group"}`);
  return parts.join(" · ");
}

/** "2 members" in the person's words. */
export function countWords(n, terms = {}) {
  return `${n} ${n === 1 ? terms.alter || "alter" : terms.alters || "alters"}`;
}

/** How many alters are in a group (archived ones hidden when the group hides them). */
export function memberCount(group, alters) {
  return visibleMembers(group, alters).length;
}

/** The members a group shows: its own order; archived ones left out when the group says so. */
export function visibleMembers(group, alters) {
  return getMemberAlters(group, alters || []).filter((m) => !(group?.hide_archived_members && m.is_archived));
}

/** The group's nested groups, in order. */
export function nestedOf(groups, group) {
  if (!group) return [];
  return childGroups(groups || [], group.id).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.name || "").localeCompare(String(b.name || "")));
}

/** The newest post on a group's board (bulletins with its group_id). */
export function latestPost(bulletins, group) {
  if (!group) return null;
  const mine = (bulletins || []).filter((b) => b.group_id === group.id && !b.trashed_at);
  mine.sort((a, b) => String(b.created_date || b.timestamp || "").localeCompare(String(a.created_date || a.timestamp || "")));
  return mine[0] || null;
}

/** The status line under the room. */
export function statusWords({ groups = [], subsystems = 0, stranded = 0 }) {
  const n = groups.length;
  const bits = [`${n} ${n === 1 ? "group" : "groups"}`];
  if (subsystems) bits.push(`${subsystems} with a root`);
  if (stranded) bits.push(`${stranded} lost ${stranded === 1 ? "its" : "their"} place and ${stranded === 1 ? "shows" : "show"} at the top`);
  return bits.join(" · ");
}

/** A note's short date ("Nov 14"). */
export function shortDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
