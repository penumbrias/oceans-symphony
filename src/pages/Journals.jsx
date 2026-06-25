import React, { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { useSearchParams } from "react-router-dom";
import { Plus, Search, BookOpen, Shuffle, Eye, FolderPlus, ChevronLeft, UserRound, ChevronDown, X } from "lucide-react";
import { useMentionHighlight } from "@/lib/useMentionHighlight";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import JournalEntryCard from "@/components/journal/JournalEntryCard";
import JournalEditorModal from "@/components/journal/JournalEditorModal";
import JournalViewModal from "@/components/journal/JournalViewModal";
import FolderGrid from "@/components/journal/FolderGrid";
import AlterTreeSelect from "@/components/shared/AlterTreeSelect";
import { useTerms } from "@/lib/useTerms";

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
  const terms = useTerms();
  const TABS = [
    { id: "all", label: "All", icon: BookOpen },
    { id: "switch_log", label: `${terms.Switch} Logs`, icon: Shuffle },
  ];
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState(null);
  const [selectedAuthorId, setSelectedAuthorId] = useState(null);
  const [showAuthorFilter, setShowAuthorFilter] = useState(false);
  const [authorFilterSearch, setAuthorFilterSearch] = useState("");
  // The author dropdown is fixed-positioned (anchored to its trigger) so
  // it escapes the toolbar's overflow-x clipping — otherwise its scroll
  // area was clipped and the list couldn't be scrolled.
  const authorMenuTriggerRef = useRef(null);
  const [authorMenuPos, setAuthorMenuPos] = useState({ top: 0, left: 0, width: 208 });
  const [fronterOnly, setFronterOnly] = useState(false);
  // Fronter-view refinement menu. `fronterFilterIds === null` means
  // "auto-track currently-fronting alters"; a Set means the user has
  // explicitly refined the selection via the dropdown. Persists for the
  // page lifetime only (intentional — not stored across reloads).
  const [fronterMenuOpen, setFronterMenuOpen] = useState(false);
  const [fronterFilterIds, setFronterFilterIds] = useState(null);
  const fronterPressTimerRef = useRef(null);
  const fronterLongPressedRef = useRef(false);
  // Smart-positioned popover: anchored via getBoundingClientRect() and
  // rendered with position:fixed so it can't push the document past the
  // viewport width and cause horizontal scroll. See computeFronterMenuPos
  // below for the alignment heuristic.
  const fronterMenuTriggerRef = useRef(null);
  const [fronterMenuPos, setFronterMenuPos] = useState({ top: 0, left: 0, maxWidth: 240 });
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

  const { data: activeSessions = [] } = useQuery({
    queryKey: ["activeFront"],
    queryFn: () => base44.entities.FrontingSession.filter({ is_active: true }),
  });

  const primarySession = activeSessions.find((s) => s.is_primary) || activeSessions[0];
  const currentAlterId = primarySession?.alter_id || primarySession?.primary_alter_id || null;
  const currentAlterIds = activeSessions
    .map((s) => s.alter_id || s.primary_alter_id)
    .filter(Boolean);

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

  // Alters who have authored at least one journal entry (for filter dropdown)
  const authoredAlterIds = useMemo(() => {
    const ids = new Set();
    entries.forEach(e => {
      if (e.author_alter_id) ids.add(e.author_alter_id);
      (e.co_author_alter_ids || []).forEach(id => ids.add(id));
    });
    return [...ids];
  }, [entries]);

  // Entries visible at current level — only direct children of viewingFolder
  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (tab !== "all" && e.entry_type !== tab) return false;
      if (search && !e.title?.toLowerCase().includes(search.toLowerCase()) &&
          !e.content?.toLowerCase().includes(search.toLowerCase())) return false;
      if (selectedTag && !(e.tags || []).includes(selectedTag)) return false;
      if ((e.folder || null) !== viewingFolder) return false;
      if (selectedAuthorId) {
        const isAuthor = e.author_alter_id === selectedAuthorId;
        const isCoAuthor = (e.co_author_alter_ids || []).includes(selectedAuthorId);
        if (!isAuthor && !isCoAuthor) return false;
      }
      if (fronterOnly) {
        // Use the explicit refinement set if the user opened the menu and
        // adjusted it; otherwise auto-track the currently-fronting alters.
        const activeFilterIds = fronterFilterIds
          ? [...fronterFilterIds]
          : currentAlterIds;
        if (activeFilterIds.length === 0) return false;
        const author = e.author_alter_id;
        const coAuthors = e.co_author_alter_ids || [];
        const matches =
          (author && activeFilterIds.includes(author)) ||
          coAuthors.some((id) => activeFilterIds.includes(id));
        if (!matches) return false;
      }
      return true;
    });
  }, [entries, tab, search, selectedTag, viewingFolder, selectedAuthorId, fronterOnly, fronterFilterIds, currentAlterIds]);

  const openNew = (folder = null) => { setEditEntry(null); setNewEntryFolder(folder); setShowEditor(true); };
  const openEntry = (entry) => { setViewingEntry(entry); };
  const openEdit = (entry) => { setEditEntry(entry); setNewEntryFolder(null); setShowEditor(true); };

  const [searchParams] = useSearchParams();
  const pendingId = searchParams.get('id');
  const pendingFolder = searchParams.get('folder');

  useEffect(() => {
    if (pendingId && entries.length > 0) {
      const entry = entries.find(e => e.id === pendingId);
      if (entry) setViewingEntry(entry);
    }
  }, [pendingId, entries.length]);

  // Deep-link to a folder (e.g. an inserted "📁 Dreams" link → /journals?folder=Dreams)
  // — open that folder instead of dumping the user at the root listing.
  useEffect(() => {
    if (pendingFolder != null) setViewingFolder(pendingFolder || null);
  }, [pendingFolder]);

  useMentionHighlight("id", entries.length > 0);

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

  const handleDeleteFolder = async (path) => {
    // Move any entries inside this folder (and its descendants) up to the
    // deleted folder's parent — entries themselves are never deleted, per
    // CLAUDE.md user-data-preservation. Top-level folder deletes land
    // entries at root (folder=null); subfolder deletes land them at the
    // parent path.
    const parent = getParent(path); // null for top-level
    const isInside = (folder) => folder === path || (folder && folder.startsWith(`${path}/`));
    const affected = entries.filter((e) => isInside(e.folder));
    await Promise.all(
      affected.map((e) => {
        // For descendants, remove the deleted prefix; for direct children,
        // collapse to the parent (or root).
        let nextFolder = parent;
        if (e.folder && e.folder.startsWith(`${path}/`)) {
          const remainder = e.folder.slice(path.length + 1);
          nextFolder = parent ? `${parent}/${remainder}` : remainder;
        }
        return base44.entities.JournalEntry.update(e.id, { folder: nextFolder });
      })
    );
    const updated = savedFolders.filter((f) => f !== path && !f.startsWith(`${path}/`));
    persistFolders(updated);
    setSavedFoldersState(updated);
    if (viewingFolder === path || (viewingFolder && viewingFolder.startsWith(`${path}/`))) {
      setViewingFolder(parent);
    }
    queryClient.invalidateQueries({ queryKey: ["journalEntries"] });
  };

  // Delete a single journal entry (confirmed in the view modal). The entry is
  // gone for good — journals are the user's own content, so deleting is a
  // deliberate, confirmed action, not a recoverable archive.
  const handleDeleteEntry = async (entry) => {
    if (!entry?.id) return;
    try {
      await base44.entities.JournalEntry.delete(entry.id);
      queryClient.invalidateQueries({ queryKey: ["journalEntries"] });
      queryClient.invalidateQueries({ queryKey: ["journals"] });
      toast.success("Entry deleted");
    } catch (e) {
      toast.error(e?.message || "Couldn't delete the entry");
    }
  };

  const handleRenameFolder = async (oldPath, newName) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldPath.split("/").pop()) return;
    if (trimmed.includes("/")) {
      window.alert("Folder names cannot contain '/'.");
      return;
    }
    const parent = getParent(oldPath);
    const newPath = parent ? `${parent}/${trimmed}` : trimmed;
    if (oldPath === newPath) return;
    if (savedFolders.includes(newPath) || allFolderPaths.includes(newPath)) {
      window.alert(`A folder named "${trimmed}" already exists here.`);
      return;
    }
    // Update saved folder list: rename this path + all descendants
    const updated = savedFolders.map((f) => {
      if (f === oldPath) return newPath;
      if (f.startsWith(`${oldPath}/`)) return newPath + f.slice(oldPath.length);
      return f;
    });
    persistFolders(updated);
    setSavedFoldersState(updated);
    // Update any entry whose folder is the renamed path or a descendant
    const affected = entries.filter(
      (e) => e.folder === oldPath || (e.folder && e.folder.startsWith(`${oldPath}/`))
    );
    await Promise.all(
      affected.map((e) => {
        const nextFolder = e.folder === oldPath
          ? newPath
          : newPath + e.folder.slice(oldPath.length);
        return base44.entities.JournalEntry.update(e.id, { folder: nextFolder });
      })
    );
    if (viewingFolder === oldPath) setViewingFolder(newPath);
    else if (viewingFolder && viewingFolder.startsWith(`${oldPath}/`)) {
      setViewingFolder(newPath + viewingFolder.slice(oldPath.length));
    }
    queryClient.invalidateQueries({ queryKey: ["journalEntries"] });
  };

  // Measure the trigger button group and decide where the popover should
  // sit. The trigger lives on the right side of the filter row, so a
  // naive `left-0` anchor (which we previously used) pushed the popover
  // off the right edge of the viewport and caused horizontal page scroll.
  // Strategy:
  //   - Prefer left-align (popover extends rightward) when there's room.
  //   - Else right-align (popover extends leftward).
  //   - Else clamp to viewport with a small margin.
  const POPOVER_WIDTH = 240; // matches Tailwind w-60 (15rem at default font size)
  const VIEWPORT_MARGIN = 8;
  const computeFronterMenuPos = () => {
    const node = fronterMenuTriggerRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const vw = typeof window !== "undefined" ? window.innerWidth : 0;
    const top = rect.bottom + 4;
    let left;
    if (rect.left + POPOVER_WIDTH <= vw - VIEWPORT_MARGIN) {
      // Room to extend right: left-align to trigger
      left = rect.left;
    } else if (rect.right - POPOVER_WIDTH >= VIEWPORT_MARGIN) {
      // Room to extend left: right-align to trigger
      left = rect.right - POPOVER_WIDTH;
    } else {
      // Doesn't fit either way — clamp to viewport
      left = VIEWPORT_MARGIN;
    }
    // Final safety clamp so the popover never touches viewport edges
    const maxLeft = vw - POPOVER_WIDTH - VIEWPORT_MARGIN;
    if (maxLeft >= VIEWPORT_MARGIN) {
      left = Math.min(Math.max(left, VIEWPORT_MARGIN), maxLeft);
    }
    setFronterMenuPos({ top, left, maxWidth: POPOVER_WIDTH });
  };

  // Recompute on window resize / orientation change while the menu is open.
  useEffect(() => {
    if (!fronterMenuOpen) return undefined;
    computeFronterMenuPos();
    const onResize = () => computeFronterMenuPos();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fronterMenuOpen]);

  // Anchor + clamp the author dropdown to its trigger (fixed-positioned).
  useEffect(() => {
    if (!showAuthorFilter) return undefined;
    const compute = () => {
      const node = authorMenuTriggerRef.current;
      if (!node) return;
      const r = node.getBoundingClientRect();
      const width = 208;
      let left = r.left;
      const maxLeft = window.innerWidth - width - 8;
      if (maxLeft >= 8) left = Math.min(Math.max(left, 8), maxLeft);
      else left = 8;
      setAuthorMenuPos({ top: r.bottom + 4, left, width });
    };
    compute();
    const onResize = () => compute();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [showAuthorFilter]);

  // Refetch active fronters at the moment the menu opens (don't trust the
  // cached `activeSessions` query — it may be stale). Mirrors the
  // SetFrontModal / useSwipeActions "refetch before write" pattern from
  // CLAUDE.md — closure-captured fronter lists go stale fast.
  const openFronterMenu = async () => {
    let preselect = currentAlterIds;
    try {
      const active = await base44.entities.FrontingSession.filter({ is_active: true });
      const ids = active
        .map((s) => s.alter_id || s.primary_alter_id)
        .filter(Boolean);
      const co = active.flatMap((s) => s.co_fronter_ids || []).filter(Boolean);
      preselect = Array.from(new Set([...ids, ...co]));
    } catch {
      // Fall back to the cached currentAlterIds preselect
    }
    if (!fronterFilterIds) {
      setFronterFilterIds(new Set(preselect));
    }
    setFronterMenuOpen(true);
    setFronterMenuSearch("");
  };

  const toggleFronterFilterAlter = (id) => {
    setFronterFilterIds((prev) => {
      const next = new Set(prev || currentAlterIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleFronterButtonTap = () => {
    if (fronterLongPressedRef.current) {
      // The long-press handler already opened the menu; suppress the tap
      fronterLongPressedRef.current = false;
      return;
    }
    if (fronterOnly) {
      // Off: also drop any custom refinement so next toggle starts fresh
      setFronterOnly(false);
      setFronterFilterIds(null);
    } else {
      setFronterOnly(true);
      setFronterFilterIds(null); // reset to "track current fronters"
    }
  };

  const startFronterPress = () => {
    fronterLongPressedRef.current = false;
    fronterPressTimerRef.current = setTimeout(() => {
      fronterLongPressedRef.current = true;
      setFronterOnly(true);
      openFronterMenu();
    }, 500);
  };

  const cancelFronterPress = () => {
    if (fronterPressTimerRef.current) {
      clearTimeout(fronterPressTimerRef.current);
      fronterPressTimerRef.current = null;
    }
  };

  // Badge: how many alters are being filtered on, and whether it diverges
  // from the current fronters (so we only show the count when meaningful).
  const fronterFilterCount = fronterFilterIds ? fronterFilterIds.size : currentAlterIds.length;
  const fronterFilterIsCustom = useMemo(() => {
    if (!fronterFilterIds) return false;
    const cur = new Set(currentAlterIds);
    if (fronterFilterIds.size !== cur.size) return true;
    for (const id of fronterFilterIds) if (!cur.has(id)) return true;
    return false;
  }, [fronterFilterIds, currentAlterIds]);

  // Breadcrumb path segments
  const breadcrumbs = viewingFolder ? viewingFolder.split("/") : [];

  return (
    <motion.div data-tour="journals-list" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
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
        <div className="flex flex-col gap-2 flex-shrink-0">
          <Button data-tour="journals-folder-btn" variant="outline" size="sm" onClick={() => setShowNewFolder(true)} className="gap-1.5 justify-start">
            <FolderPlus className="w-4 h-4" />
            {viewingFolder ? "New Subfolder" : "New Folder"}
          </Button>
          <Button data-tour="journals-new-entry" size="sm" onClick={() => openNew(viewingFolder)} className="bg-primary hover:bg-primary/90 gap-1.5 justify-start">
            <Plus className="w-4 h-4" />
            New Entry
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div data-tour="journals-tabs" className="flex gap-1 mb-4 bg-muted/40 p-1 rounded-xl w-fit">
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
      <div data-tour="journals-filters" className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search entries..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>

        {/* Author filter */}
        {authoredAlterIds.length > 0 && (
          <div ref={authorMenuTriggerRef} className="relative">
            <Button
              variant={selectedAuthorId ? "default" : "outline"}
              size="sm"
              onClick={() => { setShowAuthorFilter(v => !v); setAuthorFilterSearch(""); }}
              className={`gap-1.5 ${selectedAuthorId ? "bg-primary hover:bg-primary/90" : ""}`}
            >
              {selectedAuthorId ? (
                <>
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: altersById[selectedAuthorId]?.color || "#94a3b8" }} />
                  <span className="max-w-[100px] truncate">{altersById[selectedAuthorId]?.name}</span>
                </>
              ) : (
                <>
                  <UserRound className="w-3.5 h-3.5" />
                  Author
                </>
              )}
              <ChevronDown className="w-3 h-3 opacity-60" />
            </Button>
            {selectedAuthorId && (
              <button
                onClick={(e) => { e.stopPropagation(); setSelectedAuthorId(null); }}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-muted-foreground/20 hover:bg-destructive/20 flex items-center justify-center"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            )}
            {showAuthorFilter && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowAuthorFilter(false)} />
                <div
                  className="z-50 bg-popover border border-border rounded-xl shadow-xl max-w-[calc(100vw-1rem)] overflow-hidden"
                  style={{ position: "fixed", top: authorMenuPos.top, left: authorMenuPos.left, width: authorMenuPos.width }}
                >
                  <div className="px-3 py-2 border-b border-border/50">
                    <input
                      autoFocus
                      value={authorFilterSearch}
                      onChange={e => setAuthorFilterSearch(e.target.value)}
                      placeholder={`Search ${terms.alters}...`}
                      className="w-full text-xs bg-transparent outline-none placeholder:text-muted-foreground"
                    />
                  </div>
                  <div className="max-h-52 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: "touch" }}>
                    <button
                      type="button"
                      onClick={() => { setSelectedAuthorId(null); setShowAuthorFilter(false); }}
                      className={`w-full text-left px-3 py-2 text-xs hover:bg-muted/50 transition-colors ${!selectedAuthorId ? "text-primary font-medium" : "text-muted-foreground"}`}
                    >
                      All authors
                    </button>
                    {authoredAlterIds
                      .map(id => altersById[id])
                      .filter(Boolean)
                      .filter(a => !authorFilterSearch || a.name.toLowerCase().includes(authorFilterSearch.toLowerCase()))
                      .map(a => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => { setSelectedAuthorId(a.id); setShowAuthorFilter(false); }}
                          className={`w-full text-left px-3 py-2 text-xs hover:bg-muted/50 transition-colors flex items-center gap-2 ${selectedAuthorId === a.id ? "bg-primary/5 text-primary" : ""}`}
                        >
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: a.color || "#94a3b8" }} />
                          <span className="flex-1 truncate">{a.name}</span>
                        </button>
                      ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {currentAlterIds.length > 0 && (
          <div ref={fronterMenuTriggerRef} className="relative inline-flex">
            <Button
              variant={fronterOnly ? "default" : "outline"}
              size="sm"
              onClick={handleFronterButtonTap}
              onPointerDown={startFronterPress}
              onPointerUp={cancelFronterPress}
              onPointerLeave={cancelFronterPress}
              onPointerCancel={cancelFronterPress}
              onContextMenu={(e) => { e.preventDefault(); setFronterOnly(true); openFronterMenu(); }}
              title={`Show entries by currently-${terms.fronting} ${terms.alters} (hold or tap chevron to refine)`}
              className={`gap-1.5 rounded-r-none ${fronterOnly ? "bg-primary hover:bg-primary/90" : ""}`}
            >
              <Eye className="w-3.5 h-3.5" />
              {terms.Fronter} view
              {fronterOnly && fronterFilterIsCustom && (
                <span className="ml-1 inline-flex items-center justify-center min-w-[1.1rem] h-4 px-1 rounded-full text-[0.625rem] font-semibold bg-primary-foreground/20 text-primary-foreground">
                  {fronterFilterCount}
                </span>
              )}
            </Button>
            <Button
              variant={fronterOnly ? "default" : "outline"}
              size="sm"
              onClick={(e) => { e.stopPropagation(); openFronterMenu(); }}
              aria-label={`Refine ${terms.fronter}-view filter`}
              className={`px-1.5 rounded-l-none border-l-0 ${fronterOnly ? "bg-primary hover:bg-primary/90" : ""}`}
            >
              <ChevronDown className="w-3 h-3 opacity-70" />
            </Button>

            {fronterMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setFronterMenuOpen(false)} />
                <div
                  className="z-50 bg-popover border border-border rounded-xl shadow-xl overflow-hidden"
                  style={{
                    position: "fixed",
                    top: fronterMenuPos.top,
                    left: fronterMenuPos.left,
                    width: fronterMenuPos.maxWidth,
                    maxWidth: `calc(100vw - ${VIEWPORT_MARGIN * 2}px)`,
                  }}
                >
                  <div className="px-3 py-2 border-b border-border/50 flex items-center justify-between gap-2">
                    <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
                      Filter by {terms.alter}
                    </span>
                    <button
                      type="button"
                      onClick={() => setFronterFilterIds(new Set(currentAlterIds))}
                      className="text-[0.625rem] font-medium text-primary hover:underline"
                      title={`Reset to currently-${terms.fronting} ${terms.alters}`}
                    >
                      Current {terms.fronters}
                    </button>
                  </div>
                  <div className="px-3 py-2">
                    <AlterTreeSelect
                      isSelected={(id) => (fronterFilterIds || new Set(currentAlterIds)).has(id)}
                      onToggle={(a) => toggleFronterFilterAlter(a.id)}
                      onSetMany={(arr, on) => setFronterFilterIds((prev) => {
                        const base = prev ? new Set(prev) : new Set(currentAlterIds);
                        for (const a of arr) { if (on) base.add(a.id); else base.delete(a.id); }
                        return base;
                      })}
                      maxHeight="48vh"
                    />
                  </div>
                  <div className="px-3 py-2 border-t border-border/50 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setFronterMenuOpen(false)}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Done
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
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
          onRename={handleRenameFolder}
          onDelete={handleDeleteFolder}
        />
      )}

      {/* Entries */}
      {filtered.length === 0 && visibleFolders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center px-4">
          <div className="text-4xl mb-3">📓</div>
          <p className="text-sm font-medium text-foreground mb-1">
            {fronterOnly
              ? `No entries from currently-${terms.fronting} ${terms.alters}`
              : viewingFolder ? "This folder is empty" : "No journal entries yet"}
          </p>
          <p className="text-xs text-muted-foreground mb-4">
            {fronterOnly
              ? `Tap "${terms.Fronter} view" again to clear the filter and see every entry.`
              : viewingFolder ? "Add your first entry to this folder." : "Start writing to capture your thoughts and experiences."}
          </p>
          {fronterOnly ? (
            <Button variant="outline" size="sm" onClick={() => { setFronterOnly(false); setFronterFilterIds(null); }}>
              Clear {terms.fronter} view
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => openNew(viewingFolder)}>
              {viewingFolder ? "Add entry here" : "Write your first entry"}
            </Button>
          )}
        </div>
      ) : filtered.length > 0 ? (
        <>
          {visibleFolders.length > 0 && (
            <div className="flex items-center gap-2 mb-3">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">Entries</p>
            <div className="flex-1 h-px bg-border/50" />
          </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {filtered.map((entry) => (
              <div key={entry.id} id={`item-${entry.id}`}>
                <JournalEntryCard
                  entry={entry}
                  altersById={altersById}
                  onClick={() => openEntry(entry)}
                />
              </div>
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
        onDelete={handleDeleteEntry}
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
