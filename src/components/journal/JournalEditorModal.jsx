import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Loader2, Trash2, Tag, Folder, Lock, Users, ChevronDown, ChevronUp } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

export default function JournalEditorModal({ open, onClose, entry, alters, groups = [], currentAlterId, defaultFolder }) {
  const queryClient = useQueryClient();
  const isNew = !entry;

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [folder, setFolder] = useState("");
  const [restricted, setRestricted] = useState(false);
  const [allowedAlterIds, setAllowedAlterIds] = useState([]);
  const [allowedGroupIds, setAllowedGroupIds] = useState([]);
  const [restrictTab, setRestrictTab] = useState("alters"); // "alters" | "groups"
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (entry) {
      setTitle(entry.title || "");
      setContent(entry.content || "");
      setTagsInput((entry.tags || []).join(", "));
      setFolder(entry.folder || "");
      const hasRestriction = (entry.allowed_alter_ids || []).length > 0 || (entry.allowed_group_ids || []).length > 0;
      setRestricted(hasRestriction);
      setAllowedAlterIds(entry.allowed_alter_ids || []);
      setAllowedGroupIds(entry.allowed_group_ids || []);
    } else {
      const now = new Date();
      setTitle(`Journal — ${format(now, "MMM d, yyyy")}`);
      setContent("");
      setTagsInput("");
      setFolder(defaultFolder || "");
      setRestricted(false);
      setAllowedAlterIds([]);
      setAllowedGroupIds([]);
    }
  }, [entry, open, defaultFolder]);

  const parsedTags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);

  const handleSave = async () => {
    if (!title.trim()) { toast.error("Title is required"); return; }
    setSaving(true);
    const data = {
      title: title.trim(),
      content,
      tags: parsedTags,
      folder: folder.trim(),
      entry_type: "personal",
      author_alter_id: currentAlterId || "",
      allowed_alter_ids: restricted ? allowedAlterIds : [],
      allowed_group_ids: restricted ? allowedGroupIds : [],
    };
    if (isNew) {
      await base44.entities.JournalEntry.create(data);
      toast.success("Entry created!");
    } else {
      await base44.entities.JournalEntry.update(entry.id, data);
      toast.success("Entry saved!");
    }
    queryClient.invalidateQueries({ queryKey: ["journalEntries"] });
    setSaving(false);
    onClose();
  };

  const handleDelete = async () => {
    if (!entry) return;
    setDeleting(true);
    await base44.entities.JournalEntry.delete(entry.id);
    toast.success("Entry deleted.");
    queryClient.invalidateQueries({ queryKey: ["journalEntries"] });
    setDeleting(false);
    onClose();
  };

  const toggleAlter = (id) => {
    setAllowedAlterIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const activeAlters = alters.filter((a) => !a.is_archived);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[92vh] flex flex-col gap-3">
        <DialogHeader>
          <DialogTitle>{isNew ? "New Journal Entry" : "Edit Entry"}</DialogTitle>
        </DialogHeader>

        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Entry title"
          className="font-medium"
        />

        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="flex-1 font-mono text-sm resize-none min-h-[300px]"
          placeholder="Write in markdown..."
        />

        <div className="grid grid-cols-2 gap-2">
          <div className="relative">
            <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="Tags (comma separated)"
              className="pl-8 text-sm"
            />
          </div>
          <div className="relative">
            <Folder className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              placeholder="Folder (optional)"
              className="pl-8 text-sm"
            />
          </div>
        </div>

        {/* Access control */}
        <div className="border border-border/50 rounded-xl p-3 space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={restricted}
              onChange={(e) => setRestricted(e.target.checked)}
              className="rounded"
            />
            <Lock className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Restrict to specific alters</span>
          </label>
          {restricted && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {activeAlters.map((a) => (
                <button
                  key={a.id}
                  onClick={() => toggleAlter(a.id)}
                  className={`text-xs px-2 py-1 rounded-full border transition-all ${
                    allowedAlterIds.includes(a.id)
                      ? "border-primary/60 bg-primary/10 text-primary"
                      : "border-border/50 text-muted-foreground hover:border-border"
                  }`}
                >
                  {a.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-1 border-t border-border/50">
          {!isNew && (
            <Button variant="outline" onClick={handleDelete} disabled={deleting} className="text-destructive hover:text-destructive">
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            </Button>
          )}
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1 bg-primary hover:bg-primary/90">
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}