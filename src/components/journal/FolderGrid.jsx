import React from "react";
import { Folder, FolderOpen, X } from "lucide-react";

export default function FolderGrid({ folders, onSelect, onDelete }) {
  if (folders.length === 0) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-6">
      {folders.map((folder) => (
        <button key={folder.path} onClick={() => onSelect(folder.path)}
          className="relative flex flex-col items-start gap-2 p-4 rounded-xl border border-border/60 bg-card hover:border-primary/40 hover:bg-primary/5 transition-all text-left group">
          {onDelete && folder.count === 0 && !folder.hasChildren && (
            <span role="button"
              onClick={(e) => { e.stopPropagation(); onDelete(folder.path); }}
              className="absolute top-2 right-2 w-5 h-5 flex items-center justify-center rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100">
              <X className="w-3 h-3" />
            </span>
          )}
          {folder.hasChildren
            ? <FolderOpen className="w-6 h-6 text-primary/70 group-hover:text-primary transition-colors" />
            : <Folder className="w-6 h-6 text-primary/70 group-hover:text-primary transition-colors" />}
          <div>
            <p className="text-sm font-medium text-foreground truncate w-full">{folder.name}</p>
            <p className="text-xs text-muted-foreground">
              {folder.count} {folder.count === 1 ? "entry" : "entries"}
              {folder.hasChildren && " · has subfolders"}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}