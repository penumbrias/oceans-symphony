import React, { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Users, Folder, ArrowDownAZ, ArrowUpAZ, Eye, EyeOff, Settings, Grid3X3, List, Plus, TrendingDown, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import AlterCard from "./AlterCard";
import AlterGridView from "./AlterGridView";
import FolderGroupsSection from "./FolderGroupsSection.jsx";
import CreateGroupModal from "@/components/groups/CreateGroupModal";
import { useTerms } from "@/lib/useTerms";

export default function AlterGrid({ alters, currentSession = null }) {
  const navigate = useNavigate();
  const terms = useTerms();
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState("alpha-asc"); // "alpha-asc" | "alpha-desc" | "most" | "least"
  const [showFolders, setShowFolders] = useState(true);
  const [viewMode, setViewMode] = useState("list"); // "list" | "grid"
  const [createGroupOpen, setCreateGroupOpen] = useState(false);

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

  const filtered = alters.
  filter(
    (a) =>
    !a.is_archived && (
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
    <div className="flex items-center gap-0.5">
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
          onClick={() => setSortMode(m => ({ "alpha-asc": "alpha-desc", "alpha-desc": "most", "most": "least", "least": "alpha-asc" }[m]))}
          title={{ "alpha-asc": "A → Z", "alpha-desc": "Z → A", "most": `Most ${terms.fronting} time first`, "least": `Least ${terms.fronting} time first` }[sortMode]}
          className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-xl border border-border/50 bg-card/50 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
          {sortMode === "alpha-asc" && <ArrowDownAZ className="w-4 h-4" />}
          {sortMode === "alpha-desc" && <ArrowUpAZ className="w-4 h-4" />}
          {sortMode === "most" && <TrendingDown className="w-4 h-4" />}
          {sortMode === "least" && <TrendingUp className="w-4 h-4" />}
        </button>

        {/* View mode */}
        <button
          onClick={() => setViewMode(viewMode === "list" ? "grid" : "list")}
          title={viewMode === "list" ? "Switch to grid view" : "Switch to list view"}
          className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-xl border border-border/50 bg-card/50 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
          {viewMode === "list" ? <Grid3X3 className="w-4 h-4" /> : <List className="w-4 h-4" />}
        </button>
      </div>

      {/* Content */}
      <div className="space-y-4">
        {/* Groups section */}
        {rootGroups.length > 0 && showFolders && (
          <FolderGroupsSection
            alters={alters.filter((a) => !a.is_archived)}
            sortDir={sortMode === "alpha-desc" ? "desc" : "asc"}
            activeSessions={activeSessions}
            headerControls={groupControls(true)}
          />
        )}

        {/* Alters list/grid */}
        <div>
          {rootGroups.length > 0 &&
          <div className="flex items-center gap-2 mb-3 px-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{terms.Alters}</p>
            <div className="flex-1 h-px bg-border/50" />
            {!showFolders && groupControls(false)}
          </div>
          }
          {filtered.length > 0 ?
          viewMode === "list" ?
          <div className="mx-auto flex flex-col gap-2">
          {filtered.map((alter, i) =>
  <AlterCard key={alter.id} alter={alter} index={i} activeSessions={activeSessions} />
)}
              </div> :

          <AlterGridView alters={filtered} activeSessions={activeSessions} allAlters={alters} /> :


          <div className="flex flex-col items-center justify-center py-20 text-center px-4">
              <div className="text-4xl mb-3">{search ? "🔍" : "👥"}</div>
              <p className="text-sm font-medium text-foreground mb-1">
                {search ? "No matches found" : `No ${terms.alters} yet`}
              </p>
              <p className="text-xs text-muted-foreground">
                {search ? `Try a different search term` : `Add your first ${terms.alter} to get started`}
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