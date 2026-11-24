// The kit's sheets (new house step 1.3, building code §5).
//
//   <Sheet open={open} onClose={close} title="Layers" size="half">…</Sheet>
//   <Sheet … size="full" modal>…</Sheet>
//   <Sheet … holdsTyping>…</Sheet>                 a half-filled capture
//   <ConfirmSheet open thing="Walk" onConfirm={del} onCancel={close} />
//   <SafetySheet open title="My emergency card" onLeave={close}>…</SafetySheet>
//
// Sheet
// - Three heights: peek (7.5 rem), half (the default) and full. The grab bar
//   is a button that makes it taller or shorter, and a drag on it does too.
// - Half and peek are NON-MODAL (inspector guide): the page above stays
//   usable and visible, focus is not trapped, there is no scrim. `modal`
//   (full sheets, pickers) adds a scrim and keeps Tab inside.
// - The grab bar is skipped for first focus; `grab={false}` leaves it out
//   (the confirm sheet has none).
// - Focus moves to the sheet's first control when it opens and back to
//   what opened it when it closes.
// - Escape and Back (the Android back gesture or the browser's Back) close
//   it: onClose(reason). A press outside does NOT, unless `closeOnOutside`
//   (step 2.2: the page beside a half sheet stays usable). `holdsTyping`: a press outside
//   never closes it (a stray tap must not lose a half-filled capture);
//   Escape and Back still call onClose, and the host KEEPS the typing as a
//   draft (building code §5: leaving never loses typing).
// - Sliders inside are kept clear of Android's back-gesture edge
//   (useEdgeSafeSliders).
// - Sheets stop at the top of the bottom bar (--house-sheet-bottom), so
//   Support stays one tap away.
//
// ConfirmSheet: asked once, names the thing, says how long the trash keeps
// it (or that it skips the trash), focus starts on "Keep it", the delete is
// the danger button on the far side from where Save sits, and it runs once.
//
// SafetySheet: no app chrome (the emergency card). Support is always on it,
// and the way back is labelled and asks for a second tap so a helper won't
// press it by accident.

import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, HeartHandshake, Trash2, X } from "lucide-react";
import { useEdgeSafeSliders } from "@/lib/gestureExclusion";
import { getTrashSettings } from "@/lib/trash";
import { trashKeepsText } from "@/lib/undoDelete";
import { Button, IconButton } from "@/house/kit/Button";
import KitLayer from "@/house/kit/KitLayer";
import { usePopupZ } from "@/components/shared/popupLayer";
import { useRegisterSheet } from "@/house/kit/sheetStack";
import "@/house/kit/kit.css";
import "@/house/kit/panels.css";

const SIZES = ["peek", "half", "full"];
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Back closes the sheet: one history entry while open. When the sheet
// closes some other way, that entry is taken back off only if it is still
// the top one (a Save that navigated away keeps its navigation).
export function useBackToClose(active, onBack) {
  const cb = useRef(onBack);
  cb.current = onBack;
  useEffect(() => {
    if (!active || typeof window === "undefined") return undefined;
    const token = `hk-sheet-${Math.random().toString(36).slice(2)}`;
    let popped = false;
    try { window.history.pushState({ ...(window.history.state || {}), houseSheet: token }, ""); } catch { return undefined; }
    const onPop = () => {
      if (window.history.state?.houseSheet === token) return;
      popped = true;
      cb.current?.();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (!popped && window.history.state?.houseSheet === token) {
        try { window.history.back(); } catch { /* ignore */ }
      }
    };
  }, [active]);
}

// Focus in on open, back on close; Tab kept inside when `trap`.
export function useSheetFocus(open, boxRef, { trap = false, initial } = {}) {
  const returnTo = useRef(null);
  useLayoutEffect(() => {
    if (!open) return undefined;
    returnTo.current = document.activeElement;
    const box = boxRef.current;
    // The grab bar is never the first stop (Lantern): the first real control is.
    const firstReal = [...(box?.querySelectorAll(FOCUSABLE) || [])].find((el) => !el.classList.contains("hk-sheet-grab"));
    const first = (initial && box?.querySelector(initial)) || box?.querySelector("[data-autofocus]") || firstReal || box;
    requestAnimationFrame(() => first?.focus?.({ preventScroll: true }));
    return () => {
      const back = returnTo.current;
      if (back && typeof back.focus === "function" && document.contains(back)) requestAnimationFrame(() => back.focus({ preventScroll: true }));
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const onKeyDown = (e) => {
    if (!trap || e.key !== "Tab") return;
    const els = [...(boxRef.current?.querySelectorAll(FOCUSABLE) || [])].filter((el) => el.offsetParent !== null);
    if (!els.length) return;
    const first = els[0], last = els[els.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  return onKeyDown;
}

export function Sheet({ open, onClose, title, size: sizeProp = "half", onSizeChange, modal, holdsTyping = false, closeOnOutside = false, grab = true, side = "bottom", tools, footer, inline = false, initialFocus, children, className = "", label }) {
  const id = useId();
  const boxRef = useRef(null);
  const [sizeState, setSizeState] = useState(sizeProp);
  useEffect(() => setSizeState(sizeProp), [sizeProp]);
  const size = SIZES.includes(sizeState) ? sizeState : "half";
  const setSize = (s) => { setSizeState(s); onSizeChange?.(s); };
  const isModal = modal ?? size === "full";
  const z = usePopupZ(240);
  const close = (reason) => onClose?.(reason);
  useBackToClose(open && !inline, () => close("back"));
  useEdgeSafeSliders(open && !inline, [size]);
  const onTrapKey = useSheetFocus(open && !inline, boxRef, { trap: isModal, initial: initialFocus });
  // The toast keeps clear of an open sheet (kit gate item 3).
  useRegisterSheet(open && !inline, boxRef);
  // A press outside: decided NO by default (step 2.2). A non-modal sheet sits
  // beside a page that stays usable, so a tap on that page is a tap on the
  // page, not "close". `closeOnOutside` opts a sheet in (never one that holds typing).
  useEffect(() => {
    if (!open || inline || holdsTyping || isModal || !closeOnOutside) return undefined;
    const onDown = (e) => {
      if (boxRef.current?.contains(e.target)) return;
      if (e.target?.closest?.("[data-house-pop], .hk-pop, [data-shared-pop], [data-sonner-toaster], .hk-toast")) return;
      close("outside");
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  // Drag the grab bar: up = taller, down = shorter (or close from peek).
  const drag = useRef(null);
  const grow = (dir) => {
    const i = SIZES.indexOf(size);
    const j = i + dir;
    if (j < 0) { if (!holdsTyping) close("drag"); return; }
    if (j < SIZES.length) setSize(SIZES[j]);
  };
  if (!open) return null;
  const sheet = (
    <div
      ref={boxRef}
      role="dialog"
      aria-modal={isModal || undefined}
      aria-labelledby={title ? `${id}-t` : undefined}
      aria-label={title ? undefined : label}
      tabIndex={-1}
      className={`hk-sheet ${className}`}
      data-size={size}
      data-side={side}
      data-inline={inline || undefined}
      style={inline ? undefined : { zIndex: z + 1 }}
      onKeyDown={(e) => {
        if (e.key === "Escape") { e.stopPropagation(); close("escape"); return; }
        onTrapKey(e);
      }}
    >
      {side === "bottom" && grab ? (
        <button
          type="button"
          className="hk-sheet-grab"
          aria-label={size === "full" ? `Make ${title || "the sheet"} shorter` : `Make ${title || "the sheet"} taller`}
          onClick={() => (size === "full" ? setSize("half") : grow(1))}
          onPointerDown={(e) => { drag.current = e.clientY; e.currentTarget.setPointerCapture?.(e.pointerId); }}
          onPointerUp={(e) => {
            const start = drag.current; drag.current = null;
            if (start == null) return;
            const dy = e.clientY - start;
            if (Math.abs(dy) > 40) { e.preventDefault(); grow(dy < 0 ? 1 : -1); }
          }}
        >
          <span className="hk-sheet-grabbar" aria-hidden="true" />
        </button>
      ) : null}
      <header className="hk-sheet-head">
        {title ? <h2 id={`${id}-t`} className="hk-sheet-title house-label">{title}</h2> : <span />}
        {tools ? <div className="hk-sheet-tools">{tools}</div> : null}
        <IconButton icon={X} label={`Close ${title || "the sheet"}`} onClick={() => close("close")} />
      </header>
      <div className="hk-sheet-body">{children}</div>
      {footer ? <footer className="hk-sheet-foot">{footer}</footer> : null}
    </div>
  );
  if (inline) return sheet;
  return (
    <KitLayer>
      {isModal ? <div className="hk-scrim" style={{ zIndex: z }} aria-hidden="true" onClick={() => { if (!holdsTyping) close("outside"); }} /> : null}
      {sheet}
    </KitLayer>
  );
}

// ── Confirm (delete) ──────────────────────────────────────────────────
export function ConfirmSheet({ open, thing, onConfirm, onCancel, instant = false, verb = "Delete", detail, inline = false }) {
  const [days, setDays] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!open || instant) return undefined;
    let live = true;
    getTrashSettings().then((s) => { if (live) setDays(s?.days ?? 30); }).catch(() => { if (live) setDays(30); });
    return () => { live = false; };
  }, [open, instant]);
  useEffect(() => { if (!open) { setBusy(false); setError(null); } }, [open]);
  const run = async () => {
    if (busy) return; // asked once, runs once
    setBusy(true); setError(null);
    try { await onConfirm?.(); } catch (e) { setError(e?.message || "Something went wrong"); setBusy(false); }
  };
  const keeps = instant
    ? "This one skips the trash: it can't be brought back."
    : days == null ? "It goes to the trash, where you can bring it back." : `${trashKeepsText(days)}, and you can bring it back from Recent changes.`;
  return (
    <Sheet open={open} inline={inline} onClose={() => onCancel?.()} title={`${verb} ${thing}?`} size="half" modal grab={false} initialFocus="[data-safe]">
      <div className="hk-confirm">
        <p className="hk-confirm-words">{keeps}</p>
        {detail ? <p className="hk-hint">{detail}</p> : null}
        {error ? <p className="hk-error" role="alert">Couldn't {verb.toLowerCase()} {thing}: {error}. Your data is safe.</p> : null}
        <div className="hk-confirm-actions">
          <Button rank="danger" icon={Trash2} busy={busy} busyLabel={`${verb === "Delete" ? "Deleting" : verb}…`} onClick={run}>{`${verb} ${thing}`}</Button>
          <Button rank="secondary" data-safe="" data-autofocus="" onClick={() => onCancel?.()}>Keep it</Button>
        </div>
      </div>
    </Sheet>
  );
}

// ── Safety (no app chrome) ────────────────────────────────────────────
export function SafetySheet({ open, title, onLeave, children, supportPath = "/grounding", supportLabel = "Need support right now?", inline = false }) {
  const id = useId();
  const boxRef = useRef(null);
  const navigate = useNavigate();
  const [armed, setArmed] = useState(false);
  const z = usePopupZ(400);
  useSheetFocus(open && !inline, boxRef, { trap: true });
  useRegisterSheet(open && !inline, boxRef);
  useBackToClose(open && !inline, () => onLeave?.("back"));
  useEffect(() => {
    if (!armed) return undefined;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  if (!open) return null;
  const box = (
    <div ref={boxRef} role="dialog" aria-modal={!inline || undefined} aria-labelledby={`${id}-t`} className="hk-safety" data-inline={inline || undefined}
      style={inline ? undefined : { zIndex: z }}>
      <header className="hk-safety-head">
        <Button rank="quiet" icon={ArrowLeft} onClick={() => { if (armed) { setArmed(false); onLeave?.("leave"); } else setArmed(true); }}
          aria-describedby={`${id}-leave`}>{armed ? "Tap again to leave" : "Back to the app"}</Button>
        <span id={`${id}-leave`} className="hk-sr">Leaving takes two taps, so it isn't pressed by accident.</span>
        <span className="hk-sr" role="status" aria-live="polite" data-safety-armed="">{armed ? "Tap again to leave." : ""}</span>
      </header>
      <h1 id={`${id}-t`} className="hk-safety-title house-label">{title}</h1>
      <div className="hk-safety-body">{children}</div>
      <footer className="hk-safety-foot">
        <Button rank="primary" block icon={HeartHandshake} onClick={() => { onLeave?.("support"); navigate(supportPath); }}>{supportLabel}</Button>
      </footer>
    </div>
  );
  return inline ? box : <KitLayer>{box}</KitLayer>;
}

export default Sheet;
