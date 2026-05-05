import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { encryptContent, decryptContent } from "@/lib/encryption";
import { Lock, AlertCircle, Loader2, Folder, LayoutGrid, Type, Eye, Code, PenLine, Users, X } from "lucide-react";
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

function AlterChip({ alter, selected, onClick, onRemove, badge }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-all ${
        selected
          ? "border-primary/50 bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
      }`}
    >
      {alter.avatar_url
        ? <img src={alter.avatar_url} className="w-3.5 h-3.5 rounded-full object-cover flex-shrink-0" />
        : <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: alter.color || "#8b5cf6" }} />
      }
      {alter.name}
      {badge && <span className="text-[9px] opacity-60 font-mono">{badge}</span>}
      {onRemove && selected && (
        <X
          className="w-3 h-3 opacity-60 hover:opacity-100"
          onClick={e => { e.stopPropagation(); onRemove(); }}
        />
      )}
    </button>
  );
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
  const [showAllCoAuthors, setShowAllCoAuthors] = useState(false);

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
    setShowAllCoAuthors(false);
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

  // Alters available to add as co-authors (not primary author, not already included)
  const availableForCoAuthor = useMemo(
    () => (alters || []).filter(a => a.id !== authorAlterId && !effectiveCoAuthorIds.includes(a.id)),
    [alters, authorAlterId, effectiveCoAuthorIds]
  );

  return (
    <Dialog open={isOpenFinal} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingEntryFinal ? "Edit Entry" : "New Journal Entry"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Input placeholder="Entry title" value={title} onChange={(e) => setTitle(e.target.value)} />

          {/* Author section */}
          <div className="space-y-2 p-3 bg-muted/20 rounded-xl border border-border/40">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <PenLine className="w-3.5 h-3.5" /> Written by
              </label>
              {currentAlterId && !editingEntryFinal && (
                <span className="text-[10px] text-muted-foreground">Defaulted to current front</span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setAuthorAlterId(null)}
                className={`text-xs px-2.5 py-1 rounded-lg border transition-all ${
                  !authorAlterId
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/30"
                }`}
              >
                No attribution
              </button>
              {(alters || []).map(a => (
                <AlterChip
                  key={a.id}
                  alter={a}
                  selected={authorAlterId === a.id}
                  badge={a.id === currentAlterId ? "fronting" : null}
                  onClick={() => setAuthorAlterId(prev => prev === a.id ? null : a.id)}
                />
              ))}
            </div>

            {/* Co-authors */}
            <div className="space-y-1.5 pt-1 border-t border-border/30">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Users className="w-3 h-3" /> Also written by
                {signpostDetected.length > 0 && (
                  <span className="normal-case font-normal text-[10px] text-primary/80">
                    ✦ {signpostDetected.length} detected from signpost
                  </span>
                )}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {effectiveCoAuthorIds.map(id => {
                  const alter = altersById[id];
                  if (!alter) return null;
                  const isSignpost = signpostDetected.includes(id);
                  return (
                    <AlterChip
                      key={id}
                      alter={alter}
                      selected={true}
                      badge={isSignpost ? "~" : null}
                      onClick={() => {}}
                      onRemove={() => setCoAuthorIds(prev => prev.filter(x => x !== id))}
                    />
                  );
                })}
                {availableForCoAuthor.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowAllCoAuthors(v => !v)}
                    className="text-xs px-2.5 py-1 rounded-lg border border-dashed border-border/60 text-muted-foreground/60 hover:text-muted-foreground hover:border-border transition-all"
                  >
                    {showAllCoAuthors ? "Hide" : "+ Add"}
                  </button>
                )}
              </div>
              {showAllCoAuthors && availableForCoAuthor.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {availableForCoAuthor.map(a => (
                    <AlterChip
                      key={a.id}
                      alter={a}
                      selected={false}
                      onClick={() => { setCoAuthorIds(prev => [...prev, a.id]); setShowAllCoAuthors(false); }}
                    />
                  ))}
                </div>
              )}
              {signpostDetected.length > 0 && (
                <p className="text-[10px] text-muted-foreground">
                  ✦ Alters marked with ~ were detected from <code className="font-mono">~Name:</code> markers in the content.
                  Remove them from this list to exclude.
                </p>
              )}
            </div>
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
