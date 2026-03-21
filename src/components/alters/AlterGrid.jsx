import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Users, Folder, ArrowDownAZ, ArrowUpAZ } from "lucide-react";
import AlterCard from "./AlterCard";
import GroupFolderView from "./GroupFolderView";

export default function AlterGrid({ alters }) {
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState("groups"); // "grid" | "groups"
  const [sortDir, setSortDir] = useState("asc"); // "asc" | "desc"

  const filtered = alters
    .filter(
      (a) =>
        !a.is_archived &&
        (a.name?.toLowerCase().includes(search.toLowerCase()) ||
          a.role?.toLowerCase().includes(search.toLowerCase()) ||
          a.pronouns?.toLowerCase().includes(search.toLowerCase()))
    )
    .sort((a, b) => {
      const cmp = (a.name || "").localeCompare(b.name || "");
      return sortDir === "asc" ? cmp : -cmp;
    });

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-8">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search system members..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-card/50 border-border/50"
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")}
          className="rounded-xl h-9 px-3 text-xs gap-1.5 border border-border/50 bg-card/50 text-muted-foreground hover:text-foreground"
          title={sortDir === "asc" ? "A → Z" : "Z → A"}
        >
          {sortDir === "asc" ? <ArrowDownAZ className="w-4 h-4" /> : <ArrowUpAZ className="w-4 h-4" />}
          {sortDir === "asc" ? "A–Z" : "Z–A"}
        </Button>
        <div className="flex items-center gap-1 bg-muted/50 rounded-xl p-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setViewMode("grid")}
            className={`rounded-lg px-3 h-8 text-xs gap-1.5 ${viewMode === "grid" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Users className="w-3.5 h-3.5" />
            All
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setViewMode("groups")}
            className={`rounded-lg px-3 h-8 text-xs gap-1.5 ${viewMode === "groups" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Folder className="w-3.5 h-3.5" />
            Groups
          </Button>
        </div>
      </div>

      {/* Views */}
      {viewMode === "groups" ? (
        <GroupFolderView alters={alters.filter((a) => !a.is_archived)} />
      ) : filtered.length > 0 ? (
        <div className="flex flex-col gap-2">
          {filtered.map((alter, i) => (
            <AlterCard key={alter.id} alter={alter} index={i} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
            <Users className="w-7 h-7 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-sm">
            {search ? "No members match your search" : "No system members yet"}
          </p>
        </div>
      )}
    </div>
  );
}