import React, { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, ArrowDownAZ, ArrowUpAZ, Eye, EyeOff, Settings, Grid3X3, List, Plus, TrendingDown, TrendingUp, FolderMinus, Camera } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import AlterCard from "./AlterCard";
import AlterGridView from "./AlterGridView";
import FolderGroupsSection from "./FolderGroupsSection.jsx";
import CreateGroupModal from "@/components/groups/CreateGroupModal";
import { useTerms } from "@/lib/useTerms";
import { TOUR_DEMO_ALTERS } from "@/lib/tourDemoData";

export default function AlterGrid({ alters, currentSession = null }) {
  const navigate = useNavigate();
  const terms = useTerms();
  const isDemo = alters.length === 0 && !!window.__tourActive;
  const effectiveAlters = isDemo ? TOUR_DEMO_ALTERS : alters;
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState("alpha-asc"); // "alpha-asc" | "alpha-desc" | "most" | "least"
  const [showFolders, setShowFolders] = useState(true);
  // displayMode: "list" | "2" | "3" | "4" | "5"
  const [displayMode, setDisplayMode] = useState(() => {
    const saved = localStorage.getItem("alter_display_mode");
    if (saved) return saved;
    const oldCols = localStorage.getItem("alter_grid_cols");
    if (oldCols) return oldCols;
    return "list";
  });
  const isGrid = displayMode !== "list";

  const setViewList = () => {
    if (isGrid) localStorage.setItem("alter_last_grid_cols", displayMode);
    setDisplayMode("list");
    localStorage.setItem("alter_display_mode", "list");
  };
  const setViewGrid = () => {
    const last = localStorage.getItem("alter_last_grid_cols") || "3";
    setDisplayMode(last);
    localStorage.setItem("alter_display_mode", last);
  };
  const setGridCols = (n) => {
    const s = String(n);
    setDisplayMode(s);
    localStorage.setItem("alter_display_mode", s);
    localStorage.setItem("alter_last_grid_cols", s);
  };

  // anonymize cycles: "off" | "names" | "all"
  const [anonymize, setAnonymize] = useState("off");
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [hideGrouped, setHideGrouped] = useState(() => localStorage.getItem("alter_hide_grouped") === "true");

  const cycleAnonymize = () => {
    setAnonymize(a => ({ "off": "names", "names": "all", "all": "off" }[a]));
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
        <div className="mb-2 px-2 py-1 rounded-md bg-primary/10 border border-primary/20 text-[10px] text-primary/80 text-center">
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

        {/* Anonymize toggle */}
        <button
          onClick={cycleAnonymize}
          title={{ "off": "Screenshot mode: tap to blur names", "names": "Blurring names — tap to also blur avatars", "all": "Blurring names & avatars — tap to disable" }[anonymize]}
          className={`flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-xl border transition-colors ${
            anonymize === "off"
              ? "border-border/50 bg-card/50 text-muted-foreground hover:text-foreground hover:bg-accent"
              : anonymize === "names"
              ? "border-amber-500/60 bg-amber-500/10 text-amber-500"
              : "border-primary/60 bg-primary/10 text-primary"
          }`}>
          {anonymize === "off" ? <Camera className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </button>
      </div>

      {/* Content */}
      <div className="space-y-4">
        {/* Groups section — header always visible */}
        <div>
          <div className="flex items-center gap-2 mb-2 px-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Groups</p>
            <div className="flex-1 h-px bg-border/50" />
            {groupControls(rootGroups.length > 0)}
          </div>
          {rootGroups.length > 0 && showFolders && (
            <FolderGroupsSection
              alters={effectiveAlters.filter((a) => !a.is_archived)}
              sortDir={sortMode === "alpha-desc" ? "desc" : "asc"}
              activeSessions={activeSessions}
            />
          )}
          {rootGroups.length === 0 && (
            <p className="text-xs text-muted-foreground px-1 pb-1">No groups yet — tap + to create one.</p>
          )}
        </div>

        {/* Alters list/grid */}
        <div>
          <div className="flex items-center gap-2 mb-3 px-1" data-tour="alter-view-toggle">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{terms.Alters}</p>
            <div className="flex-1 h-px bg-border/50" />
            {/* List / Grid toggle */}
            <div className="flex items-center gap-0.5 bg-muted/30 rounded-lg p-0.5">
              <button
                onClick={setViewList}
                title="List view"
                className={`flex items-center justify-center w-6 h-6 rounded-md transition-colors ${!isGrid ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                <List className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={setViewGrid}
                title="Grid view"
                className={`flex items-center justify-center w-6 h-6 rounded-md transition-colors ${isGrid ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                <Grid3X3 className="w-3.5 h-3.5" />
              </button>
            </div>
            {/* Column count — grid mode only */}
            {isGrid && (
              <div className="flex items-center gap-0.5 bg-muted/30 rounded-lg p-0.5">
                {[2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    onClick={() => setGridCols(n)}
                    className={`flex items-center justify-center w-6 h-6 rounded-md text-[11px] font-bold transition-colors ${displayMode === String(n) ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                    {n}
                  </button>
                ))}
              </div>
            )}
          </div>
          {filtered.length > 0 ?
          displayMode === "list" ?
          <div className="mx-auto flex flex-col gap-2">
            {filtered.map((alter, i) =>
              <AlterCard key={alter.id} alter={alter} index={i} activeSessions={activeSessions} anonymize={anonymize} />
            )}
          </div> :

          <AlterGridView alters={filtered} activeSessions={activeSessions} allAlters={effectiveAlters} cols={parseInt(displayMode)} anonymize={anonymize} /> :


          <div className="flex flex-col items-center justify-center py-20 text-center px-4">
              <div className="text-4xl mb-3">{search ? "🔍" : hideGrouped ? "📁" : "👥"}</div>
              <p className="text-sm font-medium text-foreground mb-1">
                {search ? "No matches found" : hideGrouped ? `All ${terms.alters} are in groups` : `No ${terms.alters} yet`}
              </p>
              <p className="text-xs text-muted-foreground">
                {search ? `Try a different search term` : hideGrouped ? `Toggle the group filter to see them` : `Add your first ${terms.alter} to get started`}
              </p>
            </div>
          }
        </div>
      </div>

      <CreateGroupModal
        open={createGroupOpen}
        onClose={() => setCreateGroupOpen(false)}
      />
    </div>);

}