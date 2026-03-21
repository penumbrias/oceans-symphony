import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { User, Tag, Users, Save, Archive, ArchiveRestore, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import GroupPickerModal from "@/components/groups/GroupPickerModal";

function getContrastColor(hex) {
  if (!hex) return "#ffffff";
  const clean = hex.replace("#", "");
  if (clean.length < 6) return "#ffffff";
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#1a1a2e" : "#ffffff";
}

export default function ProfileTab({ alter }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    alias: "",
    pronouns: "",
    role: "",
    description: "",
    color: "",
    avatar_url: "",
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showGroupPicker, setShowGroupPicker] = useState(false);

  useEffect(() => {
    setForm({
      name: alter.name || "",
      alias: alter.alias || "",
      pronouns: alter.pronouns || "",
      role: alter.role || "",
      description: alter.description || "",
      color: alter.color || "",
      avatar_url: alter.avatar_url || "",
    });
  }, [alter]);

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      await base44.entities.Alter.update(alter.id, form);
      toast.success("Saved!");
      queryClient.invalidateQueries({ queryKey: ["alters"] });
      queryClient.invalidateQueries({ queryKey: ["alter", alter.id] });
    } catch (e) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    setSaving(true);
    try {
      await base44.entities.Alter.update(alter.id, { is_archived: !alter.is_archived });
      toast.success(alter.is_archived ? "Unarchived!" : "Archived!");
      queryClient.invalidateQueries({ queryKey: ["alters"] });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Permanently delete ${alter?.name}? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await base44.entities.Alter.delete(alter.id);
      toast.success("Alter deleted.");
      queryClient.invalidateQueries({ queryKey: ["alters"] });
    } catch (e) {
      toast.error(e.message || "Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const hasColor = form.color && form.color.length > 3;
  const bgColor = hasColor ? form.color : null;
  const textOnColor = hasColor ? getContrastColor(form.color) : null;

  return (
    <div className="space-y-6">
      {/* Color preview strip */}
      {form.color && (
        <div className="h-2 rounded-full w-full" style={{ backgroundColor: form.color }} />
      )}

      {/* Avatar */}
      <div className="flex justify-center">
        <div
          className="w-32 h-32 rounded-2xl border-4 border-border overflow-hidden shadow-xl"
          style={{ backgroundColor: bgColor || "hsl(var(--muted))" }}
        >
          {form.avatar_url ? (
            <img src={form.avatar_url} alt={form.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center" style={{ color: textOnColor || "hsl(var(--muted-foreground))" }}>
              <User className="w-14 h-14" />
            </div>
          )}
        </div>
      </div>

      {/* Editable Fields */}
      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground font-medium">Name *</label>
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Alter name" />
        </div>

        <div className="space-y-2">
          <label className="text-xs text-muted-foreground font-medium">Alias</label>
          <Input value={form.alias} onChange={(e) => set("alias", e.target.value)} placeholder="Short nickname (for mentions)" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground font-medium">Pronouns</label>
            <Input value={form.pronouns} onChange={(e) => set("pronouns", e.target.value)} placeholder="they/them" />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground font-medium">Role</label>
            <Input value={form.role} onChange={(e) => set("role", e.target.value)} placeholder="Protector, host..." />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs text-muted-foreground font-medium">Color</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={form.color || "#8b5cf6"}
              onChange={(e) => set("color", e.target.value)}
              className="w-10 h-10 rounded-lg border border-border cursor-pointer bg-transparent"
            />
            <Input
              value={form.color}
              onChange={(e) => set("color", e.target.value)}
              placeholder="#8b5cf6"
              className="font-mono text-sm"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs text-muted-foreground font-medium">Avatar URL</label>
          <Input value={form.avatar_url} onChange={(e) => set("avatar_url", e.target.value)} placeholder="https://..." />
          {form.avatar_url && (
            <img src={form.avatar_url} alt="preview" className="w-16 h-16 rounded-xl object-cover border border-border" />
          )}
        </div>

        <div className="space-y-2">
          <label className="text-xs text-muted-foreground font-medium">Description / Bio</label>
          <Textarea
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Write a description..."
            className="min-h-[100px] resize-none"
          />
        </div>
      </div>

      {/* Groups */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-primary flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> Groups
          </label>
          <button
            type="button"
            onClick={() => setShowGroupPicker(true)}
            className="text-xs text-primary hover:text-primary/80 font-medium"
          >
            Edit groups →
          </button>
        </div>
        {alter.groups && alter.groups.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {alter.groups.map((g) => (
              <span
                key={g.id}
                className="px-2 py-0.5 rounded-full text-xs font-medium border"
                style={{
                  backgroundColor: g.color ? `${g.color}18` : "hsl(var(--muted))",
                  borderColor: g.color ? `${g.color}40` : "hsl(var(--border))",
                  color: g.color || "hsl(var(--foreground))",
                }}
              >
                {g.name}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Not in any groups</p>
        )}
      </div>

      {/* Tags */}
      {alter.tags && alter.tags.length > 0 && (
        <div>
          <p className="text-xs font-medium text-primary flex items-center gap-1.5 mb-3">
            <Tag className="w-3.5 h-3.5" /> Tags
          </p>
          <div className="flex flex-wrap gap-2">
            {alter.tags.map((tag) => (
              <span key={tag} className="px-3 py-1 rounded-full text-xs bg-muted/50 text-muted-foreground border border-border/40">
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col gap-2 pt-2">
        <Button onClick={handleSave} disabled={saving} className="w-full bg-primary hover:bg-primary/90">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Save Changes
        </Button>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleArchive}
            disabled={saving}
            className="flex-1"
          >
            {alter?.is_archived ? (
              <><ArchiveRestore className="w-4 h-4 mr-2" /> Unarchive</>
            ) : (
              <><Archive className="w-4 h-4 mr-2" /> Archive</>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={handleDelete}
            disabled={deleting}
            className="flex-1 text-destructive hover:text-destructive border-destructive/30"
          >
            {deleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
            Delete
          </Button>
        </div>
      </div>

      <GroupPickerModal
        alter={alter}
        open={showGroupPicker}
        onClose={() => setShowGroupPicker(false)}
      />
    </div>
  );
}