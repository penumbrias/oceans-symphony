// The pure half of noteLists.js (v0.346.0): list kinds, the combined
// catalogue and the progress goals count. No React, no storage, so
// scripts/test-note-list-goals.mjs can check it.

import { statusFor, countableMinutes, ACTIVITY_STATUSES } from "@/lib/activityStatus";
import { goalWeekWindow, activityWhen } from "@/lib/goalCounting";

export const LIST_KINDS = {
  shopping: { emoji: "🛒", label: "Shopping list" },
  wishlist: { emoji: "🎁", label: "Wishlist" },
  checklist: { emoji: "📋", label: "Checklist" },
  note: { emoji: "📝", label: "Note" },
  flashcards: { emoji: "🃏", label: "Flash cards" },
};
export const listKind = (list) => (LIST_KINDS[list?.list_type] ? list.list_type : "shopping");
export const isDeck = (list) => listKind(list) === "flashcards";
// Notes and lists are one thing (v0.356.0): every page that isn't a deck
// has writing AND tick-off items, so every one can be a "list" (goal
// progress, wishes) and every one can be a "note" (the goal Note widget).
export const isItemList = (list) => !!list && !isDeck(list);
export const isNote = (list) => !!list && !isDeck(list);
export const listLabel = (list) => `${LIST_KINDS[listKind(list)].emoji} ${list?.name || "Untitled"}`;

const live = (r) => r && !r.trashed_at && !r.removed_at;

// One catalogue from both stores.
export function combineLists(idbLists = [], unlockedLists = []) {
  return [
    ...(idbLists || []).filter(live).map((l) => ({ ...l, source: "idb", unlocked: false })),
    ...(unlockedLists || []).map((l) => ({ ...l, source: "local", unlocked: true })),
  ];
}

export function itemsForList(listId, { idbItems = [], unlockedItems = [] } = {}) {
  if (!listId) return [];
  const fromIdb = (idbItems || []).filter((i) => live(i) && i.list_id === listId);
  if (fromIdb.length) return fromIdb;
  return (unlockedItems || []).filter((i) => i && i.list_id === listId);
}

// ── Progress (pure, for goals) ───────────────────────────────────────

// A list's ticked items out of all of them.
export function listProgress(items = []) {
  const all = (items || []).filter(Boolean);
  const done = all.filter((i) => i.checked).length;
  return { done, total: all.length, finished: all.length > 0 && done === all.length };
}

const afterOrAt = (iso, from) => {
  if (!from) return true;
  const d = iso ? new Date(iso) : null;
  return !!d && !Number.isNaN(d.getTime()) && d >= from;
};

// Cards in a deck — every card ("total"), or only those made since `from`.
export function deckCardCount(cards = [], { from = null } = {}) {
  return (cards || []).filter((c) => c && afterOrAt(c.created_date, from)).length;
}

const HAPPENED = new Set([ACTIVITY_STATUSES.LOGGED, ACTIVITY_STATUSES.DONE, ACTIVITY_STATUSES.PARTIAL]);

// Logged study sessions for a deck (Activity.study_list_id), since `from`.
export function deckStudySessions(deckId, activities = [], { from = new Date(0), to = new Date() } = {}) {
  if (!deckId) return [];
  const out = [];
  for (const a of activities || []) {
    if (!a || a.study_list_id !== deckId || !HAPPENED.has(statusFor(a))) continue;
    const when = activityWhen(a);
    if (!when || when < from || when > to) continue;
    out.push({ activity: a, when, minutes: countableMinutes(a) });
  }
  return out.sort((x, y) => x.when - y.when);
}

// Minutes studied for a deck-study point: this week, or since it was added.
export function deckStudyMinutes(step, activities = [], now = new Date()) {
  const from = step?.count_period === "week"
    ? goalWeekWindow(now).start
    : (step?.created_date ? new Date(step.created_date) : new Date(0));
  return Math.round(deckStudySessions(step?.ref_list_id, activities, { from, to: now })
    .reduce((n, s) => n + (Number(s.minutes) || 0), 0));
}


// ── Ticking items (pure; the lists panel and the list sheet share it) ──
//
// An item is "to do" until ticked. A shopping list has a third state, "ran
// out" (bought, then used up); every other list ticks on and off.
export const itemState = (item) => (!item?.checked ? "to_buy" : item.ran_out_at ? "ran_out" : "in_stock");

// The patch one tap on an item makes, or null when nothing changes.
export function tickPatch(list, item, nowISO = new Date().toISOString()) {
  const state = itemState(item);
  if (state === "to_buy") return { checked: true, purchased_at: nowISO, ran_out_at: null };
  if (state === "in_stock") {
    return listKind(list) === "shopping"
      ? { ran_out_at: nowISO }
      : { checked: false, purchased_at: null, ran_out_at: null };
  }
  return { ran_out_at: null };
}
export const UNTICK_PATCH = Object.freeze({ checked: false, purchased_at: null, ran_out_at: null });

// Ticked items grouped by the day they were ticked, newest day first; within
// a day, "got it" before "ran out".
export function tickedByDay(items = []) {
  const groups = new Map();
  for (const item of items || []) {
    if (!item || itemState(item) === "to_buy") continue;
    let d = new Date(item.purchased_at || item.created_date || Date.now());
    if (Number.isNaN(d.getTime())) d = new Date();
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (!groups.has(key)) groups.set(key, { key, date: d, items: [] });
    groups.get(key).items.push(item);
  }
  return [...groups.values()]
    .sort((a, b) => b.date - a.date)
    .map((g) => ({
      ...g,
      items: [...g.items.filter((i) => itemState(i) === "in_stock"), ...g.items.filter((i) => itemState(i) === "ran_out")],
    }));
}

// The word over a list's ticked items.
export const DONE_HEADER = { shopping: "purchased", wishlist: "got it", checklist: "done", note: "done", flashcards: "" };
