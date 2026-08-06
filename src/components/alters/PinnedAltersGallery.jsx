import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Pin, Star, Zap, Settings as SettingsIcon, GripVertical, GripHorizontal, Check, Move, Search, Plus } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, arrayMove, horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useTerms } from "@/lib/useTerms";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import useAnonymizeMode, { anonymizeBlurNames, anonymizeBlurAvatars } from "@/hooks/useAnonymizeMode";
import { useFrontGesture } from "@/components/fronting/FrontLevelRail";

// Self-contained horizontal gallery of pinned alters. Used on the
// alters directory (above groups) AND as a Dashboard element, so it
// fetches its own data and renders nothing when no alter is pinned.
//
// Per-chip gestures — the app-standard grammar (v0.122.0):
//   - tap             → open the alter's profile
//   - press-and-hold  → the fronting-level rail (Remove stop included;
//                       holding a non-fronter adds them at the level
//                       released on)
// The old vertical swipes are gone: hold-to-trigger can't misfire while
// the strip scrolls, so no hint labels or recovery choreography needed.
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
// Timestamp of the most recent REAL touch — lets the mouse path ignore the
// synthetic mouse events mobile browsers fire after a touch (mirrors
// globalLastTouchAt in useSwipeActions). On desktop no touch ever happens, so
// real mouse drags are never suppressed.
let galleryLastTouchAt = 0;

// hideScrollBlock: the v2 board swipes pages across the whole surface,
// so the strip's no-swipe spacer protects nothing there and just eats
// room. showGear: hosts that hide the header still need a way into the
// size/pins settings (owner: "no way to change the size").
export default function PinnedAltersGallery({ showHeader = true, hideScrollBlock = false, showGear = false, className = "" }) {
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
  // Avatar diameter in px — the bar's height follows it. Owner: width
  // alone "doesn't help", the strip is too TALL.
  const chipSize = Number.isFinite(config.chipSize) ? config.chipSize : 48;
  const cropSide = config.cropSide === "left" ? "left" : "right";
  // The "scroll block" is a safe, no-swipe zone the user drops INTO the pinned
  // strip at a spot they naturally scroll — so a page-scroll gesture there
  // scrolls the page instead of accidentally fronting an alter. It's an inline
  // item: pins flow to BOTH sides of it, none are hidden. `position` is the
  // insertion index across the strip (0 = far left … chip-count = far right),
  // so it can sit anywhere, not just on one side.
  const sb = (config.scrollBlock && typeof config.scrollBlock === "object") ? config.scrollBlock : {};
  const sbEnabled = !hideScrollBlock && !!sb.enabled;
  const sbWidth = Number.isFinite(sb.width) ? sb.width : 56;

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

  const setPinnedAlter = async (id, val) => {
    try {
      await base44.entities.Alter.update(id, { is_pinned: val });
      queryClient.invalidateQueries({ queryKey: ["alters"] });
    } catch {
      toast.error("Couldn't update pin");
    }
  };

  // Nothing pinned yet → the strip stays hidden. First pins come from an
  // alter's press-and-hold menu ("Pin to top"); once at least one is pinned,
  // the gear's "Add or remove pins" manages the rest.
  if (pinned.length === 0) return null;

  const stripWrapStyle = width < 100
    ? {
        width: `${width}%`,
        marginLeft: cropSide === "right" ? "auto" : undefined,
        marginRight: cropSide === "left" ? "auto" : undefined,
      }
    : undefined;

  return (
    <div data-tour="pinned-alters" className={`mb-3 relative ${className}`}>
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

      {!showHeader && showGear && !rearrange && (
        <button type="button" onClick={() => setGearOpen(true)}
          aria-label="Pinned settings" title="Pinned settings"
          className="absolute -top-1 right-0 z-10 p-1 rounded-full text-muted-foreground/70 hover:text-foreground bg-background/80">
          <SettingsIcon className="w-3 h-3" />
        </button>
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
        ) : (() => {
          const chips = pinned.map((a) => (
            <PinnedAlterChip
              key={a.id}
              alter={a}
              activeSessions={activeSessions}
              anonymize={anonymize}
              formatAlter={formatAlter}
              queryClient={queryClient}
              size={chipSize}
            />
          ));
          // Drop the scroll block INTO the row at the chosen index — pins slide
          // to either side of it, none hidden. It sits wherever the user placed
          // it in the strip.
          let rowChildren = chips;
          if (sbEnabled) {
            const pos = Math.max(0, Math.min(chips.length, Number.isFinite(sb.position) ? sb.position : Math.floor(chips.length / 2)));
            rowChildren = [...chips.slice(0, pos), <ScrollBlockBar key="__scrollblock" width={sbWidth} />, ...chips.slice(pos)];
          }
          // pt-5 leaves room for the swipe-up hint label above a chip.
          return (
            <div className="flex gap-3 overflow-x-auto pt-5 pb-5 scrollbar-none" style={{ WebkitOverflowScrolling: "touch" }}>
              {rowChildren}
            </div>
          );
        })()}
      </div>

      {gearOpen && (
        <PinnedAltersSettingsDialog
          open={gearOpen}
          onClose={() => setGearOpen(false)}
          width={width}
          chipSize={chipSize}
          cropSide={cropSide}
          total={pinned.length}
          scrollBlock={sb}
          alters={alters.filter((a) => !a.is_archived)}
          pinnedIds={new Set(pinned.map((a) => a.id))}
          onSetPinned={setPinnedAlter}
          onWidthChange={(w) => persistConfig({ width: w })}
          onChipSizeChange={(v) => persistConfig({ chipSize: v })}
          onCropSideChange={(s) => persistConfig({ cropSide: s })}
          onScrollBlockChange={(next) => persistConfig({ scrollBlock: next })}
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

// A "scroll block" — a dead-zone grab bar inside the pinned strip.
//
// PURPOSE: the chips capture VERTICAL swipes (to front/remove), which hijacks
// the gesture when you just want to scroll the whole PAGE up/down past the
// pinned row. This bar is a safe spot for that: it has NO swipe handlers, and
// touchAction:"auto" lets a touch here scroll the page vertically (and the row
// horizontally) — but it can never front anyone.
//
// It renders the same either way (a flex item). In "inline" mode it sits among
// the chips and scrolls with them; in "fixed" mode the gallery places it in a
// reserved side gutter (a flex sibling of the scroll area), so chips scroll
// BESIDE it rather than behind it.
function ScrollBlockBar({ width }) {
  return (
    <div
      aria-hidden="true"
      title="Grab here to scroll the page without changing who's fronting"
      className="flex-shrink-0 self-center rounded-2xl border border-dashed border-border/60 flex flex-col items-center justify-center gap-0.5 select-none bg-muted/50"
      style={{ width: `${width}px`, height: 52, touchAction: "auto" }}
    >
      <GripVertical className="w-5 h-5 text-muted-foreground/70" />
      <span className="text-[0.5rem] uppercase tracking-wider text-muted-foreground/60">scroll</span>
    </div>
  );
}

// One searchable row in the "Add alters" picker — its own component so the
// avatar can resolve via the hook (can't call hooks in a map).
function PinPickerRow({ alter, pinned, onToggle }) {
  const avatar = useResolvedAvatarUrl(alter.avatar_url);
  return (
    <button
      type="button"
      onClick={() => onToggle(alter.id, !pinned)}
      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl border text-left transition-colors ${pinned ? "border-primary/50 bg-primary/5" : "border-border/50 hover:bg-muted/30"}`}
    >
      <div
        className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0"
        style={{ border: `2px solid ${alter.color || "hsl(var(--border))"}`, backgroundColor: alter.color ? `${alter.color}22` : "hsl(var(--muted))" }}
      >
        {avatar ? (
          <img src={avatar} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-xs font-semibold text-foreground">{(alter.name || "?").charAt(0).toUpperCase()}</span>
        )}
      </div>
      <span className="flex-1 min-w-0 text-sm truncate">{alter.name}</span>
      <Pin className={`w-4 h-4 flex-shrink-0 ${pinned ? "fill-primary text-primary" : "text-muted-foreground"}`} />
    </button>
  );
}

function PinnedAltersSettingsDialog({ open, onClose, width, chipSize = 48, onChipSizeChange, cropSide, total, scrollBlock, alters = [], pinnedIds, onSetPinned, onWidthChange, onCropSideChange, onScrollBlockChange, onRearrange }) {
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const pinnedSet = pinnedIds instanceof Set ? pinnedIds : new Set();
  const candidates = alters
    .filter((a) => (a.name || "").toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const pa = pinnedSet.has(a.id) ? 0 : 1;
      const pb = pinnedSet.has(b.id) ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return (a.name || "").localeCompare(b.name || "");
    });
  const sb = scrollBlock || {};
  const sbEnabled = !!sb.enabled;
  const sbWidth = Number.isFinite(sb.width) ? sb.width : 56;
  const sbPos = Math.max(0, Math.min(total, Number.isFinite(sb.position) ? sb.position : Math.floor(total / 2)));
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
            <Button variant="outline" onClick={() => setShowAdd((v) => !v)} className="w-full gap-2">
              <Plus className="w-4 h-4" /> Add or remove pins
            </Button>
            {showAdd && (
              <div className="mt-2 space-y-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search…"
                    className="w-full pl-8 pr-2 py-1.5 text-sm rounded-lg border border-border bg-background"
                  />
                </div>
                <div className="max-h-56 overflow-y-auto space-y-1 overscroll-contain">
                  {candidates.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-3">No matches.</p>
                  ) : (
                    candidates.map((a) => (
                      <PinPickerRow key={a.id} alter={a} pinned={pinnedSet.has(a.id)} onToggle={onSetPinned} />
                    ))
                  )}
                </div>
                <p className="text-[0.6875rem] text-muted-foreground">Tap to pin or unpin. Pinned ones show at the top.</p>
              </div>
            )}
          </div>

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

          {/* Height: the strip is as tall as its avatars, so this is the
              control for "the bar is massive". */}
          <div>
            <label className="text-sm font-medium flex items-center justify-between">
              Size <span className="text-xs text-muted-foreground">{chipSize}px tall</span>
            </label>
            <input
              type="range" min={28} max={88} step={4} value={chipSize}
              onChange={(e) => onChipSizeChange?.(Number(e.target.value))}
              className="w-full accent-primary mt-1"
              aria-label="Pinned bar size"
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

          <div className="pt-1 border-t border-border/40">
            <label className="flex items-center justify-between gap-2 text-sm font-medium pt-3">
              <span className="flex items-center gap-1.5"><GripHorizontal className="w-4 h-4" /> Scroll block</span>
              <Switch checked={sbEnabled} onCheckedChange={(v) => onScrollBlockChange({ ...sb, enabled: v })} />
            </label>
            <p className="text-[0.6875rem] text-muted-foreground mt-1">A safe zone you can grab to scroll the page up/down past the pinned row without accidentally fronting anyone. Drop it wherever you usually scroll.</p>
            {sbEnabled && (
              <div className="mt-3 space-y-3">
                <div>
                  <label className="text-xs flex items-center justify-between">Position <span className="text-muted-foreground">{sbPos === 0 ? "far left" : sbPos >= total ? "far right" : `after pin #${sbPos}`}</span></label>
                  <input type="range" min={0} max={total} step={1} value={sbPos} onChange={(e) => onScrollBlockChange({ ...sb, enabled: true, position: Number(e.target.value) })} className="w-full accent-primary mt-1" />
                  <p className="text-[0.6875rem] text-muted-foreground mt-1">Slide it anywhere across the row — your pins move to either side of it, never hidden.</p>
                </div>
                <div>
                  <label className="text-xs flex items-center justify-between">Bar width <span className="text-muted-foreground">{sbWidth}px</span></label>
                  <input type="range" min={32} max={140} step={4} value={sbWidth} onChange={(e) => onScrollBlockChange({ ...sb, enabled: true, width: Number(e.target.value) })} className="w-full accent-primary mt-1" />
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Vertical swipe handler — mirrors useSwipeActions' structure (drag
// offset + hint + tap suppression) but on the Y axis, so it coexists
// with the gallery's horizontal scroll.
const LONG_PRESS_MS = 450;


// `size` is the base avatar diameter in px (config.chipSize). Fronting
// chips render 4/3 of it, keeping the old 48/64 look at the default.
function PinnedAlterChip({ alter, activeSessions, anonymize, formatAlter, queryClient, size = 48 }) {
  const navigate = useNavigate();
  const terms = useTerms();
  const resolvedAvatar = useResolvedAvatarUrl(alter.avatar_url);
  const mySession = activeSessions.find((s) => s.alter_id === alter.id);
  const fronting = !!mySession;
  const isPrimary = mySession?.is_primary ?? false;
  const blurNames = anonymizeBlurNames(anonymize);
  const blurAvatar = anonymizeBlurAvatars(anonymize);
  const label = formatAlter(alter);

  // The standard gesture grammar (v0.122.0): tap = profile, press-and-hold
  // = the level rail (Remove stop; holding a non-fronter adds them at the
  // level released on). The vertical swipes and the long-press menu are
  // gone — menu actions live on the profile page.
  const gesture = useFrontGesture();

  const ringColor = fronting
    ? (isPrimary ? "#f59e0b" : (alter.color || "#8b5cf6"))
    : (alter.color || "hsl(var(--border))");

  return (
    <>
    {gesture.node}
    <button
      type="button"
      {...gesture.getHoldProps(alter, mySession?.front_level)}
      onClick={() => { if (!gesture.suppressed()) navigate(`/alter/${alter.id}`); }}
      title={`${label} — tap to open, press and hold to set their ${terms.fronting} level or remove from ${terms.front}`}
      className="relative flex flex-col items-center gap-1 flex-shrink-0 select-none"
      style={{ width: Math.round(size * 4 / 3) }}
    >
      <div
        className="relative rounded-full overflow-hidden flex items-center justify-center flex-shrink-0"
        style={{
          width: fronting ? Math.round(size * 4 / 3) : size,
          height: fronting ? Math.round(size * 4 / 3) : size,
          // Fronting alters render LARGER (like the alters grid) rather
          // than with a glow — clearer at-a-glance "who's active" and
          // less visual noise. A coloured border still tints them.
          border: `2px solid ${fronting ? ringColor : "hsl(var(--border))"}`,
          backgroundColor: alter.color ? `${alter.color}22` : "hsl(var(--muted))",
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
    </>
  );
}
