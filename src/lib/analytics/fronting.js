// Fronting-domain engine helpers (Phase 2 of the analytics rebuild).
// Everything the rebuilt Fronting tab renders comes from here; components
// stay presentation-only. Built on sessionNormalizer's sweep-line so the
// legacy group-row and per-alter row models both count correctly and open
// sessions never leak past the window.

import { normalizeSessions, sessionsInRange, sliceByOverlap } from "@/lib/sessionNormalizer";
import { dayKey, weekdayOf } from "./range";
import { whKey } from "@/components/analytics/primitives/WeekHourHeatmap";

// ---- Front share -------------------------------------------------------
//
// Two counting modes (PluralKit's frontpercent semantics):
//   "flat"    — each overlap slice's duration is split evenly among the
//               alters active in it; alter shares + untracked = 100% of the
//               window. The honest default.
//   "overlap" — every active alter gets the slice's full duration (a
//               co-front credits everyone fully), so shares can sum past
//               100%. Untracked time is still shown.
// Both expose `untrackedMs` explicitly — sparse logging must never be
// hidden or made to look like fronting data.
export function frontShare({ sessions, range, mode = "flat" }) {
  const now = range.now;
  const normalized = normalizeSessions(sessions || [], now);
  const inWin = sessionsInRange(normalized, range.fromMs, range.toMs, now);
  const slices = sliceByOverlap(inWin, range.fromMs, range.toMs, now);

  const perAlterMs = new Map();
  let trackedMs = 0;
  for (const slice of slices) {
    const dur = slice.endMs - slice.startMs;
    if (dur <= 0) continue;
    trackedMs += dur;
    const ids = [...slice.aliveAlterIds];
    const credit = mode === "flat" ? dur / ids.length : dur;
    for (const id of ids) perAlterMs.set(id, (perAlterMs.get(id) || 0) + credit);
  }

  const windowMs = Math.max(1, range.toMs - range.fromMs);
  const untrackedMs = Math.max(0, windowMs - trackedMs);
  return { perAlterMs, trackedMs, untrackedMs, windowMs, mode };
}

// ---- Front history strip ------------------------------------------------
//
// Sessions clipped to the window, newest first, with the fields the
// duration-proportional strip needs. Raw rows ride along so the detail
// sheet can parse per-alter payloads (note/emotions/symptoms).
export function frontHistory({ sessions, range, limit = 60 }) {
  const now = range.now;
  const normalized = normalizeSessions(sessions || [], now);
  const inWin = sessionsInRange(normalized, range.fromMs, range.toMs, now);
  const rows = inWin
    .map((s) => {
      const start = Math.max(s.startMs, range.fromMs);
      const end = s.endMs != null ? Math.min(s.endMs, range.toMs) : Math.min(now, range.toMs);
      return {
        id: s.id,
        raw: s.raw,
        alterIds: s.alterIds,
        primaryAlterId: s.primaryAlterId,
        isOpen: s.isOpen,
        startMs: s.startMs,
        endMs: s.endMs,
        clippedStartMs: start,
        clippedDurMs: Math.max(0, end - start),
      };
    })
    .filter((r) => r.clippedDurMs > 0)
    .sort((a, b) => b.startMs - a.startMs);
  return { rows: rows.slice(0, limit), total: rows.length };
}

// ---- Switch timing (weekday × hour) -------------------------------------
export function switchTimingCells({ sessions, range }) {
  const now = range.now;
  const normalized = normalizeSessions(sessions || [], now);
  const cells = new Map();
  let total = 0;
  for (const s of normalized) {
    if (s.startMs < range.fromMs || s.startMs > range.toMs) continue;
    const d = new Date(s.startMs);
    const key = whKey(d.getDay(), d.getHours());
    cells.set(key, (cells.get(key) || 0) + 1);
    total++;
  }
  return { cells, total };
}

// ---- Per-alter session texture ------------------------------------------
//
// "Fronts in short bursts" vs "long stretches" — median/longest session
// length per alter plus a 5-bucket duration histogram for a small-multiple.
// Buckets: <15m, 15m–1h, 1–4h, 4–12h, >12h.
export const TEXTURE_BUCKETS = [
  { label: "<15m", maxMs: 15 * 60000 },
  { label: "15m–1h", maxMs: 60 * 60000 },
  { label: "1–4h", maxMs: 4 * 3600000 },
  { label: "4–12h", maxMs: 12 * 3600000 },
  { label: ">12h", maxMs: Infinity },
];

export function sessionTexture({ sessions, range }) {
  const now = range.now;
  const normalized = normalizeSessions(sessions || [], now);
  const inWin = sessionsInRange(normalized, range.fromMs, range.toMs, now);

  const byAlter = new Map(); // id -> durations[]
  for (const s of inWin) {
    const start = Math.max(s.startMs, range.fromMs);
    const end = s.endMs != null ? Math.min(s.endMs, range.toMs) : Math.min(now, range.toMs);
    const dur = end - start;
    if (dur <= 0) continue;
    for (const id of s.alterIds) {
      if (!byAlter.has(id)) byAlter.set(id, []);
      byAlter.get(id).push(dur);
    }
  }

  const out = [];
  for (const [alterId, durs] of byAlter.entries()) {
    durs.sort((a, b) => a - b);
    const median = durs[Math.floor(durs.length / 2)];
    const longest = durs[durs.length - 1];
    const buckets = TEXTURE_BUCKETS.map((b) => 0);
    for (const d of durs) {
      const idx = TEXTURE_BUCKETS.findIndex((b) => d <= b.maxMs);
      buckets[idx === -1 ? TEXTURE_BUCKETS.length - 1 : idx]++;
    }
    out.push({ alterId, count: durs.length, medianMs: median, longestMs: longest, buckets });
  }
  out.sort((a, b) => b.count - a.count);
  return out;
}

// ---- Reconnection (opt-in) ----------------------------------------------
//
// Alters who HAVE fronting history but haven't fronted in `thresholdDays`.
// Framed as reconnection, never dormancy alarm: caller copy is gentle,
// the whole card is opt-in, and individual alters can be muted. Archived
// alters are excluded (archiving is the deliberate "resting" state).
export function reconnectionList({ sessions, alters, thresholdDays = 30, now = Date.now() }) {
  const normalized = normalizeSessions(sessions || [], now);
  const lastSeen = new Map(); // alterId -> ms of last activity (end, or start if open)
  for (const s of normalized) {
    const seenAt = s.endMs != null ? s.endMs : now; // open session = active now
    for (const id of s.alterIds) {
      lastSeen.set(id, Math.max(lastSeen.get(id) || 0, seenAt));
    }
  }
  const cutoff = now - thresholdDays * 86400000;
  const out = [];
  for (const a of alters || []) {
    if (a.is_archived) continue;
    const seen = lastSeen.get(a.id);
    if (!seen || seen > cutoff) continue;
    out.push({ alterId: a.id, lastSeenMs: seen, daysSince: Math.floor((now - seen) / 86400000) });
  }
  out.sort((a, b) => b.daysSince - a.daysSince);
  return out;
}

export const __internal = { dayKey, weekdayOf };
