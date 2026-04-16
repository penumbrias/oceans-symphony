import React, { useState, useEffect, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { encryptContent, decryptContent } from "@/lib/encryption";
import { Lock, AlertCircle, Loader2, Folder, LayoutGrid, Type, Eye } from "lucide-react";
import MentionTextarea from "@/components/shared/MentionTextarea";
import { saveMentions } from "@/lib/mentionUtils";
import { MiniToolbar, useTextareaInsert } from "@/components/shared/MiniToolbar";

import BlockEditor, { blocksToHTML, htmlToBlocks } from "@/components/shared/BlockEditor";

const getSavedFolders = () => {
  try { return JSON.parse(localStorage.getItem("os_journal_folders") || "[]"); }
  catch { return []; }
};

function SimplePreview({ blocks, onBlockChange }) {
  const [editingId, setEditingId] = useState(null);

  const stripHTML = (html) => {
    const tmp = document.createElement("div");
    tmp.innerHTML = html || "";
    return tmp.textContent || tmp.innerText || "";
  };

  return (
    <div className="space-y-2 rounded-xl border border-input bg-background p-3 min-h-[200px]">
      {blocks.map(block => {
        if (block.type === "text") {
          if (editingId === block.id) {
            return (
              <textarea
                key={block.id}
                autoFocus
                defaultValue={stripHTML(block.content)}
                onBlur={e => { onBlockChange(block.id, { content: e.target.value }); setEditingId(null); }}
                className="w-full min-h-[80px] px-3 py-2 text-sm bg-transparent border border-primary/40 rounded-lg focus:outline-none resize-y leading-relaxed"
                spellCheck={true}
            />
            );
          }
          return (
            <div key={block.id}
              onClick={() => setEditingId(block.id)}
              className="px-2 py-1 rounded-lg hover:bg-muted/30 cursor-text transition-colors min-h-[24px]"
              dangerouslySetInnerHTML={{ __html: block.content || '<span style="opacity:0.4;font-size:0.875rem;font-style:italic;">Click to edit text...</span>' }}
            />
          );
        }

        if (block.type === "img-left" || block.type === "img-right") {
          const isLeft = block.type === "img-left";
          const imgEl = block.src ? (
            <img src={block.src} alt={block.alt || ""}
              style={block.cropped ? { width: block.size || 120, height: block.size || 120, objectFit: "cover", borderRadius: 8, flexShrink: 0 } : { width: block.size || 120, height: "auto", borderRadius: 8, flexShrink: 0 }} />
          ) : null;
          const textEl = editingId === block.id ? (
            <textarea
              autoFocus
              defaultValue={stripHTML(block.text)}
              onBlur={e => { onBlockChange(block.id, { text: e.target.value }); setEditingId(null); }}
             className="flex-1 min-h-[80px] px-3 py-2 text-sm bg-transparent border border-primary/40 rounded-lg focus:outline-none resize-y leading-relaxed"
              spellCheck={true}
            />
          ) : (
            <div onClick={() => setEditingId(block.id)}
              className="flex-1 px-2 py-1 rounded-lg hover:bg-muted/30 cursor-text transition-colors min-h-[40px]"
              dangerouslySetInnerHTML={{ __html: block.text || '<span style="opacity:0.4;font-size:0.875rem;font-style:italic;">Click to edit text...</span>' }} />
          );
          return (
            <div key={block.id} className="flex gap-3 items-start" style={{ flexDirection: isLeft ? "row" : "row-reverse" }}>
              {imgEl}
              {textEl}
            </div>
          );
        }

        // galleries, dividers, img-solo, raw — render as-is
        const html = blocksToHTML([block]).replace(/^<div data-blocks="[^"]*">/, "").replace(/<\/div>$/, "");
        return <div key={block.id} dangerouslySetInnerHTML={{ __html: html }} />;
      })}
      {blocks.length === 0 && (
        <p className="text-muted-foreground text-sm italic px-1">No content yet. Switch to Blocks to add content.</p>
      )}
    </div>
  );
}

export default function JournalEditorModal({ isOpen, open, onClose, editingEntry, entry, alters, defaultFolder }) {
  const isOpenFinal = isOpen ?? open;
  const editingEntryFinal = editingEntry ?? entry;
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [folder, setFolder] = useState(defaultFolder || null);
  const [editorMode, setEditorMode] = useState("simple"); // "simple" | "blocks"
  const [isEncrypted, setIsEncrypted] = useState(false);
  const [encryptionPassword, setEncryptionPassword] = useState("");
  const [showPasswordField, setShowPasswordField] = useState(false);
  const [decryptionPassword, setDecryptionPassword] = useState("");
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptionError, setDecryptionError] = useState("");
  const [mentionNote, setMentionNote] = useState("");
  const taRef = useRef(null);
  const insert = useTextareaInsert(taRef, content, setContent);
  const folders = getSavedFolders();

  useEffect(() => {
    if (editingEntryFinal) {
      setTitle(editingEntryFinal.title || "");
      setIsEncrypted(editingEntryFinal.is_encrypted || false);
      setFolder(editingEntryFinal.folder || null);
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
      setEditorMode("simple");
    }
    setEncryptionPassword("");
    setDecryptionPassword("");
    setDecryptionError("");
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
          authorAlterId: null,
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
    });
  };

  const allFolders = folders;

  return (
    <Dialog open={isOpenFinal} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingEntryFinal ? "Edit Entry" : "New Journal Entry"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Input placeholder="Entry title" value={title} onChange={(e) => setTitle(e.target.value)} />

          {/* Folder selector */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium flex items-center gap-1.5"><Folder className="w-3.5 h-3.5" /> Folder</label>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setFolder(null)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${!folder ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/30"}`}>
                None
              </button>
              {allFolders.map(f => (
                <button key={f} type="button" onClick={() => setFolder(f)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${folder === f ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/30"}`}>
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Encryption toggle */}
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

          {/* Editor mode toggle + content */}
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
    </div>
  </div>

  {editorMode === "plain" ? (
    <div className="rounded-xl border border-input bg-background">
      <textarea ref={taRef} value={content} onChange={e => setContent(e.target.value)}
        placeholder="Write your entry..."
        className="w-full min-h-[200px] px-3 py-2.5 text-sm bg-transparent focus:outline-none resize-y font-mono leading-relaxed rounded-t-xl"
        spellCheck={false} />
      <MiniToolbar onInsert={insert} />
    </div>
  ) : editorMode === "simple" ? (
    <SimplePreview
      blocks={htmlToBlocks(content)}
      onBlockChange={(id, patch) => {
        const updated = htmlToBlocks(content).map(b => b.id === id ? { ...b, ...patch } : b);
        setContent(blocksToHTML(updated));
      }}
    />
  ) : (
    <BlockEditor value={content} onChange={setContent} />
  )}
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