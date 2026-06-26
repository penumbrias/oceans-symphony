import React, { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Pin, Star, Zap, Settings as SettingsIcon, GripVertical, Check, Move } from "lucide-react";
import { toast } from "sonner";
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, arrayMove, horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toggleFrontFor, togglePrimaryFor, replaceFrontWith } from "@/hooks/useSwipeActions";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useTerms } from "@/lib/useTerms";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import useAnonymizeMode, { anonymizeBlurNames, anonymizeBlurAvatars } from "@/hooks/useAnonymizeMode";
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
//
// A settings gear (top-right of the header) opens per-user options:
//   - Rearrange: drag/drop the pin order (persisted to
//     SystemSettings.pinned_alters_config.order).
//   - Width / align: narrow the strip and tuck it to one side for
//     one-handed reach (config.width / config.cropSide).
//   - (Scroll block — a no-vertical-gesture grab bar — is a later phase.)

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
  // NB: shared ["systemSettings"] cache MUST stay an array — fetch the list,
  // derive [0] locally (see shared-query-key-cache-pollution memory).
  const { data: settingsList = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const settings = settingsList[0] || null;
  const config = (settings && settings.pinned_alters_config) || {};
  const savedOrder = Array.isArray(config.order) ? config.order : [];
  const width = Number.isFinite(config.width) ? config.width : 100;
  const cropSide = config.cropSide === "left" ? "left" : "right";

  const [gearOpen, setGearOpen] = useState(false);
  const [rearrange, setRearrange] = useState(false);

  const pinnedRaw = alters.filter((a) => a.is_pinned && !a.is_archived);
  // Custom order first (ids in saved order), then any not-yet-ordered pins
  // alphabetically. New pins land at the end until reordered.
  const orderIndex = new Map(savedOrder.map((id, i) => [id, i]));
  const pinned = [...pinnedRaw].sort((a, b) => {
    const ia = orderIndex.has(a.id) ? orderIndex.get(a.id) : Infinity;
    const ib = orderIndex.has(b.id) ? orderIndex.get(b.id) : Infinity;
    if (ia !== ib) return ia - ib;
    return (a.name || "").localeCompare(b.name || "");
  });

  const persistConfig = async (patch) => {
    if (!settings) return; // the app always has a SystemSettings row; don't create a stray one
    try {
      await base44.entities.SystemSettings.update(settings.id, {
        pinned_alters_config: { ...config, ...patch },
      });
      queryClient.invalidateQueries({ queryKey: ["systemSettings"] });
    } catch {
      toast.error("Couldn't save pinned settings");
    }
  };

  if (pinned.length === 0) return null;

  const stripWrapStyle = width < 100
    ? {
        width: `${width}%`,
        marginLeft: cropSide === "right" ? "auto" : undefined,
        marginRight: cropSide === "left" ? "auto" : undefined,
      }
    : undefined;

  return (
    <div data-tour="pinned-alters" className={`mb-3 ${className}`}>
      {showHeader && (
        <div className="flex items-center gap-2 mb-2 px-1">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <Pin className="w-3 h-3 fill-primary text-primary" /> Pinned
          </p>
          <div className="flex-1 h-px bg-border/50" />
          {rearrange ? (
            <button type="button" onClick={() => setRearrange(false)} className="text-[0.6875rem] font-semibold text-primary inline-flex items-center gap-1">
              <Check className="w-3.5 h-3.5" /> Done
            </button>
          ) : (
            <button type="button" onClick={() => setGearOpen(true)} aria-label="Pinned settings" title="Pinned settings" className="text-muted-foreground hover:text-foreground p-0.5">
              <SettingsIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      <div style={stripWrapStyle}>
        {rearrange ? (
          <>
            <RearrangeStrip
              pinned={pinned}
              anonymize={anonymize}
              formatAlter={formatAlter}
              onCommit={(ids) => persistConfig({ order: ids })}
            />
            <p className="text-[0.625rem] text-muted-foreground text-center mt-1">Hold &amp; drag to reorder · tap Done when finished</p>
          </>
        ) : (
          /* pt-5 leaves room for the swipe-up hint label above a chip. */
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
        )}
      </div>

      {gearOpen && (
        <PinnedAltersSettingsDialog
          open={gearOpen}
          onClose={() => setGearOpen(false)}
          width={width}
          cropSide={cropSide}
          onWidthChange={(w) => persistConfig({ width: w })}
          onCropSideChange={(s) => persistConfig({ cropSide: s })}
          onRearrange={() => { setGearOpen(false); setRearrange(true); }}
        />
      )}
    </div>
  );
}

// ── Rearrange mode: dnd-kit horizontal sortable. Swipe gestures are
// disabled here (the chips are drag handles, not front toggles). ───────────
function RearrangeStrip({ pinned, anonymize, formatAlter, onCommit }) {
  const [items, setItems] = useState(() => pinned.map((a) => a.id));
  const byId = Object.fromEntries(pinned.map((a) => [a.id, a]));
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 8 } }),
  );
  const handleEnd = (e) => {
    const { active, over } = e;
    if (over && active.id !== over.id) {
      setItems((prev) => {
        const next = arrayMove(prev, prev.indexOf(active.id), prev.indexOf(over.id));
        onCommit(next);
        return next;
      });
    }
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleEnd}>
      <SortableContext items={items} strategy={horizontalListSortingStrategy}>
        <div className="flex gap-3 overflow-x-auto pt-2 pb-3 scrollbar-none">
          {items.map((id) => (byId[id] ? (
            <SortablePinnedChip key={id} alter={byId[id]} anonymize={anonymize} formatAlter={formatAlter} />
          ) : null))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortablePinnedChip({ alter, anonymize, formatAlter }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: alter.id });
  const avatar = useResolvedAvatarUrl(alter.avatar_url);
  const blurNames = anonymizeBlurNames(anonymize);
  const blurAvatar = anonymizeBlurAvatars(anonymize);
  const label = formatAlter(alter);
  const style = { transform: CSS.Translate.toString(transform), transition, zIndex: isDragging ? 50 : "auto" };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`relative flex flex-col items-center gap-1 w-16 flex-shrink-0 select-none touch-none cursor-grab active:cursor-grabbing ${isDragging ? "opacity-80" : ""}`}
    >
      <div
        className="relative w-12 h-12 rounded-full overflow-hidden flex items-center justify-center"
        style={{ border: `2px solid ${alter.color || "hsl(var(--border))"}`, backgroundColor: alter.color ? `${alter.color}22` : "hsl(var(--muted))" }}
      >
        {avatar ? (
          <img src={avatar} alt={label} className={`w-full h-full object-cover ${blurAvatar ? "blur-md" : ""}`} />
        ) : (
          <span className="text-lg font-semibold text-foreground">{(alter.name || "?").charAt(0).toUpperCase()}</span>
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/25">
          <GripVertical className="w-4 h-4 text-white drop-shadow" />
        </span>
      </div>
      <span className={`text-[0.6875rem] text-foreground text-center leading-tight truncate w-full ${blurNames ? "blur-sm" : ""}`}>{label}</span>
    </div>
  );
}

function PinnedAltersSettingsDialog({ open, onClose, width, cropSide, onWidthChange, onCropSideChange, onRearrange }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Pinned alters</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          <Button variant="outline" onClick={onRearrange} className="w-full gap-2">
            <Move className="w-4 h-4" /> Rearrange order
          </Button>

          <div>
            <label className="text-sm font-medium flex items-center justify-between">
              Width <span className="text-xs text-muted-foreground">{width}%</span>
            </label>
            <input
              type="range" min={40} max={100} step={5} value={width}
              onChange={(e) => onWidthChange(Number(e.target.value))}
              className="w-full accent-primary mt-1"
            />
          </div>

          {width < 100 && (
            <div>
              <label className="text-sm font-medium block mb-1.5">Tuck to</label>
              <div className="flex gap-1.5">
                {["left", "right"].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onCropSideChange(s)}
                    className={`flex-1 text-xs px-2.5 py-1.5 rounded-lg border capitalize transition-colors ${cropSide === s ? "border-primary/50 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:bg-muted/50"}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <p className="text-[0.6875rem] text-muted-foreground mt-1">Narrow the pinned row and tuck it to one side — handy for one-handed (thumb) reach. Right by default for right-handed use.</p>
            </div>
          )}

          <p className="text-[0.625rem] text-muted-foreground italic">A "scroll block" (a safe grab-bar to scroll without fronting) is coming in a follow-up.</p>
        </div>
      </DialogContent>
    </Dialog>
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
  const blurNames = anonymizeBlurNames(anonymize);
  const blurAvatar = anonymizeBlurAvatars(anonymize);
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
