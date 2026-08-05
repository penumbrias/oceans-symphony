// The rebuilt Set Front surface (v0.117.0) — owner's call: rebuild rather
// than keep adapting the 2023-era modal. Ground rules of the rebuild:
//
//   • ONE draft model: an ordered list of { alterId, isPrimary, level }
//     instead of three parallel states (selected set / primaryId / pending
//     levels) that had to be kept in agreement.
//   • Rich rows: avatar, name (label-mode aware), pronouns, time fronting
//     so far, an explicit primary star and a level select — no hidden
//     gestures required to reach any state (swipes were the only way to
//     some states in the old modal).
//   • Fronting levels are native, not bolted on.
//   • All writes go through src/lib/setFront.js (applyFrontSelection /
//     reconcileActiveFront) — the same engine the old modal now uses, so
//     the two can never disagree while both exist.
//   • Everything reused, not forked: AlterTreeSelect (by-group tree),
//     SetFrontGridCard (avatar grid), PresencePicker (New presence tab),
//     SwitchJournalModal, SearchableSelect, AlterLabelToggle.
//
// The old SetFrontModal remains ONLY as the selection-mode alter picker
// (meetings, activity/plan composers); every real set-front entry point
// mounts this sheet.

import React, { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  Search, User, Star, X, HelpCircle, List, Grid3x3, FolderTree,
  ArrowDownAZ, ArrowUpAZ, TrendingUp, TrendingDown, AlertTriangle, BookOpen,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import AlterLabelToggle from "@/components/shared/AlterLabelToggle";
import AlterTreeSelect from "@/components/shared/AlterTreeSelect";
import SearchableSelect from "@/components/shared/SearchableSelect";
import PresencePicker from "@/components/presences/PresencePicker";
import SwitchJournalModal from "@/components/journal/SwitchJournalModal";
import { SetFrontGridCard, TRIGGER_CATEGORIES } from "@/components/fronting/SetFrontModal";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { useFrontLevels, frontLevelLabel } from "@/lib/frontLevels";
import { applyFrontSelection, reconcileActiveFront } from "@/lib/setFront";
import { getAlterIdsByGroupFlag } from "@/lib/subsystemUtils";

// One alter in the draft (the "here now" list being edited).
function DraftRow({ alter, entry, levelCfg, terms, formatAlter, onTogglePrimary, onLevel, onRemove }) {
  const resolved = useResolvedAvatarUrl(alter.avatar_url);
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-muted/20 px-2 py-1.5">
      <div className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center"
        style={{ backgroundColor: alter.color || "hsl(var(--muted))" }}>
        {resolved
          ? <img src={resolved} alt="" className="w-full h-full object-cover" />
          : <User className="w-4 h-4 text-background/80" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{formatAlter(alter)}</p>
        <p className="text-[0.6875rem] text-muted-foreground truncate">
          {[alter.pronouns, entry.startTime
            ? formatDistanceToNow(new Date(entry.startTime), { addSuffix: false })
            : "new"].filter(Boolean).join(" · ")}
        </p>
      </div>
      {levelCfg.enabled && (
        <div className="w-[38%] flex-shrink-0">
          <SearchableSelect
            value={entry.level}
            onChange={(v) => { if (v) onLevel(alter.id, v); }}
            options={levelCfg.levels.map((l) => ({ id: l.id, label: frontLevelLabel(l, terms) }))}
            placeholder={`${terms.Front} level`}
            searchPlaceholder="Search levels..."
            zIndex={70}
          />
        </div>
      )}
      {/* With levels ON the star is retired — whoever sits closest to
          front leads automatically, so there's nothing to hand-set. */}
      {!levelCfg.enabled && (
        <button
          type="button"
          aria-label={entry.isPrimary ? `${formatAlter(alter)} is primary — tap to make co-${terms.front} only` : `Make ${formatAlter(alter)} primary`}
          aria-pressed={entry.isPrimary}
          onClick={() => onTogglePrimary(alter.id)}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted/50 flex-shrink-0"
        >
          <Star className={`w-4 h-4 ${entry.isPrimary ? "text-amber-500 fill-amber-500" : "text-muted-foreground"}`} />
        </button>
      )}
      <button
        type="button"
        aria-label={`Remove ${formatAlter(alter)} from the ${terms.front}`}
        onClick={() => onRemove(alter.id)}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-muted/50 flex-shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// One alter in the add list.
function AddRow({ alter, formatAlter, onAdd }) {
  const resolved = useResolvedAvatarUrl(alter.avatar_url);
  return (
    <button
      type="button"
      onClick={() => onAdd(alter.id)}
      className="w-full flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-muted/40 text-left"
    >
      <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center"
        style={{ backgroundColor: alter.color || "hsl(var(--muted))" }}>
        {resolved
          ? <img src={resolved} alt="" className="w-full h-full object-cover" />
          : <User className="w-4 h-4 text-background/80" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm truncate">{formatAlter(alter)}</p>
        {alter.pronouns && <p className="text-[0.6875rem] text-muted-foreground truncate">{alter.pronouns}</p>}
      </div>
      <span className="text-xs text-muted-foreground flex-shrink-0">Add</span>
    </button>
  );
}

const SORT_MODES = [
  { id: "alpha-asc", icon: ArrowDownAZ, label: "A to Z" },
  { id: "alpha-desc", icon: ArrowUpAZ, label: "Z to A" },
  { id: "most", icon: TrendingUp, label: "most-time-first" },
  { id: "least", icon: TrendingDown, label: "least-time-first" },
];

export default function SetFrontSheet({ open, onClose, alters: altersProp }) {
  const terms = useTerms();
  const formatAlter = useAlterLabel();
  const queryClient = useQueryClient();
  const levelCfg = useFrontLevels();

  const [tab, setTab] = useState("fronters");
  const [draft, setDraft] = useState([]);        // [{ alterId, isPrimary, level, startTime }]
  const [isUnsure, setIsUnsure] = useState(false);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("alpha-asc");
  const [viewMode, setViewMode] = useState("list");
  const [journalSwitch, setJournalSwitch] = useState(false);
  const [triggeredSwitch, setTriggeredSwitch] = useState(false);
  const [triggerCategory, setTriggerCategory] = useState("");
  const [triggerLabel, setTriggerLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [showJournalModal, setShowJournalModal] = useState(false);
  const [newSessionId, setNewSessionId] = useState(null);

  const { data: fetchedAlters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
    enabled: open && !altersProp?.length,
  });
  const { data: groups = [] } = useQuery({
    queryKey: ["groups"],
    queryFn: () => base44.entities.Group.list(),
    enabled: open,
  });
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
    ...customTriggerTypes.map((t) => ({ id: t.id, label: t.label, emoji: t.emoji || "🏷️", hint: t.hint || "" })),
  ], [customTriggerTypes]);

  // Members of groups flagged hide_from_set_front stay out of this picker
  // (same rule as the old modal).
  const alters = useMemo(() => {
    const base = altersProp?.length ? altersProp : fetchedAlters;
    const hidden = getAlterIdsByGroupFlag(groups, base, "hide_from_set_front");
    return hidden.size ? base.filter((a) => !hidden.has(a.id)) : base;
  }, [altersProp, fetchedAlters, groups]);
  const altersById = useMemo(() => Object.fromEntries(alters.map((a) => [a.id, a])), [alters]);

  // Seed the draft from the reconciled live front every time the sheet
  // opens (repairs ghosts/dupes/phantom primaries as it reads).
  useEffect(() => {
    if (!open) return;
    setIsUnsure(false);
    setJournalSwitch(false);
    setTriggeredSwitch(false);
    setTriggerCategory("");
    setTriggerLabel("");
    setSearch("");
    (async () => {
      try {
        const { sessions, cleanupHappened } = await reconcileActiveFront();
        if (cleanupHappened) {
          queryClient.invalidateQueries({ queryKey: ["activeFront"] });
          queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
        }
        setDraft(sessions.map((s) => ({
          alterId: s.alter_id,
          isPrimary: !!s.is_primary,
          // Pre-levels rows map by their old role: primary → top level,
          // co-fronter → the second (seamless migration, v0.121.0).
          level: s.front_level
            ?? (s.is_primary ? levelCfg.levels[0]?.id : (levelCfg.levels[1]?.id ?? levelCfg.levels[0]?.id)),
          startTime: s.start_time || null,
        })));
      } catch { setDraft([]); }
    })();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const draftIds = useMemo(() => new Set(draft.map((d) => d.alterId)), [draft]);

  const addAlter = (id) => {
    if (draftIds.has(id)) return;
    setIsUnsure(false);
    setDraft((prev) => [...prev, {
      alterId: id,
      isPrimary: prev.length === 0, // first in seeds primary
      // First added joins at the top level; everyone after at the second
      // (the classic "adding a co-fronter" behaviour, generalised).
      level: prev.length === 0 ? levelCfg.levels[0]?.id : (levelCfg.levels[1]?.id ?? levelCfg.levels[0]?.id),
      startTime: null,
    }]);
  };
  const removeAlter = (id) => setDraft((prev) => prev.filter((d) => d.alterId !== id));
  const togglePrimary = (id) => setDraft((prev) => prev.map((d) =>
    d.alterId === id ? { ...d, isPrimary: !d.isPrimary } : { ...d, isPrimary: false }));
  const setLevel = (id, level) => setDraft((prev) => prev.map((d) =>
    d.alterId === id ? { ...d, level } : d));
  const toggleFromView = (id) => (draftIds.has(id) ? removeAlter(id) : addAlter(id));
  const setSole = (id) => {
    setIsUnsure(false);
    setDraft([{ alterId: id, isPrimary: true, level: levelCfg.levels[0]?.id, startTime: null }]);
  };
  const setMany = (arr, on) => {
    setIsUnsure(false);
    for (const a of arr) (on ? addAlter(a.id) : removeAlter(a.id));
  };

  // Fronting-time totals for the two time-based sort modes.
  const alterFrontTotals = useMemo(() => {
    if (sortBy === "alpha-asc" || sortBy === "alpha-desc") return {};
    const totals = {};
    for (const s of allSessions) {
      const dur = s.end_time && s.start_time ? new Date(s.end_time) - new Date(s.start_time) : 0;
      if (s.alter_id) totals[s.alter_id] = (totals[s.alter_id] || 0) + dur;
      else {
        if (s.primary_alter_id) totals[s.primary_alter_id] = (totals[s.primary_alter_id] || 0) + dur;
        for (const id of s.co_fronter_ids || []) totals[id] = (totals[id] || 0) + dur;
      }
    }
    return totals;
  }, [allSessions, sortBy]);

  const activeAlters = useMemo(() => alters.filter((a) => !a.is_archived), [alters]);
  const addList = useMemo(() => {
    const list = activeAlters.filter((a) =>
      !draftIds.has(a.id) && (a.name || "").toLowerCase().includes(search.toLowerCase()));
    return [...list].sort((a, b) => {
      if (sortBy === "most") return (alterFrontTotals[b.id] || 0) - (alterFrontTotals[a.id] || 0);
      if (sortBy === "least") return (alterFrontTotals[a.id] || 0) - (alterFrontTotals[b.id] || 0);
      const cmp = (a.name || "").localeCompare(b.name || "");
      return sortBy === "alpha-desc" ? -cmp : cmp;
    });
  }, [activeAlters, draftIds, search, sortBy, alterFrontTotals]);

  const triggerDefaultText = useMemo(() => {
    if (!triggeredSwitch) return "";
    const cat = allTriggerCategories.find((c) => c.id === triggerCategory);
    return [cat ? `${cat.emoji} ${cat.label}` : "", triggerLabel].filter(Boolean).join(": ");
  }, [triggeredSwitch, triggerCategory, triggerLabel, allTriggerCategories]);

  const handleSave = async () => {
    if (!isUnsure && draft.length === 0) {
      toast.error(`Add at least one ${terms.fronter} or mark as unsure`);
      return;
    }
    setSaving(true);
    try {
      const { firstSessionId } = await applyFrontSelection({
        clearAll: isUnsure,
        selections: draft,
        triggered: triggeredSwitch && triggerCategory ? { category: triggerCategory, label: triggerLabel } : null,
        levelsEnabled: levelCfg.enabled,
        levelCfg,
        alters,
        terms,
        queryClient,
      });
      toast.success(isUnsure ? `✅ ${terms.Front} cleared` : `✅ ${terms.Front} updated!`);
      if (!isUnsure && journalSwitch) {
        setNewSessionId(firstSessionId);
        setShowJournalModal(true);
      } else {
        onClose();
      }
    } catch (e) {
      toast.error(e.message || `Failed to set ${terms.front}`);
    } finally {
      setSaving(false);
    }
  };

  const primaryId = draft.find((d) => d.isPrimary)?.alterId || "";

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent
          // One scrollable column, NOT a rigid flex layout: on short
          // viewports (landscape phones) a fixed header/footer flex column
          // starves the alter list to zero height and cuts the footer off
          // with no way to scroll (the tester report). With outer scroll +
          // bounded inner lists, every control stays reachable at any size.
          className="max-w-md flex flex-col overflow-y-auto overscroll-contain"
          style={{
            maxHeight: "calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 2rem)",
          }}
        >
          <DialogHeader>
            <div className="flex items-center justify-between gap-2 pr-14">
              <DialogTitle>Set {terms.Front}ers</DialogTitle>
              <AlterLabelToggle size="xs" />
            </div>
          </DialogHeader>

          <div className="flex gap-1 bg-muted/50 rounded-lg p-1" role="tablist">
            {[["fronters", `Set ${terms.Front}ers`], ["presence", "New presence"]].map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`flex-1 text-sm py-1.5 rounded-md transition-colors ${tab === id ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}>
                {label}
              </button>
            ))}
          </div>

          {tab === "presence" ? (
            <PresencePicker onClose={onClose} />
          ) : (
            <>
              {/* The draft — who this save will make the front */}
              <div className="space-y-1.5 overflow-y-auto overscroll-contain flex-shrink-0" style={{ maxHeight: "30vh", minHeight: 44 }}>
                {isUnsure ? (
                  <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                    <HelpCircle className="w-4 h-4" /> Unsure — saving will clear the {terms.front}.
                  </div>
                ) : draft.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-1">
                    No one selected yet — tap an {terms.alter} below to add them.
                  </p>
                ) : (
                  draft.map((entry) => {
                    const alter = altersById[entry.alterId];
                    if (!alter) return null;
                    return (
                      <DraftRow key={entry.alterId} alter={alter} entry={entry}
                        levelCfg={levelCfg} terms={terms} formatAlter={formatAlter}
                        onTogglePrimary={togglePrimary} onLevel={setLevel} onRemove={removeAlter} />
                    );
                  })
                )}
                {!isUnsure && draft.length > 0 && !primaryId && !levelCfg.enabled && (
                  <p className="text-[0.6875rem] text-muted-foreground px-1">
                    No primary set — tap a star to mark who leads, or leave everyone co-{terms.fronting}.
                  </p>
                )}
              </div>

              {/* Search / sort / view row */}
              <div className="flex gap-2 flex-shrink-0">
                {viewMode !== "tree" && (
                  <>
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input placeholder={`Search ${terms.alters}...`} value={search}
                        onChange={(e) => setSearch(e.target.value)} className="pl-9" />
                    </div>
                    <button type="button"
                      data-tour="setfront-sort"
                      onClick={() => setSortBy((s) => SORT_MODES[(SORT_MODES.findIndex((m) => m.id === s) + 1) % SORT_MODES.length].id)}
                      title={`Sort: ${SORT_MODES.find((m) => m.id === sortBy)?.label.replace("time", `${terms.fronting} time`)}`}
                      className="p-2 rounded-lg border border-border/50 text-muted-foreground hover:text-foreground">
                      {React.createElement(SORT_MODES.find((m) => m.id === sortBy)?.icon || ArrowDownAZ, { className: "w-4 h-4" })}
                    </button>
                  </>
                )}
                {viewMode === "tree" && <div className="flex-1" />}
                <div className="flex rounded-lg border border-border/50 overflow-hidden">
                  {[["list", List], ["grid", Grid3x3], ["tree", FolderTree]].map(([id, Icon]) => (
                    <button key={id} type="button" aria-pressed={viewMode === id}
                      onClick={() => setViewMode(id)}
                      className={`p-2 transition-colors ${viewMode === id ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                      <Icon className="w-4 h-4" />
                    </button>
                  ))}
                </div>
              </div>

              {/* The add surface */}
              <div className="overflow-y-auto overscroll-contain"
                style={{ maxHeight: "38vh", minHeight: 120 }}>
                {viewMode === "tree" ? (
                  <AlterTreeSelect
                    alters={activeAlters}
                    groups={groups}
                    isSelected={(id) => draftIds.has(id)}
                    onToggle={(a) => toggleFromView(a.id)}
                    onSetMany={setMany}
                    maxHeight="40vh"
                  />
                ) : viewMode === "grid" ? (
                  <div className="grid grid-cols-3 gap-2 py-1">
                    {addList.map((a) => (
                      <SetFrontGridCard key={a.id} alter={a}
                        selected={false} isPrimary={false}
                        onToggle={() => addAlter(a.id)}
                        onSetPrimary={() => { addAlter(a.id); togglePrimary(a.id); }}
                        onSolePrimary={() => setSole(a.id)} />
                    ))}
                    {addList.length === 0 && <p className="col-span-3 text-xs text-muted-foreground text-center py-3">Everyone's already selected.</p>}
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {addList.map((a) => (
                      <AddRow key={a.id} alter={a} formatAlter={formatAlter} onAdd={addAlter} />
                    ))}
                    {addList.length === 0 && <p className="text-xs text-muted-foreground text-center py-3">Everyone's already selected.</p>}
                  </div>
                )}
              </div>

              {/* Switch options */}
              <div className="space-y-2 flex-shrink-0 border-t border-border/40 pt-2">
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm" data-tour="setfront-journal">
                    <Checkbox checked={journalSwitch} onCheckedChange={(v) => setJournalSwitch(!!v)} disabled={isUnsure} />
                    <BookOpen className="w-3.5 h-3.5 text-muted-foreground" /> Journal this {terms.switch}?
                  </label>
                  <label className="flex items-center gap-2 text-sm" data-tour="setfront-triggered">
                    <Checkbox checked={triggeredSwitch} onCheckedChange={(v) => setTriggeredSwitch(!!v)} disabled={isUnsure} />
                    <AlertTriangle className="w-3.5 h-3.5 text-muted-foreground" /> Triggered {terms.switch}?
                  </label>
                </div>
                {triggeredSwitch && !isUnsure && (
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <SearchableSelect
                        value={triggerCategory}
                        onChange={(v) => setTriggerCategory(v || "")}
                        options={allTriggerCategories.map((c) => ({ id: c.id, label: `${c.emoji} ${c.label}` }))}
                        placeholder="Trigger category..."
                        searchPlaceholder="Search triggers..."
                        zIndex={70}
                      />
                    </div>
                    <Input value={triggerLabel} onChange={(e) => setTriggerLabel(e.target.value)}
                      placeholder="Details (optional)" className="flex-1 h-9 text-sm" />
                  </div>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5"
                    aria-pressed={isUnsure}
                    onClick={() => setIsUnsure((v) => !v)}>
                    <HelpCircle className="w-3.5 h-3.5" /> {isUnsure ? "Not unsure" : "Unsure"}
                  </Button>
                  <Button className="flex-1" onClick={handleSave} disabled={saving}>
                    {saving ? "Saving..." : isUnsure ? `Clear ${terms.front}` : `Set ${terms.Front}ers`}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {showJournalModal && (
        <SwitchJournalModal
          open={showJournalModal}
          onClose={() => { setShowJournalModal(false); onClose(); }}
          sessionId={newSessionId}
          authorAlterId={primaryId}
          defaultTrigger={triggerDefaultText}
        />
      )}
    </>
  );
}
