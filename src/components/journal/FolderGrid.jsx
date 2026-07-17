import React, { useState, useRef, useEffect } from "react";
import { confirm } from "@/components/shared/ConfirmDialog";
import { Folder, FolderOpen, MoreVertical, Pencil, Trash2 } from "lucide-react";

export default function FolderGrid({ folders, onSelect, onRename, onDelete }) {
  const [menuFor, setMenuFor] = useState(null); // folder path
  const [renamingPath, setRenamingPath] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const longPressRef = useRef(null);
  const longPressedRef = useRef(false);
  const renameInputRef = useRef(null);

  useEffect(() => {
    if (renamingPath && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingPath]);

  if (folders.length === 0) return null;

  const startPress = (path) => {
    longPressedRef.current = false;
    longPressRef.current = setTimeout(() => {
      longPressedRef.current = true;
      setMenuFor(path);
    }, 500);
  };

  const cancelPress = () => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  };

  const handleFolderClick = (path) => {
    if (longPressedRef.current) {
      longPressedRef.current = false;
      return;
    }
    if (renamingPath === path) return;
    onSelect(path);
  };

  const beginRename = (folder) => {
    setRenameValue(folder.name);
    setRenamingPath(folder.path);
    setMenuFor(null);
  };

  const commitRename = (folder) => {
    const trimmed = renameValue.trim();
    setRenamingPath(null);
    if (!trimmed || trimmed === folder.name) return;
    if (onRename) onRename(folder.path, trimmed);
  };

  const cancelRename = () => {
    setRenamingPath(null);
    setRenameValue("");
  };

  const handleDeleteClick = async (folder) => {
    setMenuFor(null);
    if (!onDelete) return;
    const inside = folder.count;
    const subfolderNote = folder.hasChildren ? " Subfolders will also be removed." : "";
    const destination = folder.path.includes("/")
      ? "the parent folder"
      : "the root";
    const msg = inside > 0
      ? `Delete "${folder.name}"? ${inside} ${inside === 1 ? "entry" : "entries"} inside will be moved to ${destination} — entries themselves will NOT be deleted.${subfolderNote}`
      : `Delete the empty folder "${folder.name}"?${subfolderNote}`;
    if ((await confirm(msg))) {
      onDelete(folder.path);
    }
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-6">
      {folders.map((folder) => {
        const isRenaming = renamingPath === folder.path;
        return (
          <div
            key={folder.path}
            className="relative flex flex-col items-start gap-2 p-4 rounded-xl border border-border/60 bg-card hover:border-primary/40 hover:bg-primary/5 transition-all text-left group cursor-pointer"
            onClick={() => !isRenaming && handleFolderClick(folder.path)}
            onPointerDown={() => !isRenaming && startPress(folder.path)}
            onPointerUp={cancelPress}
            onPointerLeave={cancelPress}
            onPointerCancel={cancelPress}
            onContextMenu={(e) => { e.preventDefault(); setMenuFor(folder.path); }}
          >
            {(onRename || onDelete) && !isRenaming && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === folder.path ? null : folder.path); }}
                className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors opacity-60 group-hover:opacity-100"
                aria-label={`Folder actions for ${folder.name}`}
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </button>
            )}
            {folder.hasChildren
              ? <FolderOpen className="w-6 h-6 text-primary/70 group-hover:text-primary transition-colors" />
              : <Folder className="w-6 h-6 text-primary/70 group-hover:text-primary transition-colors" />}
            <div className="w-full">
              {isRenaming ? (
                <input
                  ref={renameInputRef}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onBlur={() => commitRename(folder)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); commitRename(folder); }
                    else if (e.key === "Escape") { e.preventDefault(); cancelRename(); }
                  }}
                  className="w-full text-sm font-medium text-foreground bg-background border border-primary/60 rounded px-1.5 py-0.5 outline-none"
                />
              ) : (
                <p className="text-sm font-medium text-foreground truncate w-full">{folder.name}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {folder.count} {folder.count === 1 ? "entry" : "entries"}
                {folder.hasChildren && " · has subfolders"}
              </p>
            </div>

            {menuFor === folder.path && !isRenaming && (
              <>
                <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setMenuFor(null); }} />
                <div
                  className="absolute top-9 right-2 z-50 bg-popover border border-border rounded-lg shadow-xl py-1 min-w-[8rem]"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  {onRename && (
                    <button
                      type="button"
                      onClick={() => beginRename(folder)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-muted/60 transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Rename
                    </button>
                  )}
                  {onDelete && (
                    <button
                      type="button"
                      onClick={() => handleDeleteClick(folder)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
