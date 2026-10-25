// THE set-front write path.
//
// Ported verbatim from SetFrontModal's battle-hardened handleSave when the
// modal was rebuilt (v0.117.0) so every surface that changes who's fronting
// shares one implementation. The hard-won rules preserved here:
//
//   • Refetch active sessions at write time — never trust a snapshot.
//   • Legacy rows (primary_alter_id, no alter_id) are ended, not updated.
//   • Duplicate sessions for one alter are ALL ended and replaced by one
//     clean row.
//   • A still-present alter whose only change is primary/level is updated
//     IN PLACE so start_time (the "fronting since" timer) is preserved.
//   • Clearing the front also reconciles ghost rows (is_active: false with
//     end_time still null) that would otherwise show as Active forever.
//   • Fronting levels ride along on the same pass (front_level per alter).
//   • The friends server gets the new front pushed fire-and-forget,
//     respecting per-alter friends_visible.
//
// Callers own their UI: validation, toasts, journal prompts, closing.

import { formatInTimeZone } from "date-fns-tz";
import { base44 } from "@/api/base44Client";
import { withBatch } from "@/lib/localDb";
import { pushFrontStatus } from "@/lib/friendsApi";

// ISO string in the user's detected local timezone (not hardcoded).
export function nowLocalIso() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return formatInTimeZone(new Date(), tz, "yyyy-MM-dd'T'HH:mm:ss.SSSXXX");
}

// With fronting levels ON, "primary" is no longer a hand-set star — it is
// DERIVED from the spectrum (owner decision, v0.118.0): the alter at the
// topmost occupied level leads. No level recorded counts as the top level
// (classic full-front semantics). Ties keep the current primary if they're
// in the tied set, otherwise the longest-standing session wins. is_primary
// stays on the row so every existing consumer (attribution, analytics,
// friends push, "Primary ·" labels) keeps working unchanged.
export async function recomputePrimaryFromLevels({ cfg, queryClient = null }) {
  try {
    if (!cfg?.enabled) return;
    const active = (await base44.entities.FrontingSession.filter({ is_active: true }))
      .filter((s) => s.alter_id);
    if (active.length === 0) return;
    const levelIndex = (s) => {
      if (!s.front_level) return s.is_primary ? 0 : Math.min(1, cfg.levels.length - 1);
      const i = cfg.levels.findIndex((l) => l.id === s.front_level);
      return i === -1 ? 0 : i;
    };
    const best = Math.min(...active.map(levelIndex));
    const candidates = active.filter((s) => levelIndex(s) === best);
    const lead = candidates.find((s) => s.is_primary)
      || [...candidates].sort((a, b) => new Date(a.start_time || 0) - new Date(b.start_time || 0))[0];
    let changed = false;
    for (const s of active) {
      const want = s.id === lead.id;
      if (!!s.is_primary !== want) {
        await base44.entities.FrontingSession.update(s.id, { is_primary: want });
        changed = true;
      }
    }
    if (changed) {
      queryClient?.invalidateQueries({ queryKey: ["activeFront"] });
      try { window.dispatchEvent(new Event("symphony-front-changed")); } catch { /* SSR */ }
      queryClient?.invalidateQueries({ queryKey: ["frontHistory"] });
    }
  } catch { /* best-effort — never block the user's own action */ }
}

// THE ghost-session cleaner — the app-load sweep and the set-front
// surfaces all run this one. Read + repair: sweep
// ghost-active rows (is_active false, end_time null), dedupe multiple
// active sessions per alter (keep newest), demote phantom extra primaries.
// Returns the clean picture a set-front surface should seed its draft from.
// Batched: the ghost sweep / dedupe / demote loops below each used to cost
// one full-DB save per row. One flush at the end now.
export function reconcileActiveFront() { return withBatch(reconcileActiveFrontInner); }
async function reconcileActiveFrontInner() {
  const active = await base44.entities.FrontingSession.filter({ is_active: true });
  const newModelSessions = active.filter((s) => s.alter_id);
  const now = nowLocalIso();
  let cleanupHappened = false;

  try {
    const ghosts = await base44.entities.FrontingSession.filter({ is_active: false, end_time: null });
    for (const g of ghosts || []) {
      try { await base44.entities.FrontingSession.update(g.id, { end_time: now }); cleanupHappened = true; } catch { /* keep going */ }
    }
  } catch { /* not all backends support filter on end_time: null */ }

  // Sort key hardened against bad rows: an unparseable start_time compared
  // as NaN, which makes Array.sort order arbitrary — the cleaner could keep
  // the broken row and end the alter's real, live session ("my fronting
  // status randomly disappeared overnight"). Invalid times sort oldest,
  // and on a tie the primary row survives.
  const ts = (s) => {
    const t = new Date(s.start_time || NaN).getTime();
    return Number.isFinite(t) ? t : -Infinity;
  };
  const newestFirst = (a, b) => (ts(b) - ts(a)) || ((b.is_primary === true) - (a.is_primary === true));

  const sessionsByAlter = {};
  for (const s of newModelSessions) {
    (sessionsByAlter[s.alter_id] ||= []).push(s);
  }
  const survivors = [];
  for (const sessions of Object.values(sessionsByAlter)) {
    sessions.sort(newestFirst);
    survivors.push(sessions[0]);
    for (const stale of sessions.slice(1)) {
      try { await base44.entities.FrontingSession.update(stale.id, { is_active: false, end_time: now }); cleanupHappened = true; } catch { /* keep going */ }
    }
  }

  const stillPrimary = survivors.filter((s) => s.is_primary);
  if (stillPrimary.length > 1) {
    stillPrimary.sort(newestFirst);
    for (const s of stillPrimary.slice(1)) {
      try { await base44.entities.FrontingSession.update(s.id, { is_primary: false }); s.is_primary = false; cleanupHappened = true; } catch { /* keep going */ }
    }
  }

  // Legacy fallback (primary_alter_id rows): expose as pseudo-sessions so
  // the caller still sees who's fronting even before their first re-save.
  const legacy = active.find((s) => !s.alter_id && s.primary_alter_id);
  const legacySessions = legacy
    ? [
        { alter_id: legacy.primary_alter_id, is_primary: true, start_time: legacy.start_time, id: legacy.id, _legacy: true },
        ...(legacy.co_fronter_ids || []).map((id) => ({ alter_id: id, is_primary: false, start_time: legacy.start_time, id: legacy.id, _legacy: true })),
      ]
    : [];

  return {
    sessions: survivors.length > 0 ? survivors : legacySessions,
    cleanupHappened,
  };
}

// selections: [{ alterId, isPrimary, level }] — the complete desired front.
// clearAll: true = "unsure" / clear the front (selections ignored).
// triggered: { category, label } | null — stamped on every active session.
// levelsEnabled: only then is front_level written.
// alters + terms feed the friends push.
// Returns { firstSessionId } (the id a switch journal should attach to).
// Batched: a switch that ends N sessions and creates M used to do N+M
// full-DB saves (each an encrypt under encryption) — the app's single
// most-used interaction. withBatch makes it one save; the logic is unchanged.
export function applyFrontSelection(args) { return withBatch(() => applyFrontSelectionInner(args)); }
async function applyFrontSelectionInner({
  selections = [],
  clearAll = false,
  triggered = null,
  levelsEnabled = false,
  levelCfg = null,          // pass the resolved config to auto-derive primary
  alters = [],
  terms = {},
  queryClient = null,
}) {
  const activeSessions = await base44.entities.FrontingSession.filter({ is_active: true });
  const now = nowLocalIso();

  if (clearAll) {
    for (const s of activeSessions) {
      await base44.entities.FrontingSession.update(s.id, { is_active: false, end_time: now });
    }
    // Also reconcile ghost-active sessions (is_active: false but end_time
    // still null) — they appear as "Active" in the Timeline popover even
    // though the rest of the app considers them ended.
    try {
      const ghosts = await base44.entities.FrontingSession.filter({ is_active: false, end_time: null });
      for (const g of ghosts || []) {
        await base44.entities.FrontingSession.update(g.id, { end_time: now });
      }
    } catch { /* filter on end_time: null may not be supported */ }
    queryClient?.invalidateQueries({ queryKey: ["activeFront"] });
    try { window.dispatchEvent(new Event("symphony-front-changed")); } catch { /* SSR */ }
    queryClient?.invalidateQueries({ queryKey: ["frontHistory"] });
    pushFrontStatus({ fronters: [], terms: { fronting: terms.fronting } }).catch(() => {});
    return { firstSessionId: null };
  }

  // Build desired state: alter_id -> { isPrimary, level }
  const desired = {};
  for (const sel of selections) {
    if (!sel?.alterId) continue;
    desired[sel.alterId] = { isPrimary: !!sel.isPrimary, level: sel.level };
  }

  // Handle legacy sessions (old format with primary_alter_id)
  // Each alter's row is recreated in the new shape; one still in front keeps
  // the grouped row's start, so converting doesn't reset "fronting since".
  const legacySessions = activeSessions.filter((s) => !s.alter_id && s.primary_alter_id);
  const legacyStart = {};
  for (const s of legacySessions) {
    for (const id of [s.primary_alter_id, ...(s.co_fronter_ids || [])]) {
      if (id && s.start_time && !legacyStart[id]) legacyStart[id] = s.start_time;
    }
    await base44.entities.FrontingSession.update(s.id, { is_active: false, end_time: now });
  }

  const newModelSessions = activeSessions.filter((s) => s.alter_id);

  // Group by alter_id — duplicates (>1 session per alter) get fully cleared
  const sessionsByAlterId = {};
  for (const s of newModelSessions) {
    if (!sessionsByAlterId[s.alter_id]) sessionsByAlterId[s.alter_id] = [];
    sessionsByAlterId[s.alter_id].push(s);
  }

  // 1. End sessions for removed alters and ALL duplicates. A still-present
  //    alter whose ONLY change is primary status is intentionally NOT ended
  //    here — step 2 updates it in place so its start_time (the "fronting
  //    since" timer) is preserved instead of reset to now.
  for (const [alterId, sessions] of Object.entries(sessionsByAlterId)) {
    const isStillPresent = alterId in desired;
    const hasDuplicates = sessions.length > 1;
    if (hasDuplicates) {
      for (const s of sessions) {
        await base44.entities.FrontingSession.update(s.id, { is_active: false, end_time: now });
      }
    } else if (!isStillPresent) {
      await base44.entities.FrontingSession.update(sessions[0].id, { is_active: false, end_time: now });
    }
  }

  // 2. Update or create sessions:
  //    - still-present alter, single session, primary/level changed → UPDATE
  //      in place (preserves start_time / the "fronting since" timer)
  //    - new alter, or duplicates cleared in step 1 → CREATE a fresh session
  //    - unchanged single session → nothing to do
  let firstSessionId = null;
  for (const [id, want] of Object.entries(desired)) {
    const sessions = sessionsByAlterId[id] || [];
    const hasDuplicates = sessions.length > 1;
    const single = sessions.length === 1 ? sessions[0] : null;
    const levelPatch = levelsEnabled && want.level !== undefined && single?.front_level !== want.level
      ? { front_level: want.level }
      : {};
    const statusUnchanged = single
      && single.is_primary === want.isPrimary
      && Object.keys(levelPatch).length === 0;

    if (single && !hasDuplicates && !statusUnchanged) {
      await base44.entities.FrontingSession.update(single.id, { is_primary: want.isPrimary, ...levelPatch });
      if (!firstSessionId) firstSessionId = single.id;
    } else if (hasDuplicates || !single) {
      const newSession = await base44.entities.FrontingSession.create({
        alter_id: id,
        is_primary: want.isPrimary,
        start_time: (!sessions.length && legacyStart[id]) || now,
        is_active: true,
        ...(levelsEnabled && want.level !== undefined ? { front_level: want.level } : {}),
      });
      if (!firstSessionId) firstSessionId = newSession?.id || null;
    }
  }

  if (triggered?.category) {
    const nowActive = await base44.entities.FrontingSession.filter({ is_active: true });
    await Promise.all(nowActive.map((s) =>
      base44.entities.FrontingSession.update(s.id, {
        is_triggered_switch: true,
        trigger_category: triggered.category,
        trigger_label: triggered.label || "",
      })
    ));
  }

  // Levels on → the star is retired; the spectrum decides who leads.
  if (levelsEnabled && levelCfg) {
    await recomputePrimaryFromLevels({ cfg: levelCfg, queryClient: null });
  }

  queryClient?.invalidateQueries({ queryKey: ["activeFront"] });

  try { window.dispatchEvent(new Event("symphony-front-changed")); } catch { /* SSR */ }
  queryClient?.invalidateQueries({ queryKey: ["frontHistory"] });

  // Push front status to friends server (fire-and-forget); id included so
  // pushFrontStatus can apply per-friend visibility filtering.
  const primaryId = Object.entries(desired).find(([, w]) => w.isPrimary)?.[0] || null;
  const visibleFronters = Object.keys(desired)
    .map((id) => alters.find((a) => a.id === id))
    .filter((a) => a && a.friends_visible !== false)
    .map((a) => ({
      id: a.id,
      name: a.name,
      initial: a.name?.[0] || "?",
      color: a.color || null,
      isPrimary: a.id === primaryId,
      isCofronter: a.id !== primaryId,
    }));
  pushFrontStatus({
    fronters: visibleFronters,
    terms: {
      fronting: terms.fronting,
      front: terms.front,
      alter: terms.alter,
      system: terms.system,
    },
  }).catch(() => {});

  return { firstSessionId };
}

// ── Small front changes (v0.279.4, roadmap step 3) ────────────────────
// Swipes, holds, the level rail, quick actions and Get to know me each
// wrote FrontingSession rows by hand. Between them they reset "fronting
// since" on a primary change, left duplicates and legacy rows behind,
// skipped the friends push and dropped levels. They all edit the front
// through here now:
//
//   changeFront(edit) — reads the front fresh, hands `edit` the current
//   selections ([{ alterId, isPrimary, level }], one per alter, legacy
//   rows included) and writes whatever it returns through
//   applyFrontSelection. Return null/undefined to leave the front alone;
//   an empty list clears it. Pass levelCfg when the change is about
//   levels so the lead follows the spectrum (as the rail always did).
export function currentFrontSelections(activeSessions) {
  const byAlter = new Map();
  for (const s of activeSessions || []) {
    if (!s || s.is_active === false) continue;
    if (s.alter_id) {
      const prev = byAlter.get(s.alter_id);
      byAlter.set(s.alter_id, {
        alterId: s.alter_id,
        isPrimary: !!s.is_primary || !!prev?.isPrimary,
        level: prev?.level ?? s.front_level ?? undefined,
      });
    } else if (s.primary_alter_id) {
      if (!byAlter.has(s.primary_alter_id)) byAlter.set(s.primary_alter_id, { alterId: s.primary_alter_id, isPrimary: true, level: undefined });
      for (const id of s.co_fronter_ids || []) {
        if (id && !byAlter.has(id)) byAlter.set(id, { alterId: id, isPrimary: false, level: undefined });
      }
    }
  }
  return [...byAlter.values()];
}

let frontChain = Promise.resolve();
export function changeFront(edit, opts = {}) {
  // Queued: two quick gestures each see the other's result.
  const run = frontChain.then(() => doChangeFront(edit, opts));
  frontChain = run.catch(() => {});
  return run;
}

async function doChangeFront(edit, { queryClient = null, terms = {}, alters = null, levelCfg = null, triggered = null } = {}) {
  const active = await base44.entities.FrontingSession.filter({ is_active: true });
  const current = currentFrontSelections(active);
  const next = edit(current.map((s) => ({ ...s })), active);
  if (!Array.isArray(next)) return { changed: false, current };
  const roster = alters || await base44.entities.Alter.list().catch(() => []);
  const result = await applyFrontSelection({
    selections: next,
    clearAll: next.length === 0,
    triggered,
    levelsEnabled: true,
    levelCfg,
    alters: roster,
    terms,
    queryClient,
  });
  return { changed: true, current, ...result };
}
