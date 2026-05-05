import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { encryptContent, decryptContent } from "@/lib/encryption";
import { Lock, AlertCircle, Loader2, Folder, LayoutGrid, Type, Eye, Code, PenLine, ChevronDown } from "lucide-react";
import MentionTextarea from "@/components/shared/MentionTextarea";
import { saveMentions } from "@/lib/mentionUtils";
import { MiniToolbar, useTextareaInsert } from "@/components/shared/MiniToolbar";
import BlockEditor, { blocksToHTML, htmlToBlocks } from "@/components/shared/BlockEditor";
import SimplePreview from "@/components/shared/SimplePreview";
import WysiwygEditor from "@/components/shared/WysiwygEditor";

const getSavedFolders = () => {
  try { return JSON.parse(localStorage.getItem("os_journal_folders") || "[]"); }
  catch { return []; }
};

// Detect ~AlterName: signpost patterns in content (plain text or HTML)
function detectSignpostAlters(content, alters) {
  if (!content || !alters?.length) return [];
  const text = content.replace(/<[^>]+>/g, " ");
  const found = [];
  alters.forEach(alter => {
    const escaped = alter.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`~${escaped}\\s*:`, "i").test(text)) found.push(alter.id);
  });
  return found;
}


export default function JournalEditorModal({
  isOpen, open, onClose, editingEntry, entry, alters,
  defaultFolder, currentAlterId,
}) {
  const isOpenFinal = isOpen ?? open;
  const editingEntryFinal = editingEntry ?? entry;
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [folder, setFolder] = useState(defaultFolder || null);
  const [editorMode, setEditorMode] = useState("plain");
  const [isEncrypted, setIsEncrypted] = useState(false);
  const [encryptionPassword, setEncryptionPassword] = useState("");
  const [showPasswordField, setShowPasswordField] = useState(false);
  const [decryptionPassword, setDecryptionPassword] = useState("");
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptionError, setDecryptionError] = useState("");
  const [mentionNote, setMentionNote] = useState("");
  const [authorAlterId, setAuthorAlterId] = useState(null);
  const [coAuthorIds, setCoAuthorIds] = useState([]);
  const [showAuthorPicker, setShowAuthorPicker] = useState(false);
  const [authorSearch, setAuthorSearch] = useState("");

  const taRef = useRef(null);
  const insert = useTextareaInsert(taRef, content, setContent);
  const folders = getSavedFolders();

  const previewBlocks = useMemo(() => htmlToBlocks(content), [content]);

  const altersById = useMemo(() => {
    const map = {};
    (alters || []).forEach(a => { map[a.id] = a; });
    return map;
  }, [alters]);

  // Detect ~Name: patterns in content — these alters are auto-included as co-authors
  const signpostDetected = useMemo(
    () => detectSignpostAlters(content, alters),
    [content, alters]
  );

  // Effective co-authors = manual + signpost detected (minus primary author)
  const effectiveCoAuthorIds = useMemo(() => {
    return [...new Set([...coAuthorIds, ...signpostDetected])]
      .filter(id => id !== authorAlterId);
  }, [coAuthorIds, signpostDetected, authorAlterId]);

  useEffect(() => {
    if (editingEntryFinal) {
      setTitle(editingEntryFinal.title || "");
      setIsEncrypted(editingEntryFinal.is_encrypted || false);
      setFolder(editingEntryFinal.folder || null);
      setAuthorAlterId(editingEntryFinal.author_alter_id || null);
      setCoAuthorIds(editingEntryFinal.co_author_alter_ids || []);
      if (editingEntryFinal.is_encrypted) {
        setShowPasswordField(true);
        setContent("");
      } else {
        setContent(editingEntryFinal.content || "");
        setShowPasswordField(false);
      }
    } else {
      setTitle("");
      setContent("");
      setMentionNote("");
      setIsEncrypted(false);
      setShowPasswordField(false);
      setFolder(defaultFolder || null);
      setEditorMode("plain");
      setAuthorAlterId(currentAlterId || null);
      setCoAuthorIds([]);
    }
    setEncryptionPassword("");
    setDecryptionPassword("");
    setDecryptionError("");
    setShowAuthorPicker(false);
    setAuthorSearch("");
  }, [editingEntryFinal?.id, isOpenFinal]);

  const handleDecrypt = async () => {
    setIsDecrypting(true);
    setDecryptionError("");
    try {
      const decrypted = await decryptContent(editingEntryFinal.content, decryptionPassword);
      setContent(decrypted);
      setShowPasswordField(false);
    } catch (error) {
      setDecryptionError(error.message);
    } finally {
      setIsDecrypting(false);
    }
  };

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (editingEntryFinal) {
        return base44.entities.JournalEntry.update(editingEntryFinal.id, data);
      } else {
        return base44.entities.JournalEntry.create(data);
      }
    },
    onSuccess: async (savedEntry) => {
      if (mentionNote.trim() && alters?.length > 0) {
        await saveMentions({
          content: mentionNote,
          alters,
          sourceType: "journal",
          sourceId: savedEntry.id,
          sourceLabel: title || "Journal Entry",
          navigatePath: `/journals?id=${savedEntry.id}`,
          authorAlterId: authorAlterId || null,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["journals"] });
      queryClient.invalidateQueries({ queryKey: ["journalEntries"] });
      queryClient.invalidateQueries({ queryKey: ["mentionLogs"] });
      setMentionNote("");
      onClose();
    },
  });

  const handleSave = async () => {
    let finalContent = content;
    if (isEncrypted && encryptionPassword) {
      finalContent = await encryptContent(content, encryptionPassword);
    }
    saveMutation.mutate({
      title: title.trim() || new Date().toLocaleString(),
      content: finalContent,
      is_encrypted: isEncrypted,
      folder: folder || null,
      author_alter_id: authorAlterId || null,
      co_author_alter_ids: effectiveCoAuthorIds,
    });
  };

  const authorAlter = altersById[authorAlterId] || null;
  const filteredAltersForAuthor = useMemo(
    () => (alters || []).filter(a => !authorSearch || a.name.toLowerCase().includes(authorSearch.toLowerCase())),
    [alters, authorSearch]
  );

  return (
    <Dialog open={isOpenFinal} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingEntryFinal ? "Edit Entry" : "New Journal Entry"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Input placeholder="Entry title" value={title} onChange={(e) => setTitle(e.target.value)} />

          {/* Author — compact row with searchable dropdown */}
          <div className="relative flex items-center gap-2">
            <PenLine className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <span className="text-xs text-muted-foreground flex-shrink-0">Written by</span>
            <button
              type="button"
              onClick={() => { setShowAuthorPicker(v => !v); setAuthorSearch(""); }}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border border-border/60 hover:border-border bg-background transition-colors"
            >
              {authorAlter ? (
                <>
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: authorAlter.color || "#8b5cf6" }} />
                  <span className="max-w-[160px] truncate">{authorAlter.name}</span>
                </>
              ) : (
                <span className="text-muted-foreground">No attribution</span>
              )}
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            </button>
            {signpostDetected.length > 0 && (
              <span className="text-[10px] text-muted-foreground">
                +{signpostDetected.length} co-author{signpostDetected.length !== 1 ? "s" : ""} via ~signpost
              </span>
            )}
            {showAuthorPicker && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowAuthorPicker(false)} />
                <div className="absolute top-full left-16 mt-1 z-50 bg-popover border border-border rounded-xl shadow-xl w-60 overflow-hidden">
                  <div className="px-3 py-2 border-b border-border/50">
                    <input
                      autoFocus
                      value={authorSearch}
                      onChange={e => setAuthorSearch(e.target.value)}
                      placeholder="Search members..."
                      className="w-full text-xs bg-transparent outline-none placeholder:text-muted-foreground"
                    />
                  </div>
                  <div className="max-h-52 overflow-y-auto">
                    <button
                      type="button"
                      onClick={() => { setAuthorAlterId(null); setShowAuthorPicker(false); }}
                      className={`w-full text-left px-3 py-2 text-xs hover:bg-muted/50 transition-colors ${!authorAlterId ? "text-primary font-medium" : "text-muted-foreground"}`}
                    >
                      No attribution
                    </button>
                    {filteredAltersForAuthor.map(a => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => { setAuthorAlterId(a.id); setShowAuthorPicker(false); }}
                        className={`w-full text-left px-3 py-2 text-xs hover:bg-muted/50 transition-colors flex items-center gap-2 ${authorAlterId === a.id ? "bg-primary/5 text-primary" : ""}`}
                      >
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: a.color || "#94a3b8" }} />
                        <span className="flex-1 truncate">{a.name}</span>
                        {a.id === currentAlterId && <span className="text-[10px] text-primary/70 flex-shrink-0">fronting</span>}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Folder selector */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium flex items-center gap-1.5"><Folder className="w-3.5 h-3.5" /> Folder</label>
            {(() => {
              const levels = [];
              const rootFolders = folders.filter(f => !f.includes("/"));
              levels.push({ parent: null, items: rootFolders, depth: 0 });
              if (folder) {
                const parts = folder.split("/");
                for (let i = 0; i < parts.length; i++) {
                  const parentPath = parts.slice(0, i + 1).join("/");
                  const childFolders = folders.filter(f => {
                    const fParts = f.split("/");
                    return fParts.length === i + 2 && f.startsWith(`${parentPath}/`);
                  });
                  if (childFolders.length > 0) {
                    levels.push({ parent: parentPath, items: childFolders, depth: i + 1 });
                  }
                }
              }
              const colors = ["border-primary/20", "border-blue-500/30", "border-purple-500/30", "border-pink-500/30", "border-amber-500/30"];
              return levels.map((level, li) => (
                <div key={li} className={`flex flex-wrap gap-1.5 ${li > 0 ? `pl-3 border-l-2 ml-1 ${colors[li] || colors[colors.length - 1]}` : ""}`}>
                  {li === 0 && (
                    <button type="button" onClick={() => setFolder(null)}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-colors flex-shrink-0 ${!folder ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/30"}`}>
                      None
                    </button>
                  )}
                  {level.items.map(f => (
                    <button key={f} type="button" onClick={() => setFolder(f)}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-colors flex-shrink-0 ${
                        folder === f ? "border-primary/40 bg-primary/10 text-primary" :
                        folder?.startsWith(`${f}/`) ? "border-primary/20 bg-primary/5 text-primary/70" :
                        "border-border text-muted-foreground hover:border-primary/30"
                      }`}>
                      {f.split("/").pop()}
                    </button>
                  ))}
                </div>
              ));
            })()}
          </div>

          {!editingEntryFinal && (
            <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg border border-border/50">
              <Checkbox checked={isEncrypted} onCheckedChange={setIsEncrypted} id="encrypt-toggle" />
              <label htmlFor="encrypt-toggle" className="flex items-center gap-2 cursor-pointer flex-1">
                <Lock className="w-4 h-4" />
                <span className="text-sm font-medium">Make this entry private (encrypted)</span>
              </label>
            </div>
          )}

          {isEncrypted && !editingEntryFinal && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Encryption Password</label>
              <Input type="password" placeholder="Enter password to encrypt this entry"
                value={encryptionPassword} onChange={(e) => setEncryptionPassword(e.target.value)} />
              <p className="text-xs text-muted-foreground flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                Store your password safely. You'll need it to read this entry.
              </p>
            </div>
          )}

          {editingEntryFinal?.is_encrypted && showPasswordField && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Entry Password</label>
              <div className="flex gap-2">
                <Input type="password" placeholder="Enter password to decrypt"
                  value={decryptionPassword} onChange={(e) => setDecryptionPassword(e.target.value)} />
                <Button onClick={handleDecrypt} disabled={isDecrypting || !decryptionPassword} size="sm">
                  {isDecrypting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isDecrypting ? "Decrypting..." : "Decrypt"}
                </Button>
              </div>
              {decryptionError && (
                <p className="text-xs text-destructive flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  {decryptionError}
                </p>
              )}
            </div>
          )}

          {(!editingEntryFinal?.is_encrypted || !showPasswordField) && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Content</label>
                <div className="flex gap-1 bg-muted/40 p-1 rounded-lg">
                  <button type="button" onClick={() => setEditorMode("plain")}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${editorMode === "plain" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                    <Type className="w-3 h-3" /> Plain
                  </button>
                  <button type="button" onClick={() => setEditorMode("simple")}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${editorMode === "simple" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                    <Eye className="w-3 h-3" /> Simple
                  </button>
                  <button type="button" onClick={() => setEditorMode("blocks")}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${editorMode === "blocks" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                    <LayoutGrid className="w-3 h-3" /> Blocks
                  </button>
                  <button type="button" onClick={() => setEditorMode("raw")}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${editorMode === "raw" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                    <Code className="w-3 h-3" /> Raw
                  </button>
                </div>
              </div>

              {editorMode === "plain" ? (
                <WysiwygEditor value={content} onChange={setContent} placeholder="Write your entry..." />
              ) : editorMode === "raw" ? (
                <div className="rounded-xl border border-input bg-background">
                  <textarea ref={taRef} value={content} onChange={e => setContent(e.target.value)}
                    placeholder="Write your entry... Use ~AlterName: to signpost sections."
                    className="w-full min-h-[200px] px-3 py-2.5 text-sm bg-transparent focus:outline-none resize-y font-mono leading-relaxed rounded-t-xl"
                    spellCheck={false} />
                  <MiniToolbar onInsert={insert} />
                </div>
              ) : editorMode === "simple" ? (
                <SimplePreview
                  blocks={previewBlocks}
                  onBlockChange={(id, patch) => {
                    const updated = previewBlocks.map(b => b.id === id ? { ...b, ...patch } : b);
                    setContent(blocksToHTML(updated));
                  }}
                />
              ) : (
                <BlockEditor value={content} onChange={setContent} />
              )}
              <p className="text-xs text-muted-foreground">
                Tip: Use <code className="font-mono bg-muted px-1 rounded">~AlterName:</code> to mark which alter is writing a section — they'll be auto-added as co-authors.
              </p>
            </div>
          )}

          <div>
            <label className="text-sm font-medium">Mention alters</label>
            <p className="text-xs text-muted-foreground mb-1">Tag alters to notify them of this entry</p>
            <MentionTextarea value={mentionNote} onChange={setMentionNote} alters={alters || []} placeholder="Use @ to mention alters..." className="h-16" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={(isEncrypted && !encryptionPassword && !editingEntryFinal) || saveMutation.isPending}>
            {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Save Entry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
