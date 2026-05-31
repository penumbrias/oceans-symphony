import React, { useState, useMemo, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Users, Folder, ArrowDownAZ, ArrowUpAZ, Eye, EyeOff, Settings, Grid3X3, List, Plus, TrendingDown, TrendingUp, FolderMinus, Camera, Pin, Filter } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import AlterCard from "./AlterCard";
import AlterGridView from "./AlterGridView";
import FolderGroupsSection from "./FolderGroupsSection.jsx";
import useAnonymizeMode from "@/hooks/useAnonymizeMode";
import CreateGroupModal from "@/components/groups/CreateGroupModal";
import { useTerms } from "@/lib/useTerms";
import { TOUR_DEMO_ALTERS } from "@/lib/tourDemoData";
import AlterLabelToggle from "@/components/shared/AlterLabelToggle";
import PinnedAltersGallery from "./PinnedAltersGallery";
import SubsystemAlterList from "./SubsystemAlterList";
import AlterFilterPopup from "./AlterFilterPopup";
import { getAltersInsideSubsystems, getMemberAlters, getAlterIdsByGroupFlag } from "@/lib/subsystemUtils";

export default function AlterGrid({ alters }) {
  const navigate = useNavigate();
  const terms = useTerms();
  const isDemo = alters.length === 0 && !!window.__tourActive;
  const effectiveAlters = isDemo ? TOUR_DEMO_ALTERS : alters;
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState("alpha-asc"); // "alpha-asc" | "alpha-desc" | "most" | "least"
  const [showFolders, setShowFolders] = useState(() => {
    const saved = localStorage.getItem("alter_show_folders");
    return saved == null ? true : saved === "true";
  });
  useEffect(() => {
    try { localStorage.setItem("alter_show_folders", String(showFolders)); } catch {}
  }, [showFolders]);
  // displayMode cycles: "list" | "2" | "3" | "4" | "5"
  const [displayMode, setDisplayMode] = useState(() => {
    const saved = localStorage.getItem("alter_display_mode");
    if (saved) return saved;
    const oldCols = localStorage.getItem("alter_grid_cols");
    if (oldCols) return oldCols;
    return "list";
  });
  // anonymize cycles: "off" | "names" | "all" — persisted to localStorage
  // so the toggle applies system-wide (Dashboard's Currently Fronting
  // widget reads the same mode).
  const { mode: anonymize, cycle: cycleAnonymize } = useAnonymizeMode();
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [hideGrouped, setHideGrouped] = useState(() => localStorage.getItem("alter_hide_grouped") === "true");
  // Listing filter: nested vs flat, plus multi-select group/subsystem
  // membership with Any (union) / All (intersection) matching. Edited
  // through the AlterFilterPopup.
  const [filters, setFilters] = useState({ nested: true, groupIds: [], subsystemIds: [], mode: "any" });
  const [filterOpen, setFilterOpen] = useState(false);

  const DISPLAY_CYCLE = ["list", "2", "3", "4", "5"];
  const cycleDisplayMode = () => {
    const next = DISPLAY_CYCLE[(DISPLAY_CYCLE.indexOf(displayMode) + 1) % DISPLAY_CYCLE.length];
    setDisplayMode(next);
    localStorage.setItem("alter_display_mode", next);
  };


  const { data: allGroups = [] } = useQuery({
    queryKey: ["groups"],
    queryFn: () => base44.entities.Group.list()
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["frontHistory"],
    queryFn: () => base44.entities.FrontingSession.list("-start_time", 50)
  });

  const { data: allSessions = [] } = useQuery({
    queryKey: ["frontSessionsAll"],
    queryFn: () => base44.entities.FrontingSession.filter({}),
    enabled: sortMode === "most" || sortMode === "least",
    staleTime: 60000,
  });

  const alterFrontTotals = useMemo(() => {
    if (sortMode === "alpha-asc" || sortMode === "alpha-desc") return {};
    const totals = {};
    for (const s of allSessions) {
      const dur = s.end_time && s.start_time ? new Date(s.end_time) - new Date(s.start_time) : 0;
      if (s.alter_id) {
        totals[s.alter_id] = (totals[s.alter_id] || 0) + dur;
      } else {
        // Legacy session format
        if (s.primary_alter_id) totals[s.primary_alter_id] = (totals[s.primary_alter_id] || 0) + dur;
        for (const id of (s.co_fronter_ids || [])) {
          totals[id] = (totals[id] || 0) + dur;
        }
      }
    }
    return totals;
  }, [allSessions, sortMode]);

  const activeSessions = sessions.filter((s) => s.is_active);

  // Build a fronting rank map: 0 = primary, 1 = co-fronter, absent = not fronting
  const frontingRank = useMemo(() => {
    const map = {};
    for (const s of activeSessions) {
      if (s.alter_id) {
        // New individual-session model
        if (!(s.alter_id in map)) map[s.alter_id] = s.is_primary ? 0 : 1;
      } else {
        // Legacy model
        if (s.primary_alter_id) map[s.primary_alter_id] = 0;
        for (const id of (s.co_fronter_ids || [])) {
          if (!(id in map)) map[id] = 1;
        }
      }
    }
    return map;
  }, [activeSessions]);

  // Build set of alter IDs that belong to at least one group
  const groupedAlterIds = useMemo(() => {
    const ids = new Set();
    for (const g of allGroups) {
      for (const spId of (g.member_sp_ids || [])) {
        const alter = effectiveAlters.find(a => a.sp_id === spId);
        if (alter) ids.add(alter.id);
      }
    }
    // Also catch legacy: alter.groups array
    for (const a of effectiveAlters) {
      if ((a.groups || []).length > 0) ids.add(a.id);
    }
    return ids;
  }, [allGroups, effectiveAlters]);

  const filtered = effectiveAlters.
  filter(
    (a) =>
    !a.is_archived &&
    (!hideGrouped || !groupedAlterIds.has(a.id)) && (
    a.name?.toLowerCase().includes(search.toLowerCase()) ||
    a.role?.toLowerCase().includes(search.toLowerCase()) ||
    a.pronouns?.toLowerCase().includes(search.toLowerCase()))
  ).
  sort((a, b) => {
    const ra = frontingRank[a.id] ?? 2;
    const rb = frontingRank[b.id] ?? 2;
    if (ra !== rb) return ra - rb; // fronters always first
    if (sortMode === "most") return (alterFrontTotals[b.id] || 0) - (alterFrontTotals[a.id] || 0);
    if (sortMode === "least") return (alterFrontTotals[a.id] || 0) - (alterFrontTotals[b.id] || 0);
    const cmp = (a.name || "").localeCompare(b.name || "");
    return sortMode === "alpha-asc" ? cmp : -cmp;
  });

  // Root-level groups for display
  const rootGroups = allGroups.filter((g) => !g.parent || g.parent === "" || g.parent === "root");

  // Alters that live inside someone's subsystem — by default they show
  // nested under their owner in the list (not flat at the top level).
  const insideSubsystems = useMemo(
    () => getAltersInsideSubsystems(allGroups, effectiveAlters),
    [allGroups, effectiveAlters]
  );
  // Alters hidden from the main list via a group's "hide from lists"
  // toggle (configured on the group profile). Excluded from the default
  // view; still visible when searching, in the flat view, or when that
  // group is the active filter.
  const hiddenFromLists = useMemo(
    () => getAlterIdsByGroupFlag(allGroups, effectiveAlters, "hide_from_lists"),
    [allGroups, effectiveAlters]
  );

  const regularGroups = allGroups.filter((g) => !g.owner_alter_id);
  const subsystemGroups = allGroups.filter((g) => g.owner_alter_id);

  // Selected group/subsystem ids → the set of alter ids that match, using
  // Any (union) or All (intersection) of the selected memberships.
  const selectedFilterIds = [...filters.groupIds, ...filters.subsystemIds];
  const hasMembershipFilter = selectedFilterIds.length > 0;
  const filterMemberIds = useMemo(() => {
    if (!hasMembershipFilter) return null;
    const sets = selectedFilterIds.map((id) => {
      const g = allGroups.find((x) => x.id === id);
      return g ? new Set(getMemberAlters(g, effectiveAlters).map((a) => a.id)) : new Set();
    });
    if (filters.mode === "all") {
      return sets.reduce((acc, s) => (acc === null ? s : new Set([...acc].filter((id) => s.has(id)))), null) || new Set();
    }
    const union = new Set();
    sets.forEach((s) => s.forEach((id) => union.add(id)));
    return union;
  }, [allGroups, effectiveAlters, selectedFilterIds.join(","), filters.mode]);

  const isExplicitFilter = hasMembershipFilter;
  const activeFilterCount = selectedFilterIds.length;
  const filterActive = activeFilterCount > 0 || !filters.nested;
  // Flat (unnested) list when searching, when a membership filter is on,
  // or when the user chose the flat list style.
  const showFlat = !!search || hasMembershipFilter || !filters.nested;

  // Top-level list = filtered alters that aren't inside a subsystem and
  // aren't hidden by a group flag (nested view only).
  const topLevelAlters = search
    ? filtered
    : filtered.filter((a) => !insideSubsystems.has(a.id) && !hiddenFromLists.has(a.id));
  const flatAlters = filterMemberIds ? filtered.filter((a) => filterMemberIds.has(a.id)) : filtered;
  const visibleAlters = showFlat ? flatAlters : topLevelAlters;

  const groupControls = (active) => (
    <div data-tour="alter-groups-controls" className="flex items-center gap-0.5">
      <button
        onClick={() => setShowFolders(!showFolders)}
        title={showFolders ? "Hide groups" : "Show groups"}
        className={`flex items-center justify-center w-7 h-7 rounded-lg transition-colors ${active ? "text-primary" : "text-muted-foreground"} hover:bg-muted/60`}>
        {showFolders ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
      </button>
      <button
        onClick={() => setCreateGroupOpen(true)}
        title="New group"
        className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">
        <Plus className="w-4 h-4" />
      </button>
      <button
        onClick={() => navigate("/groups")}
        title="Manage groups"
        className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">
        <Settings className="w-4 h-4" />
      </button>
    </div>
  );

  return (
    <div>
      {isDemo && (
        <div className="mb-2 px-2 py-1 rounded-md bg-primary/10 border border-primary/20 text-[0.625rem] text-primary/80 text-center">
          Tour Preview — sample {terms.alters}
        </div>
      )}
      {/* Toolbar — search, sort, view mode only */}
      <div className="my-1 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none" style={{ WebkitOverflowScrolling: "touch" }}>
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder={`Search ${terms.alters}...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-3 h-9 border-border/50 bg-transparent" />
        </div>

        {/* Sort */}
        <button
          data-tour="alter-sort"
          onClick={() => setSortMode(m => ({ "alpha-asc": "alpha-desc", "alpha-desc": "most", "most": "least", "least": "alpha-asc" }[m]))}
          title={{ "alpha-asc": "A → Z", "alpha-desc": "Z → A", "most": `Most ${terms.fronting} time first`, "least": `Least ${terms.fronting} time first` }[sortMode]}
          className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-xl border border-border/50 bg-card/50 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
          {sortMode === "alpha-asc" && <ArrowDownAZ className="w-4 h-4" />}
          {sortMode === "alpha-desc" && <ArrowUpAZ className="w-4 h-4" />}
          {sortMode === "most" && <TrendingDown className="w-4 h-4" />}
          {sortMode === "least" && <TrendingUp className="w-4 h-4" />}
        </button>

        {/* Hide grouped */}
        <button
          onClick={() => {
            const next = !hideGrouped;
            setHideGrouped(next);
            localStorage.setItem("alter_hide_grouped", next ? "true" : "false");
          }}
          title={hideGrouped ? `Show all ${terms.alters}` : `Hide ${terms.alters} already in a group`}
          className={`flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-xl border border-border/50 bg-card/50 transition-colors ${hideGrouped ? "text-primary border-primary/40 bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-accent"}`}>
          <FolderMinus className="w-4 h-4" />
        </button>

        {/* Filter — opens a popup for nested/flat + group/subsystem multi-select */}
        {(regularGroups.length > 0 || subsystemGroups.length > 0) && (
          <button
            onClick={() => setFilterOpen(true)}
            title="Filter the list"
            className={`flex-shrink-0 flex items-center justify-center gap-1 h-9 px-2.5 rounded-xl border transition-colors ${filterActive ? "text-primary border-primary/40 bg-primary/10" : "text-muted-foreground border-border/50 bg-card/50 hover:text-foreground hover:bg-accent"}`}>
            <Filter className="w-4 h-4" />
            {activeFilterCount > 0 && <span className="text-xs font-semibold">{activeFilterCount}</span>}
          </button>
        )}

      </div>

      {/* Content */}
      <div className="space-y-4">
        {/* Pinned alters — quick-access gallery, sits above groups.
            Self-contained component; renders nothing when none pinned. */}
        <PinnedAltersGallery />

        {/* Groups section — header always visible */}
        <div>
          <div className="flex items-center gap-2 mb-2 px-1">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">Groups</p>
            <div className="flex-1 h-px bg-border/50" />
            {groupControls(rootGroups.length > 0)}
          </div>
          {rootGroups.length > 0 && showFolders && (
            <FolderGroupsSection
              alters={effectiveAlters.filter((a) => !a.is_archived)}
              sortDir={sortMode === "alpha-desc" ? "desc" : "asc"}
              activeSessions={activeSessions}
              anonymize={anonymize}
              displayMode={displayMode}
            />
          )}
          {rootGroups.length === 0 && (
            <p className="text-xs text-muted-foreground px-1 pb-1">No groups yet — tap + to create one.</p>
          )}
        </div>

        {/* Alters list/grid */}
        <div>
          <div className="flex items-center gap-2 mb-3 px-1">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">{terms.Alters}</p>
            <div className="flex-1 h-px bg-border/50" />
            <div className="flex items-center gap-1">
              <AlterLabelToggle size="xs" />
              {/* View / column cycle */}
              <button
                data-tour="alter-view-toggle"
                onClick={cycleDisplayMode}
                title={displayMode === "list" ? "Switch to 2-column grid" : `${displayMode}-col grid — tap to ${displayMode === "5" ? "switch to list" : "add a column"}`}
                className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors text-xs font-bold">
                {displayMode === "list" ? <Grid3X3 className="w-4 h-4" /> : displayMode}
              </button>
              {/* Anonymize toggle */}
              <button
                onClick={cycleAnonymize}
                title={{ "off": "Screenshot mode: tap to blur names", "names": "Blurring names — tap to also blur avatars", "all": "Blurring names & avatars — tap to disable" }[anonymize]}
                className={`flex items-center justify-center w-7 h-7 rounded-lg transition-colors ${
                  anonymize === "off"
                    ? "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                    : anonymize === "names"
                    ? "text-amber-500 bg-amber-500/10"
                    : "text-primary bg-primary/10"
                }`}>
                {anonymize === "off" ? <Camera className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>
            </div>
          </div>
          {visibleAlters.length > 0 ?
          displayMode === "list" ?
          // List view nests subsystems: owners show an expander, members
          // render indented beneath. When searching or an explicit filter
          // is active, falls back to a flat list.
          (showFlat ? (
            <div className="mx-auto flex flex-col gap-2">
              {visibleAlters.map((alter, i) =>
                <AlterCard key={alter.id} alter={alter} index={i} activeSessions={activeSessions} anonymize={anonymize} />
              )}
            </div>
          ) : (
            <SubsystemAlterList
              topAlters={topLevelAlters}
              allAlters={effectiveAlters}
              allGroups={allGroups}
              activeSessions={activeSessions}
              anonymize={anonymize}
            />
          )) :

          // Grid: nest subsystems in the default view; in a flat/filtered
          // view pass no groups so cards render unnested.
          <AlterGridView alters={visibleAlters} activeSessions={activeSessions} allAlters={effectiveAlters} allGroups={showFlat ? [] : allGroups} cols={parseInt(displayMode)} anonymize={anonymize} /> :


          <div className="flex flex-col items-center justify-center py-20 text-center px-4">
              <div className="text-4xl mb-3">{search ? "🔍" : isExplicitFilter ? "🔎" : hideGrouped ? "📁" : "👥"}</div>
              <p className="text-sm font-medium text-foreground mb-1">
                {search ? "No matches found" : isExplicitFilter ? `No ${terms.alters} in this filter` : hideGrouped ? `All ${terms.alters} are in groups` : `No ${terms.alters} yet`}
              </p>
              <p className="text-xs text-muted-foreground">
                {search ? `Try a different search term` : isExplicitFilter ? `Pick a different filter above` : hideGrouped ? `Toggle the group filter to see them` : `Add your first ${terms.alter} to get started`}
              </p>
            </div>
          }
        </div>
      </div>

      <CreateGroupModal
        open={createGroupOpen}
        onClose={() => setCreateGroupOpen(false)}
      />

      {filterOpen && (
        <AlterFilterPopup
          filters={filters}
          onChange={setFilters}
          regularGroups={regularGroups}
          subsystemGroups={subsystemGroups}
          terms={terms}
          onClose={() => setFilterOpen(false)}
        />
      )}
    </div>);

}