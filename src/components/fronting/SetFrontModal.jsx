import React, { useState, useMemo, useEffect } from "react";
import AlterLabelToggle from "@/components/shared/AlterLabelToggle";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, User, Star, X, BookOpen, HelpCircle, List, Grid3x3, FolderTree, ArrowDownAZ, ArrowUpAZ, TrendingDown, TrendingUp, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import SwitchJournalModal from "@/components/journal/SwitchJournalModal";
import AlterTreeSelect from "@/components/shared/AlterTreeSelect";
import { useTerms } from "@/lib/useTerms";
import { pushFrontStatus } from "@/lib/friendsApi";
import useSwipeActions from "@/hooks/useSwipeActions";
import { getAlterIdsByGroupFlag } from "@/lib/subsystemUtils";
import { formatInTimeZone } from "date-fns-tz";

const TRIGGER_CATEGORIES = [
  { id: "sensory",         label: "Sensory",        emoji: "👂", hint: "loud noise, smell, touch" },
  { id: "emotional",       label: "Emotional",      emoji: "💙", hint: "grief, fear, loneliness" },
  { id: "interpersonal",   label: "Interpersonal",  emoji: "👥", hint: "conflict, rejection" },
  { id: "trauma_reminder", label: "Trauma reminder",emoji: "⚡", hint: "anniversary, place, memory" },
  { id: "physical",        label: "Physical",       emoji: "🫀", hint: "pain, fatigue, illness" },
  { id: "internal",        label: "Internal",       emoji: "🧠", hint: "intrusive thought, body memory" },
  { id: "unknown",         label: "Unknown",        emoji: "❓" },
];

// Returns an ISO string in the user's detected local timezone (not hardcoded)
function nowLocalIso() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return formatInTimeZone(new Date(), tz, "yyyy-MM-dd'T'HH:mm:ss.SSSXXX");
}

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
function SetFrontGridCard({ alter, selected, isPrimary, onToggle, onSetPrimary, onSolePrimary }) {
  const alterColor = alter.color || "#9333ea";
  const resolvedUrl = useResolvedAvatarUrl(alter.avatar_url);
  const [imgError, setImgError] = useState(false);
  const formatAlter = useAlterLabel();
  const { bind, dragX, swipeHint } = useSwipeActions({
    onTap: () => onToggle(),
    onSwipeRight: () => onToggle(),
    onSwipeLeft: () => onSetPrimary(),
    onSwipeLeftUp: () => onSolePrimary(),
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
  const [imgError, setImgError] = useState(false);
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
        <img src={resolvedUrl} alt={alter.name} className="w-full h-full object-cover" onError={() => setImgError(true)} /> :

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

// `selectionMode` (optional, non-breaking): when truthy, the modal does NOT
// mutate any FrontingSession on save. Instead it returns the chosen alter ids
// to the caller via `onConfirm(alterIds)` and closes. Used by the System
// Meeting flow's "notice who's near" — the meeting adds the chosen alters as
// participants rather than starting a front. All the switch-meta extras
// (journal / triggered / unsure) are hidden in this mode since there's no
// session to attach them to. When the prop is absent, behaviour is unchanged.
export default function SetFrontModal({ open, onClose, alters: altersProp, currentSession, selectionMode = false, onConfirm, preselectedIds, confirmLabel }) {
  const queryClient = useQueryClient();
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
  // Derive current fronter state from active sessions (new individual model)
  // currentSession may be a single session record; fetch all active sessions to initialize properly
  const getInitialState = () => {
    // In selection mode there's no session — seed from the caller's preselection
    // (e.g. the meeting's existing participants) so they show as already-chosen.
    if (selectionMode) {
      const ids = Array.isArray(preselectedIds) ? preselectedIds.filter(Boolean) : [];
      return { primary: "", coFronters: ids };
    }
    if (!currentSession) return { primary: "", coFronters: [] };
    if (currentSession.alter_id) {
      // New model: we only have one session record here — we can only read this alter's primary state
      // The caller (CurrentFronters/FrontingBar) should pass activeSessions instead, but for compat:
      return {
        primary: currentSession.is_primary ? currentSession.alter_id : "",
        coFronters: [],
      };
    }
    // Legacy fallback
    return {
      primary: currentSession.primary_alter_id || "",
      coFronters: currentSession.co_fronter_ids || [],
    };
  };
  const init = getInitialState();
  const [primaryId, setPrimaryId] = useState(init.primary);
  const [coFronterIds, setCoFronterIds] = useState(init.coFronters);
  const [saving, setSaving] = useState(false);
  const [journalSwitch, setJournalSwitch] = useState(false);
  const [showJournalModal, setShowJournalModal] = useState(false);
  const [newSessionId, setNewSessionId] = useState(null);
  const [isUnsure, setIsUnsure] = useState(false);
  const [viewMode, setViewMode] = useState("list");
  const [sortBy, setSortBy] = useState("alpha-asc"); // "alpha-asc" | "alpha-desc" | "most" | "least"
  const [triggeredSwitch, setTriggeredSwitch] = useState(false);
  const [triggerCategory, setTriggerCategory] = useState("");
  const [triggerLabel, setTriggerLabel] = useState("");

  const { data: allSessions = [] } = useQuery({
    queryKey: ["frontSessionsAll"],
    queryFn: () => base44.entities.FrontingSession.filter({}),
    enabled: open && (sortBy === "most" || sortBy === "least"),
    staleTime: 60000,
  });

  const { data: customTriggerTypes = [] } = useQuery({
    queryKey: ["customTriggerTypes"],
    queryFn: () => base44.entities.TriggerType.list(),
    enabled: open,
  });
  const allTriggerCategories = useMemo(() => [
    ...TRIGGER_CATEGORIES,
    ...customTriggerTypes.map(t => ({ id: t.id, label: t.label, emoji: t.emoji || "🏷️", hint: t.hint || "" })),
  ], [customTriggerTypes]);

  const triggerDefaultText = useMemo(() => {
    if (!triggeredSwitch) return "";
    const cat = allTriggerCategories.find(c => c.id === triggerCategory);
    const parts = [cat ? `${cat.emoji} ${cat.label}` : "", triggerLabel].filter(Boolean);
    return parts.join(": ");
  }, [triggeredSwitch, triggerCategory, triggerLabel, allTriggerCategories]);

  const alterFrontTotals = useMemo(() => {
    if (sortBy === "alpha-asc" || sortBy === "alpha-desc") return {};
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
  }, [allSessions, sortBy]);

  // Sync state when modal opens — load actual active sessions to populate
  // current front. Also dedupe stale data: collapse duplicate active sessions
  // for the same alter and demote any extra is_primary rows so the modal
  // never shows ghost selections that the user didn't tap.
  useEffect(() => {
    if (!open) return;
    setIsUnsure(false);
    setJournalSwitch(false);
    setTriggeredSwitch(false);
    setTriggerCategory("");
    setTriggerLabel("");

    // Selection mode never touches FrontingSession — just (re)seed the
    // pending selection from the caller's preselected ids and stop.
    if (selectionMode) {
      const ids = Array.isArray(preselectedIds) ? preselectedIds.filter(Boolean) : [];
      setPrimaryId("");
      setCoFronterIds(ids);
      return;
    }

    (async () => {
      try {
        const active = await base44.entities.FrontingSession.filter({ is_active: true });
        const newModelSessions = active.filter(s => s.alter_id);
        const now = nowLocalIso();
        let cleanupHappened = false;

        // Sweep orphaned "ghost active" sessions: rows where end_time is
        // still null but is_active was already flipped to false. They
        // render as "Active" in the Timeline popover (which keys off
        // end_time being null) but don't appear in the modal or
        // CurrentFronters (which key off is_active === true), so the
        // user can't end them via any normal path. Set end_time = now
        // for the lot so they reconcile and stop displaying as Active.
        try {
          const ghosts = await base44.entities.FrontingSession.filter({ is_active: false, end_time: null });
          for (const g of ghosts || []) {
            await base44.entities.FrontingSession.update(g.id, { end_time: now });
            cleanupHappened = true;
          }
        } catch { /* not all backends support filter on end_time: null */ }

        // 1. Group by alter_id; for any alter with >1 active session, keep
        // the newest and end the rest. Mirrors the dedupe that already runs
        // inside handleSave so the in-modal state matches what would be
        // saved.
        const sessionsByAlter = {};
        for (const s of newModelSessions) {
          (sessionsByAlter[s.alter_id] ||= []).push(s);
        }
        const survivors = [];
        for (const sessions of Object.values(sessionsByAlter)) {
          sessions.sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
          survivors.push(sessions[0]);
          for (const stale of sessions.slice(1)) {
            try { await base44.entities.FrontingSession.update(stale.id, { is_active: false, end_time: now }); cleanupHappened = true; } catch {}
          }
        }

        // 2. If multiple survivors are still marked is_primary, demote all
        // but the newest. Prevents the "phantom primary" where a leftover
        // is_primary row keeps showing as primary even after a fresh
        // promotion happened.
        const stillPrimary = survivors.filter(s => s.is_primary);
        if (stillPrimary.length > 1) {
          stillPrimary.sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
          for (const s of stillPrimary.slice(1)) {
            try { await base44.entities.FrontingSession.update(s.id, { is_primary: false }); s.is_primary = false; cleanupHappened = true; } catch {}
          }
        }

        if (survivors.length > 0) {
          const primarySess = survivors.find(s => s.is_primary);
          const coSessions = survivors.filter(s => !s.is_primary);
          setPrimaryId(primarySess?.alter_id || "");
          setCoFronterIds(coSessions.map(s => s.alter_id));
        } else if (active.length > 0) {
          // Legacy fallback
          const s = active[0];
          setPrimaryId(s.primary_alter_id || "");
          setCoFronterIds(s.co_fronter_ids || []);
        } else {
          // No active sessions — clear stale state from any prior open
          // so the modal doesn't appear to have the last-known fronter
          // pre-selected after the user cleared the front.
          setPrimaryId("");
          setCoFronterIds([]);
        }

        if (cleanupHappened) {
          queryClient.invalidateQueries({ queryKey: ["activeFront"] });
          queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
        }
      } catch {}
    })();
  }, [open]);

  const activeAlters = useMemo(() => (alters || []).filter((a) => !a.is_archived), [alters]);
  const filtered = useMemo(() => {
    const list = activeAlters.filter((a) => a.name?.toLowerCase().includes(search.toLowerCase()));
    const rank = (a) => a.id === primaryId ? 0 : coFronterIds.includes(a.id) ? 1 : 2;
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

  const toggleAlter = (id) => {
    // Selection mode has no "primary" concept — it's a flat multi-select, so
    // toggling never promotes the first pick to primary (which would otherwise
    // make it un-deselectable). Just add/remove from the co-fronter list.
    if (selectionMode) {
      setCoFronterIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
      return;
    }
    if (primaryId === id) {
      setPrimaryId("");
      return;
    }
    if (coFronterIds.includes(id)) {
      setCoFronterIds(coFronterIds.filter((x) => x !== id));
    } else {
      setCoFronterIds([...coFronterIds, id]);
      if (!primaryId) setPrimaryId(id);
    }
  };

  const setPrimary = (id) => {
    // No "primary" in selection mode — treat a primary gesture (long-press /
    // swipe-left / star) as a plain toggle so it can't strand a ghost
    // selection in primaryId.
    if (selectionMode) { toggleAlter(id); return; }
    if (primaryId === id) {
      // Tapping primary fronter removes them from primary (co-front only)
      setPrimaryId("");
      return;
    }
    if (!coFronterIds.includes(id) && primaryId !== id) {
      setCoFronterIds([...coFronterIds, primaryId].filter(Boolean).filter((x) => x !== id));
    } else {
      setCoFronterIds([...coFronterIds.filter((x) => x !== id), primaryId].filter(Boolean));
    }
    setPrimaryId(id);
  };

  // "Swipe left then up" — clear the whole current selection and make
  // this alter the sole primary. Mirrors replaceFrontWith on the live
  // surfaces, but here it only rewrites the modal's pending selection
  // (it's applied when the user hits Save).
  const setSolePrimary = (id) => {
    // Selection mode: "make sole" → select only this one (no primary concept).
    if (selectionMode) { setPrimaryId(""); setCoFronterIds([id]); return; }
    setIsUnsure(false);
    setCoFronterIds([]);
    setPrimaryId(id);
  };

  // Bulk add/remove, used by the by-subsystem/group tree view's "+ all / − all"
  // and "Select all / Clear all". Mirrors toggleAlter's invariant: primary is
  // kept separate from coFronterIds, and adding seeds a primary when none yet.
  const setManyFronters = (arr, on) => {
    const ids = arr.map((a) => a.id);
    if (!ids.length) return;
    setIsUnsure(false);
    setCoFronterIds((prev) => {
      const s = new Set(prev);
      for (const id of ids) { if (on) s.add(id); else s.delete(id); }
      return [...s];
    });
    if (!selectionMode) {
      if (on) setPrimaryId((p) => p || ids[0] || "");
      else setPrimaryId((p) => (ids.includes(p) ? "" : p));
    }
  };

  const handleSave = async () => {
    // Selection mode: hand the chosen alter ids back to the caller and close.
    // No FrontingSession is read or written. An empty selection is allowed —
    // the meeting just ends up with no participants added from here.
    if (selectionMode) {
      const ids = [...selectedIds];
      onConfirm?.(ids);
      onClose();
      return;
    }
    if (!isUnsure && !primaryId && coFronterIds.length === 0) {
      toast.error(`Select at least one ${terms.fronter} or mark as unsure`);
      return;
    }
    setSaving(true);
    try {
      const activeSessions = await base44.entities.FrontingSession.filter({ is_active: true });

      if (isUnsure) {
        const now = nowLocalIso();
        for (const s of activeSessions) {
          await base44.entities.FrontingSession.update(s.id, { is_active: false, end_time: now });
        }
        // Also reconcile ghost-active sessions (is_active: false but
        // end_time still null) — they appear as "Active" in the
        // Timeline popover even though the rest of the app considers
        // them ended.
        try {
          const ghosts = await base44.entities.FrontingSession.filter({ is_active: false, end_time: null });
          for (const g of ghosts || []) {
            await base44.entities.FrontingSession.update(g.id, { end_time: now });
          }
        } catch { /* filter on end_time: null may not be supported */ }
        toast.success("✅ Front cleared");
        queryClient.invalidateQueries({ queryKey: ["activeFront"] });
        queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
        // Push cleared status to friends server (fire-and-forget)
        pushFrontStatus({ fronters: [], terms: { fronting: terms.fronting } }).catch(() => {});
        onClose();
      } else {
        const now = nowLocalIso();
        const coIds = coFronterIds.filter((id) => id !== primaryId);
        const allSelectedIds = [primaryId, ...coIds].filter(Boolean);

        // Build desired state: alter_id -> is_primary
        const desiredMap = {};
        for (const id of allSelectedIds) {
          desiredMap[id] = id === primaryId;
        }

        // Handle legacy sessions (old format with primary_alter_id)
        const legacySessions = activeSessions.filter(s => !s.alter_id && s.primary_alter_id);
        for (const s of legacySessions) {
          await base44.entities.FrontingSession.update(s.id, { is_active: false, end_time: now });
        }

        const newModelSessions = activeSessions.filter(s => s.alter_id);

        // Group by alter_id — duplicates (>1 session per alter) get fully cleared
        const sessionsByAlterId = {};
        for (const s of newModelSessions) {
          if (!sessionsByAlterId[s.alter_id]) sessionsByAlterId[s.alter_id] = [];
          sessionsByAlterId[s.alter_id].push(s);
        }

        // 1. End sessions for removed alters, status-changed alters, and ALL duplicates
        for (const [alterId, sessions] of Object.entries(sessionsByAlterId)) {
          const isStillPresent = alterId in desiredMap;
          const hasDuplicates = sessions.length > 1;
          if (hasDuplicates) {
            // End every copy — a clean single session will be created in step 2
            for (const s of sessions) {
              await base44.entities.FrontingSession.update(s.id, { is_active: false, end_time: now });
            }
          } else {
            const primaryStatusChanged = isStillPresent && sessions[0].is_primary !== desiredMap[alterId];
            if (!isStillPresent || primaryStatusChanged) {
              await base44.entities.FrontingSession.update(sessions[0].id, { is_active: false, end_time: now });
            }
          }
        }

        // 2. Create sessions for new alters, status-changed alters, or duplicates that were cleared
        let firstSessionId = null;
        for (const id of allSelectedIds) {
          const sessions = sessionsByAlterId[id] || [];
          const hasDuplicates = sessions.length > 1;
          const single = sessions.length === 1 ? sessions[0] : null;
          const statusUnchanged = single && single.is_primary === desiredMap[id];

          if (hasDuplicates || !statusUnchanged) {
            const newSession = await base44.entities.FrontingSession.create({
              alter_id: id,
              is_primary: desiredMap[id],
              start_time: now,
              is_active: true,
            });
            if (!firstSessionId) firstSessionId = newSession?.id || null;
          }
        }

        if (triggeredSwitch && triggerCategory) {
          const nowActive = await base44.entities.FrontingSession.filter({ is_active: true });
          await Promise.all(nowActive.map(s =>
            base44.entities.FrontingSession.update(s.id, {
              is_triggered_switch: true,
              trigger_category: triggerCategory,
              trigger_label: triggerLabel,
            })
          ));
        }

        toast.success("✅ Front updated!");
        queryClient.invalidateQueries({ queryKey: ["activeFront"] });
        queryClient.invalidateQueries({ queryKey: ["frontHistory"] });

        // Push front status to friends server (fire-and-forget)
        // id is included so pushFrontStatus can apply per-friend visibility filtering
        const visibleFronters = allSelectedIds
          .map(id => alters.find(a => a.id === id))
          .filter(a => a && a.friends_visible !== false)
          .map(a => ({
            id: a.id,
            name: a.name,
            initial: a.name?.[0] || '?',
            color: a.color || null,
            isPrimary: a.id === primaryId,
            isCofronter: a.id !== primaryId,
          }));
        pushFrontStatus({
          fronters: visibleFronters,
          terms: {
            fronting: terms.fronting,
            front: terms.front,
            alter: terms.alter,
            system: terms.system,
          },
        }).catch(() => {});

        if (journalSwitch) {
          setNewSessionId(firstSessionId);
          setShowJournalModal(true);
        } else {
          onClose();
        }
      }
    } catch (e) {
      toast.error(e.message || "Failed to set front");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent
          className="max-w-md flex flex-col overflow-hidden"
          style={{
            // Don't let the modal stretch up under the device status bar.
            // The base Dialog uses `top: 50%` + `translate-y(-50%)` and
            // a maxHeight calc that doesn't account for the top/bottom
            // safe-area inset — on Android with a tall status bar /
            // Spotify pill the modal's top edge bled into the bar.
            // Subtract both insets so the modal stays inside the safe
            // viewport.
            maxHeight: "calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 2rem)",
          }}
        >
          <DialogHeader>
            {/* Right-pad past the 44x44 close X (positioned right-2)
                so the label-mode toggle pill doesn't end up under it. */}
            <div className="flex items-center justify-between gap-2 pr-14">
              <DialogTitle>{selectionMode ? `Notice who's near` : `Set ${terms.Front}ers`}</DialogTitle>
              <AlterLabelToggle size="xs" />
            </div>
          </DialogHeader>

          {/* Selected chips */}
          {(selectedIds.size > 0 || isUnsure) &&
          <div className="bg-muted/30 rounded-lg p-3 mb-2 border border-border/50">
              <div className="flex flex-wrap gap-2 max-h-[150px] overflow-y-auto">
                {isUnsure ?
              <span className="px-2 py-1 rounded-full bg-muted text-muted-foreground text-xs">Unsure</span> :

              [...selectedIds].map((id) => {
                const a = (alters || []).find((x) => x.id === id);
                if (!a) return null;
                return (
                  <SelectedChip
                    key={id}
                    alter={a}
                    isPrimary={id === primaryId}
                    onSetPrimary={() => setPrimary(id)}
                    onSolePrimary={() => setSolePrimary(id)}
                    onRemove={() => toggleAlter(id)}
                  />
                );
              })
              }
              </div>
            </div>
          }

          <div className="text-xs text-muted-foreground space-y-1">
            {selectionMode ? (
              <p>Tap an {terms.alter} to add or remove them from this meeting.</p>
            ) : (
              <>
                <p>Tap to select · hold to set primary · <Star className="inline w-3 h-3 text-amber-500 fill-amber-500" /> = Primary {terms.alter}</p>
                <p>💡 On mobile: swipe right to toggle, swipe left to set primary, swipe left then up to make them the sole {terms.front}</p>
                {selectedIds.size > 0 && <p className="text-primary">Tap primary name to make them co-{terms.front} only</p>}
              </>
            )}
          </div>

          {/* Search and View Toggle — the tree view brings its own search +
              by-subsystem/group organisation, so the modal's search + sort are
              hidden there to avoid two competing search boxes. */}
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
                <button
                  data-tour="setfront-sort"
                  onClick={() => setSortBy(s => ({ "alpha-asc": "alpha-desc", "alpha-desc": "most", "most": "least", "least": "alpha-asc" }[s]))}
                  title={{ "alpha-asc": "A → Z", "alpha-desc": "Z → A", "most": `Most ${terms.fronting} time first`, "least": `Least ${terms.fronting} time first` }[sortBy]}
                  className={`p-2 rounded-md border transition-colors flex-shrink-0 ${sortBy !== "alpha-asc" ? "bg-primary/10 text-primary border-primary/30" : "border-border text-muted-foreground hover:text-foreground"}`}>
                  {sortBy === "alpha-asc" && <ArrowDownAZ className="w-4 h-4" />}
                  {sortBy === "alpha-desc" && <ArrowUpAZ className="w-4 h-4" />}
                  {sortBy === "most" && <TrendingDown className="w-4 h-4" />}
                  {sortBy === "least" && <TrendingUp className="w-4 h-4" />}
                </button>
              </>
            )}
            {viewMode === "tree" && (
              <p className="flex-1 self-center text-xs text-muted-foreground">Browse by subsystem or group. Tap to select; set the primary using the chips above.</p>
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

          {/* List or Grid View — the switch-meta toggles (journal /
              triggered) and the orange triggered-switch expansion now
              live INSIDE this scroll region so they can never push the
              pinned action bar below the modal's clipped bottom edge.
              Previously they sat in the non-scrolling footer; expanding
              the triggered-switch box grew the footer past the modal's
              max-height and overflow-hidden clipped the Save button off
              the bottom of the screen, leaving no way to save. */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {viewMode === "tree" ? (
              <AlterTreeSelect
                alters={activeAlters}
                groups={groups}
                isSelected={(id) => selectedIds.has(id)}
                onToggle={(a) => toggleAlter(a.id)}
                onSetMany={setManyFronters}
                maxHeight="46vh"
              />
            ) : viewMode === "list" ?
            <div className="space-y-1.5">
                {filtered.map((a) =>
              <AlterPill
                key={a.id}
                alter={a}
                selected={selectedIds.has(a.id)}
                isPrimary={primaryId === a.id}
                onToggle={() => toggleAlter(a.id)}
                onSetPrimary={() => setPrimary(a.id)}
                onSolePrimary={() => setSolePrimary(a.id)} />

              )}
              </div> :

            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {filtered.map((a) => (
                  <SetFrontGridCard
                    key={a.id}
                    alter={a}
                    selected={selectedIds.has(a.id)}
                    isPrimary={primaryId === a.id}
                    onToggle={() => toggleAlter(a.id)}
                    onSetPrimary={() => setPrimary(a.id)}
                    onSolePrimary={() => setSolePrimary(a.id)}
                  />
                ))}
              </div>
            }

            {!selectionMode && (
            <div className="space-y-2 pt-2 mt-2 border-t border-border/50">
              <div className="flex items-center gap-2" data-tour="setfront-journal">
                <Checkbox
                  id="journal-switch"
                  checked={journalSwitch}
                  onCheckedChange={setJournalSwitch}
                  disabled={isUnsure} />
                <label htmlFor="journal-switch" className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer select-none">
                  <BookOpen className="w-3.5 h-3.5" />
                  Journal this {terms.switch}?
                </label>
              </div>

              <div className="flex items-center gap-2" data-tour="setfront-triggered">
                <Checkbox
                  id="triggered-switch"
                  checked={triggeredSwitch}
                  onCheckedChange={setTriggeredSwitch}
                  disabled={isUnsure} />
                <label htmlFor="triggered-switch" className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer select-none">
                  <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />
                  Triggered {terms.switch}?
                </label>
              </div>

              {triggeredSwitch && !isUnsure && (
                <div className="rounded-xl bg-orange-500/5 border border-orange-400/20 px-3 py-2 space-y-2">
                  <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                    {allTriggerCategories.map(cat => (
                      <button key={cat.id} type="button"
                        onClick={() => setTriggerCategory(c => c === cat.id ? "" : cat.id)}
                        title={cat.hint}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-all ${
                          triggerCategory === cat.id
                            ? "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700"
                            : "text-muted-foreground border-border/60 hover:bg-muted/50"
                        }`}>
                        {cat.emoji} {cat.label}
                      </button>
                    ))}
                  </div>
                  <input
                    value={triggerLabel}
                    onChange={e => setTriggerLabel(e.target.value)}
                    aria-label={`Describe what triggered the ${terms.switch}`}
                    placeholder={`Describe what triggered the ${terms.switch}...`}
                    className="w-full text-xs bg-transparent border-0 border-b border-border/40 pb-1 outline-none text-foreground placeholder:text-muted-foreground/40 focus:border-border"
                  />
                </div>
              )}
            </div>
            )}
          </div>

          {/* Pinned action bar — stays at the bottom and reachable no
              matter how tall the scroll content above grows. */}
          <div className="flex gap-2 pt-2 border-t border-border/50">
            <Button
              variant="outline"
              onClick={() => { setPrimaryId(""); setCoFronterIds([]); setIsUnsure(false); }}
              disabled={saving}
              title={`Clear all selected ${terms.fronters}`}
              className="flex-shrink-0 px-3">
              <Trash2 className="w-4 h-4" />
            </Button>
            {!selectionMode && (
            <Button
              variant={isUnsure ? "default" : "outline"}
              onClick={() => {
                setIsUnsure(!isUnsure);
                if (!isUnsure) {
                  setPrimaryId("");
                  setCoFronterIds([]);
                }
              }}
              disabled={saving}
              className="flex-1">
              <HelpCircle className="w-4 h-4 mr-2" />
              Unsure
            </Button>
            )}
            <Button onClick={handleSave} loading={saving} disabled={saving} className="flex-1 bg-primary hover:bg-primary/90">
              {selectionMode ? (confirmLabel || "Add to meeting") : `Set ${terms.Front}ers`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {showJournalModal &&
      <SwitchJournalModal
        open={showJournalModal}
        onClose={() => {setShowJournalModal(false);onClose();}}
        sessionId={newSessionId}
        authorAlterId={primaryId}
        defaultTrigger={triggerDefaultText} />

      }
    </>);

}