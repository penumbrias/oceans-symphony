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
import { getFullDbDump } from "@/lib/localDb";
import { planFrontResolution } from "@/lib/frontConflictPlan";
import { planAdvancedResolution, conflictDays, originOf } from "@/lib/frontConflictTimeline";

export { planFrontResolution };

const KEY = "symphony_sync_front_conflicts";
// Advanced review bookkeeping: which device sent each session that arrived
// by sync (for sessions from builds that didn't stamp origin_device), and
// the names of the devices this one has synced with.
const ORIGINS_KEY = "symphony_sync_session_origins";
const NAMES_KEY = "symphony_sync_device_names";
export const FRONT_CONFLICTS_EVENT = "symphony-front-conflicts";

// Device-bound like the other sync bookkeeping: it describes what THIS
// device merged. Never in BACKUP_LS_KEYS.
export const FRONT_CONFLICT_LOCAL_KEYS = [KEY, ORIGINS_KEY, NAMES_KEY];

const readObj = (key) => {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch { return {}; }
};
const thisDeviceId = () => {
  try { return localStorage.getItem("symphony_sync_device_id") || "this-device"; } catch { return "this-device"; }
};

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
// `device` is the snapshot's { id, name }.
export function addFrontConflicts(ids, incomingRecords, device) {
  if (!ids?.length) return;
  const byId = new Map(read().map((c) => [c.id, c]));
  const at = new Date().toISOString();
  for (const id of ids) {
    const rec = incomingRecords?.[id];
    byId.set(id, {
      id, fromDevice: device?.name || null, fromDeviceId: rec?.origin_device || device?.id || null,
      wasPrimary: !!rec?.is_primary, at,
    });
  }
  write([...byId.values()]);
}

// After a sync: remember the device's name, and which sessions it sent
// that this device didn't have (when they don't say so themselves).
export function noteSyncOrigins(incomingSessions, knownIds, device) {
  if (!device?.id) return;
  try {
    const names = readObj(NAMES_KEY);
    if (device.name && names[device.id] !== device.name) {
      names[device.id] = device.name;
      localStorage.setItem(NAMES_KEY, JSON.stringify(names));
    }
    const origins = readObj(ORIGINS_KEY);
    let added = 0;
    for (const [id, rec] of Object.entries(incomingSessions || {})) {
      if (!rec || rec.origin_device || knownIds?.has(id) || origins[id]) continue;
      origins[id] = device.id;
      added++;
    }
    if (!added) return;
    const entries = Object.entries(origins);
    localStorage.setItem(ORIGINS_KEY, JSON.stringify(Object.fromEntries(entries.slice(-3000))));
  } catch { /* bookkeeping only — never fails a sync */ }
}

// The flagged sessions still waiting on an answer: a session that has
// since ended for real, been revived or vanished drops off by itself.
export async function getFrontConflicts() {
  const list = read();
  if (!list.length) return [];
  const all = await localEntities.FrontingSession.list();
  const byId = new Map(all.map((s) => [s.id, s]));
  const open = list.filter((c) => byId.get(c.id)?.sync_demoted && !byId.get(c.id)?.removed_at);
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

// ── Advanced review (src/components/sync/FrontConflictTimeline.jsx) ──

// Everything the side-by-side view needs. Reads the raw database, so
// sessions removed in an earlier review show up and can be put back.
export async function getAdvancedReview({ extraDays = 0 } = {}) {
  const now = new Date().toISOString();
  const sessions = Object.values(getFullDbDump().FrontingSession || {})
    .filter((s) => s && typeof s === "object" && s.start_time);
  const thisDevice = thisDeviceId();
  const origins = readObj(ORIGINS_KEY);
  const names = readObj(NAMES_KEY);
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const flagged = {};
  for (const c of read()) {
    const s = byId.get(c.id);
    if (!s?.sync_demoted || s.removed_at) continue;
    const device = c.fromDeviceId || `name:${c.fromDevice || "other"}`;
    flagged[c.id] = { device, wasPrimary: !!c.wasPrimary };
    if (!names[device] && c.fromDevice) names[device] = c.fromDevice;
  }
  const flaggedDevice = Object.fromEntries(Object.entries(flagged).map(([id, f]) => [id, f.device]));
  const origin = (s) => originOf(s, { thisDevice, origins, flagged: flaggedDevice });
  const days = conflictDays({ sessions, now, origin, flaggedIds: new Set(Object.keys(flagged)) });
  return { sessions, thisDevice, origins, names, flagged, days, now, extraDays };
}

// Apply the answers. Re-reads everything first and plans against that.
export async function applyAdvancedResolution(answers) {
  const review = await getAdvancedReview();
  const now = new Date().toISOString();
  const { writes } = planAdvancedResolution({ ...review, ...answers, now });
  for (const { id, patch } of writes) await localEntities.FrontingSession.update(id, patch);
  const settled = new Set(Object.keys(review.flagged));
  write(read().filter((c) => !settled.has(c.id)));
  return writes.length;
}
