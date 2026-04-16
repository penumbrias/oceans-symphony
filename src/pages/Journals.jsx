import React, { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { motion } from "framer-motion";
import { useSearchParams } from "react-router-dom";
import { Plus, Search, BookOpen, Shuffle, Eye, FolderPlus, ChevronLeft } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import JournalEntryCard from "@/components/journal/JournalEntryCard";
import JournalEditorModal from "@/components/journal/JournalEditorModal";
import JournalViewModal from "@/components/journal/JournalViewModal";
import FolderGrid from "@/components/journal/FolderGrid";

const TABS = [
  { id: "all", label: "All", icon: BookOpen },
  { id: "switch_log", label: "Switch Logs", icon: Shuffle },
];

const getSavedFolders = () => {
  try { return JSON.parse(localStorage.getItem("os_journal_folders") || "[]"); }
  catch { return []; }
};
const persistFolders = (folders) => {
  localStorage.setItem("os_journal_folders", JSON.stringify(folders));
};

// Given a path like "taiga/meadow", returns ["taiga", "taiga/meadow"]
const getAncestors = (path) => {
  const parts = path.split("/");
  return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
};

const getParent = (path) => {
  const parts = path.split("/");
  return parts.length > 1 ? parts.slice(0, -1).join("/") : null;
};

const getDepth = (path) => path.split("/").length - 1;

export default function Journals() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState(null);
  const [fronterOnly, setFronterOnly] = useState(false);
  const [editEntry, setEditEntry] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newEntryFolder, setNewEntryFolder] = useState(null);
  const [viewingFolder, setViewingFolder] = useState(null); // full path e.g. "taiga/meadow"
  const [viewingEntry, setViewingEntry] = useState(null);
  const [savedFolders, setSavedFoldersState] = useState(getSavedFolders);

  const { data: entries = [] } = useQuery({
    queryKey: ["journalEntries"],
    queryFn: () => base44.entities.JournalEntry.list("-created_date"),
  });

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  const { data: groups = [] } = useQuery({
    queryKey: ["groups"],
    queryFn: () => base44.entities.Group.list(),
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["frontHistory"],
    queryFn: () => base44.entities.FrontingSession.list("-start_time", 10),
  });

  const activeSession = sessions.find((s) => s.is_active);
  const currentAlterIds = activeSession
    ? [activeSession.primary_alter_id, ...(activeSession.co_fronter_ids || [])].filter(Boolean)
    : [];
  const currentAlterId = activeSession?.primary_alter_id || null;

  const altersById = useMemo(() =>
    Object.fromEntries(alters.map((a) => [a.id, a])), [alters]);

  const allTags = useMemo(() => {
    const tags = new Set();
    entries.forEach((e) => (e.tags || []).forEach((t) => tags.add(t)));
    return [...tags];
  }, [entries]);

  // All folder paths — merge saved + derived from entries
  const allFolderPaths = useMemo(() => {
    const fromEntries = new Set();
    entries.forEach(e => {
      if (e.folder) {
        // also ensure ancestors exist
        getAncestors(e.folder).forEach(a => fromEntries.add(a));
      }
    });
    const merged = new Set([...savedFolders, ...fromEntries]);
    return [...merged];
  }, [entries, savedFolders]);

  // Folders visible at current level
  const visibleFolders = useMemo(() => {
    return allFolderPaths
      .filter(path => {
        const parent = getParent(path);
        return parent === viewingFolder; // null === null for root
      })
      .map(path => {
        const name = path.split("/").pop();
        const count = entries.filter(e => e.folder === path).length;
        const hasChildren = allFolderPaths.some(p => getParent(p) === path);
        return { path, name, count, hasChildren };
      });
  }, [allFolderPaths, viewingFolder, entries]);

  // Entries visible at current level — only direct children of viewingFolder
  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (tab !== "all" && e.entry_type !== tab) return false;
      if (search && !e.title?.toLowerCase().includes(search.toLowerCase()) &&
          !e.content?.toLowerCase().includes(search.toLowerCase())) return false;
      if (selectedTag && !(e.tags || []).includes(selectedTag)) return false;
      if (e.folder !== viewingFolder) return false;
      if (fronterOnly && currentAlterIds.length > 0) {
        const allowed = e.allowed_alter_ids || [];
        if (allowed.length > 0 && !allowed.some((id) => currentAlterIds.includes(id))) return false;
      }
      return true;
    });
  }, [entries, tab, search, selectedTag, viewingFolder, fronterOnly, currentAlterIds]);

  const openNew = (folder = null) => { setEditEntry(null); setNewEntryFolder(folder); setShowEditor(true); };
  const openEntry = (entry) => { setViewingEntry(entry); };
  const openEdit = (entry) => { setEditEntry(entry); setNewEntryFolder(null); setShowEditor(true); };

  const [searchParams] = useSearchParams();
  const pendingId = searchParams.get('id');
  const [highlightId, setHighlightId] = useState(() => searchParams.get('id'));

  useEffect(() => {
    if (pendingId && entries.length > 0) {
      const entry = entries.find(e => e.id === pendingId);
      if (entry) setViewingEntry(entry);
    }
  }, [pendingId, entries.length]);

  useEffect(() => {
    if (highlightId) {
      const timer = setTimeout(() => setHighlightId(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [highlightId]);

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;
    const name = newFolderName.trim();
    // Build full path based on current location
    const fullPath = viewingFolder ? `${viewingFolder}/${name}` : name;
    if (!savedFolders.includes(fullPath)) {
      const updated = [...savedFolders, fullPath];
      persistFolders(updated);
      setSavedFoldersState(updated);
    }
    setShowNewFolder(false);
    setNewFolderName("");
    setViewingFolder(fullPath);
  };

  const handleDeleteFolder = (path) => {
    // Remove folder and all its descendants
    const updated = savedFolders.filter(f => f !== path && !f.startsWith(`${path}/`));
    persistFolders(updated);
    setSavedFoldersState(updated);
  };

  // Breadcrumb path segments
  const breadcrumbs = viewingFolder ? viewingFolder.split("/") : [];

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          {viewingFolder && (
            <Button variant="ghost" size="icon" onClick={() => setViewingFolder(getParent(viewingFolder))} className="h-8 w-8">
              <ChevronLeft className="w-4 h-4" />
            </Button>
          )}
          <div>
            {/* Breadcrumb */}
            <div className="flex items-center gap-1 flex-wrap">
              <button onClick={() => setViewingFolder(null)}
                className={`font-display text-2xl font-semibold transition-colors ${viewingFolder ? "text-muted-foreground hover:text-foreground" : "text-foreground"}`}>
                Journals
              </button>
              {breadcrumbs.map((crumb, i) => {
                const path = breadcrumbs.slice(0, i + 1).join("/");
                const isLast = i === breadcrumbs.length - 1;
                return (
                  <React.Fragment key={path}>
                    <span className="text-muted-foreground text-2xl font-light">/</span>
                    <button onClick={() => setViewingFolder(path)}
                      className={`font-display text-2xl font-semibold transition-colors ${isLast ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                      {crumb}
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
            <p className="text-muted-foreground text-sm mt-0.5">
              {viewingFolder ? `${filtered.length} entries` : `${entries.length} entries`}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowNewFolder(true)} className="gap-1.5">
            <FolderPlus className="w-4 h-4" />
            {viewingFolder ? "New Subfolder" : "New Folder"}
          </Button>
          <Button onClick={() => openNew(viewingFolder)} className="bg-primary hover:bg-primary/90 gap-1.5">
            <Plus className="w-4 h-4" />
            New Entry
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-muted/40 p-1 rounded-xl w-fit">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                tab === t.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}>
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search entries..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        {currentAlterIds.length > 0 && (
          <Button variant={fronterOnly ? "default" : "outline"} size="sm"
            onClick={() => setFronterOnly(!fronterOnly)}
            className={`gap-1.5 ${fronterOnly ? "bg-primary hover:bg-primary/90" : ""}`}>
            <Eye className="w-3.5 h-3.5" />
            Fronter view
          </Button>
        )}
      </div>

      {/* Tag filters */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {allTags.map((tag) => (
            <button key={tag} onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                selectedTag === tag ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:border-border"
              }`}>
              #{tag}
            </button>
          ))}
        </div>
      )}

      {/* Subfolders */}
      {visibleFolders.length > 0 && (
        <FolderGrid
          folders={visibleFolders}
          onSelect={(path) => setViewingFolder(path)}
          onDelete={handleDeleteFolder}
        />
      )}

      {/* Entries */}
      {filtered.length === 0 && visibleFolders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <BookOpen className="w-10 h-10 text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground text-sm">
            {viewingFolder ? "No entries in this folder yet." : "No journal entries yet."}
          </p>
          <Button variant="link" onClick={() => openNew(viewingFolder)} className="mt-1 text-primary text-sm">
            {viewingFolder ? "Add the first entry" : "Write your first entry"}
          </Button>
        </div>
      ) : filtered.length > 0 ? (
        <>
          {visibleFolders.length > 0 && (
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Entries</p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {filtered.map((entry) => (
              <JournalEntryCard
                key={entry.id}
                entry={entry}
                altersById={altersById}
                onClick={() => openEntry(entry)}
                highlight={highlightId === entry.id}
              />
            ))}
          </div>
        </>
      ) : null}

      <JournalViewModal
        open={!!viewingEntry}
        onClose={() => setViewingEntry(null)}
        entry={viewingEntry}
        altersById={altersById}
        onEdit={(entry) => openEdit(entry)}
      />

      <JournalEditorModal
        key={editEntry?.id || "new"}
        open={showEditor}
        onClose={() => { setShowEditor(false); setNewEntryFolder(null); }}
        entry={editEntry}
        alters={alters}
        groups={groups}
        currentAlterId={currentAlterId}
        defaultFolder={newEntryFolder}
      />

      <Dialog open={showNewFolder} onOpenChange={setShowNewFolder}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderPlus className="w-4 h-4 text-primary" />
              {viewingFolder ? `New subfolder in "${viewingFolder.split("/").pop()}"` : "New Folder"}
            </DialogTitle>
          </DialogHeader>
          <Input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
            placeholder={viewingFolder ? "Subfolder name..." : "Folder name..."}
            autoFocus
          />
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setShowNewFolder(false)}>Cancel</Button>
            <Button onClick={handleCreateFolder} disabled={!newFolderName.trim()} className="bg-primary hover:bg-primary/90">
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}