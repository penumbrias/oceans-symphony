import { useRef, useState, useEffect } from "react";
import { changeFront } from "@/lib/setFront";

const SWIPE_THRESHOLD = 40;
const TAP_THRESHOLD = 10;
// "Left then up" corner gesture: after the finger has swiped left past
// SWIPE_THRESHOLD, rising this many px above the left-crossing point
// arms the gesture (clear the front, make this alter the sole primary).
const CORNER_UP_THRESHOLD = 35;

// Module-level recent-touch deadline. Android WebView sometimes fires the
// synthetic `click` after a touchend on a NEIGHBOURING element — finger
// position rounds slightly and the click lands on the row above or below
// the one that actually got tapped. A per-hook `recentTouch` ref only
// suppresses the click on the original row, so the neighbour fired its
// onTap a second time. We track the deadline module-wide so every
// instance of the hook ignores any onClick that lands within 500 ms of
// any touch elsewhere on the page.
let globalRecentTouchUntil = 0;

// Timestamp of the most recent REAL touch event (set only by the touch path).
// Used to ignore the synthetic mouse events mobile browsers fire after a
// touch. Kept separate from `globalRecentTouchUntil` (which the mouse path
// also sets) so that on desktop — where no touch ever happens — rapid real
// mouse clicks are never mistaken for post-touch synthetics.
let globalLastTouchAt = 0;

/**
 * Pointer-driven swipe-tap-and-pan handler used by alter cards / chips.
 * Works with BOTH touch (mobile) and a mouse (desktop) — the same gesture
 * pipeline is fed by touch events on mobile and by mouse events on desktop,
 * so press-hold, swipe, and the corner gesture all work with a mouse.
 *
 *   tap   = pointer down and up within ~10px → onTap()
 *   right = ≥40px horizontal-dominant swipe → onSwipeRight()
 *   left  = ≥40px horizontal-dominant swipe → onSwipeLeft()
 *   hold  = pointer held ~500ms without moving → onLongPress()
 *
 * Returns:
 *   - bind:        spread onto the wrapper (touch + onMouseDown + onClick)
 *   - dragX:       current pan offset (clamp ±60px) — apply via translateX
 *   - swipeHint:   "front" | "primary" | "solo" | null — for inline labels
 *
 * Keeps a 500ms `recentTouch` flag after a gesture ends that suppresses the
 * synthetic onClick that follows (mobile WebViews + desktop both emit one),
 * so a tap fires onTap exactly once. On desktop the mouse path drives a drag
 * via document-level move/up listeners so it continues off the element.
 */
export default function useSwipeActions({ onTap, onSwipeRight, onSwipeLeft, onSwipeLeftUp, onLongPress, longPressMs = 500 } = {}) {
  const startX = useRef(0);
  const startY = useRef(0);
  const recentTouch = useRef(false);
  const longPressFired = useRef(false);
  const longPressTimer = useRef(null);
  // "Left then up" corner-gesture tracking. `leftReached` flips once the
  // finger swipes left far enough; `leftAnchorY` records the Y at that
  // moment so we can measure the subsequent upward leg. `cornerFired`
  // latches once the upward leg clears the threshold.
  const leftReached = useRef(false);
  const leftAnchorY = useRef(0);
  const cornerFired = useRef(false);
  // Peak signed horizontal travel during the gesture, recorded only while the
  // move was horizontally dominant. We classify the swipe on this peak rather
  // than the end-point delta, so a clear horizontal swipe still fires even if
  // the finger drifts vertically or eases back as it lifts (the "animation
  // happened but nothing triggered" bug).
  const peakDx = useRef(0);
  const [corner, setCorner] = useState(false);
  const [dragX, setDragX] = useState(0);

  // Desktop mouse-drag bookkeeping. Desktop has no touch events, so we replay
  // the SAME gesture pipeline (below) from mouse events. Document-level
  // move/up listeners let a drag continue — and end — even when the cursor
  // leaves the element, exactly what touch gives us for free. The touch path
  // is byte-for-byte unchanged; this is purely additive.
  const mouseActive = useRef(false);
  const mouseMoveRef = useRef(null);
  const mouseUpRef = useRef(null);

  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  // ── Coordinate-based gesture core, shared by the touch and mouse paths.
  //    Touch handlers feed it e.touches[0]; mouse handlers feed it e.clientX/Y.
  const beginGesture = (clientX, clientY) => {
    startX.current = clientX;
    startY.current = clientY;
    longPressFired.current = false;
    leftReached.current = false;
    cornerFired.current = false;
    peakDx.current = 0;
    setCorner(false);
    setDragX(0);
    if (onLongPress) {
      cancelLongPress();
      longPressTimer.current = setTimeout(() => {
        longPressFired.current = true;
        longPressTimer.current = null;
        onLongPress();
      }, longPressMs);
    }
  };

  const moveGesture = (clientX, clientY) => {
    const dx = clientX - startX.current;
    const dy = clientY - startY.current;
    if (Math.abs(dx) > Math.abs(dy)) {
      setDragX(Math.max(-60, Math.min(60, dx)));
      if (Math.abs(dx) > Math.abs(peakDx.current)) peakDx.current = dx;
    }
    // Any meaningful movement cancels the long-press timer.
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) cancelLongPress();

    // "Left then up" corner gesture. Once travel has gone left past the swipe
    // threshold, an upward leg of CORNER_UP_THRESHOLD arms it. Tracked via
    // deltas so it still works even if the list scrolls during the upward leg.
    if (onSwipeLeftUp) {
      if (!leftReached.current && dx <= -SWIPE_THRESHOLD) {
        leftReached.current = true;
        leftAnchorY.current = clientY;
      }
      if (leftReached.current && !cornerFired.current) {
        if (leftAnchorY.current - clientY >= CORNER_UP_THRESHOLD) {
          cornerFired.current = true;
          setCorner(true);
        }
      }
    }
  };

  // `e` is the source event (touchend / mouseup) so we can preventDefault the
  // synthetic click. Pass null/undefined when there's no event to cancel.
  const endGesture = (clientX, clientY, e) => {
    cancelLongPress();
    const dx = clientX - startX.current;
    const dy = clientY - startY.current;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    setDragX(0);
    setCorner(false);
    recentTouch.current = true;
    globalRecentTouchUntil = Date.now() + 500;
    setTimeout(() => { recentTouch.current = false; }, 500);

    if (longPressFired.current) return; // long-press already handled

    // Corner gesture wins over the plain swipes — it implies both a left
    // leg and an upward leg, so check it before the directional fallbacks.
    if (cornerFired.current) {
      if (e && typeof e.preventDefault === "function") e.preventDefault();
      onSwipeLeftUp?.();
      return;
    }

    // Classify on the PEAK horizontal travel (recorded only while the move was
    // horizontally dominant), falling back to the end-point delta. This catches
    // swipes where the pointer drifted vertically or eased back on release —
    // previously those showed the slide animation but fired no action.
    const peak = peakDx.current;
    const apx = Math.abs(peak);
    const isSwipe = apx > SWIPE_THRESHOLD || (adx > SWIPE_THRESHOLD && adx > ady);
    const dir = apx > SWIPE_THRESHOLD ? peak : dx;
    if (isSwipe) {
      // Suppress the synthetic click that follows — otherwise the click could
      // land on a different element and fire a tap there.
      if (e && typeof e.preventDefault === "function") e.preventDefault();
      if (dir > 0) onSwipeRight?.();
      else onSwipeLeft?.();
    } else if (adx < TAP_THRESHOLD && ady < TAP_THRESHOLD) {
      if (e && typeof e.preventDefault === "function") e.preventDefault();
      onTap?.();
    }
  };

  const resetGesture = () => {
    cancelLongPress();
    leftReached.current = false;
    cornerFired.current = false;
    peakDx.current = 0;
    setCorner(false);
    setDragX(0);
  };

  // ── Touch path (mobile) — unchanged behaviour. Each touch event stamps
  //    globalLastTouchAt so the mouse path can ignore the synthetic mouse
  //    events that follow. ──
  const onTouchStart = (e) => { globalLastTouchAt = Date.now(); const t = e.touches[0]; beginGesture(t.clientX, t.clientY); };
  const onTouchMove = (e) => { globalLastTouchAt = Date.now(); const t = e.touches[0]; moveGesture(t.clientX, t.clientY); };
  const onTouchEnd = (e) => { globalLastTouchAt = Date.now(); const t = e.changedTouches[0]; endGesture(t.clientX, t.clientY, e); };
  const onTouchCancel = () => { globalLastTouchAt = Date.now(); resetGesture(); };

  // ── Mouse path (desktop) — additive. Mirrors the touch path so press-hold
  //    (long-press), swipe, and the corner gesture all work with a mouse. ──
  const detachMouse = () => {
    if (mouseMoveRef.current) { document.removeEventListener("mousemove", mouseMoveRef.current); mouseMoveRef.current = null; }
    if (mouseUpRef.current) { document.removeEventListener("mouseup", mouseUpRef.current); mouseUpRef.current = null; }
    mouseActive.current = false;
  };

  const onMouseDown = (e) => {
    if (e.button !== 0) return; // left button only — leave right-click for menus
    // CRITICAL: mobile browsers fire SYNTHETIC mouse events (mousedown/up/click)
    // right after a real touch. The touch path already handled the gesture, so
    // ignore any mouse event that lands within the post-touch window — otherwise
    // every tap would fire twice on mobile. We check globalLastTouchAt (set only
    // by the touch path), NOT the shared recentTouch flag, so rapid real mouse
    // clicks on desktop are never suppressed.
    if (Date.now() - globalLastTouchAt < 700) return;
    // Suppress the browser's native mousedown defaults — chiefly image/text
    // DRAG. Most gesture surfaces render an avatar <img>, which is draggable by
    // default, so a click-drag started a native image drag and the swipe never
    // registered (the alters grid only worked because it sets draggable={false}
    // on its imgs). preventDefault here fixes every surface centrally; it stops
    // drag + text-selection but does NOT cancel the click, so taps still fire.
    e.preventDefault();
    detachMouse(); // clear any stuck listeners from a prior drag
    mouseActive.current = true;
    beginGesture(e.clientX, e.clientY);
    const move = (ev) => {
      if (!mouseActive.current) return;
      // Stop the browser from text-selecting the card while dragging.
      if (typeof ev.preventDefault === "function") ev.preventDefault();
      moveGesture(ev.clientX, ev.clientY);
    };
    const up = (ev) => {
      detachMouse();
      endGesture(ev.clientX, ev.clientY, ev);
    };
    mouseMoveRef.current = move;
    mouseUpRef.current = up;
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  };

  // Tear down any in-flight document listeners if the component unmounts
  // mid-drag.
  useEffect(() => () => detachMouse(), []);

  const onClick = () => {
    // Suppress the click if either this hook saw a recent touch OR any
    // sibling hook saw one. The cross-row case is the bug that caused
    // "tap synskritty also adds abstractictonica" — Android's synthetic
    // click for the touch landed on the neighbouring row.
    if (recentTouch.current || Date.now() < globalRecentTouchUntil) return;
    onTap?.();
  };

  // "solo" takes precedence once the corner gesture arms, so the inline
  // hint flips from "Primary" to the sole-front label as the finger turns up.
  const swipeHint = corner ? "solo" : dragX > 12 ? "front" : dragX < -12 ? "primary" : null;

  return {
    bind: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel, onMouseDown, onClick },
    dragX,
    swipeHint,
  };
}

/** Centralised primary/front action handlers for any swipe-driven alter UI.
 *  These match AlterGridView so behaviour is identical across views. All of
 *  them write through changeFront (setFront.js), which reads the front fresh
 *  at write time — never the closure-captured snapshot — so a rapid second
 *  tap or a 500ms long-press can't act on stale sessions. The `base44` and
 *  stale-sessions arguments are kept for the existing call sites. */
const frontChanged = (queryClient) => {
  queryClient.invalidateQueries({ queryKey: ["activeFront"] });
  try { window.dispatchEvent(new Event("symphony-front-changed")); } catch { /* SSR */ }
  queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
};

export async function toggleFrontFor(alter, _staleSessions, _base44, queryClient, toast, terms = {}) {
  const FR = terms.front || "front";
  try {
    let removed = false;
    await changeFront((cur) => {
      if (cur.some((s) => s.alterId === alter.id)) {
        removed = true;
        return cur.filter((s) => s.alterId !== alter.id);
      }
      return [...cur, { alterId: alter.id, isPrimary: !cur.some((s) => s.isPrimary) }];
    }, { queryClient, terms });
    toast.success(removed ? `${alter.name} removed from ${FR}` : `${alter.name} added to ${FR}`);
    frontChanged(queryClient);
  } catch (err) {
    toast.error(err.message || "Failed to update front");
  }
}

// One-way "remove from front": ends the alter's active session if there is
// one, and does NOTHING when they aren't fronting. The level rail's
// "Remove from {front}" stop must use THIS, not toggleFrontFor — a toggle
// ADDS a non-fronter, which is the opposite of what the gesture says.
export async function removeFrontFor(alter, _base44, queryClient, toast, terms = {}) {
  const FR = terms.front || "front";
  try {
    const { changed } = await changeFront((cur) => (
      cur.some((s) => s.alterId === alter.id) ? cur.filter((s) => s.alterId !== alter.id) : null
    ), { queryClient, terms });
    if (!changed) return; // already out — keep them out
    toast.success(`${alter.name} removed from ${FR}`);
    frontChanged(queryClient);
  } catch (err) {
    toast.error(err.message || "Failed to update front");
  }
}

// "Left then up" corner gesture: clear the entire current front and make
// `alter` the sole primary fronter. Their own session is kept (and its
// "fronting since") when they were already in front.
export async function replaceFrontWith(alter, _base44, queryClient, toast, terms = {}) {
  const FR = terms.front || "front";
  try {
    await changeFront((cur) => {
      const mine = cur.find((s) => s.alterId === alter.id);
      return [{ alterId: alter.id, isPrimary: true, level: mine?.level }];
    }, { queryClient, terms });
    toast.success(`${alter.name} is now the sole ${FR}`);
    frontChanged(queryClient);
  } catch (err) {
    toast.error(err.message || "Failed to update front");
  }
}

export async function togglePrimaryFor(alter, _staleSessions, _base44, queryClient, toast, terms = {}) {
  const FER = terms.fronter || "fronter";
  try {
    let message = "";
    await changeFront((cur) => {
      const mine = cur.find((s) => s.alterId === alter.id);
      if (mine?.isPrimary) {
        message = `${alter.name} demoted to co-${FER}`;
        return cur.map((s) => (s.alterId === alter.id ? { ...s, isPrimary: false } : s));
      }
      // Every other primary is demoted, so two can never be left behind.
      message = mine ? `${alter.name} promoted to primary` : `${alter.name} is now primary ${FER}`;
      const rest = cur.map((s) => ({ ...s, isPrimary: false }));
      return mine
        ? rest.map((s) => (s.alterId === alter.id ? { ...s, isPrimary: true } : s))
        : [...rest, { alterId: alter.id, isPrimary: true }];
    }, { queryClient, terms });
    toast.success(message);
    frontChanged(queryClient);
  } catch (err) {
    toast.error(err.message || "Failed to update primary");
  }
}
