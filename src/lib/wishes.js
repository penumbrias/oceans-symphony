// Wishes (System Needs, phase 2).
//
// A Wish is something wanted — an item, an activity, an experience, a goal
// or a need — that belongs to one or more alters, or to everyone. Fields:
//   title, kind, owner_alter_ids[], for_everyone, is_private,
//   priority ("low" | "normal" | "high"), status (WISH_STATUSES),
//   status_changed_at, price, url, category_id (an activity it maps to),
//   driving / impact (authored text: "what's driving this?" / "how does it
//   affect us?"), author_alter_ids, plan_ids[] (plans made from it),
//   last_happened_at (the last time one of those plans was done).
//
// Links into the rest of the app (v0.353.0) — a wish's kind is not just a
// tag:
//   category_id — an activity / experience wish IS one of the planner's
//                 activities (picked or created with ActivityPillSelector);
//                 "Plan it" makes a plan of that activity.
//   goal_id     — a goal wish points at a goal page (picked, or made from
//                 the wish by goalFromWish). Older wishes made into a goal
//                 before this field are found through Goal.wish_id
//                 (wishGoalId reads both).
//   list_id / list_item_id — an item wish sits on one of the person's lists
//                 (a wishlist, shopping list or checklist on the Notes &
//                 lists page). Only the title goes onto the list; marking
//                 the wish done ticks it there.
//
// Wishes are never removed by the app: "done" and "let go" keep them in
// history. Only the person's own Delete removes one.
//
// is_private: shown only on its owners' profiles — kept out of search and
// out of the shared Needs views.

import { formatDistanceToNowStrict } from "date-fns";
import { base44, localEntities } from "@/api/base44Client";
import { createUnlockedItem, updateUnlockedItem } from "@/lib/localUnlockedGrocery";

export const WISHES_QUERY_KEY = ["wishes"];

export const WISH_KINDS = [
  { id: "item", label: "Item", emoji: "🎁" },
  { id: "activity", label: "Activity", emoji: "🎨" },
  { id: "experience", label: "Experience", emoji: "🌅" },
  { id: "goal", label: "Goal", emoji: "🎯" },
  { id: "need", label: "Need", emoji: "💗" },
];
export const wishKindMeta = (id) => WISH_KINDS.find((k) => k.id === id) || WISH_KINDS[0];

export const WISH_STATUSES = [
  { id: "wished", label: "Wished for" },
  { id: "planned", label: "Planned" },
  { id: "in_progress", label: "In progress" },
  { id: "done", label: "Done" },
  { id: "let_go", label: "Let go" },
];
export const wishStatusLabel = (id) => WISH_STATUSES.find((s) => s.id === id)?.label || "Wished for";
export const isOpenWish = (w) => !["done", "let_go"].includes(w?.status || "wished");

export const WISH_PRIORITIES = ["low", "normal", "high"];
const PRIORITY_RANK = { high: 0, normal: 1, low: 2 };

// Wishes that show on one alter's profile: theirs, plus everyone's.
export function wishesForAlter(wishes = [], alterId) {
  return (wishes || []).filter((w) =>
    w && (w.for_everyone || (Array.isArray(w.owner_alter_ids) && w.owner_alter_ids.includes(alterId))));
}

// Open first (high priority, then longest waiting), then finished ones,
// newest first.
export function sortWishes(wishes = []) {
  return [...wishes].sort((a, b) => {
    const ao = isOpenWish(a), bo = isOpenWish(b);
    if (ao !== bo) return ao ? -1 : 1;
    if (ao) {
      const pr = (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1);
      if (pr) return pr;
      return String(a.created_date || "").localeCompare(String(b.created_date || ""));
    }
    return String(b.status_changed_at || b.updated_date || "").localeCompare(String(a.status_changed_at || a.updated_date || ""));
  });
}

// "waiting 3 weeks" for an open wish; "done 2 days ago" / "let go …" after.
export function wishAgeLabel(wish, now = new Date()) {
  if (!wish) return "";
  const since = (iso) => {
    const d = iso ? new Date(iso) : null;
    return d && !isNaN(d) ? formatDistanceToNowStrict(d, { now }) : null;
  };
  if (wish.status === "done") { const s = since(wish.status_changed_at); return s ? `done ${s} ago` : "done"; }
  if (wish.status === "let_go") { const s = since(wish.status_changed_at); return s ? `let go ${s} ago` : "let go"; }
  const s = since(wish.created_date);
  return s ? `waiting ${s}` : "";
}

// A new wish (v0.304.1) — the quick-add rows on the Needs page, the
// Wishlist tab and the Wishes widget all make one this way. No owners =
// for everyone.
export function createWish({ title, kind = "item", ownerIds = [], links = {} }) {
  const owners = (ownerIds || []).filter(Boolean);
  return base44.entities.Wish.create({
    title: String(title || "").trim(), kind, owner_alter_ids: owners, for_everyone: owners.length === 0, is_private: false,
    priority: "normal", status: "wished", status_changed_at: new Date().toISOString(),
    ...cleanLinks(links),
  });
}

// Only the link fields a wish stores, without the "make a new one" markers.
const LINK_FIELDS = ["category_id", "goal_id", "list_id", "list_item_id"];
export const NEW_GOAL = "__new_goal__";
export const NEW_WISHLIST = "__new_wishlist__";
function cleanLinks(links = {}) {
  const out = {};
  for (const k of LINK_FIELDS) {
    const v = links?.[k];
    if (v && v !== NEW_GOAL && v !== NEW_WISHLIST) out[k] = v;
  }
  return out;
}

export async function setWishStatus(wish, status, { lists = [] } = {}) {
  const saved = await base44.entities.Wish.update(wish.id, { status, status_changed_at: new Date().toISOString() });
  // Done → tick it on the list it sits on (never unticks: the list is the
  // person's own record of what they got).
  if (status === "done" && wish.list_id && wish.list_item_id) {
    const list = (lists || []).find((l) => l.id === wish.list_id);
    try {
      const patch = { checked: true, purchased_at: new Date().toISOString(), ran_out_at: null };
      if (list?.source === "local") updateUnlockedItem(wish.list_item_id, patch);
      else await localEntities.GroceryItem.update(wish.list_item_id, patch);
    } catch { /* the wish is done either way */ }
  }
  return saved;
}

// ── Links (v0.353.0) ─────────────────────────────────────────────────

// The goal a wish points at: its own goal_id, or (older wishes) the goal
// that was made from it.
export function wishGoalId(wish, goals = []) {
  if (!wish) return null;
  if (wish.goal_id && (goals || []).some((g) => g.id === wish.goal_id)) return wish.goal_id;
  return (goals || []).find((g) => g.wish_id === wish.id)?.id || null;
}

export function linkWishToGoal(wish, goalId) {
  const move = goalId && (wish.status === "wished" || wish.status === "planned" || !wish.status);
  return base44.entities.Wish.update(wish.id, {
    goal_id: goalId || null,
    ...(move ? { status: "in_progress", status_changed_at: new Date().toISOString() } : {}),
  });
}

// A new wishlist on the Notes & lists page (encrypted store, like every
// list made in the app; nobody's name goes on it).
export async function createWishlist(name = "Wishlist") {
  return { ...(await localEntities.GroceryList.create({
    name: String(name || "").trim() || "Wishlist", list_type: "wishlist", created_date: new Date().toISOString(),
  })), source: "idb" };
}

const norm = (s) => String(s || "").trim().toLowerCase();

// Put an item wish on a list (a combined-catalogue list from noteLists.js,
// carrying `source`), or link the matching row already there. Only the
// title goes across — lists can be "available when locked" plaintext, so
// they never name who wants it. Returns { added, item }.
export async function addWishToList(wish, list, items = []) {
  if (!wish || !list) return { added: false, item: null };
  const name = String(wish.title || "").trim();
  let item = (items || []).find((i) => i && i.list_id === list.id && !i.checked && !i.trashed_at && norm(i.name) === norm(name)) || null;
  let added = false;
  if (!item) {
    item = list.source === "local"
      ? createUnlockedItem(list.id, name)
      : await localEntities.GroceryItem.create({ list_id: list.id, name, checked: false, created_date: new Date().toISOString() });
    added = !!item;
  }
  if (item) await base44.entities.Wish.update(wish.id, { list_id: list.id, list_item_id: item.id });
  return { added, item };
}

// After a wish is saved: make what the person asked for (a new goal, a new
// wishlist) and connect it. `links` is what the link fields hold; `lists`
// and `items` come from useNoteLists. Returns the wish's goal, if one was made.
export async function applyWishLinks(wish, links = {}, { lists = [], items = [] } = {}) {
  let goal = null;
  if (links.goal_id === NEW_GOAL) {
    const { goalFromWish } = await import("@/lib/goals");
    goal = await goalFromWish(wish);
  } else if ((links.goal_id || null) !== (wish.goal_id || null) && links.goal_id) {
    await linkWishToGoal(wish, links.goal_id);
  }
  // A drawn-from-list wish already points at its row (createWish stored it).
  if (links.list_id && !links.list_item_id) {
    const list = links.list_id === NEW_WISHLIST
      ? await createWishlist()
      : (lists || []).find((l) => l.id === links.list_id);
    if (list && !(wish.list_id === list.id && wish.list_item_id)) await addWishToList(wish, list, items);
  }
  return goal;
}

// Make a plan from an activity wish. The plan carries wish_id, so doing it
// stamps the wish (markWishHappenedFor). Returns the plan.
export async function planWish(wish, when, { categories = [] } = {}) {
  const cat = (categories || []).find((c) => c.id === wish.category_id);
  const plan = await base44.entities.Activity.create({
    timestamp: when.toISOString(),
    activity_name: wish.title || cat?.name || "Activity",
    activity_category_ids: wish.category_id ? [wish.category_id] : [],
    ...(cat?.color ? { color: cat.color } : {}),
    fronting_alter_ids: wish.for_everyone ? [] : (wish.owner_alter_ids || []),
    is_planned: true,
    status: "scheduled",
    wish_id: wish.id,
  });
  await base44.entities.Wish.update(wish.id, {
    plan_ids: [...(wish.plan_ids || []), plan.id],
    ...(wish.status === "wished" || !wish.status ? { status: "planned", status_changed_at: new Date().toISOString() } : {}),
  });
  return plan;
}

// A plan made from a wish was done → note when the wish last happened
// (the Needs balance view reads it). The status is left to the person:
// "more karaoke" isn't finished by one evening of it.
export async function markWishHappenedFor(plan) {
  if (!plan?.wish_id) return;
  try {
    await base44.entities.Wish.update(plan.wish_id, { last_happened_at: new Date().toISOString() });
  } catch { /* the plan outcome stands */ }
}
