// Look history / undo (v0.194.1). Before any preset or widget style is
// APPLIED, the current look is snapshotted here — so "oops, that preset
// replaced my whole setup" is one tap to undo. Entries are ordinary
// preset payloads (the same shape saveCustomPreset stores), so restoring
// is just applying a preset.
const KEY = "symphony_look_history_v1";
const MAX = 10;
const MAX_BYTES = 400 * 1024; // skip snapshots that would bloat storage

export function listLookHistory() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
}

export function pushLookHistory(label, payload) {
  try {
    const entry = { ts: Date.now(), label: String(label || "Previous look"), payload };
    if (JSON.stringify(entry).length > MAX_BYTES) return null;
    const next = [entry, ...listLookHistory()].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
    try { window.dispatchEvent(new Event("symphony-look-history")); } catch { /* SSR */ }
    return entry;
  } catch { return null; }
}
