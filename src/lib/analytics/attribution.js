// THE canonical alter-attribution resolver for analytics.
//
// The old stack had three competing ways to decide "which alter does this
// record belong to", applied inconsistently per chart:
//   1. an explicit `alter_id` on the record
//   2. an explicit `fronting_alter_ids[]` array on the record
//   3. inference: whoever was fronting (per FrontingSession) at the
//      record's timestamp
// Every analytics consumer now resolves through here, with that exact
// documented precedence. Inference is opt-in per call site (fronting-time
// charts must NEVER infer — tracked fronting means tracked fronting; see
// the note in pages/Analytics.jsx), and results carry a `source` tag so
// UIs can be transparent about inferred attribution ("based on who was
// fronting at the time").

import { toMs } from "./range";

// Build a lookup index over NORMALISED sessions (see sessionNormalizer's
// normalizeSessions) for "who was fronting at time T" queries. Sorted by
// start; queries scan a binary-searched neighbourhood, fine for the
// thousands-of-sessions scale this app sees.
export function buildSessionIndex(normalizedSessions, now = Date.now()) {
  const spans = [];
  for (const s of normalizedSessions || []) {
    if (!s || s.startMs == null) continue;
    const end = s.endMs != null ? s.endMs : now;
    if (end <= s.startMs) continue;
    spans.push({ startMs: s.startMs, endMs: end, alterIds: s.alterIds });
  }
  spans.sort((a, b) => a.startMs - b.startMs);
  // Running maximum of end times lets the query know how far back a
  // covering span could start (open/long sessions), so it can stop early.
  let runningMax = 0;
  for (const sp of spans) {
    runningMax = Math.max(runningMax, sp.endMs);
    sp.maxEndSoFar = runningMax;
  }
  return { spans };
}

// Set of alter ids fronting at time `ms` (empty set when none tracked).
export function altersAt(index, ms) {
  const out = new Set();
  const spans = index?.spans;
  if (!spans || spans.length === 0 || ms == null) return out;
  // Binary search: last span with startMs <= ms.
  let lo = 0, hi = spans.length - 1, last = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (spans[mid].startMs <= ms) { last = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  // Walk backwards while a covering span is still possible.
  for (let i = last; i >= 0; i--) {
    if (spans[i].maxEndSoFar <= ms) break; // nothing this early can still cover ms
    if (spans[i].endMs > ms) {
      for (const id of spans[i].alterIds) out.add(id);
    }
  }
  return out;
}

/**
 * Resolve which alters a record is attributed to.
 *
 * opts:
 *   timestampField — field holding the record's time (default "timestamp")
 *   index          — session index from buildSessionIndex (enables inference)
 *   infer          — allow session-overlap inference (default true when an
 *                    index is provided). Fronting-time consumers pass false.
 *
 * Returns { alterIds: string[], source } where source is one of
 *   "explicit"  — record.alter_id
 *   "fronters"  — record.fronting_alter_ids[]
 *   "inferred"  — from session overlap at the record's timestamp
 *   "none"      — unattributed (system-wide); callers show it honestly
 *                 rather than guessing.
 */
export function attributeRecord(record, opts = {}) {
  if (!record) return { alterIds: [], source: "none" };
  const { timestampField = "timestamp", index = null, infer = index != null } = opts;

  if (record.alter_id) return { alterIds: [record.alter_id], source: "explicit" };

  const fronters = record.fronting_alter_ids;
  if (Array.isArray(fronters) && fronters.length > 0) {
    return { alterIds: [...new Set(fronters.filter(Boolean))], source: "fronters" };
  }

  // Legacy authorship field used by bulletins/comments/chat.
  if (record.author_alter_id) return { alterIds: [record.author_alter_id], source: "explicit" };
  const authors = record.author_alter_ids;
  if (Array.isArray(authors) && authors.length > 0) {
    return { alterIds: [...new Set(authors.filter(Boolean))], source: "explicit" };
  }

  if (infer && index) {
    const ms = toMs(record[timestampField] ?? record.created_date);
    const ids = altersAt(index, ms);
    if (ids.size > 0) return { alterIds: [...ids], source: "inferred" };
  }
  return { alterIds: [], source: "none" };
}
