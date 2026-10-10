// The one place that decides WHEN a journal entry happened.
//
// Journal entries carry their date in different fields depending on where
// they came from, and `created_date` is NOT safe to treat as "the entry's
// date": the entity proxy stamps it with the moment the row was written, so
// every imported entry got the import time (tester: six imported journals
// all reading "Aug 6, 2026 · 6:31 PM").
//
// Precedence (first valid date wins):
//   1. entry_date  — set by the editor's date field and by importers. This is
//                    the user-facing date; editing it is how a person fixes a
//                    date. A normal field, so sync carries the change.
//   2. date        — older Plural Star imports stored the original
//                    date here (and nothing read it). Read, never rewritten.
//   3. timestamp   — v2 widget / ~journal command / Ampersand imports.
//   4. created_date — everything else (when the row was written).
//
// Read-only: nothing here migrates or rewrites stored dates.

const FIELDS = ["entry_date", "date", "timestamp", "created_date"];

function validTime(v) {
  if (v == null || v === "") return null;
  const t = typeof v === "number" ? v : Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

// The entry's effective date as a string (the stored value, or an ISO string
// when it was stored as epoch ms), or null.
export function journalEntryDate(entry) {
  if (!entry) return null;
  for (const f of FIELDS) {
    const t = validTime(entry[f]);
    if (t != null) return typeof entry[f] === "number" ? new Date(t).toISOString() : entry[f];
  }
  return null;
}

// Milliseconds since epoch of the entry's effective date (0 when none).
export function journalEntryTime(entry) {
  return validTime(journalEntryDate(entry)) ?? 0;
}

// Newest first, by effective date. Returns a new array.
export function sortJournalsNewestFirst(entries) {
  return [...(entries || [])].sort((a, b) => journalEntryTime(b) - journalEntryTime(a));
}

// Tags are stored without the leading "#" (the UI adds it). Some importers
// stored "#friend", which rendered as "##friend" — normalise for display,
// filtering and on the next explicit save.
export function normalizeTag(tag) {
  return String(tag ?? "").trim().replace(/^#+/, "");
}
