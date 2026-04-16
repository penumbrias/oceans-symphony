import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { encryptContent, decryptContent } from "@/lib/encryption";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import { Lock, AlertCircle, Loader2 } from "lucide-react";
import MentionTextarea from "@/components/shared/MentionTextarea";
import { saveMentions } from "@/lib/mentionUtils";

export default function JournalEditorModal({ isOpen, open, onClose, editingEntry, entry, alters, defaultFolder }) {
  const isOpenFinal = isOpen ?? open;
  const editingEntryFinal = editingEntry ?? entry;
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isEncrypted, setIsEncrypted] = useState(false);
  const [encryptionPassword, setEncryptionPassword] = useState("");
  const [showPasswordField, setShowPasswordField] = useState(false);
  const [decryptionPassword, setDecryptionPassword] = useState("");
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptionError, setDecryptionError] = useState("");
  const [mentionNote, setMentionNote] = useState("");
  const taRef = useRef(null);
const insert = useTextareaInsert(taRef, content, setContent);

  // Load and decrypt entry if editing
  useEffect(() => {
    
    if (editingEntryFinal) {
      setTitle(editingEntryFinal.title);
      
      setIsEncrypted(editingEntryFinal.is_encrypted || false);

      if (editingEntryFinal.is_encrypted) {
        setShowPasswordField(true);
        setContent("");
      } else {
        setContent(editingEntryFinal.content);
        setShowPasswordField(false);
      }
    } else {
      setTitle("");
      setContent("");
      setMentionNote("");
      setIsEncrypted(false);
      setShowPasswordField(false);
    }
    setEncryptionPassword("");
    setDecryptionPassword("");
    setDecryptionError("");
  }, [editingEntryFinal?.id, isOpenFinal]);

  // Handle decryption when editing encrypted entry
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
  title,
  content: finalContent,
  is_encrypted: isEncrypted,
  folder: editingEntryFinal?.folder ?? (defaultFolder || null),
});
    
    if (mentionNote.trim() && alters?.length > 0) {
  const savedId = editingEntryFinal?.id || "pending";
  await saveMentions({
    content: mentionNote,
    alters,
    sourceType: "journal",
    sourceId: savedId,
    sourceLabel: title || "Journal Entry",
    navigatePath: `/journals?id=${savedId}`,
    authorAlterId: null,
  });
}
  };

  return (
    <Dialog open={isOpenFinal} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editingEntryFinal ? "Edit Entry" : "New Journal Entry"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Title */}
          <Input
            placeholder="Entry title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          {/* Encryption Toggle (only show on create, not edit) */}
          {!editingEntryFinal && (
            <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg border border-border/50">
              <Checkbox
                checked={isEncrypted}
                onCheckedChange={setIsEncrypted}
                id="encrypt-toggle"
              />
              <label htmlFor="encrypt-toggle" className="flex items-center gap-2 cursor-pointer flex-1">
                <Lock className="w-4 h-4" />
                <span className="text-sm font-medium">Make this entry private (encrypted)</span>
              </label>
            </div>
          )}

          {/* Encryption Password Input */}
          {isEncrypted && !editingEntryFinal && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Encryption Password</label>
              <Input
                type="password"
                placeholder="Enter password to encrypt this entry"
                value={encryptionPassword}
                onChange={(e) => setEncryptionPassword(e.target.value)}
              />
              <p className="text-xs text-muted-foreground flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                Store your password safely. You'll need it to read this entry.
              </p>
            </div>
          )}

          {/* Decryption Password Input (for editing encrypted entries) */}
          {editingEntryFinal?.is_encrypted && showPasswordField && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Entry Password</label>
              <div className="flex gap-2">
                <Input
                  type="password"
                  placeholder="Enter password to decrypt"
                  value={decryptionPassword}
                  onChange={(e) => setDecryptionPassword(e.target.value)}
                />
                <Button
                  onClick={handleDecrypt}
                  disabled={isDecrypting || !decryptionPassword}
                  size="sm"
                >
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

          {/* Content Editor - only show if not encrypted or successfully decrypted */}
          {(!editingEntryFinal?.is_encrypted || !showPasswordField) && (
  <>
    <label className="text-sm font-medium">Content</label>
    <div className="rounded-xl border border-input bg-background">
      <textarea
        ref={taRef}
        value={content}
        onChange={e => setContent(e.target.value)}
        placeholder="Write your entry..."
        className="w-full min-h-[200px] px-3 py-2.5 text-sm bg-transparent focus:outline-none resize-y font-mono leading-relaxed rounded-t-xl"
        spellCheck={false}
      />
      <MiniToolbar onInsert={insert} />
    </div>
  </>
)}
<div>
  <label className="text-sm font-medium">Mention alters</label>
  <p className="text-xs text-muted-foreground mb-1">Tag alters to notify them of this entry</p>
  <MentionTextarea
    value={mentionNote}
    onChange={setMentionNote}
    alters={alters || []}
    placeholder="Use @ to mention alters..."
    className="h-16"
  />
</div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!title || (isEncrypted && !encryptionPassword && !editingEntryFinal) || saveMutation.isPending}
          >
            {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Save Entry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}