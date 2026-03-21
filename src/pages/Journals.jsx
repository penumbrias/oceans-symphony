import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { motion } from "framer-motion";
import { Plus, Search, BookOpen, Shuffle, Filter, Eye, Folder, FolderPlus } from "lucide-react";
import { Input as DialogInput } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import JournalEntryCard from "@/components/journal/JournalEntryCard";
import JournalEditorModal from "@/components/journal/JournalEditorModal";

const TABS = [
  { id: "all", label: "All", icon: BookOpen },
  { id: "personal", label: "Personal", icon: BookOpen },
  { id: "switch_log", label: "Switch Logs", icon: Shuffle },
];

export default function Journals() {
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

  const { data: entries = [] } = useQuery({
    queryKey: ["journalEntries"],
    queryFn: () => base44.entities.JournalEntry.list("-created_date"),
  });

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
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
    const folders = new Set();
    entries.forEach((e) => { if (e.folder) folders.add(e.folder); });
    return [...folders];
  }, [entries]);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (tab !== "all" && e.entry_type !== tab) return false;
      if (search && !e.title?.toLowerCase().includes(search.toLowerCase()) &&
          !e.content?.toLowerCase().includes(search.toLowerCase())) return false;
      if (selectedTag && !(e.tags || []).includes(selectedTag)) return false;
      if (selectedFolder && e.folder !== selectedFolder) return false;
      if (fronterOnly && currentAlterIds.length > 0) {
        const allowed = e.allowed_alter_ids || [];
        if (allowed.length > 0 && !allowed.some((id) => currentAlterIds.includes(id))) return false;
      }
      return true;
    });
  }, [entries, tab, search, selectedTag, selectedFolder, fronterOnly, currentAlterIds]);

  const openNew = (folder = null) => { setEditEntry(null); setNewEntryFolder(folder); setShowEditor(true); };
  const openEntry = (entry) => { setEditEntry(entry); setNewEntryFolder(null); setShowEditor(true); };

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;
    setShowNewFolder(false);
    openNew(newFolderName.trim());
    setNewFolderName("");
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-display text-3xl font-semibold text-foreground">Journals</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{entries.length} entries</p>
        </div>
        <Button onClick={openNew} className="bg-primary hover:bg-primary/90 gap-1.5">
          <Plus className="w-4 h-4" />
          New Entry
        </Button>
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
        <div className="flex flex-wrap gap-1.5 mb-3">
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

      {/* Folder filters */}
      {allFolders.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {allFolders.map((f) => (
            <button
              key={f}
              onClick={() => setSelectedFolder(selectedFolder === f ? null : f)}
              className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-all ${
                selectedFolder === f
                  ? "border-primary/60 bg-primary/10 text-primary"
                  : "border-border/50 text-muted-foreground hover:border-border"
              }`}
            >
              <Folder className="w-3 h-3" />
              {f}
            </button>
          ))}
        </div>
      )}

      {/* Entries grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <BookOpen className="w-10 h-10 text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground text-sm">No journal entries yet.</p>
          <Button variant="link" onClick={openNew} className="mt-1 text-primary text-sm">
            Write your first entry
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
            />
          ))}
        </div>
      )}

      <JournalEditorModal
        open={showEditor}
        onClose={() => setShowEditor(false)}
        entry={editEntry}
        alters={alters}
        currentAlterId={currentAlterId}
      />
    </motion.div>
  );
}