import { useEffect, useRef, useCallback } from "react";

// Draft autosave for data-entry surfaces — generalises the System Meeting
// draft pattern (SystemCheckIn.jsx, MEETING_DRAFT_KEY) so partial input on
// ANY composer survives an accidental close / navigation / reload.
//
// Contract:
//   useFormDraft(key, snapshot, {
//     active,          — persist only while true (modal open / composing).
//     onRestore(draft) — called ONCE per activation if a stored draft exists,
//                        BEFORE any persisting happens. Restore your state in
//                        here. Not called when there's no draft.
//     isEmpty(snap)    — when true the stored draft is REMOVED instead of
//                        written, so blank surfaces never leave ghost drafts.
//     debounceMs       — write debounce (default 800ms).
//   }) → { clearDraft }
//
//   Call clearDraft() after a SUCCESSFUL save/publish — otherwise the next
//   open would "restore" content the user already posted.
//
// Storage: localStorage, one key per surface (include the record id in the
// key for edit flows — e.g. `symphony_draft_journal_${id || "new"}` — so an
// edit draft never bleeds into a different entry). Drafts are device-local
// UI state, intentionally NOT in backups (same as the meeting draft).
export default function useFormDraft(key, snapshot, { active = true, onRestore, isEmpty, debounceMs = 800 } = {}) {
  const restoredForKeyRef = useRef(null); // key we've already restored for this activation
  const timerRef = useRef(null);
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;
  const isEmptyRef = useRef(isEmpty);
  isEmptyRef.current = isEmpty;

  // Restore once per activation (per key). Runs before the first persist —
  // the persist effect below is gated on restoration having happened.
  useEffect(() => {
    if (!active || !key) {
      if (!active) restoredForKeyRef.current = null; // re-arm for next open
      return;
    }
    if (restoredForKeyRef.current === key) return;
    restoredForKeyRef.current = key;
    try {
      const raw = localStorage.getItem(key);
      if (raw != null) {
        const draft = JSON.parse(raw);
        if (draft && typeof draft === "object") onRestoreRef.current?.(draft);
      }
    } catch { /* corrupt draft — ignore, it'll be overwritten */ }
  }, [active, key]);

  // Debounced persist while active. Empty snapshots remove the key.
  useEffect(() => {
    if (!active || !key) return undefined;
    if (restoredForKeyRef.current !== key) return undefined; // restore first
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      try {
        if (isEmptyRef.current?.(snapshot)) {
          localStorage.removeItem(key);
        } else {
          localStorage.setItem(key, JSON.stringify(snapshot));
        }
      } catch { /* quota / private mode — drafts are best-effort */ }
    }, debounceMs);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [active, key, snapshot, debounceMs]);

  const clearDraft = useCallback(() => {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
    // Keep restoredForKeyRef as-is: the surface is usually closing right
    // after a save; the next activation re-arms restore via `active` flipping.
  }, [key]);

  return { clearDraft };
}
