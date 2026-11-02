// The Goals workspace (v0.285.0): goals work like a notebook.
//
// Every page is a Goal record. A top-level goal has no parent_id; a
// section is a Goal with parent_id set to the page it sits inside, nested
// as deep as the person likes. Turning a section into its own page is
// just opening it — nothing is rebuilt, and moving a page only changes
// its parent_id.
//
// The lines on a page are GoalStep records (goal_id = the page). Next to
// the older kinds (check, todo, todos, activity_count, plan, daily_task,
// rhythm — see goals.js) a page can hold:
//   text  — a note (body), written with the app's usual grammar, and
//           [[Page title]] links to other pages
//   link  — a connection to another page (target_goal_id, label)
// Sections and lines share one `order` scale inside their page, so a
// section can sit between two to-dos.
//
// New page fields: parent_id, order, icon, view ("outline" | "board" |
// "map"), collapsed, pinned, activity_category_ids (the activities the
// page's strip starts). A to-do made on a page is an ordinary Task with
// goal_id; an activity started from a page is logged with goal_id, which
// is how a page totals its time.
//
// LOAD-BEARING: every walk here is cycle-guarded and depth-clamped. One bad
// parent pointer must never hang a render (same lesson as groupTree.js and
// categoryTreeUtils.js). A parent that's gone, or that loops, makes the page
// top level instead of hiding it.

import { goalWeekWindow, activityWhen } from "@/lib/goalCounting";
import { base44 } from "@/api/base44Client";
import { withTrashBatch } from "@/lib/localDb";
import { createTask, deleteTask } from "@/lib/taskCreate";
import { countableMinutes, statusFor, ACTIVITY_STATUSES } from "@/lib/activityStatus";

export const MAX_PAGE_DEPTH = 24;
export const PAGE_VIEWS = ["outline", "board", "map"];
export const ADDABLE_KINDS = ["text", "todo", "check", "section", "link", "activity_count"];

const byIdOf = (goals) => {
  const m = new Map();
  for (const g of goals || []) if (g?.id) m.set(g.id, g);
  return m;
};

const sortKey = (r) => [Number.isFinite(Number(r?.order)) && r?.order !== null && r?.order !== undefined ? Number(r.order) : Infinity, String(r?.created_date || "")];
export function byOrder(a, b) {
  const [ao, ac] = sortKey(a);
  const [bo, bc] = sortKey(b);
  if (ao !== bo) return ao < bo ? -1 : 1;
  return ac.localeCompare(bc);
}

// The parent's id, only when that parent exists and doesn't loop back.
export function parentIdOf(goal, byId) {
  const p = goal?.parent_id;
  if (!p || !byId.has(p) || p === goal.id) return null;
  // Walk up: if we come back to this goal, the chain loops — top level.
  const seen = new Set([goal.id]);
  let cur = byId.get(p);
  let depth = 0;
  while (cur && depth < MAX_PAGE_DEPTH) {
    if (seen.has(cur.id)) return null;
    seen.add(cur.id);
    const next = cur.parent_id;
    if (!next || !byId.has(next)) return p;
    cur = byId.get(next);
    depth += 1;
  }
  return depth >= MAX_PAGE_DEPTH ? null : p;
}

export function indexPages(goals) {
  const byId = byIdOf(goals);
  const parent = new Map();
  const children = new Map();
  for (const g of byId.values()) {
    const pid = parentIdOf(g, byId);
    parent.set(g.id, pid);
    const key = pid || null;
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(g);
  }
  for (const list of children.values()) list.sort(byOrder);
  return { byId, parent, children };
}

export const rootPages = (index) => index.children.get(null) || [];
export const childPages = (index, id) => index.children.get(id) || [];

// The page's ancestors, nearest first.
export function ancestorsOf(index, id) {
  const out = [];
  const seen = new Set([id]);
  let pid = index.parent.get(id);
  while (pid && !seen.has(pid) && out.length < MAX_PAGE_DEPTH) {
    seen.add(pid);
    const p = index.byId.get(pid);
    if (!p) break;
    out.push(p);
    pid = index.parent.get(pid);
  }
  return out;
}

export function descendantIds(index, id) {
  const out = [];
  const seen = new Set([id]);
  const walk = (pid, depth) => {
    if (depth > MAX_PAGE_DEPTH) return;
    for (const c of childPages(index, pid)) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c.id);
      walk(c.id, depth + 1);
    }
  };
  walk(id, 0);
  return out;
}

// Putting `id` inside `newParentId` would make it its own ancestor.
export function wouldNest(index, id, newParentId) {
  if (!newParentId) return false;
  if (newParentId === id) return true;
  return descendantIds(index, id).includes(newParentId);
}

// Depth-tagged list of every page, for pickers and the sidebar.
export function flattenPages(index, { skip = null } = {}) {
  const out = [];
  const seen = new Set();
  const walk = (pid, depth) => {
    if (depth > MAX_PAGE_DEPTH) return;
    for (const p of childPages(index, pid)) {
      if (seen.has(p.id) || p.id === skip) continue;
      seen.add(p.id);
      out.push({ page: p, depth });
      walk(p.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export function liveSteps(steps) {
  return (steps || []).filter((s) => s && !s.removed_at);
}

// Sections and lines on one page, in order: [{ type: "page"|"item", rec }].
export function pageEntries(index, steps, pageId) {
  const items = liveSteps(steps).filter((s) => s.goal_id === pageId).map((rec) => ({ type: "item", rec }));
  const pages = childPages(index, pageId).map((rec) => ({ type: "page", rec }));
  return [...pages, ...items].sort((a, b) => byOrder(a.rec, b.rec));
}

// An order value that lands after `entries[at]` (or at the end).
export function orderAfter(entries, at = entries.length - 1) {
  const nums = entries.map((e) => Number(e.rec?.order)).map((n) => (Number.isFinite(n) ? n : null));
  const max = nums.reduce((m, n) => (n !== null && n > m ? n : m), 0);
  if (at < 0) {
    const first = nums.find((n) => n !== null);
    return first !== undefined && first !== null ? first - 1 : 1;
  }
  if (at >= entries.length - 1) return max + 1;
  const a = nums[at] ?? max;
  const b = nums[at + 1];
  return b !== null && b !== undefined && b > a ? (a + b) / 2 : a + 0.5;
}

// ── Links ───────────────────────────────────────────────────────────

const WIKI = /\[\[([^\]\n]{1,120})\]\]/g;
export function wikiTitles(text) {
  const out = [];
  for (const m of String(text || "").matchAll(WIKI)) out.push(m[1].trim());
  return out;
}
export function splitWikiLinks(text) {
  const parts = [];
  let last = 0;
  const s = String(text || "");
  for (const m of s.matchAll(WIKI)) {
    if (m.index > last) parts.push({ text: s.slice(last, m.index) });
    parts.push({ link: m[1].trim() });
    last = m.index + m[0].length;
  }
  if (last < s.length) parts.push({ text: s.slice(last) });
  return parts;
}
export function findPageByTitle(goals, title) {
  const want = String(title || "").trim().toLowerCase();
  if (!want) return null;
  return (goals || []).find((g) => String(g.title || "").trim().toLowerCase() === want) || null;
}

// Pages this one points at, and pages that point here.
//   [{ page, label, via: "link" | "text", stepId }]
export function connectionsOf(pageId, goals, steps) {
  const byId = byIdOf(goals);
  const out = [];
  const inc = [];
  for (const s of liveSteps(steps)) {
    if (s.kind === "link" && s.target_goal_id) {
      if (s.goal_id === pageId && byId.has(s.target_goal_id)) out.push({ page: byId.get(s.target_goal_id), label: s.label || "", via: "link", stepId: s.id });
      if (s.target_goal_id === pageId && byId.has(s.goal_id)) inc.push({ page: byId.get(s.goal_id), label: s.label || "", via: "link", stepId: s.id });
    }
    if (s.kind === "text" && s.body) {
      for (const title of wikiTitles(s.body)) {
        const target = findPageByTitle(goals, title);
        if (!target) continue;
        if (s.goal_id === pageId && target.id !== pageId) out.push({ page: target, label: "", via: "text", stepId: s.id });
        if (target.id === pageId && s.goal_id !== pageId && byId.has(s.goal_id)) inc.push({ page: byId.get(s.goal_id), label: "", via: "text", stepId: s.id });
      }
    }
  }
  const dedupe = (list) => {
    const seen = new Set();
    return list.filter((c) => { const k = `${c.page.id}:${c.label}`; if (seen.has(k)) return false; seen.add(k); return true; });
  };
  return { outgoing: dedupe(out), incoming: dedupe(inc) };
}

// ── Time ────────────────────────────────────────────────────────────

const HAPPENED = new Set([ACTIVITY_STATUSES.LOGGED, ACTIVITY_STATUSES.DONE, ACTIVITY_STATUSES.PARTIAL]);
// Minutes logged on a page (and every page inside it): this week and ever.
export function pageMinutes(pageIds, activities, now = new Date()) {
  const ids = new Set(pageIds);
  const weekStart = goalWeekWindow(now).start;
  let week = 0, total = 0;
  for (const a of activities || []) {
    if (!a?.goal_id || !ids.has(a.goal_id) || !HAPPENED.has(statusFor(a))) continue;
    const m = countableMinutes(a);
    total += m;
    const ts = activityWhen(a);
    if (ts && ts >= weekStart && ts <= now) week += m;
  }
  return { week: Math.round(week), total: Math.round(total) };
}

export function formatMinutes(min) {
  const m = Math.max(0, Math.round(Number(min) || 0));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
}

// ── Writes ──────────────────────────────────────────────────────────

export function createPage({ title, parent_id = null, order = null, ...rest } = {}) {
  return base44.entities.Goal.create({
    status: "active", status_changed_at: new Date().toISOString(),
    for_everyone: true, owner_alter_ids: [], supporter_alter_ids: [], struggler_alter_ids: [],
    ...rest,
    parent_id: parent_id || null,
    ...(order !== null ? { order } : {}),
    title: String(title || "").trim() || "Untitled",
  });
}

export function updatePage(id, patch) {
  return base44.entities.Goal.update(id, patch);
}

// Move a page under another (or to the top level). Refuses loops.
export async function movePage(index, id, newParentId, order = null) {
  if (wouldNest(index, id, newParentId)) throw new Error("A page can't go inside one of its own sections.");
  const patch = { parent_id: newParentId || null };
  if (order !== null) patch.order = order;
  return base44.entities.Goal.update(id, patch);
}

export function addItem(pageId, fields, order) {
  return base44.entities.GoalStep.create({
    kind: "check", ...fields, goal_id: pageId, order,
    title: String(fields.title || "").trim(),
  });
}

export function updateItem(id, patch) {
  return base44.entities.GoalStep.update(id, patch);
}

// A to-do line's to-do moves with it, so the To-Do list names the right page.
export async function moveItem(item, pageId, order) {
  const out = await base44.entities.GoalStep.update(item.id, { goal_id: pageId, order });
  if (item.kind === "todo" && item.ref_id && pageId !== item.goal_id) {
    try { await base44.entities.Task.update(item.ref_id, { goal_id: pageId }); } catch { /* its to-do was deleted */ }
  }
  return out;
}

// A new to-do on the To-Do list, shown on the page as a round to-do line.
export async function addTodoItem(pageId, title, order) {
  const clean = String(title || "").trim();
  const task = await createTask({ title: clean, goal_id: pageId });
  const step = await addItem(pageId, { kind: "todo", title: clean, ref_id: task.id }, order);
  try { await base44.entities.Task.update(task.id, { goal_step_id: step.id }); } catch { /* the line still points at it */ }
  return step;
}

// A quick checkbox (or a note) moves onto the To-Do list.
export async function itemToTodo(item) {
  const task = await createTask({ title: item.title || item.body || "To-do", goal_id: item.goal_id, goal_step_id: item.id });
  return base44.entities.GoalStep.update(item.id, { kind: "todo", ref_id: task.id, title: item.title || item.body || "To-do" });
}

// A line becomes a section in the same spot. The line goes to the trash
// (one batch with nothing else), so it can be put back.
export async function itemToSection(item) {
  const page = await createPage({ title: item.title || item.body || "Section", parent_id: item.goal_id, order: item.order ?? null });
  await base44.entities.GoalStep.delete(item.id);
  return page;
}

// Delete a line. A to-do line asks whether its to-do goes too.
export async function deleteItem(item, { withTask = false } = {}) {
  await withTrashBatch(async () => {
    await base44.entities.GoalStep.delete(item.id);
    if (withTask && item.kind === "todo" && item.ref_id) await deleteTask(item.ref_id);
  });
}

// A page goes to the trash with every section inside it, all their lines,
// and the to-dos made on them — one batch, so a restore brings it all back.
export async function deletePage(index, steps, id) {
  const ids = [id, ...descendantIds(index, id)];
  const set = new Set(ids);
  const lines = liveSteps(steps).filter((s) => set.has(s.goal_id));
  await withTrashBatch(async () => {
    let tasks = [];
    try { tasks = (await base44.entities.Task.list()) || []; } catch { tasks = []; }
    const taskIds = new Set(tasks.filter((t) => t.goal_id && set.has(t.goal_id) && !t.parent_task_id).map((t) => t.id));
    for (const s of lines) if (s.kind === "todo" && s.ref_id && tasks.some((t) => t.id === s.ref_id && t.goal_id && set.has(t.goal_id))) taskIds.add(s.ref_id);
    if (lines.length) await base44.entities.GoalStep.bulkDelete(lines.map((s) => s.id));
    for (const tid of taskIds) await deleteTask(tid);
    await base44.entities.Goal.bulkDelete(ids);
  });
  return ids.length;
}

// Indent: into the section just above. Outdent: out to the parent page,
// right after the section it was in.
export async function indentEntry(index, steps, pageId, entry) {
  const entries = pageEntries(index, steps, pageId);
  const at = entries.findIndex((e) => e.rec.id === entry.rec.id);
  let prev = null;
  for (let i = at - 1; i >= 0; i -= 1) if (entries[i].type === "page") { prev = entries[i].rec; break; }
  if (!prev) return false;
  const inside = pageEntries(index, steps, prev.id);
  const order = orderAfter(inside);
  if (entry.type === "page") await movePage(index, entry.rec.id, prev.id, order);
  else await moveItem(entry.rec, prev.id, order);
  return true;
}

export async function outdentEntry(index, steps, pageId, entry) {
  const parentId = index.parent.get(pageId);
  const page = index.byId.get(pageId);
  if (!page) return false;
  const outer = pageEntries(index, steps, parentId || null).filter((e) => parentId || e.type === "page");
  if (!parentId && entry.type === "item") return false; // lines can't live outside a page
  const at = outer.findIndex((e) => e.rec.id === pageId);
  const order = orderAfter(outer, at);
  if (entry.type === "page") await movePage(index, entry.rec.id, parentId || null, order);
  else await moveItem(entry.rec, parentId, order);
  return true;
}

// Swap with the neighbour above (-1) or below (+1).
export async function nudgeEntry(index, steps, pageId, entry, dir) {
  const entries = pageId ? pageEntries(index, steps, pageId) : rootPages(index).map((rec) => ({ type: "page", rec }));
  const at = entries.findIndex((e) => e.rec.id === entry.rec.id);
  const to = at + dir;
  if (at < 0 || to < 0 || to >= entries.length) return false;
  // Give everything a clean 1..n first so swaps always move.
  const reordered = [...entries];
  const [moved] = reordered.splice(at, 1);
  reordered.splice(to, 0, moved);
  await writeOrder(reordered);
  return true;
}

export async function writeOrder(entries) {
  const pagePatches = [];
  const stepPatches = [];
  entries.forEach((e, i) => {
    const order = i + 1;
    if (Number(e.rec.order) === order) return;
    (e.type === "page" ? pagePatches : stepPatches).push({ id: e.rec.id, data: { order } });
  });
  if (pagePatches.length) await base44.entities.Goal.bulkUpdate(pagePatches);
  if (stepPatches.length) await base44.entities.GoalStep.bulkUpdate(stepPatches);
}

// ── Planning activity ───────────────────────────────────────────────

// The activity that counts as "planning": the person's pick, else one
// named Planning, else none yet (the strip offers to add one).
export function planningCategoryFor(settings, categories) {
  const picked = settings?.goals_planning_category_id;
  if (picked && (categories || []).some((c) => c.id === picked)) return (categories || []).find((c) => c.id === picked);
  return (categories || []).find((c) => String(c.name || "").trim().toLowerCase() === "planning") || null;
}

export async function setPlanningCategory(categoryId) {
  const { pickPrimarySystemSettings } = await import("@/lib/systemSettingsSingleton");
  const list = await base44.entities.SystemSettings.list().catch(() => []);
  const row = pickPrimarySystemSettings(list);
  if (row) await base44.entities.SystemSettings.update(row.id, { goals_planning_category_id: categoryId || null });
}

export async function addPlanningCategory() {
  const cat = await base44.entities.ActivityCategory.create({ name: "Planning", color: "#5b8db8", parent_category_id: null });
  await setPlanningCategory(cat.id);
  return cat;
}
