import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Search, Users } from "lucide-react";
import AlterCard from "./AlterCard";

export default function AlterGrid({ alters }) {
  const [search, setSearch] = useState("");

  const filtered = alters.filter(
    (a) =>
      !a.is_archived &&
      (a.name?.toLowerCase().includes(search.toLowerCase()) ||
        a.role?.toLowerCase().includes(search.toLowerCase()) ||
        a.pronouns?.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div>
      {/* Search */}
      <div className="relative max-w-sm mb-8">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search system members..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 bg-card/50 border-border/50"
        />
      </div>

      {/* Grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
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