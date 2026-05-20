import React, { useState, useMemo } from "react";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, User, Star, X, List, Grid3x3, ArrowDownAZ, ArrowUpAZ, TrendingDown, TrendingUp, Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useTerms } from "@/lib/useTerms";
import useSwipeActions from "@/hooks/useSwipeActions";

// Shared fronter picker UI extracted from SetFrontModal so other
// surfaces (Get to know me, etc.) can drop in the exact same picker
// — chips with primary stars, search + sort + view toggle, and a
// list/grid view of alters with the swipe-to-toggle gestures.
//
// State is fully controlled from the outside (primaryId,
// coFronterIds, onToggle, onSetPrimary) so the caller can decide
// whether toggling an alter should also mutate FrontingSession (as
// SetFrontModal does on Save) or be purely local (as Get to know me
// does when "Sync to current front" is off).

function getContrastColor(hex) {
  if (!hex) return "hsl(var(--muted-foreground))";
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#1a1a2e" : "#ffffff";
}

function GridCard({ alter, selected, isPrimary, onToggle, onSetPrimary }) {
  const alterColor = alter.color || "#9333ea";
  const resolvedUrl = useResolvedAvatarUrl(alter.avatar_url);
  const [imgError, setImgError] = useState(false);
  const { bind, dragX, swipeHint } = useSwipeActions({
    onTap: () => onToggle(),
    onSwipeRight: () => onToggle(),
    onSwipeLeft: () => onSetPrimary(),
    onLongPress: () => onSetPrimary(),
  });

  const boxShadow = selected
    ? isPrimary
      ? `inset 0 0 0 3px #fbbf24, inset 0 0 0 5px ${alterColor}, 0 0 0 1px ${alterColor}, 0 0 24px ${alterColor}ff`
      : `inset 0 0 0 3px ${alterColor}, 0 0 0 1px ${alterColor}, 0 0 20px ${alterColor}ff`
    : `inset 0 0 0 2px ${alterColor}80`;

  return (
    <div className="flex flex-col items-center gap-2 select-none">
      <div
        className="relative"
        {...bind}
        style={{
          transform: `translateX(${dragX}px)`,
          transition: dragX === 0 ? "transform 150ms ease-out" : "none",
          touchAction: "pan-y",
        }}
      >
        {resolvedUrl && !imgError ? (
          <img
            src={resolvedUrl}
            alt={alter.name}
            style={{ boxShadow }}
            className={`rounded-full object-cover transition-all cursor-pointer ${selected ? "w-20 h-20" : "w-16 h-16"}`}
            draggable={false}
            onError={() => setImgError(true)}
          />
        ) : (
          <div
            style={{ backgroundColor: selected ? `${alterColor}30` : "hsl(var(--muted))", boxShadow }}
            className={`rounded-full flex items-center justify-center transition-all cursor-pointer ${selected ? "w-20 h-20" : "w-16 h-16"}`}
          >
            <span className="text-xs font-semibold text-muted-foreground">{alter.name.slice(0, 2)}</span>
          </div>
        )}
      </div>
      {swipeHint ? (
        <span className={`text-[0.625rem] font-semibold uppercase tracking-wide ${swipeHint === "front" ? "text-emerald-500" : "text-amber-500"}`}>
          {swipeHint === "front" ? (selected ? "Deselect" : "Select") : (isPrimary ? "Demote" : "Primary")}
        </span>
      ) : (
        <span className="text-xs text-center font-medium truncate w-full px-1">
          {alter.alias?.slice(0, 7) || alter.name.slice(0, 7)}
        </span>
      )}
    </div>
  );
}

function AlterPill({ alter, selected, isPrimary, onToggle, onSetPrimary }) {
  const bg = alter.color || null;
  const text = bg ? getContrastColor(bg) : null;
  const resolvedUrl = useResolvedAvatarUrl(alter.avatar_url);
  const [imgError, setImgError] = useState(false);

  const { bind, dragX, swipeHint } = useSwipeActions({
    onTap: () => onToggle(),
    onSwipeRight: () => onToggle(),
    onSwipeLeft: () => onSetPrimary(),
    onLongPress: () => onSetPrimary(),
  });

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${selected ? "Deselect" : "Select"} ${alter.name}. Swipe left or long-press to toggle primary.`}
      aria-pressed={selected}
      {...bind}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " " ? onToggle() : undefined)}
      style={{
        transform: `translateX(${dragX}px)`,
        transition: dragX === 0 ? "transform 150ms ease-out" : "none",
        touchAction: "pan-y",
      }}
      className={`relative flex items-center gap-2 px-3 py-2.5 rounded-xl border cursor-pointer transition-all select-none ${
        selected ? "border-primary/60 bg-primary/5" : "border-border/50 bg-card hover:bg-muted/30"
      }`}
    >
      {swipeHint && (
        <span
          className={`absolute top-1 right-2 text-[0.5625rem] font-semibold uppercase tracking-wide pointer-events-none ${
            swipeHint === "front" ? "text-emerald-500" : "text-amber-500"
          }`}
        >
          {swipeHint === "front" ? (selected ? "Deselect" : "Select") : isPrimary ? "Demote" : "Primary"}
        </span>
      )}

      <div
        className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden border border-border/30"
        style={{ backgroundColor: bg || "hsl(var(--muted))" }}
      >
        {resolvedUrl && !imgError ? (
          <img src={resolvedUrl} alt={alter.name} className="w-full h-full object-cover" onError={() => setImgError(true)} />
        ) : (
          <User className="w-4 h-4" style={{ color: text || "hsl(var(--muted-foreground))" }} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{alter.name}</p>
        {alter.pronouns && <p className="text-xs text-muted-foreground truncate">{alter.pronouns}</p>}
      </div>
      {selected && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSetPrimary();
          }}
          aria-label={isPrimary ? `${alter.name} is primary — click to demote` : `Set ${alter.name} as primary`}
          className={`p-1 rounded-md transition-colors ${isPrimary ? "text-amber-500" : "text-muted-foreground hover:text-amber-400"}`}
        >
          <Star className={`w-4 h-4 ${isPrimary ? "fill-amber-500" : ""}`} />
        </button>
      )}
    </div>
  );
}

function SelectedChip({ alter, isPrimary, onSetPrimary, onRemove }) {
  const { bind, dragX, swipeHint } = useSwipeActions({
    onTap: () => onSetPrimary(),
    onSwipeRight: () => onRemove(),
    onSwipeLeft: () => onSetPrimary(),
    onLongPress: () => onSetPrimary(),
  });
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={`${alter.name}. Tap or long-press to toggle primary, swipe right to remove.`}
      {...bind}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " " ? onSetPrimary() : undefined)}
      style={{
        transform: `translateX(${dragX}px)`,
        transition: dragX === 0 ? "transform 150ms ease-out" : "none",
        touchAction: "pan-y",
        backgroundColor: alter.color ? `${alter.color}20` : undefined,
        borderColor: alter.color || undefined,
      }}
      className="relative px-3 py-1 text-xs font-medium rounded-full inline-flex items-center gap-1 border select-none cursor-pointer"
    >
      {swipeHint && (
        <span
          className={`absolute -top-4 left-1/2 -translate-x-1/2 text-[0.5625rem] font-semibold uppercase tracking-wide pointer-events-none whitespace-nowrap ${
            swipeHint === "front" ? "text-emerald-500" : "text-amber-500"
          }`}
        >
          {swipeHint === "front" ? "Remove" : isPrimary ? "Demote" : "Primary"}
        </span>
      )}
      {isPrimary && <Star className="w-3 h-3 text-amber-500 fill-amber-500" />}
      <span className="text-sm">{alter.name}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label={`Remove ${alter.name}`}
        className="ml-0.5 text-muted-foreground hover:text-destructive transition-colors"
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}

export { AlterPill, GridCard as SetFrontGridCard, SelectedChip };

export default function FronterPicker({
  alters,
  primaryId,
  coFronterIds,
  onToggle,
  onSetPrimary,
  onClearAll,
  showHints = true,
  showChips = true,
  emptyHint = null,
  enabled = true,
}) {
  const terms = useTerms();
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState("list");
  const [sortBy, setSortBy] = useState("alpha-asc");

  const { data: allSessions = [] } = useQuery({
    queryKey: ["frontSessionsAll"],
    queryFn: () => base44.entities.FrontingSession.filter({}),
    enabled: enabled && (sortBy === "most" || sortBy === "least"),
    staleTime: 60000,
  });

  const alterFrontTotals = useMemo(() => {
    if (sortBy === "alpha-asc" || sortBy === "alpha-desc") return {};
    const totals = {};
    for (const s of allSessions) {
      const dur = s.end_time && s.start_time ? new Date(s.end_time) - new Date(s.start_time) : 0;
      if (s.alter_id) {
        totals[s.alter_id] = (totals[s.alter_id] || 0) + dur;
      } else {
        if (s.primary_alter_id) totals[s.primary_alter_id] = (totals[s.primary_alter_id] || 0) + dur;
        for (const id of s.co_fronter_ids || []) totals[id] = (totals[id] || 0) + dur;
      }
    }
    return totals;
  }, [allSessions, sortBy]);

  const activeAlters = useMemo(() => (alters || []).filter((a) => !a.is_archived), [alters]);
  const filtered = useMemo(() => {
    const list = activeAlters.filter((a) => a.name?.toLowerCase().includes(search.toLowerCase()));
    const rank = (a) => (a.id === primaryId ? 0 : coFronterIds.includes(a.id) ? 1 : 2);
    return [...list].sort((a, b) => {
      const ra = rank(a), rb = rank(b);
      if (ra !== rb) return ra - rb;
      if (sortBy === "most") return (alterFrontTotals[b.id] || 0) - (alterFrontTotals[a.id] || 0);
      if (sortBy === "least") return (alterFrontTotals[a.id] || 0) - (alterFrontTotals[b.id] || 0);
      const cmp = (a.name || "").localeCompare(b.name || "");
      return sortBy === "alpha-desc" ? -cmp : cmp;
    });
  }, [activeAlters, search, sortBy, alterFrontTotals, primaryId, coFronterIds]);

  const selectedIds = useMemo(() => {
    const ids = new Set(coFronterIds);
    if (primaryId) ids.add(primaryId);
    return ids;
  }, [primaryId, coFronterIds]);

  if (activeAlters.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">
        {emptyHint || `No ${terms.alters || "alters"} yet — add some to start.`}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {showChips && selectedIds.size > 0 && (
        <div className="bg-muted/30 rounded-lg p-3 border border-border/50">
          <div className="flex flex-wrap gap-2 max-h-[150px] overflow-y-auto">
            {[...selectedIds].map((id) => {
              const a = (alters || []).find((x) => x.id === id);
              if (!a) return null;
              return (
                <SelectedChip
                  key={id}
                  alter={a}
                  isPrimary={id === primaryId}
                  onSetPrimary={() => onSetPrimary(id)}
                  onRemove={() => onToggle(id)}
                />
              );
            })}
          </div>
        </div>
      )}

      {showHints && (
        <div className="text-xs text-muted-foreground space-y-1">
          <p>
            Tap to select · hold to set primary · <Star className="inline w-3 h-3 text-amber-500 fill-amber-500" /> = Primary {terms.alter || "alter"}
          </p>
          <p>💡 On mobile: swipe right to toggle, swipe left to set primary</p>
          {selectedIds.size > 0 && <p className="text-primary">Tap primary name to make them co-{terms.front || "front"} only</p>}
        </div>
      )}

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={`Search ${terms.alters || "alters"}...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <button
          onClick={() => setSortBy((s) => ({ "alpha-asc": "alpha-desc", "alpha-desc": "most", most: "least", least: "alpha-asc" }[s]))}
          title={
            {
              "alpha-asc": "A → Z",
              "alpha-desc": "Z → A",
              most: `Most ${terms.fronting || "fronting"} time first`,
              least: `Least ${terms.fronting || "fronting"} time first`,
            }[sortBy]
          }
          className={`p-2 rounded-md border transition-colors flex-shrink-0 ${
            sortBy !== "alpha-asc" ? "bg-primary/10 text-primary border-primary/30" : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          {sortBy === "alpha-asc" && <ArrowDownAZ className="w-4 h-4" />}
          {sortBy === "alpha-desc" && <ArrowUpAZ className="w-4 h-4" />}
          {sortBy === "most" && <TrendingDown className="w-4 h-4" />}
          {sortBy === "least" && <TrendingUp className="w-4 h-4" />}
        </button>
        <div className="flex gap-1 bg-muted/50 rounded-md p-1" role="group" aria-label="View mode">
          <button
            onClick={() => setViewMode("list")}
            className={`p-2 rounded transition-colors ${viewMode === "list" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}
            aria-label="List view"
            aria-pressed={viewMode === "list"}
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode("grid")}
            className={`p-2 rounded transition-colors ${viewMode === "grid" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}
            aria-label="Grid view"
            aria-pressed={viewMode === "grid"}
          >
            <Grid3x3 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="max-h-[60vh] overflow-y-auto">
        {viewMode === "list" ? (
          <div className="space-y-1.5">
            {filtered.map((a) => (
              <AlterPill
                key={a.id}
                alter={a}
                selected={selectedIds.has(a.id)}
                isPrimary={primaryId === a.id}
                onToggle={() => onToggle(a.id)}
                onSetPrimary={() => onSetPrimary(a.id)}
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {filtered.map((a) => (
              <GridCard
                key={a.id}
                alter={a}
                selected={selectedIds.has(a.id)}
                isPrimary={primaryId === a.id}
                onToggle={() => onToggle(a.id)}
                onSetPrimary={() => onSetPrimary(a.id)}
              />
            ))}
          </div>
        )}
      </div>

      {onClearAll && selectedIds.size > 0 && (
        <Button variant="outline" size="sm" onClick={onClearAll} className="gap-1.5">
          <Trash2 className="w-3.5 h-3.5" /> Clear all
        </Button>
      )}
    </div>
  );
}
