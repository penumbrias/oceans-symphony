import React, { useState } from "react";
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

  const activeFront = sessions.find((s) => s.is_active);

  const filtered = alters.
  filter(
    (a) =>
    !a.is_archived && (
    a.name?.toLowerCase().includes(search.toLowerCase()) ||
    a.role?.toLowerCase().includes(search.toLowerCase()) ||
    a.pronouns?.toLowerCase().includes(search.toLowerCase()))
  ).
  sort((a, b) => {
    const cmp = (a.name || "").localeCompare(b.name || "");
    return sortDir === "asc" ? cmp : -cmp;
  });

  // Root-level groups for display
  const rootGroups = allGroups.filter((g) => !g.parent || g.parent === "" || g.parent === "root");

  return (
    <div>
      {/* Toolbar */}
      <div className="my-5 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={`Search ${terms.alters}...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-card/50 border-border/50" />
          
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")} className="bg-card/50 text-muted-foreground px-1 text-xs font-medium rounded-xl inline-flex items-center justify-center whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent h-9 gap-1.5 border border-border/50 hover:text-foreground"

          title={sortDir === "asc" ? "A → Z" : "Z → A"}>
          
          {sortDir === "asc" ? <ArrowDownAZ className="w-4 h-4" /> : <ArrowUpAZ className="w-4 h-4" />}
          {sortDir === "asc" ? "A–Z" : "Z–A"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowFolders(!showFolders)} className="bg-card/50 text-muted-foreground px-1 text-xs font-medium rounded-xl inline-flex items-center justify-center whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent h-9 gap-1.5 border border-border/50 hover:text-foreground"

          title={showFolders ? "Hide groups" : "Show groups"}>
          
          {showFolders ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          {showFolders ? "Groups" : "No groups"}
        </Button>
        <Button
          variant={viewMode === "list" ? "default" : "outline"}
          size="sm"
          onClick={() => setViewMode("list")} className="bg-primary text-primary-foreground px-1 text-xs font-medium rounded-xl inline-flex items-center justify-center whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 shadow hover:bg-primary/90 h-9 gap-1.5"

          title="List view">
          
          <List className="w-4 h-4" />
        </Button>
        <Button
          variant={viewMode === "grid" ? "default" : "outline"}
          size="sm"
          onClick={() => setViewMode("grid")} className="bg-background px-1 text-xs font-medium rounded-xl inline-flex items-center justify-center whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input shadow-sm hover:bg-accent hover:text-accent-foreground h-9 gap-1.5"

          title="Grid view">
          
          <Grid3X3 className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/groups")} className="bg-card/50 text-muted-foreground px-1 text-xs font-thin lowercase rounded-xl inline-flex items-center justify-center whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent h-9 gap-1.5 border border-border/50 hover:text-foreground"

          title="Manage groups">
          
          <Settings className="w-4 h-4" />
          Manage Groups
        </Button>
      </div>

      {/* Content */}
      <div className="space-y-8">
        {/* Folders section */}
        {showFolders && rootGroups.length > 0 &&
        <FolderGroupsSection alters={alters.filter((a) => !a.is_archived)} sortDir={sortDir} currentSession={activeFront} />
        }

        {/* Alters list/grid */}
        <div>
          {showFolders && rootGroups.length > 0 &&
          <h3 className="text-xs font-medium text-muted-foreground mb-3 px-1">{terms.Alters}</h3>
          }
          {filtered.length > 0 ?
          viewMode === "list" ?
          <div className="flex flex-col gap-2">
                {filtered.map((alter, i) =>
            <AlterCard key={alter.id} alter={alter} index={i} />
            )}
              </div> :

          <AlterGridView alters={filtered} currentSession={activeFront} allAlters={alters} /> :


          <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
                <Users className="w-7 h-7 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground text-sm">
                {search ? `No ${terms.alters} match your search` : `No ${terms.alters} yet`}
              </p>
            </div>
          }
        </div>
      </div>
    </div>);

}