import React from "react";
import { Folder } from "lucide-react";

export default function FolderGrid({ folders, onSelect }) {
  if (folders.length === 0) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-6">
      {folders.map((folder) => (
        <button
          key={folder.name}
          onClick={() => onSelect(folder.name)}
          className="flex flex-col items-start gap-2 p-4 rounded-xl border border-border/60 bg-card hover:border-primary/40 hover:bg-primary/5 transition-all text-left group"
        >
          <Folder className="w-6 h-6 text-primary/70 group-hover:text-primary transition-colors" />
          <div>
            <p className="text-sm font-medium text-foreground truncate w-full">{folder.name}</p>
            <p className="text-xs text-muted-foreground">{folder.count} {folder.count === 1 ? "entry" : "entries"}</p>
          </div>
        </button>
      ))}
    </div>
  );
}