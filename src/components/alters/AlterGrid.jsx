import React, { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Users, Folder, ArrowDownAZ, ArrowUpAZ, Eye, EyeOff, Settings, Grid3X3, List } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import AlterCard from "./AlterCard";
import AlterGridView from "./AlterGridView";
import FolderGroupsSection from "./FolderGroupsSection.jsx";
import { useTerms } from "@/lib/useTerms";

export default function AlterGrid({ alters, currentSession = null }) {
  const navigate = useNavigate();
  const terms = useTerms();
  const [search, setSearch] = useState("");
  const [sortDir, setSortDir] = useState("asc"); // "asc" | "desc"
  const [showFolders, setShowFolders] = useState(true);
  const [viewMode, setViewMode] = useState("list"); // "list" | "grid"

  const { data: allGroups = [] } = useQuery({
    queryKey: ["groups"],
    queryFn: () => base44.entities.Group.list()
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["frontHistory"],
    queryFn: () => base44.entities.FrontingSession.list("-start_time", 50)
  });

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
    const cmp = (a.name || "").localeCompare(b.name || "");
    return sortDir === "asc" ? cmp : -cmp;
  });

  // Root-level groups for display
  const rootGroups = allGroups.filter((g) => !g.parent || g.parent === "" || g.parent === "root");

  return (
    <div>
      {/* Toolbar */}
      <div className="my-1 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none" style={{ WebkitOverflowScrolling: "touch" }}>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={`Search ${terms.alters}...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)} className="bg-transparent text-foreground pl-10 px-3 py-1 text-base rounded-md flex h-9 w-full border shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm border-border/50" />
          
          
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")} className="bg-card/50 text-muted-foreground px-1 text-xs font-light lowercase rounded-xl inline-flex items-center justify-center whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent h-9 gap-1.5 border border-border/50 hover:text-foreground"

          title={sortDir === "asc" ? "A → Z" : "Z → A"}>
          
          {sortDir === "asc" ? <ArrowDownAZ className="w-4 h-4" /> : <ArrowUpAZ className="w-4 h-4" />}
          {sortDir === "asc" ? "" : ""}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowFolders(!showFolders)} className="bg-card/50 text-muted-foreground px-1 text-xs font-light lowercase rounded-xl inline-flex items-center justify-center whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent h-9 gap-1.5 border border-border/50 hover:text-foreground"

          title={showFolders ? "Hide groups" : "Show groups"}>
          
          {showFolders ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          {showFolders ? "groups" : "groups"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setViewMode(viewMode === "list" ? "grid" : "list")}
          className="bg-card/50 text-muted-foreground px-1 text-xs font-light rounded-xl inline-flex items-center justify-center whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent h-9 gap-1.5 border border-border/50 hover:text-foreground"
          title={viewMode === "list" ? "Switch to grid view" : "Switch to list view"}>
          {viewMode === "list" ? <Grid3X3 className="w-4 h-4" /> : <List className="w-4 h-4" />}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/groups")} className="bg-card/50 text-muted-foreground px-1 text-xs font-light lowercase rounded-xl inline-flex items-center justify-center whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent h-9 gap-1.5 border border-border/50 hover:text-foreground"

          title="Manage groups">
          
          <Settings className="w-4 h-4" />
          Groups
        </Button>
      </div>

      {/* Content */}
      <div className="space-y-8">
        {/* Folders section */}
        {showFolders && rootGroups.length > 0 &&
        <FolderGroupsSection alters={alters.filter((a) => !a.is_archived)} sortDir={sortDir} activeSessions={activeSessions} />
        }

        {/* Alters list/grid */}
        <div>
          {showFolders && rootGroups.length > 0 &&
          <div className="flex items-center gap-2 mb-3 px-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{terms.Alters}</p>
            <div className="flex-1 h-px bg-border/50" />
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
    </div>);

}