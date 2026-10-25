import React, { useState, useMemo, useEffect } from "react";
import AlterLabelToggle from "@/components/shared/AlterLabelToggle";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useFrontLevels, frontLevelLabel } from "@/lib/frontLevels";
import SearchableSelect from "@/components/shared/SearchableSelect";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, User, Star, X, List, Grid3x3, FolderTree, Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import AlterTreeSelect from "@/components/shared/AlterTreeSelect";
import PresencePicker from "@/components/presences/PresencePicker";
import { useTerms } from "@/lib/useTerms";
import useSwipeActions from "@/hooks/useSwipeActions";
import { getAlterIdsByGroupFlag } from "@/lib/subsystemUtils";
import { useAlterSorter } from "@/lib/alterSort";
import AlterSortToggle from "@/components/shared/AlterSortToggle";

function getContrastColor(hex) {
  if (!hex) return "hsl(var(--muted-foreground))";
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#1a1a2e" : "#ffffff";
}

// Grid-view card for the modal. Same gesture model as the alters page grid
// (AlterGridView): tap = toggle selection, swipe right = toggle selection,
// swipe left = toggle primary. The visual is also avatar-centric so the
// modal's grid feels identical to the rest of the app.
export function SetFrontGridCard({ alter, selected, isPrimary, onToggle, onSetPrimary, onSolePrimary, holdProps = null }) {
  const alterColor = alter.color || "#9333ea";
  const resolvedUrl = useResolvedAvatarUrl(alter.avatar_url);
  const [imgErrorFor, setImgError] = useState(null);
  const imgError = !!imgErrorFor && imgErrorFor === resolvedUrl;
  const formatAlter = useAlterLabel();
  // The standard gesture (v0.122.0): tap toggles, press-and-hold opens the
  // level spectrum — supplied by the caller as holdProps. The swipe set
  // below only remains for legacy callers that don't pass them.
  const swipe = useSwipeActions({
    onTap: () => onToggle(),
    onSwipeRight: () => onToggle(),
    onSwipeLeft: () => onSetPrimary(),
    onSwipeLeftUp: () => onSolePrimary(),
    onLongPress: () => onSetPrimary(),
  });
  const bind = holdProps
    ? { ...holdProps, onClick: () => onToggle() }
    : swipe.bind;
  const dragX = holdProps ? 0 : swipe.dragX;
  const swipeHint = holdProps ? null : swipe.swipeHint;

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
            onError={() => setImgError(resolvedUrl)}
          />
        ) : (
          <div
            style={{ backgroundColor: selected ? `${alterColor}30` : "hsl(var(--muted))", boxShadow }}
            className={`rounded-full flex items-center justify-center transition-all cursor-pointer ${selected ? "w-20 h-20" : "w-16 h-16"}`}
          >
            <span className="text-xs font-semibold text-muted-foreground">{(formatAlter(alter) || alter.name || "?").slice(0, 2)}</span>
          </div>
        )}
      </div>
      {swipeHint ? (
        <span className={`text-[0.625rem] font-semibold uppercase tracking-wide ${swipeHint === "front" ? "text-emerald-500" : swipeHint === "solo" ? "text-primary" : "text-amber-500"}`}>
          {swipeHint === "front" ? (selected ? "Deselect" : "Select") : swipeHint === "solo" ? "Solo" : (isPrimary ? "Demote" : "Primary")}
        </span>
      ) : (
        <span
          title={formatAlter(alter)}
          className="text-xs text-center font-medium truncate w-full px-1"
        >
          {formatAlter(alter)}
        </span>
      )}
    </div>
  );
}

function AlterPill({ alter, selected, isPrimary, onToggle, onSetPrimary, onSolePrimary }) {
  const bg = alter.color || null;
  const text = bg ? getContrastColor(bg) : null;
  const resolvedUrl = useResolvedAvatarUrl(alter.avatar_url);
  const [imgErrorFor, setImgError] = useState(null);
  const imgError = !!imgErrorFor && imgErrorFor === resolvedUrl;
  const formatAlter = useAlterLabel();

  // Same gesture model as the alters page list / grid:
  //   tap          → toggle selection (the modal's primary action)
  //   swipe right  → toggle selection (mirror, for muscle memory)
  //   swipe left   → toggle primary (only meaningful while selected)
  //   long-press   → toggle primary (kept for accessibility / mouse parity)
  const { bind, dragX, swipeHint } = useSwipeActions({
    onTap: () => onToggle(),
    onSwipeRight: () => onToggle(),
    onSwipeLeft: () => onSetPrimary(),
    onSwipeLeftUp: () => onSolePrimary(),
    onLongPress: () => onSetPrimary(),
  });

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${selected ? "Deselect" : "Select"} ${alter.name}. Swipe left or long-press to toggle primary. Swipe left then up to make them the sole front.`}
      aria-pressed={selected}
      {...bind}
      onKeyDown={e => e.key === "Enter" || e.key === " " ? onToggle() : undefined}
      style={{
        transform: `translateX(${dragX}px)`,
        transition: dragX === 0 ? "transform 150ms ease-out" : "none",
        touchAction: "pan-y",
      }}
      className={`relative flex items-center gap-2 px-3 py-2.5 rounded-xl border cursor-pointer transition-all select-none ${
      selected ?
      "border-primary/60 bg-primary/5" :
      "border-border/50 bg-card hover:bg-muted/30"}`
      }>
      {swipeHint && (
        <span className={`absolute top-1 right-2 text-[0.5625rem] font-semibold uppercase tracking-wide pointer-events-none ${swipeHint === "front" ? "text-emerald-500" : swipeHint === "solo" ? "text-primary" : "text-amber-500"}`}>
          {swipeHint === "front" ? (selected ? "Deselect" : "Select") : swipeHint === "solo" ? "Solo" : (isPrimary ? "Demote" : "Primary")}
        </span>
      )}

      <div
        className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden border border-border/30"
        style={{ backgroundColor: bg || "hsl(var(--muted))" }}>

        {resolvedUrl && !imgError ?
        <img src={resolvedUrl} alt={alter.name} className="w-full h-full object-cover" onError={() => setImgError(resolvedUrl)} /> :

        <User className="w-4 h-4" style={{ color: text || "hsl(var(--muted-foreground))" }} />
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{formatAlter(alter)}</p>
        {alter.pronouns && <p className="text-xs text-muted-foreground truncate">{alter.pronouns}</p>}
      </div>
      {selected &&
      <button
        onClick={(e) => {e.stopPropagation();onSetPrimary();}}
        aria-label={isPrimary ? `${alter.name} is primary — click to demote` : `Set ${alter.name} as primary`}
        className={`p-1 rounded-md transition-colors ${isPrimary ? "text-amber-500" : "text-muted-foreground hover:text-amber-400"}`}>
          <Star className={`w-4 h-4 ${isPrimary ? "fill-amber-500" : ""}`} />
        </button>
      }
    </div>);
}

// Selected-alter chip shown at the top of the modal. Mirrors the gesture
// model from the dashboard's CurrentFronters widget and the list rows
// (AlterPill) below — so the muscle memory carries over.
//   tap          → toggle primary (existing behaviour)
//   swipe right  → deselect / remove from the chip row
//   swipe left   → toggle primary
//   long-press   → toggle primary
function SelectedChip({ alter, isPrimary, onSetPrimary, onRemove, onSolePrimary }) {
  const formatAlter = useAlterLabel();
  const { bind, dragX, swipeHint } = useSwipeActions({
    onTap: () => onSetPrimary(),
    onSwipeRight: () => onRemove(),
    onSwipeLeft: () => onSetPrimary(),
    onSwipeLeftUp: () => onSolePrimary(),
    onLongPress: () => onSetPrimary(),
  });
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={`${alter.name}. Tap or long-press to toggle primary, swipe right to remove.`}
      {...bind}
      onKeyDown={e => e.key === "Enter" || e.key === " " ? onSetPrimary() : undefined}
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
        <span className={`absolute -top-4 left-1/2 -translate-x-1/2 text-[0.5625rem] font-semibold uppercase tracking-wide pointer-events-none whitespace-nowrap ${swipeHint === "front" ? "text-emerald-500" : swipeHint === "solo" ? "text-primary" : "text-amber-500"}`}>
          {swipeHint === "front" ? "Remove" : swipeHint === "solo" ? "Solo" : (isPrimary ? "Demote" : "Primary")}
        </span>
      )}
      {isPrimary && <Star className="w-3 h-3 text-amber-500 fill-amber-500" />}
      <span className="text-sm">{formatAlter(alter)}</span>
      <button
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); onRemove(); }}
        onPointerDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); onRemove(); }}
        onTouchMove={(e) => e.stopPropagation()}
        aria-label={`Remove ${alter.name}`}
        className="ml-0.5 -mr-1 p-1 rounded-full text-muted-foreground hover:text-destructive transition-colors"
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}

// The searchable alter picker (list / grid / by-subsystem tree) that hands
// the chosen ids back to the caller. It never writes a fronting session:
// setting who's in front is SetFrontSheet's job (v0.279.7 retired this
// modal's own set-front path, roadmap step 3). Used by the meeting's
// "notice who's near" and the timeline's retroactive "who was fronting".
//   onConfirm(ids)                         — the chosen alter ids
//   withLevels → onConfirm(ids, { levels }) — plus a level per alter
//   allowPresenceTab                       — adds the New presence tab
//   selectionTitle / selectionHint / confirmLabel — the wording
// `selectionMode` is still accepted (every caller passes it) and ignored.
export default function SetFrontModal({ open, onClose, alters: altersProp, onConfirm, preselectedIds, confirmLabel, allowPresenceTab = false, withLevels = false, preselectedLevels = null, selectionTitle = null, selectionHint = null }) {
  const terms = useTerms();

  // Always fetch alters internally so the modal is never dependent on caller passing fresh data
  const { data: fetchedAlters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
    enabled: open,
  });
  const { data: groups = [] } = useQuery({
    queryKey: ["groups"],
    queryFn: () => base44.entities.Group.list(),
    enabled: open,
  });
  // Group config: members of a group flagged "hide_from_set_front" are kept
  // out of this picker.
  const alters = useMemo(() => {
    const base = altersProp?.length ? altersProp : fetchedAlters;
    const hidden = getAlterIdsByGroupFlag(groups, base, "hide_from_set_front");
    return hidden.size ? base.filter((a) => !hidden.has(a.id)) : base;
  }, [altersProp, fetchedAlters, groups]);
  const [search, setSearch] = useState("");
  const [chosenIds, setChosenIds] = useState(() => (Array.isArray(preselectedIds) ? preselectedIds.filter(Boolean) : []));
  // Remembered across sessions — reopening should look how you left it,
  // not reset to the list view (owner request, same as the sort choice).
  const [viewMode, setViewModeState] = useState(() => {
    try { return localStorage.getItem("setFrontModal_view") || "list"; } catch { return "list"; }
  });
  const setViewMode = (v) => {
    setViewModeState(v);
    try { localStorage.setItem("setFrontModal_view", v); } catch { /* storage off */ }
  };
  // "fronters" | "presence" (record a sensed-but-not-yet-identified
  // fragment, only when the caller allows it).
  const [tab, setTab] = useState("fronters");
  const formatAlter = useAlterLabel();
  const [pendingLevels, setPendingLevels] = useState({});
  const levelCfg = useFrontLevels();

  // (Re)seed from the caller's preselection every time the picker opens.
  useEffect(() => {
    if (!open) return;
    setTab("fronters");
    setChosenIds(Array.isArray(preselectedIds) ? preselectedIds.filter(Boolean) : []);
    setPendingLevels(preselectedLevels ? { ...preselectedLevels } : {});
  }, [open]);

  const selectedIds = useMemo(() => new Set(chosenIds), [chosenIds]);
  // Already-chosen alters lead; the shared sort vocabulary orders the rest.
  const sorter = useAlterSorter("setFrontModal_sort", { frontingIds: selectedIds });

  const { data: allSessions = [] } = useQuery({
    queryKey: ["frontSessionsAll"],
    queryFn: () => base44.entities.FrontingSession.filter({}),
    enabled: open && (sorter.mode === "most" || sorter.mode === "least"),
    staleTime: 60000,
  });
  const alterFrontTotals = useMemo(() => {
    if (sorter.mode !== "most" && sorter.mode !== "least") return {};
    const totals = {};
    for (const s of allSessions) {
      const dur = s.end_time && s.start_time
        ? new Date(s.end_time) - new Date(s.start_time)
        : 0;
      if (s.alter_id) {
        totals[s.alter_id] = (totals[s.alter_id] || 0) + dur;
      } else {
        if (s.primary_alter_id) totals[s.primary_alter_id] = (totals[s.primary_alter_id] || 0) + dur;
        for (const id of (s.co_fronter_ids || [])) {
          totals[id] = (totals[id] || 0) + dur;
        }
      }
    }
    return totals;
  }, [allSessions, sorter.mode]);

  const activeAlters = useMemo(() => (alters || []).filter((a) => !a.is_archived), [alters]);
  const filtered = useMemo(() => {
    const list = activeAlters.filter((a) => a.name?.toLowerCase().includes(search.toLowerCase()));
    return sorter.sort(list, alterFrontTotals);
  }, [activeAlters, search, sorter, alterFrontTotals]);

  // A flat multi-select: every gesture (tap, hold, swipe) toggles, and
  // "make sole" picks only this one.
  const toggleAlter = (id) => setChosenIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const chooseOnly = (id) => setChosenIds([id]);
  const setManyFronters = (arr, on) => {
    const ids = arr.map((a) => a.id);
    if (!ids.length) return;
    setChosenIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) { if (on) next.add(id); else next.delete(id); }
      return [...next];
    });
  };

  const handleConfirm = () => {
    const ids = [...chosenIds];
    if (withLevels) {
      const levels = Object.fromEntries(ids.map((id) => [id, pendingLevels[id] ?? levelCfg.levels[0]?.id]));
      onConfirm?.(ids, { levels });
    } else {
      onConfirm?.(ids);
    }
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        // Outer scroll + bounded list, not a rigid flex column — on
        // landscape phones the flex-1 list collapsed to zero height and
        // the footer clipped with no way to scroll.
        className="max-w-md flex flex-col overflow-y-auto overscroll-contain"
        style={{
          // Keep the modal inside the safe viewport (status bar / home bar).
          maxHeight: "calc(100dvh - env(safe-area-inset-top, 0px) - var(--os-sab) - 2rem)",
        }}
      >
        <DialogHeader>
          {/* Right-pad past the 44x44 close X so the label toggle isn't under it. */}
          <div className="flex items-center justify-between gap-2 pr-14">
            <DialogTitle>{selectionTitle || `Notice who's near`}</DialogTitle>
            <AlterLabelToggle size="xs" />
          </div>
        </DialogHeader>

        {allowPresenceTab && (
          <div className="flex gap-1 bg-muted/50 rounded-lg p-1 mb-1" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "fronters"}
              onClick={() => setTab("fronters")}
              className={`flex-1 text-sm py-1.5 rounded-md transition-colors ${tab === "fronters" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
            >
              {terms.Alters}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "presence"}
              onClick={() => setTab("presence")}
              className={`flex-1 text-sm py-1.5 rounded-md transition-colors ${tab === "presence" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
            >
              New presence
            </button>
          </div>
        )}

        {tab === "presence" && allowPresenceTab ? (
          <PresencePicker onClose={onClose} />
        ) : (
        <>
        {selectedIds.size > 0 && (
          <div className="bg-muted/30 rounded-lg p-3 mb-2 border border-border/50">
            <div className="flex flex-wrap gap-2 max-h-[150px] overflow-y-auto">
              {chosenIds.map((id) => {
                const a = (alters || []).find((x) => x.id === id);
                if (!a) return null;
                return (
                  <SelectedChip
                    key={id}
                    alter={a}
                    isPrimary={false}
                    onSetPrimary={() => toggleAlter(id)}
                    onSolePrimary={() => chooseOnly(id)}
                    onRemove={() => toggleAlter(id)}
                  />
                );
              })}
            </div>
            {/* Levels (opt-in): picking for the past, so default to the top level. */}
            {withLevels && levelCfg.enabled && (
              <div className="mt-2 pt-2 border-t border-border/40 space-y-1.5">
                <p className="text-[0.6875rem] text-muted-foreground uppercase tracking-wide">{terms.Front} levels</p>
                {chosenIds.map((id) => {
                  const a = (alters || []).find((x) => x.id === id);
                  if (!a) return null;
                  const value = pendingLevels[id] ?? levelCfg.levels[0]?.id;
                  return (
                    <div key={id} className="flex items-center gap-2">
                      <span className="text-xs truncate flex-1 min-w-0">{formatAlter(a)}</span>
                      <div className="w-[55%] flex-shrink-0">
                        <SearchableSelect
                          value={value}
                          onChange={(v) => { if (v) setPendingLevels((prev) => ({ ...prev, [id]: v })); }}
                          options={levelCfg.levels.map((l) => ({ id: l.id, label: frontLevelLabel(l, terms) }))}
                          placeholder={`${terms.Front} level`}
                          searchPlaceholder="Search levels..."
                          zIndex={70}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="text-xs text-muted-foreground">
          <p>{selectionHint || `Tap an ${terms.alter} to add or remove them from this meeting.`}</p>
        </div>

        {/* Search and view toggle — the tree view brings its own search. */}
        <div className="flex gap-2">
          {viewMode !== "tree" && (
            <>
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder={`Search ${terms.alters}...`}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9" />
              </div>
              <AlterSortToggle sorter={sorter} className="p-2 rounded-md flex-shrink-0" />
            </>
          )}
          {viewMode === "tree" && (
            <p className="flex-1 self-center text-xs text-muted-foreground">Browse by subsystem or group. Tap to select.</p>
          )}
          <div className="flex gap-1 bg-muted/50 rounded-md p-1 flex-shrink-0" role="group" aria-label="View mode">
            <button
              onClick={() => setViewMode("list")}
              className={`p-2 rounded transition-colors ${viewMode === "list" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}
              aria-label="List view"
              aria-pressed={viewMode === "list"}>
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className={`p-2 rounded transition-colors ${viewMode === "grid" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}
              aria-label="Grid view"
              aria-pressed={viewMode === "grid"}>
              <Grid3x3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("tree")}
              title={`Organise by subsystem / group`}
              className={`p-2 rounded transition-colors ${viewMode === "tree" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}
              aria-label="By subsystem or group"
              aria-pressed={viewMode === "tree"}>
              <FolderTree className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto overscroll-contain" style={{ maxHeight: "40vh", minHeight: 120 }}>
          {viewMode === "tree" ? (
            <AlterTreeSelect
              alters={activeAlters}
              groups={groups}
              isSelected={(id) => selectedIds.has(id)}
              onToggle={(a) => toggleAlter(a.id)}
              onSetMany={setManyFronters}
              maxHeight="46vh"
            />
          ) : viewMode === "list" ? (
            <div className="space-y-1.5">
              {filtered.map((a) => (
                <AlterPill
                  key={a.id}
                  alter={a}
                  selected={selectedIds.has(a.id)}
                  isPrimary={false}
                  onToggle={() => toggleAlter(a.id)}
                  onSetPrimary={() => toggleAlter(a.id)}
                  onSolePrimary={() => chooseOnly(a.id)} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {filtered.map((a) => (
                <SetFrontGridCard
                  key={a.id}
                  alter={a}
                  selected={selectedIds.has(a.id)}
                  isPrimary={false}
                  onToggle={() => toggleAlter(a.id)}
                  onSetPrimary={() => toggleAlter(a.id)}
                  onSolePrimary={() => chooseOnly(a.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Pinned action bar. */}
        <div className="flex gap-2 pt-2 border-t border-border/50">
          <Button
            variant="outline"
            onClick={() => setChosenIds([])}
            title={`Clear all selected ${terms.alters}`}
            className="flex-shrink-0 px-3">
            <Trash2 className="w-4 h-4" />
          </Button>
          <Button onClick={handleConfirm} className="flex-1 bg-primary hover:bg-primary/90">
            {confirmLabel || "Add to meeting"}
          </Button>
        </div>
        </>
        )}
      </DialogContent>
    </Dialog>
  );
}
