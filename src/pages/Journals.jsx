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

export default function Journals() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState(null);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [fronterOnly, setFronterOnly] = useState(false);
  const [editEntry, setEditEntry] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newEntryFolder, setNewEntryFolder] = useState(null);
  const [viewingFolder, setViewingFolder] = useState(null);
  const [viewingEntry, setViewingEntry] = useState(null);

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

  // Collect all tags and folders
  const allTags = useMemo(() => {
    const tags = new Set();
    entries.forEach((e) => (e.tags || []).forEach((t) => tags.add(t)));
    return [...tags];
  }, [entries]);

  const allFolders = useMemo(() => {
    const folderMap = {};
    entries.forEach((e) => {
      if (e.folder) {
        folderMap[e.folder] = (folderMap[e.folder] || 0) + 1;
      }
    });
    return Object.entries(folderMap).map(([name, count]) => ({ name, count }));
  }, [entries]);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (tab !== "all" && e.entry_type !== tab) return false;
      if (search && !e.title?.toLowerCase().includes(search.toLowerCase()) &&
          !e.content?.toLowerCase().includes(search.toLowerCase())) return false;
      if (selectedTag && !(e.tags || []).includes(selectedTag)) return false;
      // When viewing a folder, only show entries in that folder
      if (viewingFolder !== null) {
        if (e.folder !== viewingFolder) return false;
      } else if (selectedFolder) {
        if (e.folder !== selectedFolder) return false;
      }
      if (fronterOnly && currentAlterIds.length > 0) {
        const allowed = e.allowed_alter_ids || [];
        if (allowed.length > 0 && !allowed.some((id) => currentAlterIds.includes(id))) return false;
      }
      return true;
    });
  }, [entries, tab, search, selectedTag, selectedFolder, viewingFolder, fronterOnly, currentAlterIds]);

  const openNew = (folder = null) => { setEditEntry(null); setNewEntryFolder(folder); setShowEditor(true); };
  const openEntry = (entry) => { setViewingEntry(entry); };
  const openEdit = (entry) => { setEditEntry(entry); setNewEntryFolder(null); setShowEditor(true); };

  // Open specific entry from URL ?id= param (e.g. from timeline double-click)

  useEffect(() => {
    if (pendingId && entries.length > 0) {
      const entry = entries.find(e => e.id === pendingId);
      if (entry) setViewingEntry(entry);
    }
  }, [pendingId, entries.length]);

const [searchParams] = useSearchParams();
const pendingId = searchParams.get('id');
const [highlightId, setHighlightId] = useState(() => searchParams.get('id'));

useEffect(() => {
  if (highlightId) {
    const timer = setTimeout(() => setHighlightId(null), 5000);
    return () => clearTimeout(timer);
  }
}, [highlightId]);

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    const name = newFolderName.trim();
    // Check if folder already exists
    if (allFolders.some((f) => f.name === name)) {
      setShowNewFolder(false);
      setNewFolderName("");
      setViewingFolder(name);
      return;
    }
    // Create a placeholder entry to persist the folder
    await base44.entities.JournalEntry.create({
      title: `${name} — Welcome`,
      content: `First entry in the **${name}** folder.`,
      folder: name,
      entry_type: "personal",
    });
    queryClient.invalidateQueries({ queryKey: ["journalEntries"] });
    setShowNewFolder(false);
    setNewFolderName("");
    setViewingFolder(name);
  };

  // Entries with no folder (for the main view)
  const unfolderedEntries = useMemo(() =>
    filtered.filter((e) => !e.folder), [filtered]);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          {viewingFolder && (
            <Button variant="ghost" size="icon" onClick={() => setViewingFolder(null)} className="h-8 w-8">
              <ChevronLeft className="w-4 h-4" />
            </Button>
          )}
          <div>
            <h1 className="font-display text-3xl font-semibold text-foreground">
              {viewingFolder || "Journals"}
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              {viewingFolder ? `${filtered.length} entries` : `${entries.length} entries`}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {!viewingFolder && (
            <Button variant="outline" onClick={() => setShowNewFolder(true)} className="gap-1.5">
              <FolderPlus className="w-4 h-4" />
              New Folder
            </Button>
          )}
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
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                tab === t.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
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
          <Input
            placeholder="Search entries..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {currentAlterIds.length > 0 && (
          <Button
            variant={fronterOnly ? "default" : "outline"}
            size="sm"
            onClick={() => setFronterOnly(!fronterOnly)}
            className={`gap-1.5 ${fronterOnly ? "bg-primary hover:bg-primary/90" : ""}`}
          >
            <Eye className="w-3.5 h-3.5" />
            Fronter view
          </Button>
        )}
      </div>

      {/* Tag filters */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                selectedTag === tag
                  ? "border-primary/60 bg-primary/10 text-primary"
                  : "border-border/50 text-muted-foreground hover:border-border"
              }`}
            >
              #{tag}
            </button>
          ))}
        </div>
      )}

      {/* Folder grid (only when not inside a folder) */}
      {!viewingFolder && allFolders.length > 0 && (
        <FolderGrid folders={allFolders} onSelect={setViewingFolder} />
      )}

      {/* Entries */}
      {viewingFolder ? (
        // Inside a folder — show all filtered entries
        filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <BookOpen className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground text-sm">No entries in this folder yet.</p>
            <Button variant="link" onClick={() => openNew(viewingFolder)} className="mt-1 text-primary text-sm">
              Add the first entry
            </Button>
          </div>
        ) : (
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
        )
      ) : (
        // Root view — show unfoldered entries below the folder grid
        <>
          {unfolderedEntries.length === 0 && allFolders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <BookOpen className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground text-sm">No journal entries yet.</p>
              <Button variant="link" onClick={() => openNew()} className="mt-1 text-primary text-sm">
                Write your first entry
              </Button>
            </div>
          ) : unfolderedEntries.length > 0 ? (
            <>
              {allFolders.length > 0 && (
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">All entries</p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                {unfolderedEntries.map((entry) => (
<JournalEntryCard 
  key={entry.id} 
  entry={entry} 
  altersById={altersById} 
  onClick={() => openEntry(entry)}
  highlight={highlightId === entry.id}
/>                ))}
              </div>
            </>
          ) : null}
        </>
      )}

      <JournalViewModal
        open={!!viewingEntry}
        onClose={() => setViewingEntry(null)}
        entry={viewingEntry}
        altersById={altersById}
        onEdit={(entry) => openEdit(entry)}
      />

      <JournalEditorModal
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
              New Folder
            </DialogTitle>
          </DialogHeader>
          <Input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
            placeholder="Folder name..."
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