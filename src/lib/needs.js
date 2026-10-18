// Needs (System Needs, phase 6): the shared view of what everyone wants,
// how long it's been since each alter got something they enjoy, and turn
// agreements.
//
// Balance is worked out, never stored. For each alter it looks at:
//   • activities they're linked to as "enjoys" or "needs"
//     (AlterActivityLink) — the last time one was done, by anyone,
//     including any activity nested under it;
//   • their open, non-private wishes — last_happened_at.
// The wording stays about needs, never about who's been "neglected".
//
// TurnAgreement — "this now, that next": { first_title, first_alter_ids,
//   first_category_id, second_title, second_alter_ids, second_category_id,
//   second_plan_id, note, status ("open" | "kept" | "let_go"),
//   status_changed_at }. The second half becomes a plan (Activity with
//   turn_id), and doing that plan keeps the agreement.

import { base44 } from "@/api/base44Client";
import { statusFor, ACTIVITY_STATUSES } from "@/lib/activityStatus";
import { indexById, getAncestorIds } from "@/lib/categoryTreeUtils";
import { isOpenWish } from "@/lib/wishes";
import { relationBehavesAs } from "@/lib/activityLinks";

export const TURNS_QUERY_KEY = ["turnAgreements"];
export const ALTER_ACTIVITY_LINKS_QUERY_KEY = ["alterActivityLinks"];

const HAPPENED = new Set([ACTIVITY_STATUSES.LOGGED, ACTIVITY_STATUSES.DONE, ACTIVITY_STATUSES.PARTIAL]);

// Latest time each category (or anything nested under it) actually
// happened. Returns Map<categoryId, isoString>.
export function lastHappenedByCategory(activities = [], categories = [], now = new Date()) {
  const byId = indexById(categories);
  const out = new Map();
  const bump = (id, ts) => { if (!out.has(id) || out.get(id) < ts) out.set(id, ts); };
  for (const a of activities || []) {
    if (!a?.timestamp || !HAPPENED.has(statusFor(a))) continue;
    if (new Date(a.timestamp) > now) continue;
    for (const cid of a.activity_category_ids || []) {
      bump(cid, a.timestamp);
      for (const pid of getAncestorIds(cid, byId)) bump(pid, a.timestamp);
    }
  }
  return out;
}

// One row per alter who has anything noted. Each item:
//   { kind: "activity" | "wish", id, title, color, last (iso | null), categoryId, wish }
// Rows are ordered longest-waiting first; an alter whose things have
// never happened sorts to the top.
export function buildBalance({ alters = [], links = [], wishes = [], activities = [], categories = [], linkTypes = [], now = new Date() }) {
  const last = lastHappenedByCategory(activities, categories, now);
  const catById = new Map((categories || []).map((c) => [c.id, c]));
  const rows = [];
  for (const alter of alters || []) {
    if (!alter || alter.is_archived) continue;
    const items = [];
    const seen = new Set();
    for (const l of links || []) {
      if (l.alter_id !== alter.id || !["enjoys", "needs"].includes(relationBehavesAs(l.relation, linkTypes))) continue;
      const cat = catById.get(l.category_id);
      if (!cat || seen.has(cat.id)) continue;
      seen.add(cat.id);
      items.push({ kind: "activity", id: `a-${cat.id}`, title: cat.name, color: cat.color, categoryId: cat.id, relation: l.relation, last: last.get(cat.id) || null });
    }
    for (const w of wishes || []) {
      if (!w || w.is_private || w.for_everyone || !isOpenWish(w)) continue;
      if (!(w.owner_alter_ids || []).includes(alter.id)) continue;
      items.push({ kind: "wish", id: `w-${w.id}`, title: w.title, categoryId: w.category_id || null, last: w.last_happened_at || null, wish: w });
    }
    if (items.length === 0) continue;
    items.sort((a, b) => String(a.last || "").localeCompare(String(b.last || "")));
    const lastAny = items.reduce((m, it) => (it.last && (!m || it.last > m) ? it.last : m), null);
    rows.push({ alter, items, lastAny });
  }
  rows.sort((a, b) => String(a.lastAny || "").localeCompare(String(b.lastAny || "")));
  return rows;
}

// Alters with nothing noted yet — the page points them at their profile.
export function altersWithoutNeeds(alters = [], rows = []) {
  const have = new Set(rows.map((r) => r.alter.id));
  return (alters || []).filter((a) => a && !a.is_archived && !have.has(a.id));
}

// Open, shareable wishes for the shared list (private ones stay on their
// owners' profiles only).
export function sharedWishes(wishes = []) {
  return (wishes || []).filter((w) => w && !w.is_private);
}

// ── Turn agreements ──────────────────────────────────────────────────

export function turnState(turn, activities = []) {
  if (turn.status === "let_go") return "let_go";
  if (turn.status === "kept") return "kept";
  const plan = (activities || []).find((a) => a.id === turn.second_plan_id);
  if (plan && (plan.status === "done" || plan.status === "partial")) return "kept";
  return "open";
}

export async function createTurn(fields, when, categories = []) {
  const turn = await base44.entities.TurnAgreement.create({
    ...fields, status: "open", status_changed_at: new Date().toISOString(),
  });
  if (when) await planSecondHalf(turn, when, categories);
  return turn;
}

export async function planSecondHalf(turn, when, categories = []) {
  const cat = (categories || []).find((c) => c.id === turn.second_category_id);
  const plan = await base44.entities.Activity.create({
    timestamp: when.toISOString(),
    activity_name: turn.second_title || cat?.name || "Their turn",
    activity_category_ids: turn.second_category_id ? [turn.second_category_id] : [],
    ...(cat?.color ? { color: cat.color } : {}),
    fronting_alter_ids: turn.second_alter_ids || [],
    is_planned: true,
    status: "scheduled",
    turn_id: turn.id,
  });
  await base44.entities.TurnAgreement.update(turn.id, { second_plan_id: plan.id });
  return plan;
}

export function setTurnStatus(turn, status) {
  return base44.entities.TurnAgreement.update(turn.id, { status, status_changed_at: new Date().toISOString() });
}

// ── Check-in when an activity starts ─────────────────────────────────

// Alters linked as "tends to interrupt" to this activity (or anything it
// sits under), with their open shareable wishes — what the start-of-
// activity note offers. Alters already taking part are left out.
export function interruptersFor(categoryId, { links = [], categories = [], wishes = [], alters = [], linkTypes = [], excludeIds = [] } = {}) {
  if (!categoryId) return [];
  const byId = indexById(categories);
  const ids = new Set([categoryId, ...getAncestorIds(categoryId, byId)]);
  const skip = new Set(excludeIds || []);
  const out = [];
  const seen = new Set();
  for (const l of links || []) {
    if (relationBehavesAs(l.relation, linkTypes) !== "interrupts" || !ids.has(l.category_id) || skip.has(l.alter_id) || seen.has(l.alter_id)) continue;
    const alter = (alters || []).find((a) => a.id === l.alter_id && !a.is_archived);
    if (!alter) continue;
    seen.add(alter.id);
    const theirWishes = (wishes || []).filter((w) =>
      w && !w.is_private && isOpenWish(w) && !w.for_everyone && (w.owner_alter_ids || []).includes(alter.id));
    out.push({ alter, wishes: theirWishes, note: l.note || "" });
  }
  return out;
}
