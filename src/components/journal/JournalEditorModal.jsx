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
    queryClient.invalidateQueries({ queryKey: ["journalEntriesToday"] });
    setSaving(false);
    onClose();
  };

  const handleDelete = async () => {
    if (!entry) return;
    setDeleting(true);
    await base44.entities.JournalEntry.delete(entry.id);
    toast.success("Entry deleted.");
    queryClient.invalidateQueries({ queryKey: ["journalEntries"] });
    queryClient.invalidateQueries({ queryKey: ["journalEntriesToday"] });
    setDeleting(false);
    onClose();
  };

  const toggleAlter = (id) => {
    setAllowedAlterIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleGroup = (id) => {
    setAllowedGroupIds((prev) =>
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
        <div className="border border-border/50 rounded-xl overflow-hidden">
          <button
            onClick={() => setRestricted((v) => !v)}
            className={`w-full flex items-center justify-between px-3 py-2.5 text-sm transition-colors ${
              restricted ? "bg-primary/8 text-primary" : "text-muted-foreground hover:bg-muted/40"
            }`}
          >
            <span className="flex items-center gap-2">
              <Lock className="w-3.5 h-3.5" />
              <span className="font-medium">Restrict to specific alters/groups</span>
              {restricted && (allowedAlterIds.length + allowedGroupIds.length) > 0 && (
                <span className="text-xs bg-primary/15 text-primary px-1.5 py-0.5 rounded-full">
                  {allowedAlterIds.length + allowedGroupIds.length} selected
                </span>
              )}
            </span>
            {restricted ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {restricted && (
            <div className="px-3 pb-3 pt-1 space-y-2 border-t border-border/40">
              {/* Sub-tabs */}
              <div className="flex gap-1 bg-muted/40 p-0.5 rounded-lg w-fit">
                {[{ id: "alters", label: "Specific Alters", icon: Users }, { id: "groups", label: "Groups", icon: Folder }].map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setRestrictTab(id)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                      restrictTab === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    {label}
                  </button>
                ))}
              </div>

              {/* Alters picker */}
              {restrictTab === "alters" && (
                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                  {activeAlters.length === 0 && <p className="text-xs text-muted-foreground">No alters found.</p>}
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

              {/* Groups picker */}
              {restrictTab === "groups" && (
                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                  {groups.length === 0 && <p className="text-xs text-muted-foreground">No groups found.</p>}
                  {groups.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => toggleGroup(g.id)}
                      className={`text-xs px-2 py-1 rounded-full border transition-all ${
                        allowedGroupIds.includes(g.id)
                          ? "border-primary/60 bg-primary/10 text-primary"
                          : "border-border/50 text-muted-foreground hover:border-border"
                      }`}
                    >
                      {g.name}
                    </button>
                  ))}
                </div>
              )}
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