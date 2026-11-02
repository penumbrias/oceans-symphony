// Starting and stopping activities from a Goals page without leaving it.
// A page's strip runs the normal activity timer (activitySession.js); the
// session carries extra.goal_id so the logged record is marked with the
// page, and the time shows on the page as well as everywhere else.

import { addActiveActivity, getActiveActivities, endAndLogActiveActivity } from "@/lib/activitySession";
import { defaultAttributionIds } from "@/lib/checkinEntry";
import { base44 } from "@/api/base44Client";
import { indexPages } from "@/lib/goalTree";
import { pageWordCount } from "@/lib/goalWriting";

// Every word on a page and inside its sections, read fresh.
export async function pageWordsNow(goalId) {
  const [goals, steps] = await Promise.all([base44.entities.Goal.list(), base44.entities.GoalStep.list()]);
  return pageWordCount(indexPages(goals || []), steps || [], goalId);
}

// The words a page session added: what's on the page now minus what was
// there when it started. Only one running session per page keeps a
// starting count, so two at once don't both claim the same words.
export async function wordsWrittenFor(extra) {
  const start = Number(extra?.goal_words_at_start);
  if (!extra?.goal_id || !Number.isFinite(start)) return null;
  const now = await pageWordsNow(extra.goal_id);
  return Math.max(0, now - start);
}

// categoryId null = the page itself ("Work on it"): a session with no
// activity, named after the page.
export function runningForPage(pageId, categoryId, sessions = getActiveActivities()) {
  return (sessions || []).find((a) => a?.extra?.goal_id === pageId && (a.categoryId || null) === (categoryId || null)) || null;
}

// Every running session started from this page.
export function runningOnPage(pageId, sessions = getActiveActivities()) {
  return (sessions || []).filter((a) => a?.extra?.goal_id === pageId);
}

// `category` null starts the page itself, tracked like any activity under
// the page's title (it shows on the timeline and in reports by that name).
export async function startPageActivity(page, category) {
  const already = runningForPage(page.id, category?.id || null);
  if (already) return already;
  const alterIds = await defaultAttributionIds().catch(() => []);
  const counting = runningOnPage(page.id).some((a) => Number.isFinite(Number(a?.extra?.goal_words_at_start)));
  const wordsAtStart = counting ? null : await pageWordsNow(page.id).catch(() => null);
  return addActiveActivity({
    categoryId: category?.id || null,
    name: category ? (category.name || "Activity") : (page.title || "Goal"),
    color: category?.color || null,
    startTime: new Date().toISOString(),
    alterIds: alterIds || [],
    contactIds: [],
    notes: "",
    extra: {
      activity_category_ids: category ? [category.id] : [], goal_id: page.id,
      ...(Number.isFinite(wordsAtStart) ? { goal_words_at_start: wordsAtStart } : {}),
    },
  });
}

export function stopPageActivity(session) {
  return endAndLogActiveActivity(session.id);
}
