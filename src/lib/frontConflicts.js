// Front conflicts between synced devices — settled by the person, never
// guessed (owner, Oct 2026: "a way to resolve conflicting front history
// between devices, that prioritizes user choice").
//
// How one happens: both devices were used between syncs and each switched
// on its own. When the other device's live front reaches a device that has
// its own front live, sync can't know who's right, so it keeps this
// device's front and stores the other one as a placeholder (sync_demoted,
// a 0-minute row — see localDb mergeIncomingFrontingSessions). Before
// this, that was the end of it: each device kept showing its own front
// forever. Now every such placeholder is listed here for review.
//
// The three answers behave exactly like a switch made in the app, so the
// history stays honest and editable afterwards:
//   - "mine":   their fronts end now; ours stay live.
//   - "theirs": ours end now; theirs come back live (with their primary).
//   - "both":   theirs come back live beside ours (ours keeps primary).
// Fronts that should be live on the other device too are stamped
// `revived_at`, which brings that device's placeholder copy back to life
// on its next sync (syncMerge.mergeFrontingSession). Ends travel as they
// always have. So the answer given on one device settles both.
//
// Nothing is deleted. Every write goes through the entity proxy, so it is
// stamped for sync and lands in Recent changes.

import { localEntities } from "@/api/base44Client";
import { planFrontResolution } from "@/lib/frontConflictPlan";

export { planFrontResolution };

const KEY = "symphony_sync_front_conflicts";
export const FRONT_CONFLICTS_EVENT = "symphony-front-conflicts";

// Device-bound like the other sync bookkeeping: it describes what THIS
// device merged. Never in BACKUP_LS_KEYS.
export const FRONT_CONFLICT_LOCAL_KEYS = [KEY];

const read = () => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch { return []; }
};
const write = (list) => {
  try {
    if (list.length) localStorage.setItem(KEY, JSON.stringify(list.slice(0, 200)));
    else localStorage.removeItem(KEY);
  } catch { /* storage off — the list is rebuilt on the next sync */ }
  try { window.dispatchEvent(new Event(FRONT_CONFLICTS_EVENT)); } catch { /* no window */ }
};

export const isPlaceholderSession = (s) =>
  !!s && (!!s.sync_demoted || (!!s.end_time && s.end_time === s.start_time));

// Remember sessions a sync pass flagged. `incoming` is the other device's
// copy of each, which keeps its primary flag (the placeholder lost it).
export function addFrontConflicts(ids, incomingRecords, fromDevice) {
  if (!ids?.length) return;
  const byId = new Map(read().map((c) => [c.id, c]));
  const at = new Date().toISOString();
  for (const id of ids) {
    const rec = incomingRecords?.[id];
    byId.set(id, { id, fromDevice: fromDevice || null, wasPrimary: !!rec?.is_primary, at });
  }
  write([...byId.values()]);
}

// The flagged sessions still waiting on an answer: a session that has
// since ended for real, been revived or vanished drops off by itself.
export async function getFrontConflicts() {
  const list = read();
  if (!list.length) return [];
  const all = await localEntities.FrontingSession.list();
  const byId = new Map(all.map((s) => [s.id, s]));
  const open = list.filter((c) => byId.get(c.id)?.sync_demoted);
  if (open.length !== list.length) write(open);
  if (!open.length) return [];
  const theirs = open.map((c) => ({ ...byId.get(c.id), _wasPrimary: c.wasPrimary, _fromDevice: c.fromDevice }));
  const mine = all.filter((s) => s.is_active === true && !isPlaceholderSession(s));
  const devices = [...new Set(open.map((c) => c.fromDevice).filter(Boolean))];
  return [{ theirs, mine, devices }];
}

// Apply an answer. Reads the sessions fresh first (never trust what the
// review screen loaded — a switch may have happened since).
export async function resolveFrontConflict(choice) {
  const [conflict] = await getFrontConflicts();
  if (!conflict) return 0;
  const now = new Date().toISOString();
  const writes = planFrontResolution(choice, { ...conflict, now });
  for (const { id, patch } of writes) await localEntities.FrontingSession.update(id, patch);
  const done = new Set(conflict.theirs.map((s) => s.id));
  write(read().filter((c) => !done.has(c.id)));
  return writes.length;
}
