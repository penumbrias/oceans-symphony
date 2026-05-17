// Helpers for editing / deleting recurring activity plans.
//
// Activity records that belong to the same recurrence series share a
// `recurrence_group_id` field. None of the helpers below mutate state —
// they return pure descriptions (or arrays) of work to be done. The
// callers do the actual `Activity.update` / `Activity.delete` calls.
//
// User-data-preservation: the "this instance only" branch CLONES the
// record off the series — it does NOT delete the original. Only the
// caller (typically a Plan modal save) flips `recurrence_group_id` to
// null on the new record, leaving the rest of the series untouched.

import { base44 } from "@/api/base44Client";

export const RECURRENCE_BRANCHES = Object.freeze({
  THIS_ONLY: "this_only",
  THIS_AND_FUTURE: "this_and_future",
  ALL: "all",
});

// Return every record in the same recurrence series, optionally filtered
// to those at-or-after a given pivot timestamp (for "this and future").
// Sorted ascending by timestamp so callers can walk the series in order.
//
// `groupId` is the `recurrence_group_id` value to match. When the pivot
// is given, the comparison is inclusive (>=) so the pivot itself is
// included in the "future" set.
export function getSeriesMembers(activities, groupId, { from = null } = {}) {
  if (!groupId) return [];
  const list = (activities || []).filter(
    (a) => a && a.recurrence_group_id === groupId,
  );
  const sorted = list.slice().sort(
    (a, b) => new Date(a.timestamp) - new Date(b.timestamp),
  );
  if (!from) return sorted;
  const pivot = new Date(from).getTime();
  return sorted.filter((a) => new Date(a.timestamp).getTime() >= pivot);
}

// Resolve the set of records affected by a branch choice, given the
// "pivot" record the user is acting on. Centralised so the popover,
// the Plan modal, and the Details modal all agree on which records
// each branch covers.
export function membersForBranch(activities, pivot, branch) {
  if (!pivot) return [];
  const groupId = pivot.recurrence_group_id;
  if (!groupId) return [pivot];
  switch (branch) {
    case RECURRENCE_BRANCHES.THIS_ONLY:
      return [pivot];
    case RECURRENCE_BRANCHES.THIS_AND_FUTURE:
      return getSeriesMembers(activities, groupId, { from: pivot.timestamp });
    case RECURRENCE_BRANCHES.ALL:
      return getSeriesMembers(activities, groupId);
    default:
      return [pivot];
  }
}

// Apply the same `edits` patch to every record in `members`. Sequential
// awaits — the underlying entity layer is local-first IndexedDB so the
// overhead is negligible and we get predictable ordering for the
// invalidation tick. Skips records whose id is missing (defensive).
export async function applyEditToSeries(members, edits) {
  let count = 0;
  for (const m of members || []) {
    if (!m?.id) continue;
    await base44.entities.Activity.update(m.id, edits);
    count += 1;
  }
  return count;
}

// Delete every record in `members`. Sequential. Used by the "delete
// series / this and future" path in the details modal.
export async function deleteSeries(members) {
  let count = 0;
  for (const m of members || []) {
    if (!m?.id) continue;
    await base44.entities.Activity.delete(m.id);
    count += 1;
  }
  return count;
}

// Human-readable label for a branch choice, used by toast / status
// strings. Kept here so the wording stays consistent.
export const BRANCH_LABELS = Object.freeze({
  [RECURRENCE_BRANCHES.THIS_ONLY]: "this instance",
  [RECURRENCE_BRANCHES.THIS_AND_FUTURE]: "this and future",
  [RECURRENCE_BRANCHES.ALL]: "the whole series",
});
