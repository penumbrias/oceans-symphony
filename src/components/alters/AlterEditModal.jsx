import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save, Trash2, Archive, ArchiveRestore, Users, Upload } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import GroupPickerModal from "@/components/groups/GroupPickerModal";
import { useTerms } from "@/lib/useTerms";

export default function AlterEditModal({ alter, open, onClose, mode = "edit" }) {
  const queryClient = useQueryClient();
  const t = useTerms();
  const isNew = mode === "create";

  const [form, setForm] = useState({
    name: "", alias: "", pronouns: "", role: "",
    description: "", color: "", avatar_url: "",
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (alter && !isNew) {
      setForm({
        name: alter.name || "", alias: alter.alias || "",
        pronouns: alter.pronouns || "", role: alter.role || "",
        description: alter.description || "", color: alter.color || "",
        avatar_url: alter.avatar_url || "",
      });
    } else {
      setForm({ name: "", alias: "", pronouns: "", role: "", description: "", color: "", avatar_url: "" });
    }
  }, [alter, open, isNew]);

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setForm(f => ({ ...f, avatar_url: file_url }));
      toast.success("Avatar uploaded!");
    } catch {
      toast.error("Failed to upload avatar");
    } finally {
      setUploadingAvatar(false);
      e.target.value = "";
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      if (isNew) {
        await base44.entities.Alter.create({ ...form, is_archived: false });
        toast.success(`${t.Alter} created!`);
      } else {
        await base44.entities.Alter.update(alter.id, form);
        toast.success("Saved!");
      }
      queryClient.invalidateQueries({ queryKey: ["alters"] });
      queryClient.invalidateQueries({ queryKey: ["alter", alter?.id] });
      onClose();
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
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Permanently delete ${alter?.name}? This cannot be undone. All data linked to this ${t.alter} will be removed.`)) return;
    setDeleting(true);
    try {
      await base44.entities.Alter.delete(alter.id);
      toast.success(`${t.Alter} deleted.`);
      queryClient.invalidateQueries({ queryKey: ["alters"] });
      onClose();
    } catch (e) {
      toast.error(e.message || "Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? `Add New ${t.Alter}` : `Edit ${alter?.name || t.Alter}`}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {form.color && (
            <div className="h-2 rounded-full w-full" style={{ backgroundColor: form.color }} />
          )}

          <div className="space-y-2">
            <Label>Name *</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder={`${t.Alter} name`} />
          </div>

          <div className="space-y-2">
            <Label>Alias</Label>
            <Input value={form.alias} onChange={(e) => set("alias", e.target.value)} placeholder="Short nickname (for mentions)" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Pronouns</Label>
              <Input value={form.pronouns} onChange={(e) => set("pronouns", e.target.value)} placeholder="they/them" />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Input value={form.role} onChange={(e) => set("role", e.target.value)} placeholder="Protector, host..." />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex items-center gap-3">
              <input type="color" value={form.color || "#8b5cf6"}
                onChange={(e) => set("color", e.target.value)}
                className="w-10 h-10 rounded-lg border border-border cursor-pointer bg-transparent" />
              <Input value={form.color} onChange={(e) => set("color", e.target.value)}
                placeholder="#8b5cf6" className="font-mono text-sm" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Avatar</Label>
            <div className="flex gap-2">
              <Input value={form.avatar_url} onChange={(e) => set("avatar_url", e.target.value)} placeholder="https://..." />
              <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploadingAvatar}>
                {uploadingAvatar ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              </Button>
              <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleAvatarUpload} />
            </div>
            {form.avatar_url && (
              <img src={form.avatar_url} alt="preview" className="w-16 h-16 rounded-xl object-cover border border-border" />
            )}
          </div>

          <div className="space-y-2">
            <Label>Description / Bio</Label>
            <Textarea value={form.description} onChange={(e) => set("description", e.target.value)}
              placeholder="Write a description..." className="min-h-[100px] resize-none" />
          </div>

          {!isNew && alter && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" /> Groups
                </Label>
                <button type="button" onClick={() => setShowGroupPicker(true)}
                  className="text-xs text-primary hover:text-primary/80 font-medium">
                  Edit groups →
                </button>
              </div>
              {alter.groups && alter.groups.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {alter.groups.map((g) => (
                    <span key={g.id} className="px-2 py-0.5 rounded-full text-xs font-medium border"
                      style={{ backgroundColor: g.color ? `${g.color}18` : "hsl(var(--muted))", borderColor: g.color ? `${g.color}40` : "hsl(var(--border))", color: g.color || "hsl(var(--foreground))" }}>
                      {g.name}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Not in any groups</p>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2 pt-2">
            <Button onClick={handleSave} disabled={saving} className="w-full bg-primary hover:bg-primary/90">
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              {isNew ? `Create ${t.Alter}` : "Save Changes"}
            </Button>
            {!isNew && (
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleArchive} disabled={saving} className="flex-1">
                  {alter?.is_archived
                    ? <><ArchiveRestore className="w-4 h-4 mr-2" /> Unarchive</>
                    : <><Archive className="w-4 h-4 mr-2" /> Archive</>}
                </Button>
                <Button variant="outline" onClick={handleDelete} disabled={deleting}
                  className="flex-1 text-destructive hover:text-destructive border-destructive/30">
                  {deleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                  Delete
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>

      {!isNew && alter && (
        <GroupPickerModal alter={alter} open={showGroupPicker} onClose={() => setShowGroupPicker(false)} />
      )}
    </Dialog>
  );
}