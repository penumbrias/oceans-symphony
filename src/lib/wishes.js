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
// Wishes are never removed by the app: "done" and "let go" keep them in
// history. Only the person's own Delete removes one.
//
// is_private: shown only on its owners' profiles — kept out of search and
// out of the shared Needs views.

import { formatDistanceToNowStrict } from "date-fns";
import { base44, localEntities } from "@/api/base44Client";

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
export function createWish({ title, kind = "item", ownerIds = [] }) {
  const owners = (ownerIds || []).filter(Boolean);
  return base44.entities.Wish.create({
    title: String(title || "").trim(), kind, owner_alter_ids: owners, for_everyone: owners.length === 0, is_private: false,
    priority: "normal", status: "wished", status_changed_at: new Date().toISOString(),
  });
}

export function setWishStatus(wish, status) {
  return base44.entities.Wish.update(wish.id, { status, status_changed_at: new Date().toISOString() });
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

// Copy an item wish onto the shopping list. Only the title goes across —
// the list doubles as the privacy cover, so it never names who wants it.
export async function addWishToShoppingList(wish) {
  const lists = await localEntities.GroceryList.list().catch(() => []);
  let list = (lists || []).find((l) => l.list_type !== "note");
  if (!list) {
    list = await localEntities.GroceryList.create({ name: "Grocery list", created_date: new Date().toISOString() });
  }
  const items = await localEntities.GroceryItem.list().catch(() => []);
  const name = String(wish.title || "").trim();
  const norm = (s) => String(s || "").trim().toLowerCase();
  if ((items || []).some((i) => i.list_id === list.id && !i.checked && norm(i.name) === norm(name))) return { added: false, list };
  await localEntities.GroceryItem.create({ list_id: list.id, name, checked: false, created_date: new Date().toISOString() });
  return { added: true, list };
}
