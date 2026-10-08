// The "~therapy" inline command: anything written after it (in any field that
// speaks the ~command grammar) is saved as a TherapyNote and lands in the next
// Therapy Report's "To bring up" section. The word itself is user-set —
// "~therapy" by default — and lives in localStorage (listed in
// BACKUP_LS_KEYS, so it rides the settings mirror + backups).

export const THERAPY_KEYWORD_KEY = "symphony_therapy_command_v1";
export const DEFAULT_THERAPY_KEYWORD = "therapy";
export const THERAPY_KEYWORD_EVENT = "symphony-therapy-keyword-changed";
export const THERAPY_NOTES_EVENT = "symphony-therapy-notes-changed";

// Letters, digits, "-" and "_" only — a space or ":" would collide with the
// command grammar itself.
export function sanitizeTherapyKeyword(raw) {
  return String(raw || "").trim().toLowerCase().replace(/^~+/, "").replace(/[^a-z0-9_-]/g, "");
}

export function getTherapyKeyword() {
  try {
    const v = sanitizeTherapyKeyword(localStorage.getItem(THERAPY_KEYWORD_KEY));
    return v || DEFAULT_THERAPY_KEYWORD;
  } catch {
    return DEFAULT_THERAPY_KEYWORD;
  }
}

export function setTherapyKeyword(raw) {
  const v = sanitizeTherapyKeyword(raw) || DEFAULT_THERAPY_KEYWORD;
  try { localStorage.setItem(THERAPY_KEYWORD_KEY, v); } catch { /* storage off */ }
  try { window.dispatchEvent(new Event(THERAPY_KEYWORD_EVENT)); } catch { /* SSR */ }
  return v;
}

// A captured note is waiting for a report until a report that included it is
// generated (reported_at set). Already-reported notes still show in any
// report whose date range covers them, so re-running a period keeps them.
export function isPendingTherapyNote(n) {
  return !!(n && !n.reported_at && String(n.note || "").trim());
}
