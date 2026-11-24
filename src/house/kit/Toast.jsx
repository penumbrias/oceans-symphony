// The kit's toast, with Undo (new house step 1.3, building code §1 rule 3).
//
//   showToast({ message: "Walk moved to trash.", detail: "Find it in Recent changes", action: { label: "Undo", onClick } })
//   <ToastHost />   once, inside the house (the frame mounts it; story sheets do too)
//
//   await trashWithUndo({ thing: "Walk", run: () => deleteTask(id), refresh })
//
// - One toast at a time; a new one replaces the old (its Undo goes with it,
//   which is why the words always say where the thing can still be found).
// - At least 10 seconds, and the clock stops while a pointer or finger is
//   on it or focus is inside it (lists.js toastClock).
// - A polite live region, so it is announced without stealing focus. Undo
//   and Close are real buttons, reachable by Tab.
// - It claims the attention slot (always shown) so gentler banners and tips
//   step aside while it is up.
// - trashWithUndo runs the delete inside ONE trash batch (withTrashBatch),
//   so Undo (restoreTrashBatch) brings everything back together: the same
//   path as src/lib/undoDelete.js, drawn in the house's look.

import React, { useEffect, useRef, useSyncExternalStore } from "react";
import { CheckCircle2, AlertTriangle, X } from "lucide-react";
import HouseIcon from "@/house/tokens/HouseIcon";
import { useAttentionSlot, ATTENTION } from "@/lib/attentionSlot";
import { withTrashBatch } from "@/lib/localDb";
import { restoreTrashBatch, trashKeepsText } from "@/lib/undoDelete";
import { getTrashSettings } from "@/lib/trash";
import { Button, IconButton } from "@/house/kit/Button";
import { toastClock, toastTick, toastPause, toastResume, toastExpired, TOAST_MIN_MS } from "@/house/kit/lists";
import "@/house/kit/kit.css";
import "@/house/kit/panels.css";

// ── The one toast (module store) ──────────────────────────────────────
let current = null;
let seq = 0;
const listeners = new Set();
const emit = () => { for (const fn of listeners) fn(); };
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const snapshot = () => current;

export function showToast({ message, detail, action, tone = "done", duration = TOAST_MIN_MS } = {}) {
  seq += 1;
  current = { id: seq, message, detail, action, tone, duration: Math.max(TOAST_MIN_MS, duration) };
  emit();
  return seq;
}
export function dismissToast(id) {
  if (!current || (id != null && current.id !== id)) return;
  current = null;
  emit();
}

export function ToastHost({ inline = false }) {
  const toast = useSyncExternalStore(subscribe, snapshot, snapshot);
  useAttentionSlot("house-toast", { priority: ATTENTION.REMINDER, active: !!toast, always: true });
  const clockRef = useRef(null);
  const boxRef = useRef(null);
  useEffect(() => {
    if (!toast) return undefined;
    clockRef.current = toastTick(toastClock(toast.duration), Date.now());
    const t = setInterval(() => {
      clockRef.current = toastTick(clockRef.current, Date.now());
      if (toastExpired(clockRef.current)) dismissToast(toast.id);
    }, 250);
    return () => clearInterval(t);
  }, [toast]);
  const pause = (why) => () => { if (clockRef.current) clockRef.current = toastPause(clockRef.current, why, Date.now()); };
  const resume = (why) => () => { if (clockRef.current) clockRef.current = toastResume(clockRef.current, why, Date.now()); };
  return (
    <div className={`hk-toast-region${inline ? " hk-toast-region--inline" : ""}`} role="status" aria-live="polite">
      {toast ? (
        <ToastCard ref={boxRef} toast={toast}
          onAction={async () => { const a = toast.action; dismissToast(toast.id); await a?.onClick?.(); }}
          onClose={() => dismissToast(toast.id)}
          onPointerEnter={pause("hover")} onPointerLeave={resume("hover")}
          onPointerDown={pause("touch")} onPointerUp={resume("touch")} onPointerCancel={resume("touch")}
          onFocus={pause("focus")} onBlur={(e) => { if (!boxRef.current?.contains(e.relatedTarget)) resume("focus")(); }} />
      ) : null}
    </div>
  );
}

// What one toast looks like (the host above runs its clock).
export const ToastCard = React.forwardRef(function ToastCard({ toast, onAction, onClose, ...handlers }, ref) {
  return (
    <div ref={ref} className="hk-toast" data-tone={toast.tone} {...handlers}>
      <HouseIcon icon={toast.tone === "failed" ? AlertTriangle : CheckCircle2} />
      <span className="hk-toast-text">
        <span className="hk-toast-message">{toast.message}</span>
        {toast.detail ? <span className="hk-toast-detail">{toast.detail}</span> : null}
      </span>
      {toast.action ? <Button rank="secondary" onClick={onAction}>{toast.action.label}</Button> : null}
      <IconButton icon={X} label={`Close the message: ${toast.message}`} onClick={onClose} />
    </div>
  );
});

// ── Delete to the trash, with Undo ─────────────────────────────────────
// Returns true when the delete ran. Never throws: a failure says so in a
// toast, with words about where the data is.
export async function trashWithUndo({ thing = "It", run, refresh } = {}) {
  let batch = null;
  try {
    await withTrashBatch(async (id) => { batch = id; await run(); });
  } catch (e) {
    try { refresh?.(); } catch { /* ignore */ }
    showToast({ tone: "failed", message: `Couldn't delete ${thing}.`, detail: `${e?.message ? `${e.message}. ` : ""}Your data is safe; anything already moved is in Recent changes → Trash.` });
    return false;
  }
  try { refresh?.(); } catch { /* ignore */ }
  let days = 30;
  try { days = (await getTrashSettings()).days; } catch { /* default */ }
  showToast({
    message: `${thing} moved to trash.`,
    detail: `${trashKeepsText(days)}. Find it in Recent changes.`,
    action: {
      label: "Undo",
      onClick: async () => {
        try {
          const n = await restoreTrashBatch(batch);
          try { refresh?.(); } catch { /* ignore */ }
          showToast(n
            ? { message: `${thing} is back.` }
            : { tone: "failed", message: `Couldn't bring ${thing} back here.`, detail: "It's still in Recent changes → Trash." });
        } catch (e) {
          showToast({ tone: "failed", message: "Couldn't undo.", detail: `${e?.message ? `${e.message}. ` : ""}It's still in Recent changes → Trash.` });
        }
      },
    },
  });
  return true;
}

export default ToastHost;
