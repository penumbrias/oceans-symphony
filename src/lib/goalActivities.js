// Starting and stopping activities from a Goals page without leaving it.
// A page's strip runs the normal activity timer (activitySession.js); the
// session carries extra.goal_id so the logged record is marked with the
// page, and the time shows on the page as well as everywhere else.

import { addActiveActivity, getActiveActivities, endAndLogActiveActivity } from "@/lib/activitySession";
import { defaultAttributionIds } from "@/lib/checkinEntry";

export function runningForPage(pageId, categoryId, sessions = getActiveActivities()) {
  return (sessions || []).find((a) => a?.extra?.goal_id === pageId && a.categoryId === categoryId) || null;
}

// Every running session started from this page.
export function runningOnPage(pageId, sessions = getActiveActivities()) {
  return (sessions || []).filter((a) => a?.extra?.goal_id === pageId);
}

export async function startPageActivity(page, category) {
  const already = runningForPage(page.id, category.id);
  if (already) return already;
  const alterIds = await defaultAttributionIds().catch(() => []);
  return addActiveActivity({
    categoryId: category.id,
    name: category.name || "Activity",
    color: category.color || null,
    startTime: new Date().toISOString(),
    alterIds: alterIds || [],
    contactIds: [],
    notes: "",
    extra: { activity_category_ids: [category.id], goal_id: page.id },
  });
}

export function stopPageActivity(session) {
  return endAndLogActiveActivity(session.id);
}
