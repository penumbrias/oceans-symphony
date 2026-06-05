import { useRef, useState } from "react";

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

/**
 * Touch-driven swipe-tap-and-pan handler used by alter cards / chips.
 *
 *   tap   = finger down and up within ~10px → onTap()
 *   right = ≥40px horizontal-dominant swipe → onSwipeRight()
 *   left  = ≥40px horizontal-dominant swipe → onSwipeLeft()
 *
 * Returns:
 *   - bind:        spread onto the touchable wrapper (onTouchStart/Move/End/onClick)
 *   - dragX:       current pan offset (clamp ±60px) — apply via translateX
 *   - swipeHint:   "front" | "primary" | null — for inline action labels
 *
 * Keeps a 500ms `recentTouch` flag after touchend that suppresses the
 * synthetic onClick that mobile browsers fire. Mouse onClick still hits
 * onTap() on desktop.
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
  const [corner, setCorner] = useState(false);
  const [dragX, setDragX] = useState(0);

  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const onTouchStart = (e) => {
    const t = e.touches[0];
    startX.current = t.clientX;
    startY.current = t.clientY;
    longPressFired.current = false;
    leftReached.current = false;
    cornerFired.current = false;
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

  const onTouchMove = (e) => {
    const t = e.touches[0];
    const dx = t.clientX - startX.current;
    const dy = t.clientY - startY.current;
    if (Math.abs(dx) > Math.abs(dy)) {
      setDragX(Math.max(-60, Math.min(60, dx)));
    }
    // Any meaningful movement cancels the long-press timer.
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) cancelLongPress();

    // "Left then up" corner gesture. Once the finger has gone left past
    // the swipe threshold, an upward leg of CORNER_UP_THRESHOLD arms it.
    // Tracked via touch deltas so it still works even if the list scrolls
    // during the upward leg (we can't preventDefault from a passive
    // React listener).
    if (onSwipeLeftUp) {
      if (!leftReached.current && dx <= -SWIPE_THRESHOLD) {
        leftReached.current = true;
        leftAnchorY.current = t.clientY;
      }
      if (leftReached.current && !cornerFired.current) {
        if (leftAnchorY.current - t.clientY >= CORNER_UP_THRESHOLD) {
          cornerFired.current = true;
          setCorner(true);
        }
      }
    }
  };

  const onTouchEnd = (e) => {
    cancelLongPress();
    const t = e.changedTouches[0];
    const dx = t.clientX - startX.current;
    const dy = t.clientY - startY.current;
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
      if (typeof e.preventDefault === "function") e.preventDefault();
      onSwipeLeftUp?.();
      return;
    }

    if (adx > SWIPE_THRESHOLD && adx > ady) {
      // Suppress the synthetic click that mobile WebViews emit next —
      // otherwise the click could land on a different element and fire
      // a tap there. preventDefault on touchend cancels it across the
      // whole document for this gesture.
      if (typeof e.preventDefault === "function") e.preventDefault();
      if (dx > 0) onSwipeRight?.();
      else onSwipeLeft?.();
    } else if (adx < TAP_THRESHOLD && ady < TAP_THRESHOLD) {
      if (typeof e.preventDefault === "function") e.preventDefault();
      onTap?.();
    }
  };

  const onTouchCancel = () => {
    cancelLongPress();
    leftReached.current = false;
    cornerFired.current = false;
    setCorner(false);
    setDragX(0);
  };

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
    bind: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel, onClick },
    dragX,
    swipeHint,
  };
}

/** Centralised primary/front action handlers for any swipe-driven alter UI.
 *  These match AlterGridView so behaviour is identical across views. */
export async function toggleFrontFor(alter, _staleSessions, base44, queryClient, toast, terms = {}) {
  const FR = terms.front || "front";
  try {
    // Always refetch — never trust the closure-captured snapshot. A rapid
    // second tap can fire after a previous tap's invalidation queued a
    // refetch but before it landed, so the cached array may not yet show
    // the primary that was just created. Match togglePrimaryFor below.
    const fresh = await base44.entities.FrontingSession.filter({ is_active: true });
    const mySession = fresh.find(s => s.alter_id === alter.id);
    if (mySession) {
      await base44.entities.FrontingSession.update(mySession.id, {
        is_active: false,
        end_time: new Date().toISOString(),
      });
      toast.success(`${alter.name} removed from ${FR}`);
    } else {
      const hasPrimary = fresh.some(s => s.is_primary);
      await base44.entities.FrontingSession.create({
        alter_id: alter.id,
        is_primary: !hasPrimary,
        start_time: new Date().toISOString(),
        is_active: true,
      });
      toast.success(`${alter.name} added to ${FR}`);
    }
    queryClient.invalidateQueries({ queryKey: ["activeFront"] });
    queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
  } catch (err) {
    toast.error(err.message || "Failed to update front");
  }
}

// "Left then up" corner gesture: clear the entire current front and make
// `alter` the sole primary fronter. End every active session (including
// the tapped alter's, if any) then create one fresh primary session.
export async function replaceFrontWith(alter, base44, queryClient, toast, terms = {}) {
  const FR = terms.front || "front";
  try {
    const now = new Date().toISOString();
    const fresh = await base44.entities.FrontingSession.filter({ is_active: true });
    for (const s of fresh) {
      await base44.entities.FrontingSession.update(s.id, { is_active: false, end_time: now });
    }
    await base44.entities.FrontingSession.create({
      alter_id: alter.id,
      is_primary: true,
      start_time: now,
      is_active: true,
    });
    toast.success(`${alter.name} is now the sole ${FR}`);
    queryClient.invalidateQueries({ queryKey: ["activeFront"] });
    queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
  } catch (err) {
    toast.error(err.message || "Failed to update front");
  }
}

export async function togglePrimaryFor(alter, _staleSessions, base44, queryClient, toast, terms = {}) {
  const FER = terms.fronter || "fronter";
  try {
    // Always refetch — never trust the closure-captured snapshot. A long-press
    // can fire 500–600ms after the gesture started, by which time the cached
    // sessions may be stale.
    const fresh = await base44.entities.FrontingSession.filter({ is_active: true });
    const mySession = fresh.find(s => s.alter_id === alter.id);

    if (mySession?.is_primary) {
      await base44.entities.FrontingSession.update(mySession.id, { is_primary: false });
      toast.success(`${alter.name} demoted to co-${FER}`);
    } else {
      // Demote every existing primary (not just the first one) so we never
      // leave two primaries in the DB after a partial failure or after stale
      // duplicates have leaked in.
      for (const s of fresh.filter(s => s.is_primary && s.alter_id !== alter.id)) {
        try { await base44.entities.FrontingSession.update(s.id, { is_primary: false }); } catch {}
      }
      if (mySession) {
        await base44.entities.FrontingSession.update(mySession.id, { is_primary: true });
        toast.success(`${alter.name} promoted to primary`);
      } else {
        await base44.entities.FrontingSession.create({
          alter_id: alter.id,
          is_primary: true,
          start_time: new Date().toISOString(),
          is_active: true,
        });
        toast.success(`${alter.name} is now primary ${FER}`);
      }
    }
    queryClient.invalidateQueries({ queryKey: ["activeFront"] });
    queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
  } catch (err) {
    toast.error(err.message || "Failed to update primary");
  }
}
