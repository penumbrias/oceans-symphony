import React from "react";
import { format } from "date-fns";
import { BookOpen, Shuffle, Tag, Folder, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function JournalEntryCard({ entry, altersById, onClick }) {
  const isSwitch = entry.entry_type === "switch_log";
  const isRestricted = entry.allowed_alter_ids?.length > 0;
  const author = altersById?.[entry.author_alter_id];

  return (
    <div
      onClick={onClick}
      className="bg-card border border-border/50 rounded-xl p-4 cursor-pointer hover:border-border hover:shadow-sm transition-all group"
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          {isSwitch ? (
            <Shuffle className="w-3.5 h-3.5 text-primary flex-shrink-0" />
          ) : (
            <BookOpen className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          )}
          <p className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
            {entry.title}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {isRestricted && <Lock className="w-3 h-3 text-muted-foreground/60" />}
          {entry.folder && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded-md">
              <Folder className="w-2.5 h-2.5" />
              {entry.folder}
            </span>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground mb-2">
        {format(new Date(entry.created_date), "MMM d, yyyy · h:mm a")}
        {author && <span className="ml-1.5">· by {author.name}</span>}
      </p>

      {entry.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {entry.tags.map((tag) => (
            <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/8 text-primary border border-primary/20">
              #{tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}