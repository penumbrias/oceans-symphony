import React, { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Pin, Star, Zap } from "lucide-react";
import { toast } from "sonner";
import { toggleFrontFor, togglePrimaryFor, replaceFrontWith } from "@/hooks/useSwipeActions";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useTerms } from "@/lib/useTerms";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import useAnonymizeMode from "@/hooks/useAnonymizeMode";
import AlterActionMenu from "./AlterActionMenu";

// Self-contained horizontal gallery of pinned alters. Used on the
// alters directory (above groups) AND as a Dashboard element, so it
// fetches its own data and renders nothing when no alter is pinned.
//
// Per-chip gestures (mobile, vertical — the strip itself scrolls
// horizontally so vertical is free):
//   - tap                  → open the alter's profile
//   - swipe UP             → add to front, or toggle primary if fronting
//   - swipe DOWN           → remove from front
//   - swipe UP, THEN LEFT  → make them the sole fronter
// The sole-front gesture is a deliberate two-leg "corner": the finger
// must travel UP past the threshold first, THEN move LEFT from that
// point. A casual upper-left diagonal does NOT trigger it. This mirrors
// the alters grid's "left then up" corner gesture.
// The chip follows the finger (translateY) with the same recoverable
// feel as the grid: a hint label shows what will fire, and releasing
// near the middle does nothing — so an accidental scroll-grab can be
// backed out of.

const V_SWIPE_THRESHOLD = 40;      // px up/down to trigger an action
const V_TAP_THRESHOLD = 10;        // px below which a release counts as a tap
const CORNER_LEFT_THRESHOLD = 35;  // px LEFT after the up leg to arm sole-front

// Module-level recent-touch deadline so the synthetic click after a
// touch gesture doesn't double-fire onTap. Scoped to this gallery.
let galleryRecentTouchUntil = 0;

export default function PinnedAltersGallery({ showHeader = true, className = "" }) {
  const queryClient = useQueryClient();
  const formatAlter = useAlterLabel();
  const { mode: anonymize } = useAnonymizeMode();

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });
  const { data: activeSessions = [] } = useQuery({
    queryKey: ["activeFront"],
    queryFn: () => base44.entities.FrontingSession.filter({ is_active: true }),
  });

  const pinned = alters
    .filter((a) => a.is_pinned && !a.is_archived)
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  if (pinned.length === 0) return null;

  return (
    <div data-tour="pinned-alters" className={`mb-3 ${className}`}>
      {showHeader && (
        <div className="flex items-center gap-2 mb-2 px-1">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <Pin className="w-3 h-3 fill-primary text-primary" /> Pinned
          </p>
          <div className="flex-1 h-px bg-border/50" />
        </div>
      )}
      {/* pt-5 leaves room for the swipe-up hint label above a chip. */}
      <div className="flex gap-3 overflow-x-auto pt-5 pb-5 scrollbar-none" style={{ WebkitOverflowScrolling: "touch" }}>
        {pinned.map((a) => (
          <PinnedAlterChip
            key={a.id}
            alter={a}
            activeSessions={activeSessions}
            anonymize={anonymize}
            formatAlter={formatAlter}
            queryClient={queryClient}
          />
        ))}
      </div>
    </div>
  );
}

// Vertical swipe handler — mirrors useSwipeActions' structure (drag
// offset + hint + tap suppression) but on the Y axis, so it coexists
// with the gallery's horizontal scroll.
const LONG_PRESS_MS = 450;

function useVerticalChipSwipe({ onUp, onDown, onSolo, onTap, onLongPress }) {
  const startX = useRef(0);
  const startY = useRef(0);
  const recentTouch = useRef(false);
  const moved = useRef(false);            // finger left the tap radius
  const longPressTimer = useRef(null);
  const longPressFired = useRef(false);
  const upReached = useRef(false);
  const upAnchorX = useRef(0);
  const cornerFired = useRef(false);
  const [dragY, setDragY] = useState(0);
  const [hint, setHint] = useState(null); // 'up' | 'down' | 'solo' | null

  const cancelLongPress = () => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; } };
  // Only suppress the trailing synthetic click when we actually acted on
  // the gesture — an abandoned/return-to-centre swipe leaves NO lingering
  // state, so it can't break later taps.
  const suppressClick = () => {
    recentTouch.current = true;
    galleryRecentTouchUntil = Date.now() + 500;
    setTimeout(() => { recentTouch.current = false; }, 500);
  };
  const reset = () => { cancelLongPress(); upReached.current = false; cornerFired.current = false; setDragY(0); setHint(null); };

  const onTouchStart = (e) => {
    const t = e.touches[0];
    startX.current = t.clientX;
    startY.current = t.clientY;
    upReached.current = false;
    cornerFired.current = false;
    moved.current = false;
    longPressFired.current = false;
    setDragY(0);
    setHint(null);
    cancelLongPress();
    if (onLongPress) {
      longPressTimer.current = setTimeout(() => {
        longPressTimer.current = null;
        if (moved.current) return;
        longPressFired.current = true;
        onLongPress();
      }, LONG_PRESS_MS);
    }
  };
  const onTouchMove = (e) => {
    const t = e.touches[0];
    const dx = t.clientX - startX.current;
    const dy = t.clientY - startY.current;
    if (Math.abs(dx) > V_TAP_THRESHOLD || Math.abs(dy) > V_TAP_THRESHOLD) {
      moved.current = true;
      cancelLongPress();
    }
    if (Math.abs(dy) >= Math.abs(dx)) {
      setDragY(Math.max(-60, Math.min(60, dy)));
    }
    if (!upReached.current && dy <= -V_SWIPE_THRESHOLD) {
      upReached.current = true;
      upAnchorX.current = t.clientX;
    }
    if (upReached.current && !cornerFired.current) {
      if (upAnchorX.current - t.clientX >= CORNER_LEFT_THRESHOLD) cornerFired.current = true;
    }
    if (cornerFired.current) setHint("solo");
    else if (dy <= -V_SWIPE_THRESHOLD) setHint("up");
    else if (dy >= V_SWIPE_THRESHOLD) setHint("down");
    else setHint(null);
  };
  const onTouchEnd = (e) => {
    cancelLongPress();
    const t = e.changedTouches[0];
    const dx = t.clientX - startX.current;
    const dy = t.clientY - startY.current;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    setDragY(0);
    setHint(null);

    if (longPressFired.current) { suppressClick(); return; }

    let fired = false;
    const pd = () => { if (typeof e.preventDefault === "function") e.preventDefault(); };
    if (cornerFired.current) { pd(); onSolo?.(); fired = true; }
    else if (dy <= -V_SWIPE_THRESHOLD && ady > adx) { pd(); onUp?.(); fired = true; }
    else if (dy >= V_SWIPE_THRESHOLD && ady > adx) { pd(); onDown?.(); fired = true; }
    else if (!moved.current && adx < V_TAP_THRESHOLD && ady < V_TAP_THRESHOLD) { pd(); onTap?.(); fired = true; }
    if (fired) suppressClick();
  };
  const onTouchCancel = () => { reset(); };
  const onClick = () => {
    if (recentTouch.current || Date.now() < galleryRecentTouchUntil) return;
    onTap?.();
  };

  return {
    bind: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel, onClick },
    dragY,
    hint,
  };
}

function PinnedAlterChip({ alter, activeSessions, anonymize, formatAlter, queryClient }) {
  const navigate = useNavigate();
  const terms = useTerms();
  const resolvedAvatar = useResolvedAvatarUrl(alter.avatar_url);
  const [menuOpen, setMenuOpen] = useState(false);
  const mySession = activeSessions.find((s) => s.alter_id === alter.id);
  const fronting = !!mySession;
  const isPrimary = mySession?.is_primary ?? false;
  const blurNames = anonymize !== "off";
  const blurAvatar = anonymize === "all";
  const label = formatAlter(alter);

  const { bind, dragY, hint } = useVerticalChipSwipe({
    onTap: () => navigate(`/alter/${alter.id}`),
    onUp: () =>
      fronting
        ? togglePrimaryFor(alter, activeSessions, base44, queryClient, toast, terms)
        : toggleFrontFor(alter, activeSessions, base44, queryClient, toast, terms),
    onDown: () => {
      // Swipe-down only means anything when they're fronting (it removes
      // them). toggleFrontFor removes when a session exists.
      if (fronting) toggleFrontFor(alter, activeSessions, base44, queryClient, toast, terms);
    },
    onSolo: () => replaceFrontWith(alter, base44, queryClient, toast, terms),
    // Press-and-hold → the same quick-actions menu as the alters page
    // (profile, subsystem, front/primary, add to groups, pin/unpin).
    onLongPress: () => setMenuOpen(true),
  });

  const ringColor = fronting
    ? (isPrimary ? "#f59e0b" : (alter.color || "#8b5cf6"))
    : (alter.color || "hsl(var(--border))");

  const hintText =
    hint === "solo" ? "Solo" :
    hint === "down" ? "Remove" :
    hint === "up" ? (fronting ? "Primary" : "Front") :
    null;
  const hintColor =
    hint === "solo" ? "text-primary" :
    hint === "down" ? "text-amber-500" :
    "text-emerald-500";

  return (
    <>
    <button
      type="button"
      {...bind}
      title={`${label} — swipe up for front/primary, down to remove, up-then-left for sole front; tap to open, hold for options`}
      className="relative flex flex-col items-center gap-1 w-16 flex-shrink-0 select-none"
      style={{ touchAction: "pan-x" }}
    >
      {hintText && (
        <span className={`absolute -top-4 left-1/2 -translate-x-1/2 text-[0.5625rem] font-semibold uppercase tracking-wide pointer-events-none ${hintColor}`}>
          {hintText}
        </span>
      )}
      <div
        className={`relative rounded-full overflow-hidden flex items-center justify-center ${fronting ? "w-16 h-16" : "w-12 h-12"}`}
        style={{
          // Fronting alters render LARGER (like the alters grid) rather
          // than with a glow — clearer at-a-glance "who's active" and
          // less visual noise. A coloured border still tints them.
          border: `2px solid ${fronting ? ringColor : "hsl(var(--border))"}`,
          backgroundColor: alter.color ? `${alter.color}22` : "hsl(var(--muted))",
          transform: `translateY(${dragY}px)`,
          transition: dragY === 0 ? "transform 150ms ease-out" : "none",
        }}
      >
        {resolvedAvatar ? (
          <img src={resolvedAvatar} alt={label} className={`w-full h-full object-cover ${blurAvatar ? "blur-md" : ""}`} />
        ) : (
          <span className="text-lg font-semibold text-foreground">
            {(alter.name || "?").charAt(0).toUpperCase()}
          </span>
        )}
        {fronting && (
          <span
            className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center ring-2 ring-card"
            style={{ backgroundColor: isPrimary ? "#f59e0b" : (alter.color || "#8b5cf6") }}
          >
            {isPrimary ? <Star className="w-2.5 h-2.5 text-white" fill="white" /> : <Zap className="w-2.5 h-2.5 text-white" fill="white" />}
          </span>
        )}
      </div>
      <span className={`text-[0.6875rem] text-foreground text-center leading-tight truncate w-full ${blurNames ? "blur-sm" : ""}`}>
        {label}
      </span>
    </button>
    {menuOpen && <AlterActionMenu alter={alter} activeSessions={activeSessions} onClose={() => setMenuOpen(false)} />}
    </>
  );
}
